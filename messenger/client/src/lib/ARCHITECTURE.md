# Архитектура CallEngine

## Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ SimpleCallUI │  │   Messages   │  │   Profile    │          │
│  │              │  │              │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      React Hook Layer                            │
│                                                                   │
│                    ┌──────────────────┐                          │
│                    │  useCallEngine   │                          │
│                    │                  │                          │
│                    │  • State Mgmt    │                          │
│                    │  • Event Handler │                          │
│                    │  • Lifecycle     │                          │
│                    └────────┬─────────┘                          │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Core Engine Layer                           │
│                                                                   │
│                    ┌──────────────────┐                          │
│                    │   CallEngine     │                          │
│                    │                  │                          │
│                    │  ┌────────────┐  │                          │
│                    │  │Connection  │  │                          │
│                    │  │Management  │  │                          │
│                    │  └────────────┘  │                          │
│                    │                  │                          │
│                    │  ┌────────────┐  │                          │
│                    │  │   Media    │  │                          │
│                    │  │  Control   │  │                          │
│                    │  └────────────┘  │                          │
│                    │                  │                          │
│                    │  ┌────────────┐  │                          │
│                    │  │   Event    │  │                          │
│                    │  │  System    │  │                          │
│                    │  └────────────┘  │                          │
│                    └────────┬─────────┘                          │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Signaling Layer                               │
│                                                                   │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │SignalingAdapter  │              │GroupCallSignaling│         │
│  │                  │              │                  │         │
│  │  • P2P Calls     │              │  • Group Calls   │         │
│  │  • Offer/Answer  │              │  • Room Mgmt     │         │
│  │  • ICE           │              │  • Participants  │         │
│  └────────┬─────────┘              └────────┬─────────┘         │
└───────────┼──────────────────────────────────┼───────────────────┘
            │                                  │
            └──────────────┬───────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket Layer                               │
│                                                                   │
│                    ┌──────────────────┐                          │
│                    │   WebSocket      │                          │
│                    │   Connection     │                          │
│                    └────────┬─────────┘                          │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Server Layer                                │
│                                                                   │
│                    ┌──────────────────┐                          │
│                    │   ws.js          │                          │
│                    │   (WebSocket     │                          │
│                    │    Server)       │                          │
│                    └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Поток данных

### 1. Начало звонка (Outgoing Call)

```
User Action
    │
    ▼
SimpleCallUI.onClick()
    │
    ▼
useCallEngine.startCall(targetUser, 'video')
    │
    ▼
CallEngine.startCall()
    │
    ├─► getUserMedia() ──► Local Stream
    │
    ├─► createConnection() ──► RTCPeerConnection
    │
    ├─► addTracks() ──► Add local tracks to PC
    │
    ├─► createOffer() ──► SDP Offer
    │
    └─► SignalingAdapter.sendOffer()
            │
            ▼
        WebSocket.send()
            │
            ▼
        Server (ws.js)
            │
            ▼
        Target User
```

### 2. Входящий звонок (Incoming Call)

```
Server (ws.js)
    │
    ▼
WebSocket.onmessage('call_offer')
    │
    ▼
SignalingAdapter.emit('offer')
    │
    ▼
CallEngine.on('offer')
    │
    ▼
useCallEngine (state update)
    │
    ├─► callState = 'incoming'
    ├─► remoteUser = {...}
    └─► emit('incomingCall')
            │
            ▼
        SimpleCallUI (render incoming UI)
            │
            ▼
        User clicks "Answer"
            │
            ▼
        useCallEngine.answerCall()
            │
            ▼
        CallEngine.answerCall()
            │
            ├─► getUserMedia()
            ├─► createConnection()
            ├─► setRemoteDescription(offer)
            ├─► createAnswer()
            └─► SignalingAdapter.sendAnswer()
```

### 3. ICE Candidate Exchange

```
RTCPeerConnection.onicecandidate
    │
    ▼
CallConnection._setupHandlers()
    │
    ▼
SignalingAdapter.sendIce(candidate)
    │
    ▼
WebSocket.send('call_ice')
    │
    ▼
Server forwards to peer
    │
    ▼
Peer receives 'call_ice'
    │
    ▼
CallConnection.addIceCandidate()
    │
    ▼
RTCPeerConnection.addIceCandidate()
```

### 4. Media Stream Flow

```
Local Device (Camera/Mic)
    │
    ▼
getUserMedia()
    │
    ▼
MediaStream
    │
    ├─► Local Video Element (preview)
    │
    └─► RTCPeerConnection.addTrack()
            │
            ▼
        ICE/STUN/TURN Negotiation
            │
            ▼
        Peer RTCPeerConnection
            │
            ▼
        ontrack event
            │
            ▼
        Remote MediaStream
            │
            ▼
        Remote Video Element
```

## Компоненты

### CallEngine (Core)

**Ответственность:**
- Управление WebRTC соединениями
- Создание и управление RTCPeerConnection
- Управление медиа-потоками
- Система событий
- Retry логика

**Основные методы:**
```javascript
startCall(peerId, type)
answerCall(peerId, offer)
hangup(peerId)
toggleMic()
toggleCamera()
shareScreen()
```

**События:**
```javascript
'incomingCall'
'callStarted'
'callConnected'
'callEnded'
'remoteTrack'
'error'
```

### CallConnection

**Ответственность:**
- Управление одним P2P соединением
- Обработка ICE кандидатов
- Мониторинг состояния соединения
- Retry при обрыве

**Состояния:**
```
new → connecting → connected → [disconnected] → closed
                                     ↓
                                  restartICE
```

### SignalingAdapter

**Ответственность:**
- Абстракция над WebSocket
- Отправка сигналов (offer, answer, ice)
- Получение сигналов от сервера
- Преобразование событий

**Протокол:**
```javascript
// Отправка
{ event: 'call_offer', to: userId, data: { offer, type } }
{ event: 'call_answer', to: userId, data: { answer } }
{ event: 'call_ice', to: userId, data: { candidate } }

// Получение
{ event: 'call_offer', from: userId, offer, type }
{ event: 'call_answer', from: userId, answer }
{ event: 'call_ice', from: userId, candidate }
```

### useCallEngine Hook

**Ответственность:**
- React интеграция
- Управление состоянием UI
- Lifecycle management
- Автоматическая очистка

**State:**
```javascript
{
  callState: 'idle' | 'incoming' | 'calling' | 'active',
  remoteUser: User | null,
  callType: 'audio' | 'video',
  localStream: MediaStream | null,
  remoteStreams: Map<userId, MediaStream>,
  micEnabled: boolean,
  cameraEnabled: boolean,
  error: string | null,
  callDuration: number
}
```

## Состояния звонка

```
┌──────┐
│ IDLE │ ◄─────────────────────────────┐
└───┬──┘                                │
    │                                   │
    │ startCall()                       │
    ▼                                   │
┌─────────┐                             │
│ CALLING │                             │
└────┬────┘                             │
     │                                  │
     │ answer received                  │
     ▼                                  │
┌────────┐                              │
│ ACTIVE │                              │
└────┬───┘                              │
     │                                  │
     │ hangup() / error                 │
     └──────────────────────────────────┘

     ┌──────┐
     │ IDLE │
     └───┬──┘
         │
         │ offer received
         ▼
     ┌──────────┐
     │ INCOMING │
     └─────┬────┘
           │
           ├─► answerCall() ──► ACTIVE
           │
           └─► rejectCall() ──► IDLE
```

## ICE Connection States

```
┌─────┐
│ NEW │
└──┬──┘
   │
   ▼
┌────────────┐
│ CONNECTING │ ◄──────────┐
└──────┬─────┘            │
       │                  │
       ▼                  │
┌───────────┐             │
│ CONNECTED │             │
└──────┬────┘             │
       │                  │
       ├─► COMPLETED      │
       │                  │
       ├─► DISCONNECTED ──┘ (restartICE)
       │
       └─► FAILED ──► retry (max 3) ──► CLOSED
```

## Обработка ошибок

```
Error Source
    │
    ├─► getUserMedia() failed
    │       └─► emit('error', 'Нет доступа к камере/микрофону')
    │
    ├─► ICE Connection failed
    │       └─► retry (3 attempts)
    │               └─► emit('error', 'Не удалось установить соединение')
    │
    ├─► Signaling error
    │       └─► emit('error', 'Ошибка сигнализации')
    │
    └─► Network error
            └─► restartICE()
                    └─► retry with exponential backoff
```

## Retry Strategy

```javascript
Attempt 1: immediate
Attempt 2: 1.5s delay
Attempt 3: 3s delay
Attempt 4: 5s delay (max)

After 3 failed attempts → emit('error')
```

## Memory Management

```
Call Start:
    ├─► Create RTCPeerConnection
    ├─► Create MediaStream
    └─► Register event listeners

Call End:
    ├─► Close RTCPeerConnection
    ├─► Stop all MediaStream tracks
    ├─► Remove event listeners
    ├─► Clear references
    └─► Garbage collection
```

## Performance Considerations

### Оптимизации:
1. **Lazy Loading** - MediaStream создается только при необходимости
2. **Connection Pooling** - Переиспользование соединений
3. **Event Debouncing** - Ограничение частоты событий
4. **Memory Cleanup** - Автоматическая очистка при unmount

### Метрики:
- Time to first frame: < 2s
- ICE gathering time: < 1s
- Connection establishment: < 3s
- Memory usage: ~50MB per call

## Security

### Защита:
1. **HTTPS Required** - Обязательно для getUserMedia
2. **Token Authentication** - JWT токены для WebSocket
3. **Privacy Settings** - Проверка настроек приватности
4. **Rate Limiting** - Ограничение частоты запросов

### Приватность:
- Проверка `privacy_who_can_call` перед звонком
- Блокировка звонков от незнакомцев (если настроено)
- Логирование всех звонков для аудита

## Масштабирование

### Текущие ограничения:
- P2P: 1-1 звонки
- Group: до 10 участников (mesh topology)

### Для масштабирования:
1. **SFU (Selective Forwarding Unit)** - для больших групп
2. **MCU (Multipoint Control Unit)** - для конференций
3. **Load Balancing** - распределение нагрузки
4. **CDN** - для медиа-контента

## Мониторинг

### Метрики для отслеживания:
```javascript
- Call success rate
- Average call duration
- ICE connection failures
- Media quality (bitrate, packet loss)
- User experience (time to connect)
```

### Логирование:
```javascript
console.log('[CallEngine] Event:', eventName, data);
console.error('[CallEngine] Error:', error);
```

## Расширяемость

### Плагины (будущее):
```javascript
engine.use(RecordingPlugin);
engine.use(VirtualBackgroundPlugin);
engine.use(NoiseSuppressionPlugin);
```

### Кастомизация:
```javascript
const engine = new CallEngine({
  signaling,
  iceServers: customServers,
  constraints: customConstraints,
  retryStrategy: customRetry,
});
```
