# 🏗️ Архитектура системы аутентификации

## 📊 Общая схема

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │  Mobile App  │  │   Desktop    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                  │
│                            │                                      │
└────────────────────────────┼──────────────────────────────────────┘
                             │ HTTPS
                             │
┌────────────────────────────┼──────────────────────────────────────┐
│                            ▼                                      │
│                    ┌───────────────┐                             │
│                    │  Rate Limiter │                             │
│                    └───────┬───────┘                             │
│                            │                                      │
│                    ┌───────▼───────┐                             │
│                    │  CORS Check   │                             │
│                    └───────┬───────┘                             │
│                            │                                      │
│                    ┌───────▼───────┐                             │
│                    │  Auth Routes  │                             │
│                    └───────┬───────┘                             │
│                            │                                      │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                  │
│    ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐           │
│    │ Register│      │   Login   │     │  Refresh  │           │
│    └────┬────┘      └─────┬─────┘     └─────┬─────┘           │
│         │                  │                  │                  │
│         │           ┌──────▼──────┐           │                 │
│         │           │ Brute-Force │           │                 │
│         │           │  Protection │           │                 │
│         │           └──────┬──────┘           │                 │
│         │                  │                  │                  │
│         │           ┌──────▼──────┐           │                 │
│         │           │   Bcrypt    │           │                 │
│         │           │   Verify    │           │                 │
│         │           └──────┬──────┘           │                 │
│         │                  │                  │                  │
│    ┌────▼──────────────────▼──────────────────▼────┐           │
│    │          Token Manager                         │           │
│    │  ┌──────────────────────────────────────┐     │           │
│    │  │  Generate Access Token (15m)         │     │           │
│    │  │  Generate Refresh Token (7d/30d)     │     │           │
│    │  │  Save to DB with device info         │     │           │
│    │  └──────────────────────────────────────┘     │           │
│    └────────────────────┬───────────────────────────┘           │
│                         │                                        │
│                         ▼                                        │
│              ┌──────────────────┐                               │
│              │   Database (SQLite)                              │
│              │  ┌────────────────────────┐                      │
│              │  │ users                  │                      │
│              │  │ refresh_tokens         │                      │
│              │  │ login_history          │                      │
│              │  │ user_roles             │                      │
│              │  └────────────────────────┘                      │
│              └──────────────────┘                               │
│                                                                  │
│                      SERVER                                     │
└──────────────────────────────────────────────────────────────────┘
```

## 🔐 Поток аутентификации

### 1. Регистрация

```
Client                    Server                    Database
  │                         │                          │
  ├─ POST /auth/register ──▶│                          │
  │  {username, email, pwd} │                          │
  │                         │                          │
  │                         ├─ Validate input         │
  │                         ├─ Check rate limit       │
  │                         │                          │
  │                         ├─ Hash password (bcrypt) │
  │                         │                          │
  │                         ├─ INSERT user ───────────▶│
  │                         │                          │
  │                         ├─ Log event              │
  │                         │                          │
  │◀─ {message: "Success"} ─┤                          │
  │                         │                          │
```

### 2. Вход (Login)

```
Client                    Server                    Database
  │                         │                          │
  ├─ POST /auth/login ─────▶│                          │
  │  {email, password}      │                          │
  │                         │                          │
  │                         ├─ Rate limit check       │
  │                         │                          │
  │                         ├─ SELECT user ───────────▶│
  │                         │◀─ user data ─────────────┤
  │                         │                          │
  │                         ├─ Check account lock     │
  │                         ├─ Verify password        │
  │                         ├─ Check ban status       │
  │                         │                          │
  │                         ├─ Generate tokens        │
  │                         │  • Access (15m)          │
  │                         │  • Refresh (7d)          │
  │                         │                          │
  │                         ├─ Save refresh token ────▶│
  │                         ├─ Log login attempt ─────▶│
  │                         │                          │
  │                         ├─ Set HttpOnly cookies   │
  │                         │                          │
  │◀─ {accessToken,        ─┤                          │
  │    refreshToken,        │                          │
  │    user}                │                          │
  │                         │                          │
```

### 3. Защищенный запрос

```
Client                    Server                    Cache/Database
  │                         │                          │
  ├─ GET /api/protected ───▶│                          │
  │  Authorization: Bearer  │                          │
  │                         │                          │
  │                         ├─ Extract token          │
  │                         ├─ Check blacklist        │
  │                         ├─ Verify JWT signature   │
  │                         │                          │
  │                         ├─ Check cache ───────────▶│
  │                         │◀─ user data (if cached) ─┤
  │                         │                          │
  │                         │  (if not cached)         │
  │                         ├─ SELECT user ───────────▶│
  │                         │◀─ user data ─────────────┤
  │                         ├─ Cache user (5min TTL)  │
  │                         │                          │
  │                         ├─ Check ban status       │
  │                         ├─ Check account lock     │
  │                         │                          │
  │                         ├─ Attach user to req     │
  │                         ├─ Call next()            │
  │                         │                          │
  │◀─ {data}               ─┤                          │
  │                         │                          │
```

### 4. Refresh Token

```
Client                    Server                    Database
  │                         │                          │
  ├─ POST /auth/refresh ───▶│                          │
  │  {refreshToken}         │                          │
  │                         │                          │
  │                         ├─ Verify refresh token   │
  │                         │                          │
  │                         ├─ Find token in DB ──────▶│
  │                         │◀─ token record ──────────┤
  │                         │                          │
  │                         ├─ Check expiry           │
  │                         ├─ Update last_used_at ───▶│
  │                         │                          │
  │                         ├─ Generate new access    │
  │                         │   token (15m)            │
  │                         │                          │
  │                         ├─ Set HttpOnly cookie    │
  │                         │                          │
  │◀─ {accessToken}        ─┤                          │
  │                         │                          │
```

### 5. Logout

```
Client                    Server                    Database/Cache
  │                         │                          │
  ├─ POST /auth/logout ────▶│                          │
  │  {refreshToken}         │                          │
  │                         │                          │
  │                         ├─ Add access token to    │
  │                         │   blacklist              │
  │                         │                          │
  │                         ├─ DELETE refresh token ──▶│
  │                         │                          │
  │                         ├─ Clear cookies          │
  │                         │                          │
  │                         ├─ Log event              │
  │                         │                          │
  │◀─ {message: "Logged out"}┤                         │
  │                         │                          │
```

## 🛡️ Защита от атак

### Brute-Force Protection

```
┌─────────────────────────────────────────────────────────┐
│                  Login Attempt                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Check attempts │
         │   in memory    │
         └────────┬───────┘
                  │
         ┌────────▼────────┐
         │ Attempts < 5?   │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   Yes: Allow    │
         │   No: Lock 15m  │
         └─────────────────┘
```

### Token Revocation

```
┌─────────────────────────────────────────────────────────┐
│                    Token Check                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ In blacklist?  │
         └────────┬───────┘
                  │
         ┌────────▼────────┐
         │ Yes: Reject 401 │
         │ No: Continue    │
         └─────────────────┘
```

## 💾 Кеширование

```
┌─────────────────────────────────────────────────────────┐
│                   User Request                          │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Check cache   │
         └────────┬───────┘
                  │
         ┌────────▼────────┐
         │   In cache?     │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │ Yes: Return     │
         │ No: Query DB    │
         └────────┬────────┘
                  │
                  ▼
         ┌────────────────┐
         │  Cache result  │
         │   (TTL: 5m)    │
         └────────────────┘
```

### Cache Invalidation

```
Ban/Unban/Delete/Role Change
         │
         ▼
┌────────────────┐
│ clearUserCache │
│   (userId)     │
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Remove from    │
│ memory cache   │
└────────────────┘
```

## 🔄 Lifecycle токенов

```
┌─────────────────────────────────────────────────────────────┐
│                      Token Lifecycle                        │
└─────────────────────────────────────────────────────────────┘

Login
  │
  ├─▶ Generate Access Token (15m)
  │   └─▶ Stored in: Cookie (HttpOnly) + Response
  │
  └─▶ Generate Refresh Token (7d/30d)
      └─▶ Stored in: Cookie (HttpOnly) + Database + Response

After 15 minutes:
  │
  ├─▶ Access Token expires
  │   └─▶ Client gets 401 with code: TOKEN_EXPIRED
  │
  └─▶ Client calls /auth/refresh
      └─▶ New Access Token generated (15m)

After 7/30 days:
  │
  └─▶ Refresh Token expires
      └─▶ User must login again

On Logout:
  │
  ├─▶ Access Token → Blacklist (in-memory)
  │   └─▶ Auto-removed after 15m
  │
  └─▶ Refresh Token → Deleted from DB
```

## 📊 Структура данных

### In-Memory Stores

```javascript
// User Cache
userCache = Map {
  userId → {
    user: { id, username, email, role, ... },
    cachedAt: timestamp
  }
}

// Token Blacklist
tokenBlacklist = Set {
  "token1",
  "token2",
  ...
}

// Login Attempts
loginAttempts = Map {
  userId → {
    count: number,
    lockedUntil: timestamp
  }
}
```

### Database Tables

```sql
-- Refresh Tokens
refresh_tokens {
  id: INTEGER PRIMARY KEY
  user_id: INTEGER
  token: TEXT UNIQUE
  device_info: TEXT
  ip_address: TEXT
  expires_at: DATETIME
  created_at: DATETIME
  last_used_at: DATETIME
}

-- Login History
login_history {
  id: INTEGER PRIMARY KEY
  user_id: INTEGER
  ip_address: TEXT
  user_agent: TEXT
  device_info: TEXT
  success: INTEGER (0/1)
  failure_reason: TEXT
  created_at: DATETIME
}
```

## 🔌 Middleware Chain

```
Request
  │
  ├─▶ securityHeaders
  │   └─▶ Add security headers
  │
  ├─▶ cors
  │   └─▶ Check origin
  │
  ├─▶ cookieParser
  │   └─▶ Parse cookies
  │
  ├─▶ express.json
  │   └─▶ Parse body
  │
  ├─▶ sanitizeBody
  │   └─▶ Remove XSS
  │
  ├─▶ apiLimiter
  │   └─▶ Rate limit check
  │
  ├─▶ auth
  │   ├─▶ Extract token
  │   ├─▶ Verify JWT
  │   ├─▶ Check blacklist
  │   ├─▶ Get user (cached)
  │   ├─▶ Check ban
  │   └─▶ Attach to req
  │
  ├─▶ requireRole (optional)
  │   └─▶ Check user roles
  │
  └─▶ Route Handler
      └─▶ Business logic
```

## 🎯 Performance Optimizations

### 1. Prepared Statements
```javascript
// Created once, reused many times
const getUserStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserRolesStmt = db.prepare('SELECT role FROM user_roles WHERE user_id = ?');
```

### 2. Caching Strategy
```
First Request:  DB Query (10ms) → Cache (1ms)
Second Request: Cache Hit (1ms) ✓ 90% faster
After 5 min:    Cache Miss → DB Query → Cache
```

### 3. Batch Operations
```javascript
// Transaction for multiple inserts
const insertMany = db.transaction((users) => {
  users.forEach(u => insert.run(u.id, u.data));
});
```

## 🔍 Monitoring Points

### Logs to Monitor
```
[AUTH] LOGIN_FAILED - Track brute-force attempts
[AUTH] ACCOUNT_LOCKED - Alert on lockouts
[AUTH] INSUFFICIENT_PERMISSIONS - Track unauthorized access
[AUTH] REVOKED_TOKEN - Track logout patterns
[TOKEN_CLEANUP] - Monitor cleanup efficiency
```

### Metrics to Track
- Login success/failure rate
- Token refresh frequency
- Cache hit rate
- Average response time
- Active sessions count
- Failed login attempts per IP

## 🚀 Scalability Considerations

### Current (Single Server)
```
┌──────────────────┐
│   Node.js        │
│   ├─ In-Memory   │
│   │  Cache       │
│   └─ SQLite      │
└──────────────────┘
```

### Future (Multi-Server)
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Node.js  │  │ Node.js  │  │ Node.js  │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┼─────────────┘
                   │
         ┌─────────▼─────────┐
         │   Redis Cache     │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   PostgreSQL      │
         └───────────────────┘
```

Для масштабирования потребуется:
- Redis для shared cache
- PostgreSQL/MySQL для БД
- Load balancer
- Session store (Redis)

---

**Архитектура готова к production использованию** ✅
