import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, X, ArrowLeft, Send, Trash2, Users, Lock, Globe, Heart } from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  });
}

function timeAgo(str) {
  const diff = (Date.now() - new Date(str + 'Z')) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч.`;
  return `${Math.floor(diff / 86400)} дн.`;
}

function ChannelAvatar({ channel, size = 44 }) {
  const letter = (channel.name || '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: '50%',
      backgroundImage: channel.avatar ? `url(${channel.avatar})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center',
      background: channel.avatar ? undefined : '#1a1a1a',
      border: '2px solid #2a2a2a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, color: '#888', flexShrink: 0, fontWeight: 700,
    }}>
      {!channel.avatar && letter}
    </div>
  );
}

function CreateChannelModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !username.trim()) return;
    setLoading(true);
    setError('');
    const res = await api('/api/channels', { method: 'POST', body: JSON.stringify({ name, username, description, type }) });
    const data = await res.json();
    if (res.ok) { onCreated(data); onClose(); }
    else setError(data.error || 'Ошибка');
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Создать канал</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
          <div className="setup-field">
            <label>Название канала</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Мой канал" maxLength={64} />
          </div>
          <div className="setup-field">
            <label>Username (@)</label>
            <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="mychannel" maxLength={32} />
            <span style={{ fontSize: '0.72rem', color: '#444' }}>Только буквы, цифры и _</span>
          </div>
          <div className="setup-field">
            <label>Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="О чём этот канал..." maxLength={300} rows={3} />
          </div>
          <div className="setup-field">
            <label>Тип</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => setType('public')}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: `1px solid ${type === 'public' ? '#fff' : '#222'}`, background: 'transparent', color: type === 'public' ? '#fff' : '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Globe size={14} /> Публичный
              </button>
              <button type="button" onClick={() => setType('private')}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: `1px solid ${type === 'private' ? '#fff' : '#222'}`, background: 'transparent', color: type === 'private' ? '#fff' : '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Lock size={14} /> Приватный
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onClose}>Отмена</button>
          <button className="btn-next" onClick={handleCreate} disabled={loading || !name.trim() || !username.trim()} style={{ flex: 1 }}>
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelView({ channel: initialChannel, user, onBack }) {
  const [channel, setChannel] = useState(initialChannel);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef();
  const isOwner = channel.owner_id === user.id;

  const loadPosts = useCallback(async () => {
    const res = await api(`/api/channels/${channel.id}/posts`);
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts || []);
    }
    setLoading(false);
  }, [channel.id]);

  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50); }, [posts.length]);

  const handleSubscribe = async () => {
    const res = await api(`/api/channels/${channel.id}/subscribe`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setChannel(c => ({ ...c, is_subscribed: data.subscribed ? 1 : 0, subscribers_count: c.subscribers_count + (data.subscribed ? 1 : -1) }));
    }
  };

  const handlePost = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await api(`/api/channels/${channel.id}/posts`, { method: 'POST', body: JSON.stringify({ content: text.trim() }) });
    if (res.ok) {
      const post = await res.json();
      setPosts(prev => [post, ...prev]);
      setText('');
    }
    setSending(false);
  };

  const handleDelete = async (postId) => {
    const res = await api(`/api/channels/${channel.id}/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleReact = async (postId) => {
    const res = await api(`/api/channels/${channel.id}/posts/${postId}/react`, { method: 'POST', body: JSON.stringify({ emoji: '👍' }) });
    if (res.ok) {
      const data = await res.json();
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        reactions_count: p.reactions_count + (data.reacted ? 1 : -1),
        my_reaction: data.reacted ? data.emoji : null,
      } : p));
    }
  };

  return (
    <div className="ch-view">
      <div className="ch-view-header">
        <button className="msg-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <ChannelAvatar channel={channel} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="msg-chat-name">{channel.name}</span>
            {channel.type === 'private' ? <Lock size={12} style={{ color: '#666' }} /> : <Globe size={12} style={{ color: '#666' }} />}
          </div>
          <span className="msg-chat-username">{channel.subscribers_count} подписчиков</span>
        </div>
        {!isOwner && (
          <button className={`ch-sub-btn ${channel.is_subscribed ? 'active' : ''}`} onClick={handleSubscribe}>
            {channel.is_subscribed ? 'Отписаться' : 'Подписаться'}
          </button>
        )}
      </div>

      <div className="ch-posts">
        {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#444' }}>Загрузка...</div>}
        {!loading && posts.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#444' }}>
            <p>Постов пока нет</p>
            {isOwner && <span style={{ fontSize: '0.85rem' }}>Опубликуйте первый пост</span>}
          </div>
        )}
        {posts.map(post => (
          <div key={post.id} className="ch-post">
            <div className="ch-post-header">
              <ChannelAvatar channel={channel} size={32} />
              <div style={{ flex: 1 }}>
                <span className="ch-post-channel">{channel.name}</span>
                <span className="ch-post-time">{timeAgo(post.created_at)}</span>
              </div>
              {isOwner && (
                <button className="ch-post-delete" onClick={() => handleDelete(post.id)} title="Удалить">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {post.content && <p className="ch-post-content">{post.content}</p>}
            {post.media && post.media_type === 'image' && <img src={post.media} alt="media" className="ch-post-media" />}
            <div className="ch-post-footer">
              <button className={`ch-react-btn ${post.my_reaction ? 'active' : ''}`} onClick={() => handleReact(post.id)}>
                <Heart size={14} fill={post.my_reaction ? 'currentColor' : 'none'} />
                {post.reactions_count > 0 && <span>{post.reactions_count}</span>}
              </button>
              <span className="ch-post-views">{post.views || 0} просмотров</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {isOwner && (
        <div className="ch-input-area">
          <input
            className="msg-input"
            placeholder="Написать пост..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handlePost()}
            maxLength={4000}
          />
          <button className="msg-send-btn" onClick={handlePost} disabled={!text.trim() || sending}>
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Channels({ user }) {
  const [channels, setChannels] = useState({ publicChannels: [], myChannels: [] });
  const [activeChannel, setActiveChannel] = useState(null);
  const [tab, setTab] = useState('all'); // all | my
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const res = await api('/api/channels');
    if (res.ok) setChannels(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await api(`/api/channels/search?q=${encodeURIComponent(search)}`);
      if (res.ok) setSearchResults(await res.json());
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  if (activeChannel) {
    return <ChannelView channel={activeChannel} user={user} onBack={() => { setActiveChannel(null); load(); }} />;
  }

  const displayChannels = search ? searchResults : (tab === 'my' ? channels.myChannels : channels.publicChannels);

  return (
    <div className="ch-page">
      <div className="ch-header">
        <span className="ch-title">Каналы</span>
        <button className="ch-create-btn" onClick={() => setShowCreate(true)} title="Создать канал">
          <Plus size={18} />
        </button>
      </div>

      <div className="ch-search-wrap">
        <Search size={14} className="ch-search-icon" />
        <input className="ch-search-input" placeholder="Поиск каналов..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button className="ch-search-clear" onClick={() => setSearch('')}><X size={12} /></button>}
      </div>

      {!search && (
        <div className="ch-tabs">
          <button className={`ch-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>Все</button>
          <button className={`ch-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>Мои</button>
        </div>
      )}

      <div className="ch-list">
        {searching && <div style={{ padding: '1rem', color: '#444', fontSize: '0.85rem' }}>Поиск...</div>}
        {!searching && displayChannels.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#444' }}>
            {tab === 'my' && !search ? (
              <>
                <p style={{ marginBottom: '0.5rem' }}>Вы не подписаны ни на один канал</p>
                <span style={{ fontSize: '0.82rem' }}>Найдите интересные каналы во вкладке «Все»</span>
              </>
            ) : <p>Каналов не найдено</p>}
          </div>
        )}
        {displayChannels.map(ch => (
          <button key={ch.id} className="ch-item" onClick={() => setActiveChannel(ch)}>
            <ChannelAvatar channel={ch} size={44} />
            <div className="ch-item-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="ch-item-name">{ch.name}</span>
                {ch.type === 'private' ? <Lock size={11} style={{ color: '#555' }} /> : null}
              </div>
              <span className="ch-item-username">@{ch.username}</span>
              {ch.description && <span className="ch-item-desc">{ch.description.slice(0, 60)}{ch.description.length > 60 ? '...' : ''}</span>}
            </div>
            <div className="ch-item-meta">
              <span className="ch-item-subs"><Users size={11} /> {ch.subscribers_count}</span>
              {ch.is_subscribed ? <span className="ch-item-badge">Подписан</span> : null}
            </div>
          </button>
        ))}
      </div>

      {showCreate && <CreateChannelModal onClose={() => setShowCreate(false)} onCreated={(ch) => { setChannels(prev => ({ ...prev, myChannels: [ch, ...prev.myChannels] })); setActiveChannel(ch); }} />}
    </div>
  );
}
