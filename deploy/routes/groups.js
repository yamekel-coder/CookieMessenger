const express = require('express');
const db = require('../db');
const ws = require('../ws');
const auth = require('../middleware/auth');
const { validateLengths, messageLimiter } = require('../middleware/security');

const router = express.Router();

function isMember(groupId, userId) {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?').get(groupId, userId);
}
function isAdmin(groupId, userId) {
  const m = db.prepare("SELECT role FROM group_members WHERE group_id=? AND user_id=?").get(groupId, userId);
  return m && (m.role === 'owner' || m.role === 'admin');
}

// ── GET /api/groups — list public groups + my groups ─────────────────────────
router.get('/', auth, (req, res) => {
  const myGroups = db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count
    FROM groups g JOIN group_members gm ON gm.group_id=g.id
    WHERE gm.user_id=? ORDER BY g.created_at DESC
  `).all(req.user.id);

  const publicGroups = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count,
      (SELECT 1 FROM group_members WHERE group_id=g.id AND user_id=?) as is_member
    FROM groups g WHERE g.type='public'
    ORDER BY member_count DESC LIMIT 50
  `).all(req.user.id);

  res.json({ myGroups, publicGroups });
});

// ── GET /api/groups/search?q= ─────────────────────────────────────────────────
router.get('/search', auth, (req, res) => {
  const q = `%${(req.query.q || '').toLowerCase()}%`;
  const groups = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count,
      (SELECT 1 FROM group_members WHERE group_id=g.id AND user_id=?) as is_member
    FROM groups g WHERE g.type='public' AND (LOWER(g.name) LIKE ? OR LOWER(g.description) LIKE ?)
    ORDER BY member_count DESC LIMIT 20
  `).all(req.user.id, q, q);
  res.json(groups);
});

// ── POST /api/groups — create group ──────────────────────────────────────────
router.post('/', auth, validateLengths({ name: 50, description: 200 }), (req, res) => {
  const { name, description, type, avatar } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  if (!['public', 'private'].includes(type)) return res.status(400).json({ error: 'Неверный тип' });

  const result = db.prepare(
    'INSERT INTO groups (name, description, avatar, type, owner_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), description || null, avatar || null, type, req.user.id);

  const groupId = result.lastInsertRowid;
  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(groupId, req.user.id, 'owner');

  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(groupId);
  res.json({ ...group, member_count: 1, role: 'owner' });

  // Broadcast new public group to all users
  if (type === 'public') {
    ws.broadcast('new_public_group', { ...group, member_count: 1 });
  }
});

// ── GET /api/groups/:id ───────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const group = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) as member_count
    FROM groups g WHERE g.id=?
  `).get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  if (group.type === 'private' && !isMember(group.id, req.user.id))
    return res.status(403).json({ error: 'Это приватная группа' });

  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.accent_color, gm.role, gm.joined_at
    FROM group_members gm JOIN users u ON u.id=gm.user_id
    WHERE gm.group_id=? ORDER BY gm.role DESC, gm.joined_at ASC
  `).all(group.id);

  const myRole = members.find(m => m.id === req.user.id)?.role || null;
  res.json({ ...group, members, myRole });
});

// ── POST /api/groups/:id/join — join public group ─────────────────────────────
router.post('/:id/join', auth, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.type === 'private') return res.status(403).json({ error: 'Группа приватная — нужно приглашение' });
  if (isMember(group.id, req.user.id)) return res.status(400).json({ error: 'Вы уже в группе' });

  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(group.id, req.user.id, 'member');

  // Notify group members
  const members = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(group.id);
  const actor = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id=?').get(req.user.id);
  members.forEach(m => {
    if (m.user_id !== req.user.id) ws.sendTo(m.user_id, 'group_member_joined', { groupId: group.id, groupName: group.name, actor });
  });

  res.json({ ok: true });
});

// ── POST /api/groups/:id/leave ────────────────────────────────────────────────
router.post('/:id/leave', auth, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.owner_id === req.user.id) return res.status(400).json({ error: 'Владелец не может покинуть группу. Удалите группу.' });

  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(group.id, req.user.id);
  res.json({ ok: true });
});

// ── DELETE /api/groups/:id — delete group (owner only) ───────────────────────
router.delete('/:id', auth, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.owner_id !== req.user.id) return res.status(403).json({ error: 'Только владелец может удалить группу' });

  db.prepare('DELETE FROM groups WHERE id=?').run(group.id);
  ws.broadcast('group_deleted', { groupId: group.id });
  res.json({ ok: true });
});

// ── PUT /api/groups/:id — edit group (owner/admin) ────────────────────────────
router.put('/:id', auth, validateLengths({ name: 50, description: 200 }), (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (!isAdmin(group.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' });

  const { name, description, avatar } = req.body;
  db.prepare('UPDATE groups SET name=?, description=?, avatar=? WHERE id=?')
    .run(name || group.name, description ?? group.description, avatar ?? group.avatar, group.id);

  res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(group.id));
});

// ── POST /api/groups/:id/invite — invite user (private groups) ───────────────
router.post('/:id/invite', auth, (req, res) => {
  const { userId } = req.body;
  const targetId = parseInt(userId);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Неверный ID пользователя' });

  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (!isMember(group.id, req.user.id)) return res.status(403).json({ error: 'Вы не в группе' });

  const target = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id=?').get(targetId);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (isMember(group.id, targetId)) return res.status(400).json({ error: 'Пользователь уже в группе' });

  // For public groups — add directly; for private — send invite
  if (group.type === 'public') {
    db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(group.id, targetId, 'member');
    ws.sendTo(targetId, 'group_invite_accepted', { groupId: group.id, groupName: group.name });
    return res.json({ ok: true, added: true });
  }

  try {
    db.prepare('INSERT INTO group_invites (group_id, inviter_id, invitee_id) VALUES (?, ?, ?)').run(group.id, req.user.id, targetId);
  } catch { return res.status(400).json({ error: 'Приглашение уже отправлено' }); }

  const inviter = db.prepare('SELECT id, username, display_name, avatar, accent_color FROM users WHERE id=?').get(req.user.id);
  ws.sendTo(targetId, 'group_invite', { groupId: group.id, groupName: group.name, groupAvatar: group.avatar, inviter });

  res.json({ ok: true, added: false });
});

// ── GET /api/groups/invites/my — my pending invites ──────────────────────────
router.get('/invites/my', auth, (req, res) => {
  const invites = db.prepare(`
    SELECT gi.id, gi.group_id, gi.created_at,
      g.name as group_name, g.avatar as group_avatar, g.type as group_type,
      u.id as inviter_id, u.username as inviter_username, u.display_name as inviter_display_name,
      u.avatar as inviter_avatar, u.accent_color as inviter_accent_color
    FROM group_invites gi
    JOIN groups g ON g.id=gi.group_id
    JOIN users u ON u.id=gi.inviter_id
    WHERE gi.invitee_id=? AND gi.status='pending'
    ORDER BY gi.created_at DESC
  `).all(req.user.id);
  res.json(invites);
});

// ── POST /api/groups/invites/:id/accept ──────────────────────────────────────
router.post('/invites/:id/accept', auth, (req, res) => {
  const invite = db.prepare('SELECT * FROM group_invites WHERE id=? AND invitee_id=?').get(req.params.id, req.user.id);
  if (!invite || invite.status !== 'pending') return res.status(404).json({ error: 'Приглашение не найдено' });

  db.prepare('UPDATE group_invites SET status=? WHERE id=?').run('accepted', invite.id);
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(invite.group_id, req.user.id, 'member');

  const group = db.prepare('SELECT name FROM groups WHERE id=?').get(invite.group_id);
  ws.sendTo(invite.inviter_id, 'group_invite_accepted', { groupId: invite.group_id, groupName: group?.name, userId: req.user.id });

  res.json({ ok: true });
});

// ── POST /api/groups/invites/:id/decline ─────────────────────────────────────
router.post('/invites/:id/decline', auth, (req, res) => {
  const invite = db.prepare('SELECT * FROM group_invites WHERE id=? AND invitee_id=?').get(req.params.id, req.user.id);
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено' });
  db.prepare('UPDATE group_invites SET status=? WHERE id=?').run('declined', invite.id);
  res.json({ ok: true });
});

// ── GET /api/groups/:id/messages ──────────────────────────────────────────────
router.get('/:id/messages', auth, (req, res) => {
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (!isMember(group.id, req.user.id)) return res.status(403).json({ error: 'Вы не в группе' });

  const msgs = db.prepare(`
    SELECT gm.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name
    FROM group_messages gm JOIN users u ON u.id=gm.sender_id
    WHERE gm.group_id=? ORDER BY gm.created_at ASC LIMIT 100
  `).all(group.id);
  res.json(msgs);
});

// ── POST /api/groups/:id/messages ─────────────────────────────────────────────
router.post('/:id/messages', auth, messageLimiter, validateLengths({ content: 2000 }), (req, res) => {
  try {
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Группа не найдена' });
    if (!isMember(group.id, req.user.id)) return res.status(403).json({ error: 'Вы не в группе' });

    const { content, media, media_type } = req.body;
    if (!content?.trim() && !media) return res.status(400).json({ error: 'Пустое сообщение' });

    const result = db.prepare(
      'INSERT INTO group_messages (group_id, sender_id, content, media, media_type) VALUES (?, ?, ?, ?, ?)'
    ).run(group.id, req.user.id, content?.trim() || null, media || null, media_type || null);

    const msg = db.prepare(`
      SELECT gm.*, u.username, u.display_name, u.avatar, u.accent_color, u.animated_name
      FROM group_messages gm JOIN users u ON u.id=gm.sender_id WHERE gm.id=?
    `).get(result.lastInsertRowid);

    const members = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(group.id);
    members.forEach(m => ws.sendTo(m.user_id, 'group_message', { groupId: group.id, message: msg }));

    res.json(msg);
  } catch (err) {
    console.error('[groups/messages]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/groups/:id/kick/:userId (admin/owner) ───────────────────────────
router.post('/:id/kick/:userId', auth, (req, res) => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Неверный ID' });
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (!isAdmin(group.id, req.user.id)) return res.status(403).json({ error: 'Нет прав' });
  if (targetId === group.owner_id) return res.status(400).json({ error: 'Нельзя кикнуть владельца' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя кикнуть себя' });

  db.prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').run(group.id, targetId);
  ws.sendTo(targetId, 'group_kicked', { groupId: group.id, groupName: group.name });
  res.json({ ok: true });
});

// ── POST /api/groups/:id/promote/:userId (owner only) ─────────────────────────
router.post('/:id/promote/:userId', auth, (req, res) => {
  const targetId = parseInt(req.params.userId);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Неверный ID' });
  const group = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.owner_id !== req.user.id) return res.status(403).json({ error: 'Только владелец' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя изменить свою роль' });

  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Неверная роль' });

  db.prepare('UPDATE group_members SET role=? WHERE group_id=? AND user_id=?').run(role, group.id, targetId);
  res.json({ ok: true });
});

module.exports = router;
