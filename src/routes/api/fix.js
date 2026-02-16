// src/routes/api/fix.js
const express = require("express");
const { loadAnalysis } = require("../../state/analysesStore");
const { runCodeFixLLM } = require("../../services/llm");

const router = express.Router();
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}


router.post("/fix", requireAuth, async (req, res) => {
  try {
    const { analysisId, issueId } = req.body;

    if (!analysisId || !issueId) {
      return res.status(400).json({ error: "Missing analysisId or issueId" });
    }

    let analysis;
    try {
      analysis = await loadAnalysis(req.session.user.id, analysisId);
    } catch {
      return res.status(404).json({ error: "Analysis not found" });
    }


    const issue = (analysis.issues || []).find((i) => i.id === issueId);
    if (!issue) return res.status(404).json({ error: "Issue not found" });

    const originalHtml = analysis.html || "";

    const fixes = await runCodeFixLLM({
      analysis,
      issue,
      originalHtml,
    });

    return res.json({ analysisId, issueId, fixes });
  } catch (err) {
    console.error("Fix error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/fix/apply", requireAuth, async (req, res) => {
  try {
    const { analysisId, fixes } = req.body;
    if (!analysisId || !Array.isArray(fixes) || fixes.length === 0) {
      return res.status(400).json({ error: "Missing analysisId or fixes[]" });
    }

    let analysis;
    try {
      analysis = await loadAnalysis(req.session.user.id, analysisId);
    } catch {
      return res.status(404).json({ error: "Analysis not found" });
    }

    let html = analysis.html || "";
    const applied = [];

    for (const fx of fixes) {
      const before = String(fx.before || "");
      const after = String(fx.after || "");

      if (!before || !after) continue;

      const idx = html.indexOf(before);
      if (idx === -1) {
        applied.push({ ok: false, reason: "before snippet not found", issueTitle: fx.issueTitle || "" });
        continue;
      }

      html = html.slice(0, idx) + after + html.slice(idx + before.length);
      applied.push({ ok: true, issueTitle: fx.issueTitle || "" });
    }

    // Return patched HTML (don’t overwrite original unless you want versioning)
    return res.json({
      analysisId,
      applied,
      patchedHtml: html,
    });
  } catch (err) {
    console.error("Fix apply error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



module.exports = router;
