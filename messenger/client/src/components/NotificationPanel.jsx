import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Bell, Heart, MessageCircle, AtSign, X, UserPlus } from 'lucide-react';

function timeAgo(str) {
  const diff = (Date.now() - new Date(str + 'Z')) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч.`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн.`;
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const TYPE_ICON = {
  like: <Heart size={14} />,
  comment: <MessageCircle size={14} />,
  mention: <AtSign size={14} />,
  follow: <UserPlus size={14} />,
};

const TYPE_TEXT = {
  like: 'лайкнул(а) ваш пост',
  comment: 'прокомментировал(а) ваш пост',
  mention: 'упомянул(а) вас',
  follow: 'подписался(ась) на вас',
};

function NotifItem({ n }) {
  const accent = n.actor_accent_color || '#fff';
  const name = n.actor_display_name || n.actor_username;
  return (
    <div className={`notif-item ${n.read ? '' : 'notif-unread'}`}>
      <div className="notif-icon" style={{ color: accent }}>{TYPE_ICON[n.type]}</div>
      <div className="notif-avatar"
        style={{ backgroundImage: n.actor_avatar ? `url(${n.actor_avatar})` : undefined, borderColor: accent }}>
        {!n.actor_avatar && name[0].toUpperCase()}
      </div>
      <div className="notif-body">
        <p className="notif-text">
          <span style={{ color: accent, fontWeight: 600 }}>{name}</span>
          {' '}{TYPE_TEXT[n.type] || n.type}
        </p>
        {n.post_content && (
          <p className="notif-preview">
            {n.post_content.slice(0, 60)}{n.post_content.length > 60 ? '...' : ''}
          </p>
        )}
        <span className="notif-time">{timeAgo(n.created_at)}</span>
      </div>
    </div>
  );
}

export default forwardRef(function NotificationBell({ accent }, ref) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef();

  // Expose bumpUnread to parent via ref
  useImperativeHandle(ref, () => ({
    bumpUnread: (notif) => {
      setUnread(n => n + 1);
      playSound();
      showPush(notif);
    },
  }));

  // Notification sound (generated via Web Audio API — no file needed)
  const playSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  // Browser Push notification
  const showPush = (notif) => {
    if (!notif) return;
    if (Notification.permission !== 'granted') return;
    const name = notif.actor_display_name || notif.actor_username || 'Кто-то';
    const body = `${name} ${TYPE_TEXT[notif.type] || notif.type}`;
    try {
      new Notification('RLC', { body, icon: notif.actor_avatar || undefined });
    } catch {}
  };

  // Request push permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const fetchUnread = () => {
    fetch('/api/feed/notifications/unread-count', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then(r => r.json()).then(d => setUnread(d.count || 0)).catch(() => {});
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch('/api/feed/notifications', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setNotifs(Array.isArray(data) ? data : []);
      // Mark all as read
      await fetch('/api/feed/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUnread(0);
    } finally {
      setLoading(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        className="notif-bell-btn"
        onClick={() => open ? setOpen(false) : openPanel()}
        title="Уведомления"
        style={open ? { color: accent } : {}}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="notif-badge" style={{ background: accent, color: '#000' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Уведомления</span>
            <button className="notif-panel-close" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="notif-panel-body">
            {loading && <p className="notif-empty">Загрузка...</p>}
            {!loading && notifs.length === 0 && (
              <p className="notif-empty">Уведомлений пока нет</p>
            )}
            {!loading && notifs.map(n => <NotifItem key={n.id} n={n} />)}
          </div>
        </div>
      )}
    </div>
  );
});
