/**
 * SignalingAdapter - Адаптер для WebSocket сигнализации
 * Связывает CallEngine с WebSocket сервером
 */

export class SignalingAdapter {
  constructor(ws) {
    this.ws = ws;
    this.listeners = new Map();
    this._setupWebSocket();
  }

  _setupWebSocket() {
    // Слушаем события от WebSocket
    const originalSend = this.ws.send;
    this.ws.send = (data) => {
      originalSend.call(this.ws, data);
    };
  }

  // Регистрация обработчиков WebSocket событий
  registerHandler(wsHandler) {
    // Передаем обработчики в useWebSocket
    return {
      call_offer: (data) => {
        this.emit('offer', {
          from: data.from,
          offer: data.offer,
          callId: data.callId,
          type: data.type,
        });
      },
      call_answer: (data) => {
        this.emit('answer', {
          from: data.from,
          answer: data.answer,
        });
      },
      call_ice: (data) => {
        this.emit('ice', {
          from: data.from,
          candidate: data.candidate,
        });
      },
      call_reject: (data) => {
        this.emit('reject', { from: data.from });
      },
      call_end: (data) => {
        this.emit('hangup', { from: data.from });
      },
      call_busy: (data) => {
        this.emit('busy', { from: data.from });
      },
    };
  }

  // Отправка сигналов
  sendOffer(peerId, offer, callId, type) {
    this._send('call_offer', peerId, { offer, callId, type });
  }

  sendAnswer(peerId, answer) {
    this._send('call_answer', peerId, { answer });
  }

  sendIce(peerId, candidate) {
    this._send('call_ice', peerId, { candidate });
  }

  sendReject(peerId) {
    this._send('call_reject', peerId, {});
  }

  sendHangup(peerId) {
    this._send('call_end', peerId, {});
  }

  _send(event, to, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, to, data }));
    }
  }

  // Event system
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error('[SignalingAdapter] Event callback error:', err);
      }
    });
  }
}

/**
 * GroupCallSignaling - Адаптер для групповых звонков
 */
export class GroupCallSignaling {
  constructor(ws) {
    this.ws = ws;
    this.listeners = new Map();
    this.roomId = null;
  }

  setRoom(roomId) {
    this.roomId = roomId;
  }

  registerHandler() {
    return {
      room_participants: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('participants', { users: data.users });
        }
      },
      room_user_joined: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('userJoined', { user: data.user });
        }
      },
      room_user_left: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('userLeft', { userId: data.userId });
        }
      },
      room_offer: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('offer', {
            from: data.from,
            offer: data.data?.offer,
          });
        }
      },
      room_answer: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('answer', {
            from: data.from,
            answer: data.data?.answer,
          });
        }
      },
      room_ice: (data) => {
        if (data.roomId === this.roomId) {
          this.emit('ice', {
            from: data.from,
            candidate: data.data?.candidate,
          });
        }
      },
    };
  }

  joinRoom(roomId, userData) {
    this.roomId = roomId;
    this._send('room_join', null, { roomId, userData });
  }

  leaveRoom() {
    if (this.roomId) {
      this._send('room_leave', null, { roomId: this.roomId });
      this.roomId = null;
    }
  }

  sendOffer(peerId, offer) {
    this._send('room_offer', peerId, {
      roomId: this.roomId,
      data: { offer },
    });
  }

  sendAnswer(peerId, answer) {
    this._send('room_answer', peerId, {
      roomId: this.roomId,
      data: { answer },
    });
  }

  sendIce(peerId, candidate) {
    this._send('room_ice', null, {
      roomId: this.roomId,
      data: { candidate },
      to: peerId,
    });
  }

  _send(event, to, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, to, ...data }));
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error('[GroupCallSignaling] Event callback error:', err);
      }
    });
  }
}
