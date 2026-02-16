// src/state/latestAnalysisStore.js
const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const LATEST_FILE = path.join(DATA_DIR, "latest-analysis.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// Atomic write: write temp file then rename -> avoids corrupted JSON on crash
async function saveLatestAnalysis(analysisObject) {
  await ensureDir();
  const tmp = LATEST_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(analysisObject, null, 2), "utf8");
  await fs.rename(tmp, LATEST_FILE);
}

async function loadLatestAnalysis() {
  try {
    const txt = await fs.readFile(LATEST_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

module.exports = {
  saveLatestAnalysis,
  loadLatestAnalysis,
  LATEST_FILE,
};
