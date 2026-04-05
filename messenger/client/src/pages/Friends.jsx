import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, UserCheck, UserX, Users, Clock, Check, X } from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  });
}

function Avatar({ user, size = 40 }) {
  const accent = user?.accent_color || '#fff';
  const label = user?.display_name || user?.username || '?';
  return (
    <div className="fr-avatar" style={{
      width: size, height: size, minWidth: size,
      backgroundImage: user?.avatar ? `url(${user.avatar})` : undefined,
      borderColor: accent, fontSize: size * 0.38,
    }}>
      {!user?.avatar && label[0].toUpperCase()}
    </div>
  );
}

function FriendCard({ user, friendship, onAction, onMessage }) {
  const [loading, setLoading] = useState(false);
  const accent = user.accent_color || '#fff';
  const name = user.display_name || user.username;

  const act = async (action) => {
    setLoading(true);
    await onAction(action, user, friendship);
    setLoading(false);
  };

  return (
    <div className="fr-card">
      <Avatar user={user} />
      <div className="fr-card-info">
        <span className="verified-name-row">
          <span
            className={`fr-card-name${user.animated_name ? ' gradient-name' : ''}`}
            style={user.animated_name
              ? { background: user.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
              : { color: accent }
            }
          >{name}</span>
          {user.verified ? <VerifiedBadge size={13} /> : null}
        </span>
        <span className="fr-card-username">@{user.username}</span>
        {user.bio && <span className="fr-card-bio">{user.bio}</span>}
      </div>
      <div className="fr-card-actions">
        {!friendship && (
          <button className="fr-btn fr-btn-add" onClick={() => act('request')} disabled={loading} title="Добавить в друзья">
            <UserPlus size={15} />
          </button>
        )}
        {friendship?.status === 'pending' && friendship?.isMine && (
          <button className="fr-btn fr-btn-pending" disabled title="Заявка отправлена">
            <Clock size={15} />
          </button>
        )}
        {friendship?.status === 'pending' && !friendship?.isMine && (
          <>
            <button className="fr-btn fr-btn-accept" onClick={() => act('accept')} disabled={loading} title="Принять">
              <Check size={15} />
            </button>
            <button className="fr-btn fr-btn-decline" onClick={() => act('decline')} disabled={loading} title="Отклонить">
              <X size={15} />
            </button>
          </>
        )}
        {friendship?.status === 'accepted' && (
          <>
            <button className="fr-btn fr-btn-msg" onClick={() => onMessage(user)} title="Написать">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <button className="fr-btn fr-btn-remove" onClick={() => act('remove')} disabled={loading} title="Удалить из друзей">
              <UserX size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Friends({ user, onOpenChat }) {
  const [tab, setTab] = useState('friends'); // friends | search | requests
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const accent = user.accent_color || '#fff';

  const loadFriends = useCallback(async () => {
    const res = await api('/api/friends');
    if (res.ok) setFriends(await res.json());
  }, []);

  const loadRequests = useCallback(async () => {
    const res = await api('/api/friends/requests');
    if (res.ok) setRequests(await res.json());
  }, []);

  useEffect(() => { loadFriends(); loadRequests(); }, [loadFriends, loadRequests]);

  // Search with debounce
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await api(`/api/friends/search?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json());
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const handleAction = async (action, targetUser, friendship) => {
    if (action === 'request') {
      await api(`/api/friends/request/${targetUser.id}`, { method: 'POST' });
      // Update search results locally
      setSearchResults(prev => prev.map(u =>
        u.id === targetUser.id
          ? { ...u, friendship: { status: 'pending', isMine: true } }
          : u
      ));
    } else if (action === 'accept') {
      await api(`/api/friends/accept/${friendship.id}`, { method: 'POST' });
      await loadFriends();
      await loadRequests();
      setSearchResults(prev => prev.map(u =>
        u.id === targetUser.id ? { ...u, friendship: { ...friendship, status: 'accepted' } } : u
      ));
    } else if (action === 'decline') {
      await api(`/api/friends/decline/${friendship.id}`, { method: 'POST' });
      await loadRequests();
      setSearchResults(prev => prev.map(u =>
        u.id === targetUser.id ? { ...u, friendship: null } : u
      ));
    } else if (action === 'remove') {
      await api(`/api/friends/${targetUser.id}`, { method: 'DELETE' });
      await loadFriends();
      setSearchResults(prev => prev.map(u =>
        u.id === targetUser.id ? { ...u, friendship: null } : u
      ));
    }
  };

  // Listen for real-time friend events
  useEffect(() => {
    const handler = (e) => {
      if (e.type === 'ws_friend_request') loadRequests();
      if (e.type === 'ws_friend_accepted') loadFriends();
    };
    window.addEventListener('ws_friend_request', handler);
    window.addEventListener('ws_friend_accepted', handler);
    return () => {
      window.removeEventListener('ws_friend_request', handler);
      window.removeEventListener('ws_friend_accepted', handler);
    };
  }, [loadFriends, loadRequests]);

  return (
    <div className="friends-page">
      <div className="friends-header">
        <div className="friends-tabs">
          <button className={`fr-tab ${tab === 'friends' ? 'active' : ''}`}
            onClick={() => setTab('friends')} style={tab === 'friends' ? { color: accent } : {}}>
            <UserCheck size={15} /> Друзья
            {friends.length > 0 && <span className="fr-tab-count">{friends.length}</span>}
          </button>
          <button className={`fr-tab ${tab === 'requests' ? 'active' : ''}`}
            onClick={() => setTab('requests')} style={tab === 'requests' ? { color: accent } : {}}>
            <Clock size={15} /> Заявки
            {requests.length > 0 && <span className="fr-tab-count" style={{ background: accent, color: '#000' }}>{requests.length}</span>}
          </button>
          <button className={`fr-tab ${tab === 'search' ? 'active' : ''}`}
            onClick={() => setTab('search')} style={tab === 'search' ? { color: accent } : {}}>
            <Search size={15} /> Найти
          </button>
        </div>
      </div>

      {/* Friends list */}
      {tab === 'friends' && (
        <div className="fr-list">
          {friends.length === 0 && (
            <div className="fr-empty">
              <Users size={32} />
              <p>Пока нет друзей</p>
              <span>Найдите людей во вкладке «Найти»</span>
            </div>
          )}
          {friends.map(f => (
            <FriendCard key={f.id} user={f}
              friendship={{ status: 'accepted', isMine: true }}
              onAction={handleAction}
              onMessage={onOpenChat}
            />
          ))}
        </div>
      )}

      {/* Incoming requests */}
      {tab === 'requests' && (
        <div className="fr-list">
          {requests.length === 0 && (
            <div className="fr-empty">
              <Clock size={32} />
              <p>Нет входящих заявок</p>
            </div>
          )}
          {requests.map(r => (
            <FriendCard key={r.id} user={r}
              friendship={{ status: 'pending', isMine: false, id: r.friendship_id }}
              onAction={handleAction}
              onMessage={onOpenChat}
            />
          ))}
        </div>
      )}

      {/* Search */}
      {tab === 'search' && (
        <div className="fr-search-wrap">
          <div className="fr-search-box">
            <Search size={16} className="fr-search-icon" />
            <input
              type="text"
              placeholder="Поиск по имени или @username..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              autoFocus
            />
            {searchQ && <button className="fr-search-clear" onClick={() => setSearchQ('')}><X size={14} /></button>}
          </div>
          <div className="fr-list">
            {searching && <p className="fr-searching">Поиск...</p>}
            {!searching && searchQ && searchResults.length === 0 && (
              <div className="fr-empty"><p>Никого не найдено</p></div>
            )}
            {searchResults.map(u => (
              <FriendCard key={u.id} user={u}
                friendship={u.friendship}
                onAction={handleAction}
                onMessage={onOpenChat}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
