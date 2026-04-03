const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
const ADMIN_EMAIL = 'yamekel0@gmail.com';

// ── Roles & permissions ───────────────────────────────────────────────────────
// Roles hierarchy (higher index = more power)
const ROLE_HIERARCHY = ['user', 'vip', 'moderator', 'admin', 'owner'];

const ROLE_PERMISSIONS = {
  user:      [],
  vip:       ['post_images', 'post_videos', 'post_polls', 'custom_accent'],
  moderator: ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users'],
  admin:     ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users', 'manage_roles', 'broadcast'],
  owner:     ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users', 'manage_roles', 'broadcast', 'delete_users', 'owner'],
};

const ROLE_LABELS = {
  user:      'Пользователь',
  vip:       'VIP',
  moderator: 'Модератор',
  admin:     'Администратор',
  owner:     'Владелец',
};

const ROLE_COLORS = {
  user:      '#aaa',
  vip:       '#ffd43b',
  moderator: '#74c0fc',
  admin:     '#da77f2',
  owner:     '#ff6b6b',
};

function isOwner(req) {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  return u?.email === ADMIN_EMAIL;
}

function canManageRoles(req) {
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  const role = u?.role || 'user';
  return ROLE_PERMISSIONS[role]?.includes('manage_roles') || false;
}

function roleRank(role) {
  return ROLE_HIERARCHY.indexOf(role || 'user');
}

// ── GET /api/roles/list — get all roles info ──────────────────────────────────
router.get('/list', auth, (req, res) => {
  res.json(
    ROLE_HIERARCHY.map(r => ({
      id: r,
      label: ROLE_LABELS[r],
      color: ROLE_COLORS[r],
      permissions: ROLE_PERMISSIONS[r],
    }))
  );
});

// ── GET /api/roles/users — get all users with roles ───────────────────────────
router.get('/users', auth, (req, res) => {
  if (!canManageRoles(req) && !isOwner(req))
    return res.status(403).json({ error: 'Нет доступа' });

  const users = db.prepare(`
    SELECT id, username, display_name, avatar, accent_color, email,
           role, is_banned, created_at
    FROM users ORDER BY created_at DESC
  `).all();

  res.json(users.map(u => ({
    ...u,
    role: u.role || 'user',
    roleLabel: ROLE_LABELS[u.role || 'user'],
    roleColor: ROLE_COLORS[u.role || 'user'],
  })));
});

// ── POST /api/roles/assign — assign role to user ──────────────────────────────
router.post('/assign', auth, (req, res) => {
  if (!canManageRoles(req) && !isOwner(req))
    return res.status(403).json({ error: 'Нет доступа' });

  const { userId, role } = req.body;
  if (!ROLE_HIERARCHY.includes(role))
    return res.status(400).json({ error: 'Неверная роль' });

  // Can't assign role higher than your own
  const myRole = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id)?.role || 'user';
  const myRank = isOwner(req) ? 999 : roleRank(myRole);
  if (roleRank(role) >= myRank && !isOwner(req))
    return res.status(403).json({ error: 'Нельзя назначить роль выше своей' });

  // Can't change owner's role
  const target = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL && !isOwner(req))
    return res.status(403).json({ error: 'Нельзя изменить роль владельца' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  res.json({ ok: true, role, roleLabel: ROLE_LABELS[role], roleColor: ROLE_COLORS[role] });
});

// ── GET /api/roles/me — get my role and permissions ───────────────────────────
router.get('/me', auth, (req, res) => {
  const u = db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
  const role = (u?.email === ADMIN_EMAIL) ? 'owner' : (u?.role || 'user');
  res.json({
    role,
    roleLabel: ROLE_LABELS[role],
    roleColor: ROLE_COLORS[role],
    permissions: ROLE_PERMISSIONS[role],
  });
});

module.exports = router;
module.exports.ROLE_LABELS = ROLE_LABELS;
module.exports.ROLE_COLORS = ROLE_COLORS;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
