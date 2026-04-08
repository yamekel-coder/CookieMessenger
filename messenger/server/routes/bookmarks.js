const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/bookmarks
router.get('/', auth, (req, res) => {
  const bookmarks = db.prepare(`
    SELECT b.id as bookmark_id, b.created_at as bookmarked_at,
      p.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name, u.verified
    FROM bookmarks b
    JOIN posts p ON p.id = b.post_id
    JOIN users u ON u.id = p.user_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);

  // Enrich with likes/comments
  const enriched = bookmarks.map(post => {
    const likes = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(post.id).c;
    const liked = !!db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user.id);
    const commentsCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE post_id = ?').get(post.id).c;
    return { ...post, likes, liked, commentsCount };
  });

  res.json(enriched);
});

// POST /api/bookmarks/:postId — toggle bookmark
router.post('/:postId', auth, (req, res) => {
  const postId = parseInt(req.params.postId);
  if (isNaN(postId)) return res.status(400).json({ error: 'Неверный ID' });

  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });

  const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?').get(req.user.id, postId);
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').run(req.user.id, postId);
    return res.json({ bookmarked: false });
  }
  db.prepare('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)').run(req.user.id, postId);
  res.json({ bookmarked: true });
});

module.exports = router;
