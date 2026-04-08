import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, X, ArrowLeft, Send, Trash2, Users, Lock, Globe, Heart, Pencil, Eye, Image, Smile } from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';

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

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
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

function ChannelFormModal({ initial, onClose, onSave, title }) {
  const [name, setName] = useState(initial?.name || '');
  const [username, setUsername] = useState(initial?.username || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [type, setType] = useState(initial?.type || 'public');
  const [avatar, setAvatar] = useState(initial?.avatar || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const avatarRef = useRef();
  const isEdit = !!initial;

  const handleAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Аватарка не более 5MB'); return; }
    const b64 = await fileToBase64(file);
    setAvatar(b64);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!isEdit && !username.trim()) return;
    setLoading(true);
    setError('');
    try {
      const body = isEdit
        ? { name, description, type, avatar }
        : { name, username, description, type, avatar };
      const res = await api(isEdit ? `/api/channels/${initial.id}` : '/api/channels', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { onSave(data); onClose(); }
      else setError(data.error || 'Ошибка');
    } catch { setError('Ошибка сети'); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {/* Avatar upload */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <div
              onClick={() => avatarRef.current.click()}
              style={{
                width: 80, height: 80, borderRadius: '50%', cursor: 'pointer',
                backgroundImage: avatar ? `url(${avatar})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                background: avatar ? undefined : '#1a1a1a',
                border: '2px dashed #333', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#555', fontSize: '0.75rem',
                flexDirection: 'column', gap: 4, transition: 'border-color 0.2s',
              }}
            >
              {!avatar && <><Image size={20} /><span>Аватарка</span></>}
            </div>
            <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
          </div>

          <div className="setup-field">
            <label>Название</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Мой канал" maxLength={64} />
          </div>
          {!isEdit && (
            <div className="setup-field">
              <label>Username (@)</label>
              <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="mychannel" maxLength={32} />
              <span style={{ fontSize: '0.72rem', color: '#444' }}>Только буквы, цифры и _</span>
            </div>
          )}
          <div className="setup-field">
            <label>Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="О чём этот канал..." maxLength={300} rows={3} />
          </div>
          <div className="setup-field">
            <label>Тип</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {['public', 'private'].map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: `1px solid ${type === t ? '#fff' : '#222'}`, background: 'transparent', color: type === t ? '#fff' : '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  {t === 'public' ? <><Globe size={14} /> Публичный</> : <><Lock size={14} /> Приватный</>}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onClose}>Отмена</button>
          <button className="btn-next" onClick={handleSave} disabled={loading || !name.trim()} style={{ flex: 1 }}>
            {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpoilerImage({ src, spoiler }) {
  const [revealed, setRevealed] = useState(false);
  if (!spoiler || revealed) {
    return <img src={src} alt="media" className="ch-post-media" onClick={() => {}} />;
  }
  return (
    <div className="ch-spoiler-wrap" onClick={() => setRevealed(true)} title="Нажмите чтобы показать">
      <img src={src} alt="media" className="ch-post-media ch-spoiler-img" />
      <div className="ch-spoiler-overlay">
        <span>🔞 Нажмите чтобы показать</span>
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
  const [showEdit, setShowEdit] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [spoiler, setSpoiler] = useState(false); // { src, type }
  const [showPicker, setShowPicker] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const bottomRef = useRef();
  const fileRef = useRef();
  const pickerRef = useRef();
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

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Real-time WS events
  useEffect(() => {
    const onPost = (e) => {
      if (e.detail.channelId !== channel.id) return;
      setPosts(prev => prev.find(p => p.id === e.detail.post.id) ? prev : [e.detail.post, ...prev]);
    };
    const onDeleted = (e) => {
      if (e.detail.channelId !== channel.id) return;
      setPosts(prev => prev.filter(p => p.id !== e.detail.postId));
    };
    const onReaction = (e) => {
      if (e.detail.channelId !== channel.id) return;
      setPosts(prev => prev.map(p => p.id === e.detail.postId
        ? { ...p, reactions_count: e.detail.count, my_reaction: e.detail.reacted ? e.detail.emoji : null }
        : p
      ));
    };
    const onUpdated = (e) => {
      if (e.detail.id !== channel.id) return;
      setChannel(e.detail);
    };
    window.addEventListener('ws_channel_post', onPost);
    window.addEventListener('ws_channel_post_deleted', onDeleted);
    window.addEventListener('ws_channel_reaction', onReaction);
    window.addEventListener('ws_channel_updated', onUpdated);
    return () => {
      window.removeEventListener('ws_channel_post', onPost);
      window.removeEventListener('ws_channel_post_deleted', onDeleted);
      window.removeEventListener('ws_channel_reaction', onReaction);
      window.removeEventListener('ws_channel_updated', onUpdated);
    };
  }, [channel.id]);

  // Register views
  const registeredViews = useRef(new Set());
  useEffect(() => {
    posts.forEach(post => {
      if (!registeredViews.current.has(post.id)) {
        registeredViews.current.add(post.id);
        api(`/api/channels/${channel.id}/posts/${post.id}/view`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, views: data.views } : p)); })
          .catch(() => {});
      }
    });
  }, [posts.length, channel.id]);

  const handleSubscribe = async () => {
    const res = await api(`/api/channels/${channel.id}/subscribe`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setChannel(c => ({ ...c, is_subscribed: data.subscribed ? 1 : 0, subscribers_count: c.subscribers_count + (data.subscribed ? 1 : -1) }));
    }
  };

  const handleMediaPick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return;
    const src = await fileToBase64(file);
    const type = file.type.startsWith('image/') ? 'image' : 'video';
    setMediaPreview({ src, type });
    e.target.value = '';
  };

  const handlePost = async () => {
    if ((!text.trim() && !mediaPreview) || sending) return;
    setSending(true);
    const res = await api(`/api/channels/${channel.id}/posts`, {
      method: 'POST',
      body: JSON.stringify({ content: text.trim() || null, media: mediaPreview?.src || null, media_type: mediaPreview?.type || null, spoiler: spoiler && !!mediaPreview }),
    });
    if (res.ok) {
      const post = await res.json();
      setPosts(prev => [post, ...prev]);
      setText('');
      setMediaPreview(null);
      setSpoiler(false);
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
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions_count: data.count, my_reaction: data.reacted ? data.emoji : null } : p));
    }
  };

  return (
    <div className="ch-view">
      <div className="ch-view-header">
        <button className="msg-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <div onClick={() => channel.description && setShowDesc(v => !v)} style={{ cursor: channel.description ? 'pointer' : 'default' }}>
          <ChannelAvatar channel={channel} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }} onClick={() => channel.description && setShowDesc(v => !v)} style={{ flex: 1, minWidth: 0, cursor: channel.description ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="msg-chat-name">{channel.name}</span>
            {channel.type === 'private' ? <Lock size={12} style={{ color: '#666' }} /> : <Globe size={12} style={{ color: '#666' }} />}
          </div>
          <span className="msg-chat-username">{channel.subscribers_count} подписчиков</span>
        </div>
        {isOwner && (
          <button className="ch-sub-btn" onClick={() => setShowEdit(true)} title="Редактировать">
            <Pencil size={14} />
          </button>
        )}
        {!isOwner && (
          <button className={`ch-sub-btn ${channel.is_subscribed ? 'active' : ''}`} onClick={handleSubscribe}>
            {channel.is_subscribed ? 'Отписаться' : 'Подписаться'}
          </button>
        )}
      </div>

      {/* Description panel */}
      {showDesc && channel.description && (
        <div style={{ padding: '0.75rem 1rem', background: '#111', borderBottom: '1px solid #1a1a1a', fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>
          {channel.description}
        </div>
      )}

      <div className="ch-posts">
        {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#444' }}>Загрузка...</div>}
        {!loading && posts.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#444' }}>
            <p>Постов пока нет</p>
            {isOwner && <span style={{ fontSize: '0.85rem' }}>Напишите первый пост ниже</span>}
          </div>
        )}
        {posts.map(post => (
          <div key={post.id} className="ch-post">
            <div className="ch-post-header">
              <ChannelAvatar channel={channel} size={32} />
              <div style={{ flex: 1 }}>
                <span className="ch-post-channel">{channel.name}</span>
                <span className="ch-post-time"> · {timeAgo(post.created_at)}</span>
              </div>
              {isOwner && (
                <button className="ch-post-delete" onClick={() => handleDelete(post.id)} title="Удалить">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {post.content && <p className="ch-post-content">{post.content}</p>}
            {post.media && (post.media_type === 'image' || post.media_type === 'gif') && (
              <SpoilerImage src={post.media} spoiler={post.spoiler} />
            )}
            {post.media && post.media_type === 'video' && (
              <video src={post.media} controls className="ch-post-media" />
            )}
            <div className="ch-post-footer">
              <button className={`ch-react-btn ${post.my_reaction ? 'active' : ''}`} onClick={() => handleReact(post.id)}>
                <Heart size={14} fill={post.my_reaction ? 'currentColor' : 'none'} />
                {post.reactions_count > 0 && <span>{post.reactions_count}</span>}
              </button>
              <span className="ch-post-views"><Eye size={12} /> {post.views || 0}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {isOwner && (
        <div style={{ flexShrink: 0, borderTop: '1px solid #1a1a1a', background: '#0d0d0d', paddingBottom: 'env(safe-area-inset-bottom, 0)' }}>
          {/* Media preview */}
          {mediaPreview && (
            <div style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #1a1a1a' }}>
              {mediaPreview.type === 'image' || mediaPreview.type === 'gif'
                ? <img src={mediaPreview.src} alt="preview" style={{ height: 60, borderRadius: 6, objectFit: 'cover' }} />
                : <video src={mediaPreview.src} style={{ height: 60, borderRadius: 6 }} />
              }
              <button onClick={() => setMediaPreview(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
            </div>
          )}

          {/* Emoji picker */}
          {showPicker && (
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <EmojiPicker
                onEmoji={(e) => { setText(t => t + e); setShowPicker(false); }}
                onSticker={(e) => { setText(t => t + e); setShowPicker(false); }}
                onGif={(gif) => { setMediaPreview({ src: gif.url, type: 'gif' }); setShowPicker(false); }}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem' }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleMediaPick} />
            <button className="msg-media-btn" onClick={() => fileRef.current.click()} title="Фото/видео">
              <Image size={18} />
            </button>
            <button className="msg-media-btn" onClick={() => setShowPicker(v => !v)} title="Эмодзи/GIF" style={{ color: showPicker ? '#fff' : undefined }}>
              <Smile size={18} />
            </button>
            {mediaPreview && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: spoiler ? '#ffd43b' : '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} style={{ cursor: 'pointer' }} />
                Цензура
              </label>
            )}
            <input
              className="msg-input"
              placeholder="Написать пост..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handlePost()}
              maxLength={4000}
            />
            <button className="msg-send-btn" onClick={handlePost} disabled={(!text.trim() && !mediaPreview) || sending}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {showEdit && (
        <ChannelFormModal
          initial={channel}
          title="Редактировать канал"
          onClose={() => setShowEdit(false)}
          onSave={(updated) => setChannel(updated)}
        />
      )}
    </div>
  );
}

export default function Channels({ user }) {
  const [channels, setChannels] = useState({ publicChannels: [], myChannels: [] });
  const [activeChannel, setActiveChannel] = useState(null);
  const [tab, setTab] = useState('all');
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
    const handler = () => load();
    window.addEventListener('ws_channel_post', handler);
    return () => window.removeEventListener('ws_channel_post', handler);
  }, [load]);

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
            {tab === 'my' && !search
              ? <><p style={{ marginBottom: '0.5rem' }}>Вы не подписаны ни на один канал</p><span style={{ fontSize: '0.82rem' }}>Найдите каналы во вкладке «Все»</span></>
              : <p>Каналов не найдено</p>}
          </div>
        )}
        {displayChannels.map(ch => (
          <button key={ch.id} className="ch-item" onClick={() => setActiveChannel(ch)}>
            <ChannelAvatar channel={ch} size={44} />
            <div className="ch-item-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="ch-item-name">{ch.name}</span>
                {ch.type === 'private' && <Lock size={11} style={{ color: '#555' }} />}
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

      {showCreate && (
        <ChannelFormModal
          title="Создать канал"
          onClose={() => setShowCreate(false)}
          onSave={(ch) => { setChannels(prev => ({ ...prev, myChannels: [ch, ...prev.myChannels] })); setActiveChannel(ch); }}
        />
      )}
    </div>
  );
}
