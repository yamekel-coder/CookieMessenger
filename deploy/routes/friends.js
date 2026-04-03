const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();

function friendStatus(myId, otherId) {
  const f = db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).get(myId, otherId, otherId, myId);
  if (!f) return null;
  return { status: f.status, isMine: f.requester_id === myId, id: f.id };
}

// GET /api/friends/search?q=
router.get('/search', auth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const users = db.prepare(`
    SELECT id, username, display_name, avatar, accent_color, bio
    FROM users
    WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
    LIMIT 20
  `).all(req.user.id, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);

  const result = users.map(u => ({ ...u, friendship: friendStatus(req.user.id, u.id) }));
  res.json(result);
});

// GET /api/friends — my friends list
router.get('/', auth, (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color, u.bio
    FROM friendships f
    JOIN users u ON u.id = CASE
      WHEN f.requester_id = ? THEN f.addressee_id
      ELSE f.requester_id
    END
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY u.display_name, u.username
  `).all(req.user.id, req.user.id, req.user.id);
  res.json(friends);
});

// GET /api/friends/requests — incoming pending requests
router.get('/requests', auth, (req, res) => {
  const requests = db.prepare(`
    SELECT f.id as friendship_id, f.created_at,
      u.id, u.username, u.display_name, u.avatar, u.accent_color, u.bio
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(requests);
});

// POST /api/friends/request/:userId
router.post('/request/:userId', auth, (req, res) => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Неверный ID' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя добавить себя' });

  // Verify target user exists
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const existing = friendStatus(req.user.id, targetId);
  if (existing) return res.status(400).json({ error: 'Заявка уже существует' });

  db.prepare(
    'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)'
  ).run(req.user.id, targetId, 'pending');

  // Notify target
  const actor = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id = ?').get(req.user.id);
  ws.sendTo(targetId, 'friend_request', { actor });

  res.json({ ok: true });
});

// POST /api/friends/accept/:friendshipId
router.post('/accept/:friendshipId', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.friendshipId);
  if (!f || f.addressee_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run('accepted', f.id);

  const me = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id = ?').get(req.user.id);
  ws.sendTo(f.requester_id, 'friend_accepted', { actor: me });

  res.json({ ok: true });
});

// POST /api/friends/decline/:friendshipId
router.post('/decline/:friendshipId', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.friendshipId);
  if (!f || (f.addressee_id !== req.user.id && f.requester_id !== req.user.id))
    return res.status(403).json({ error: 'Нет доступа' });

  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

// DELETE /api/friends/:userId — remove friend
router.delete('/:userId', auth, (req, res) => {
  db.prepare(`
    DELETE FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).run(req.user.id, req.params.userId, req.params.userId, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
