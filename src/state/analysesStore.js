// src/state/analysesStore.js (Postgres version)
const { query } = require("../db");

function makeTitleFromAnalysis(analysis) {
  const t = analysis?.target;

  if (t?.type === "file") {
    return t.value || t.title || "Uploaded file audit";
  }

  const u = analysis?.url || t?.value || "";
  if (!u) return "Accessibility audit";

  try {
    const parsed = new URL(u);
    return parsed.hostname || u;
  } catch {
    return String(u);
  }
}

async function saveAnalysisForUser(userId, analysis) {
  const analysisId = analysis.analysisId;

  const url = analysis?.target?.value || "";
  const title = analysis?.title || analysis?.overviewTitle || makeTitleFromAnalysis(analysis);
  const score = analysis?.score ?? null;

  const target = analysis?.target || null;
  const overview = analysis?.overview || null;
  const tags = Array.isArray(analysis?.tags) ? analysis.tags : [];
  const severitySummary = analysis?.severitySummary || null;
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const html = analysis?.html || null;
  const engineFindings = analysis?.engineFindings || null;

  // Keep createdAt consistent with old behavior:
  const createdAtIso = new Date().toISOString();

  await query(
    `insert into analyses
      (analysis_id, user_id, title, url, score, created_at, target, overview, tags, severity_summary, issues, html, engine_findings)
     values
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (analysis_id) do update set
      title = excluded.title,
      url = excluded.url,
      score = excluded.score,
      target = excluded.target,
      overview = excluded.overview,
      tags = excluded.tags,
      severity_summary = excluded.severity_summary,
      issues = excluded.issues,
      html = excluded.html,
      engine_findings = excluded.engine_findings`,
    [
      analysisId,
      userId,
      title,
      url,
      score,
      createdAtIso,
      target ? JSON.stringify(target) : null,
      overview,
      JSON.stringify(tags),
      severitySummary ? JSON.stringify(severitySummary) : null,
      JSON.stringify(issues),
      html,
      engineFindings ? JSON.stringify(engineFindings) : null,
    ]
  );

  // Return same meta shape your frontend expects from /recent
  return {
    analysisId,
    title,
    url,
    createdAt: createdAtIso,
    score,
  };
}

async function getRecentAnalyses(userId, limit = 30) {
  const r = await query(
    `select analysis_id as "analysisId",
            title,
            url,
            score,
            created_at as "createdAt"
     from analyses
     where user_id = $1
     order by created_at desc
     limit $2`,
    [userId, Number(limit)]
  );

  // normalize to ISO string (frontend uses new Date(createdAt))
  return r.rows.map((x) => ({
    ...x,
    createdAt: x.createdAt ? new Date(x.createdAt).toISOString() : null,
  }));
}

async function loadAnalysis(userId, analysisId) {
  const r = await query(
    `select * from analyses where user_id = $1 and analysis_id = $2 limit 1`,
    [userId, analysisId]
  );
  if (!r.rowCount) throw new Error("Not found");

  const row = r.rows[0];

  // Rebuild the “analysis object” like your JSON file stored
  return {
    analysisId: row.analysis_id,
    score: row.score,
    overview: row.overview,
    tags: row.tags || [],
    severitySummary: row.severity_summary || { critical: 0, high: 0, moderate: 0, low: 0 },
    issues: row.issues || [],
    target: row.target || null,
    html: row.html || "",
    engineFindings: row.engine_findings || null,
    title: row.title || null,
    url: row.url || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function deleteAnalysisForUser(userId, analysisId) {
  await query(`delete from analyses where user_id = $1 and analysis_id = $2`, [userId, analysisId]);
  return { deleted: true, analysisId };
}

async function deleteAllAnalysesForUser(userId) {
  await query(`delete from analyses where user_id = $1`, [userId]);
  return { deleted: true, all: true };
}

module.exports = {
  saveAnalysisForUser,
  getRecentAnalyses,
  loadAnalysis,
  deleteAnalysisForUser,
  deleteAllAnalysesForUser,
};
