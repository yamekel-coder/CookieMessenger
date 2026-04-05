const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');
const { validateLengths } = require('../middleware/security');

const router = express.Router();

// Per-user cooldown: 1 message per 500ms (more reasonable for chat)
const msgCooldown = new Map();
function checkMsgCooldown(userId) {
  const now = Date.now();
  const last = msgCooldown.get(userId) || 0;
  if (now - last < 500) return false;
  msgCooldown.set(userId, now);
  return true;
}

function areFriends(a, b) {
  return !!db.prepare(`
    SELECT 1 FROM friendships
    WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
    AND status = 'accepted'
  `).get(a, b, b, a);
}

function canMessage(senderId, receiverId) {
  const receiver = db.prepare('SELECT privacy_who_can_message FROM users WHERE id = ?').get(receiverId);
  if (!receiver) return { ok: false, error: 'Пользователь не найден', status: 404 };
  const setting = receiver.privacy_who_can_message || 'everyone'; // Changed default to 'everyone'
  if (setting === 'nobody') return { ok: false, error: 'Этот пользователь не принимает сообщения', status: 403 };
  if (setting === 'friends' && !areFriends(senderId, receiverId))
    return { ok: false, error: 'Этот пользователь принимает сообщения только от друзей', status: 403 };
  return { ok: true };
}

// GET /api/messages/conversations
router.get('/conversations', auth, (req, res) => {
  const convos = db.prepare(`
    SELECT
      u.id, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name,
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

// GET /api/messages/:userId — load conversation
router.get('/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  if (isNaN(otherId)) return res.status(400).json({ error: 'Неверный ID' });

  // Allow reading if they have existing messages OR are friends OR privacy allows
  const check = canMessage(req.user.id, otherId);
  const hasHistory = !!db.prepare(
    'SELECT 1 FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) LIMIT 1'
  ).get(req.user.id, otherId, otherId, req.user.id);

  if (!check.ok && !hasHistory)
    return res.status(check.status).json({ error: check.error });

  db.prepare('UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ?').run(otherId, req.user.id);

  // Notify sender that messages were read
  ws.sendTo(otherId, 'read_update', { readerId: req.user.id });

  const msgs = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC LIMIT 100
  `).all(req.user.id, otherId, otherId, req.user.id);

  res.json(msgs);
});

// POST /api/messages/:userId — send message
router.post('/:userId', auth, validateLengths({ content: 2000 }), (req, res) => {
  const receiverId = parseInt(req.params.userId);
  if (isNaN(receiverId)) return res.status(400).json({ error: 'Неверный ID' });
  if (receiverId === req.user.id) return res.status(400).json({ error: 'Нельзя писать себе' });

  const check = canMessage(req.user.id, receiverId);
  if (!check.ok) return res.status(check.status).json({ error: check.error });

  if (!checkMsgCooldown(req.user.id))
    return res.status(429).json({ error: 'Слишком быстро. Подождите секунду.' });

  const { content, media, media_type } = req.body;
  if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустое сообщение' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, content, media, media_type) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, receiverId, content?.trim() || null, media || null, media_type || null);

  const msg = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name
    FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?
  `).get(result.lastInsertRowid);

  ws.sendTo(receiverId, 'new_message', msg);
  ws.sendTo(req.user.id, 'new_message', msg);

  res.json(msg);
});

module.exports = router;
