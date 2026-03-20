const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();
const ADMIN_EMAIL = 'yamekel0@gmail.com';

function adminOnly(req, res, next) {
  const user = db.prepare('SELECT email, is_banned FROM users WHERE id = ?').get(req.user.id);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Нет доступа' });
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
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const q = `%${search}%`;

  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.display_name, u.avatar, u.accent_color,
           u.is_banned, u.ban_reason, u.created_at,
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

  db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').run(reason, target.id);

  // Kick from WS
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

module.exports = router;
