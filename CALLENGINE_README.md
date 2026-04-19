# 📞 CallEngine - Библиотека для звонков

> Собственная библиотека для управления WebRTC аудио/видео звонками в мессенджере

## 🎯 Что это?

CallEngine - это модульная, легковесная и простая в использовании библиотека для добавления функционала звонков в веб-приложения. Создана специально для этого мессенджера, но может использоваться в любых проектах.

## ✨ Возможности

- ✅ **P2P звонки** - Аудио и видео звонки 1-на-1
- ✅ **Групповые звонки** - До 10 участников одновременно
- ✅ **Демонстрация экрана** - Поделиться экраном одним кликом
- ✅ **Управление медиа** - Вкл/выкл микрофона и камеры
- ✅ **Автопереподключение** - Восстановление при обрыве связи
- ✅ **React интеграция** - Готовые хуки для React
- ✅ **Простой API** - 10 строк кода для звонка
- ✅ **Полностью протестировано** - 15+ unit тестов

## 🚀 Быстрый старт

### 1. Импорт

```jsx
import { useCallEngine } from './hooks/useCallEngine';
```

### 2. Использование

```jsx
function MyComponent({ currentUser }) {
  const { startCall } = useCallEngine(currentUser);

  return (
    <button onClick={() => startCall(targetUser, 'video')}>
      📞 Позвонить
    </button>
  );
}
```

### 3. Готово! 🎉

Полный пример в [QUICKSTART_CALLENGINE.md](messenger/client/QUICKSTART_CALLENGINE.md)

## 📁 Структура проекта

```
messenger/client/
├── src/
│   ├── lib/
│   │   ├── CallEngine.js              # ⭐ Основная библиотека
│   │   ├── SignalingAdapter.js        # WebSocket адаптер
│   │   ├── README.md                  # Полная документация
│   │   ├── EXAMPLES.md                # 12 примеров использования
│   │   ├── ARCHITECTURE.md            # Архитектура системы
│   │   ├── package.json               # Метаданные
│   │   └── __tests__/
│   │       └── CallEngine.test.js     # Unit тесты
│   ├── hooks/
│   │   └── useCallEngine.js           # ⭐ React Hook
│   └── components/
│       └── SimpleCallUI.jsx           # ⭐ Готовый UI
├── QUICKSTART_CALLENGINE.md           # 🚀 Быстрый старт
└── MIGRATION_TO_CALLENGINE.md         # Миграция со старого кода
```

## 📚 Документация

### Для начинающих
- 🚀 [Быстрый старт](messenger/client/QUICKSTART_CALLENGINE.md) - 5 минут до первого звонка
- 📖 [Примеры](messenger/client/src/lib/EXAMPLES.md) - 12 готовых примеров

### Для разработчиков
- 📘 [API Reference](messenger/client/src/lib/README.md) - Полная документация API
- 🏗️ [Архитектура](messenger/client/src/lib/ARCHITECTURE.md) - Как это работает
- 🔄 [Миграция](messenger/client/MIGRATION_TO_CALLENGINE.md) - Переход со старого кода

### Для продвинутых
- 🧪 [Тесты](messenger/client/src/lib/__tests__/CallEngine.test.js) - Unit тесты
- 📦 [package.json](messenger/client/src/lib/package.json) - Метаданные библиотеки

## 💡 Примеры использования

### Базовый звонок

```jsx
const { startCall } = useCallEngine(currentUser);
await startCall(targetUser, 'audio');
```

### Входящий звонок

```jsx
const { callState, answerCall, rejectCall } = useCallEngine(currentUser);

if (callState === 'incoming') {
  return (
    <div>
      <button onClick={answerCall}>Ответить</button>
      <button onClick={rejectCall}>Отклонить</button>
    </div>
  );
}
```

### Управление микрофоном

```jsx
const { toggleMic, micEnabled } = useCallEngine(currentUser);

<button onClick={toggleMic}>
  {micEnabled ? '🎤 Выкл' : '🔇 Вкл'}
</button>
```

### Демонстрация экрана

```jsx
const { shareScreen } = useCallEngine(currentUser);

<button onClick={shareScreen}>
  🖥️ Поделиться экраном
</button>
```

Больше примеров в [EXAMPLES.md](messenger/client/src/lib/EXAMPLES.md)

## 🎨 Архитектура

```
React Component
      ↓
useCallEngine Hook
      ↓
CallEngine (Core)
      ↓
SignalingAdapter
      ↓
WebSocket
      ↓
Server
```

Подробнее в [ARCHITECTURE.md](messenger/client/src/lib/ARCHITECTURE.md)

## 🧪 Тестирование

```bash
# Запустить тесты
npm test -- CallEngine.test.js

# С покрытием
npm test -- --coverage CallEngine.test.js

# Watch mode
npm test -- --watch CallEngine.test.js
```

## 📊 Сравнение

### Было (CallManager.jsx)
```jsx
// 600+ строк кода
const [callState, setCallState] = useState('idle');
const [remoteUser, setRemoteUser] = useState(null);
const pcRef = useRef(null);
// ... еще 20+ состояний

const startCall = useCallback(async (targetUser, type) => {
  // 50+ строк кода
  const stream = await getMedia(type);
  const pc = createPeerConnection(targetUser.id);
  // ...
}, [/* много зависимостей */]);
```

### Стало (CallEngine)
```jsx
// 10 строк кода
const { startCall } = useCallEngine(currentUser);

<button onClick={() => startCall(targetUser, 'video')}>
  Позвонить
</button>
```

## 🔧 Требования

- React 18+
- WebRTC поддержка в браузере
- HTTPS (для доступа к камере/микрофону)
- WebSocket соединение

## 🌐 Совместимость

- ✅ Chrome 74+
- ✅ Firefox 66+
- ✅ Safari 12.1+
- ✅ Edge 79+

## 🚀 Интеграция

### Вариант 1: Использовать готовый UI

```jsx
import SimpleCallUI from './components/SimpleCallUI';

function App() {
  return (
    <div>
      <MainContent />
      <SimpleCallUI currentUser={currentUser} />
    </div>
  );
}
```

### Вариант 2: Создать свой UI

```jsx
import { useCallEngine } from './hooks/useCallEngine';

function MyCallUI({ currentUser }) {
  const {
    callState,
    startCall,
    answerCall,
    endCall,
  } = useCallEngine(currentUser);

  // Твой UI здесь
}
```

### Вариант 3: Использовать напрямую

```javascript
import { CallEngine } from './lib/CallEngine';
import { SignalingAdapter } from './lib/SignalingAdapter';

const signaling = new SignalingAdapter(websocket);
const engine = new CallEngine({ signaling });

await engine.startCall(userId, 'video');
```

## 📈 Преимущества

| Характеристика | Старый код | CallEngine |
|---------------|-----------|------------|
| Строк кода | 600+ | 10 |
| Сложность | Высокая | Низкая |
| Тестируемость | Сложно | Легко |
| Переиспользование | Нет | Да |
| Документация | Нет | Полная |
| Примеры | Нет | 12+ |
| Тесты | Нет | 15+ |

## 🎯 Что дальше?

### Базовые функции
- [x] P2P аудио звонки
- [x] P2P видео звонки
- [x] Групповые звонки
- [x] Демонстрация экрана
- [x] Управление микрофоном/камерой

### Расширенные функции (можно добавить)
- [ ] Запись звонков
- [ ] Виртуальные фоны
- [ ] Эффекты и фильтры
- [ ] Статистика качества
- [ ] Шумоподавление AI
- [ ] Автоматические субтитры

## 🤝 Вклад

Библиотека готова к использованию и расширению. Все компоненты хорошо документированы и протестированы.

### Как добавить новую функцию?

1. Расширить `CallEngine.js`
2. Добавить метод в `useCallEngine.js`
3. Написать тесты
4. Обновить документацию

Пример:
```javascript
// В CallEngine.js
async recordCall() {
  const recorder = new MediaRecorder(this.localStream);
  recorder.start();
  return recorder;
}

// В useCallEngine.js
const recordCall = useCallback(() => {
  return engineRef.current?.recordCall();
}, []);

return { ...other, recordCall };
```

## 📝 Лицензия

MIT

## 👥 Авторы

Messenger Team

## 📞 Поддержка

Если возникли вопросы:
1. Проверь [Быстрый старт](messenger/client/QUICKSTART_CALLENGINE.md)
2. Посмотри [Примеры](messenger/client/src/lib/EXAMPLES.md)
3. Прочитай [API Reference](messenger/client/src/lib/README.md)
4. Изучи [Архитектуру](messenger/client/src/lib/ARCHITECTURE.md)

## 🎉 Заключение

CallEngine - это современная, модульная и легко тестируемая библиотека для звонков. 

**Преимущества:**
- ✅ Простой API
- ✅ Полная документация
- ✅ Готовые примеры
- ✅ Unit тесты
- ✅ React интеграция
- ✅ Легко расширяется

**Время интеграции:** 5-10 минут  
**Сложность:** Легко  
**Результат:** Работающие звонки ✅

---

**Создано:** 2026-04-17  
**Версия:** 1.0.0  
**Статус:** ✅ Готово к использованию

🚀 Начни использовать прямо сейчас: [QUICKSTART_CALLENGINE.md](messenger/client/QUICKSTART_CALLENGINE.md)
