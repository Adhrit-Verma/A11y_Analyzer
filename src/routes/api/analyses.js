const express = require("express");
const {
  getRecentAnalyses,
  loadAnalysis,
  deleteAnalysisForUser,
  deleteAllAnalysesForUser,
} = require("../../state/analysesStore");


const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

router.get("/recent", requireAuth, async (req, res) => {
  const limit = Number(req.query.limit || 30);
  const list = await getRecentAnalyses(req.session.user.id, limit);
  res.json({ items: list });
});

router.get("/:analysisId", requireAuth, async (req, res) => {
  try {
    const analysis = await loadAnalysis(req.session.user.id, req.params.analysisId);
    res.json({ analysis });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

// ✅ Delete a single analysis
router.delete("/:analysisId", requireAuth, async (req, res) => {
  const result = await deleteAnalysisForUser(req.session.user.id, req.params.analysisId);
  res.json(result);
});

// ✅ Delete all history
router.delete("/", requireAuth, async (req, res) => {
  const result = await deleteAllAnalysesForUser(req.session.user.id);
  res.json(result);
});

module.exports = router;
