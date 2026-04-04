import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend, wsReadyState } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff,
} from 'lucide-react';

// ── ICE servers — STUN + free TURN (metered.ca) ───────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // Free TURN servers for NAT traversal
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// ── Ringtone ──────────────────────────────────────────────────────────────────
function useRingtone() {
  const interval = useRef(null);

  const ring = useCallback(() => {
    stop();
    const play = () => {
      try {
        const c = new AudioContext();
        [0, 0.25].forEach(offset => {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.connect(gain); gain.connect(c.destination);
          osc.frequency.value = 440 + offset * 180;
          gain.gain.setValueAtTime(0.15, c.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.18);
          osc.start(c.currentTime + offset);
          osc.stop(c.currentTime + offset + 0.18);
        });
        setTimeout(() => { try { c.close(); } catch {} }, 1200);
      } catch {}
    };
    play();
    interval.current = setInterval(play, 1800);
  }, []);

  const stop = useCallback(() => {
    clearInterval(interval.current);
    interval.current = null;
  }, []);

  return { ring, stop };
}

// ── CallManager ───────────────────────────────────────────────────────────────
export default function CallManager({ currentUser }) {
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('audio');
  const [remoteUser, setRemoteUser] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callError, setCallError] = useState(null);
  const [connectionState, setConnectionState] = useState('');

  const callStateRef = useRef('idle');
  const remoteUserRef = useRef(null);
  const incomingDataRef = useRef(null);
  const iceCandidateBuffer = useRef([]); // buffer ICE candidates until remote desc is set

  const pc = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimer = useRef(null);
  const ringtone = useRingtone();

  const setCallStateSync = (s) => {
    callStateRef.current = s;
    setCallState(s);
  };

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(durationTimer.current);
    durationTimer.current = null;
    ringtone.stop();
    try { localStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { screenStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    localStream.current = null;
    screenStream.current = null;
    try { pc.current?.close(); } catch {}
    pc.current = null;
    iceCandidateBuffer.current = [];
    remoteUserRef.current = null;
    incomingDataRef.current = null;
    setCallStateSync('idle');
    setCallDuration(0);
    setConnectionState('');
    setMicOn(true); setCamOn(true); setScreenOn(false);
    setRemoteUser(null);
  }, [ringtone]);

  // ── Create PeerConnection ──────────────────────────────────────────────────
  const createPC = useCallback((targetId) => {
    if (pc.current) { try { pc.current.close(); } catch {} }
    iceCandidateBuffer.current = [];

    const conn = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    conn.onicecandidate = (e) => {
      if (e.candidate) wsSend('call_ice', targetId, { candidate: e.candidate });
    };

    conn.oniceconnectionstatechange = () => {
      setConnectionState(conn.iceConnectionState);
      if (conn.iceConnectionState === 'failed') {
        // Try ICE restart
        if (conn.restartIce) conn.restartIce();
      }
    };

    conn.onconnectionstatechange = () => {
      setConnectionState(conn.connectionState);
      if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
        const ru = remoteUserRef.current;
        const id = incomingDataRef.current;
        if (ru) wsSend('call_end', ru.id, {});
        else if (id) wsSend('call_end', id.from, {});
        cleanup();
      }
    };

    conn.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.current = conn;
    return conn;
  }, [cleanup]);

  // ── Get local media with noise suppression ────────────────────────────────
  const getMedia = useCallback(async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Для звонков требуется HTTPS. Откройте сайт по защищённому соединению.');
    }

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
      latency: 0,
    };

    const videoConstraints = type === 'video' ? {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: 'user',
    } : false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints,
    });

    localStream.current = stream;
    if (localVideoRef.current && type === 'video') {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  // ── Flush buffered ICE candidates ─────────────────────────────────────────
  const flushIceCandidates = useCallback(async () => {
    if (!pc.current || !pc.current.remoteDescription) return;
    const buf = iceCandidateBuffer.current.splice(0);
    for (const candidate of buf) {
      try { await pc.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, []);

  // ── Start call ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUser, type = 'audio') => {
    // Force cleanup any stale state before starting new call
    if (callStateRef.current !== 'idle') {
      console.log('[Call] Force cleanup stale state:', callStateRef.current);
      cleanup();
      // Wait a tick for cleanup to complete
      await new Promise(r => setTimeout(r, 100));
    }
    setCallStateSync('calling');
    setCallType(type);
    setRemoteUser(targetUser);
    remoteUserRef.current = targetUser;

    try {
      const stream = await getMedia(type);
      const conn = createPC(targetUser.id);
      stream.getTracks().forEach(t => conn.addTrack(t, stream));

      const offer = await conn.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
        voiceActivityDetection: true,
      });
      await conn.setLocalDescription(offer);

      // Send offer — only if WS is open
      const sendOffer = () => {
        wsSend('call_offer', targetUser.id, {
          offer,
          type,
          callerName: currentUser.display_name || currentUser.username,
          callerAvatar: currentUser.avatar,
          callerAccent: currentUser.accent_color,
        });
      };

      // Retry sending offer up to 5 times with 500ms interval
      let sent = false;
      let attempts = 0;
      const trySend = () => {
        if (sent || callStateRef.current !== 'calling') return;
        attempts++;
        if (wsReadyState() === 1) { // WebSocket.OPEN = 1
          sendOffer();
          sent = true;
        } else if (attempts < 10) {
          setTimeout(trySend, 500);
        } else {
          setCallError('Нет соединения. Попробуйте снова.');
          cleanup();
        }
      };
      trySend();

    } catch (err) {
      console.error('[Call] startCall error:', err);
      setCallError(err.message || 'Ошибка звонка');
      cleanup();
    }
  }, [getMedia, createPC, currentUser, cleanup]);

  // ── Answer call ────────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    const incoming = incomingDataRef.current;
    if (!incoming) return;
    ringtone.stop();
    setCallStateSync('active');

    try {
      const stream = await getMedia(incoming.type || 'audio');
      const conn = createPC(incoming.from);
      stream.getTracks().forEach(t => conn.addTrack(t, stream));

      await conn.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      await flushIceCandidates();

      const answer = await conn.createAnswer({
        voiceActivityDetection: true,
      });
      await conn.setLocalDescription(answer);

      wsSend('call_answer', incoming.from, { answer });
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('[Call] answerCall error:', err);
      setCallError('Ошибка при ответе на звонок');
      cleanup();
    }
  }, [ringtone, getMedia, createPC, flushIceCandidates, cleanup]);

  // ── Reject ─────────────────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    const incoming = incomingDataRef.current;
    if (incoming) wsSend('call_reject', incoming.from, {});
    cleanup();
  }, [cleanup]);

  // ── End call ───────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    const ru = remoteUserRef.current;
    const id = incomingDataRef.current;
    if (ru) wsSend('call_end', ru.id, {});
    else if (id) wsSend('call_end', id.from, {});
    cleanup();
  }, [cleanup]);

  // ── Toggle mic ─────────────────────────────────────────────────────────────
  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };

  // ── Toggle camera ──────────────────────────────────────────────────────────
  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  // ── Screen share ───────────────────────────────────────────────────────────
  const toggleScreen = async () => {
    if (!pc.current) return;
    if (screenOn) {
      screenStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current = null;
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        await sender?.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
        else pc.current.addTrack(screenTrack, screen);
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        screenTrack.onended = () => toggleScreen();
        setScreenOn(true);
      } catch {}
    }
  };

  // ── WS signaling ──────────────────────────────────────────────────────────
  useWebSocket({
    call_offer: (data) => {
      if (callStateRef.current !== 'idle') {
        wsSend('call_busy', data.from, {});
        return;
      }
      incomingDataRef.current = data;
      setCallType(data.type || 'audio');
      const ru = {
        id: data.from,
        display_name: data.callerName,
        avatar: data.callerAvatar,
        accent_color: data.callerAccent,
      };
      remoteUserRef.current = ru;
      setRemoteUser(ru);
      setCallStateSync('incoming');
      ringtone.ring();
    },

    call_answer: async (data) => {
      if (!pc.current) return;
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushIceCandidates();
        setCallStateSync('active');
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      } catch (err) {
        console.error('[Call] setRemoteDescription error:', err);
        cleanup();
      }
    },

    call_ice: async (data) => {
      if (!data.candidate) return;
      try {
        if (pc.current?.remoteDescription) {
          await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          // Buffer until remote description is set
          iceCandidateBuffer.current.push(data.candidate);
        }
      } catch {}
    },

    call_reject: () => { cleanup(); },
    call_end:    () => { cleanup(); },
    call_busy:   () => { cleanup(); },
  });

  // Expose startCall globally
  const startCallRef = useRef(startCall);
  useEffect(() => { startCallRef.current = startCall; }, [startCall]);
  useEffect(() => {
    window.__startCall = (...args) => startCallRef.current(...args);
    return () => { delete window.__startCall; };
  }, []);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const accent = remoteUser?.accent_color || currentUser?.accent_color || '#fff';
  const remoteName = remoteUser?.display_name || remoteUser?.username || '...';

  if (callState === 'idle' && !callError) return null;

  if (callError) return (
    <div className="call-overlay">
      <div className="call-modal call-modal--incoming">
        <p className="call-label" style={{ color: '#ff6b6b', marginBottom: 12 }}>⚠️ {callError}</p>
        <button className="call-btn call-btn--reject" onClick={() => setCallError(null)}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="call-overlay">
      {/* Incoming */}
      {callState === 'incoming' && (
        <div className="call-modal call-modal--incoming">
          <div className="call-avatar-wrap">
            <div className="call-avatar" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <p className="call-label">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок</p>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={rejectCall}><PhoneOff size={22} /></button>
            <button className="call-btn call-btn--accept" onClick={answerCall}>
              {callType === 'video' ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}

      {/* Calling */}
      {callState === 'calling' && (
        <div className="call-modal call-modal--calling">
          <div className="call-avatar-wrap">
            <div className="call-avatar call-avatar--pulse" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <p className="call-label">Вызов...</p>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={endCall}><PhoneOff size={22} /></button>
          </div>
        </div>
      )}

      {/* Active */}
      {callState === 'active' && (
        <div className="call-active">
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
          {callType === 'audio' && (
            <div className="call-audio-bg">
              <div className="call-avatar call-avatar--lg" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
                {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
              </div>
              <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
            </div>
          )}
          {(callType === 'video' || screenOn) && (
            <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
          )}
          <div className="call-hud">
            <div className="call-hud-info">
              <span className="call-hud-name" style={{ color: accent }}>{remoteName}</span>
              <span className="call-hud-timer">{fmt(callDuration)}</span>
              {connectionState && connectionState !== 'connected' && (
                <span className="call-conn-state">{
                  connectionState === 'connecting' ? '🔄 Подключение...' :
                  connectionState === 'checking' ? '🔄 Проверка...' :
                  connectionState === 'disconnected' ? '⚠️ Нестабильно' :
                  connectionState === 'failed' ? '❌ Ошибка связи' : ''
                }</span>
              )}
            </div>
            <div className="call-controls">
              <button className={`call-ctrl ${!micOn ? 'call-ctrl--off' : ''}`} onClick={toggleMic} title={micOn ? 'Выкл. микрофон' : 'Вкл. микрофон'}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              {callType === 'video' && (
                <button className={`call-ctrl ${!camOn ? 'call-ctrl--off' : ''}`} onClick={toggleCam} title={camOn ? 'Выкл. камеру' : 'Вкл. камеру'}>
                  {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              )}
              <button className={`call-ctrl ${screenOn ? 'call-ctrl--active' : ''}`} onClick={toggleScreen} title={screenOn ? 'Стоп демонстрация' : 'Демонстрация экрана'}>
                {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </button>
              <button className="call-ctrl call-ctrl--end" onClick={endCall} title="Завершить">
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
