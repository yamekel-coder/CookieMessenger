const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const db = require('../db');
const { authLimiter, validateRegistration } = require('../middleware/security');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://213.152.43.207/api/auth/discord/callback';

// ── Helpers ───────────────────────────────────────────────────────────────────
function httpsPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on('error', reject);
  });
}

function makeToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function userPayload(user) {
  return {
    id: user.id, username: user.username, email: user.email,
    display_name: user.display_name, bio: user.bio,
    avatar: user.avatar, banner: user.banner,
    accent_color: user.accent_color, profile_completed: user.profile_completed,
    created_at: user.created_at, discord_verified: user.discord_verified,
  };
}

// ── Simple math captcha verification ─────────────────────────────────────────
// Client sends { captchaAnswer, captchaQuestion } — server verifies
function verifyCaptcha(question, answer) {
  if (!question || answer === undefined) return false;
  try {
    // question format: "X + Y" or "X - Y" or "X * Y"
    const [a, op, b] = question.split(' ');
    let expected;
    if (op === '+') expected = parseInt(a) + parseInt(b);
    else if (op === '-') expected = parseInt(a) - parseInt(b);
    else if (op === '*') expected = parseInt(a) * parseInt(b);
    else return false;
    return parseInt(answer) === expected;
  } catch { return false; }
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  const { username, email, password, captchaQuestion, captchaAnswer, discordToken } = req.body;

  // Verify captcha
  if (!verifyCaptcha(captchaQuestion, captchaAnswer))
    return res.status(400).json({ error: 'Неверный ответ на капчу' });

  // Verify Discord if provided
  let discordId = null;
  if (discordToken) {
    try {
      const discordUser = await httpsGet('https://discord.com/api/users/@me', {
        Authorization: `Bearer ${discordToken}`,
      });
      if (!discordUser.id) return res.status(400).json({ error: 'Неверный Discord токен' });
      discordId = discordUser.id;
      // Check if this Discord account is already used
      const existing = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordId);
      if (existing) return res.status(409).json({ error: 'Этот Discord аккаунт уже привязан к другому пользователю' });
    } catch {
      return res.status(400).json({ error: 'Ошибка проверки Discord' });
    }
  }

  try {
    const hashed = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO users (username, email, password, discord_id, discord_verified) VALUES (?, ?, ?, ?, ?)');
    stmt.run(username, email.toLowerCase().trim(), hashed, discordId, discordId ? 1 : 0);
    res.json({ message: 'Регистрация успешна' });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Пользователь уже существует' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });

  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const valid = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !valid) return res.status(401).json({ error: 'Неверный email или пароль' });
  if (user.is_banned) return res.status(403).json({ error: `Аккаунт заблокирован. Причина: ${user.ban_reason || 'Нарушение правил'}` });

  res.json({ token: makeToken(user), user: userPayload(user) });
});

// ── GET /api/auth/discord — redirect to Discord OAuth ────────────────────────
router.get('/discord', (req, res) => {
  const { mode = 'register' } = req.query; // mode: register | link
  if (!DISCORD_CLIENT_ID) return res.status(500).json({ error: 'Discord OAuth не настроен' });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state: mode,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ── GET /api/auth/discord/callback ───────────────────────────────────────────
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/?error=discord_cancelled');

  try {
    // Exchange code for token
    const tokenData = await httpsPost('https://discord.com/api/oauth2/token', {
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    if (!tokenData.access_token) return res.redirect('/?error=discord_token_failed');

    // Get Discord user info
    const discordUser = await httpsGet('https://discord.com/api/users/@me', {
      Authorization: `Bearer ${tokenData.access_token}`,
    });

    if (!discordUser.id) return res.redirect('/?error=discord_user_failed');

    // If mode is 'register' — pass discord token back to frontend for registration
    if (state === 'register') {
      const params = new URLSearchParams({
        discord_token: tokenData.access_token,
        discord_username: discordUser.username,
        discord_avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : '',
        discord_email: discordUser.email || '',
      });
      return res.redirect(`/register?${params}`);
    }

    // If mode is 'link' — link to existing account (requires JWT in state)
    // For now just redirect with token for frontend to handle
    const params = new URLSearchParams({
      discord_token: tokenData.access_token,
      discord_id: discordUser.id,
    });
    res.redirect(`/profile?${params}`);

  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.redirect('/?error=discord_error');
  }
});

// ── POST /api/auth/discord/verify — verify discord token and get user info ───
router.post('/discord/verify', authLimiter, async (req, res) => {
  const { discord_token } = req.body;
  if (!discord_token) return res.status(400).json({ error: 'Нет токена' });

  try {
    const discordUser = await httpsGet('https://discord.com/api/users/@me', {
      Authorization: `Bearer ${discord_token}`,
    });
    if (!discordUser.id) return res.status(400).json({ error: 'Неверный токен' });

    // Check if already registered
    const existing = db.prepare('SELECT id FROM users WHERE discord_id = ?').get(discordUser.id);
    if (existing) return res.status(409).json({ error: 'Этот Discord аккаунт уже зарегистрирован' });

    res.json({
      id: discordUser.id,
      username: discordUser.username,
      email: discordUser.email || '',
      avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
    });
  } catch {
    res.status(400).json({ error: 'Ошибка проверки Discord' });
  }
});

module.exports = router;
