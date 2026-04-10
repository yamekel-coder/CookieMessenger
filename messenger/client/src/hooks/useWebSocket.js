import { useEffect, useRef } from 'react';

let globalWs = null;
let globalHandlers = {};
let reconnectTimer = null;
let isConnecting = false;
let authResolved = false;
const pendingQueue = [];

async function connect() {
  const token = localStorage.getItem('token');
  if (!token) return;
  if (isConnecting) return;
  if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) return;

  isConnecting = true;
  authResolved = false;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.host;
  
  const socket = new WebSocket(`${protocol}://${host}/ws`);
  globalWs = socket;

  socket.onopen = () => {
    isConnecting = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    authResolved = false;
    socket.send(JSON.stringify({ type: 'auth', token }));
  };

  socket.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      
      if (parsed.type === 'auth_ok') {
        authResolved = true;
        setTimeout(() => {
          while (pendingQueue.length && socket.readyState === WebSocket.OPEN) {
            socket.send(pendingQueue.shift());
          }
        }, 50);
        return;
      }
      
      if (!authResolved) return;
      
      const { event, data } = parsed;
      if (!event) return;
      
      if (event.startsWith('call_') || event.startsWith('room_')) {
        console.log('[WS]', event);
      }
      
      Object.values(globalHandlers).forEach(h => h[event]?.(data));
      window.dispatchEvent(new CustomEvent(`ws_${event}`, { detail: data }));
    } catch (err) {
      console.error('[WS] Error:', err.message);
    }
  };

  socket.onclose = (e) => {
    isConnecting = false;
    globalWs = null;
    if (e.code === 4001) return;
    reconnectTimer = setTimeout(connect, 3000);
  };

  socket.onerror = () => {
    isConnecting = false;
  };
}

export function wsConnect() {
  connect();
}

export function wsReadyState() {
  return globalWs?.readyState ?? -1;
}

export function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (globalWs) { globalWs.close(4001); globalWs = null; }
  isConnecting = false;
}

export function wsSend(event, to, data) {
  const msg = JSON.stringify({ event, to, data });
  const state = globalWs?.readyState;
  
  if (state === WebSocket.OPEN) {
    globalWs.send(msg);
  } else {
    pendingQueue.push(msg);
    
    if (['call_offer', 'call_answer', 'call_ice'].includes(event)) {
      if (state === WebSocket.CONNECTING) {
        // Will be sent after connect
      } else {
        connect();
      }
    } else {
      connect();
    }
  }
}

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
