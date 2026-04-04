const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { wsRateLimit } = require('./middleware/security');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const clients = new Map(); // userId -> Set<ws>

// Per-user WS message rate limit: max 100 messages per 10 seconds (increased for ICE candidates)
const wsMessageRate = new Map(); // userId -> { count, resetAt }

function checkWsMessageRate(userId, event) {
  // ICE candidates don't count towards rate limit (too many during call setup)
  if (event === 'call_ice') return true;
  
  const now = Date.now();
  const entry = wsMessageRate.get(userId);
  if (!entry || now > entry.resetAt) {
    wsMessageRate.set(userId, { count: 1, resetAt: now + 10_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 100; // Increased from 30 to 100
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

    let userId = null;
    let isAuthenticated = false;
    
    // Set timeout for authentication
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        console.log('[WS] Auth timeout');
        ws.close(4001, 'Authentication timeout');
      }
    }, 5000);

    ws.on('message', (raw) => {
      // Reject oversized messages - increased to 256KB for large SDP with many ICE candidates
      if (raw.length > 262144) {
        console.log(`[WS] Message too large: ${raw.length} bytes`);
        return;
      }

      try {
        const msg = JSON.parse(raw);
        
        // Handle authentication
        if (!isAuthenticated && msg.type === 'auth') {
          clearTimeout(authTimeout);
          
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET);
            userId = payload.id;
            isAuthenticated = true;
            
            if (!clients.has(userId)) clients.set(userId, new Set());
            
            // Limit concurrent connections per user (max 5 tabs)
            if (clients.get(userId).size >= 5) {
              ws.close(4002, 'Too many connections for this user');
              return;
            }
            
            clients.get(userId).add(ws);
            broadcast('user_online', { userId });
            console.log('[WS] User', userId, 'authenticated');
            
            // Send auth success
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          } catch (err) {
            console.error('[WS] Auth failed:', err.message);
            ws.close(4001, 'Invalid token');
          }
          return;
        }
        
        // Require authentication for all other messages
        if (!isAuthenticated) {
          ws.close(4001, 'Not authenticated');
          return;
        }

        // Rate limit per user (pass event for ICE exception)
        if (!checkWsMessageRate(userId, msg.event)) {
          console.log(`[WS] Rate limit exceeded for user ${userId}, event: ${msg.event}`);
          return;
        }

        // Only relay whitelisted signaling events
        if (ALLOWED_SIGNALING.has(msg.event) && msg.to && Number.isInteger(msg.to)) {
          const targetOnline = clients.has(msg.to);
          console.log(`[WS] ${msg.event} from ${userId} to ${msg.to}, target online: ${targetOnline}`);
          
          // Log answer specifically
          if (msg.event === 'call_answer') {
            console.log(`[WS] call_answer: has SDP: ${!!msg.data?.answer?.sdp}, SDP length: ${msg.data?.answer?.sdp?.length || 0}`);
          }
          
          // Log offer specifically
          if (msg.event === 'call_offer') {
            console.log(`[WS] call_offer: has SDP: ${!!msg.data?.offer?.sdp}, SDP length: ${msg.data?.offer?.sdp?.length || 0}`);
            
            const db = require('./db');
            const target = db.prepare('SELECT privacy_who_can_call FROM users WHERE id = ?').get(msg.to);
            const setting = target?.privacy_who_can_call || 'everyone';
            console.log(`[WS] call_offer: target privacy=${setting}`);
            if (setting === 'nobody') {
              console.log('[WS] blocked by privacy=nobody');
              return;
            }
            if (setting === 'friends') {
              const areFriends = !!db.prepare(`
                SELECT 1 FROM friendships
                WHERE ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))
                AND status='accepted'
              `).get(userId, msg.to, msg.to, userId);
              if (!areFriends) {
                console.log('[WS] blocked by privacy=friends, not friends');
                return;
              }
            }
          }
          
          if (!targetOnline) {
            console.log(`[WS] Target ${msg.to} is OFFLINE, cannot deliver ${msg.event}`);
          }
          
          const sent = sendTo(msg.to, msg.event, { ...msg.data, from: userId });
          console.log(`[WS] ${msg.event} ${sent ? 'delivered' : 'FAILED to deliver'} to ${msg.to}`);
        } else if (ALLOWED_SIGNALING.has(msg.event)) {
          console.log(`[WS] Invalid signaling message: event=${msg.event}, to=${msg.to}, isInteger=${Number.isInteger(msg.to)}`);
        }
      } catch (err) {
        console.error('[WS] Message handling error:', err);
      }
    });

    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId)?.delete(ws);
        if (clients.get(userId)?.size === 0) {
          clients.delete(userId);
          broadcast('user_offline', { userId });
        }
      }
    });

    ws.on('error', () => {});
  });
}

function sendTo(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const msg = JSON.stringify({ event, data });
  let sent = 0;
  ids.forEach(uid => {
    const sockets = clients.get(uid);
    if (sockets) {
      sockets.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
          sent++;
        }
      });
    }
  });
  return sent > 0;
}

function broadcast(event, data) {
  // For user_online/user_offline — respect privacy_show_online
  if (event === 'user_online' || event === 'user_offline') {
    try {
      const db = require('./db');
      const u = db.prepare('SELECT privacy_show_online FROM users WHERE id = ?').get(data.userId);
      if (u && u.privacy_show_online === 0) return; // don't broadcast if hidden
    } catch {}
  }
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
