// src/services/openrouter.js
const { OPENROUTER_API_KEY, APP_URL, APP_NAME } = require("../config");

async function callOnce({ model, system, user, jsonMode }) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const headers = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": APP_URL,
    "X-Title": APP_NAME,
  };

  const body = {
    model,
    messages: [
      { role: "system", content: system || "" },
      { role: "user", content: user || "" },
    ],
  };

  // Some providers (especially :free) don't support this → OpenRouter may return 404 "No endpoints found"
  if (jsonMode) body.response_format = { type: "json_object" };

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await resp.text().catch(() => "");

  if (!resp.ok) {
    const err = new Error(`OpenRouter error ${resp.status}: ${txt}`);
    err.status = resp.status;
    err.bodyText = txt;
    throw err;
  }

  return JSON.parse(txt);
}

/**
 * Helper: call OpenRouter Chat Completions
 */
async function callOpenRouter({ model, system, user, jsonMode }) {
  try {
    return await callOnce({ model, system, user, jsonMode });
  } catch (e) {
    const msg = String(e.bodyText || e.message || "");

    // ✅ Fallback 1: if JSON mode causes "No endpoints found", retry WITHOUT response_format
    if (jsonMode && e.status === 404 && msg.includes("No endpoints found")) {
      return await callOnce({ model, system, user, jsonMode: false });
    }

    // ✅ Fallback 2 (optional): if using :free and it fails, retry without :free (requires credits)
    if (e.status === 404 && msg.includes("No endpoints found") && model.includes(":free")) {
      const paidModel = model.replace(":free", "");
      return await callOnce({ model: paidModel, system, user, jsonMode: false });
    }

    throw e;
  }
}

module.exports = { callOpenRouter };
