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
  vip:       ['animated_name', 'profile_music', 'custom_accent'],
  moderator: ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users'],
  admin:     ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users', 'manage_roles', 'broadcast'],
  owner:     ['post_images', 'post_videos', 'post_polls', 'custom_accent', 'delete_posts', 'ban_users', 'manage_roles', 'broadcast', 'delete_users', 'owner', 'animated_name', 'profile_music'],
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

// Get all roles for a user
function getUserRoles(userId) {
  const roles = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(userId);
  return roles.map(r => r.role);
}

// Get all permissions for a user (combined from all roles)
function getUserPermissions(userId) {
  const roles = getUserRoles(userId);
  const perms = new Set();
  roles.forEach(role => {
    (ROLE_PERMISSIONS[role] || []).forEach(p => perms.add(p));
  });
  return Array.from(perms);
}

// Check if user has specific permission
function hasPermission(userId, permission) {
  const perms = getUserPermissions(userId);
  return perms.includes(permission);
}

function canManageRoles(req) {
  return hasPermission(req.user.id, 'manage_roles') || isOwner(req);
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
           is_banned, created_at
    FROM users ORDER BY created_at DESC
  `).all();

  res.json(users.map(u => {
    const roles = getUserRoles(u.id);
    const highestRole = roles.length > 0 
      ? roles.reduce((highest, r) => roleRank(r) > roleRank(highest) ? r : highest, 'user')
      : 'user';
    
    return {
      ...u,
      roles,
      role: highestRole, // for display
      roleLabel: ROLE_LABELS[highestRole],
      roleColor: ROLE_COLORS[highestRole],
    };
  }));
});

// ── POST /api/roles/assign — toggle role for user ────────────────────────────
router.post('/assign', auth, (req, res) => {
  if (!canManageRoles(req) && !isOwner(req))
    return res.status(403).json({ error: 'Нет доступа' });

  const { userId, role } = req.body;
  if (!ROLE_HIERARCHY.includes(role))
    return res.status(400).json({ error: 'Неверная роль' });

  // Can't assign role higher than your own
  const myRoles = getUserRoles(req.user.id);
  const myHighestRank = isOwner(req) ? 999 : Math.max(...myRoles.map(roleRank), 0);
  if (roleRank(role) >= myHighestRank && !isOwner(req))
    return res.status(403).json({ error: 'Нельзя назначить роль выше своей' });

  // Can't change owner's roles
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL && !isOwner(req))
    return res.status(403).json({ error: 'Нельзя изменить роли владельца' });

  // Toggle role (add if not exists, remove if exists)
  const existing = db.prepare('SELECT id FROM user_roles WHERE user_id = ? AND role = ?').get(userId, role);
  
  if (existing) {
    // Remove role
    db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(userId, role);
  } else {
    // Add role
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, role);
  }

  const roles = getUserRoles(userId);
  const highestRole = roles.length > 0 
    ? roles.reduce((highest, r) => roleRank(r) > roleRank(highest) ? r : highest, 'user')
    : 'user';

  res.json({ 
    ok: true, 
    roles,
    role: highestRole,
    roleLabel: ROLE_LABELS[highestRole], 
    roleColor: ROLE_COLORS[highestRole] 
  });
});

// ── GET /api/roles/me — get my roles and permissions ─────────────────────────
router.get('/me', auth, (req, res) => {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const roles = (u?.email === ADMIN_EMAIL) ? ['owner'] : getUserRoles(req.user.id);
  const permissions = (u?.email === ADMIN_EMAIL) ? ROLE_PERMISSIONS.owner : getUserPermissions(req.user.id);
  
  const highestRole = roles.length > 0 
    ? roles.reduce((highest, r) => roleRank(r) > roleRank(highest) ? r : highest, 'user')
    : 'user';

  res.json({
    roles,
    role: highestRole,
    roleLabel: ROLE_LABELS[highestRole],
    roleColor: ROLE_COLORS[highestRole],
    permissions,
  });
});

module.exports = router;
module.exports.ROLE_LABELS = ROLE_LABELS;
module.exports.ROLE_COLORS = ROLE_COLORS;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
module.exports.getUserRoles = getUserRoles;
module.exports.getUserPermissions = getUserPermissions;
module.exports.hasPermission = hasPermission;
