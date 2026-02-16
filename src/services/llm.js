// src/services/llm.js
const crypto = require("crypto");
const { ANALYSIS_MODEL, CODE_MODEL } = require("../config");
const { callOpenRouter } = require("./openrouter");
const { computeSeveritySummaryFromAxe } = require("./staticTools");

function safeParseLLMJson(input) {
  // Accept: string OR OpenRouter response object
  let content =
    typeof input === "string"
      ? input
      : input?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("LLM response did not contain message.content text");
  }

  // Remove ```json fences if present
  content = content.trim();
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();

  // First try straightforward parse
  try {
    return JSON.parse(content);
  } catch {
    // Try extracting JSON substring
  }

  const firstBrace = content.indexOf("{");
  const firstBracket = content.indexOf("[");
  if (firstBrace === -1 && firstBracket === -1) {
    throw new Error("No JSON object or array found in LLM response text");
  }

  let startIdx;
  let isArray = false;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIdx = firstBracket;
    isArray = true;
  } else {
    startIdx = firstBrace;
  }

  const endIdx = isArray ? content.lastIndexOf("]") : content.lastIndexOf("}");
  if (endIdx === -1 || endIdx <= startIdx) {
    throw new Error("Could not find matching JSON closing bracket/brace");
  }

  const jsonStr = content.slice(startIdx, endIdx + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse extracted JSON:", jsonStr);
    throw e;
  }
}

async function runAnalysisLLM({ url, html, engineFindings }) {
  const systemPrompt = `
You are an accessibility analysis model.

You receive:
- The page URL
- The full HTML
- Raw findings from tools:
  - axe: WCAG-related violations, selectors, HTML snippets
  - lighthouse: accessibility audits and scores

Your job:
1. Merge and deduplicate findings.
2. Assign severity: "critical", "high", "moderate", or "low".
3. Generate a short overview and a detailed issues list.
4. Preserve useful selectors/snippets from axe where possible.
5. Return ONLY valid JSON with this exact structure (no extra text):

{
  "analysisId": "string (optional)",
  "score": number,
  "overview": "string",
  "tags": ["string", ...],
  "severitySummary": {
    "critical": number,
    "high": number,
    "moderate": number,
    "low": number
  },
  "issues": [
    {
      "id": "string",
      "ruleId": "string",
      "title": "string",
      "description": "string",
      "severity": "critical" | "high" | "moderate" | "low",
      "category": "string",
      "wcag": ["string", ...],
      "quickFix": "string",
      "instances": [
        {
          "selector": "string",
          "xpath": "string",
          "snippet": "string",
          "line": number
        }
      ]
    }
  ]
}
  `.trim();

  const userPayload = {
    url,
    html,
    engineFindings
  };

  const resp = await callOpenRouter({
    model: ANALYSIS_MODEL,
    system: systemPrompt,
    user: JSON.stringify(userPayload),
    jsonMode: true
  });

  let parsed;
  try {
    parsed = safeParseLLMJson(resp); // ✅ can pass resp now
  } catch (err) {
    console.error("Failed to parse analysis JSON:", resp?.choices?.[0]?.message?.content ?? resp);
    throw err;
  }
  return parsed;

}

async function runCodeFixLLM({ analysis, issue, originalHtml }) {
  const systemPrompt = `
You are an expert accessibility code assistant.

You receive:
- The original HTML of the page.
- The analysis of accessibility issues.
- ONE specific issue to fix.

Your job:
- Produce minimal code changes that fix ONLY this issue.
- Never rewrite the entire file.
- Return ONLY valid JSON with this exact structure (no extra text):

[
  {
    "file": "string (e.g. index.html)",
    "issueTitle": "string",
    "severity": "critical" | "high" | "moderate" | "low",
    "explanation": "short explanation of what changed and why",
    "before": "HTML snippet before",
    "after": "HTML snippet after"
  }
]
  `.trim();

  const userPayload = {
    issue,
    originalHtml,
    context: {
      target: analysis.target,
      score: analysis.score
    }
  };

  const content = await callOpenRouter({
    model: CODE_MODEL,
    system: systemPrompt,
    user: JSON.stringify(userPayload),
    jsonMode: false,
  });

  let parsed;
  try {
    parsed = safeParseLLMJson(content);
  } catch (err) {
    console.error("Failed to parse code-fix JSON:", content);
    throw err;
  }
  return parsed;
}

module.exports = {
  safeParseLLMJson,
  runAnalysisLLM,
  runCodeFixLLM,
};
