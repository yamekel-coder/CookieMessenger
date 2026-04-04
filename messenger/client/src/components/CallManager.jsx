import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend, wsReadyState } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff,
} from 'lucide-react';

// ── ICE servers ───────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN servers
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
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
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
  const iceCandidateBuffer = useRef([]);

  const pc = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimer = useRef(null);
  const callTimeout = useRef(null);
  const ringtone = useRingtone();

  const setCallStateSync = useCallback((s) => {
    console.log('[Call] State:', callStateRef.current, '->', s);
    callStateRef.current = s;
    setCallState(s);
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    console.log('[Call] Cleanup');
    if (durationTimer.current) clearInterval(durationTimer.current);
    if (callTimeout.current) clearTimeout(callTimeout.current);
    durationTimer.current = null;
    callTimeout.current = null;
    ringtone.stop();
    
    try { localStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { screenStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    localStream.current = null;
    screenStream.current = null;
    
    if (pc.current) {
      try { pc.current.close(); } catch {}
      pc.current = null;
    }
    
    iceCandidateBuffer.current = [];
    remoteUserRef.current = null;
    incomingDataRef.current = null;
    
    setCallStateSync('idle');
    setCallDuration(0);
    setConnectionState('');
    setMicOn(true);
    setCamOn(true);
    setScreenOn(false);
    setRemoteUser(null);
  }, [ringtone, setCallStateSync]);

  // ── Create PeerConnection ──────────────────────────────────────────────────
  const createPC = useCallback((targetId) => {
    console.log('[Call] Creating PeerConnection for', targetId);
    if (pc.current) {
      try { pc.current.close(); } catch {}
    }
    iceCandidateBuffer.current = [];

    const conn = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('[Call] Sending ICE candidate');
        wsSend('call_ice', targetId, { candidate: e.candidate });
      }
    };

    conn.oniceconnectionstatechange = () => {
      console.log('[Call] ICE state:', conn.iceConnectionState);
      setConnectionState(conn.iceConnectionState);
      if (conn.iceConnectionState === 'failed' && conn.restartIce) {
        console.log('[Call] ICE failed, restarting');
        conn.restartIce();
      }
    };

    conn.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', conn.connectionState);
      setConnectionState(conn.connectionState);
      if (['failed', 'closed'].includes(conn.connectionState)) {
        console.log('[Call] Connection failed/closed, ending call');
        const ru = remoteUserRef.current;
        const id = incomingDataRef.current;
        if (ru) wsSend('call_end', ru.id, {});
        else if (id) wsSend('call_end', id.from, {});
        setTimeout(cleanup, 100);
      }
    };

    conn.ontrack = (e) => {
      console.log('[Call] Received remote track');
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.current = conn;
    return conn;
  }, [cleanup]);

  // ── Get local media ────────────────────────────────────────────────────────
  const getMedia = useCallback(async (type) => {
    console.log('[Call] Getting media, type:', type);
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Для звонков требуется HTTPS');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video' ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      } : false,
    });

    // Verify audio track is active
    const audioTracks = stream.getAudioTracks();
    console.log('[Call] Audio tracks:', audioTracks.length, audioTracks.map(t => ({
      id: t.id,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState,
    })));

    localStream.current = stream;
    if (localVideoRef.current && type === 'video') {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  // ── Flush ICE candidates ───────────────────────────────────────────────────
  const flushIceCandidates = useCallback(async () => {
    if (!pc.current?.remoteDescription) return;
    const buf = iceCandidateBuffer.current.splice(0);
    console.log('[Call] Flushing', buf.length, 'ICE candidates');
    for (const candidate of buf) {
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[Call] Failed to add ICE candidate:', err);
      }
    }
  }, []);

  // ── Start call ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUser, type = 'audio') => {
    console.log('[Call] Starting call to', targetUser.username, 'type:', type);
    console.log('[Call] WebSocket readyState:', wsReadyState());
    
    // Check if already in call
    if (callStateRef.current !== 'idle') {
      console.log('[Call] Already in call, cleaning up first');
      cleanup();
      await new Promise(r => setTimeout(r, 200));
    }

    // Check WebSocket - allow CONNECTING state too
    const wsState = wsReadyState();
    if (wsState !== 1 && wsState !== 0) {
      console.error('[Call] WebSocket not ready, state:', wsState);
      setCallError('Нет соединения');
      return;
    }
    
    // If connecting, wait a bit
    if (wsState === 0) {
      console.log('[Call] WebSocket connecting, waiting...');
      await new Promise(r => setTimeout(r, 500));
      if (wsReadyState() !== 1) {
        console.error('[Call] WebSocket still not ready after wait');
        setCallError('Нет соединения');
        return;
      }
    }

    setCallStateSync('calling');
    setCallType(type);
    setRemoteUser(targetUser);
    remoteUserRef.current = targetUser;

    try {
      const stream = await getMedia(type);
      const conn = createPC(targetUser.id);
      
      // Add tracks and verify they're added
      const senders = [];
      stream.getTracks().forEach(t => {
        console.log('[Call] Adding track:', t.kind, t.id, 'enabled:', t.enabled);
        const sender = conn.addTrack(t, stream);
        senders.push(sender);
      });
      console.log('[Call] Added', senders.length, 'tracks to PeerConnection');

      const offer = await conn.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
      });
      await conn.setLocalDescription(offer);

      console.log('[Call] Sending offer');
      wsSend('call_offer', targetUser.id, {
        offer,
        type,
        callerName: currentUser.display_name || currentUser.username,
        callerAvatar: currentUser.avatar,
        callerAccent: currentUser.accent_color,
      });

      // Timeout
      callTimeout.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          console.log('[Call] No answer timeout');
          setCallError('Нет ответа');
          cleanup();
        }
      }, 30000);

    } catch (err) {
      console.error('[Call] Start call error:', err);
      setCallError(err.message || 'Ошибка звонка');
      cleanup();
    }
  }, [getMedia, createPC, currentUser, cleanup, setCallStateSync]);

  // ── Answer call ────────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    const incoming = incomingDataRef.current;
    if (!incoming) return;
    
    console.log('[Call] Answering call from', incoming.from);
    if (callTimeout.current) clearTimeout(callTimeout.current);
    ringtone.stop();
    setCallStateSync('active');

    try {
      const stream = await getMedia(incoming.type || 'audio');
      const conn = createPC(incoming.from);
      
      // Add tracks and verify they're added
      const senders = [];
      stream.getTracks().forEach(t => {
        console.log('[Call] Adding track:', t.kind, t.id, 'enabled:', t.enabled);
        const sender = conn.addTrack(t, stream);
        senders.push(sender);
      });
      console.log('[Call] Added', senders.length, 'tracks to PeerConnection');

      console.log('[Call] Setting remote description');
      await conn.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      await flushIceCandidates();

      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);

      console.log('[Call] Sending answer');
      wsSend('call_answer', incoming.from, { answer });
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('[Call] Answer error:', err);
      setCallError(err.message || 'Ошибка ответа');
      cleanup();
    }
  }, [ringtone, getMedia, createPC, flushIceCandidates, cleanup, setCallStateSync]);

  // ── Reject ─────────────────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    console.log('[Call] Rejecting call');
    const incoming = incomingDataRef.current;
    if (incoming) wsSend('call_reject', incoming.from, {});
    cleanup();
  }, [cleanup]);

  // ── End call ───────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    console.log('[Call] Ending call');
    const ru = remoteUserRef.current;
    const id = incomingDataRef.current;
    if (ru) wsSend('call_end', ru.id, {});
    else if (id) wsSend('call_end', id.from, {});
    cleanup();
  }, [cleanup]);

  // ── Toggle controls ────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  }, []);

  const toggleCam = useCallback(() => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  }, []);

  const toggleScreen = useCallback(async () => {
    if (!pc.current) return;
    if (screenOn) {
      screenStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current = null;
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
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
  }, [screenOn]);

  // ── WebSocket handlers ─────────────────────────────────────────────────────
  useWebSocket({
    call_offer: useCallback((data) => {
      console.log('[Call] Received offer from', data.from);
      if (callStateRef.current !== 'idle') {
        console.log('[Call] Busy, sending busy signal');
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

      callTimeout.current = setTimeout(() => {
        if (callStateRef.current === 'incoming') {
          console.log('[Call] Incoming timeout');
          wsSend('call_reject', data.from, {});
          cleanup();
        }
      }, 45000);
    }, [ringtone, cleanup, setCallStateSync]),

    call_answer: useCallback(async (data) => {
      console.log('[Call] Received answer');
      if (!pc.current) return;
      if (callTimeout.current) clearTimeout(callTimeout.current);
      
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushIceCandidates();
        setCallStateSync('active');
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      } catch (err) {
        console.error('[Call] Answer processing error:', err);
        setCallError('Ошибка соединения');
        cleanup();
      }
    }, [flushIceCandidates, cleanup, setCallStateSync]),

    call_ice: useCallback(async (data) => {
      if (!data.candidate) return;
      console.log('[Call] Received ICE candidate');
      try {
        if (pc.current?.remoteDescription) {
          await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          iceCandidateBuffer.current.push(data.candidate);
        }
      } catch (err) {
        console.error('[Call] ICE error:', err);
      }
    }, []),

    call_reject: useCallback(() => {
      console.log('[Call] Call rejected');
      setCallError('Звонок отклонён');
      cleanup();
    }, [cleanup]),

    call_end: useCallback(() => {
      console.log('[Call] Call ended by remote');
      cleanup();
    }, [cleanup]),

    call_busy: useCallback(() => {
      console.log('[Call] Remote is busy');
      setCallError('Абонент занят');
      cleanup();
    }, [cleanup]),
  });

  // Expose startCall globally
  useEffect(() => {
    window.__startCall = startCall;
    return () => { delete window.__startCall; };
  }, [startCall]);

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
              {connectionState && !['connected', 'completed'].includes(connectionState) && (
                <span className="call-conn-state">{
                  connectionState === 'connecting' ? '🔄 Подключение...' :
                  connectionState === 'checking' ? '🔄 Проверка...' :
                  connectionState === 'disconnected' ? '⚠️ Нестабильно' :
                  connectionState === 'failed' ? '❌ Ошибка связи' : ''
                }</span>
              )}
            </div>
            <div className="call-controls">
              <button className={`call-ctrl ${!micOn ? 'call-ctrl--off' : ''}`} onClick={toggleMic}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              {callType === 'video' && (
                <button className={`call-ctrl ${!camOn ? 'call-ctrl--off' : ''}`} onClick={toggleCam}>
                  {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              )}
              <button className={`call-ctrl ${screenOn ? 'call-ctrl--active' : ''}`} onClick={toggleScreen}>
                {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </button>
              <button className="call-ctrl call-ctrl--end" onClick={endCall}>
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
