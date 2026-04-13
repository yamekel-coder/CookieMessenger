import { useState, useEffect } from 'react';

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  if (h > 0) return `${h}ч ${m}м ${s}с`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const SERVICE_ICONS = {
  api:   '⚡',
  ws:    '🔌',
  db:    '🗄️',
  media: '🖼️',
};

export default function Status() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [liveUptime, setLiveUptime] = useState(0);

  const load = async () => {
    try {
      const r = await fetch('/api/status');
      if (r.ok) {
        const d = await r.json();
        setData(d);
        setLiveUptime(d.uptime || 0);
        setLastUpdate(new Date());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => setLiveUptime(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [data]);

  const allOk = !loading && data?.services?.every(s => s.status === 'operational');

  return (
    <div className="st-page">
      <div className="st-wrap">

        {/* Back */}
        <a href="/profile" className="st-back">← Назад</a>

        {/* Hero */}
        <div className="st-hero">
          <div className={`st-hero-indicator ${allOk ? 'st-ok' : loading ? 'st-loading' : 'st-err'}`} />
          <div>
            <h1 className="st-hero-title">
              {loading ? 'Проверка систем...' : allOk ? 'Все системы работают' : 'Обнаружены проблемы'}
            </h1>
            <p className="st-hero-sub">
              {lastUpdate ? `Обновлено в ${formatTime(lastUpdate.toISOString())}` : 'Загрузка...'}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="st-stats">
          <div className="st-stat">
            <span className="st-stat-icon">⏱</span>
            <span className="st-stat-val">{formatUptime(liveUptime)}</span>
            <span className="st-stat-label">Аптайм</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-icon">🟢</span>
            <span className="st-stat-val">{data?.onlineUsers ?? '—'}</span>
            <span className="st-stat-label">Онлайн</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-icon">👥</span>
            <span className="st-stat-val">{data?.totalUsers ?? '—'}</span>
            <span className="st-stat-label">Пользователей</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-icon">💬</span>
            <span className="st-stat-val">{data?.totalMessages ?? '—'}</span>
            <span className="st-stat-label">Сообщений</span>
          </div>
          <div className="st-stat">
            <span className="st-stat-icon">📝</span>
            <span className="st-stat-val">{data?.totalPosts ?? '—'}</span>
            <span className="st-stat-label">Постов</span>
          </div>
        </div>

        {/* Services */}
        <div className="st-section">
          <div className="st-section-label">Сервисы</div>
          <div className="st-services">
            {(data?.services || [
              { id: 'api', name: 'API сервер', status: 'operational' },
              { id: 'ws', name: 'WebSocket', status: 'operational' },
              { id: 'db', name: 'База данных', status: 'operational' },
              { id: 'media', name: 'Медиа', status: 'operational' },
            ]).map(s => {
              const ok = s.status === 'operational';
              return (
                <div key={s.id} className="st-service">
                  <div className="st-service-left">
                    <span className="st-service-icon">{SERVICE_ICONS[s.id] || '⚙️'}</span>
                    <span className="st-service-name">{s.name}</span>
                  </div>
                  <div className={`st-service-badge ${ok ? 'st-badge-ok' : 'st-badge-err'}`}>
                    <span className="st-badge-dot" />
                    {ok ? 'Работает' : 'Проблема'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info */}
        <div className="st-section">
          <div className="st-section-label">Информация</div>
          <div className="st-info">
            <div className="st-info-row">
              <span>Последний запуск</span>
              <span>{formatDate(data?.serverStart)}</span>
            </div>
            <div className="st-info-row">
              <span>Время сервера</span>
              <span>{formatDate(data?.timestamp)}</span>
            </div>
            <div className="st-info-row">
              <span>Версия</span>
              <span>RLC v1.1.0</span>
            </div>
          </div>
        </div>

        <p className="st-footer">Данные обновляются каждые 30 секунд</p>
      </div>
    </div>
  );
}
