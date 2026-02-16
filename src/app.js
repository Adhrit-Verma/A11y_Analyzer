// src/app.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { pool } = require("./db");

const adminRouter = require("./routes/api/admin");
const healthRouter = require("./routes/api/health");
const analyzeRouter = require("./routes/api/analyze");
const fixRouter = require("./routes/api/fix");
const previewRouter = require("./routes/preview");


const authRouter = require("./routes/api/auth");
const analysesRouter = require("./routes/api/analyses");


function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" })); // ✅ MUST BE BEFORE ROUTES


  // ✅ Session must be mounted AFTER app exists, and BEFORE routes that use req.session

  const PROJECT_ROOT = path.join(__dirname, ".."); // src -> project root
  const SESSIONS_DIR = path.join(PROJECT_ROOT, "data", "sessions");
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session", // default is "session"
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // keep false unless you terminate SSL + set proxy properly
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );


  // ✅ Auth + History routes must come AFTER session middleware
  app.use("/api/auth", authRouter);
  app.use("/api/analyses", analysesRouter);

  // ✅ Admin routes (session required, admin only)
  app.use("/api/admin", adminRouter);


  // Serve frontend (same behavior)
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // API subserver
  app.use("/api", healthRouter);
  app.use("/api", analyzeRouter);
  app.use("/api", fixRouter);

  // Preview subserver
  app.use("/", previewRouter);

  return app;
}

module.exports = { createApp };
