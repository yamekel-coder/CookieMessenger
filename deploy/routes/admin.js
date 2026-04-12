const express = require('express');
const db = require('../db');
const ws = require('../ws');
const { auth, requireAdmin, clearUserCache } = require('../middleware/auth');
const { getUserRoles } = require('./roles');

const router = express.Router();
const ADMIN_EMAIL = 'yamekel0@gmail.com';

function adminOnly(req, res, next) {
  const user = db.prepare('SELECT email, is_banned FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(403).json({ error: 'Нет доступа' });
  
  // Allow by email (owner) OR by role (admin/owner)
  const isOwnerEmail = user.email === ADMIN_EMAIL;
  const roles = getUserRoles(req.user.id);
  const hasAdminRole = roles.includes('admin') || roles.includes('owner');
  
  if (!isOwnerEmail && !hasAdminRole) return res.status(403).json({ error: 'Нет доступа' });
  next();
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', auth, adminOnly, (req, res) => {
  const totalUsers    = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const bannedUsers   = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned = 1').get().c;
  const totalPosts    = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  const totalMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
  const totalComments = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;
  const totalLikes    = db.prepare('SELECT COUNT(*) as c FROM likes').get().c;
  const totalFollows  = db.prepare('SELECT COUNT(*) as c FROM follows').get().c;
  const totalFriends  = db.prepare("SELECT COUNT(*) as c FROM friendships WHERE status = 'accepted'").get().c;
  const onlineNow     = ws.getOnlineUsers().length;

  // New users last 7 days
  const newUsersWeek = db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // New posts last 7 days
  const newPostsWeek = db.prepare(
    "SELECT COUNT(*) as c FROM posts WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // Messages last 7 days
  const newMsgsWeek = db.prepare(
    "SELECT COUNT(*) as c FROM messages WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // Daily registrations last 14 days
  const regChart = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM users
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Daily posts last 14 days
  const postsChart = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM posts
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Top 5 most active users by posts
  const topPosters = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color,
           COUNT(p.id) as posts_count
    FROM users u LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id ORDER BY posts_count DESC LIMIT 5
  `).all();

  // Post type breakdown
  const postTypes = db.prepare(
    'SELECT type, COUNT(*) as count FROM posts GROUP BY type'
  ).all();

  res.json({
    totalUsers, bannedUsers, totalPosts, totalMessages, totalComments,
    totalLikes, totalFollows, totalFriends, onlineNow,
    newUsersWeek, newPostsWeek, newMsgsWeek,
    regChart, postsChart, topPosters, postTypes,
  });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', auth, adminOnly, (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const safeSearch = String(search).slice(0, 100); // max 100 chars
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit));
  const q = `%${safeSearch}%`;

  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.display_name, u.avatar, u.accent_color,
           u.is_banned, u.ban_reason, u.created_at, u.verified,
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
           (SELECT COUNT(*) FROM messages WHERE sender_id = u.id) as msgs_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
    FROM users u
    WHERE u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(q, q, q, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?
  `).get(q, q, q).c;

  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ── POST /api/admin/users/:id/ban ─────────────────────────────────────────────
router.post('/users/:id/ban', auth, adminOnly, (req, res) => {
  const { reason = 'Нарушение правил' } = req.body;
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL) return res.status(400).json({ error: 'Нельзя забанить администратора' });

  // Only owner (by email) can ban admins/owners
  const targetRoles = getUserRoles(target.id);
  const myRoles = getUserRoles(req.user.id);
  const myUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const isOwner = myUser?.email === ADMIN_EMAIL || myRoles.includes('owner');
  if ((targetRoles.includes('admin') || targetRoles.includes('owner')) && !isOwner)
    return res.status(403).json({ error: 'Нельзя забанить администратора' });

  db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').run(reason, target.id);
  
  // Clear user cache after ban
  clearUserCache(target.id);
  
  ws.sendTo(target.id, 'banned', { reason });
  res.json({ ok: true });
});

// ── POST /api/admin/users/:id/unban ──────────────────────────────────────────
router.post('/users/:id/unban', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').run(req.params.id);
  
  // Clear user cache after unban
  clearUserCache(parseInt(req.params.id));
  
  res.json({ ok: true });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL) return res.status(400).json({ error: 'Нельзя удалить администратора' });

  // Only owner can delete accounts
  const myUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const myRoles = getUserRoles(req.user.id);
  const isOwner = myUser?.email === ADMIN_EMAIL || myRoles.includes('owner');
  if (!isOwner) return res.status(403).json({ error: 'Только владелец может удалять аккаунты' });

  ws.sendTo(target.id, 'banned', { reason: 'Аккаунт удалён администратором' });
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  
  // Clear user cache after deletion
  clearUserCache(target.id);
  
  res.json({ ok: true });
});

// ── DELETE /api/admin/posts/:id ───────────────────────────────────────────────
router.delete('/posts/:id', auth, adminOnly, (req, res) => {
  const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  ws.broadcast('delete_post', { postId: post.id });
  res.json({ ok: true });
});

// ── GET /api/admin/posts ──────────────────────────────────────────────────────
router.get('/posts', auth, adminOnly, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const posts = db.prepare(`
    SELECT p.id, p.type, p.content, p.created_at,
           u.id as user_id, u.username, u.display_name, u.avatar, u.accent_color,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  res.json({ posts, total, pages: Math.ceil(total / parseInt(limit)) });
});

// ── POST /api/admin/broadcast ─────────────────────────────────────────────────
router.post('/broadcast', auth, adminOnly, (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

  // Save as notification for all users
  const allUsers = db.prepare('SELECT id FROM users WHERE is_banned = 0').all();
  const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);

  const insert = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction((users) => {
    users.forEach(u => {
      if (u.id !== adminUser?.id) insert.run(u.id, adminUser?.id || 1, 'admin_broadcast');
    });
  });
  insertMany(allUsers);

  ws.broadcast('notification', {
    type: 'admin_broadcast',
    message,
    actor_display_name: '🛡️ Администратор',
    created_at: new Date().toISOString(),
    read: 0,
  });

  res.json({ ok: true, sent: allUsers.length });
});

// ── POST /api/admin/users/:id/verify — toggle verified badge ─────────────────
router.post('/users/:id/verify', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT id, verified FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  const newVal = target.verified ? 0 : 1;
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(newVal, target.id);
  
  // Clear user cache after verification change
  clearUserCache(target.id);
  
  res.json({ ok: true, verified: newVal });
});

// ── DELETE /api/admin/channels/:id — delete any channel ──────────────────────
router.delete('/channels/:id', auth, adminOnly, (req, res) => {
  const channel = db.prepare('SELECT id, name FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  res.json({ ok: true });
});

// ── DELETE /api/admin/groups/:id — delete any group ──────────────────────────
router.delete('/groups/:id', auth, adminOnly, (req, res) => {
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  res.json({ ok: true });
});

// ── GET /api/admin/reports — get all reports ──────────────────────────────────
router.get('/reports', auth, adminOnly, (req, res) => {
  const { status = 'pending', page = 1 } = req.query;
  const offset = (parseInt(page) - 1) * 20;
  const reports = db.prepare(`
    SELECT r.*, u.username as reporter_username, u.display_name as reporter_display_name
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE r.status = ?
    ORDER BY r.created_at DESC LIMIT 20 OFFSET ?
  `).all(status, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM reports WHERE status = ?').get(status).c;
  res.json({ reports, total });
});

// ── POST /api/admin/reports/:id/review — mark report as reviewed ──────────────
router.post('/reports/:id/review', auth, adminOnly, (req, res) => {
  const { action = 'reviewed' } = req.body; // reviewed | dismissed
  if (!['reviewed', 'dismissed'].includes(action)) return res.status(400).json({ error: 'Неверное действие' });
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(action, req.params.id);
  res.json({ ok: true });
});

module.exports = router;

function adminOnly(req, res, next) {
  const user = db.prepare('SELECT email, is_banned FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(403).json({ error: 'Нет доступа' });
  
  // Allow by email (owner) OR by role (admin/owner)
  const isOwnerEmail = user.email === ADMIN_EMAIL;
  const roles = getUserRoles(req.user.id);
  const hasAdminRole = roles.includes('admin') || roles.includes('owner');
  
  if (!isOwnerEmail && !hasAdminRole) return res.status(403).json({ error: 'Нет доступа' });
  next();
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', auth, adminOnly, (req, res) => {
  const totalUsers    = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const bannedUsers   = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned = 1').get().c;
  const totalPosts    = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  const totalMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
  const totalComments = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;
  const totalLikes    = db.prepare('SELECT COUNT(*) as c FROM likes').get().c;
  const totalFollows  = db.prepare('SELECT COUNT(*) as c FROM follows').get().c;
  const totalFriends  = db.prepare("SELECT COUNT(*) as c FROM friendships WHERE status = 'accepted'").get().c;
  const onlineNow     = ws.getOnlineUsers().length;

  // New users last 7 days
  const newUsersWeek = db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // New posts last 7 days
  const newPostsWeek = db.prepare(
    "SELECT COUNT(*) as c FROM posts WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // Messages last 7 days
  const newMsgsWeek = db.prepare(
    "SELECT COUNT(*) as c FROM messages WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;

  // Daily registrations last 14 days
  const regChart = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM users
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Daily posts last 14 days
  const postsChart = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM posts
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  // Top 5 most active users by posts
  const topPosters = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color,
           COUNT(p.id) as posts_count
    FROM users u LEFT JOIN posts p ON p.user_id = u.id
    GROUP BY u.id ORDER BY posts_count DESC LIMIT 5
  `).all();

  // Post type breakdown
  const postTypes = db.prepare(
    'SELECT type, COUNT(*) as count FROM posts GROUP BY type'
  ).all();

  res.json({
    totalUsers, bannedUsers, totalPosts, totalMessages, totalComments,
    totalLikes, totalFollows, totalFriends, onlineNow,
    newUsersWeek, newPostsWeek, newMsgsWeek,
    regChart, postsChart, topPosters, postTypes,
  });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', auth, adminOnly, (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const safeSearch = String(search).slice(0, 100); // max 100 chars
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit));
  const q = `%${safeSearch}%`;

  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.display_name, u.avatar, u.accent_color,
           u.is_banned, u.ban_reason, u.created_at, u.verified,
           (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as posts_count,
           (SELECT COUNT(*) FROM messages WHERE sender_id = u.id) as msgs_count,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count
    FROM users u
    WHERE u.username LIKE ? OR u.email LIKE ? OR u.display_name LIKE ?
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(q, q, q, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM users
    WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?
  `).get(q, q, q).c;

  res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// ── POST /api/admin/users/:id/ban ─────────────────────────────────────────────
router.post('/users/:id/ban', auth, adminOnly, (req, res) => {
  const { reason = 'Нарушение правил' } = req.body;
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL) return res.status(400).json({ error: 'Нельзя забанить администратора' });

  // Only owner (by email) can ban admins/owners
  const targetRoles = getUserRoles(target.id);
  const myRoles = getUserRoles(req.user.id);
  const myUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const isOwner = myUser?.email === ADMIN_EMAIL || myRoles.includes('owner');
  if ((targetRoles.includes('admin') || targetRoles.includes('owner')) && !isOwner)
    return res.status(403).json({ error: 'Нельзя забанить администратора' });

  db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').run(reason, target.id);
  ws.sendTo(target.id, 'banned', { reason });
  res.json({ ok: true });
});

// ── POST /api/admin/users/:id/unban ──────────────────────────────────────────
router.post('/users/:id/unban', auth, adminOnly, (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (target.email === ADMIN_EMAIL) return res.status(400).json({ error: 'Нельзя удалить администратора' });

  // Only owner can delete accounts
  const myUser = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
  const myRoles = getUserRoles(req.user.id);
  const isOwner = myUser?.email === ADMIN_EMAIL || myRoles.includes('owner');
  if (!isOwner) return res.status(403).json({ error: 'Только владелец может удалять аккаунты' });

  ws.sendTo(target.id, 'banned', { reason: 'Аккаунт удалён администратором' });
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true });
});

// ── DELETE /api/admin/posts/:id ───────────────────────────────────────────────
router.delete('/posts/:id', auth, adminOnly, (req, res) => {
  const post = db.prepare('SELECT id, user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  ws.broadcast('delete_post', { postId: post.id });
  res.json({ ok: true });
});

// ── GET /api/admin/posts ──────────────────────────────────────────────────────
router.get('/posts', auth, adminOnly, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const posts = db.prepare(`
    SELECT p.id, p.type, p.content, p.created_at,
           u.id as user_id, u.username, u.display_name, u.avatar, u.accent_color,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  res.json({ posts, total, pages: Math.ceil(total / parseInt(limit)) });
});

// ── POST /api/admin/broadcast ─────────────────────────────────────────────────
router.post('/broadcast', auth, adminOnly, (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

  // Save as notification for all users
  const allUsers = db.prepare('SELECT id FROM users WHERE is_banned = 0').all();
  const adminUser = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);

  const insert = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction((users) => {
    users.forEach(u => {
      if (u.id !== adminUser?.id) insert.run(u.id, adminUser?.id || 1, 'admin_broadcast');
    });
  });
  insertMany(allUsers);

  ws.broadcast('notification', {
    type: 'admin_broadcast',
    message,
    actor_display_name: '🛡️ Администратор',
    created_at: new Date().toISOString(),
    read: 0,
  });

  res.json({ ok: true, sent: allUsers.length });
});

// ── POST /api/admin/users/:id/verify — toggle verified badge ─────────────────
router.post('/users/:id/verify', auth, adminOnly, (req, res) => {
  const target = db.prepare('SELECT id, verified FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  const newVal = target.verified ? 0 : 1;
  db.prepare('UPDATE users SET verified = ? WHERE id = ?').run(newVal, target.id);
  res.json({ ok: true, verified: newVal });
});

// ── DELETE /api/admin/channels/:id — delete any channel ──────────────────────
router.delete('/channels/:id', auth, adminOnly, (req, res) => {
  const channel = db.prepare('SELECT id, name FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  res.json({ ok: true });
});

// ── DELETE /api/admin/groups/:id — delete any group ──────────────────────────
router.delete('/groups/:id', auth, adminOnly, (req, res) => {
  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  res.json({ ok: true });
});

// ── GET /api/admin/reports — get all reports ──────────────────────────────────
router.get('/reports', auth, adminOnly, (req, res) => {
  const { status = 'pending', page = 1 } = req.query;
  const offset = (parseInt(page) - 1) * 20;
  const reports = db.prepare(`
    SELECT r.*, u.username as reporter_username, u.display_name as reporter_display_name
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE r.status = ?
    ORDER BY r.created_at DESC LIMIT 20 OFFSET ?
  `).all(status, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM reports WHERE status = ?').get(status).c;
  res.json({ reports, total });
});

// ── POST /api/admin/reports/:id/review — mark report as reviewed ──────────────
router.post('/reports/:id/review', auth, adminOnly, (req, res) => {
  const { action = 'reviewed' } = req.body; // reviewed | dismissed
  if (!['reviewed', 'dismissed'].includes(action)) return res.status(400).json({ error: 'Неверное действие' });
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(action, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
