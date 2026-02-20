const express = require("express");
const {
  createUser,
  verifyUser,
  verifyAdminUser,
  createAdminTempPassword,
  resetAdminPassword
} = require("../../state/usersStore");


const router = express.Router();

router.post("/register", async (req, res) => {
  try {

    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Missing fields" });

    // normal users only
    const user = await createUser({ name, email, password, is_admin: false });
    req.session.user = user;
    req.session.admin_panel = false;
    res.json({ user });

  } catch (e) {
    res.status(400).json({ error: e.message || "Register failed" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const user = await verifyUser({ email, password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  req.session.user = user;
  req.session.admin_panel = false;

  res.json({ user });
});

// ✅ Admin-specific login
router.post("/admin/login", async (req, res) => {
  const { adminId, password } = req.body;
  if (!adminId || !password) return res.status(400).json({ error: "Missing fields" });

  const user = await verifyAdminUser({ adminId, password });
  if (!user) return res.status(401).json({ error: "Invalid admin credentials" });

  req.session.user = user;
  req.session.admin_panel = true;

  res.json({ user });
});

// ✅ Admin forgot password (dev flow): prints temp password in server console
router.post("/admin/forgot", async (req, res) => {
  const { adminId } = req.body;
  if (!adminId) return res.status(400).json({ error: "Missing adminId" });

  const result = await createAdminTempPassword({ adminId });
  if (!result) return res.status(404).json({ error: "Admin user not found" });

  // DEV ONLY: show temp password in server console
  console.log(
    `[ADMIN TEMP PASSWORD] for ${result.user.email} (${result.user.id}) => ${result.tempPassword} (expires ${new Date(result.expiresAt).toISOString()})`
  );

  // Don't return temp password to client
  res.json({ ok: true, expiresAt: result.expiresAt });
});

router.post("/admin/reset", async (req, res) => {
  const { adminId, oldOrTempPassword, newAdminPassword } = req.body;

  if (!adminId || !oldOrTempPassword || !newAdminPassword) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (String(newAdminPassword).length < 6) {
    return res.status(400).json({ error: "New admin password must be at least 6 characters" });
  }
  if (oldOrTempPassword === newAdminPassword) {
    return res.status(400).json({ error: "New admin password must be different from old/temp password" });
  }

  const user = await resetAdminPassword({ adminId, oldOrTempPassword, newAdminPassword });
  if (!user) return res.status(404).json({ error: "Admin user not found" });
  if (user === false) return res.status(401).json({ error: "Invalid old/temp password or expired temp password" });

  // Consider them "admin panel logged in" after reset
  req.session.user = user;
  req.session.admin_panel = true;

  res.json({ ok: true, user });
});


router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  res.json({
    user: req.session?.user || null,
    admin_panel: !!req.session?.admin_panel,
  });
});


module.exports = router;
