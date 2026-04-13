import { useState, useEffect } from 'react';

function formatUptime(seconds) {
  if (!seconds) return '—';
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

function StatusBadge({ status }) {
  const map = {
    operational: { label: 'Работает', color: '#69db7c' },
    degraded:    { label: 'Деградация', color: '#ffd43b' },
    down:        { label: 'Недоступен', color: '#ff6b6b' },
  };
  const { label, color } = map[status] || map.operational;
  return (
    <span className="status-badge" style={{ color, borderColor: color + '44', background: color + '11' }}>
      <span className="status-badge-dot" style={{ background: color }} />
      {label}
    </span>
  );
}

function ServiceRow({ service }) {
  const isOk = service.status === 'operational';
  return (
    <div className="status-service-row">
      <div className="status-service-left">
        <span className="status-service-name">{service.name}</span>
        {service.desc && <span className="status-service-desc">{service.desc}</span>}
      </div>
      <StatusBadge status={service.status} />
    </div>
  );
}

function StatCard({ value, label, sub }) {
  return (
    <div className="status-stat-card">
      <span className="status-stat-val">{value}</span>
      <span className="status-stat-label">{label}</span>
      {sub && <span className="status-stat-sub">{sub}</span>}
    </div>
  );
}

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

  useEffect(() => {
    load();
    const refresh = setInterval(load, 30000);
    return () => clearInterval(refresh);
  }, []);

  // Live uptime counter
  useEffect(() => {
    if (!liveUptime) return;
    const id = setInterval(() => setLiveUptime(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [data]);

  const allOk = data?.services?.every(s => s.status === 'operational');

  return (
    <div className="status-page">
      <div className="status-page-inner">
        <a href="/profile" className="static-back">← Назад</a>

        <div className="status-top-label">SERVICE STATUS</div>

        {/* Main status banner */}
        <div className={`status-main-banner ${allOk ? 'status-banner-ok' : 'status-banner-err'}`}>
          <div className="status-main-title-row">
            <span className={`status-dot ${allOk ? 'status-dot-ok' : 'status-dot-err'}`} />
            <h1 className="status-main-title">
              {loading ? 'Проверка...' : allOk ? 'Все системы работают' : 'Обнаружены проблемы'}
            </h1>
          </div>
          <span className="status-updated">
            {lastUpdate ? `Обновлено ${lastUpdate.toLocaleTimeString('ru-RU')}` : ''}
          </span>
        </div>

        {/* Stats */}
        {data && (
          <div className="status-stats-row">
            <StatCard
              value={formatUptime(liveUptime)}
              label="Аптайм сессии"
              sub={`с ${formatDate(data.serverStart)}`}
            />
            <StatCard
              value={data.onlineUsers}
              label="онлайн сейчас"
            />
            <StatCard
              value={data.totalUsers}
              label="пользователей"
            />
            <StatCard
              value={data.totalMessages}
              label="сообщений"
            />
          </div>
        )}

        {/* Services */}
        <div className="status-services">
          <div className="status-section-title">Сервисы</div>
          {(data?.services || [
            { id: 'api', name: 'API сервер', status: loading ? 'operational' : 'operational' },
            { id: 'ws', name: 'WebSocket', status: loading ? 'operational' : 'operational' },
            { id: 'db', name: 'База данных', status: loading ? 'operational' : 'operational' },
            { id: 'media', name: 'Медиа', status: loading ? 'operational' : 'operational' },
          ]).map(s => (
            <ServiceRow key={s.id} service={s} />
          ))}
        </div>

        {/* Info */}
        <div className="status-info-block">
          <div className="status-info-row">
            <span className="status-info-label">Последний запуск</span>
            <span className="status-info-val">{data ? formatDate(data.serverStart) : '—'}</span>
          </div>
          <div className="status-info-row">
            <span className="status-info-label">Время сервера</span>
            <span className="status-info-val">{data ? formatDate(data.timestamp) : '—'}</span>
          </div>
          <div className="status-info-row">
            <span className="status-info-label">Всего постов</span>
            <span className="status-info-val">{data?.totalPosts ?? '—'}</span>
          </div>
        </div>

        <div className="status-footer-note">
          Данные обновляются каждые 30 секунд. Аптайм считается с момента последнего запуска сервера.
        </div>
      </div>
    </div>
  );
}
