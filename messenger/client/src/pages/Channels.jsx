import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, X, ArrowLeft, Send, Trash2, Users, Lock, Globe, Heart, Pencil, Eye, Image, Smile, Flag, Link2, BarChart2 } from 'lucide-react';
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
      backgroundImage: channel.avatar ? `url(${channel.avatar})` : 'none',
      backgroundSize: 'cover', backgroundPosition: 'center',
      backgroundColor: channel.avatar ? 'transparent' : '#1a1a1a',
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
                backgroundImage: avatar ? `url(${avatar})` : 'none',
                backgroundSize: 'cover', backgroundPosition: 'center',
                backgroundColor: avatar ? 'transparent' : '#1a1a1a',
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

function ReportModal({ targetType, targetId, onClose }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const REASONS = ['Спам', 'Мошенничество', 'Оскорбительный контент', 'Нарушение правил', 'Другое'];

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
    });
    const data = await res.json();
    if (res.ok) setDone(true);
    else setError(data.error || 'Ошибка');
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Пожаловаться</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {done ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#69db7c' }}>
              ✓ Жалоба отправлена. Мы рассмотрим её в ближайшее время.
            </div>
          ) : (
            <>
              {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>Выберите причину жалобы:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                {REASONS.map(r => (
                  <button key={r} type="button" onClick={() => setReason(r)}
                    style={{ padding: '0.6rem 0.9rem', borderRadius: 8, border: `1px solid ${reason === r ? '#fff' : '#222'}`, background: reason === r ? '#1e1e1e' : 'transparent', color: reason === r ? '#fff' : '#666', cursor: 'pointer', textAlign: 'left', fontSize: '0.88rem' }}>
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Опишите проблему подробнее..."
                maxLength={500}
                rows={3}
                style={{ width: '100%', padding: '0.65rem 0.9rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: 8, color: '#f0f0f0', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none', resize: 'none' }}
              />
            </>
          )}
        </div>
        {!done && (
          <div className="modal-footer">
            <button className="btn-back" onClick={onClose}>Отмена</button>
            <button className="btn-next" onClick={handleSubmit} disabled={loading || !reason.trim()} style={{ flex: 1, background: '#ff6b6b', color: '#fff' }}>
              {loading ? 'Отправка...' : 'Отправить жалобу'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
      <img src={src} alt="full" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }} loading="lazy" />
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
    </div>
  );
}

function SpoilerImage({ src, spoiler }) {
  const [revealed, setRevealed] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  if (!spoiler || revealed) return (
    <>
      <img src={src} alt="media" className="ch-post-media" loading="lazy" onClick={() => setLightbox(true)} />
      {lightbox && <Lightbox src={src} onClose={() => setLightbox(false)} />}
    </>
  );
  return (
    <div className="ch-spoiler-wrap" onClick={() => setRevealed(true)} title="Нажмите чтобы показать">
      <img src={src} alt="media" className="ch-post-media ch-spoiler-img" loading="lazy" />
      <div className="ch-spoiler-overlay">
        <span>🔞 Нажмите чтобы показать</span>
      </div>
    </div>
  );
}

function ChannelView({ channel: initialChannel, user, onBack }) {
  const navigate = useNavigate();
  const [channel, setChannel] = useState(initialChannel);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSubscribers, setShowSubscribers] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [spoiler, setSpoiler] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const bottomRef = useRef();
  const fileRef = useRef();
  const pickerRef = useRef();
  const isOwner = channel.owner_id === user.id;

  const loadSubscribers = async () => {
    setSubsLoading(true);
    const res = await api(`/api/channels/${channel.id}/subscribers`);
    if (res.ok) setSubscribers(await res.json());
    setSubsLoading(false);
  };

  const handleKick = async (userId) => {
    const res = await api(`/api/channels/${channel.id}/subscribers/${userId}`, { method: 'DELETE' });
    if (res.ok) setSubscribers(prev => prev.filter(s => s.id !== userId));
  };

  const handleBan = async (userId) => {
    const res = await api(`/api/channels/${channel.id}/ban/${userId}`, { method: 'POST' });
    if (res.ok) setSubscribers(prev => prev.map(s => s.id === userId ? { ...s, is_banned: 1 } : s));
  };

  const handleUnban = async (userId) => {
    const res = await api(`/api/channels/${channel.id}/ban/${userId}`, { method: 'DELETE' });
    if (res.ok) setSubscribers(prev => prev.map(s => s.id === userId ? { ...s, is_banned: 0 } : s));
  };

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
    const onKicked = (e) => {
      if (e.detail.channelId !== channel.id) return;
      onBack(); // kicked from this channel — go back
    };
    window.addEventListener('ws_channel_post', onPost);
    window.addEventListener('ws_channel_post_deleted', onDeleted);
    window.addEventListener('ws_channel_reaction', onReaction);
    window.addEventListener('ws_channel_updated', onUpdated);
    window.addEventListener('ws_channel_kicked', onKicked);
    window.addEventListener('ws_channel_banned', onKicked);
    return () => {
      window.removeEventListener('ws_channel_post', onPost);
      window.removeEventListener('ws_channel_post_deleted', onDeleted);
      window.removeEventListener('ws_channel_reaction', onReaction);
      window.removeEventListener('ws_channel_updated', onUpdated);
      window.removeEventListener('ws_channel_kicked', onKicked);
      window.removeEventListener('ws_channel_banned', onKicked);
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
    const files = Array.from(e.target.files).slice(0, 10);
    if (!files.length) return;
    const newPreviews = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) continue;
      const src = await fileToBase64(file);
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      newPreviews.push({ src, type });
    }
    if (!newPreviews.length) return;

    // Merge with existing previews
    setMediaPreview(prev => {
      const existing = prev?.multiple ? prev.multiple : prev ? [prev] : [];
      const merged = [...existing, ...newPreviews].slice(0, 10);
      return merged.length === 1 ? merged[0] : { multiple: merged };
    });
    e.target.value = '';
  };

  const handlePost = async () => {
    if (sending) return;
    // Poll post
    if (showPoll) {
      const opts = pollOptions.filter(o => o.trim());
      if (opts.length < 2) return;
      setSending(true);
      await api(`/api/channels/${channel.id}/posts`, {
        method: 'POST',
        body: JSON.stringify({ content: text.trim() || null, media_type: 'poll', poll_options: opts }),
      });
      setText(''); setPollOptions(['', '']); setShowPoll(false);
      setSending(false);
      return;
    }
    if ((!text.trim() && !mediaPreview) || sending) return;
    setSending(true);

    // Multi-file: send each as separate post
    if (mediaPreview?.multiple) {
      const files = mediaPreview.multiple;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const content = i === 0 ? (text.trim() || null) : null;
        await api(`/api/channels/${channel.id}/posts`, {
          method: 'POST',
          body: JSON.stringify({ content, media: f.src, media_type: f.type, spoiler: spoiler && !!f.src }),
        });
        // Posts arrive via WS — no local setPosts needed
      }
      setText('');
      setMediaPreview(null);
      setSpoiler(false);
      setSending(false);
      return;
    }

    await api(`/api/channels/${channel.id}/posts`, {
      method: 'POST',
      body: JSON.stringify({ content: text.trim() || null, media: mediaPreview?.src || null, media_type: mediaPreview?.type || null, spoiler: spoiler && !!mediaPreview }),
    });
    // Post arrives via WS broadcast
    setText('');
    setMediaPreview(null);
    setSpoiler(false);
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
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ch-sub-btn" onClick={() => {
              const url = `${window.location.origin}/c/${channel.username}`;
              navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована: ' + url)).catch(() => alert(url));
            }} title="Скопировать ссылку" style={{ padding: '0.4rem 0.6rem' }}>
              <Link2 size={14} />
            </button>
            <button className="ch-sub-btn" onClick={() => { setShowSubscribers(v => !v); if (!showSubscribers) loadSubscribers(); }} title="Подписчики">
              <Users size={14} />
            </button>
            <button className="ch-sub-btn" onClick={() => setShowEdit(true)} title="Редактировать">
              <Pencil size={14} />
            </button>
            <button className="ch-sub-btn" onClick={async () => {
              if (!confirm('Удалить канал? Все посты будут удалены безвозвратно.')) return;
              const res = await api(`/api/channels/${channel.id}`, { method: 'DELETE' });
              if (res.ok) navigate('/channels');
            }} title="Удалить канал" style={{ color: '#ff4444' }}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {!isOwner && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ch-sub-btn" onClick={() => {
              const url = `${window.location.origin}/c/${channel.username}`;
              navigator.clipboard?.writeText(url).then(() => alert('Ссылка скопирована: ' + url)).catch(() => alert(url));
            }} title="Скопировать ссылку" style={{ padding: '0.4rem 0.6rem' }}>
              <Link2 size={14} />
            </button>
            <button className={`ch-sub-btn ${channel.is_subscribed ? 'active' : ''}`} onClick={handleSubscribe}>
              {channel.is_subscribed ? 'Отписаться' : 'Подписаться'}
            </button>
            <button className="ch-sub-btn" onClick={() => setShowReport(true)} title="Пожаловаться" style={{ padding: '0.4rem 0.6rem' }}>
              <Flag size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Description panel */}
      {showDesc && channel.description && (
        <div style={{ padding: '0.75rem 1rem', background: '#111', borderBottom: '1px solid #1a1a1a', fontSize: '0.85rem', color: '#888', lineHeight: 1.5 }}>
          {channel.description}
        </div>
      )}

      {/* Subscribers management panel (owner only) */}
      {isOwner && showSubscribers && (
        <div style={{ background: '#0d0d0d', borderBottom: '1px solid #1a1a1a', maxHeight: 320, overflowY: 'auto' }}>
          <div style={{ padding: '0.6rem 1rem', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#444', borderBottom: '1px solid #1a1a1a' }}>
            Подписчики ({subscribers.length})
          </div>
          {subsLoading && <div style={{ padding: '1rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>Загрузка...</div>}
          {!subsLoading && subscribers.length === 0 && (
            <div style={{ padding: '1rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>Нет подписчиков</div>
          )}
          {subscribers.map(sub => (
            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 1rem', borderBottom: '1px solid #111' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundImage: sub.avatar ? `url(${sub.avatar})` : 'none', backgroundColor: '#1a1a1a', backgroundSize: 'cover', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#888' }}>
                {!sub.avatar && (sub.display_name || sub.username)[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', color: sub.is_banned ? '#ff6b6b' : '#ccc', fontWeight: 500 }}>
                  {sub.display_name || sub.username}
                  {sub.is_banned ? <span style={{ fontSize: '0.7rem', color: '#ff6b6b', marginLeft: 6 }}>заблокирован</span> : null}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#444' }}>@{sub.username}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!sub.is_banned ? (
                  <>
                    <button onClick={() => handleKick(sub.id)} title="Выгнать"
                      style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', cursor: 'pointer', fontSize: '0.72rem' }}>
                      Выгнать
                    </button>
                    <button onClick={() => handleBan(sub.id)} title="Заблокировать"
                      style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid #ff6b6b44', borderRadius: 6, color: '#ff6b6b', cursor: 'pointer', fontSize: '0.72rem' }}>
                      Бан
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleUnban(sub.id)} title="Разблокировать"
                    style={{ padding: '0.3rem 0.5rem', background: 'transparent', border: '1px solid #69db7c44', borderRadius: 6, color: '#69db7c', cursor: 'pointer', fontSize: '0.72rem' }}>
                    Разбан
                  </button>
                )}
              </div>
            </div>
          ))}
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
            {post.media_type === 'poll' && post.poll && (
              <div className="ch-poll">
                {post.poll.map(opt => {
                  const total = post.poll.reduce((s, o) => s + o.votes, 0);
                  const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                  const hasVoted = post.poll.some(o => o.voted);
                  return (
                    <button key={opt.id}
                      className={`ch-poll-opt ${opt.voted ? 'ch-poll-voted' : ''} ${hasVoted ? 'ch-poll-revealed' : ''}`}
                      onClick={async () => {
                        if (hasVoted) return;
                        const res = await api(`/api/channels/${channel.id}/posts/${post.id}/poll/${opt.id}`, { method: 'POST' });
                        if (res.ok) {
                          const updated = await res.json();
                          setPosts(prev => prev.map(p => p.id === post.id ? { ...p, poll: updated } : p));
                        }
                      }}
                    >
                      {hasVoted && <div className="ch-poll-bar" style={{ width: `${pct}%` }} />}
                      <span className="ch-poll-text">{opt.text}</span>
                      {hasVoted && <span className="ch-poll-pct">{pct}%</span>}
                    </button>
                  );
                })}
                <p className="ch-poll-total">
                  {post.poll.reduce((s, o) => s + o.votes, 0)} голосов
                </p>
              </div>
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
            <div style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' }}>
              {mediaPreview.multiple
                ? mediaPreview.multiple.map((f, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      {f.type === 'image' || f.type === 'gif'
                        ? <img src={f.src} alt="preview" style={{ height: 60, borderRadius: 6, objectFit: 'cover' }} />
                        : <video src={f.src} style={{ height: 60, borderRadius: 6 }} />
                      }
                      <button onClick={() => {
                        const next = mediaPreview.multiple.filter((_, idx) => idx !== i);
                        setMediaPreview(next.length === 0 ? null : next.length === 1 ? next[0] : { multiple: next });
                      }} style={{ position: 'absolute', top: -4, right: -4, background: '#ff6b6b', border: 'none', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                    </div>
                  ))
                : <>
                    {mediaPreview.type === 'image' || mediaPreview.type === 'gif'
                      ? <img src={mediaPreview.src} alt="preview" style={{ height: 60, borderRadius: 6, objectFit: 'cover' }} />
                      : <video src={mediaPreview.src} style={{ height: 60, borderRadius: 6 }} />
                    }
                    <button onClick={() => setMediaPreview(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
                  </>
              }
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
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={handleMediaPick} />
            <button className="msg-media-btn" onClick={() => fileRef.current.click()} title="Фото/видео">
              <Image size={18} />
            </button>
            <button className="msg-media-btn" onClick={() => setShowPicker(v => !v)} title="Эмодзи/GIF" style={{ color: showPicker ? '#fff' : undefined }}>
              <Smile size={18} />
            </button>
            <button className={`msg-media-btn ${showPoll ? 'active' : ''}`}
              onClick={() => { setShowPoll(v => !v); setMediaPreview(null); }}
              title="Опрос" style={{ color: showPoll ? '#a855f7' : undefined }}>
              <BarChart2 size={18} />
            </button>
            {mediaPreview && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: spoiler ? '#ffd43b' : '#555', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} style={{ cursor: 'pointer' }} />
                Цензура
              </label>
            )}
            <input
              className="msg-input"
              placeholder={showPoll ? 'Вопрос (необязательно)...' : 'Написать пост...'}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !showPoll && handlePost()}
              maxLength={4000}
            />
            <button className="msg-send-btn" onClick={handlePost}
              disabled={showPoll ? pollOptions.filter(o => o.trim()).length < 2 || sending : (!text.trim() && !mediaPreview) || sending}>
              <Send size={16} />
            </button>
          </div>

          {/* Poll options */}
          {showPoll && (
            <div style={{ padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    className="msg-input"
                    placeholder={`Вариант ${i + 1}`}
                    value={opt}
                    onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))}
                    maxLength={200}
                    style={{ flex: 1 }}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button onClick={() => setPollOptions(prev => [...prev, ''])}
                  style={{ background: 'none', border: '1px dashed #333', borderRadius: 8, color: '#555', cursor: 'pointer', padding: '0.4rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <Plus size={13} /> Добавить вариант
                </button>
              )}
            </div>
          )}
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

      {showReport && (
        <ReportModal targetType="channel" targetId={channel.id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

export default function Channels({ user }) {
  const location = useLocation();
  const [channels, setChannels] = useState({ publicChannels: [], myChannels: [] });
  const [activeChannel, setActiveChannel] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const openChannelUsername = location.state?.openChannel;

  const load = useCallback(async () => {
    const res = await api('/api/channels');
    if (res.ok) setChannels(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-open channel from deep link after channels are loaded
  useEffect(() => {
    if (!openChannelUsername || activeChannel) return;
    api(`/api/channels/search?q=${encodeURIComponent(openChannelUsername)}`)
      .then(r => r.ok ? r.json() : [])
      .then(results => {
        const found = results.find(c => c.username.toLowerCase() === openChannelUsername.toLowerCase());
        if (found) setActiveChannel(found);
      })
      .catch(() => {});
  }, [openChannelUsername]);

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
