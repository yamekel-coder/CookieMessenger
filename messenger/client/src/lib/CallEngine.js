/**
 * CallEngine - Библиотека для управления аудио/видео звонками
 * Поддерживает P2P и групповые звонки через WebRTC
 */

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:a.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

class CallConnection {
  constructor(peerId, config, signaling) {
    this.peerId = peerId;
    this.pc = new RTCPeerConnection(config);
    this.signaling = signaling;
    this.state = 'new';
    this.retries = 0;
    this.maxRetries = 3;
    this.pendingIce = [];
    
    this._setupHandlers();
  }

  _setupHandlers() {
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.sendIce(this.peerId, e.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this.state = this.pc.iceConnectionState;
      this.signaling.emit('connectionStateChange', { peerId: this.peerId, state: this.state });
      
      if (this.state === 'failed' && this.retries < this.maxRetries) {
        this.retries++;
        this.pc.restartIce?.();
      }
    };

    this.pc.ontrack = (e) => {
      this.signaling.emit('remoteTrack', { peerId: this.peerId, track: e.track, streams: e.streams });
    };
  }

  addTrack(track, stream) {
    return this.pc.addTrack(track, stream);
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    
    // Apply pending ICE candidates
    for (const candidate of this.pendingIce) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[CallConnection] ICE candidate error:', err);
      }
    }
    this.pendingIce = [];
  }

  async addIceCandidate(candidate) {
    if (this.pc.remoteDescription) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[CallConnection] ICE candidate error:', err);
      }
    } else {
      this.pendingIce.push(candidate);
    }
  }

  close() {
    this.pc.close();
    this.state = 'closed';
  }
}

export class CallEngine {
  constructor(options = {}) {
    this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
    this.signaling = options.signaling;
    this.connections = new Map();
    this.localStream = null;
    this.listeners = new Map();
    this.currentCallId = null;
    this.callType = 'audio';
    
    if (!this.signaling) {
      throw new Error('CallEngine requires signaling adapter');
    }
    
    this._setupSignaling();
  }

  _setupSignaling() {
    this.signaling.on('offer', async ({ from, offer, callId, type }) => {
      this.currentCallId = callId;
      this.callType = type || 'audio';
      this.emit('incomingCall', { from, callId, type: this.callType });
    });

    this.signaling.on('answer', async ({ from, answer }) => {
      const conn = this.connections.get(from);
      if (conn) {
        await conn.setRemoteDescription(answer);
        this.emit('callConnected', { peerId: from });
      }
    });

    this.signaling.on('ice', async ({ from, candidate }) => {
      const conn = this.connections.get(from);
      if (conn) {
        await conn.addIceCandidate(candidate);
      }
    });

    this.signaling.on('hangup', ({ from }) => {
      this._removeConnection(from);
      this.emit('callEnded', { peerId: from });
    });

    this.signaling.on('reject', ({ from }) => {
      this._removeConnection(from);
      this.emit('callRejected', { peerId: from });
    });

    this.signaling.on('busy', ({ from }) => {
      this._removeConnection(from);
      this.emit('callBusy', { peerId: from });
    });
  }

  async startCall(peerId, type = 'audio') {
    if (this.connections.has(peerId)) {
      throw new Error('Already in call with this peer');
    }

    this.callType = type;
    this.currentCallId = `call_${Date.now()}_${peerId}`;
    
    // Get local media
    await this._initLocalStream(type);
    
    // Create connection
    const conn = this._createConnection(peerId);
    
    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        conn.addTrack(track, this.localStream);
      });
    }
    
    // Create and send offer
    const offer = await conn.createOffer();
    this.signaling.sendOffer(peerId, offer, this.currentCallId, type);
    
    this.emit('callStarted', { peerId, callId: this.currentCallId, type });
  }

  async answerCall(peerId, offer) {
    if (this.connections.has(peerId)) {
      throw new Error('Already in call with this peer');
    }

    // Get local media
    await this._initLocalStream(this.callType);
    
    // Create connection
    const conn = this._createConnection(peerId);
    
    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        conn.addTrack(track, this.localStream);
      });
    }
    
    // Set remote description and create answer
    await conn.setRemoteDescription(offer);
    const answer = await conn.createAnswer();
    this.signaling.sendAnswer(peerId, answer);
    
    this.emit('callAnswered', { peerId, callId: this.currentCallId });
  }

  rejectCall(peerId) {
    this.signaling.sendReject(peerId);
    this._removeConnection(peerId);
    this.emit('callRejected', { peerId });
  }

  hangup(peerId = null) {
    if (peerId) {
      this.signaling.sendHangup(peerId);
      this._removeConnection(peerId);
    } else {
      // Hangup all
      this.connections.forEach((_, id) => {
        this.signaling.sendHangup(id);
      });
      this._cleanup();
    }
    
    this.emit('callEnded', { peerId });
  }

  toggleMic() {
    if (!this.localStream) return false;
    
    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    
    const enabled = audioTracks[0]?.enabled ?? false;
    this.emit('micToggled', { enabled });
    return enabled;
  }

  toggleCamera() {
    if (!this.localStream) return false;
    
    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    
    const enabled = videoTracks[0]?.enabled ?? false;
    this.emit('cameraToggled', { enabled });
    return enabled;
  }

  async switchCamera() {
    if (!this.localStream || this.callType !== 'video') return;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    const currentFacingMode = videoTrack.getSettings().facingMode;
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    
    // Stop current track
    videoTrack.stop();
    
    // Get new stream
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: newFacingMode },
    });
    
    const newTrack = newStream.getVideoTracks()[0];
    
    // Replace track in all connections
    this.connections.forEach(conn => {
      const sender = conn.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack);
      }
    });
    
    // Update local stream
    this.localStream.removeTrack(videoTrack);
    this.localStream.addTrack(newTrack);
    
    this.emit('cameraSwitched', { facingMode: newFacingMode });
  }

  async shareScreen() {
    if (!this.localStream) return;
    
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Replace video track in all connections
      this.connections.forEach(conn => {
        const sender = conn.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });
      
      screenTrack.onended = () => {
        this.stopScreenShare();
      };
      
      this.emit('screenShareStarted');
      return screenTrack;
    } catch (err) {
      this.emit('error', { message: 'Failed to share screen', error: err });
      throw err;
    }
  }

  async stopScreenShare() {
    if (!this.localStream) return;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    // Replace back to camera
    this.connections.forEach(conn => {
      const sender = conn.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }
    });
    
    this.emit('screenShareStopped');
  }

  getConnectionState(peerId) {
    const conn = this.connections.get(peerId);
    return conn ? conn.state : 'closed';
  }

  getLocalStream() {
    return this.localStream;
  }

  isInCall() {
    return this.connections.size > 0;
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
        console.error('[CallEngine] Event callback error:', err);
      }
    });
  }

  // Private methods
  _createConnection(peerId) {
    const config = { iceServers: this.iceServers };
    const conn = new CallConnection(peerId, config, this.signaling);
    this.connections.set(peerId, conn);
    return conn;
  }

  _removeConnection(peerId) {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.close();
      this.connections.delete(peerId);
    }
  }

  async _initLocalStream(type) {
    if (this.localStream) {
      // Check if we need to add video
      if (type === 'video' && this.localStream.getVideoTracks().length === 0) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoStream.getVideoTracks().forEach(track => {
          this.localStream.addTrack(track);
        });
      }
      return;
    }

    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video' ? { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.emit('localStreamReady', { stream: this.localStream });
  }

  _cleanup() {
    // Close all connections
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.currentCallId = null;
  }

  destroy() {
    this._cleanup();
    this.listeners.clear();
    this.signaling = null;
  }
}
