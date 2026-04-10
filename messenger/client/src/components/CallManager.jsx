import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:openrelay.metered.ca:3478' },
  { urls: 'stun:stunserver.stunprotocol.org:3478' },
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:a.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.twilio.com:3478',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function useRingtone() {
  const interval = useRef(null);

  const ring = useCallback(() => {
    const stop = () => {
      clearInterval(interval.current);
      interval.current = null;
    };
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
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimer = useRef(null);
  const incomingDataRef = useRef(null);
  const pendingIceRef = useRef([]);
  const targetIdRef = useRef(null);
  const screenStreamRef = useRef(null);
  const ringtone = useRingtone();
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);

  const setCallStateSync = (s) => {
    callStateRef.current = s;
    setCallState(s);
  };

  const cleanup = useCallback(() => {
    clearInterval(durationTimer.current);
    durationTimer.current = null;
    clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    ringtone.stop();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (window.remoteAudioEl) {
      window.remoteAudioEl.pause();
      window.remoteAudioEl.srcObject = null;
    }

    pendingIceRef.current = [];
    targetIdRef.current = null;
    retryCountRef.current = 0;

    setCallStateSync('idle');
    setCallDuration(0);
    setConnectionState('');
    setMicOn(true); setCamOn(true); setScreenOn(false);
    setRemoteUser(null);
    setCallError(null);
  }, [ringtone]);

  const getMedia = useCallback(async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Требуется HTTPS');
    }
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video' ? { width: 640, height: 480, facingMode: 'user' } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  const createPeerConnection = useCallback((targetId) => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    pendingIceRef.current = [];
    targetIdRef.current = targetId;

    const conn = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
    });

    conn.onicecandidate = (e) => {
      if (e.candidate && targetIdRef.current) {
        const cand = e.candidate;
        console.log('[Call] ICE candidate:', cand.type, cand.protocol, cand.address || 'unknown');
        wsSend('call_ice', targetIdRef.current, { candidate: cand });
      }
    };

    conn.onicegatheringstatechange = () => {
      console.log('[Call] ICE gathering:', conn.iceGatheringState);
    };

    conn.oniceconnectionstatechange = () => {
      const state = conn.iceConnectionState;
      console.log('[Call] ICE state change:', state);
      setConnectionState(state);

      if (state === 'checking') {
        console.log('[Call] Checking connectivity...');
      } else if (state === 'connected' || state === 'completed') {
        console.log('[Call] WebRTC Connected!');
        retryCountRef.current = 0;
      } else if (state === 'disconnected') {
        console.log('[Call] Disconnected - retrying ICE...');
        conn.restartIce?.();
      } else if (state === 'failed') {
        console.log('[Call] Connection failed, retrying...', retryCountRef.current);
        
        if (retryCountRef.current < 3) {
          retryCountRef.current++;
          const delay = Math.min(1500 * Math.pow(2, retryCountRef.current - 1), 5000);
          retryTimeoutRef.current = setTimeout(async () => {
            console.log('[Call] Retrying connection (attempt', retryCountRef.current + ')...');
            conn.restartIce?.();
          }, delay);
        } else {
          console.log('[Call] Max retries reached');
          setCallError('Не удалось установить соединение. Проверьте интернет.');
          cleanup();
        }
      } else if (state === 'closed') {
        console.log('[Call] Connection closed');
      }
    };

    conn.ontrack = (e) => {
      console.log('[Call] ontrack:', e.track.kind, 'streams:', e.streams.length);
      if (e.track.kind === 'audio' && e.streams[0]) {
        console.log('[Call] Got audio stream!');
        if (!window.remoteAudioEl) {
          const audio = document.createElement('audio');
          audio.autoplay = true;
          audio.playsInline = true;
          audio.controls = false;
          audio.style.display = 'none';
          audio.style.position = 'absolute';
          audio.style.opacity = '0';
          document.body.appendChild(audio);
          window.remoteAudioEl = audio;
        }
        window.remoteAudioEl.srcObject = e.streams[0];
        window.remoteAudioEl.volume = 1;
        
        // Force play
        const playAudio = () => {
          window.remoteAudioEl.play().then(() => {
            console.log('[Call] Audio playing!');
          }).catch(err => {
            console.log('[Call] Play failed:', err.message);
          });
        };
        playAudio();
        
        // Listen for click to start audio
        document.addEventListener('click', playAudio, { once: true });
      } else if (e.track.kind === 'video' && e.streams[0] && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pcRef.current = conn;
    return conn;
  }, [cleanup]);

  const addLocalTracks = useCallback((pc, stream) => {
    if (!stream) return;
    localStreamRef.current = stream;
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    if (stream.getVideoTracks().length > 0 && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, []);

  const startCall = useCallback(async (targetUser, type = 'audio') => {
    console.log('[Call] startCall to:', targetUser.id);
    
    if (callStateRef.current !== 'idle') {
      cleanup();
      await new Promise(r => setTimeout(r, 200));
    }

    setCallStateSync('calling');
    setCallType(type);
    setRemoteUser(targetUser);
    setCallError(null);

    try {
      const stream = await getMedia(type);
      const pc = createPeerConnection(targetUser.id);
      addLocalTracks(pc, stream);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsSend('call_offer', targetUser.id, {
        offer,
        type,
        callerName: currentUser.display_name || currentUser.username,
        callerAvatar: currentUser.avatar,
        callerAccent: currentUser.accent_color,
      });
      console.log('[Call] Offer sent');
    } catch (err) {
      console.error('[Call] startCall error:', err);
      setCallError(err.message);
      cleanup();
    }
  }, [cleanup, getMedia, createPeerConnection, addLocalTracks, currentUser]);

  const answerCall = useCallback(async () => {
    const incoming = incomingDataRef.current;
    if (!incoming) {
      console.log('[Call] No incoming data!');
      return;
    }
    console.log('[Call] answerCall from:', incoming.from);

    ringtone.stop();
    setCallStateSync('active');

    try {
      const stream = await getMedia(incoming.type || 'audio');
      const pc = createPeerConnection(incoming.from);
      addLocalTracks(pc, stream);

      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      
      for (const c of pendingIceRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsSend('call_answer', incoming.from, { answer });
      console.log('[Call] Answer sent');

      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('[Call] answerCall error:', err);
      setCallError(err.message);
      cleanup();
    }
  }, [ringtone, getMedia, createPeerConnection, addLocalTracks, cleanup]);

  const rejectCall = useCallback(() => {
    const incoming = incomingDataRef.current;
    if (incoming) {
      wsSend('call_reject', incoming.from, {});
    }
    cleanup();
  }, [cleanup]);

  const endCall = useCallback(() => {
    const ru = remoteUser;
    const incoming = incomingDataRef.current;
    if (ru) wsSend('call_end', ru.id, {});
    else if (incoming) wsSend('call_end', incoming.from, {});
    cleanup();
  }, [cleanup, remoteUser]);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMicOn(v => !v);
    }
  }, []);

  const toggleCam = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCamOn(v => !v);
    }
  }, []);

  const toggleScreen = useCallback(async () => {
    if (!pcRef.current || !localStreamRef.current) return;

    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      const camTrack = localStreamRef.current.getVideoTracks()[0];
      if (camTrack) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];

        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }

        screenTrack.onended = () => { if (screenOn) toggleScreen(); };
        setScreenOn(true);
      } catch (err) {
        console.error('[Screen] error:', err);
      }
    }
  }, [screenOn]);

  useWebSocket({
    call_offer: (data) => {
      console.log('[Call] call_offer received from:', data.from);
      
      if (callStateRef.current !== 'idle') {
        wsSend('call_busy', data.from, {});
        return;
      }

      incomingDataRef.current = data;
      setCallType(data.type || 'audio');
      setRemoteUser({
        id: data.from,
        display_name: data.callerName,
        avatar: data.callerAvatar,
        accent_color: data.callerAccent,
      });
      setCallStateSync('incoming');
      ringtone.ring();
    },

    call_answer: async (data) => {
      console.log('[Call] call_answer received');
      
      if (!pcRef.current) {
        console.log('[Call] No PC for answer!');
        return;
      }

      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('[Call] Remote description set');

        for (const c of pendingIceRef.current) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        pendingIceRef.current = [];

        setCallStateSync('active');
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      } catch (err) {
        console.error('[Call] setRemoteDescription error:', err);
        setCallError('Ошибка соединения');
        cleanup();
      }
    },

    call_ice: async (data) => {
      if (!data.candidate) return;
      
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.log('[Call] ICE error:', err.message);
        }
      } else {
        pendingIceRef.current.push(data.candidate);
      }
    },

    call_reject: () => {
      setCallError('Звонок отклонён');
      cleanup();
    },

    call_end: () => {
      cleanup();
    },

    call_busy: () => {
      setCallError('Абонент занят');
      cleanup();
    },
  });

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
        <button className="call-btn call-btn--reject" onClick={() => { setCallError(null); cleanup(); }}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="call-overlay">
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
              {connectionState && connectionState !== 'connected' && connectionState !== 'completed' && (
                <span className="call-conn-state">{
                  connectionState === 'connecting' ? '🔄 Подключение...' :
                  connectionState === 'checking' ? '🔄 Проверка...' :
                  connectionState === 'disconnected' ? '⚠️ Разрыв...' :
                  connectionState === 'failed' ? '❌ Ошибка' : connectionState
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
