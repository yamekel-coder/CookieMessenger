const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();

function parseMentions(text) {
  if (!text) return [];
  const matches = [...text.matchAll(/@([a-zA-Z0-9_]+)/g)];
  const usernames = [...new Set(matches.map(m => m[1].toLowerCase()))];
  return usernames
    .map(u => db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(u))
    .filter(Boolean)
    .map(u => u.id);
}

function notify(userId, actorId, type, postId = null, commentId = null) {
  if (userId === actorId) return;
  const result = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type, post_id, comment_id) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, actorId, type, postId, commentId);

  // Send real-time notification
  const notif = db.prepare(`
    SELECT n.*,
      u.username as actor_username, u.display_name as actor_display_name,
      u.avatar as actor_avatar, u.accent_color as actor_accent_color,
      p.content as post_content, p.type as post_type
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  if (notif) ws.sendTo(userId, 'notification', notif);
}

function enrichPost(post, userId) {
  const likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(post.id).c;
  const liked = !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, userId);
  const commentsCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE post_id = ?').get(post.id).c;

  let poll = null;
  if (post.type === 'poll') {
    const options = db.prepare('SELECT * FROM poll_options WHERE post_id = ?').all(post.id);
    const userVote = db.prepare(`
      SELECT pv.option_id FROM poll_votes pv
      JOIN poll_options po ON po.id = pv.option_id
      WHERE po.post_id = ? AND pv.user_id = ?
    `).get(post.id, userId);
    poll = options.map(o => ({
      ...o,
      votes: db.prepare('SELECT COUNT(*) as c FROM poll_votes WHERE option_id = ?').get(o.id).c,
      voted: userVote?.option_id === o.id,
    }));
  }

  return { ...post, likes, liked, commentsCount, poll };
}

// ─── Feed ────────────────────────────────────────────────────────────────────

router.get('/', auth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM posts').get().c;
  res.json({ posts: posts.map(p => enrichPost(p, req.user.id)), hasMore: offset + limit < total });
});

router.post('/', auth, (req, res) => {
  const { type, content, media, poll_options } = req.body;
  if (!type) return res.status(400).json({ error: 'Тип поста обязателен' });
  if (type !== 'poll' && !content && !media) return res.status(400).json({ error: 'Пустой пост' });
  if (type === 'poll' && (!poll_options || poll_options.length < 2))
    return res.status(400).json({ error: 'Минимум 2 варианта' });

  const result = db.prepare(
    'INSERT INTO posts (user_id, type, content, media) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, type, content || null, media || null);

  const postId = result.lastInsertRowid;

  if (type === 'poll') {
    const ins = db.prepare('INSERT INTO poll_options (post_id, text) VALUES (?, ?)');
    poll_options.forEach(opt => ins.run(postId, opt));
  }

  parseMentions(content).forEach(uid => notify(uid, req.user.id, 'mention', postId));

  const post = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(postId);

  const enriched = enrichPost(post, req.user.id);

  // Broadcast new post to ALL connected users
  ws.broadcast('new_post', enriched);

  res.json(enriched);
});

// ─── Specific routes BEFORE /:id ─────────────────────────────────────────────

router.get('/notifications', auth, (req, res) => {
  const notifs = db.prepare(`
    SELECT n.*,
      u.username as actor_username, u.display_name as actor_display_name,
      u.avatar as actor_avatar, u.accent_color as actor_accent_color,
      p.content as post_content, p.type as post_type
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(notifs);
});

router.get('/notifications/unread-count', auth, (req, res) => {
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0'
  ).get(req.user.id).c;
  res.json({ count });
});

router.post('/notifications/read-all', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/mention-search', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) {
    const users = db.prepare(
      'SELECT id, username, display_name, avatar, accent_color FROM users LIMIT 6'
    ).all();
    return res.json(users);
  }
  const users = db.prepare(`
    SELECT id, username, display_name, avatar, accent_color
    FROM users WHERE LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?
    LIMIT 6
  `).all(`${q}%`, `${q}%`);
  res.json(users);
});

router.post('/poll/:optionId/vote', auth, (req, res) => {
  const option = db.prepare('SELECT * FROM poll_options WHERE id = ?').get(req.params.optionId);
  if (!option) return res.status(404).json({ error: 'Вариант не найден' });

  const existing = db.prepare(`
    SELECT pv.* FROM poll_votes pv
    JOIN poll_options po ON po.id = pv.option_id
    WHERE po.post_id = ? AND pv.user_id = ?
  `).get(option.post_id, req.user.id);

  if (existing) {
    if (existing.option_id === parseInt(req.params.optionId)) {
      db.prepare('DELETE FROM poll_votes WHERE option_id = ? AND user_id = ?').run(req.params.optionId, req.user.id);
    } else {
      db.prepare('DELETE FROM poll_votes WHERE option_id = ? AND user_id = ?').run(existing.option_id, req.user.id);
      db.prepare('INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)').run(req.params.optionId, req.user.id);
    }
  } else {
    db.prepare('INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)').run(req.params.optionId, req.user.id);
  }

  const options = db.prepare('SELECT * FROM poll_options WHERE post_id = ?').all(option.post_id);
  const userVote = db.prepare(`
    SELECT pv.option_id FROM poll_votes pv
    JOIN poll_options po ON po.id = pv.option_id
    WHERE po.post_id = ? AND pv.user_id = ?
  `).get(option.post_id, req.user.id);

  const updatedPoll = options.map(o => ({
    ...o,
    votes: db.prepare('SELECT COUNT(*) as c FROM poll_votes WHERE option_id = ?').get(o.id).c,
    voted: userVote?.option_id === o.id,
  }));

  // Broadcast poll update to all
  ws.broadcast('poll_update', { postId: option.post_id, poll: updatedPoll });

  res.json(updatedPoll);
});

// ─── Parametric /:id ─────────────────────────────────────────────────────────

router.delete('/:id', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Не найден' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  ws.broadcast('delete_post', { postId: parseInt(req.params.id) });
  res.json({ ok: true });
});

router.post('/:id/like', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Не найден' });

  const liked = db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (liked) {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  } else {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    notify(post.user_id, req.user.id, 'like', post.id);
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;

  // Broadcast like update to all
  ws.broadcast('like_update', { postId: parseInt(req.params.id), liked: !liked, count, actorId: req.user.id });

  res.json({ liked: !liked, count });
});

router.get('/:id/comments', auth, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

router.post('/:id/comments', auth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Пустой комментарий' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });

  const result = db.prepare(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)'
  ).run(req.params.id, req.user.id, content.trim());

  const commentId = result.lastInsertRowid;

  notify(post.user_id, req.user.id, 'comment', post.id, commentId);
  parseMentions(content).forEach(uid => notify(uid, req.user.id, 'mention', post.id, commentId));

  const comment = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(commentId);

  // Broadcast new comment to all (they'll add it if they have that post open)
  ws.broadcast('new_comment', { postId: parseInt(req.params.id), comment });

  res.json(comment);
});

module.exports = router;
