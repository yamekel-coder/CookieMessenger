const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/users/online — list of online user IDs
router.get('/online', auth, (req, res) => {
  res.json(ws.getOnlineUsers());
});

// GET /api/users/:username — public profile
router.get('/:username', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, bio, avatar, banner, accent_color, animated_name, profile_music, verified, created_at, privacy_public_profile FROM users WHERE username = ?'
  ).get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Не найден' });

  // Check if profile is private (only owner can see)
  if (!user.privacy_public_profile && user.id !== req.user.id)
    return res.status(403).json({ error: 'Профиль закрыт' });

  const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(user.id).c;
  const following = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(user.id).c;
  const isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, user.id);
  const postsCount = db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ?').get(user.id).c;

  res.json({ ...user, followers, following, isFollowing, postsCount });
});

// GET /api/users/:username/posts
router.get('/:username/posts', auth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Не найден' });

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const posts = db.prepare(`
    SELECT p.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `).all(user.id, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as c FROM posts WHERE user_id = ?').get(user.id).c;

  // Enrich posts
  const enriched = posts.map(post => {
    const likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(post.id).c;
    const liked = !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    const commentsCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE post_id = ?').get(post.id).c;
    let poll = null;
    if (post.type === 'poll') {
      const options = db.prepare('SELECT * FROM poll_options WHERE post_id = ?').all(post.id);
      const userVote = db.prepare(`
        SELECT pv.option_id FROM poll_votes pv
        JOIN poll_options po ON po.id = pv.option_id
        WHERE po.post_id = ? AND pv.user_id = ?
      `).get(post.id, req.user.id);
      poll = options.map(o => ({
        ...o,
        votes: db.prepare('SELECT COUNT(*) as c FROM poll_votes WHERE option_id = ?').get(o.id).c,
        voted: userVote?.option_id === o.id,
      }));
    }
    return { ...post, likes, liked, commentsCount, poll };
  });

  res.json({ posts: enriched, hasMore: offset + limit < total });
});

// GET /api/users/:username/followers
router.get('/:username/followers', auth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  const list = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color
    FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ? ORDER BY f.created_at DESC
  `).all(user.id);
  res.json(list);
});

// GET /api/users/:username/following
router.get('/:username/following', auth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  const list = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color
    FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ? ORDER BY f.created_at DESC
  `).all(user.id);
  res.json(list);
});

// POST /api/users/:username/follow
router.post('/:username/follow', auth, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'Не найден' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Нельзя подписаться на себя' });

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, target.id);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, target.id);
    const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(target.id).c;
    return res.json({ following: false, followers });
  }

  db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, target.id);

  // Notify target
  const actor = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id = ?').get(req.user.id);
  const notifResult = db.prepare(
    'INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)'
  ).run(target.id, req.user.id, 'follow');
  const notif = db.prepare(`
    SELECT n.*, u.username as actor_username, u.display_name as actor_display_name,
      u.avatar as actor_avatar, u.accent_color as actor_accent_color
    FROM notifications n JOIN users u ON u.id = n.actor_id WHERE n.id = ?
  `).get(notifResult.lastInsertRowid);
  ws.sendTo(target.id, 'notification', notif);

  const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(target.id).c;
  res.json({ following: true, followers });
});

module.exports = router;
