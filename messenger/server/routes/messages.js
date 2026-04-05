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
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name,
      r.content as reply_content, r.sender_id as reply_sender_id,
      ru.display_name as reply_display_name, ru.username as reply_username
    FROM messages m JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.sender_id
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

  const { content, media, media_type, reply_to_id } = req.body;
  if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустое сообщение' });

  // Validate reply_to_id belongs to this conversation
  let replyId = null;
  if (reply_to_id) {
    const replyMsg = db.prepare('SELECT id FROM messages WHERE id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))').get(reply_to_id, req.user.id, receiverId, receiverId, req.user.id);
    if (replyMsg) replyId = replyMsg.id;
  }

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, content, media, media_type, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, receiverId, content?.trim() || null, media || null, media_type || null, replyId);

  const msg = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name,
      r.content as reply_content, r.sender_id as reply_sender_id,
      ru.display_name as reply_display_name, ru.username as reply_username
    FROM messages m JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN users ru ON ru.id = r.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  ws.sendTo(receiverId, 'new_message', msg);
  ws.sendTo(req.user.id, 'new_message', msg);

  res.json(msg);
});

// PUT /api/messages/:msgId — edit message
router.put('/:msgId', auth, validateLengths({ content: 2000 }), (req, res) => {
  const msgId = parseInt(req.params.msgId);
  if (isNaN(msgId)) return res.status(400).json({ error: 'Неверный ID' });

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Нельзя редактировать чужое сообщение' });
  if (msg.deleted) return res.status(400).json({ error: 'Сообщение удалено' });

  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });

  db.prepare('UPDATE messages SET content = ?, edited = 1 WHERE id = ?').run(content.trim(), msgId);

  const updated = { ...msg, content: content.trim(), edited: 1 };
  ws.sendTo(msg.receiver_id, 'message_edited', { msgId, content: content.trim() });
  ws.sendTo(msg.sender_id, 'message_edited', { msgId, content: content.trim() });

  res.json(updated);
});

// DELETE /api/messages/:msgId — delete message
router.delete('/:msgId', auth, (req, res) => {
  const msgId = parseInt(req.params.msgId);
  if (isNaN(msgId)) return res.status(400).json({ error: 'Неверный ID' });

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (msg.sender_id !== req.user.id) return res.status(403).json({ error: 'Нельзя удалить чужое сообщение' });

  db.prepare('UPDATE messages SET deleted = 1, content = NULL, media = NULL WHERE id = ?').run(msgId);

  ws.sendTo(msg.receiver_id, 'message_deleted', { msgId });
  ws.sendTo(msg.sender_id, 'message_deleted', { msgId });

  res.json({ ok: true });
});

module.exports = router;
