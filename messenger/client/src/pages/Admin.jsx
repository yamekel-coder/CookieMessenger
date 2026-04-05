import { useState, useEffect, useCallback } from 'react';
import {
  Users, MessageSquare, FileText, Heart, UserCheck, TrendingUp,
  Wifi, Shield, Trash2, Ban, CheckCircle, Search, X, Send,
  BarChart2, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight,
  UserX, Megaphone, Eye, Clock, Crown,
} from 'lucide-react';

const ADMIN_EMAIL = 'yamekel0@gmail.com';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...opts.headers,
    },
  });
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniChart({ data, color = '#fff' }) {
  if (!data || data.length === 0) return <div className="adm-chart-empty">Нет данных</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="adm-chart">
      {data.map((d, i) => (
        <div key={i} className="adm-chart-col">
          <div
            className="adm-chart-bar"
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, background: color }}
            title={`${d.day}: ${d.count}`}
          />
          <span className="adm-chart-label">{d.day?.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent, chart, chartColor }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-top">
        <div className="adm-stat-icon" style={{ color: accent || '#fff' }}><Icon size={18} /></div>
        <div className="adm-stat-info">
          <span className="adm-stat-value" style={{ color: accent || '#fff' }}>{fmtNum(value ?? 0)}</span>
          <span className="adm-stat-label">{label}</span>
          {sub && <span className="adm-stat-sub">{sub}</span>}
        </div>
      </div>
      {chart && <MiniChart data={chart} color={chartColor || accent || '#fff'} />}
    </div>
  );
}

// ── Users table ───────────────────────────────────────────────────────────────
function UsersTab({ accent }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [banModal, setBanModal] = useState(null); // user object
  const [banReason, setBanReason] = useState('');
  const [flash, setFlash] = useState(null);

  const load = useCallback(async (p = 1, q = search) => {
    setLoading(true);
    const res = await api(`/api/admin/users?page=${p}&search=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
      setPages(data.pages);
      setPage(p);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(1); }, []);

  const showFlash = (msg, ok = true) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3000);
  };

  const handleBan = async () => {
    const res = await api(`/api/admin/users/${banModal.id}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason: banReason || 'Нарушение правил' }),
    });
    if (res.ok) { showFlash(`${banModal.username} заблокирован`); setBanModal(null); setBanReason(''); load(page); }
    else showFlash('Ошибка', false);
  };

  const handleUnban = async (u) => {
    const res = await api(`/api/admin/users/${u.id}/unban`, { method: 'POST' });
    if (res.ok) { showFlash(`${u.username} разблокирован`); load(page); }
  };

  const handleDelete = async (u) => {
    if (!confirm(`Удалить аккаунт @${u.username}? Это действие необратимо.`)) return;
    const res = await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    if (res.ok) { showFlash(`@${u.username} удалён`); load(page); }
    else showFlash('Ошибка', false);
  };

  return (
    <div className="adm-tab-content">
      {flash && <div className={`adm-flash ${flash.ok ? 'adm-flash-ok' : 'adm-flash-err'}`}>{flash.msg}</div>}

      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={14} />
          <input
            placeholder="Поиск по имени, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load(1, search)}
          />
          {search && <button onClick={() => { setSearch(''); load(1, ''); }}><X size={12} /></button>}
        </div>
        <button className="adm-btn adm-btn-ghost" onClick={() => load(1, search)}>
          <RefreshCw size={14} /> Обновить
        </button>
        <span className="adm-total">Всего: {total}</span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Email</th>
              <th>Регистрация</th>
              <th>Посты</th>
              <th>Сообщения</th>
              <th>Подписчики</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="adm-table-loading">Загрузка...</td></tr>
            )}
            {!loading && users.map(u => (
              <tr key={u.id} className={u.is_banned ? 'adm-row-banned' : ''}>
                <td>
                  <div className="adm-user-cell">
                    <div className="adm-user-avatar"
                      style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : undefined, borderColor: u.accent_color || '#fff' }}>
                      {!u.avatar && (u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="adm-user-name" style={{ color: u.accent_color || '#fff' }}>
                        {u.display_name || u.username}
                      </span>
                      <span className="adm-user-username">@{u.username}</span>
                    </div>
                  </div>
                </td>
                <td className="adm-cell-muted">{u.email}</td>
                <td className="adm-cell-muted">{fmtDate(u.created_at)}</td>
                <td>{u.posts_count}</td>
                <td>{u.msgs_count}</td>
                <td>{u.followers_count}</td>
                <td>
                  {u.is_banned
                    ? <span className="adm-badge adm-badge-banned">Заблокирован</span>
                    : <span className="adm-badge adm-badge-ok">Активен</span>
                  }
                </td>
                <td>
                  <div className="adm-actions">
                    {u.is_banned
                      ? <button className="adm-action-btn adm-action-unban" onClick={() => handleUnban(u)} title="Разблокировать">
                          <CheckCircle size={14} />
                        </button>
                      : <button className="adm-action-btn adm-action-ban" onClick={() => setBanModal(u)} title="Заблокировать">
                          <Ban size={14} />
                        </button>
                    }
                    <button className="adm-action-btn adm-action-delete" onClick={() => handleDelete(u)} title="Удалить аккаунт">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="adm-pagination">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="adm-page-btn">
            <ChevronLeft size={14} />
          </button>
          <span className="adm-page-info">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="adm-page-btn">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Ban modal */}
      {banModal && (
        <div className="adm-modal-overlay" onClick={() => setBanModal(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="adm-modal-title"><Ban size={16} /> Заблокировать @{banModal.username}</h3>
            <div className="adm-modal-field">
              <label>Причина блокировки</label>
              <input
                value={banReason}
                onChange={e => setBanReason(e.target.value)}
                placeholder="Нарушение правил сообщества"
                autoFocus
              />
            </div>
            <div className="adm-modal-actions">
              <button className="adm-btn adm-btn-ghost" onClick={() => setBanModal(null)}>Отмена</button>
              <button className="adm-btn adm-btn-danger" onClick={handleBan}>Заблокировать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────
function PostsTab({ accent }) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const res = await api(`/api/admin/posts?page=${p}`);
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
      setTotal(data.total);
      setPages(data.pages);
      setPage(p);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(1); }, []);

  const handleDelete = async (post) => {
    if (!confirm('Удалить этот пост?')) return;
    const res = await api(`/api/admin/posts/${post.id}`, { method: 'DELETE' });
    if (res.ok) {
      setFlash({ msg: 'Пост удалён', ok: true });
      setTimeout(() => setFlash(null), 2500);
      setPosts(prev => prev.filter(p => p.id !== post.id));
      setTotal(t => t - 1);
    }
  };

  const typeIcon = (t) => ({ text: '📝', image: '🖼️', video: '🎬', poll: '📊' }[t] || '📝');

  return (
    <div className="adm-tab-content">
      {flash && <div className={`adm-flash ${flash.ok ? 'adm-flash-ok' : 'adm-flash-err'}`}>{flash.msg}</div>}

      <div className="adm-toolbar">
        <button className="adm-btn adm-btn-ghost" onClick={() => load(1)}>
          <RefreshCw size={14} /> Обновить
        </button>
        <span className="adm-total">Всего постов: {total}</span>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Тип</th>
              <th>Автор</th>
              <th>Содержание</th>
              <th>Лайки</th>
              <th>Комменты</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="adm-table-loading">Загрузка...</td></tr>}
            {!loading && posts.map(p => (
              <tr key={p.id}>
                <td><span className="adm-type-badge">{typeIcon(p.type)} {p.type}</span></td>
                <td>
                  <div className="adm-user-cell">
                    <div className="adm-user-avatar" style={{ backgroundImage: p.avatar ? `url(${p.avatar})` : undefined, borderColor: p.accent_color || '#fff' }}>
                      {!p.avatar && (p.display_name || p.username)[0].toUpperCase()}
                    </div>
                    <span style={{ color: p.accent_color || '#fff' }}>@{p.username}</span>
                  </div>
                </td>
                <td className="adm-post-content">
                  {p.content ? p.content.slice(0, 80) + (p.content.length > 80 ? '...' : '') : <span className="adm-cell-muted">[медиа]</span>}
                </td>
                <td>{p.likes}</td>
                <td>{p.comments_count}</td>
                <td className="adm-cell-muted">{fmtDate(p.created_at)}</td>
                <td>
                  <button className="adm-action-btn adm-action-delete" onClick={() => handleDelete(p)} title="Удалить">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="adm-pagination">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="adm-page-btn"><ChevronLeft size={14} /></button>
          <span className="adm-page-info">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="adm-page-btn"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

// ── Broadcast tab ─────────────────────────────────────────────────────────────
function BroadcastTab({ accent }) {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(null);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    const res = await api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ message: msg }) });
    if (res.ok) {
      const data = await res.json();
      setFlash({ msg: `Отправлено ${data.sent} пользователям`, ok: true });
      setMsg('');
    } else {
      setFlash({ msg: 'Ошибка отправки', ok: false });
    }
    setSending(false);
    setTimeout(() => setFlash(null), 4000);
  };

  return (
    <div className="adm-tab-content">
      <div className="adm-broadcast-card">
        <div className="adm-broadcast-header">
          <Megaphone size={18} style={{ color: accent }} />
          <h3>Рассылка всем пользователям</h3>
        </div>
        <p className="adm-broadcast-desc">
          Сообщение придёт как уведомление всем активным пользователям платформы.
        </p>
        {flash && <div className={`adm-flash ${flash.ok ? 'adm-flash-ok' : 'adm-flash-err'}`}>{flash.msg}</div>}
        <textarea
          className="adm-broadcast-input"
          placeholder="Введите сообщение для всех пользователей..."
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={5}
          maxLength={500}
        />
        <div className="adm-broadcast-footer">
          <span className="adm-char-count">{msg.length}/500</span>
          <button
            className="adm-btn adm-btn-primary"
            onClick={send}
            disabled={!msg.trim() || sending}
            style={{ borderColor: accent, color: accent }}
          >
            <Send size={14} /> {sending ? 'Отправка...' : 'Отправить всем'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Roles tab ─────────────────────────────────────────────────────────────────
function RolesTab({ accent }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState(null);
  const [assigning, setAssigning] = useState({}); // userId -> true

  const load = useCallback(async () => {
    setLoading(true);
    const [ur, rr] = await Promise.all([
      api('/api/roles/users'),
      api('/api/roles/list'),
    ]);
    if (ur.ok) setUsers(await ur.json());
    if (rr.ok) setRoles(await rr.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const showFlash = (msg, ok = true) => {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 3000);
  };

  const handleAssign = async (userId, role) => {
    setAssigning(a => ({ ...a, [userId]: true }));
    const res = await api('/api/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(prev => prev.map(u => u.id === userId
        ? { ...u, roles: data.roles, role: data.role, roleLabel: data.roleLabel, roleColor: data.roleColor }
        : u
      ));
      showFlash('Роль обновлена');
    } else {
      const err = await res.json();
      showFlash(err.error || 'Ошибка', false);
    }
    setAssigning(a => ({ ...a, [userId]: false }));
  };

  const filtered = users.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="adm-tab-content">
      {flash && <div className={`adm-flash ${flash.ok ? 'adm-flash-ok' : 'adm-flash-err'}`}>{flash.msg}</div>}

      {/* Roles legend */}
      <div className="adm-roles-legend">
        {roles.map(r => (
          <div key={r.id} className="adm-role-badge-info" style={{ borderColor: r.color, color: r.color }}>
            <Crown size={11} /> {r.label}
            <span className="adm-role-perms">{r.permissions.length} прав</span>
          </div>
        ))}
      </div>

      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={14} />
          <input
            placeholder="Поиск пользователя..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
        </div>
        <button className="adm-btn adm-btn-ghost" onClick={load}><RefreshCw size={14} /> Обновить</button>
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Email</th>
              <th>Текущая роль</th>
              <th>Назначить роль</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="adm-table-loading">Загрузка...</td></tr>}
            {!loading && filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="adm-user-cell">
                    <div className="adm-user-avatar"
                      style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : undefined, borderColor: u.accent_color || '#fff' }}>
                      {!u.avatar && (u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div>
                      <span className="adm-user-name" style={{ color: u.accent_color || '#fff' }}>
                        {u.display_name || u.username}
                      </span>
                      <span className="adm-user-username">@{u.username}</span>
                    </div>
                  </div>
                </td>
                <td className="adm-cell-muted">{u.email}</td>
                <td>
                  <span className="adm-role-current" style={{ color: u.roleColor, borderColor: u.roleColor }}>
                    <Crown size={11} /> {u.roleLabel}
                  </span>
                  {u.roles && u.roles.length > 1 && (
                    <span className="adm-role-count">+{u.roles.length - 1}</span>
                  )}
                </td>
                <td>
                  <div className="adm-role-select-row">
                    {roles.map(r => {
                      const hasRole = u.roles?.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          className={`adm-role-btn ${hasRole ? 'active' : ''}`}
                          style={hasRole 
                            ? { background: r.color + '22', borderColor: r.color, color: r.color } 
                            : { borderColor: r.color + '55', color: r.color + '99' }
                          }
                          onClick={() => handleAssign(u.id, r.id)}
                          disabled={assigning[u.id]}
                          title={r.label}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permissions reference */}
      <div className="adm-section" style={{ marginTop: 24 }}>
        <h3 className="adm-section-title"><Shield size={14} /> Права по ролям</h3>
        <div className="adm-perms-grid">
          {roles.map(r => (
            <div key={r.id} className="adm-perms-card" style={{ borderColor: r.color + '44' }}>
              <div className="adm-perms-title" style={{ color: r.color }}><Crown size={13} /> {r.label}</div>
              {r.permissions.length === 0
                ? <span className="adm-cell-muted">Базовые права</span>
                : r.permissions.map(p => (
                  <div key={p} className="adm-perm-item">
                    <CheckCircle size={11} style={{ color: r.color }} />
                    <span>{{ 
                      animated_name: 'Анимированный ник',
                      profile_music: 'Музыка на профиле',
                      post_images: 'Публиковать фото',
                      post_videos: 'Публиковать видео',
                      post_polls: 'Создавать опросы',
                      custom_accent: 'Кастомный цвет',
                      delete_posts: 'Удалять посты',
                      ban_users: 'Банить пользователей',
                      manage_roles: 'Управлять ролями',
                      broadcast: 'Рассылка',
                      delete_users: 'Удалять аккаунты',
                      owner: 'Полный доступ',
                    }[p] || p}</span>
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────
export default function Admin({ user, onBack }) {
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const accent = user.accent_color || '#fff';

  const loadStats = useCallback(async () => {
    setLoading(true);
    const res = await api('/api/admin/stats');
    if (res.ok) setStats(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (tab === 'stats') loadStats(); }, [tab, loadStats]);

  const TABS = [
    { id: 'stats',     label: 'Статистика',  icon: BarChart2 },
    { id: 'users',     label: 'Пользователи', icon: Users },
    { id: 'roles',     label: 'Роли',         icon: Crown },
    { id: 'posts',     label: 'Посты',        icon: FileText },
    { id: 'broadcast', label: 'Рассылка',     icon: Megaphone },
  ];

  return (
    <div className="adm-page">
      {/* Sidebar */}
      <aside className="adm-sidebar">
        <div className="adm-sidebar-header">
          <Shield size={18} style={{ color: accent }} />
          <span>Админ-панель</span>
        </div>

        <nav className="adm-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`adm-nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={tab === t.id ? { color: accent } : {}}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </nav>

        <button className="adm-back-btn" onClick={onBack}>
          <ChevronLeft size={15} /> Назад в профиль
        </button>
      </aside>

      {/* Content */}
      <main className="adm-main">

        {/* ── Stats ── */}
        {tab === 'stats' && (
          <div className="adm-stats-page">
            <div className="adm-page-title">
              <BarChart2 size={18} style={{ color: accent }} /> Статистика платформы
              <button className="adm-btn adm-btn-ghost adm-refresh" onClick={loadStats}>
                <RefreshCw size={13} />
              </button>
            </div>

            {loading && <div className="adm-loading">Загрузка...</div>}

            {!loading && stats && (
              <>
                {/* Main stats grid */}
                <div className="adm-stats-grid">
                  <StatCard icon={Users}       label="Пользователей"  value={stats.totalUsers}    sub={`+${stats.newUsersWeek} за неделю`}    accent={accent}   chart={stats.regChart}   chartColor={accent} />
                  <StatCard icon={Wifi}        label="Онлайн сейчас"  value={stats.onlineNow}     accent="#40c057" />
                  <StatCard icon={UserX}       label="Заблокировано"  value={stats.bannedUsers}   accent="#ff6b6b" />
                  <StatCard icon={FileText}    label="Постов"         value={stats.totalPosts}    sub={`+${stats.newPostsWeek} за неделю`}    accent="#74c0fc"  chart={stats.postsChart} chartColor="#74c0fc" />
                  <StatCard icon={MessageSquare} label="Сообщений"    value={stats.totalMessages} sub={`+${stats.newMsgsWeek} за неделю`}     accent="#da77f2" />
                  <StatCard icon={Heart}       label="Лайков"         value={stats.totalLikes}    accent="#ff6b6b" />
                  <StatCard icon={TrendingUp}  label="Подписок"       value={stats.totalFollows}  accent="#ffd43b" />
                  <StatCard icon={UserCheck}   label="Дружб"          value={stats.totalFriends}  accent="#69db7c" />
                </div>

                {/* Post types */}
                <div className="adm-section">
                  <h3 className="adm-section-title"><Eye size={14} /> Типы постов</h3>
                  <div className="adm-type-grid">
                    {stats.postTypes.map(t => (
                      <div key={t.type} className="adm-type-card">
                        <span className="adm-type-name">{{ text: '📝 Текст', image: '🖼️ Фото', video: '🎬 Видео', poll: '📊 Опрос' }[t.type] || t.type}</span>
                        <span className="adm-type-count" style={{ color: accent }}>{t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top posters */}
                <div className="adm-section">
                  <h3 className="adm-section-title"><TrendingUp size={14} /> Топ авторов</h3>
                  <div className="adm-top-list">
                    {stats.topPosters.map((u, i) => (
                      <div key={u.id} className="adm-top-row">
                        <span className="adm-top-rank" style={{ color: accent }}>#{i + 1}</span>
                        <div className="adm-user-avatar sm" style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : undefined, borderColor: u.accent_color || '#fff' }}>
                          {!u.avatar && (u.display_name || u.username)[0].toUpperCase()}
                        </div>
                        <div className="adm-top-info">
                          <span style={{ color: u.accent_color || '#fff' }}>{u.display_name || u.username}</span>
                          <span className="adm-cell-muted">@{u.username}</span>
                        </div>
                        <span className="adm-top-count">{u.posts_count} постов</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'users'     && <UsersTab accent={accent} />}
        {tab === 'roles'     && <RolesTab accent={accent} />}
        {tab === 'posts'     && <PostsTab accent={accent} />}
        {tab === 'broadcast' && <BroadcastTab accent={accent} />}
      </main>
    </div>
  );
}
