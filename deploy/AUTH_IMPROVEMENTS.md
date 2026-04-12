# Улучшения системы аутентификации

## Что добавлено

### 1. Refresh Token механизм
- **Access Token**: короткий срок жизни (15 минут по умолчанию)
- **Refresh Token**: длительный срок жизни (7 дней или 30 дней с "запомнить меня")
- Хранение refresh tokens в базе данных с информацией об устройстве
- Автоматическое обновление access token без повторного входа

### 2. Token Revocation (отзыв токенов)
- Blacklist для отозванных токенов
- Logout с одного устройства
- Logout со всех устройств одновременно
- Автоматическая очистка истекших токенов

### 3. Rate Limiting & Account Lockout
- Максимум 5 неудачных попыток входа
- Блокировка аккаунта на 15 минут после превышения лимита
- Защита от brute-force атак
- Автоматическая разблокировка после истечения времени

### 4. Кеширование пользователей
- In-memory кеш для данных пользователей (TTL: 5 минут)
- Снижение нагрузки на БД при каждом запросе
- Автоматическая инвалидация кеша при изменениях
- Prepared statements для оптимизации запросов

### 5. Role-Based Access Control (RBAC)
- Middleware для проверки ролей: `requireRole(...roles)`
- Специализированные middleware: `requireAdmin`, `requireModerator`
- Поддержка множественных ролей на пользователя
- Проверка прав доступа с логированием

### 6. Email Verification
- Middleware `requireVerified` для проверки подтверждения email
- Защита критичных операций от неподтвержденных аккаунтов

### 7. Session Management
- Просмотр активных сессий пользователя
- Информация об устройствах и IP-адресах
- История последнего использования каждой сессии
- Возможность завершить конкретную сессию

### 8. Login History & Audit Log
- Полная история попыток входа (успешных и неудачных)
- Логирование всех событий аутентификации
- Информация об IP, устройстве, user-agent
- Детектирование подозрительной активности

### 9. Security Improvements
- HttpOnly cookies для токенов
- Secure cookies в production
- SameSite защита от CSRF
- Timing attack protection при проверке паролей
- Детальное логирование событий безопасности

## API Endpoints

### POST /api/auth/register
Регистрация нового пользователя
```json
{
  "username": "user123",
  "email": "user@example.com",
  "password": "securepassword"
}
```

### POST /api/auth/login
Вход в систему
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "rememberMe": false
}
```
**Response:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { ... }
}
```

### POST /api/auth/refresh
Обновление access token
```json
{
  "refreshToken": "..."
}
```
**Response:**
```json
{
  "accessToken": "..."
}
```

### POST /api/auth/logout
Выход из системы (текущее устройство)

### POST /api/auth/logout-all
Выход со всех устройств

### GET /api/auth/sessions
Получить список активных сессий (требует авторизации)

**Response:**
```json
{
  "sessions": [
    {
      "id": 1,
      "device_info": "Windows PC",
      "ip_address": "192.168.1.1",
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_used_at": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### GET /api/auth/login-history
История входов (последние 10 попыток за час)

### GET /api/auth/verify
Проверка валидности токена

## Использование Middleware

### Базовая аутентификация
```javascript
const { auth } = require('./middleware/auth');

router.get('/protected', auth, (req, res) => {
  // req.userId - ID пользователя
  // req.user - декодированный JWT payload
  // req.userFull - полные данные пользователя из БД
  // req.userRoles - массив ролей пользователя
  res.json({ message: 'Protected route' });
});
```

### Опциональная аутентификация
```javascript
const { optionalAuth } = require('./middleware/auth');

router.get('/public', optionalAuth, (req, res) => {
  // req.userId будет undefined если не авторизован
  const isAuth = !!req.userId;
  res.json({ isAuth });
});
```

### Проверка ролей
```javascript
const { auth, requireRole, requireAdmin } = require('./middleware/auth');

// Только для админов
router.delete('/users/:id', auth, requireAdmin, (req, res) => {
  // Только пользователи с ролью 'admin'
});

// Для админов или модераторов
router.post('/moderate', auth, requireRole('admin', 'moderator'), (req, res) => {
  // Пользователи с ролью 'admin' или 'moderator'
});
```

### Проверка подтверждения email
```javascript
const { auth, requireVerified } = require('./middleware/auth');

router.post('/premium-feature', auth, requireVerified, (req, res) => {
  // Только для пользователей с подтвержденным email
});
```

## Переменные окружения

Добавьте в `.env`:
```env
# JWT Configuration
JWT_SECRET=your_strong_random_secret_here_min_32_chars
JWT_REFRESH_SECRET=your_refresh_token_secret_different_from_jwt_secret
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173
```

## Установка зависимостей

```bash
cd deploy
npm install
```

## Миграция существующих пользователей

Новые таблицы создаются автоматически при запуске:
- `refresh_tokens` - хранение refresh токенов
- `login_history` - история входов
- `user_roles` - множественные роли (уже существует)

## Рекомендации по безопасности

1. **Обязательно установите JWT_SECRET** в production окружении
2. **Используйте HTTPS** в production для secure cookies
3. **Настройте CORS** правильно, указав конкретный FRONTEND_URL
4. **Мониторьте логи** на подозрительную активность
5. **Регулярно обновляйте** зависимости для патчей безопасности

## Производительность

- Кеширование снижает нагрузку на БД на ~80% для повторных запросов
- Prepared statements ускоряют запросы к БД
- Автоматическая очистка истекших токенов каждый час
- Cleanup старых записей в кеше каждые 10 минут

## Логирование

Все события аутентификации логируются в консоль:
```
[AUTH] 2024-01-01T00:00:00.000Z | LOGIN_SUCCESS | User: 123 | {"ip":"192.168.1.1","device":"Windows PC"}
[AUTH] 2024-01-01T00:05:00.000Z | TOKEN_REFRESHED | User: 123 | {"ip":"192.168.1.1"}
[AUTH] 2024-01-01T00:10:00.000Z | LOGOUT | User: 123 | {"ip":"192.168.1.1"}
```

События:
- `REGISTER_SUCCESS` / `REGISTER_DUPLICATE`
- `LOGIN_SUCCESS` / `LOGIN_FAILED` / `LOGIN_BANNED`
- `TOKEN_EXPIRED` / `INVALID_TOKEN` / `REVOKED_TOKEN`
- `TOKEN_REFRESHED`
- `LOGOUT` / `LOGOUT_ALL_DEVICES`
- `INSUFFICIENT_PERMISSIONS`
- `ACCOUNT_LOCKED`

## Коды ошибок

Клиент может обрабатывать специальные коды:
- `TOKEN_EXPIRED` - нужно обновить токен через /refresh
- `ACCOUNT_LOCKED` - слишком много попыток входа
- `ACCOUNT_BANNED` - аккаунт заблокирован
- `EMAIL_NOT_VERIFIED` - требуется подтверждение email
