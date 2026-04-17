import { useEffect, useRef, useState, useCallback } from 'react';
import { CallEngine } from '../lib/CallEngine';
import { SignalingAdapter } from '../lib/SignalingAdapter';
import { useWebSocket } from './useWebSocket';

/**
 * React хук для работы с CallEngine
 * Упрощает интеграцию звонков в компоненты
 */
export function useCallEngine(currentUser) {
  const [callState, setCallState] = useState('idle'); // idle, incoming, calling, active
  const [remoteUser, setRemoteUser] = useState(null);
  const [callType, setCallType] = useState('audio');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState('');
  const [error, setError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [callDuration, setCallDuration] = useState(0);

  const engineRef = useRef(null);
  const signalingRef = useRef(null);
  const durationTimerRef = useRef(null);
  const incomingCallDataRef = useRef(null);

  // Инициализация CallEngine
  useEffect(() => {
    if (!window.ws) return;

    const signaling = new SignalingAdapter(window.ws);
    signalingRef.current = signaling;

    const engine = new CallEngine({
      signaling,
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:a.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:a.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    });

    engineRef.current = engine;

    // События CallEngine
    engine.on('incomingCall', ({ from, callId, type }) => {
      console.log('[useCallEngine] Incoming call from:', from);
      setCallState('incoming');
      setCallType(type);
      incomingCallDataRef.current = { from, callId, type };
      
      // Загружаем данные пользователя
      fetch(`/api/users/${from}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
        .then(r => r.json())
        .then(user => setRemoteUser(user))
        .catch(() => setRemoteUser({ id: from, username: 'Unknown' }));
    });

    engine.on('callStarted', ({ peerId, type }) => {
      console.log('[useCallEngine] Call started to:', peerId);
      setCallState('calling');
      setCallType(type);
    });

    engine.on('callConnected', ({ peerId }) => {
      console.log('[useCallEngine] Call connected:', peerId);
      setCallState('active');
      startDurationTimer();
    });

    engine.on('callAnswered', ({ peerId }) => {
      console.log('[useCallEngine] Call answered:', peerId);
      setCallState('active');
      startDurationTimer();
    });

    engine.on('callEnded', ({ peerId }) => {
      console.log('[useCallEngine] Call ended:', peerId);
      cleanup();
    });

    engine.on('callRejected', ({ peerId }) => {
      console.log('[useCallEngine] Call rejected:', peerId);
      setError('Звонок отклонён');
      cleanup();
    });

    engine.on('callBusy', ({ peerId }) => {
      console.log('[useCallEngine] Call busy:', peerId);
      setError('Абонент занят');
      cleanup();
    });

    engine.on('localStreamReady', ({ stream }) => {
      console.log('[useCallEngine] Local stream ready');
      setLocalStream(stream);
    });

    engine.on('remoteTrack', ({ peerId, track, streams }) => {
      console.log('[useCallEngine] Remote track:', track.kind, 'from:', peerId);
      
      if (streams && streams[0]) {
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(peerId, streams[0]);
          return newMap;
        });
      }
    });

    engine.on('connectionStateChange', ({ peerId, state }) => {
      console.log('[useCallEngine] Connection state:', state, 'peer:', peerId);
      setConnectionState(state);
    });

    engine.on('micToggled', ({ enabled }) => {
      setMicEnabled(enabled);
    });

    engine.on('cameraToggled', ({ enabled }) => {
      setCameraEnabled(enabled);
    });

    engine.on('error', ({ message, error }) => {
      console.error('[useCallEngine] Error:', message, error);
      setError(message);
    });

    return () => {
      engine.destroy();
    };
  }, []);

  // Регистрация WebSocket обработчиков
  useWebSocket(signalingRef.current?.registerHandler() || {});

  const startDurationTimer = () => {
    if (durationTimerRef.current) return;
    durationTimerRef.current = setInterval(() => {
      setCallDuration(d => d + 1);
    }, 1000);
  };

  const cleanup = useCallback(() => {
    setCallState('idle');
    setRemoteUser(null);
    setLocalStream(null);
    setRemoteStreams(new Map());
    setCallDuration(0);
    setConnectionState('');
    setMicEnabled(true);
    setCameraEnabled(true);
    incomingCallDataRef.current = null;
    
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // API методы
  const startCall = useCallback(async (targetUser, type = 'audio') => {
    if (!engineRef.current) return;
    
    try {
      setRemoteUser(targetUser);
      setCallType(type);
      setError(null);
      await engineRef.current.startCall(targetUser.id, type);
    } catch (err) {
      console.error('[useCallEngine] Start call error:', err);
      setError(err.message);
      cleanup();
    }
  }, [cleanup]);

  const answerCall = useCallback(async () => {
    if (!engineRef.current || !incomingCallDataRef.current) return;
    
    try {
      const { from } = incomingCallDataRef.current;
      
      // Получаем offer из WebSocket данных (нужно сохранить в incomingCallDataRef)
      // Для упрощения, используем текущую реализацию
      await engineRef.current.answerCall(from, incomingCallDataRef.current.offer);
    } catch (err) {
      console.error('[useCallEngine] Answer call error:', err);
      setError(err.message);
      cleanup();
    }
  }, [cleanup]);

  const rejectCall = useCallback(() => {
    if (!engineRef.current || !incomingCallDataRef.current) return;
    
    const { from } = incomingCallDataRef.current;
    engineRef.current.rejectCall(from);
    cleanup();
  }, [cleanup]);

  const endCall = useCallback(() => {
    if (!engineRef.current) return;
    
    engineRef.current.hangup();
    cleanup();
  }, [cleanup]);

  const toggleMic = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.toggleMic();
  }, []);

  const toggleCamera = useCallback(() => {
    if (!engineRef.current) return;
    engineRef.current.toggleCamera();
  }, []);

  const switchCamera = useCallback(async () => {
    if (!engineRef.current) return;
    try {
      await engineRef.current.switchCamera();
    } catch (err) {
      console.error('[useCallEngine] Switch camera error:', err);
    }
  }, []);

  const shareScreen = useCallback(async () => {
    if (!engineRef.current) return;
    try {
      await engineRef.current.shareScreen();
    } catch (err) {
      console.error('[useCallEngine] Share screen error:', err);
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (!engineRef.current) return;
    await engineRef.current.stopScreenShare();
  }, []);

  return {
    // State
    callState,
    remoteUser,
    callType,
    micEnabled,
    cameraEnabled,
    connectionState,
    error,
    localStream,
    remoteStreams,
    callDuration,
    isInCall: callState !== 'idle',
    
    // Methods
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    shareScreen,
    stopScreenShare,
  };
}
