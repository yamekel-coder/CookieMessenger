import { useEffect, useRef, useCallback } from 'react';

// ── Singleton WS ──────────────────────────────────────────────────────────────
let globalWs = null;
let globalHandlers = {};
let reconnectTimer = null;
let isConnecting = false;
const pendingQueue = [];

function connect() {
  const token = localStorage.getItem('token');
  if (!token) return;
  if (isConnecting) return;
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) return;

  isConnecting = true;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Use same host+port as the page — works for both dev (vite proxy) and prod (pterodactyl/nginx)
  const host = window.location.host;
  const socket = new WebSocket(`${protocol}://${host}/ws?token=${token}`);
  globalWs = socket;

  socket.onopen = () => {
    isConnecting = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    console.log('[WS] Connected');
    while (pendingQueue.length) socket.send(pendingQueue.shift());
  };

  socket.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data);
      // 1. Dispatch to all registered hook handlers
      Object.values(globalHandlers).forEach(h => h[event]?.(data));
      // 2. Also fire DOM events for components that listen via addEventListener
      window.dispatchEvent(new CustomEvent(`ws_${event}`, { detail: data }));
    } catch {}
  };

  socket.onclose = (e) => {
    isConnecting = false;
    globalWs = null;
    if (e.code === 4001) return; // auth error — don't reconnect
    console.log('[WS] Disconnected, reconnecting in 3s...');
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
  if (globalWs?.readyState === WebSocket.OPEN) {
    console.log('[WS] Sending', event, 'to', to);
    globalWs.send(msg);
  } else {
    console.warn('[WS] Not connected, queueing', event);
    pendingQueue.push(msg);
    connect();
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
