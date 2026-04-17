# 🚀 Быстрый старт CallEngine

## За 5 минут до первого звонка

### Шаг 1: Импорт (30 секунд)

```jsx
import { useCallEngine } from './hooks/useCallEngine';
```

### Шаг 2: Использование хука (1 минута)

```jsx
function MyComponent({ currentUser }) {
  const {
    callState,
    remoteUser,
    startCall,
    answerCall,
    endCall,
  } = useCallEngine(currentUser);

  // Готово! Теперь можно звонить
}
```

### Шаг 3: Добавить кнопку звонка (2 минуты)

```jsx
function CallButton({ targetUser, currentUser }) {
  const { startCall } = useCallEngine(currentUser);

  return (
    <button onClick={() => startCall(targetUser, 'audio')}>
      📞 Позвонить
    </button>
  );
}
```

### Шаг 4: Обработать входящий звонок (1.5 минуты)

```jsx
function IncomingCall({ currentUser }) {
  const { callState, remoteUser, answerCall, rejectCall } = useCallEngine(currentUser);

  if (callState !== 'incoming') return null;

  return (
    <div>
      <p>Звонок от {remoteUser?.username}</p>
      <button onClick={answerCall}>Ответить</button>
      <button onClick={rejectCall}>Отклонить</button>
    </div>
  );
}
```

### Шаг 5: Готово! 🎉

Теперь у вас работают звонки!

---

## Полный пример (копируй и вставляй)

```jsx
import { useCallEngine } from './hooks/useCallEngine';
import { useRef, useEffect } from 'react';

function SimpleCall({ currentUser, targetUser }) {
  const {
    callState,
    remoteUser,
    localStream,
    remoteStreams,
    micEnabled,
    cameraEnabled,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  } = useCallEngine(currentUser);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Подключить локальное видео
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Подключить удаленное видео
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreams.size > 0) {
      const stream = Array.from(remoteStreams.values())[0];
      remoteVideoRef.current.srcObject = stream;
    }
  }, [remoteStreams]);

  // Idle - показать кнопку звонка
  if (callState === 'idle') {
    return (
      <div>
        <button onClick={() => startCall(targetUser, 'video')}>
          🎥 Видео звонок
        </button>
        <button onClick={() => startCall(targetUser, 'audio')}>
          📞 Аудио звонок
        </button>
      </div>
    );
  }

  // Incoming - входящий звонок
  if (callState === 'incoming') {
    return (
      <div className="incoming-call">
        <h3>Звонок от {remoteUser?.username}</h3>
        <button onClick={answerCall}>Ответить</button>
        <button onClick={rejectCall}>Отклонить</button>
      </div>
    );
  }

  // Calling - исходящий звонок
  if (callState === 'calling') {
    return (
      <div className="calling">
        <h3>Звоним {remoteUser?.username}...</h3>
        <button onClick={endCall}>Отменить</button>
      </div>
    );
  }

  // Active - активный звонок
  if (callState === 'active') {
    return (
      <div className="active-call">
        <video ref={remoteVideoRef} autoPlay playsInline />
        <video ref={localVideoRef} autoPlay playsInline muted />
        
        <div className="controls">
          <button onClick={toggleMic}>
            {micEnabled ? '🎤' : '🔇'}
          </button>
          <button onClick={toggleCamera}>
            {cameraEnabled ? '📹' : '📷'}
          </button>
          <button onClick={endCall}>
            ❌ Завершить
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default SimpleCall;
```

---

## Готовый UI компонент

Если не хочешь писать UI сам, используй готовый:

```jsx
import SimpleCallUI from './components/SimpleCallUI';

function App() {
  return (
    <div>
      {/* Твой основной контент */}
      <MainContent />
      
      {/* Overlay для звонков */}
      <SimpleCallUI currentUser={currentUser} />
    </div>
  );
}
```

---

## Глобальная функция для звонков

Хочешь звонить из любого места в приложении?

```jsx
// В App.jsx
const { startCall } = useCallEngine(currentUser);

useEffect(() => {
  window.__startCall = startCall;
  return () => delete window.__startCall;
}, [startCall]);

// Теперь в любом компоненте:
function UserCard({ user }) {
  return (
    <button onClick={() => window.__startCall(user, 'audio')}>
      Позвонить
    </button>
  );
}
```

---

## Частые вопросы

### Q: Как добавить демонстрацию экрана?

```jsx
const { shareScreen, stopScreenShare } = useCallEngine(currentUser);

<button onClick={shareScreen}>🖥️ Поделиться экраном</button>
```

### Q: Как переключить камеру?

```jsx
const { switchCamera } = useCallEngine(currentUser);

<button onClick={switchCamera}>🔄 Переключить камеру</button>
```

### Q: Как показать длительность звонка?

```jsx
const { callDuration } = useCallEngine(currentUser);

<span>{Math.floor(callDuration / 60)}:{callDuration % 60}</span>
```

### Q: Как обработать ошибки?

```jsx
const { error } = useCallEngine(currentUser);

{error && <div className="error">⚠️ {error}</div>}
```

---

## Стили (базовые)

```css
.incoming-call {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.active-call {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: black;
}

.active-call video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
}

.controls button {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.2);
  cursor: pointer;
  font-size: 20px;
}
```

---

## Проверка перед запуском

### 1. HTTPS обязателен

```javascript
if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
  alert('Для звонков требуется HTTPS');
}
```

### 2. Проверка поддержки WebRTC

```javascript
if (!navigator.mediaDevices?.getUserMedia) {
  alert('Ваш браузер не поддерживает звонки');
}
```

### 3. Запрос разрешений

```javascript
// Лучше запросить заранее
async function requestPermissions() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    alert('Разрешите доступ к камере и микрофону');
  }
}
```

---

## Отладка

### Включить логи

```javascript
// В CallEngine.js добавь:
const DEBUG = true;

if (DEBUG) {
  console.log('[CallEngine]', ...args);
}
```

### Проверить WebSocket

```javascript
console.log('WebSocket:', window.ws?.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
```

### Проверить ICE серверы

```javascript
const engine = new CallEngine({
  signaling,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
});

engine.on('connectionStateChange', ({ state }) => {
  console.log('ICE State:', state);
});
```

---

## Что дальше?

### Базовые функции работают? ✅

Теперь можешь:
1. Добавить уведомления
2. Добавить историю звонков
3. Добавить групповые звонки
4. Добавить запись звонков
5. Добавить виртуальные фоны

### Нужна помощь?

Смотри:
- `README.md` - полная документация
- `EXAMPLES.md` - 12 примеров
- `ARCHITECTURE.md` - архитектура
- `MIGRATION_TO_CALLENGINE.md` - миграция

---

## Чек-лист

- [ ] Импортировал `useCallEngine`
- [ ] Добавил кнопку звонка
- [ ] Обработал входящий звонок
- [ ] Добавил управление микрофоном/камерой
- [ ] Протестировал аудио звонок
- [ ] Протестировал видео звонок
- [ ] Добавил обработку ошибок
- [ ] Добавил стили
- [ ] Проверил на HTTPS
- [ ] Готово! 🎉

---

**Время на интеграцию: 5-10 минут**  
**Сложность: Легко**  
**Результат: Работающие звонки** ✅
