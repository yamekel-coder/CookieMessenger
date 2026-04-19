/**
 * Тесты для CallEngine
 */

import { CallEngine } from '../CallEngine';

// Mock WebRTC API
global.RTCPeerConnection = class {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceConnectionState = 'new';
    this.onicecandidate = null;
    this.oniceconnectionstatechange = null;
    this.ontrack = null;
  }

  async createOffer() {
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate) {
    // Mock
  }

  addTrack(track, stream) {
    return { track };
  }

  getSenders() {
    return [];
  }

  close() {
    this.iceConnectionState = 'closed';
  }

  restartIce() {
    // Mock
  }
};

global.RTCSessionDescription = class {
  constructor(desc) {
    Object.assign(this, desc);
  }
};

global.RTCIceCandidate = class {
  constructor(candidate) {
    Object.assign(this, candidate);
  }
};

// Mock MediaStream
global.MediaStream = class {
  constructor() {
    this.tracks = [];
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }

  addTrack(track) {
    this.tracks.push(track);
  }

  removeTrack(track) {
    const index = this.tracks.indexOf(track);
    if (index > -1) this.tracks.splice(index, 1);
  }
};

// Mock getUserMedia
global.navigator = {
  mediaDevices: {
    getUserMedia: async (constraints) => {
      const stream = new MediaStream();
      if (constraints.audio) {
        stream.addTrack({ kind: 'audio', enabled: true, stop: () => {} });
      }
      if (constraints.video) {
        stream.addTrack({ kind: 'video', enabled: true, stop: () => {} });
      }
      return stream;
    },
    getDisplayMedia: async () => {
      const stream = new MediaStream();
      stream.addTrack({ 
        kind: 'video', 
        enabled: true, 
        stop: () => {},
        onended: null,
      });
      return stream;
    },
  },
};

// Mock signaling adapter
class MockSignaling {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(cb => cb(data));
  }

  sendOffer() {}
  sendAnswer() {}
  sendIce() {}
  sendReject() {}
  sendHangup() {}
}

describe('CallEngine', () => {
  let engine;
  let signaling;

  beforeEach(() => {
    signaling = new MockSignaling();
    engine = new CallEngine({ signaling });
  });

  afterEach(() => {
    engine.destroy();
  });

  test('should create instance', () => {
    expect(engine).toBeDefined();
    expect(engine.connections).toBeDefined();
    expect(engine.localStream).toBeNull();
  });

  test('should start audio call', async () => {
    const peerId = 123;
    const callStartedSpy = jest.fn();
    engine.on('callStarted', callStartedSpy);

    await engine.startCall(peerId, 'audio');

    expect(callStartedSpy).toHaveBeenCalledWith({
      peerId,
      callId: expect.any(String),
      type: 'audio',
    });
    expect(engine.connections.has(peerId)).toBe(true);
    expect(engine.localStream).toBeDefined();
  });

  test('should start video call', async () => {
    const peerId = 456;
    const callStartedSpy = jest.fn();
    engine.on('callStarted', callStartedSpy);

    await engine.startCall(peerId, 'video');

    expect(callStartedSpy).toHaveBeenCalledWith({
      peerId,
      callId: expect.any(String),
      type: 'video',
    });
    expect(engine.localStream.getVideoTracks().length).toBeGreaterThan(0);
  });

  test('should answer call', async () => {
    const peerId = 789;
    const offer = { type: 'offer', sdp: 'mock-sdp' };
    const callAnsweredSpy = jest.fn();
    engine.on('callAnswered', callAnsweredSpy);

    await engine.answerCall(peerId, offer);

    expect(callAnsweredSpy).toHaveBeenCalledWith({
      peerId,
      callId: expect.any(String),
    });
    expect(engine.connections.has(peerId)).toBe(true);
  });

  test('should reject call', () => {
    const peerId = 111;
    const callRejectedSpy = jest.fn();
    engine.on('callRejected', callRejectedSpy);

    engine.rejectCall(peerId);

    expect(callRejectedSpy).toHaveBeenCalledWith({ peerId });
  });

  test('should hangup call', async () => {
    const peerId = 222;
    await engine.startCall(peerId, 'audio');

    const callEndedSpy = jest.fn();
    engine.on('callEnded', callEndedSpy);

    engine.hangup(peerId);

    expect(callEndedSpy).toHaveBeenCalledWith({ peerId });
    expect(engine.connections.has(peerId)).toBe(false);
  });

  test('should toggle microphone', async () => {
    const peerId = 333;
    await engine.startCall(peerId, 'audio');

    const micToggledSpy = jest.fn();
    engine.on('micToggled', micToggledSpy);

    const enabled1 = engine.toggleMic();
    expect(micToggledSpy).toHaveBeenCalledWith({ enabled: false });
    expect(enabled1).toBe(false);

    const enabled2 = engine.toggleMic();
    expect(micToggledSpy).toHaveBeenCalledWith({ enabled: true });
    expect(enabled2).toBe(true);
  });

  test('should toggle camera', async () => {
    const peerId = 444;
    await engine.startCall(peerId, 'video');

    const cameraToggledSpy = jest.fn();
    engine.on('cameraToggled', cameraToggledSpy);

    const enabled1 = engine.toggleCamera();
    expect(cameraToggledSpy).toHaveBeenCalledWith({ enabled: false });
    expect(enabled1).toBe(false);

    const enabled2 = engine.toggleCamera();
    expect(cameraToggledSpy).toHaveBeenCalledWith({ enabled: true });
    expect(enabled2).toBe(true);
  });

  test('should share screen', async () => {
    const peerId = 555;
    await engine.startCall(peerId, 'video');

    const screenShareStartedSpy = jest.fn();
    engine.on('screenShareStarted', screenShareStartedSpy);

    const screenTrack = await engine.shareScreen();

    expect(screenShareStartedSpy).toHaveBeenCalled();
    expect(screenTrack).toBeDefined();
    expect(screenTrack.kind).toBe('video');
  });

  test('should handle incoming call', () => {
    const incomingCallSpy = jest.fn();
    engine.on('incomingCall', incomingCallSpy);

    signaling.emit('offer', {
      from: 666,
      offer: { type: 'offer', sdp: 'mock' },
      callId: 'call-123',
      type: 'audio',
    });

    expect(incomingCallSpy).toHaveBeenCalledWith({
      from: 666,
      callId: 'call-123',
      type: 'audio',
    });
  });

  test('should handle call rejection', () => {
    const callRejectedSpy = jest.fn();
    engine.on('callRejected', callRejectedSpy);

    signaling.emit('reject', { from: 777 });

    expect(callRejectedSpy).toHaveBeenCalledWith({ peerId: 777 });
  });

  test('should handle call hangup', () => {
    const callEndedSpy = jest.fn();
    engine.on('callEnded', callEndedSpy);

    signaling.emit('hangup', { from: 888 });

    expect(callEndedSpy).toHaveBeenCalledWith({ peerId: 888 });
  });

  test('should cleanup on destroy', async () => {
    const peerId = 999;
    await engine.startCall(peerId, 'audio');

    expect(engine.connections.size).toBe(1);
    expect(engine.localStream).toBeDefined();

    engine.destroy();

    expect(engine.connections.size).toBe(0);
    expect(engine.localStream).toBeNull();
    expect(engine.signaling).toBeNull();
  });

  test('should check if in call', async () => {
    expect(engine.isInCall()).toBe(false);

    await engine.startCall(123, 'audio');
    expect(engine.isInCall()).toBe(true);

    engine.hangup();
    expect(engine.isInCall()).toBe(false);
  });

  test('should get connection state', async () => {
    const peerId = 1010;
    await engine.startCall(peerId, 'audio');

    const state = engine.getConnectionState(peerId);
    expect(state).toBe('new');
  });

  test('should throw error if no signaling', () => {
    expect(() => {
      new CallEngine({});
    }).toThrow('CallEngine requires signaling adapter');
  });

  test('should throw error if already in call with peer', async () => {
    const peerId = 1111;
    await engine.startCall(peerId, 'audio');

    await expect(engine.startCall(peerId, 'audio')).rejects.toThrow(
      'Already in call with this peer'
    );
  });
});
