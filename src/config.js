// src/config.js
const path = require("path");
const dotenv = require("dotenv");

// ✅ Force-load src/.env
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL;
const CODE_MODEL = process.env.CODE_MODEL;

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_NAME = process.env.APP_NAME || "Accessibility AI Auditor";

module.exports = { PORT, OPENROUTER_API_KEY, ANALYSIS_MODEL, CODE_MODEL, APP_URL, APP_NAME };
