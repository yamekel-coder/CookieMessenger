# CallEngine - Библиотека для аудио/видео звонков

Собственная библиотека для управления WebRTC звонками в мессенджере.

## Возможности

- ✅ P2P аудио/видео звонки
- ✅ Групповые звонки (до 10 участников)
- ✅ Автоматическое переподключение при обрыве
- ✅ Управление микрофоном и камерой
- ✅ Демонстрация экрана
- ✅ Переключение камер (фронтальная/задняя)
- ✅ Простой API
- ✅ React хуки для интеграции

## Архитектура

```
┌─────────────────┐
│  React Component │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  useCallEngine  │  ◄── React Hook
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   CallEngine    │  ◄── Основная логика
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│SignalingAdapter │  ◄── WebSocket адаптер
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   WebSocket     │  ◄── Сигнализация
└─────────────────┘
```

## Быстрый старт

### 1. Использование с React Hook

```jsx
import { useCallEngine } from '../hooks/useCallEngine';

function MyCallComponent({ currentUser }) {
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

  const handleStartCall = async () => {
    const targetUser = { id: 123, username: 'john' };
    await startCall(targetUser, 'video'); // 'audio' или 'video'
  };

  return (
    <div>
      {callState === 'idle' && (
        <button onClick={handleStartCall}>Позвонить</button>
      )}
      
      {callState === 'incoming' && (
        <div>
          <p>Входящий звонок от {remoteUser?.username}</p>
          <button onClick={answerCall}>Ответить</button>
          <button onClick={rejectCall}>Отклонить</button>
        </div>
      )}
      
      {callState === 'active' && (
        <div>
          <video 
            ref={el => el && (el.srcObject = localStream)} 
            autoPlay 
            muted 
          />
          {Array.from(remoteStreams.values()).map((stream, i) => (
            <video 
              key={i}
              ref={el => el && (el.srcObject = stream)} 
              autoPlay 
            />
          ))}
          
          <button onClick={toggleMic}>
            {micEnabled ? 'Выкл. микрофон' : 'Вкл. микрофон'}
          </button>
          <button onClick={toggleCamera}>
            {cameraEnabled ? 'Выкл. камеру' : 'Вкл. камеру'}
          </button>
          <button onClick={endCall}>Завершить</button>
        </div>
      )}
    </div>
  );
}
```

### 2. Прямое использование CallEngine

```javascript
import { CallEngine } from './lib/CallEngine';
import { SignalingAdapter } from './lib/SignalingAdapter';

// Создание адаптера сигнализации
const signaling = new SignalingAdapter(websocket);

// Создание движка звонков
const engine = new CallEngine({
  signaling,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' },
  ],
});

// Подписка на события
engine.on('incomingCall', ({ from, callId, type }) => {
  console.log('Входящий звонок от:', from);
});

engine.on('callConnected', ({ peerId }) => {
  console.log('Звонок подключен:', peerId);
});

engine.on('remoteTrack', ({ peerId, track, streams }) => {
  // Добавить удаленный поток в video элемент
  videoElement.srcObject = streams[0];
});

// Начать звонок
await engine.startCall(targetUserId, 'video');

// Ответить на звонок
await engine.answerCall(fromUserId, offer);

// Завершить звонок
engine.hangup();
```

## API Reference

### CallEngine

#### Constructor

```javascript
new CallEngine(options)
```

**Options:**
- `signaling` (required) - SignalingAdapter instance
- `iceServers` (optional) - Array of ICE servers

#### Methods

##### `startCall(peerId, type)`
Начать звонок пользователю.

- `peerId` - ID пользователя
- `type` - 'audio' или 'video'

```javascript
await engine.startCall(123, 'video');
```

##### `answerCall(peerId, offer)`
Ответить на входящий звонок.

- `peerId` - ID звонящего
- `offer` - SDP offer

```javascript
await engine.answerCall(123, offer);
```

##### `rejectCall(peerId)`
Отклонить входящий звонок.

```javascript
engine.rejectCall(123);
```

##### `hangup(peerId?)`
Завершить звонок.

```javascript
engine.hangup(); // Завершить все звонки
engine.hangup(123); // Завершить звонок с конкретным пользователем
```

##### `toggleMic()`
Включить/выключить микрофон.

```javascript
const enabled = engine.toggleMic();
```

##### `toggleCamera()`
Включить/выключить камеру.

```javascript
const enabled = engine.toggleCamera();
```

##### `switchCamera()`
Переключить между фронтальной и задней камерой.

```javascript
await engine.switchCamera();
```

##### `shareScreen()`
Начать демонстрацию экрана.

```javascript
const screenTrack = await engine.shareScreen();
```

##### `stopScreenShare()`
Остановить демонстрацию экрана.

```javascript
await engine.stopScreenShare();
```

##### `getConnectionState(peerId)`
Получить состояние соединения с пользователем.

```javascript
const state = engine.getConnectionState(123);
// 'new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'
```

##### `isInCall()`
Проверить, идет ли звонок.

```javascript
if (engine.isInCall()) {
  console.log('В звонке');
}
```

#### Events

##### `incomingCall`
Входящий звонок.

```javascript
engine.on('incomingCall', ({ from, callId, type }) => {
  console.log(`Звонок от ${from}, тип: ${type}`);
});
```

##### `callStarted`
Звонок начат.

```javascript
engine.on('callStarted', ({ peerId, callId, type }) => {
  console.log('Звонок начат');
});
```

##### `callConnected`
Звонок подключен.

```javascript
engine.on('callConnected', ({ peerId }) => {
  console.log('Соединение установлено');
});
```

##### `callAnswered`
Звонок принят.

```javascript
engine.on('callAnswered', ({ peerId, callId }) => {
  console.log('Звонок принят');
});
```

##### `callEnded`
Звонок завершен.

```javascript
engine.on('callEnded', ({ peerId }) => {
  console.log('Звонок завершен');
});
```

##### `callRejected`
Звонок отклонен.

```javascript
engine.on('callRejected', ({ peerId }) => {
  console.log('Звонок отклонен');
});
```

##### `callBusy`
Абонент занят.

```javascript
engine.on('callBusy', ({ peerId }) => {
  console.log('Абонент занят');
});
```

##### `localStreamReady`
Локальный поток готов.

```javascript
engine.on('localStreamReady', ({ stream }) => {
  localVideo.srcObject = stream;
});
```

##### `remoteTrack`
Получен удаленный трек.

```javascript
engine.on('remoteTrack', ({ peerId, track, streams }) => {
  remoteVideo.srcObject = streams[0];
});
```

##### `connectionStateChange`
Изменение состояния соединения.

```javascript
engine.on('connectionStateChange', ({ peerId, state }) => {
  console.log(`Состояние: ${state}`);
});
```

##### `micToggled`
Микрофон включен/выключен.

```javascript
engine.on('micToggled', ({ enabled }) => {
  console.log(`Микрофон: ${enabled ? 'вкл' : 'выкл'}`);
});
```

##### `cameraToggled`
Камера включена/выключена.

```javascript
engine.on('cameraToggled', ({ enabled }) => {
  console.log(`Камера: ${enabled ? 'вкл' : 'выкл'}`);
});
```

##### `screenShareStarted`
Демонстрация экрана начата.

```javascript
engine.on('screenShareStarted', () => {
  console.log('Демонстрация экрана начата');
});
```

##### `screenShareStopped`
Демонстрация экрана остановлена.

```javascript
engine.on('screenShareStopped', () => {
  console.log('Демонстрация экрана остановлена');
});
```

##### `error`
Ошибка.

```javascript
engine.on('error', ({ message, error }) => {
  console.error('Ошибка:', message, error);
});
```

## Групповые звонки

Для групповых звонков используйте `GroupCallSignaling`:

```javascript
import { CallEngine } from './lib/CallEngine';
import { GroupCallSignaling } from './lib/SignalingAdapter';

const signaling = new GroupCallSignaling(websocket);
const engine = new CallEngine({ signaling });

// Присоединиться к комнате
signaling.joinRoom(roomId, {
  display_name: 'John Doe',
  avatar: 'https://...',
});

// Покинуть комнату
signaling.leaveRoom();
```

## Примеры

### Простой аудио звонок

```javascript
const engine = new CallEngine({ signaling });

// Начать звонок
await engine.startCall(targetUserId, 'audio');

// Управление микрофоном
engine.toggleMic();

// Завершить
engine.hangup();
```

### Видео звонок с демонстрацией экрана

```javascript
const engine = new CallEngine({ signaling });

// Начать видео звонок
await engine.startCall(targetUserId, 'video');

// Начать демонстрацию экрана
await engine.shareScreen();

// Остановить демонстрацию
await engine.stopScreenShare();

// Завершить
engine.hangup();
```

### Групповой звонок

```javascript
const signaling = new GroupCallSignaling(websocket);
const engine = new CallEngine({ signaling });

// Присоединиться к комнате
signaling.joinRoom(roomId, userData);

// Слушать новых участников
signaling.on('userJoined', ({ user }) => {
  console.log('Присоединился:', user);
});

// Покинуть комнату
signaling.leaveRoom();
```

## Обработка ошибок

```javascript
engine.on('error', ({ message, error }) => {
  switch (message) {
    case 'Failed to share screen':
      alert('Не удалось начать демонстрацию экрана');
      break;
    default:
      console.error('Ошибка:', message, error);
  }
});
```

## Требования

- WebRTC поддержка в браузере
- HTTPS (для доступа к камере/микрофону)
- WebSocket соединение для сигнализации

## Совместимость

- Chrome 74+
- Firefox 66+
- Safari 12.1+
- Edge 79+

## Лицензия

MIT
