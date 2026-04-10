import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend, wsReadyState } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff,
} from 'lucide-react';

// ── Codec preference helper (Telegram uses Opus + VP9/VP8) ───────────────────
function preferCodec(sdp, type, codec) {
  const lines = sdp.split('\r\n');
  const mLineIndex = lines.findIndex(l => l.startsWith(`m=${type}`));
  if (mLineIndex === -1) return sdp;

  const codecLines = lines.filter(l => l.includes(`rtpmap`) && l.toLowerCase().includes(codec.toLowerCase()));
  if (codecLines.length === 0) return sdp;

  const codecIds = codecLines.map(l => {
    const match = l.match(/a=rtpmap:(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean);

  if (codecIds.length === 0) return sdp;

  const mLine = lines[mLineIndex];
  const parts = mLine.split(' ');
  const existingCodecs = parts.slice(3);
  
  // Move preferred codec to front
  const reordered = [...codecIds, ...existingCodecs.filter(c => !codecIds.includes(c))];
  parts.splice(3, existingCodecs.length, ...reordered);
  lines[mLineIndex] = parts.join(' ');

  return lines.join('\r\n');
}

// ── ICE servers — Reliable public servers (Twilio + Metered) ─────────────────
const ICE_SERVERS = [
  // Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  
  // Twilio STUN (very reliable)
  { urls: 'stun:global.stun.twilio.com:3478' },
  
  // Metered TURN servers (free, most reliable for calls)
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:a.relay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
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
  const [connectionQuality, setConnectionQuality] = useState('good'); // good, medium, poor
  const [connectionType, setConnectionType] = useState(''); // local, p2p, relay
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

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
  const callTimeout = useRef(null);
  const ringtone = useRingtone();

  const setCallStateSync = (s) => {
    callStateRef.current = s;
    setCallState(s);
  };

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(durationTimer.current);
    clearTimeout(callTimeout.current);
    durationTimer.current = null;
    callTimeout.current = null;
    ringtone.stop();

    try { localStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { screenStream.current?.getTracks().forEach(t => t.stop()); } catch {}
    localStream.current = null;
    screenStream.current = null;

    try { pc.current?.close(); } catch {}
    pc.current = null;

    // Clean up remote audio
    if (window.remoteAudioEl) {
      window.remoteAudioEl.pause();
      window.remoteAudioEl.srcObject = null;
    }

    iceCandidateBuffer.current = [];
    remoteUserRef.current = null;
    incomingDataRef.current = null;

    setCallStateSync('idle');
    setCallDuration(0);
    setConnectionState('');
    setConnectionQuality('good');
    setConnectionType('');
    setReconnectAttempts(0);
    setMicOn(true); setCamOn(true); setScreenOn(false);
    setRemoteUser(null);
  }, [ringtone]);

  // ── Create PeerConnection with Telegram-style config ──────────────────────
  const createPC = useCallback((targetId) => {
    if (pc.current) { try { pc.current.close(); } catch {} }
    iceCandidateBuffer.current = [];

    const conn = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all', // Try all: UDP, TCP, TURN
    });

    // ICE candidate gathering
    conn.onicecandidate = (e) => {
      if (e.candidate) {
        wsSend('call_ice', targetId, { candidate: e.candidate });
      }
    };

    // ICE gathering state
    conn.onicegatheringstatechange = () => {
      // Silent - no logging needed
    };

    // Connection state monitoring (Telegram-style)
    conn.oniceconnectionstatechange = () => {
      const state = conn.iceConnectionState;
      setConnectionState(state);
      
      if (state === 'connected' || state === 'completed') {
        setReconnectAttempts(0);
        
        // Determine connection type
        conn.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const localCandidate = [...stats.values()].find(s => s.id === report.localCandidateId);
              const remoteCandidate = [...stats.values()].find(s => s.id === report.remoteCandidateId);
              
              if (localCandidate && remoteCandidate) {
                const localType = localCandidate.candidateType;
                const remoteType = remoteCandidate.candidateType;
                
                if (localType === 'relay' || remoteType === 'relay') {
                  setConnectionType('relay');
                } else if (localType === 'srflx' || remoteType === 'srflx') {
                  setConnectionType('p2p');
                } else if (localType === 'host' && remoteType === 'host') {
                  setConnectionType('local');
                }
              }
            }
          });
        }).catch(() => {});
        
        monitorConnectionQuality(conn);
      } else if (state === 'disconnected') {
        // Try to reconnect (Telegram does this)
        setReconnectAttempts(prev => {
          const attempts = prev + 1;
          if (attempts <= 3) {
            setTimeout(() => {
              if (conn.restartIce) conn.restartIce();
            }, 1000);
          }
          return attempts;
        });
      } else if (state === 'failed') {
        // Final attempt with ICE restart
        if (conn.restartIce && reconnectAttempts < 3) {
          conn.restartIce();
        } else {
          setCallError('Соединение потеряно');
          const ru = remoteUserRef.current;
          const id = incomingDataRef.current;
          if (ru) wsSend('call_end', ru.id, {});
          else if (id) wsSend('call_end', id.from, {});
          cleanup();
        }
      }
    };

    conn.onconnectionstatechange = () => {
      if (['closed'].includes(conn.connectionState)) {
        const ru = remoteUserRef.current;
        const id = incomingDataRef.current;
        if (ru) wsSend('call_end', ru.id, {});
        else if (id) wsSend('call_end', id.from, {});
        cleanup();
      }
    };

    conn.ontrack = (e) => {
      if (e.track.kind === 'audio') {
        // Create or reuse audio element for remote audio
        if (!window.remoteAudioEl) {
          const audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.controls = false;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          window.remoteAudioEl = audioEl;
        }
        
        if (e.streams[0]) {
          const oldStream = window.remoteAudioEl.srcObject;
          window.remoteAudioEl.srcObject = e.streams[0];
          
          // Try to play - will work after user interaction
          const playPromise = window.remoteAudioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              // Autoplay blocked - will play on next user interaction
              console.log('[Call] Audio autoplay blocked, waiting for interaction');
              const resumeAudio = () => {
                window.remoteAudioEl.play().catch(() => {});
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('touchstart', resumeAudio);
              };
              document.addEventListener('click', resumeAudio, { once: true });
              document.addEventListener('touchstart', resumeAudio, { once: true });
            });
          }
        }
      } else if (e.track.kind === 'video') {
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      }
    };

    pc.current = conn;
    return conn;
  }, [cleanup, reconnectAttempts]);

  // ── Get local media with Telegram-style quality settings ─────────────────
  const getMedia = useCallback(async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Для звонков требуется HTTPS. Откройте сайт по защищённому соединению.');
    }

    // Telegram-style audio constraints (Opus codec, noise suppression)
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000, // Opus optimal
      channelCount: 1,
      latency: 0,
    };

    // Adaptive video quality (starts high, adjusts based on connection)
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

  // ── Monitor connection quality (Telegram-style adaptive bitrate) ──────────
  const monitorConnectionQuality = useCallback(async (conn) => {
    if (!conn) return;
    
    const checkQuality = async () => {
      try {
        const stats = await conn.getStats();
        let packetsLost = 0;
        let packetsReceived = 0;
        let bytesReceived = 0;
        let bytesSent = 0;
        let currentRoundTripTime = 0;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
            bytesReceived += report.bytesReceived || 0;
          }
          if (report.type === 'outbound-rtp') {
            bytesSent += report.bytesSent || 0;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            currentRoundTripTime = report.currentRoundTripTime || 0;
          }
        });

        // Calculate packet loss percentage
        const totalPackets = packetsReceived + packetsLost;
        const lossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
        const rtt = currentRoundTripTime * 1000; // Convert to ms

        // Determine quality (Telegram-style thresholds)
        let quality = 'good';
        if (lossPercent > 5 || rtt > 300) quality = 'poor';
        else if (lossPercent > 2 || rtt > 150) quality = 'medium';

        setConnectionQuality(quality);

        // Adaptive bitrate adjustment
        if (quality === 'poor' && conn.getSenders) {
          conn.getSenders().forEach(sender => {
            if (sender.track?.kind === 'video') {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              // Reduce bitrate for poor connection
              params.encodings[0].maxBitrate = 500000; // 500 kbps
              sender.setParameters(params).catch(() => {});
            }
          });
        } else if (quality === 'good' && conn.getSenders) {
          conn.getSenders().forEach(sender => {
            if (sender.track?.kind === 'video') {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              // Restore bitrate for good connection
              params.encodings[0].maxBitrate = 2500000; // 2.5 Mbps
              sender.setParameters(params).catch(() => {});
            }
          });
        }

        // Silent quality monitoring - no console logs
      } catch (err) {
        // Silent - stats errors are not critical
      }
    };

    // Check quality every 2 seconds
    const interval = setInterval(checkQuality, 2000);
    return () => clearInterval(interval);
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
      
      // Add all tracks to peer connection BEFORE creating offer
      stream.getTracks().forEach(track => {
        conn.addTrack(track, stream);
      });

      // Create offer - must be after addTrack
      const offer = await conn.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
        voiceActivityDetection: true,
      });

      // Prefer Opus for audio and VP9/VP8 for video (Telegram uses these)
      offer.sdp = preferCodec(offer.sdp, 'audio', 'opus');
      if (type === 'video') {
        offer.sdp = preferCodec(offer.sdp, 'video', 'VP9');
        offer.sdp = preferCodec(offer.sdp, 'video', 'VP8');
      }

      await conn.setLocalDescription(offer);

      // Send offer — check WS is open
      if (wsReadyState() !== 1) {
        setCallError('Нет соединения. Попробуйте снова.');
        cleanup();
        return;
      }

      wsSend('call_offer', targetUser.id, {
        offer,
        type,
        callerName: currentUser.display_name || currentUser.username,
        callerAvatar: currentUser.avatar,
        callerAccent: currentUser.accent_color,
      });

      // Timeout: 30 seconds for answer
      callTimeout.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          setCallError('Нет ответа');
          cleanup();
        }
      }, 30000);

    } catch (err) {
      console.error('[Call] Error:', err.message);
      setCallError(err.message || 'Ошибка звонка');
      cleanup();
    }
  }, [getMedia, createPC, currentUser, cleanup]);

  // ── Answer call ────────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    const incoming = incomingDataRef.current;
    if (!incoming) return;

    clearTimeout(callTimeout.current);
    ringtone.stop();
    setCallStateSync('active');

    try {
      const stream = await getMedia(incoming.type || 'audio');
      const conn = createPC(incoming.from);
      
      // Add tracks BEFORE setting remote description
      stream.getTracks().forEach(track => {
        conn.addTrack(track, stream);
      });

      await conn.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      await flushIceCandidates();

      const answer = await conn.createAnswer({
        voiceActivityDetection: true,
      });
      await conn.setLocalDescription(answer);

      wsSend('call_answer', incoming.from, { answer });
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      
      // Try to play remote audio after answer
      setTimeout(() => {
        if (window.remoteAudioEl) {
          window.remoteAudioEl.play().catch(() => {});
        }
      }, 500);
    } catch (err) {
      console.error('[Call] Error:', err.message);
      setCallError(err.message || 'Ошибка при ответе на звонок');
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
      // Stop sharing
      screenStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current = null;
      
      // Restore camera track
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(videoTrack);
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ 
          video: { 
            cursor: 'always',
            displaySurface: 'monitor'
          }, 
          audio: false 
        });
        
        screenStream.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        
        // Find video sender and replace track
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }
        
        screenTrack.onended = () => {
          if (screenOn) toggleScreen();
        };
        
        setScreenOn(true);
      } catch (err) {
        console.error('[Screen] Error:', err);
      }
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

      // Auto-answer with media
      answerCall();

      // Timeout: 45 seconds for incoming call
      callTimeout.current = setTimeout(() => {
        if (callStateRef.current === 'incoming') {
          wsSend('call_reject', data.from, {});
          cleanup();
        }
      }, 45000);
    },

    call_answer: async (data) => {
      if (!pc.current) return;
      clearTimeout(callTimeout.current);
      try {
        await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushIceCandidates();
        setCallStateSync('active');
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
        
        // Try to play remote audio after connection established
        setTimeout(() => {
          if (window.remoteAudioEl) {
            window.remoteAudioEl.play().catch(() => {});
          }
        }, 500);
      } catch (err) {
        console.error('[Call] Error:', err.message);
        setCallError('Ошибка соединения');
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
      } catch (err) {
        // Silent - ICE errors are common and not critical
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
              {connectionState && connectionState !== 'connected' && connectionState !== 'completed' && (
                <span className="call-conn-state">{
                  connectionState === 'connecting' ? '🔄 Подключение...' :
                  connectionState === 'checking' ? '🔄 Проверка...' :
                  connectionState === 'disconnected' ? '⚠️ Переподключение...' :
                  connectionState === 'failed' ? '❌ Ошибка связи' : ''
                }</span>
              )}
              {(connectionState === 'connected' || connectionState === 'completed') && connectionQuality !== 'good' && (
                <span className="call-quality-indicator">{
                  connectionQuality === 'medium' ? '📶 Среднее качество' :
                  connectionQuality === 'poor' ? '📶 Слабое соединение' : ''
                }</span>
              )}
              {connectionType && (connectionState === 'connected' || connectionState === 'completed') && (
                <span className="call-connection-type" title={
                  connectionType === 'local' ? 'Локальная сеть (прямое P2P)' :
                  connectionType === 'p2p' ? 'Прямое соединение через интернет' :
                  connectionType === 'relay' ? 'Через relay сервер' : ''
                }>{
                  connectionType === 'local' ? '🏠 Локальная сеть' :
                  connectionType === 'p2p' ? '🌐 P2P' :
                  connectionType === 'relay' ? '🔄 Relay' : ''
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
