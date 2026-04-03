// Load .env manually (no dotenv dependency needed)
const fs = require('fs');
const envPath = require('path').join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && key.trim() && !key.startsWith('#')) {
      process.env[key.trim()] = val.join('=').trim();
    }
  });
}

const http = require('http');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const feedRoutes = require('./routes/feed');
const friendsRoutes = require('./routes/friends');
const messagesRoutes = require('./routes/messages');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const rolesRoutes = require('./routes/roles');
const ws = require('./ws');
const { securityHeaders, apiLimiter, sanitizeBody } = require('./middleware/security');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Security headers on every response ───────────────────────────────────────
app.use(securityHeaders);

// ── CORS — allow all origins for VDS deployment ──────────────────────────────
app.use(cors());

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ── Sanitize all incoming text fields ────────────────────────────────────────
app.use(sanitizeBody);

// ── General rate limit on all API routes ─────────────────────────────────────
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/roles', rolesRoutes);

// ── GIF proxy via Tenor ───────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('https') : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return httpsGet(r.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      r.on('data', chunk => body += chunk);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

app.get('/api/gifs', apiLimiter, async (req, res) => {
  try {
    const { q, limit = 24 } = req.query;
    const key = 'LIVDSRZULELA';
    const base = 'https://api.tenor.com/v1';
    const url = q
      ? `${base}/search?q=${encodeURIComponent(q)}&key=${key}&limit=${limit}&media_filter=minimal&contentfilter=medium&locale=ru_RU`
      : `${base}/trending?key=${key}&limit=${limit}&media_filter=minimal&contentfilter=medium&locale=ru_RU`;

    const { status, data } = await httpsGet(url);
    if (status === 200 && data.results?.length > 0) {
      const results = data.results.map(item => ({
        id: item.id,
        title: item.title || '',
        preview: item.media?.[0]?.tinygif?.url || item.media?.[0]?.gif?.url || '',
        url: item.media?.[0]?.gif?.url || item.media?.[0]?.tinygif?.url || '',
      })).filter(r => r.preview);
      return res.json({ results });
    }
    res.json({ results: [] });
  } catch (err) {
    console.error('GIF proxy error:', err.message);
    res.json({ results: [] });
  }
});

// ── 404 handler ───────────────────────────────────────────────────────────────
// Serve built frontend if dist exists (production / pterodactyl)
const distPath = require('path').join(__dirname, '../client/dist');
if (require('fs').existsSync(distPath)) {
  app.use(require('express').static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(require('path').join(distPath, 'index.html'));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

ws.setup(server);

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
