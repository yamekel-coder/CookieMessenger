# 🍪 CookieMessenger

Полнофункциональный мессенджер с лентой, звонками, GIF, стикерами и админ-панелью.

## Возможности

- Регистрация / вход (JWT + bcrypt)
- Профиль: аватар, баннер, акцент-цвет, био
- Лента: посты (текст / фото / видео / опросы), лайки, комментарии, @упоминания
- Личные сообщения с медиа, эмодзи, стикерами, GIF
- Друзья: заявки, принять / отклонить / удалить
- Подписки на пользователей
- WebRTC звонки: аудио, видео, демонстрация экрана
- Уведомления в реальном времени (WebSocket + Push API)
- Онлайн-статус пользователей
- Публичные профили
- Админ-панель (только `yamekel0@gmail.com`): статистика, управление пользователями, рассылка

## Стек

| Часть | Технологии |
|-------|-----------|
| Frontend | React 18, Vite, lucide-react, react-easy-crop |
| Backend | Node.js, Express |
| БД | SQLite (better-sqlite3) |
| Реальное время | WebSocket (ws) |
| Авторизация | JWT (jsonwebtoken), bcryptjs |

---

## Локальный запуск (Windows / macOS / Linux)

### Требования

- Node.js 18+ — https://nodejs.org
- Git — https://git-scm.com

### 1. Клонировать репозиторий

```bash
git clone https://github.com/yamekel-coder/CookieMessenger.git
cd CookieMessenger
```

### 2. Установить зависимости

```bash
# Сервер
cd messenger/server
npm install

# Клиент
cd ../client
npm install
```

### 3. Настроить переменные окружения

```bash
cd ../server
cp .env.example .env
```

Открой `messenger/server/.env` и задай свой секрет:

```env
PORT=3001
JWT_SECRET=supersecretkey
```

### 4. Запустить

В двух отдельных терминалах:

```bash
# Терминал 1 — сервер
cd messenger/server
node index.js

# Терминал 2 — клиент
cd messenger/client
npm run dev
```

Открыть: **http://localhost:5173**

---

## Деплой на VDS / VPS (Ubuntu 22.04)

### 1. Подключиться к серверу

```bash
ssh root@ВАШ_IP
```

### 2. Установить Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # должно быть v20.x
```

### 3. Установить Git и PM2

```bash
sudo apt install -y git
sudo npm install -g pm2
```

### 4. Клонировать проект

```bash
cd /var/www
git clone https://github.com/yamekel-coder/CookieMessenger.git
cd CookieMessenger
```

### 5. Установить зависимости

```bash
cd messenger/server && npm install
cd ../client && npm install
```

### 6. Собрать фронтенд

```bash
cd /var/www/CookieMessenger/messenger/client
npm run build
# Готовые файлы будут в dist/
```

### 7. Настроить .env

```bash
cd /var/www/CookieMessenger/messenger/server
cp .env.example .env
nano .env
```

Вставь:

```env
PORT=3001
JWT_SECRET=придумай_длинный_случайный_секрет_минимум_32_символа
```

Сохрани: `Ctrl+O`, `Enter`, `Ctrl+X`

### 8. Запустить сервер через PM2

```bash
cd /var/www/CookieMessenger/messenger/server
pm2 start index.js --name cookiemessenger
pm2 save
pm2 startup  # выполни команду которую выведет PM2
```

Проверить статус:

```bash
pm2 status
pm2 logs cookiemessenger
```

### 9. Установить Nginx

```bash
sudo apt install -y nginx
```

### 10. Настроить Nginx

```bash
sudo nano /etc/nginx/sites-available/cookiemessenger
```

Вставь конфиг (замени `ВАШ_ДОМЕН` на свой домен или IP):

```nginx
server {
    listen 80;
    server_name ВАШ_ДОМЕН;

    # Фронтенд (собранные файлы React)
    root /var/www/CookieMessenger/messenger/client/dist;
    index index.html;

    # SPA — все пути отдаём index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API проксируем на Express
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

Активировать и перезапустить:

```bash
sudo ln -s /etc/nginx/sites-available/cookiemessenger /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 11. Настроить HTTPS (Let's Encrypt) — опционально, но рекомендуется

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ВАШ_ДОМЕН
```

Certbot сам обновит конфиг Nginx и добавит SSL.

### 12. Настроить клиент для продакшена

В файле `messenger/client/src/hooks/useWebSocket.js` WebSocket подключается к `localhost:3001`. На продакшене с Nginx это не нужно — WS идёт через `/ws`. Измени строку подключения:

```js
// Было:
const socket = new WebSocket(`${protocol}://${host}:3001/ws?token=${token}`);

// Стало (для продакшена через Nginx):
const socket = new WebSocket(`${protocol}://${host}/ws?token=${token}`);
```

После изменения пересобери фронтенд:

```bash
cd /var/www/CookieMessenger/messenger/client
npm run build
```

---

## Обновление на VDS

```bash
cd /var/www/CookieMessenger
git pull
cd messenger/server && npm install
cd ../client && npm install && npm run build
pm2 restart cookiemessenger
```

---

## Структура проекта

```
CookieMessenger/
├── messenger/
│   ├── client/                  # React + Vite
│   │   └── src/
│   │       ├── components/      # CallManager, EmojiPicker, PostCard, ...
│   │       ├── hooks/           # useWebSocket.js
│   │       └── pages/           # Feed, Messages, Profile, Admin, ...
│   └── server/                  # Express API
│       ├── middleware/
│       │   ├── auth.js          # JWT проверка
│       │   └── security.js      # Rate limiting, санитизация
│       ├── routes/              # auth, feed, messages, friends, users, admin
│       ├── db.js                # SQLite схема и миграции
│       ├── ws.js                # WebSocket сервер
│       └── index.js             # Entry point
└── README.md
```

---

## Переменные окружения

| Переменная | Описание | По умолчанию |
|-----------|----------|-------------|
| `PORT` | Порт сервера | `3001` |
| `JWT_SECRET` | Секрет для подписи токенов | `supersecretkey` |

---

## Безопасность

- Rate limiting: 10 попыток входа / 15 мин, 500 req/min на API
- JWT срок действия 7 дней
- bcrypt cost factor 12
- Защита от timing attacks при логине
- Проверка бана на каждый запрос
- Санитизация входящих данных (XSS)
- Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- CORS ограничен только фронтендом
- WS: rate limit подключений по IP, лимит сообщений, whitelist событий

---

## Частые проблемы

**"Неверный токен" после обновления**
→ Убедись что `JWT_SECRET` в `.env` совпадает с тем, которым были выданы токены. Если менял секрет — все пользователи должны перелогиниться.

**WebSocket не подключается на VDS**
→ Проверь что в Nginx конфиге есть блок `location /ws` с заголовками `Upgrade` и `Connection`.

**Порт 3001 недоступен снаружи**
→ Это нормально — он должен быть закрыт. Nginx проксирует запросы внутри сервера.

**PM2 не запускается после перезагрузки**
→ Выполни `pm2 startup` и скопируй команду которую он выведет.
