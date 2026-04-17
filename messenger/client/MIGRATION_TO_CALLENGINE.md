# Миграция на CallEngine

Руководство по переходу от текущей реализации звонков к новой библиотеке CallEngine.

## Преимущества новой библиотеки

### Было (CallManager.jsx)
- ❌ 600+ строк кода в одном компоненте
- ❌ Сложная логика управления состоянием
- ❌ Дублирование кода для разных типов звонков
- ❌ Сложно тестировать
- ❌ Сложно переиспользовать

### Стало (CallEngine)
- ✅ Модульная архитектура
- ✅ Простой API
- ✅ Легко тестировать
- ✅ Переиспользуемая библиотека
- ✅ React хуки для интеграции
- ✅ Поддержка TypeScript (можно добавить)

## Сравнение кода

### Старый способ (CallManager.jsx)

```jsx
// Сложная логика в компоненте
const [callState, setCallState] = useState('idle');
const [remoteUser, setRemoteUser] = useState(null);
const pcRef = useRef(null);
const localStreamRef = useRef(null);
// ... еще 20+ состояний

const startCall = useCallback(async (targetUser, type) => {
  // 50+ строк кода для инициализации звонка
  const stream = await getMedia(type);
  const pc = createPeerConnection(targetUser.id);
  addLocalTracks(pc, stream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  wsSend('call_offer', targetUser.id, { offer, type });
  // ...
}, [/* много зависимостей */]);

// Еще 500 строк кода...
```

### Новый способ (CallEngine)

```jsx
// Простой и чистый код
import { useCallEngine } from '../hooks/useCallEngine';

function MyCallComponent({ currentUser }) {
  const {
    callState,
    remoteUser,
    localStream,
    remoteStreams,
    startCall,
    answerCall,
    endCall,
  } = useCallEngine(currentUser);

  return (
    <div>
      {callState === 'idle' && (
        <button onClick={() => startCall(targetUser, 'video')}>
          Позвонить
        </button>
      )}
      {/* Остальной UI */}
    </div>
  );
}
```

## Пошаговая миграция

### Шаг 1: Установка новой библиотеки

Файлы уже созданы:
- `messenger/client/src/lib/CallEngine.js`
- `messenger/client/src/lib/SignalingAdapter.js`
- `messenger/client/src/hooks/useCallEngine.js`

### Шаг 2: Обновление WebSocket обработчиков

#### Было:
```jsx
useWebSocket({
  call_offer: (data) => {
    // Ручная обработка
    if (callStateRef.current !== 'idle') {
      wsSend('call_busy', data.from, {});
      return;
    }
    // ... много кода
  },
  // ... остальные обработчики
});
```

#### Стало:
```jsx
// Обработчики регистрируются автоматически в useCallEngine
// Не нужно писать вручную!
```

### Шаг 3: Замена CallManager

#### Было:
```jsx
import CallManager from './components/CallManager';

function App() {
  return (
    <div>
      <CallManager currentUser={currentUser} />
    </div>
  );
}
```

#### Стало:
```jsx
import SimpleCallUI from './components/SimpleCallUI';

function App() {
  return (
    <div>
      <SimpleCallUI currentUser={currentUser} />
    </div>
  );
}
```

### Шаг 4: Обновление глобальной функции звонков

#### Было:
```jsx
window.__startCall = (...args) => startCallRef.current(...args);
```

#### Стало:
```jsx
// В SimpleCallUI или App.jsx
const { startCall } = useCallEngine(currentUser);

useEffect(() => {
  window.__startCall = startCall;
  return () => delete window.__startCall;
}, [startCall]);
```

### Шаг 5: Миграция VoiceChatRoom (опционально)

Групповые звонки также можно мигрировать:

```jsx
import { CallEngine } from '../lib/CallEngine';
import { GroupCallSignaling } from '../lib/SignalingAdapter';

function VoiceChatRoom({ roomId, currentUser }) {
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    const signaling = new GroupCallSignaling(window.ws);
    const callEngine = new CallEngine({ signaling });
    
    signaling.joinRoom(roomId, {
      display_name: currentUser.display_name,
      avatar: currentUser.avatar,
    });

    setEngine(callEngine);

    return () => {
      signaling.leaveRoom();
      callEngine.destroy();
    };
  }, [roomId]);

  // Остальная логика
}
```

## Совместимость

### Серверная часть

Серверная часть (WebSocket обработчики) **не требует изменений**! 

CallEngine использует те же события:
- `call_offer`
- `call_answer`
- `call_ice`
- `call_reject`
- `call_end`
- `call_busy`

### База данных

База данных **не требует изменений**.

### API endpoints

API endpoints **не требуют изменений**.

## План миграции

### Вариант 1: Постепенная миграция (рекомендуется)

1. **Неделя 1**: Добавить CallEngine параллельно с CallManager
2. **Неделя 2**: Тестирование CallEngine на dev окружении
3. **Неделя 3**: Постепенный переход пользователей (A/B тест)
4. **Неделя 4**: Полный переход, удаление CallManager

### Вариант 2: Быстрая миграция

1. **День 1**: Заменить CallManager на SimpleCallUI
2. **День 2**: Тестирование
3. **День 3**: Деплой

## Тестирование

### Чек-лист тестирования

- [ ] Исходящий аудио звонок
- [ ] Исходящий видео звонок
- [ ] Входящий аудио звонок
- [ ] Входящий видео звонок
- [ ] Отклонение звонка
- [ ] Завершение звонка
- [ ] Переключение микрофона
- [ ] Переключение камеры
- [ ] Демонстрация экрана
- [ ] Переподключение при обрыве
- [ ] Звонок занятому пользователю
- [ ] Групповые звонки
- [ ] Проверка приватности (privacy settings)

### Автоматические тесты

```bash
# Запустить тесты
npm test -- CallEngine.test.js
```

## Откат (Rollback)

Если что-то пошло не так:

1. Вернуть старый CallManager:
```jsx
import CallManager from './components/CallManager';
// вместо
import SimpleCallUI from './components/SimpleCallUI';
```

2. Удалить импорты CallEngine (если не используются)

3. Перезапустить приложение

## FAQ

### Q: Нужно ли менять серверный код?
**A:** Нет, серверный код остается без изменений.

### Q: Будут ли работать старые звонки?
**A:** Да, CallEngine полностью совместим с текущей реализацией.

### Q: Можно ли использовать CallEngine в других проектах?
**A:** Да! CallEngine - это независимая библиотека, которую можно использовать в любом React проекте.

### Q: Поддерживает ли CallEngine TypeScript?
**A:** Сейчас нет, но можно легко добавить типы.

### Q: Как добавить новые функции?
**A:** Просто расширьте класс CallEngine или создайте wrapper.

### Q: Что делать с существующими звонками при миграции?
**A:** Завершите все активные звонки перед обновлением или используйте graceful shutdown.

## Дополнительные возможности

После миграции вы сможете легко добавить:

1. **Запись звонков**
```javascript
engine.on('callStarted', () => {
  const recorder = new MediaRecorder(localStream);
  recorder.start();
});
```

2. **Статистика качества**
```javascript
const stats = await engine.getStats(peerId);
console.log('Битрейт:', stats.bitrate);
```

3. **Виртуальные фоны**
```javascript
const processedStream = await applyVirtualBackground(localStream);
engine.replaceTrack('video', processedStream.getVideoTracks()[0]);
```

4. **Эффекты и фильтры**
```javascript
const filteredStream = await applyFilter(localStream, 'blur');
```

## Поддержка

Если возникли вопросы:
1. Проверьте документацию: `messenger/client/src/lib/README.md`
2. Посмотрите примеры: `messenger/client/src/lib/EXAMPLES.md`
3. Запустите тесты: `npm test`

## Заключение

CallEngine - это современная, модульная и легко тестируемая библиотека для звонков. Миграция займет минимум времени и принесет множество преимуществ для дальнейшей разработки.

Удачной миграции! 🚀
