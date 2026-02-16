const express = require("express");
const os = require("os");
const fs = require("fs");
const path = require("path");

const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} = require("../../state/usersStore");

const router = express.Router();

function requireAdmin(req, res, next) {
  const u = req.session?.user;
  if (!u) return res.status(401).json({ error: "Unauthorized" });

  // ✅ must be flagged admin AND must be in admin-panel session mode
  if (!u.is_admin) return res.status(403).json({ error: "Forbidden (admin only)" });
  if (!req.session?.admin_panel) return res.status(403).json({ error: "Forbidden (admin login required)" });

  next();
}


// ----- Users CRUD -----
router.get("/users", requireAdmin, async (req, res) => {
  const users = await listUsers();
  res.json({ users });
});

router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { name, email, password, is_admin } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing fields: name, email, password" });
    }
    const user = await createUser({ name, email, password, is_admin: !!is_admin });
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message || "Create failed" });
  }
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const patch = req.body || {};
    const user = await updateUser(id, patch);
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message || "Update failed" });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await deleteUser(id, { forbidUserId: req.session.user.id });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || "Delete failed" });
  }
});

// ----- Stats -----
router.get("/stats", requireAdmin, async (req, res) => {
  // Active users: count session files (best effort)
  let activeSessions = null;
  try {
    const projectRoot = path.join(__dirname, "..", "..", ".."); // src -> root
    const sessionsDir = path.join(projectRoot, "data", "sessions");
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
      activeSessions = files.length;
    }
  } catch {
    activeSessions = null;
  }

  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());

  res.json({
    activeSessions,
    server: {
      uptimeSec,
      node: process.version,
      platform: process.platform,
      cpuCount: os.cpus()?.length || null,
      loadavg: os.loadavg ? os.loadavg() : null,
    },
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
  });
});

module.exports = router;
