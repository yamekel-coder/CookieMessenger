const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');

const router = express.Router();

function areFriends(a, b) {
  return !!db.prepare(`
    SELECT 1 FROM friendships
    WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    AND status = 'accepted'
  `).get(a, b, b, a);
}

// GET /api/messages/conversations — list of conversations
router.get('/conversations', auth, (req, res) => {
  const convos = db.prepare(`
    SELECT
      u.id, u.username, u.display_name, u.avatar, u.accent_color,
      m.content as last_message,
      m.media_type as last_media_type,
      m.created_at as last_at,
      m.sender_id as last_sender_id,
      (SELECT COUNT(*) FROM messages
       WHERE receiver_id = ? AND sender_id = u.id AND read = 0) as unread
    FROM (
      SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as partner_id,
             MAX(id) as last_id
      FROM messages WHERE sender_id = ? OR receiver_id = ?
      GROUP BY partner_id
    ) conv
    JOIN users u ON u.id = conv.partner_id
    JOIN messages m ON m.id = conv.last_id
    ORDER BY m.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  res.json(convos);
});

// GET /api/messages/unread-count
router.get('/unread-count', auth, (req, res) => {
  const count = db.prepare(
    'SELECT COUNT(*) as c FROM messages WHERE receiver_id = ? AND read = 0'
  ).get(req.user.id).c;
  res.json({ count });
});

// GET /api/messages/:userId — conversation with user
router.get('/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  if (!areFriends(req.user.id, otherId))
    return res.status(403).json({ error: 'Вы не друзья' });

  // Mark as read
  db.prepare(
    'UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ?'
  ).run(otherId, req.user.id);

  const msgs = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(req.user.id, otherId, otherId, req.user.id);

  res.json(msgs);
});

// POST /api/messages/:userId — send message
router.post('/:userId', auth, (req, res) => {
  const receiverId = parseInt(req.params.userId);
  if (!areFriends(req.user.id, receiverId))
    return res.status(403).json({ error: 'Вы не друзья' });

  const { content, media, media_type } = req.body;
  if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустое сообщение' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, content, media, media_type) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, receiverId, content?.trim() || null, media || null, media_type || null);

  const msg = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  ws.sendTo(receiverId, 'new_message', msg);
  ws.sendTo(req.user.id, 'new_message', msg);

  res.json(msg);
});

module.exports = router;
