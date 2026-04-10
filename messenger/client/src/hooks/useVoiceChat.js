import { useEffect, useRef, useCallback, useState } from 'react';
import { wsSend, useWebSocket } from './useWebSocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
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
    urls: 'turn:global.relay.twilio.com:3478',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export function useVoiceChat(roomId, currentUser) {
  const [participants, setParticipants] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  const [connectionState, setConnectionState] = useState('');
  const [error, setError] = useState(null);
  const [isJoined, setIsJoined] = useState(false);

  const pcsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const remoteAudiosRef = useRef(new Map());
  const roomIdRef = useRef(roomId);
  
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  const retryAttemptsRef = useRef(new Map());
  const retryTimeoutsRef = useRef(new Map());

  const createPC = useCallback((targetUserId) => {
    if (pcsRef.current.has(targetUserId)) {
      pcsRef.current.get(targetUserId).close();
    }

    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        wsSend('room_ice', null, { roomId: roomIdRef.current, data: { candidate: e.candidate }, to: targetUserId });
      }
    };

    conn.oniceconnectionstatechange = () => {
      console.log(`[Voice] ICE state for ${targetUserId}: ${conn.iceConnectionState}`);
      
      if (conn.iceConnectionState === 'failed' || conn.iceConnectionState === 'disconnected') {
        console.log(`[Voice] ICE failed/disconnected for ${targetUserId}, restarting ICE...`);
        conn.restartIce?.();
        
        const attempts = retryAttemptsRef.current.get(targetUserId) || 0;
        if (attempts < 3) {
          retryAttemptsRef.current.set(targetUserId, attempts + 1);
          const delay = Math.min(1000 * Math.pow(2, attempts), 5000);
          setTimeout(() => {
            if (pcsRef.current.has(targetUserId) && conn.iceConnectionState !== 'connected') {
              console.log(`[Voice] Retrying connection for ${targetUserId} (attempt ${attempts + 1})`);
              createOfferForUser(targetUserId);
            }
          }, delay);
        }
      }
      
      if (conn.iceConnectionState === 'connected') {
        retryAttemptsRef.current.set(targetUserId, 0);
      }
    };

    conn.ontrack = (e) => {
      if (e.track.kind !== 'audio') return;
      
      let audioEl = remoteAudiosRef.current.get(targetUserId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `remote-audio-${targetUserId}`;
        audioEl.autoplay = true;
        audioEl.controls = false;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudiosRef.current.set(targetUserId, audioEl);
      }
      
      if (e.streams[0]) {
        audioEl.srcObject = e.streams[0];
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay blocked - will play on interaction
            const resumeAudio = () => {
              audioEl.play().catch(() => {});
              document.removeEventListener('click', resumeAudio);
            };
            document.addEventListener('click', resumeAudio, { once: true });
          });
        }
      }
    };

    pcsRef.current.set(targetUserId, conn);
    return conn;
  }, []);

  const initLocalStream = useCallback(async (type = 'audio') => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: type === 'video' ? { width: 640, height: 480, facingMode: 'user' } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      setError('Не удалось получить доступ к микрофону');
      throw err;
    }
  }, []);

  const joinRoom = useCallback(async () => {
    if (!roomIdRef.current || !currentUser) return;

    try {
      const stream = await initLocalStream('audio');
      
      wsSend('room_join', null, { 
        roomId: roomIdRef.current, 
        userJoined: currentUser.id, 
        userData: {
          display_name: currentUser.display_name || currentUser.username,
          avatar: currentUser.avatar,
          accent_color: currentUser.accent_color,
          username: currentUser.username,
        }
      });

      await fetch(`/api/calls/rooms/${roomIdRef.current}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      setIsJoined(true);
    } catch (err) {
      setError(err.message);
    }
  }, [currentUser, initLocalStream]);

  const leaveRoom = useCallback(() => {
    wsSend('room_leave', null, { roomId: roomIdRef.current });

    pcsRef.current.forEach(pc => pc.close());
    pcsRef.current.clear();
    
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    remoteAudiosRef.current.forEach(el => el.remove());
    remoteAudiosRef.current.clear();

    setIsJoined(false);
    setParticipants([]);
  }, []);

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

  const createOfferForUser = useCallback(async (targetUserId) => {
    const pc = createPC(targetUserId);
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    wsSend('room_offer', targetUserId, { 
      roomId: roomIdRef.current, 
      data: { offer }
    });
  }, []);

  useWebSocket({
    room_participants: (data) => {
      if (data.roomId === roomIdRef.current && data.users) {
        const res = data.users.filter(id => id !== currentUser?.id);
        setParticipants(res.map(id => ({ id })));
        
        res.forEach(userId => {
          setTimeout(() => createOfferForUser(userId), 300);
        });
      }
    },

    room_user_joined: (data) => {
      if (data.roomId === roomIdRef.current && data.user?.id !== currentUser?.id) {
        setParticipants(prev => {
          if (prev.find(p => p.id === data.user.id)) return prev;
          return [...prev, data.user];
        });
        
        setTimeout(() => createOfferForUser(data.user.id), 500);
      }
    },

    room_user_left: (data) => {
      if (data.roomId === roomIdRef.current) {
        setParticipants(prev => prev.filter(p => p.id !== data.userId));
        
        const pc = pcsRef.current.get(data.userId);
        if (pc) {
          pc.close();
          pcsRef.current.delete(data.userId);
        }
        
        const audioEl = remoteAudiosRef.current.get(data.userId);
        if (audioEl) {
          audioEl.remove();
          remoteAudiosRef.current.delete(data.userId);
        }

        retryAttemptsRef.current.delete(data.userId);
        const retryTimeout = retryTimeoutsRef.current.get(data.userId);
        if (retryTimeout) {
          clearTimeout(retryTimeout);
          retryTimeoutsRef.current.delete(data.userId);
        }
      }
    },

    room_offer: async (data) => {
      if (data.roomId !== roomIdRef.current || data.from === currentUser?.id) return;

      const pc = createPC(data.from);
      
      // Add tracks BEFORE setting remote description
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.data?.offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsSend('room_answer', data.from, { 
        roomId: roomIdRef.current, 
        data: { answer }
      });
    },

    room_answer: async (data) => {
      if (data.roomId !== roomIdRef.current || data.from === currentUser?.id) return;
      
      const pc = pcsRef.current.get(data.from);
      if (pc && data.data?.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.data.answer));
      }
    },

    room_ice: async (data) => {
      if (data.roomId !== roomIdRef.current || data.from === currentUser?.id) return;
      
      const pc = pcsRef.current.get(data.from);
      if (pc && data.data?.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.data.candidate));
        } catch {}
      }
    },
  });

  useEffect(() => {
    if (!roomId) return;
    
    fetch(`/api/calls/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.participants) {
          setParticipants(data.participants.filter(p => p.id !== currentUser?.id));
        }
      })
      .catch(() => {});
  }, [roomId, currentUser]);

  useEffect(() => {
    return () => {
      if (isJoined) {
        wsSend('room_leave', null, { roomId: roomIdRef.current });
      }
      pcsRef.current.forEach(pc => pc.close());
      remoteAudiosRef.current.forEach(el => el.remove());
      localStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    participants,
    localStream,
    micOn,
    camOn,
    speakingUsers,
    connectionState,
    error,
    isJoined,
    joinRoom,
    leaveRoom,
    toggleMic,
    toggleCam,
  };
}
