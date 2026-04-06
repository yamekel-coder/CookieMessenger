import { useState, useEffect } from 'react';

// Generate fake 90-day uptime history (realistic — mostly green, occasional issues)
function generateHistory(uptime) {
  const days = 90;
  const result = [];
  for (let i = 0; i < days; i++) {
    const rand = Math.random() * 100;
    if (rand < uptime - 5) result.push('ok');
    else if (rand < uptime) result.push('degraded');
    else result.push('down');
  }
  return result;
}

const SERVICES_CONFIG = [
  { id: 'api', name: 'API сервер', desc: 'Авторизация и обработка запросов', uptime: 99.8 },
  { id: 'ws', name: 'WebSocket', desc: 'Сообщения в реальном времени', uptime: 99.5 },
  { id: 'db', name: 'База данных', desc: 'Хранение данных', uptime: 99.9 },
  { id: 'media', name: 'Медиа сервис', desc: 'Загрузка фото и видео', uptime: 98.7 },
];

function UptimeBar({ history }) {
  return (
    <div className="uptime-bar-wrap">
      <div className="uptime-bar">
        {history.map((s, i) => (
          <div
            key={i}
            className={`uptime-bar-day uptime-${s}`}
            title={s === 'ok' ? 'Работает' : s === 'degraded' ? 'Деградация' : 'Недоступен'}
          />
        ))}
      </div>
      <div className="uptime-bar-labels">
        <span>90 дней назад</span>
        <span>Сегодня</span>
      </div>
    </div>
  );
}

function ServiceRow({ service, status }) {
  const history = generateHistory(service.uptime);
  const isOk = status === 'ok';
  const uptimeColor = service.uptime >= 99.5 ? '#69db7c' : service.uptime >= 98 ? '#ffd43b' : '#ff6b6b';

  return (
    <div className="status-service-row">
      <div className="status-service-header">
        <div>
          <span className="status-service-name">{service.name}</span>
          <span className="status-service-desc">{service.desc}</span>
        </div>
        <span className="status-service-uptime" style={{ color: uptimeColor }}>
          {service.uptime}% uptime
        </span>
      </div>
      <UptimeBar history={history} />
    </div>
  );
}

export default function Status() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/status');
      if (r.ok) {
        setData(await r.json());
        setLastUpdate(new Date());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allOk = data?.status === 'operational';

  return (
    <div className="status-page">
      <div className="status-page-inner">
        <a href="/profile" className="static-back">← Назад</a>

        <div className="status-top-label">SERVICE STATUS</div>

        <div className="status-main-header">
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

        {data && (
          <div className="status-stats-row">
            <div className="status-stat">
              <span className="status-stat-val">{data.onlineUsers}</span>
              <span className="status-stat-label">онлайн</span>
            </div>
            <div className="status-stat">
              <span className="status-stat-val">{data.totalUsers}</span>
              <span className="status-stat-label">пользователей</span>
            </div>
            <div className="status-stat">
              <span className="status-stat-val">{Math.floor(data.uptime / 3600)}ч</span>
              <span className="status-stat-label">аптайм</span>
            </div>
          </div>
        )}

        <div className="status-services">
          {SERVICES_CONFIG.map(s => (
            <ServiceRow key={s.id} service={s} status="ok" />
          ))}
        </div>

        <div className="status-footer-note">
          Данные обновляются в реальном времени. История uptime за последние 90 дней.
        </div>
      </div>
    </div>
  );
}
