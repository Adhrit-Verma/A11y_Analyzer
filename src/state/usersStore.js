// src/state/usersStore.js (Postgres version)
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { query } = require("../db");

function genTempPassword() {
  return "TMP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function initialsFromName(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    initials: row.initials,
    is_admin: !!row.is_admin,
    has_admin_password: !!row.admin_password_hash,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

async function createUser({ name, email, password, is_admin = false, admin_password = null }) {
  // enforce unique email like your JSON version
  const existing = await query(`select id from users where email = $1`, [email]);
  if (existing.rowCount) throw new Error("Email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const adminHash = admin_password ? await bcrypt.hash(admin_password, 10) : null;

  const id = "u_" + Date.now();
  const initials = initialsFromName(name);

  const ins = await query(
    `insert into users (id, name, email, initials, password_hash, admin_password_hash, is_admin, admin_reset)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [id, name, email, initials, passwordHash, adminHash, !!is_admin, null]
  );

  return publicUser(ins.rows[0]);
}

async function verifyUser({ email, password }) {
  const r = await query(`select * from users where email = $1`, [email]);
  if (!r.rowCount) return null;

  const u = r.rows[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;

  return publicUser(u);
}

async function verifyAdminUser({ adminId, password }) {
  const r = await query(`select * from users where id = $1 or email = $1 limit 1`, [adminId]);
  if (!r.rowCount) return null;

  const u = r.rows[0];
  if (!u.is_admin) return null;
  if (!u.admin_password_hash) return null;

  const ok = await bcrypt.compare(password, u.admin_password_hash);
  if (!ok) return null;

  return publicUser(u);
}

async function listUsers() {
  const r = await query(`select * from users order by created_at desc`);
  return r.rows.map(publicUser);
}

async function getUserById(id) {
  const r = await query(`select * from users where id = $1`, [id]);
  return r.rowCount ? publicUser(r.rows[0]) : null;
}

async function updateUser(id, patch) {
  // Load first (to replicate old behavior carefully)
  const r = await query(`select * from users where id = $1`, [id]);
  if (!r.rowCount) throw new Error("User not found");
  const current = r.rows[0];

  // email uniqueness if changing
  if (patch.email && patch.email !== current.email) {
    const ex = await query(`select id from users where email = $1`, [patch.email]);
    if (ex.rowCount) throw new Error("Email already exists");
  }

  let name = typeof patch.name === "string" ? patch.name : current.name;
  let email = typeof patch.email === "string" ? patch.email : current.email;
  let initials = typeof patch.name === "string" ? initialsFromName(patch.name) : current.initials;

  let isAdmin = typeof patch.is_admin === "boolean" ? patch.is_admin : current.is_admin;

  // password hashes
  let passwordHash = current.password_hash;
  if (typeof patch.password === "string" && patch.password.length > 0) {
    passwordHash = await bcrypt.hash(patch.password, 10);
  }

  let adminHash = current.admin_password_hash;

  // admin_password update
  if (typeof patch.admin_password === "string") {
    if (patch.admin_password.length > 0) {
      adminHash = await bcrypt.hash(patch.admin_password, 10);
    }
  }

  // if admin turned off -> clear admin hash
  if (typeof patch.is_admin === "boolean" && patch.is_admin === false) {
    adminHash = null;
  }

  const upd = await query(
    `update users
     set name=$2, email=$3, initials=$4, password_hash=$5, admin_password_hash=$6, is_admin=$7
     where id=$1
     returning *`,
    [id, name, email, initials, passwordHash, adminHash, !!isAdmin]
  );

  return publicUser(upd.rows[0]);
}

async function deleteUser(id, { forbidUserId } = {}) {
  if (forbidUserId && id === forbidUserId) {
    throw new Error("You cannot delete your own account from the admin panel");
  }

  const r = await query(`delete from users where id = $1 returning id`, [id]);
  if (!r.rowCount) throw new Error("User not found");

  return { deleted: true, id };
}

async function createAdminTempPassword({ adminId }) {
  const r = await query(`select * from users where id = $1 or email = $1 limit 1`, [adminId]);
  if (!r.rowCount) return null;

  const u = r.rows[0];
  if (!u.is_admin) return null;

  const temp = genTempPassword();
  const tempHash = await bcrypt.hash(temp, 10);
  const expiresAt = Date.now() + 10 * 60 * 1000;

  const adminReset = {
    tempHash,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  };

  await query(`update users set admin_reset = $2 where id = $1`, [u.id, adminReset]);
  return { user: publicUser(u), tempPassword: temp, expiresAt };
}

async function resetAdminPassword({ adminId, oldOrTempPassword, newAdminPassword }) {
  const r = await query(`select * from users where id = $1 or email = $1 limit 1`, [adminId]);
  if (!r.rowCount) return null;

  const u = r.rows[0];
  if (!u.is_admin) return null;

  let ok = false;

  // check existing admin password
  if (u.admin_password_hash) {
    ok = await bcrypt.compare(oldOrTempPassword, u.admin_password_hash);
  }

  // check temp reset
  if (!ok && u.admin_reset && !u.admin_reset.used) {
    const notExpired = Date.now() <= Number(u.admin_reset.expiresAt || 0);
    if (notExpired) {
      ok = await bcrypt.compare(oldOrTempPassword, u.admin_reset.tempHash);
    }
  }

  if (!ok) return false;

  const newHash = await bcrypt.hash(newAdminPassword, 10);

  const upd = await query(
    `update users set admin_password_hash = $2, admin_reset = null where id = $1 returning *`,
    [u.id, newHash]
  );

  return publicUser(upd.rows[0]);
}

module.exports = {
  createUser,
  verifyUser,
  verifyAdminUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  createAdminTempPassword,
  resetAdminPassword,
};
