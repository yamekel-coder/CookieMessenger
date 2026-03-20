const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { wsRateLimit } = require('./middleware/security');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const clients = new Map(); // userId -> Set<ws>

// Per-user WS message rate limit: max 30 messages per 10 seconds
const wsMessageRate = new Map(); // userId -> { count, resetAt }

function checkWsMessageRate(userId) {
  const now = Date.now();
  const entry = wsMessageRate.get(userId);
  if (!entry || now > entry.resetAt) {
    wsMessageRate.set(userId, { count: 1, resetAt: now + 10_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 30;
}

const ALLOWED_SIGNALING = new Set([
  'call_offer', 'call_answer', 'call_ice', 'call_reject', 'call_end', 'call_busy',
]);

function setup(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Rate limit WS connections per IP
    const ip = req.socket.remoteAddress || 'unknown';
    if (!wsRateLimit(ip)) {
      ws.close(4029, 'Too many connections');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    let userId = null;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.id;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (!clients.has(userId)) clients.set(userId, new Set());
    // Limit concurrent connections per user (max 5 tabs)
    if (clients.get(userId).size >= 5) {
      ws.close(4002, 'Too many connections for this user');
      return;
    }
    clients.get(userId).add(ws);
    broadcast('user_online', { userId });

    ws.on('message', (raw) => {
      // Reject oversized messages (max 64KB for signaling)
      if (raw.length > 65536) return;

      // Rate limit per user
      if (!checkWsMessageRate(userId)) return;

      try {
        const msg = JSON.parse(raw);

        // Only relay whitelisted signaling events
        if (ALLOWED_SIGNALING.has(msg.event) && msg.to && Number.isInteger(msg.to)) {
          sendTo(msg.to, msg.event, { ...msg.data, from: userId });
        }
      } catch {}
    });

    ws.on('close', () => {
      clients.get(userId)?.delete(ws);
      if (clients.get(userId)?.size === 0) {
        clients.delete(userId);
        broadcast('user_offline', { userId });
      }
    });

    ws.on('error', () => {});
  });
}

function sendTo(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const msg = JSON.stringify({ event, data });
  ids.forEach(uid => {
    clients.get(uid)?.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  });
}

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  clients.forEach(sockets => {
    sockets.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  });
}

function getOnlineUsers() {
  return [...clients.keys()];
}

module.exports = { setup, sendTo, broadcast, getOnlineUsers };
