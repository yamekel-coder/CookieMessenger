import { useRef, useEffect } from 'react';
import { useCallEngine } from '../hooks/useCallEngine';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Monitor, MonitorOff } from 'lucide-react';

/**
 * Простой UI для звонков с использованием CallEngine
 * Пример использования новой библиотеки
 */
export default function SimpleCallUI({ currentUser }) {
  const {
    callState,
    remoteUser,
    callType,
    localStream,
    remoteStreams,
    micEnabled,
    cameraEnabled,
    connectionState,
    error,
    callDuration,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    shareScreen,
    stopScreenShare,
  } = useCallEngine(currentUser);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Обновление локального видео
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Обновление удаленного видео
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreams.size > 0) {
      const firstStream = Array.from(remoteStreams.values())[0];
      remoteVideoRef.current.srcObject = firstStream;
    }
  }, [remoteStreams]);

  // Форматирование времени
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Ошибка
  if (error) {
    return (
      <div className="call-overlay">
        <div className="call-modal">
          <div className="call-error">
            <p>⚠️ {error}</p>
            <button className="call-btn call-btn--reject" onClick={() => window.location.reload()}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Idle - нет звонка
  if (callState === 'idle') {
    return null;
  }

  // Входящий звонок
  if (callState === 'incoming') {
    return (
      <div className="call-overlay">
        <div className="call-modal call-modal--incoming">
          <div className="call-avatar-wrap">
            <div 
              className="call-avatar" 
              style={{ 
                backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
                borderColor: remoteUser?.accent_color || '#fff',
              }}
            >
              {!remoteUser?.avatar && (remoteUser?.display_name || remoteUser?.username || '?')[0]?.toUpperCase()}
            </div>
          </div>
          <p className="call-label">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок</p>
          <h3 className="call-name" style={{ color: remoteUser?.accent_color || '#fff' }}>
            {remoteUser?.display_name || remoteUser?.username || 'Неизвестно'}
          </h3>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={rejectCall}>
              <PhoneOff size={22} />
            </button>
            <button className="call-btn call-btn--accept" onClick={answerCall}>
              {callType === 'video' ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Исходящий звонок
  if (callState === 'calling') {
    return (
      <div className="call-overlay">
        <div className="call-modal call-modal--calling">
          <div className="call-avatar-wrap">
            <div 
              className="call-avatar call-avatar--pulse" 
              style={{ 
                backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
                borderColor: remoteUser?.accent_color || '#fff',
              }}
            >
              {!remoteUser?.avatar && (remoteUser?.display_name || remoteUser?.username || '?')[0]?.toUpperCase()}
            </div>
          </div>
          <h3 className="call-name" style={{ color: remoteUser?.accent_color || '#fff' }}>
            {remoteUser?.display_name || remoteUser?.username || 'Неизвестно'}
          </h3>
          <p className="call-label">Вызов...</p>
          {connectionState && connectionState !== 'new' && (
            <p className="call-conn-state">{connectionState}</p>
          )}
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={endCall}>
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Активный звонок
  if (callState === 'active') {
    return (
      <div className="call-active">
        {/* Удаленное видео */}
        {callType === 'video' && (
          <video 
            ref={remoteVideoRef} 
            className="call-remote-video" 
            autoPlay 
            playsInline 
          />
        )}

        {/* Аудио фон */}
        {callType === 'audio' && (
          <div className="call-audio-bg">
            <div 
              className="call-avatar call-avatar--lg" 
              style={{ 
                backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
                borderColor: remoteUser?.accent_color || '#fff',
              }}
            >
              {!remoteUser?.avatar && (remoteUser?.display_name || remoteUser?.username || '?')[0]?.toUpperCase()}
            </div>
            <h3 className="call-name" style={{ color: remoteUser?.accent_color || '#fff' }}>
              {remoteUser?.display_name || remoteUser?.username || 'Неизвестно'}
            </h3>
          </div>
        )}

        {/* Локальное видео */}
        {callType === 'video' && (
          <video 
            ref={localVideoRef} 
            className="call-local-video" 
            autoPlay 
            playsInline 
            muted 
          />
        )}

        {/* HUD */}
        <div className="call-hud">
          <div className="call-hud-info">
            <span className="call-hud-name" style={{ color: remoteUser?.accent_color || '#fff' }}>
              {remoteUser?.display_name || remoteUser?.username || 'Неизвестно'}
            </span>
            <span className="call-hud-timer">{formatDuration(callDuration)}</span>
            {connectionState && connectionState !== 'connected' && connectionState !== 'completed' && (
              <span className="call-conn-state">
                {connectionState === 'connecting' ? '🔄 Подключение...' :
                 connectionState === 'checking' ? '🔄 Проверка...' :
                 connectionState === 'disconnected' ? '⚠️ Разрыв...' :
                 connectionState === 'failed' ? '❌ Ошибка' : connectionState}
              </span>
            )}
          </div>

          {/* Управление */}
          <div className="call-controls">
            <button 
              className={`call-ctrl ${!micEnabled ? 'call-ctrl--off' : ''}`} 
              onClick={toggleMic}
              title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>

            {callType === 'video' && (
              <button 
                className={`call-ctrl ${!cameraEnabled ? 'call-ctrl--off' : ''}`} 
                onClick={toggleCamera}
                title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
              >
                {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
            )}

            <button 
              className="call-ctrl" 
              onClick={shareScreen}
              title="Демонстрация экрана"
            >
              <Monitor size={18} />
            </button>

            <button 
              className="call-ctrl call-ctrl--end" 
              onClick={endCall}
              title="Завершить звонок"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Глобальная функция для начала звонка из любого места
if (typeof window !== 'undefined') {
  window.__startCallWithEngine = (targetUser, type = 'audio') => {
    // Эта функция будет вызываться из других компонентов
    // Реализация зависит от того, как вы хотите управлять глобальным состоянием
    console.log('[SimpleCallUI] Start call:', targetUser, type);
  };
}
