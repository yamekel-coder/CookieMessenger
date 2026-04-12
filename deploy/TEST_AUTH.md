# Тестирование новой системы аутентификации

## Ручное тестирование с curl

### 1. Регистрация нового пользователя

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Ожидаемый результат:**
```json
{"message": "Регистрация успешна"}
```

### 2. Вход в систему

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "rememberMe": false
  }'
```

**Ожидаемый результат:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": 1,
    "username": "testuser",
    ...
  }
}
```

Сохраните токены для следующих тестов:
```bash
ACCESS_TOKEN="<accessToken из ответа>"
REFRESH_TOKEN="<refreshToken из ответа>"
```

### 3. Проверка токена

```bash
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt
```

**Ожидаемый результат:**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "testuser",
    "role": "user",
    "roles": ["user"]
  }
}
```

### 4. Получение активных сессий

```bash
curl -X GET http://localhost:3001/api/auth/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt
```

**Ожидаемый результат:**
```json
{
  "sessions": [
    {
      "id": 1,
      "device_info": "Desktop",
      "ip_address": "::1",
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_used_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 5. Обновление access token

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -c cookies.txt \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

**Ожидаемый результат:**
```json
{
  "accessToken": "eyJhbGc..."
}
```

### 6. История входов

```bash
curl -X GET http://localhost:3001/api/auth/login-history \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt
```

**Ожидаемый результат:**
```json
{
  "history": [
    {
      "id": 1,
      "user_id": 1,
      "ip_address": "::1",
      "user_agent": "curl/7.68.0",
      "device_info": "Desktop",
      "success": 1,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 7. Выход из системы

```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

**Ожидаемый результат:**
```json
{"message": "Выход выполнен"}
```

### 8. Выход со всех устройств

```bash
# Сначала войдите снова
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Затем выйдите со всех устройств
curl -X POST http://localhost:3001/api/auth/logout-all \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt
```

## Тестирование защиты от brute-force

### 1. Множественные неудачные попытки входа

```bash
# Попытка 1-5 (неверный пароль)
for i in {1..5}; do
  echo "Попытка $i"
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "wrongpassword"
    }'
  echo ""
done
```

**Ожидаемый результат после 5 попыток:**
```json
{
  "error": "Слишком много неудачных попыток. Попробуйте через 15 мин.",
  "code": "ACCOUNT_LOCKED"
}
```

### 2. Проверка блокировки

```bash
# Даже с правильным паролем должна быть блокировка
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Ожидаемый результат:**
```json
{
  "error": "Слишком много неудачных попыток. Попробуйте через X мин.",
  "code": "ACCOUNT_LOCKED"
}
```

## Тестирование RBAC (Role-Based Access Control)

### 1. Попытка доступа к админ-панели без прав

```bash
curl -X GET http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Ожидаемый результат:**
```json
{"error": "Нет доступа"}
```

### 2. Назначение роли админа (через БД)

```bash
# Подключитесь к БД и выполните:
sqlite3 deploy/messenger.db "INSERT INTO user_roles (user_id, role) VALUES (1, 'admin');"
```

### 3. Повторная попытка доступа

```bash
# Сначала получите новый токен (чтобы обновить роли в кеше)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Теперь доступ должен быть разрешен
curl -X GET http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer $NEW_ACCESS_TOKEN"
```

**Ожидаемый результат:** Статистика админ-панели

## Тестирование кеширования

### 1. Проверка производительности

```bash
# Первый запрос (без кеша)
time curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt

# Второй запрос (с кешем)
time curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt
```

Второй запрос должен быть быстрее.

### 2. Инвалидация кеша при бане

```bash
# Забаньте пользователя (требуются права админа)
curl -X POST http://localhost:3001/api/admin/users/1/ban \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test ban"}'

# Попытка доступа должна сразу вернуть ошибку
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Ожидаемый результат:**
```json
{
  "error": "Аккаунт заблокирован: Test ban",
  "code": "ACCOUNT_BANNED"
}
```

## Тестирование отзыва токенов

### 1. Logout и попытка использовать старый токен

```bash
# Выход
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"

# Попытка использовать отозванный токен
curl -X GET http://localhost:3001/api/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Ожидаемый результат:**
```json
{"error": "Токен отозван"}
```

## Проверка логов

После выполнения тестов проверьте логи сервера:

```bash
tail -f logs/server.log
```

Вы должны увидеть:
```
[AUTH] 2024-01-01T00:00:00.000Z | REGISTER_SUCCESS | User: 1 | {"username":"testuser","ip":"::1"}
[AUTH] 2024-01-01T00:00:00.000Z | LOGIN_SUCCESS | User: 1 | {"ip":"::1","device":"Desktop"}
[AUTH] 2024-01-01T00:00:00.000Z | LOGIN_FAILED | User: 1 | {"email":"test@example.com","ip":"::1"}
[AUTH] 2024-01-01T00:00:00.000Z | TOKEN_REFRESHED | User: 1 | {"ip":"::1"}
[AUTH] 2024-01-01T00:00:00.000Z | LOGOUT | User: 1 | {"ip":"::1"}
```

## Автоматизированное тестирование (опционально)

Создайте файл `test-auth.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3001/api"

echo "=== Testing Registration ==="
curl -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}' \
  -w "\nStatus: %{http_code}\n\n"

echo "=== Testing Login ==="
RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"password123"}')

echo $RESPONSE | jq .
ACCESS_TOKEN=$(echo $RESPONSE | jq -r .accessToken)
REFRESH_TOKEN=$(echo $RESPONSE | jq -r .refreshToken)

echo "=== Testing Token Verification ==="
curl -X GET $BASE_URL/auth/verify \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt \
  -w "\nStatus: %{http_code}\n\n" | jq .

echo "=== Testing Sessions ==="
curl -X GET $BASE_URL/auth/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -b cookies.txt \
  -w "\nStatus: %{http_code}\n\n" | jq .

echo "=== Testing Refresh Token ==="
curl -X POST $BASE_URL/auth/refresh \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" \
  -w "\nStatus: %{http_code}\n\n" | jq .

echo "=== Testing Logout ==="
curl -X POST $BASE_URL/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" \
  -w "\nStatus: %{http_code}\n\n" | jq .

echo "=== All tests completed ==="
```

Запустите:
```bash
chmod +x test-auth.sh
./test-auth.sh
```

## Нагрузочное тестирование (опционально)

Используйте `ab` (Apache Bench) или `wrk`:

```bash
# Установка ab (если нужно)
sudo apt-get install apache2-utils

# Тест rate limiting
ab -n 100 -c 10 -p login.json -T application/json \
  http://localhost:3001/api/auth/login
```

Где `login.json`:
```json
{"email":"test@example.com","password":"password123"}
```

**Ожидаемый результат:** Часть запросов должна получить 429 (Too Many Requests)
