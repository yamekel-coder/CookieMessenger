# Руководство по миграции на новую систему аутентификации

## Шаг 1: Установка зависимостей

```bash
cd deploy
npm install
```

Это установит новую зависимость `cookie-parser`.

## Шаг 2: Обновление .env файла

Скопируйте `.env.example` в `.env` (если еще не сделали) и добавьте новые переменные:

```env
# JWT Configuration
JWT_SECRET=your_strong_random_secret_here_min_32_chars
JWT_REFRESH_SECRET=your_refresh_token_secret_different_from_jwt_secret
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

**ВАЖНО:** Используйте разные секреты для `JWT_SECRET` и `JWT_REFRESH_SECRET`!

Для генерации безопасных секретов можно использовать:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Шаг 3: Автоматическая миграция БД

При первом запуске сервера новые таблицы создадутся автоматически:
- `refresh_tokens` - хранение refresh токенов
- `login_history` - история входов

Никаких дополнительных действий не требуется!

## Шаг 4: Запуск сервера

```bash
npm start
# или для разработки
npm run dev
```

## Шаг 5: Обновление клиентского кода (опционально)

Если вы хотите использовать новые возможности на клиенте:

1. Добавьте поддержку refresh tokens (см. `CLIENT_AUTH_EXAMPLE.md`)
2. Обновите axios interceptor для автоматического обновления токенов
3. Добавьте обработку новых кодов ошибок (`TOKEN_EXPIRED`, `ACCOUNT_LOCKED`, и т.д.)

## Обратная совместимость

Все изменения **полностью обратно совместимы**:

✅ Старые токены продолжат работать
✅ Существующие роуты не изменились
✅ API endpoints остались прежними
✅ Клиент может продолжать работать без изменений

## Новые возможности (опционально)

После миграции вы можете использовать:

### 1. Refresh Token Flow
```javascript
// Клиент может обновлять токены без повторного входа
POST /api/auth/refresh
```

### 2. Session Management
```javascript
// Просмотр активных сессий
GET /api/auth/sessions

// Выход со всех устройств
POST /api/auth/logout-all
```

### 3. Login History
```javascript
// История входов
GET /api/auth/login-history
```

### 4. Role-Based Access Control
```javascript
const { auth, requireAdmin, requireRole } = require('./middleware/auth');

// Только для админов
router.delete('/users/:id', auth, requireAdmin, handler);

// Для админов или модераторов
router.post('/moderate', auth, requireRole('admin', 'moderator'), handler);
```

### 5. Email Verification Check
```javascript
const { auth, requireVerified } = require('./middleware/auth');

router.post('/premium', auth, requireVerified, handler);
```

## Проверка работоспособности

После запуска проверьте:

1. **Регистрация работает:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'
```

2. **Вход работает:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

3. **Проверьте логи:**
```
[AUTH] 2024-01-01T00:00:00.000Z | REGISTER_SUCCESS | User: 1 | {"username":"testuser","ip":"::1"}
[AUTH] 2024-01-01T00:00:00.000Z | LOGIN_SUCCESS | User: 1 | {"ip":"::1","device":"Desktop"}
```

## Откат (если что-то пошло не так)

Если нужно откатиться к старой версии:

1. Восстановите старый `deploy/middleware/auth.js` из git:
```bash
git checkout HEAD -- deploy/middleware/auth.js
```

2. Удалите новые файлы:
```bash
rm deploy/utils/tokenManager.js
```

3. Восстановите старый `deploy/routes/auth.js`:
```bash
git checkout HEAD -- deploy/routes/auth.js
```

4. Перезапустите сервер

Новые таблицы в БД можно оставить - они не помешают.

## Поддержка

Если возникли проблемы:

1. Проверьте логи сервера
2. Убедитесь, что все переменные окружения установлены
3. Проверьте, что `cookie-parser` установлен
4. Убедитесь, что CORS настроен правильно

## Дополнительная документация

- `AUTH_IMPROVEMENTS.md` - полное описание всех улучшений
- `CLIENT_AUTH_EXAMPLE.md` - примеры использования на клиенте
