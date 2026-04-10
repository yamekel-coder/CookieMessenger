const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/rooms', auth, (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT cr.*, 
             u.display_name as owner_name, u.avatar as owner_avatar, u.accent_color as owner_color,
             g.name as group_name,
             (SELECT COUNT(*) FROM call_room_participants WHERE room_id = cr.id) as participant_count
      FROM call_rooms cr
      JOIN users u ON cr.owner_id = u.id
      LEFT JOIN groups g ON cr.group_id = g.id
      WHERE cr.group_id IS NULL
      ORDER BY cr.created_at DESC
      LIMIT 50
    `).all();
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rooms/group/:groupId', auth, (req, res) => {
  try {
    const rooms = db.prepare(`
      SELECT cr.*, 
             u.display_name as owner_name, u.avatar as owner_avatar, u.accent_color as owner_color,
             (SELECT COUNT(*) FROM call_room_participants WHERE room_id = cr.id) as participant_count
      FROM call_rooms cr
      JOIN users u ON cr.owner_id = u.id
      WHERE cr.group_id = ?
      ORDER BY cr.created_at DESC
    `).all(req.params.groupId);
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/rooms/:roomId', auth, (req, res) => {
  try {
    const room = db.prepare(`
      SELECT cr.*, 
             u.display_name as owner_name, u.avatar as owner_avatar, u.accent_color as owner_color,
             g.name as group_name, g.avatar as group_avatar
      FROM call_rooms cr
      JOIN users u ON cr.owner_id = u.id
      LEFT JOIN groups g ON cr.group_id = g.id
      WHERE cr.id = ?
    `).get(req.params.roomId);
    
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    const participants = db.prepare(`
      SELECT u.id, u.display_name, u.avatar, u.accent_color, u.username
      FROM call_room_participants crp
      JOIN users u ON crp.user_id = u.id
      WHERE crp.room_id = ?
    `).all(req.params.roomId);
    
    res.json({ ...room, participants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/rooms', auth, (req, res) => {
  try {
    const { name, group_id, channel_id, type = 'audio' } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (name.length > 50) return res.status(400).json({ error: 'Name too long' });
    if (!['audio', 'video'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    
    if (group_id) {
      const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(group_id, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });
    }
    
    const result = db.prepare(`
      INSERT INTO call_rooms (name, group_id, channel_id, type, owner_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, group_id || null, channel_id || null, type, req.user.id);
    
    const room = db.prepare('SELECT * FROM call_rooms WHERE id = ?').get(result.lastInsertRowid);
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/rooms/:roomId/join', auth, (req, res) => {
  try {
    const room = db.prepare('SELECT * FROM call_rooms WHERE id = ?').get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    if (room.group_id) {
      const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(room.group_id, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });
    }
    
    const existing = db.prepare('SELECT 1 FROM call_room_participants WHERE room_id = ? AND user_id = ?').get(req.params.roomId, req.user.id);
    if (!existing) {
      db.prepare('INSERT INTO call_room_participants (room_id, user_id) VALUES (?, ?)').run(req.params.roomId, req.user.id);
    }
    
    const user = db.prepare('SELECT id, display_name, avatar, accent_color, username FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/rooms/:roomId/leave', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM call_room_participants WHERE room_id = ? AND user_id = ?').run(req.params.roomId, req.user.id);
    
    const count = db.prepare('SELECT COUNT(*) as c FROM call_room_participants WHERE room_id = ?').get(req.params.roomId);
    if (count.c === 0) {
      db.prepare('DELETE FROM call_rooms WHERE id = ?').run(req.params.roomId);
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/rooms/:roomId', auth, (req, res) => {
  try {
    const room = db.prepare('SELECT * FROM call_rooms WHERE id = ?').get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner_id !== req.user.id) return res.status(403).json({ error: 'Not the owner' });
    
    db.prepare('DELETE FROM call_rooms WHERE id = ?').run(req.params.roomId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/rooms/:roomId/kick/:userId', auth, (req, res) => {
  try {
    const room = db.prepare('SELECT * FROM call_rooms WHERE id = ?').get(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.owner_id !== req.user.id && parseInt(req.params.userId) !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    
    db.prepare('DELETE FROM call_room_participants WHERE room_id = ? AND user_id = ?').run(req.params.roomId, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
