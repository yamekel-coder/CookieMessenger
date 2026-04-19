const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');
const { validateLengths, postLimiter } = require('../middleware/security');

const router = express.Router();

// ── Poll tables for channel posts ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES channel_posts(id) ON DELETE CASCADE
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    UNIQUE(option_id, user_id),
    FOREIGN KEY (option_id) REFERENCES channel_poll_options(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

function getChannel(id) {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
}

function isSubscribed(channelId, userId) {
  return !!db.prepare('SELECT 1 FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
}

function enrichChannel(channelId, userId) {
  return db.prepare(`
    SELECT c.*, u.username as owner_username, u.display_name as owner_display_name, u.avatar as owner_avatar,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      (SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
    FROM channels c JOIN users u ON u.id = c.owner_id WHERE c.id = ?
  `).get(userId, channelId);
}

// ── GET /api/channels ─────────────────────────────────────────────────────────
router.get('/', auth, (req, res) => {
  const publicChannels = db.prepare(`
    SELECT c.*, u.username as owner_username,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      (SELECT 1 FROM channel_subscribers WHERE channel_id = c.id AND user_id = ?) as is_subscribed
    FROM channels c JOIN users u ON u.id = c.owner_id
    WHERE c.type = 'public' ORDER BY subscribers_count DESC LIMIT 50
  `).all(req.user.id);

  const myChannels = db.prepare(`
    SELECT c.*, u.username as owner_username,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count,
      1 as is_subscribed
    FROM channel_subscribers cs
    JOIN channels c ON c.id = cs.channel_id
    JOIN users u ON u.id = c.owner_id
    WHERE cs.user_id = ? ORDER BY cs.joined_at DESC
  `).all(req.user.id);

  res.json({ publicChannels, myChannels });
});

// ── GET /api/channels/public/:username — no auth, for public preview ─────────
router.get('/public/:username', (req, res) => {
  const channel = db.prepare(`
    SELECT c.id, c.username, c.name, c.description, c.avatar, c.type,
      (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscribers_count
    FROM channels c WHERE LOWER(c.username) = ? AND c.type = 'public'
  `).get(req.params.username.toLowerCase());
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });

  const posts = db.prepare(`
    SELECT cp.id, cp.content, cp.media, cp.media_type, cp.spoiler, cp.created_at, cp.views,
      (SELECT COUNT(*) FROM channel_post_reactions WHERE post_id = cp.id) as reactions_count
    FROM channel_posts cp WHERE cp.channel_id = ? ORDER BY cp.created_at DESC LIMIT 20
  `).all(channel.id);

  res.json({ channel, posts });
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

// ── POST /api/channels — create ───────────────────────────────────────────────
router.post('/', auth, validateLengths({ name: 64, username: 32, description: 300 }), (req, res) => {
  const { name, username, description, type, avatar } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (!username?.trim()) return res.status(400).json({ error: 'Username обязателен' });
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username: 3-32 символа, только буквы, цифры и _' });
  if (!['public', 'private'].includes(type)) return res.status(400).json({ error: 'Неверный тип' });

  // Check channel creation limit
  const { getUserPermissions } = require('./roles');
  const perms = getUserPermissions(req.user.id);
  const limit = perms.includes('more_groups') ? 10 : 5;
  const owned = db.prepare('SELECT COUNT(*) as c FROM channels WHERE owner_id = ?').get(req.user.id).c;
  if (owned >= limit) {
    return res.status(403).json({ error: `Достигнут лимит каналов (${limit}). ${limit === 5 ? 'VIP позволяет создавать до 10.' : ''}` });
  }

  const existing = db.prepare('SELECT id FROM channels WHERE LOWER(username) = ?').get(username.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Username уже занят' });

  // Validate avatar size (5MB max)
  if (avatar && avatar.startsWith('data:image/')) {
    if (Math.ceil((avatar.length * 3) / 4) > 5 * 1024 * 1024)
      return res.status(400).json({ error: 'Аватарка слишком большая. Максимум 5MB' });
  }

  const result = db.prepare(
    'INSERT INTO channels (owner_id, username, name, description, avatar, type) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, username.toLowerCase(), name.trim(), description || null, avatar || null, type || 'public');

  const channelId = result.lastInsertRowid;
  db.prepare('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id) VALUES (?, ?)').run(channelId, req.user.id);
  res.json(enrichChannel(channelId, req.user.id));
});

// ── GET /api/channels/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const channel = enrichChannel(req.params.id, req.user.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.type === 'private' && !isSubscribed(channel.id, req.user.id) && channel.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Приватный канал' });
  res.json(channel);
});

// ── PUT /api/channels/:id — edit channel (owner only) ────────────────────────
router.put('/:id', auth, validateLengths({ name: 64, description: 300 }), (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const { name, description, avatar, type } = req.body;

  // Validate avatar size (5MB max)
  if (avatar && avatar.startsWith('data:image/')) {
    if (Math.ceil((avatar.length * 3) / 4) > 5 * 1024 * 1024)
      return res.status(400).json({ error: 'Аватарка слишком большая. Максимум 5MB' });
  }

  // avatar: undefined = don't change, null = remove, string = update
  const newAvatar = avatar !== undefined ? (avatar || null) : channel.avatar;

  db.prepare(`
    UPDATE channels SET
      name = COALESCE(?, name),
      description = ?,
      avatar = ?,
      type = COALESCE(?, type)
    WHERE id = ?
  `).run(name?.trim() || null, description ?? channel.description, newAvatar, type || null, channel.id);

  const updated = enrichChannel(channel.id, req.user.id);
  // Notify subscribers about channel update
  const subs = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channel.id);
  subs.forEach(s => ws.sendTo(s.user_id, 'channel_updated', updated));

  res.json(updated);
});

// ── POST /api/channels/:id/subscribe ─────────────────────────────────────────
router.post('/:id/subscribe', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.type === 'private') return res.status(403).json({ error: 'Нельзя подписаться на приватный канал' });

  // Check if banned
  db.prepare(`CREATE TABLE IF NOT EXISTS channel_bans (
    channel_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
  )`).run();
  const banned = db.prepare('SELECT 1 FROM channel_bans WHERE channel_id = ? AND user_id = ?').get(channel.id, req.user.id);
  if (banned) return res.status(403).json({ error: 'Вы заблокированы в этом канале' });

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

  // Attach poll data
  const enriched = posts.map(post => {
    if (post.media_type !== 'poll') return post;
    try {
      const options = db.prepare('SELECT * FROM channel_poll_options WHERE post_id = ?').all(post.id);
      if (!options || options.length === 0) {
        console.log('[channel posts] No poll options found for post', post.id);
        return post;
      }
      
      // Find user's vote by checking all options
      const userVoteRecord = db.prepare(`
        SELECT option_id FROM channel_poll_votes 
        WHERE user_id = ? AND option_id IN (SELECT id FROM channel_poll_options WHERE post_id = ?)
      `).get(req.user.id, post.id);
      
      const poll = options.map(o => ({
        ...o,
        votes: db.prepare('SELECT COUNT(*) as c FROM channel_poll_votes WHERE option_id = ?').get(o.id).c,
        voted: userVoteRecord?.option_id === o.id,
      }));
      return { ...post, poll };
    } catch (err) {
      console.error('[channel posts poll]', err.message);
      return post;
    }
  });

  const total = db.prepare('SELECT COUNT(*) as c FROM channel_posts WHERE channel_id = ?').get(channel.id).c;
  res.json({ posts: enriched, hasMore: offset + limit < total });
});

// ── POST /api/channels/:id/posts — publish ────────────────────────────────────
router.post('/:id/posts', auth, postLimiter, validateLengths({ content: 4000 }), (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Только владелец может публиковать' });

  const { content, media, media_type, spoiler, poll_options } = req.body;

  // Poll validation
  if (media_type === 'poll') {
    if (!Array.isArray(poll_options) || poll_options.length < 2)
      return res.status(400).json({ error: 'Минимум 2 варианта' });
    if (poll_options.length > 10)
      return res.status(400).json({ error: 'Максимум 10 вариантов' });
    if (poll_options.some(o => typeof o !== 'string' || !o.trim() || o.length > 200))
      return res.status(400).json({ error: 'Вариант слишком длинный или пустой' });
  } else {
    if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустой пост' });
  }

  const result = db.prepare(
    'INSERT INTO channel_posts (channel_id, author_id, content, media, media_type, spoiler) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(channel.id, req.user.id, content?.trim() || null, media || null, media_type || null, spoiler ? 1 : 0);

  const postId = result.lastInsertRowid;

  // Insert poll options
  if (media_type === 'poll' && poll_options) {
    const ins = db.prepare('INSERT INTO channel_poll_options (post_id, text) VALUES (?, ?)');
    poll_options.forEach(opt => ins.run(postId, opt.trim()));
  }

  const post = db.prepare(`
    SELECT cp.*, u.username, u.display_name, u.avatar, u.accent_color, u.verified, u.animated_name,
      0 as reactions_count, NULL as my_reaction
    FROM channel_posts cp JOIN users u ON u.id = cp.author_id WHERE cp.id = ?
  `).get(postId);

  // Attach poll
  if (media_type === 'poll') {
    const options = db.prepare('SELECT * FROM channel_poll_options WHERE post_id = ?').all(postId);
    post.poll = options.map(o => ({ ...o, votes: 0, voted: false }));
  }

  // Notify all subscribers in real-time
  const subs = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channel.id);
  subs.forEach(s => {
    ws.sendTo(s.user_id, 'channel_post', { channelId: channel.id, channelName: channel.name, post });
  });

  res.json(post);
});

// ── POST /api/channels/:id/posts/:postId/poll/:optionId — vote ───────────────
router.post('/:id/posts/:postId/poll/:optionId', auth, (req, res) => {
  try {
    const optionId = parseInt(req.params.optionId);
    const postId = parseInt(req.params.postId);
    if (isNaN(optionId) || isNaN(postId)) return res.status(400).json({ error: 'Неверный ID' });

    const option = db.prepare('SELECT * FROM channel_poll_options WHERE id = ? AND post_id = ?').get(optionId, postId);
    if (!option) return res.status(404).json({ error: 'Вариант не найден' });

    const existing = db.prepare(`
      SELECT cpv.* FROM channel_poll_votes cpv
      JOIN channel_poll_options cpo ON cpo.id = cpv.option_id
      WHERE cpo.post_id = ? AND cpv.user_id = ?
    `).get(postId, req.user.id);

    if (existing) {
      if (existing.option_id === optionId) {
        db.prepare('DELETE FROM channel_poll_votes WHERE option_id = ? AND user_id = ?').run(optionId, req.user.id);
      } else {
        db.prepare('DELETE FROM channel_poll_votes WHERE option_id = ? AND user_id = ?').run(existing.option_id, req.user.id);
        db.prepare('INSERT INTO channel_poll_votes (option_id, user_id) VALUES (?, ?)').run(optionId, req.user.id);
      }
    } else {
      db.prepare('INSERT INTO channel_poll_votes (option_id, user_id) VALUES (?, ?)').run(optionId, req.user.id);
    }

    const options = db.prepare('SELECT * FROM channel_poll_options WHERE post_id = ?').all(postId);
    const userVoteRecord = db.prepare(`
      SELECT option_id FROM channel_poll_votes 
      WHERE user_id = ? AND option_id IN (SELECT id FROM channel_poll_options WHERE post_id = ?)
    `).get(req.user.id, postId);

    const poll = options.map(o => ({
      ...o,
      votes: db.prepare('SELECT COUNT(*) as c FROM channel_poll_votes WHERE option_id = ?').get(o.id).c,
      voted: userVoteRecord?.option_id === o.id,
    }));

    res.json(poll);
  } catch (err) {
    console.error('[channel poll vote]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/channels/:id/posts/:postId ────────────────────────────────────
router.delete('/:id/posts/:postId', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  db.prepare('DELETE FROM channel_posts WHERE id = ? AND channel_id = ?').run(req.params.postId, channel.id);

  // Notify subscribers about deletion
  const subs = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channel.id);
  subs.forEach(s => ws.sendTo(s.user_id, 'channel_post_deleted', { channelId: channel.id, postId: parseInt(req.params.postId) }));

  res.json({ ok: true });
});

// ── POST /api/channels/:id/posts/:postId/view — increment view ────────────────
const channelViewCooldown = new Map();
router.post('/:id/posts/:postId/view', auth, (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ error: 'Неверный ID' });

  // Rate limit: 1 view per user per post per 24h (in-memory cooldown)
  const key = `${req.user.id}:${postId}`;
  const now = Date.now();
  const last = channelViewCooldown.get(key);
  if (last && now - last < 24 * 60 * 60 * 1000) {
    const post = db.prepare('SELECT views FROM channel_posts WHERE id = ?').get(postId);
    return res.json({ views: post?.views || 0 });
  }
  channelViewCooldown.set(key, now);

  db.prepare('UPDATE channel_posts SET views = views + 1 WHERE id = ? AND channel_id = ?').run(postId, req.params.id);
  const post = db.prepare('SELECT views FROM channel_posts WHERE id = ?').get(postId);
  res.json({ views: post?.views || 0 });
});

// ── POST /api/channels/:id/posts/:postId/react ────────────────────────────────
router.post('/:id/posts/:postId/react', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (!isSubscribed(channel.id, req.user.id) && channel.owner_id !== req.user.id)
    return res.status(403).json({ error: 'Нужно подписаться' });

  const postId = parseInt(req.params.postId);
  const { emoji = '👍' } = req.body;
  const existing = db.prepare('SELECT id FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').get(postId, req.user.id);

  let reacted;
  if (existing) {
    db.prepare('DELETE FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').run(postId, req.user.id);
    reacted = false;
  } else {
    db.prepare('INSERT INTO channel_post_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)').run(postId, req.user.id, emoji);
    reacted = true;
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM channel_post_reactions WHERE post_id = ?').get(postId).c;

  // Broadcast reaction update to all subscribers
  const subs = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channel.id);
  subs.forEach(s => ws.sendTo(s.user_id, 'channel_reaction', { channelId: channel.id, postId, reacted, emoji, count }));

  res.json({ reacted, emoji, count });
});

// ── DELETE /api/channels/:id ──────────────────────────────────────────────────
router.delete('/:id', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  ws.broadcast('channel_deleted', { channelId: channel.id });
  res.json({ ok: true });
});

// ── GET /api/channels/:id/subscribers — list subscribers (owner only) ─────────
router.get('/:id/subscribers', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  // Ensure channel_bans table exists before querying it
  db.prepare(`CREATE TABLE IF NOT EXISTS channel_bans (
    channel_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
  )`).run();

  const subs = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color, u.verified,
      cs.joined_at,
      (SELECT 1 FROM channel_bans WHERE channel_id = ? AND user_id = u.id) as is_banned
    FROM channel_subscribers cs
    JOIN users u ON u.id = cs.user_id
    WHERE cs.channel_id = ? AND u.id != ?
    ORDER BY cs.joined_at DESC
  `).all(channel.id, channel.id, channel.owner_id);

  res.json(subs);
});

// ── DELETE /api/channels/:id/subscribers/:userId — kick subscriber ────────────
router.delete('/:id/subscribers/:userId', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const targetId = parseInt(req.params.userId);
  if (targetId === channel.owner_id) return res.status(400).json({ error: 'Нельзя выгнать владельца' });

  db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').run(channel.id, targetId);
  ws.sendTo(targetId, 'channel_kicked', { channelId: channel.id, channelName: channel.name });
  res.json({ ok: true });
});

// ── POST /api/channels/:id/ban/:userId — ban user ─────────────────────────────
router.post('/:id/ban/:userId', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  const targetId = parseInt(req.params.userId);
  if (targetId === channel.owner_id) return res.status(400).json({ error: 'Нельзя забанить владельца' });

  // Ensure channel_bans table exists
  db.prepare(`CREATE TABLE IF NOT EXISTS channel_bans (
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
  )`).run();

  db.prepare('INSERT OR IGNORE INTO channel_bans (channel_id, user_id) VALUES (?, ?)').run(channel.id, targetId);
  db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').run(channel.id, targetId);
  ws.sendTo(targetId, 'channel_banned', { channelId: channel.id, channelName: channel.name });
  res.json({ ok: true });
});

// ── DELETE /api/channels/:id/ban/:userId — unban user ────────────────────────
router.delete('/:id/ban/:userId', auth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.owner_id !== req.user.id) return res.status(403).json({ error: 'Нет прав' });

  db.prepare('DELETE FROM channel_bans WHERE channel_id = ? AND user_id = ?').run(channel.id, parseInt(req.params.userId));
  res.json({ ok: true });
});

module.exports = router;
