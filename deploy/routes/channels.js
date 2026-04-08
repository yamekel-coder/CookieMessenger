const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');
const { validateLengths, postLimiter } = require('../middleware/security');

const router = express.Router();

function getChannel(id) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
}

function isOwnerOrAdmin(channelId, userId) {
  const ch = getChannel(channelId);
  return ch?.owner_id === userId;
}

function isSubscribed(channelId, userId) {
  return !!db.prepare('SELECT 1 FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
}

// ── GET /api/channels — list public channels + my channels ────────────────────
router.get('/', auth, (req, res) => {
  const publicChannels = db.prepare(`
    SELECT c.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar as owner_avatar,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      (SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
    FROM channels c JOIN users u ON u.id = c.owner_id
    WHERE c.type = 'public'
    ORDER BY subscribers_count DESC LIMIT 50
  `).all(req.user.id);

  const myChannels = db.prepare(`
    SELECT c.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar as owner_avatar,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      1 as is_subscribed
    FROM channel_subscribers cs
    JOIN channels c ON c.id = cs.channel_id
    JOIN users u ON u.id = c.owner_id
    WHERE cs.user_id = ?
    ORDER BY cs.joined_at DESC
  `).all(req.user.id);

  res.json({ publicChannels, myChannels });
});

// ── GET /api/channels/search ──────────────────────────────────────────────────
router.get('/search', auth, (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const channels = db.prepare(`
    SELECT c.*, u.username as owner_username,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      (SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
    FROM channels c JOIN users u ON u.id = c.owner_id
    WHERE c.type = 'public' AND (LOWER(c.name) LIKE ? OR LOWER(c.username) LIKE ?)
    ORDER BY subscribers_count DESC LIMIT 20
  `).all(req.user.id, q, q);
  res.json(channels);
});

// ── POST /api/channels — create channel ───────────────────────────────────────
router.post('/', auth, validateLengths({ name: 64, username: 32, description: 300 }), (req, res) => {
  const { name, username, description, type, avatar } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (!username?.trim()) return res.status(400).json({ error: 'Username обязателен' });
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username: 3-32 символа, только буквы, цифры и _' });
  if (!['public', 'private'].includes(type)) return res.status(400).json({ error: 'Неверный тип' });

  const existing = db.prepare('SELECT id FROM channels WHERE LOWER(username) = ?').get(username.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Username уже занят' });

  const result = db.prepare(
    'INSERT INTO channels (owner_id, username, name, description, avatar, type) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, username.toLowerCase(), name.trim(), description || null, avatar || null, type || 'public');

  const channelId = result.lastInsertRowid;
  // Auto-subscribe owner
  db.prepare('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id) VALUES (?, ?)').run(channelId, req.user.id);

  res.json(db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId));
});

// ── GET /api/channels/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const channel = db.prepare(`
    SELECT c.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar as owner_avatar,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      (SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
    FROM channels c JOIN users u ON u.id = c.owner_id
    WHERE c.id = ?
  `).get(req.user.id, req.params.id);

  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.type === 'private' && !isSubscribed(channel.id, req.user.id) && channel.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Приватный канал' });

  res.json(channel);
});

// ── POST /api/channels/:id/subscribe ─────────────────────────────────────────
router.post('/:id/subscribe', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.type === 'private') return res.status(403).json({ error: 'Нельзя подписаться на приватный канал' });

  const already = isSubscribed(channel.id, req.user.id);
  if (already) {
    db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').run(channel.id, req.user.id);
    return res.json({ subscribed: false });
  }
  db.prepare('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id) VALUES (?, ?)').run(channel.id, req.user.id);
  res.json({ subscribed: true });
});

// ── GET /api/channels/:id/posts ───────────────────────────────────────────────
router.get('/:id/posts', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.type === 'private' && !isSubscribed(channel.id, req.user.id) && channel.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Приватный канал' });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT cp.*, u.username, u.display_name, u.avatar, u.accent_color, u.verified, u.animated_name,
      (SELECT COUNT(*) FROM channel_post_reactions WHERE post_id = cp.id) as reactions_count,
      (SELECT emoji FROM channel_post_reactions WHERE post_id = cp.id AND user_id = ?) as my_reaction
    FROM channel_posts cp JOIN users u ON u.id = cp.author_id
    WHERE cp.channel_id = ?
    ORDER BY cp.created_at DESC LIMIT ? OFFSET ?
  `).all(req.user.id, channel.id, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM channel_posts WHERE channel_id = ?').get(channel.id).c;
  res.json({ posts, hasMore: offset + limit < total });
});

// ── POST /api/channels/:id/posts — publish post (owner only) ─────────────────
router.post('/:id/posts', auth, postLimiter, validateLengths({ content: 4000 }), (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Только владелец может публиковать' });

  const { content, media, media_type } = req.body;
  if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустой пост' });

  const result = db.prepare(
    'INSERT INTO channel_posts (channel_id, author_id, content, media, media_type) VALUES (?, ?, ?, ?, ?)'
  ).run(channel.id, req.user.id, content?.trim() || null, media || null, media_type || null);

  const post = db.prepare(`
    SELECT cp.*, u.username, u.display_name, u.avatar, u.accent_color, u.verified, u.animated_name,
      0 as reactions_count, NULL as my_reaction
    FROM channel_posts cp JOIN users u ON u.id = cp.author_id WHERE cp.id = ?
  `).get(result.lastInsertRowid);

  // Notify subscribers via WS
  const subs = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channel.id);
  subs.forEach(s => {
    if (s.user_id !== req.user.id) ws.sendTo(s.user_id, 'channel_post', { channelId: channel.id, channelName: channel.name, post });
  });

  res.json(post);
});

// ── DELETE /api/channels/:id/posts/:postId ────────────────────────────────────
router.delete('/:id/posts/:postId', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  db.prepare('DELETE FROM channel_posts WHERE id = ? AND channel_id = ?').run(req.params.postId, channel.id);
  res.json({ ok: true });
});

// ── POST /api/channels/:id/posts/:postId/react ────────────────────────────────
router.post('/:id/posts/:postId/react', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!isSubscribed(channel.id, req.user.id) && channel.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Нужно подписаться' });

  const { emoji = '👍' } = req.body;
  const existing = db.prepare('SELECT id FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').get(req.params.postId, req.user.id);

  if (existing) {
    db.prepare('DELETE FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').run(req.params.postId, req.user.id);
    return res.json({ reacted: false });
  }
  db.prepare('INSERT INTO channel_post_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)').run(req.params.postId, req.user.id, emoji);
  res.json({ reacted: true, emoji });
});

// ── DELETE /api/channels/:id — delete channel (owner only) ───────────────────
router.delete('/:id', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  res.json({ ok: true });
});

module.exports = router;
