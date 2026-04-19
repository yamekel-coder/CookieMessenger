# Примеры использования CallEngine

## 1. Базовый аудио звонок

```jsx
import { useCallEngine } from '../hooks/useCallEngine';

function AudioCallButton({ targetUser, currentUser }) {
  const { startCall } = useCallEngine(currentUser);

  const handleCall = async () => {
    try {
      await startCall(targetUser, 'audio');
    } catch (err) {
      console.error('Ошибка звонка:', err);
    }
  };

  return (
    <button onClick={handleCall}>
      📞 Позвонить
    </button>
  );
}
```

## 2. Видео звонок с превью

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useRef, useEffect } from 'react';

function VideoCall({ targetUser, currentUser }) {
  const {
    callState,
    localStream,
    remoteStreams,
    startCall,
    endCall,
  } = useCallEngine(currentUser);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreams.size > 0) {
      const stream = Array.from(remoteStreams.values())[0];
      remoteVideoRef.current.srcObject = stream;
    }
  }, [remoteStreams]);

  if (callState === 'idle') {
    return (
      <button onClick={() => startCall(targetUser, 'video')}>
        🎥 Видео звонок
      </button>
    );
  }

  return (
    <div className="video-call">
      <video ref={remoteVideoRef} autoPlay playsInline />
      <video ref={localVideoRef} autoPlay playsInline muted />
      <button onClick={endCall}>Завершить</button>
    </div>
  );
}
```

## 3. Входящий звонок с уведомлением

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useEffect } from 'react';

function IncomingCallNotification({ currentUser }) {
  const {
    callState,
    remoteUser,
    callType,
    answerCall,
    rejectCall,
  } = useCallEngine(currentUser);

  useEffect(() => {
    if (callState === 'incoming') {
      // Показать системное уведомление
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Входящий звонок', {
          body: `${remoteUser?.display_name || 'Неизвестно'} звонит вам`,
          icon: remoteUser?.avatar,
        });
      }

      // Воспроизвести рингтон
      const audio = new Audio('/ringtone.mp3');
      audio.loop = true;
      audio.play();

      return () => {
        audio.pause();
        audio.currentTime = 0;
      };
    }
  }, [callState, remoteUser]);

  if (callState !== 'incoming') return null;

  return (
    <div className="incoming-call-modal">
      <img src={remoteUser?.avatar} alt={remoteUser?.display_name} />
      <h3>{remoteUser?.display_name || remoteUser?.username}</h3>
      <p>Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок</p>
      <div className="actions">
        <button onClick={rejectCall}>Отклонить</button>
        <button onClick={answerCall}>Ответить</button>
      </div>
    </div>
  );
}
```

## 4. Управление микрофоном и камерой

```jsx
import { useCallEngine } from '../hooks/useCallEngine';

function CallControls({ currentUser }) {
  const {
    callState,
    micEnabled,
    cameraEnabled,
    toggleMic,
    toggleCamera,
    endCall,
  } = useCallEngine(currentUser);

  if (callState !== 'active') return null;

  return (
    <div className="call-controls">
      <button 
        onClick={toggleMic}
        className={micEnabled ? 'active' : 'inactive'}
      >
        {micEnabled ? '🎤' : '🔇'} Микрофон
      </button>

      <button 
        onClick={toggleCamera}
        className={cameraEnabled ? 'active' : 'inactive'}
      >
        {cameraEnabled ? '📹' : '📷'} Камера
      </button>

      <button onClick={endCall} className="end-call">
        ❌ Завершить
      </button>
    </div>
  );
}
```

## 5. Демонстрация экрана

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useState } from 'react';

function ScreenShareButton({ currentUser }) {
  const { shareScreen, stopScreenShare } = useCallEngine(currentUser);
  const [isSharing, setIsSharing] = useState(false);

  const handleToggleScreenShare = async () => {
    try {
      if (isSharing) {
        await stopScreenShare();
        setIsSharing(false);
      } else {
        await shareScreen();
        setIsSharing(true);
      }
    } catch (err) {
      console.error('Ошибка демонстрации экрана:', err);
      alert('Не удалось начать демонстрацию экрана');
    }
  };

  return (
    <button onClick={handleToggleScreenShare}>
      {isSharing ? '🖥️ Остановить демонстрацию' : '🖥️ Демонстрация экрана'}
    </button>
  );
}
```

## 6. Групповой звонок

```jsx
import { useEffect, useState } from 'react';
import { CallEngine } from '../lib/CallEngine';
import { GroupCallSignaling } from '../lib/SignalingAdapter';

function GroupCall({ roomId, currentUser }) {
  const [engine, setEngine] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());

  useEffect(() => {
    const signaling = new GroupCallSignaling(window.ws);
    const callEngine = new CallEngine({ signaling });

    signaling.setRoom(roomId);
    
    // Присоединиться к комнате
    signaling.joinRoom(roomId, {
      display_name: currentUser.display_name,
      avatar: currentUser.avatar,
      accent_color: currentUser.accent_color,
    });

    // Слушать участников
    signaling.on('participants', ({ users }) => {
      setParticipants(users);
    });

    signaling.on('userJoined', ({ user }) => {
      setParticipants(prev => [...prev, user]);
    });

    signaling.on('userLeft', ({ userId }) => {
      setParticipants(prev => prev.filter(u => u.id !== userId));
    });

    // Слушать треки
    callEngine.on('remoteTrack', ({ peerId, streams }) => {
      if (streams && streams[0]) {
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(peerId, streams[0]);
          return newMap;
        });
      }
    });

    setEngine(callEngine);

    return () => {
      signaling.leaveRoom();
      callEngine.destroy();
    };
  }, [roomId, currentUser]);

  return (
    <div className="group-call">
      <h3>Участники: {participants.length}</h3>
      <div className="participants-grid">
        {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
          <video 
            key={peerId}
            ref={el => el && (el.srcObject = stream)}
            autoPlay
            playsInline
          />
        ))}
      </div>
    </div>
  );
}
```

## 7. Статистика звонка

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useEffect, useState } from 'react';

function CallStats({ currentUser }) {
  const { callState, callDuration, connectionState } = useCallEngine(currentUser);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (callState !== 'active') return;

    const interval = setInterval(() => {
      // Здесь можно получить статистику WebRTC
      // engine.getStats() - если добавить этот метод
      setStats({
        duration: callDuration,
        state: connectionState,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [callState, callDuration, connectionState]);

  if (callState !== 'active' || !stats) return null;

  return (
    <div className="call-stats">
      <p>Длительность: {Math.floor(stats.duration / 60)}:{stats.duration % 60}</p>
      <p>Состояние: {stats.state}</p>
    </div>
  );
}
```

## 8. Переключение камеры (мобильные устройства)

```jsx
import { useCallEngine } from '../hooks/useCallEngine';

function CameraSwitcher({ currentUser }) {
  const { callType, switchCamera } = useCallEngine(currentUser);

  if (callType !== 'video') return null;

  return (
    <button onClick={switchCamera}>
      🔄 Переключить камеру
    </button>
  );
}
```

## 9. Обработка ошибок

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useEffect } from 'react';

function CallErrorHandler({ currentUser }) {
  const { error } = useCallEngine(currentUser);

  useEffect(() => {
    if (error) {
      // Логирование ошибки
      console.error('[Call Error]', error);

      // Показать уведомление
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Ошибка звонка', {
          body: error,
          icon: '/error-icon.png',
        });
      }

      // Отправить в аналитику
      // analytics.track('call_error', { error });
    }
  }, [error]);

  if (!error) return null;

  return (
    <div className="call-error-toast">
      ⚠️ {error}
    </div>
  );
}
```

## 10. Интеграция с существующим UI

```jsx
// В App.jsx или главном компоненте
import { useCallEngine } from './hooks/useCallEngine';
import SimpleCallUI from './components/SimpleCallUI';

function App() {
  const [currentUser, setCurrentUser] = useState(null);

  // Загрузка пользователя
  useEffect(() => {
    fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then(setCurrentUser);
  }, []);

  if (!currentUser) return <div>Загрузка...</div>;

  return (
    <div className="app">
      {/* Ваш основной UI */}
      <MainContent />

      {/* Overlay для звонков */}
      <SimpleCallUI currentUser={currentUser} />
    </div>
  );
}
```

## 11. Глобальная функция для звонков

```jsx
// В любом компоненте
function UserCard({ user }) {
  const handleCall = () => {
    // Используем глобальную функцию
    if (window.__startCall) {
      window.__startCall(user, 'audio');
    }
  };

  return (
    <div className="user-card">
      <h3>{user.display_name}</h3>
      <button onClick={handleCall}>Позвонить</button>
    </div>
  );
}
```

## 12. Сохранение истории звонков

```jsx
import { useCallEngine } from '../hooks/useCallEngine';
import { useEffect } from 'react';

function CallHistoryTracker({ currentUser }) {
  const { callState, remoteUser, callDuration } = useCallEngine(currentUser);

  useEffect(() => {
    if (callState === 'idle' && remoteUser && callDuration > 0) {
      // Сохранить в историю
      fetch('/api/calls/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          peer_id: remoteUser.id,
          duration: callDuration,
          timestamp: Date.now(),
        }),
      });
    }
  }, [callState, remoteUser, callDuration]);

  return null;
}
```

## Советы по использованию

### 1. Запрос разрешений

```javascript
// Запросить разрешения заранее
async function requestPermissions() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    console.log('Разрешения получены');
  } catch (err) {
    console.error('Разрешения отклонены:', err);
  }
}
```

### 2. Проверка поддержки WebRTC

```javascript
function checkWebRTCSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Ваш браузер не поддерживает видео звонки');
    return false;
  }
  return true;
}
```

### 3. HTTPS обязателен

```javascript
if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
  alert('Для звонков требуется HTTPS соединение');
}
```

### 4. Обработка фоновых вкладок

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Вкладка в фоне');
    // Можно отключить видео для экономии ресурсов
  } else {
    console.log('Вкладка активна');
  }
});
```
