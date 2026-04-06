import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

const SERVICES = [
  { id: 'api', name: 'API сервер', url: '/api/feed/notifications/unread-count' },
  { id: 'ws', name: 'WebSocket', url: null },
  { id: 'db', name: 'База данных', url: '/api/feed/notifications/unread-count' },
];

function StatusBadge({ status }) {
  if (status === 'ok') return (
    <span className="status-badge status-ok"><CheckCircle size={14} /> Работает</span>
  );
  if (status === 'error') return (
    <span className="status-badge status-error"><XCircle size={14} /> Недоступен</span>
  );
  return <span className="status-badge status-checking"><AlertCircle size={14} /> Проверка...</span>;
}

export default function Status() {
  const [statuses, setStatuses] = useState({ api: 'checking', ws: 'checking', db: 'checking' });
  const [lastCheck, setLastCheck] = useState(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    const next = { api: 'checking', ws: 'checking', db: 'checking' };

    // Check API
    try {
      const r = await fetch('/api/feed/notifications/unread-count', { signal: AbortSignal.timeout(5000) });
      next.api = r.ok || r.status === 401 ? 'ok' : 'error';
      next.db = next.api; // DB is implied by API working
    } catch {
      next.api = 'error';
      next.db = 'error';
    }

    // Check WebSocket
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(`wss://${location.host}/ws`);
        const t = setTimeout(() => { ws.close(); reject(); }, 4000);
        ws.onopen = () => { clearTimeout(t); ws.close(); resolve(); };
        ws.onerror = () => { clearTimeout(t); reject(); };
      });
      next.ws = 'ok';
    } catch {
      next.ws = 'error';
    }

    setStatuses(next);
    setLastCheck(new Date());
    setLoading(false);
  };

  useEffect(() => { check(); }, []);

  const allOk = Object.values(statuses).every(s => s === 'ok');
  const anyError = Object.values(statuses).some(s => s === 'error');

  return (
    <div className="static-page">
      <div className="static-container">
        <a href="/profile" className="static-back">← Назад</a>

        <div className="status-header">
          <h1 className="static-title">Статус серверов</h1>
          {allOk && <span className="status-overall ok"><CheckCircle size={16} /> Все системы работают</span>}
          {anyError && <span className="status-overall error"><XCircle size={16} /> Обнаружены проблемы</span>}
          {!allOk && !anyError && <span className="status-overall checking"><AlertCircle size={16} /> Проверка...</span>}
        </div>

        <div className="status-list">
          {[
            { id: 'api', name: 'API сервер', desc: 'Обработка запросов и авторизация' },
            { id: 'ws', name: 'WebSocket', desc: 'Сообщения и уведомления в реальном времени' },
            { id: 'db', name: 'База данных', desc: 'Хранение данных пользователей и сообщений' },
          ].map(s => (
            <div key={s.id} className="status-row">
              <div className="status-row-info">
                <span className="status-row-name">{s.name}</span>
                <span className="status-row-desc">{s.desc}</span>
              </div>
              <StatusBadge status={statuses[s.id]} />
            </div>
          ))}
        </div>

        <div className="status-footer">
          {lastCheck && <span>Последняя проверка: {lastCheck.toLocaleTimeString('ru-RU')}</span>}
          <button className="status-refresh" onClick={check} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}
