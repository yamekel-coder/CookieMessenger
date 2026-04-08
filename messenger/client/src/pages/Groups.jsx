import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Plus, Search, X, Send, ArrowLeft, Lock, Globe,
  LogOut, Trash2, Settings, UserPlus, Crown, Shield, Check,
  Image, Video, Smile, Flag,
} from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  });
}

function Avatar({ src, name, accent, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, minWidth: size, borderRadius: '50%',
      backgroundImage: src ? `url(${src})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center',
      background: src ? undefined : '#1a1a1a',
      border: `2px solid ${accent || '#333'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, color: '#888', flexShrink: 0,
    }}>
      {!src && (name?.[0] || '?').toUpperCase()}
    </div>
  );
}

function CreateGroupModal({ onClose, onCreated, user }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleAvatar = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatar(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name, description, type, avatar }) });
    if (res.ok) { onCreated(await res.json()); onClose(); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Создать группу</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="grp-avatar-pick" onClick={() => fileRef.current.click()}>
            {avatar ? <img src={avatar} alt="avatar" /> : <Users size={28} style={{ color: '#555' }} />}
            <span>Фото группы</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatar} />

          <div className="sif-field">
            <label>Название *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название группы" maxLength={50} />
          </div>
          <div className="sif-field">
            <label>Описание</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="О чём эта группа?" maxLength={200} />
          </div>
          <div className="sif-field">
            <label>Тип</label>
            <div className="grp-type-row">
              <button className={`grp-type-btn ${type === 'public' ? 'active' : ''}`} onClick={() => setType('public')}>
                <Globe size={15} /> Публичная
              </button>
              <button className={`grp-type-btn ${type === 'private' ? 'active' : ''}`} onClick={() => setType('private')}>
                <Lock size={15} /> Приватная
              </button>
            </div>
            <p className="grp-type-hint">
              {type === 'public' ? 'Любой может найти и вступить' : 'Только по приглашению'}
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button className="sif-cancel" onClick={onClose}>Отмена</button>
          <button className="sif-submit" onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Создание...' : 'Создать'}
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
    const res = await fetch('/api/report', {
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
            <div style={{ textAlign: 'center', padding: '1rem', color: '#69db7c' }}>✓ Жалоба отправлена</div>
          ) : (
            <>
              {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                {REASONS.map(r => (
                  <button key={r} type="button" onClick={() => setReason(r)}
                    style={{ padding: '0.6rem 0.9rem', borderRadius: 8, border: `1px solid ${reason === r ? '#fff' : '#222'}`, background: reason === r ? '#1e1e1e' : 'transparent', color: reason === r ? '#fff' : '#666', cursor: 'pointer', textAlign: 'left', fontSize: '0.88rem' }}>
                    {r}
                  </button>
                ))}
              </div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Подробнее..." maxLength={500} rows={3}
                style={{ width: '100%', padding: '0.65rem', background: '#0a0a0a', border: '1px solid #222', borderRadius: 8, color: '#f0f0f0', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none', resize: 'none' }} />
            </>
          )}
        </div>
        {!done && (
          <div className="modal-footer">
            <button className="btn-back" onClick={onClose}>Отмена</button>
            <button className="btn-next" onClick={handleSubmit} disabled={loading || !reason.trim()} style={{ flex: 1, background: '#ff6b6b', color: '#fff' }}>
              {loading ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupChat({ group: initialGroup, user, onBack, onLeave }) {
  const [group, setGroup] = useState(initialGroup);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('chat'); // chat | members | settings
  const [showReport, setShowReport] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const bottomRef = useRef();
  const fileRef = useRef();
  const videoRef = useRef();
  const pickerRef = useRef();
  const accent = user.accent_color || '#fff';
  const isOwner = group.myRole === 'owner';
  const isAdmin = group.myRole === 'owner' || group.myRole === 'admin';

  const loadMessages = useCallback(async () => {
    const res = await api(`/api/groups/${group.id}/messages`);
    if (res.ok) { setMessages(await res.json()); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50); }
  }, [group.id]);

  const loadGroup = useCallback(async () => {
    const res = await api(`/api/groups/${group.id}`);
    if (res.ok) setGroup(await res.json());
  }, [group.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    const handler = (e) => {
      const { groupId, message } = e.detail;
      if (groupId === group.id) {
        setMessages(prev => prev.find(m => m.id === message.id) ? prev : [...prev, message]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      }
    };
    window.addEventListener('ws_group_message', handler);
    return () => window.removeEventListener('ws_group_message', handler);
  }, [group.id]);

  const sendMessage = async () => {
    if ((!text.trim() && !mediaPreview) || sending) return;
    setSending(true);
    const body = { content: text.trim() || null, media: mediaPreview?.src || null, media_type: mediaPreview?.type || null };
    const res = await api(`/api/groups/${group.id}/messages`, { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) { setText(''); setMediaPreview(null); }
    setSending(false);
  };

  const handleMediaPick = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setMediaPreview({ src: ev.target.result, type });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleInviteSearch = async (q) => {
    setInviteSearch(q);
    if (!q.trim()) { setInviteResults([]); return; }
    const res = await api(`/api/friends/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const users = await res.json();
      setInviteResults(users.filter(u => !group.members?.find(m => m.id === u.id)));
    }
  };

  const handleInvite = async (userId) => {
    const res = await api(`/api/groups/${group.id}/invite`, { method: 'POST', body: JSON.stringify({ userId }) });
    if (res.ok) { setInviteSearch(''); setInviteResults([]); loadGroup(); }
  };

  const handleKick = async (userId) => {
    if (!confirm('Исключить участника?')) return;
    await api(`/api/groups/${group.id}/kick/${userId}`, { method: 'POST' });
    loadGroup();
  };

  const handleLeave = async () => {
    if (!confirm('Покинуть группу?')) return;
    await api(`/api/groups/${group.id}/leave`, { method: 'POST' });
    onLeave(group.id);
  };

  const handleDelete = async () => {
    if (!confirm(`Удалить группу "${group.name}"? Это действие необратимо.`)) return;
    await api(`/api/groups/${group.id}`, { method: 'DELETE' });
    onLeave(group.id);
  };

  const msgTime = (str) => new Date(str + 'Z').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="grp-chat">
      {/* Header */}
      <div className="grp-chat-header">
        <button className="msg-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <Avatar src={group.avatar} name={group.name} accent={accent} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="msg-chat-name" style={{ color: accent }}>{group.name}</span>
            {group.type === 'private' ? <Lock size={12} style={{ color: '#666' }} /> : <Globe size={12} style={{ color: '#666' }} />}
          </div>
          <span className="msg-chat-username">{group.member_count} участников</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`grp-tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')} title="Чат"><Send size={15} /></button>
          <button className={`grp-tab-btn ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')} title="Участники"><Users size={15} /></button>
          {isAdmin && <button className={`grp-tab-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')} title="Настройки"><Settings size={15} /></button>}
          {!isAdmin && <button className="grp-tab-btn" onClick={() => setShowReport(true)} title="Пожаловаться"><Flag size={15} /></button>}
        </div>
      </div>

      {/* Chat tab */}
      {tab === 'chat' && (
        <>
          <div className="msg-messages">
            {messages.map((m, i) => {
              const isMine = m.sender_id === user.id;
              const showName = !isMine && (i === 0 || messages[i-1]?.sender_id !== m.sender_id);
              return (
                <div key={m.id} className={`msg-row ${isMine ? 'msg-row-mine' : 'msg-row-theirs'}`}>
                  {!isMine && <div style={{ width: 28, flexShrink: 0 }}>{showName && <Avatar src={m.avatar} name={m.display_name || m.username} accent={m.accent_color} size={28} />}</div>}
                  <div>
                    {showName && !isMine && <div style={{ fontSize: 11, color: m.accent_color || '#888', marginBottom: 2, marginLeft: 4 }}>{m.display_name || m.username}</div>}
                    <div className={`msg-bubble ${isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs'}`} style={isMine && !m.media ? { background: accent, color: '#000' } : {}}>
                      {m.media && m.media_type === 'image' && <img src={m.media} alt="img" className="msg-media-img" />}
                      {m.media && m.media_type === 'video' && <video src={m.media} controls className="msg-media-video" />}
                      {m.content && <span className="msg-bubble-text">{m.content}</span>}
                      <span className="msg-bubble-time" style={isMine && !m.media ? { color: 'rgba(0,0,0,0.45)' } : {}}>{msgTime(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {mediaPreview && (
            <div className="msg-media-preview">
              {mediaPreview.type === 'image' ? <img src={mediaPreview.src} alt="preview" /> : <video src={mediaPreview.src} />}
              <button className="msg-media-remove" onClick={() => setMediaPreview(null)}><X size={14} /></button>
            </div>
          )}

          <div className="msg-input-area">
            {showPicker && (
              <div className="msg-picker-wrap" ref={pickerRef}>
                <EmojiPicker accent={accent} onEmoji={e => setText(t => t + e)} onSticker={async e => { await api(`/api/groups/${group.id}/messages`, { method: 'POST', body: JSON.stringify({ content: e, media_type: 'sticker' }) }); setShowPicker(false); }} onGif={async g => { await api(`/api/groups/${group.id}/messages`, { method: 'POST', body: JSON.stringify({ media: g.url, media_type: 'gif' }) }); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
              </div>
            )}
            <div className="msg-input-row">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleMediaPick(e, 'image')} />
              <input ref={videoRef} type="file" accept="video/*" hidden onChange={e => handleMediaPick(e, 'video')} />
              <button className="msg-media-btn" onClick={() => fileRef.current.click()}><Image size={17} /></button>
              <button className="msg-media-btn" onClick={() => videoRef.current.click()}><Video size={17} /></button>
              <input className="msg-input" placeholder="Написать сообщение..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} maxLength={2000} />
              <button className={`msg-media-btn ${showPicker ? 'active' : ''}`} onClick={() => setShowPicker(v => !v)}><Smile size={17} /></button>
              <button className="msg-send-btn" onClick={sendMessage} disabled={(!text.trim() && !mediaPreview) || sending} style={(text.trim() || mediaPreview) ? { background: accent, color: '#000' } : {}}><Send size={16} /></button>
            </div>
          </div>
        </>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="grp-members">
          {isAdmin && (
            <div className="grp-invite-wrap">
              <div className="msg-search-wrap">
                <Search size={14} className="msg-search-icon" />
                <input className="msg-search-input" placeholder="Пригласить пользователя..." value={inviteSearch} onChange={e => handleInviteSearch(e.target.value)} />
              </div>
              {inviteResults.length > 0 && (
                <div className="grp-invite-results">
                  {inviteResults.map(u => (
                    <div key={u.id} className="grp-invite-row">
                      <Avatar src={u.avatar} name={u.display_name || u.username} accent={u.accent_color} size={32} />
                      <span style={{ flex: 1, color: u.accent_color || '#fff' }}>{u.display_name || u.username}</span>
                      <button className="grp-invite-btn" onClick={() => handleInvite(u.id)} style={{ borderColor: accent, color: accent }}>
                        <UserPlus size={13} /> Пригласить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="grp-member-list">
            {(group.members || []).map(m => (
              <div key={m.id} className="grp-member-row">
                <Avatar src={m.avatar} name={m.display_name || m.username} accent={m.accent_color} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: m.accent_color || '#fff', fontSize: 14 }}>{m.display_name || m.username}</div>
                  <div style={{ color: '#555', fontSize: 12 }}>@{m.username}</div>
                </div>
                <span className={`grp-role-badge grp-role-${m.role}`}>
                  {m.role === 'owner' ? <><Crown size={11} /> Владелец</> : m.role === 'admin' ? <><Shield size={11} /> Админ</> : 'Участник'}
                </span>
                {isAdmin && m.id !== user.id && m.role !== 'owner' && (
                  <button className="adm-action-btn adm-action-delete" onClick={() => handleKick(m.id)} title="Исключить"><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: '1rem', borderTop: '1px solid #1a1a1a' }}>
            {!isOwner && <button className="sif-submit sif-submit--danger" style={{ width: '100%' }} onClick={handleLeave}><LogOut size={14} /> Покинуть группу</button>}
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && isAdmin && (
        <GroupSettings group={group} user={user} onUpdate={g => setGroup(g)} onDelete={handleDelete} />
      )}

      {showReport && (
        <ReportModal targetType="group" targetId={group.id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

function GroupSettings({ group, user, onUpdate, onDelete }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);
  const fileRef = useRef();

  const handleSave = async () => {
    setSaving(true);
    const res = await api(`/api/groups/${group.id}`, { method: 'PUT', body: JSON.stringify({ name, description }) });
    if (res.ok) { onUpdate(await res.json()); setFlash('Сохранено'); setTimeout(() => setFlash(null), 2000); }
    setSaving(false);
  };

  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {flash && <div className="adm-flash adm-flash-ok"><Check size={14} /> {flash}</div>}
      <div className="sif-field"><label>Название</label><input value={name} onChange={e => setName(e.target.value)} maxLength={50} /></div>
      <div className="sif-field"><label>Описание</label><input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} /></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="sif-cancel" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>{saving ? '...' : 'Сохранить'}</button>
      </div>
      {group.owner_id === user.id && (
        <button className="sif-submit sif-submit--danger" style={{ width: '100%', marginTop: 8 }} onClick={onDelete}>
          <Trash2 size={14} /> Удалить группу
        </button>
      )}
    </div>
  );
}

export default function Groups({ user }) {
  const [myGroups, setMyGroups] = useState([]);
  const [publicGroups, setPublicGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [tab, setTab] = useState('my'); // my | public
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [invites, setInvites] = useState([]);
  const accent = user.accent_color || '#fff';

  const load = useCallback(async () => {
    const res = await api('/api/groups');
    if (res.ok) { const d = await res.json(); setMyGroups(d.myGroups); setPublicGroups(d.publicGroups); }
    const ir = await api('/api/groups/invites/my');
    if (ir.ok) setInvites(await ir.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onMsg = (e) => {
      const { groupId } = e.detail;
      setMyGroups(prev => prev.map(g => g.id === groupId ? { ...g, _lastMsg: Date.now() } : g));
    };
    const onInvite = () => load();
    const onKicked = (e) => { setMyGroups(prev => prev.filter(g => g.id !== e.detail.groupId)); if (activeGroup?.id === e.detail.groupId) setActiveGroup(null); };
    const onDeleted = (e) => { setMyGroups(prev => prev.filter(g => g.id !== e.detail.groupId)); if (activeGroup?.id === e.detail.groupId) setActiveGroup(null); };
    const onNewPublic = (e) => { setPublicGroups(prev => prev.find(g => g.id === e.detail.id) ? prev : [e.detail, ...prev]); };
    window.addEventListener('ws_group_message', onMsg);
    window.addEventListener('ws_group_invite', onInvite);
    window.addEventListener('ws_group_kicked', onKicked);
    window.addEventListener('ws_group_deleted', onDeleted);
    window.addEventListener('ws_new_public_group', onNewPublic);
    return () => {
      window.removeEventListener('ws_group_message', onMsg);
      window.removeEventListener('ws_group_invite', onInvite);
      window.removeEventListener('ws_group_kicked', onKicked);
      window.removeEventListener('ws_group_deleted', onDeleted);
      window.removeEventListener('ws_new_public_group', onNewPublic);
    };
  }, [activeGroup, load]);

  const handleSearch = async (q) => {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const res = await api(`/api/groups/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setSearchResults(await res.json());
  };

  const handleJoin = async (groupId) => {
    const res = await api(`/api/groups/${groupId}/join`, { method: 'POST' });
    if (res.ok) { load(); openGroup(groupId); }
  };

  const openGroup = async (groupId) => {
    const res = await api(`/api/groups/${groupId}`);
    if (res.ok) setActiveGroup(await res.json());
  };

  const handleAcceptInvite = async (inviteId, groupId) => {
    await api(`/api/groups/invites/${inviteId}/accept`, { method: 'POST' });
    load();
    openGroup(groupId);
  };

  const handleDeclineInvite = async (inviteId) => {
    await api(`/api/groups/invites/${inviteId}/decline`, { method: 'POST' });
    setInvites(prev => prev.filter(i => i.id !== inviteId));
  };

  const handleLeave = (groupId) => {
    setMyGroups(prev => prev.filter(g => g.id !== groupId));
    setActiveGroup(null);
    load();
  };

  if (activeGroup) return <GroupChat group={activeGroup} user={user} onBack={() => setActiveGroup(null)} onLeave={handleLeave} />;

  const displayGroups = search ? searchResults : (tab === 'my' ? myGroups : publicGroups);

  return (
    <div className="groups-page">
      <div className="groups-sidebar">
        <div className="msg-sidebar-header">
          <span>Группы</span>
          <button className="grp-create-btn" onClick={() => setShowCreate(true)} style={{ color: accent }} title="Создать группу"><Plus size={18} /></button>
        </div>

        {/* Invites */}
        {invites.length > 0 && (
          <div className="grp-invites-section">
            <div className="grp-section-label">Приглашения ({invites.length})</div>
            {invites.map(inv => (
              <div key={inv.id} className="grp-invite-card">
                <Avatar src={inv.group_avatar} name={inv.group_name} accent={accent} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#fff' }}>{inv.group_name}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>от @{inv.inviter_username}</div>
                </div>
                <button className="grp-invite-btn" onClick={() => handleAcceptInvite(inv.id, inv.group_id)} style={{ borderColor: '#69db7c', color: '#69db7c' }}><Check size={13} /></button>
                <button className="grp-invite-btn" onClick={() => handleDeclineInvite(inv.id)} style={{ borderColor: '#ff6b6b', color: '#ff6b6b' }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="msg-search-wrap">
          <Search size={14} className="msg-search-icon" />
          <input className="msg-search-input" placeholder="Поиск групп..." value={search} onChange={e => handleSearch(e.target.value)} />
          {search && <button className="msg-search-clear" onClick={() => { setSearch(''); setSearchResults([]); }}><X size={12} /></button>}
        </div>

        {!search && (
          <div className="grp-tabs">
            <button className={`grp-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')} style={tab === 'my' ? { color: accent, borderColor: accent } : {}}>Мои</button>
            <button className={`grp-tab ${tab === 'public' ? 'active' : ''}`} onClick={() => setTab('public')} style={tab === 'public' ? { color: accent, borderColor: accent } : {}}>Публичные</button>
          </div>
        )}

        <div className="grp-list">
          {displayGroups.length === 0 && (
            <div className="msg-empty-convos">
              <Users size={28} />
              <p>{tab === 'my' ? 'Нет групп' : 'Нет публичных групп'}</p>
              <span>{tab === 'my' ? 'Создайте или вступите в группу' : 'Попробуйте другой запрос'}</span>
            </div>
          )}
          {displayGroups.map(g => (
            <button key={g.id} className="msg-convo" onClick={() => g.is_member || g.role ? openGroup(g.id) : handleJoin(g.id)}>
              <Avatar src={g.avatar} name={g.name} accent={accent} size={40} />
              <div className="msg-convo-info">
                <div className="msg-convo-top">
                  <span className="msg-convo-name" style={{ color: accent }}>
                    {g.type === 'private' ? <Lock size={11} style={{ marginRight: 4 }} /> : null}
                    {g.name}
                  </span>
                  <span className="msg-convo-time">{g.member_count} уч.</span>
                </div>
                <div className="msg-convo-bottom">
                  <span className="msg-convo-preview">{g.description || (g.type === 'public' ? 'Публичная группа' : 'Приватная группа')}</span>
                  {!g.is_member && !g.role && g.type === 'public' && <span className="grp-join-hint" style={{ color: accent }}>Вступить</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="msg-chat">
        <div className="msg-chat-empty">
          <Users size={40} />
          <p>Выберите группу</p>
          <span>или создайте новую</span>
        </div>
      </div>

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreated={g => { setMyGroups(prev => [g, ...prev]); setShowCreate(false); openGroup(g.id); }} user={user} />}
    </div>
  );
}
