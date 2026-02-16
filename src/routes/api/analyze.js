// src/routes/api/analyze.js
const multer = require("multer");
const express = require("express");
const crypto = require("crypto");
const { saveAnalysisForUser } = require("../../state/analysesStore");
const {
  runStaticTools,
  fetchHtml,
  detectSecurityChallenge,
  runAxeOnHtml,
} = require("../../services/staticTools");
const { retrieveTopChunks } = require("../../services/rag");
const { runAnalysisLLM } = require("../../services/llm");


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 2 }, // 2MB
});
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

router.post("/analyze", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { mode, url } = req.body;

    if (!mode || mode === "url") {
      if (!url) return res.status(400).json({ error: "Missing 'url' field" });

      console.log("🔍 Analyzing URL:", url);

      const engineFindings = await runStaticTools(url);

      let html = engineFindings.htmlSnapshot;
      if (!html) html = await fetchHtml(url);

      const securityProvider = detectSecurityChallenge(html);

      if (securityProvider) {
        const analysisId =
          crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

        const blankSeverity = { critical: 0, high: 0, moderate: 0, low: 0 };

        const analysis = {
          analysisId,
          score: null,
          overview:
            "This page appears to be a security or bot-protection screen (" +
            securityProvider +
            "). Automated tools could not access the actual page content. " +
            "The findings below apply only to this intermediate page, not the real site.",
          tags: ["security", "bot-protection", securityProvider],
          severitySummary: blankSeverity,
          issues: [],
          target: {
            type: "url",
            value: url,
            title: url,
            timestamp: new Date().toISOString(),
          },
          html,
          engineFindings,
        };
        await saveAnalysisForUser(req.session.user.id, analysis);
        return res.json(analysis);
      }


      // src/routes/api/analyze.js

      function backfillInstancesFromAxe(analysisFromLLM, engineFindings) {
        const axeViolations = engineFindings?.axe?.violations || [];
        const byRuleId = new Map(axeViolations.map(v => [v.id, v]));

        const issues = Array.isArray(analysisFromLLM.issues) ? analysisFromLLM.issues : [];
        for (const issue of issues) {
          const hasInstances = Array.isArray(issue.instances) && issue.instances.length > 0;
          if (hasInstances) continue;

          const v = byRuleId.get(issue.ruleId);
          if (!v || !Array.isArray(v.nodes)) continue;

          issue.instances = v.nodes.slice(0, 8).map((n) => ({
            selector: n.selector || (Array.isArray(n.target) ? n.target[0] : "") || "",
            xpath: n.xpath || "",
            snippet: n.html || "",
            line: typeof n.line === "number" ? n.line : null,
          }));
        }

        return analysisFromLLM;
      }


      let analysisFromLLM = await runAnalysisLLM({ url, html, engineFindings });
      analysisFromLLM = backfillInstancesFromAxe(analysisFromLLM, engineFindings);


      let numericScore = analysisFromLLM.score ?? null;
      const lhScore = engineFindings?.lighthouse?.score;
      if (typeof lhScore === "number") numericScore = Math.round(lhScore * 100);

      const analysisId =
        analysisFromLLM.analysisId ||
        (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

      const analysis = {
        ...analysisFromLLM,
        analysisId,
        score: numericScore,
        target: analysisFromLLM.target || {
          type: "url",
          value: url,
          title: url,
          timestamp: new Date().toISOString(),
        },
        html,
        engineFindings,
      };

      await saveAnalysisForUser(req.session.user.id, analysis);
      return res.json(analysis);
    }

    // ---------- FILE MODE (NEW) ----------
    if (mode === "file") {
      const f = req.file;
      if (!f) return res.status(400).json({ error: "Missing uploaded file (field name: file)" });

      const filename = f.originalname || "uploaded.html";
      const html = f.buffer.toString("utf8");

      // Run Axe offline
      const engineFindings = await runAxeOnHtml(html);

      // Build “RAG context”
      const ragQuery =
        "accessibility issues WCAG missing alt label aria-label heading order form label button name contrast";
      const retrieved = retrieveTopChunks(engineFindings.htmlSnapshot || html, ragQuery, { topK: 7 });

      // Ask LLM using only retrieved chunks (plus axe raw)
      const analysisFromLLM = await runAnalysisLLM({
        url: `file://${filename}`,
        html: engineFindings.htmlSnapshot || html,        // ✅ full HTML
        engineFindings: {
          axe: engineFindings.axe,
          lighthouse: null,
          rag: retrieved.map(({ id, start, end, score, text }) => ({ id, start, end, score, text })),
        },
      });


      const analysisId =
        analysisFromLLM.analysisId ||
        (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

      const analysis = {
        ...analysisFromLLM,
        analysisId,
        score: analysisFromLLM.score ?? null,
        target: {
          type: "file",
          value: filename,
          title: filename,
          timestamp: new Date().toISOString(),
        },
        html: engineFindings.htmlSnapshot || html, // important: stored for preview + code fix
        engineFindings: {
          ...engineFindings,
          ragChunks: retrieved, // optional: store for debugging
        },
      };

      await saveAnalysisForUser(req.session.user.id, analysis);
      return res.json(analysis);
    }

    return res.status(400).json({ error: "Unknown mode" });
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
