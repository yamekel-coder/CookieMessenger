const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/settings — get all settings
router.get('/', auth, (req, res) => {
  const user = db.prepare(`
    SELECT privacy_show_email, privacy_public_profile,
           privacy_who_can_message, privacy_who_can_call,
           privacy_who_can_add, privacy_show_online,
           notif_messages, notif_mentions, notif_updates, email, username
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  res.json(user);
});

// PUT /api/settings/privacy
router.put('/privacy', auth, (req, res) => {
  const {
    privacy_show_email, privacy_public_profile,
    privacy_who_can_message, privacy_who_can_call,
    privacy_who_can_add, privacy_show_online,
  } = req.body;

  const allowed = ['friends', 'everyone', 'nobody'];
  const allowedAdd = ['everyone', 'nobody'];
  if (privacy_who_can_message && !allowed.includes(privacy_who_can_message))
    return res.status(400).json({ error: 'Неверное значение' });
  if (privacy_who_can_call && !allowed.includes(privacy_who_can_call))
    return res.status(400).json({ error: 'Неверное значение' });
  if (privacy_who_can_add && !allowedAdd.includes(privacy_who_can_add))
    return res.status(400).json({ error: 'Неверное значение' });

  db.prepare(`
    UPDATE users SET
      privacy_show_email = ?,
      privacy_public_profile = ?,
      privacy_who_can_message = ?,
      privacy_who_can_call = ?,
      privacy_who_can_add = ?,
      privacy_show_online = ?
    WHERE id = ?
  `).run(
    privacy_show_email ? 1 : 0,
    privacy_public_profile ? 1 : 0,
    privacy_who_can_message || 'friends',
    privacy_who_can_call || 'friends',
    privacy_who_can_add || 'everyone',
    privacy_show_online !== undefined ? (privacy_show_online ? 1 : 0) : 1,
    req.user.id
  );
  res.json({ ok: true });
});

// PUT /api/settings/notifications
router.put('/notifications', auth, (req, res) => {
  const { notif_messages, notif_mentions, notif_updates } = req.body;
  db.prepare(`
    UPDATE users SET notif_messages = ?, notif_mentions = ?, notif_updates = ? WHERE id = ?
  `).run(notif_messages ? 1 : 0, notif_mentions ? 1 : 0, notif_updates ? 1 : 0, req.user.id);
  res.json({ ok: true });
});

// PUT /api/settings/change-email
router.put('/change-email', auth, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Неверный формат email' });
  if (email.length > 254) return res.status(400).json({ error: 'Email слишком длинный' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный пароль' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
  if (exists) return res.status(409).json({ error: 'Email уже занят' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.user.id);
  res.json({ ok: true, email });
});

// PUT /api/settings/change-username
router.put('/change-username', auth, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: 'Username: 3-20 символов, только буквы, цифры и _' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный пароль' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
  if (exists) return res.status(409).json({ error: 'Username уже занят' });

  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
  res.json({ ok: true, username });
});

// PUT /api/settings/change-password
router.put('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Заполните все поля' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Минимум 8 символов' });
  if (new_password.length > 128) return res.status(400).json({ error: 'Пароль слишком длинный' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный текущий пароль' });

  const hashed = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ ok: true });
});

// DELETE /api/settings/delete-account
router.delete('/delete-account', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Введите пароль' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Неверный пароль' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
