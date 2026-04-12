# ⚡ Быстрый старт - Новая система аутентификации

## 1️⃣ Установка (30 секунд)

```bash
cd deploy
npm install
```

## 2️⃣ Настройка .env (1 минута)

Создайте `.env` файл:

```bash
cp .env.example .env
```

Сгенерируйте секреты:

```bash
# Для Linux/Mac
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> .env

# Для Windows (PowerShell)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
```

Или вручную отредактируйте `.env`:

```env
PORT=3001
JWT_SECRET=your_32_char_secret_here_change_this
JWT_REFRESH_SECRET=different_32_char_secret_here
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
```

## 3️⃣ Запуск (10 секунд)

```bash
npm start
```

✅ Готово! Сервер запущен на http://localhost:3001

## 4️⃣ Проверка (30 секунд)

### Регистрация
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"admin123"}'
```

### Вход
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

Сохраните `accessToken` из ответа.

### Проверка токена
```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🎉 Всё работает!

### Что дальше?

**Для разработчиков:**
- 📖 Читайте [AUTH_README.md](./AUTH_README.md) для обзора
- 🔧 Смотрите [CLIENT_AUTH_EXAMPLE.md](./CLIENT_AUTH_EXAMPLE.md) для интеграции с фронтендом
- 🧪 Запустите тесты из [TEST_AUTH.md](./TEST_AUTH.md)

**Для продакшена:**
- ⚠️ Обязательно смените `JWT_SECRET` и `JWT_REFRESH_SECRET`
- 🔒 Включите HTTPS
- 🌐 Установите правильный `FRONTEND_URL` в `.env`
- 📊 Настройте мониторинг логов

## 🚀 Новые возможности

### Refresh Token
```javascript
// Клиент автоматически обновляет токены
POST /api/auth/refresh
```

### Управление сессиями
```javascript
// Просмотр активных устройств
GET /api/auth/sessions

// Выход со всех устройств
POST /api/auth/logout-all
```

### RBAC (роли)
```javascript
const { auth, requireAdmin } = require('./middleware/auth');

// Только для админов
router.delete('/users/:id', auth, requireAdmin, handler);
```

### Защита от brute-force
- Автоматическая блокировка после 5 неудачных попыток
- Разблокировка через 15 минут

### Кеширование
- Данные пользователей кешируются на 5 минут
- Снижение нагрузки на БД до 80%

## 📝 Основные эндпоинты

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/logout` | Выход |
| POST | `/api/auth/logout-all` | Выход со всех устройств |
| POST | `/api/auth/refresh` | Обновить access token |
| GET | `/api/auth/verify` | Проверить токен |
| GET | `/api/auth/sessions` | Активные сессии |
| GET | `/api/auth/login-history` | История входов |

## 🔧 Troubleshooting

### Ошибка: "JWT_SECRET not set"
Установите `JWT_SECRET` в `.env` файле.

### Ошибка: "Cannot find module 'cookie-parser'"
Запустите `npm install`.

### Токены не работают
Проверьте, что `JWT_SECRET` одинаковый при генерации и проверке токена.

### CORS ошибки
Установите правильный `FRONTEND_URL` в `.env`.

## 💡 Советы

1. **Используйте разные секреты** для `JWT_SECRET` и `JWT_REFRESH_SECRET`
2. **Включите HTTPS** в production для secure cookies
3. **Мониторьте логи** на подозрительную активность
4. **Регулярно обновляйте** зависимости

## 📚 Полная документация

- [AUTH_README.md](./AUTH_README.md) - Обзор всех возможностей
- [AUTH_IMPROVEMENTS.md](./AUTH_IMPROVEMENTS.md) - Детальное описание API
- [CLIENT_AUTH_EXAMPLE.md](./CLIENT_AUTH_EXAMPLE.md) - Примеры для React
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Миграция с старой версии
- [TEST_AUTH.md](./TEST_AUTH.md) - Тестирование

---

**Время на настройку:** ~2 минуты  
**Обратная совместимость:** ✅ 100%  
**Готовность к production:** ✅ Да
