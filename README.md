# 🍪 CookieMessenger

Полнофункциональный мессенджер с лентой, звонками и админ-панелью.

## Стек

- **Frontend**: React 18 + Vite + lucide-react
- **Backend**: Node.js + Express
- **БД**: SQLite (better-sqlite3)
- **Реальное время**: WebSocket (ws)
- **Авторизация**: JWT + bcrypt

## Функции

- Регистрация / вход с JWT-авторизацией
- Профиль с аватаром, баннером, акцент-цветом
- Лента: посты (текст / фото / видео / опросы), лайки, комментарии, @упоминания
- Личные сообщения с медиа, эмодзи, стикерами, GIF
- Друзья: заявки, принять / отклонить / удалить
- Подписки на пользователей
- WebRTC звонки: аудио, видео, демонстрация экрана
- Уведомления в реальном времени (WS + Push API)
- Онлайн-статус пользователей
- Публичные профили
- Админ-панель (только `yamekel0@gmail.com`): статистика, управление пользователями, рассылка

## Запуск

### 1. Установить зависимости

```bash
# Сервер
cd messenger/server
npm install

# Клиент
cd messenger/client
npm install
```

### 2. Настроить переменные окружения

```bash
cp messenger/server/.env.example messenger/server/.env
# Отредактируй JWT_SECRET на свой случайный ключ
```

### 3. Запустить

```bash
# Сервер (порт 3001)
cd messenger/server
node index.js

# Клиент (порт 5173)
cd messenger/client
npm run dev
```

Открыть: http://localhost:5173

## Структура

```
messenger/
├── client/          # React + Vite
│   └── src/
│       ├── components/   # CallManager, EmojiPicker, PostCard, ...
│       ├── hooks/        # useWebSocket.js
│       └── pages/        # Feed, Messages, Profile, Admin, ...
└── server/          # Express API
    ├── middleware/   # auth.js, security.js
    ├── routes/       # auth, feed, messages, friends, users, admin, ...
    ├── db.js         # SQLite schema
    ├── ws.js         # WebSocket сервер
    └── index.js      # Entry point
```

## Безопасность

- Rate limiting: 10 попыток входа / 15 мин, 200 req/min на API
- JWT с `issuer` проверкой, срок 7 дней
- bcrypt cost factor 12
- Защита от timing attacks при логине
- Проверка бана на каждый запрос
- Санитизация всех входящих текстовых полей (XSS)
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- CORS ограничен только localhost:5173
- WS: rate limit подключений по IP, лимит сообщений, whitelist событий
- Валидация формата username / email / пароля при регистрации
