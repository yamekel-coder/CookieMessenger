import { useEffect, useRef, useCallback } from 'react';

// ── Singleton WS ──────────────────────────────────────────────────────────────
let globalWs = null;
let globalHandlers = {};
let reconnectTimer = null;
let isConnecting = false;
const pendingQueue = [];

async function connect() {
  const token = localStorage.getItem('token');
  if (!token) return;
  if (isConnecting) return;
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) return;

  isConnecting = true;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  
  // Send token in first message instead of URL
  const socket = new WebSocket(`${protocol}://${host}/ws`);
  globalWs = socket;

  socket.onopen = () => {
    isConnecting = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    
    // Send auth token as first message
    socket.send(JSON.stringify({ type: 'auth', token }));
    
    // Send queued messages after a short delay to ensure auth is processed
    setTimeout(() => {
      while (pendingQueue.length) socket.send(pendingQueue.shift());
    }, 100);
  };

  socket.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      
      // Handle auth_ok response
      if (parsed.type === 'auth_ok') return;
      
      const { event, data } = parsed;
      if (!event) return;
      
      // 1. Dispatch to all registered hook handlers
      Object.values(globalHandlers).forEach(h => h[event]?.(data));
      // 2. Also fire DOM events for components that listen via addEventListener
      window.dispatchEvent(new CustomEvent(`ws_${event}`, { detail: data }));
    } catch (err) {
      console.error('[WS] Error:', err.message);
    }
  };

  socket.onclose = (e) => {
    isConnecting = false;
    globalWs = null;
    if (e.code === 4001) return; // auth error — don't reconnect
    reconnectTimer = setTimeout(connect, 3000);
  };

  socket.onerror = () => {
    isConnecting = false;
  };
}

// Call this once after login to start the connection
export function wsConnect() {
  connect();
}

// Get current WS readyState (for external checks)
export function wsReadyState() {
  return globalWs?.readyState ?? -1;
}

// Call this on logout
export function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (globalWs) { globalWs.close(4001); globalWs = null; }
  isConnecting = false;
}

// Send a message through the WS
export function wsSend(event, to, data) {
  const msg = JSON.stringify({ event, to, data });
  const state = globalWs?.readyState;
  
  if (state === WebSocket.OPEN) {
    globalWs.send(msg);
  } else {
    // For critical call signaling, try to reconnect immediately
    if (['call_offer', 'call_answer', 'call_ice'].includes(event)) {
      pendingQueue.push(msg);
      
      // If connecting, wait a bit
      if (state === WebSocket.CONNECTING) {
        // Already connecting
      } else {
        // Force reconnect
        connect();
      }
    } else {
      pendingQueue.push(msg);
      connect();
    }
  }
}

// Hook — registers handlers for WS events, auto-connects
export function useWebSocket(handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  useEffect(() => {
    const id = Math.random().toString(36).slice(2);
    globalHandlers[id] = new Proxy({}, {
      get: (_, prop) => (...args) => handlersRef.current[prop]?.(...args),
    });
    connect();
    return () => { delete globalHandlers[id]; };
  }, []);
}
