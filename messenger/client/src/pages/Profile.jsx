import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  User, Camera, ImagePlus, FileText, Palette, Check,
  Pencil, X, Save, AtSign, Calendar, Shield, LogOut, Rss,
  Users, MessageSquare, FileImage, Loader, ShieldAlert,
} from 'lucide-react';
import ImageCropper from '../components/ImageCropper';
import ChangelogModal from '../components/ChangelogModal';
import CallManager from '../components/CallManager';
import PostCard from '../components/PostCard';
import Admin from './Admin';
import Settings from './Settings';
import Feed from './Feed';
import Friends from './Friends';
import Messages from './Messages';

const ACCENT_COLORS = [
  '#ffffff', '#a8a8a8', '#ff6b6b', '#ffa94d',
  '#ffd43b', '#69db7c', '#4dabf7', '#da77f2',
  '#f783ac', '#63e6be', '#74c0fc', '#e599f7'
];

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Profile({ user, onUpdate, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('profile');
  const [profileTab, setProfileTab] = useState('info'); // 'info' | 'posts'
  const [chatTarget, setChatTarget] = useState(null);

  // Stats
  const [stats, setStats] = useState({ followers: 0, following: 0, postsCount: 0 });

  // My posts
  const [myPosts, setMyPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);

  const loadStats = useCallback(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/users/${user.username}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setStats({ followers: data.followers, following: data.following, postsCount: data.postsCount });
    }
  }, [user.username]);

  const loadMyPosts = useCallback(async () => {
    if (postsLoaded) return;
    setPostsLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/users/${user.username}/posts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(data.posts || []);
      setPostsLoaded(true);
    }
    setPostsLoading(false);
  }, [user.username, postsLoaded]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (profileTab === 'posts') loadMyPosts();
  }, [profileTab, loadMyPosts]);

  const handleLike = async (postId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: data.likes, liked: data.liked } : p));
    }
  };

  const handleDelete = async (postId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/${postId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMyPosts(prev => prev.filter(p => p.id !== postId));
      setStats(s => ({ ...s, postsCount: Math.max(0, s.postsCount - 1) }));
    }
  };

  const handleVote = async (postId, optionId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ optionId }),
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: data } : p));
    }
  };
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    bio: user.bio || '',
    avatar: user.avatar || null,
    banner: user.banner || null,
    accent_color: user.accent_color || '#ffffff',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const avatarRef = useRef();
  const bannerRef = useRef();

  // Cropper state
  const [cropSrc, setCropSrc] = useState(null);
  const [cropType, setCropType] = useState(null); // 'avatar' | 'banner'

  const accent = editing ? form.accent_color : (user.accent_color || '#ffffff');

  const handleAvatar = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('avatar'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBanner = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('banner'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropDone = (result) => {
    if (cropType === 'avatar') setForm(f => ({ ...f, avatar: result }));
    if (cropType === 'banner') setForm(f => ({ ...f, banner: result }));
    setCropSrc(null);
    setCropType(null);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
    setCropType(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate(data);
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      display_name: user.display_name || '',
      bio: user.bio || '',
      avatar: user.avatar || null,
      banner: user.banner || null,
      accent_color: user.accent_color || '#ffffff',
    });
    setEditing(false);
  };

  const displayAvatar = editing ? form.avatar : user.avatar;
  const displayBanner = editing ? form.banner : user.banner;
  const displayName = user.display_name || user.username;

  return (
    <div className="profile-page">
      {/* Sidebar */}
      <aside className="profile-sidebar">
        <div className="sidebar-logo" onClick={() => setShowChangelog(true)} style={{ cursor: 'pointer' }}>
          <div className="sidebar-logo-icon" style={{ borderColor: accent }}>
            {user.avatar ? <img src={user.avatar} alt="avatar" /> : <User size={18} />}
          </div>
          <span>RLC</span>
        </div>

        <nav className="sidebar-nav">
          <button className={`sidebar-item ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')} style={tab === 'profile' ? { color: accent } : {}}>
            <User size={17} /> Профиль
          </button>
          <button className={`sidebar-item ${tab === 'feed' ? 'active' : ''}`}
            onClick={() => setTab('feed')} style={tab === 'feed' ? { color: accent } : {}}>
            <Rss size={17} /> Лента
          </button>
          <button className={`sidebar-item ${tab === 'friends' ? 'active' : ''}`}
            onClick={() => setTab('friends')} style={tab === 'friends' ? { color: accent } : {}}>
            <Users size={17} /> Друзья
          </button>
          <button className={`sidebar-item ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => setTab('messages')} style={tab === 'messages' ? { color: accent } : {}}>
            <MessageSquare size={17} /> Сообщения
          </button>
          <button className={`sidebar-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')} style={tab === 'settings' ? { color: accent } : {}}>
            <Shield size={17} /> Настройки
          </button>
          {user.email === 'yamekel0@gmail.com' && (
            <button className={`sidebar-item ${tab === 'admin' ? 'active' : ''}`}
              onClick={() => setTab('admin')} style={tab === 'admin' ? { color: '#ff6b6b' } : { color: '#ff6b6b', opacity: 0.6 }}>
              <ShieldAlert size={17} /> Админ-панель
            </button>
          )}
        </nav>

        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={15} /> Выйти
        </button>
      </aside>

      {/* Main */}
      <main className="profile-main">

        {tab === 'profile' && (
          <div className="profile-content">

            {/* Hero: banner + avatar */}
            <div className="profile-hero">
              <div className="profile-banner"
                style={{ backgroundImage: displayBanner ? `url(${displayBanner})` : undefined }}>
                {!displayBanner && <div className="banner-empty" />}
                {editing && (
                  <button className="banner-edit-btn" onClick={() => bannerRef.current.click()}>
                    <ImagePlus size={15} /> Изменить баннер
                  </button>
                )}
                <input ref={bannerRef} type="file" accept="image/*" hidden onChange={handleBanner} />
              </div>

              <div className="profile-avatar-row">
                <div className="profile-avatar"
                  style={{ borderColor: accent, backgroundImage: displayAvatar ? `url(${displayAvatar})` : undefined }}
                  onClick={editing ? () => avatarRef.current.click() : undefined}>
                  {!displayAvatar && <User size={36} />}
                  {editing && <div className="avatar-edit-overlay"><Camera size={18} /></div>}
                </div>
                <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatar} />

                <div className="profile-title-row">
                  <div>
                    <h1 className="profile-name" style={{ color: accent }}>{displayName}</h1>
                    <p className="profile-username">@{user.username}</p>
                  </div>
                  {!editing
                    ? <button className="btn-edit-profile" onClick={() => setEditing(true)}>
                        <Pencil size={14} /> Редактировать
                      </button>
                    : <div className="edit-actions">
                        <button className="btn-cancel-edit" onClick={handleCancel}><X size={15} /></button>
                        <button className="btn-save-edit" onClick={handleSave} disabled={saving}
                          style={{ borderColor: accent, color: accent }}>
                          {saving ? '...' : <><Save size={14} /> Сохранить</>}
                        </button>
                      </div>
                  }
                </div>
              </div>

              {/* Stats bar */}
              {!editing && (
                <div className="profile-stats-bar">
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.postsCount}</span>
                    <span className="profile-stat-label">постов</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.followers}</span>
                    <span className="profile-stat-label">подписчиков</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.following}</span>
                    <span className="profile-stat-label">подписок</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sub-tabs: Информация / Посты */}
            {!editing && (
              <div className="profile-subtabs">
                <button
                  className={`profile-subtab ${profileTab === 'info' ? 'active' : ''}`}
                  onClick={() => setProfileTab('info')}
                  style={profileTab === 'info' ? { color: accent, borderColor: accent } : {}}
                >
                  <User size={14} /> Информация
                </button>
                <button
                  className={`profile-subtab ${profileTab === 'posts' ? 'active' : ''}`}
                  onClick={() => setProfileTab('posts')}
                  style={profileTab === 'posts' ? { color: accent, borderColor: accent } : {}}
                >
                  <FileImage size={14} /> Мои посты
                  {stats.postsCount > 0 && (
                    <span className="profile-subtab-count">{stats.postsCount}</span>
                  )}
                </button>
              </div>
            )}

            {/* Info grid */}
            {(editing || profileTab === 'info') && (
            <div className="profile-grid">

              {/* Bio — full width */}
              <div className="profile-card pcard-full">
                <div className="pcard-header">
                  <span className="section-label"><FileText size={13} /> О себе</span>
                </div>
                {editing
                  ? <div className="setup-field" style={{ marginBottom: 0 }}>
                      <textarea value={form.bio}
                        onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                        placeholder="Расскажите о себе..." maxLength={160} rows={3} />
                      <span className="char-count">{form.bio.length}/160</span>
                    </div>
                  : <p className="profile-bio-text">{user.bio || <span className="empty-field">Не указано</span>}</p>
                }
              </div>

              {/* Display name */}
              <div className="profile-card">
                <div className="pcard-header">
                  <span className="section-label"><User size={13} /> Отображаемое имя</span>
                </div>
                {editing
                  ? <div className="setup-field" style={{ marginBottom: 0 }}>
                      <input type="text" value={form.display_name}
                        onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                        placeholder="Как вас называть?" maxLength={32} />
                    </div>
                  : <p className="profile-field-value">{user.display_name || <span className="empty-field">Не указано</span>}</p>
                }
              </div>

              {/* Username */}
              <div className="profile-card">
                <div className="pcard-header">
                  <span className="section-label"><AtSign size={13} /> Имя пользователя</span>
                </div>
                <p className="profile-field-value">@{user.username}</p>
              </div>

              {/* Email */}
              <div className="profile-card">
                <div className="pcard-header">
                  <span className="section-label"><Shield size={13} /> Email</span>
                </div>
                <p className="profile-field-value">{user.email}</p>
              </div>

              {/* Joined */}
              <div className="profile-card">
                <div className="pcard-header">
                  <span className="section-label"><Calendar size={13} /> Дата регистрации</span>
                </div>
                <p className="profile-field-value">{formatDate(user.created_at)}</p>
              </div>

              {/* Accent color — full width, only in edit mode */}
              {editing && (
                <div className="profile-card pcard-full">
                  <div className="pcard-header">
                    <span className="section-label"><Palette size={13} /> Цвет акцента</span>
                  </div>
                  <div className="color-grid">
                    {ACCENT_COLORS.map(c => (
                      <button key={c}
                        className={`color-swatch ${form.accent_color === c ? 'selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setForm(f => ({ ...f, accent_color: c }))}>
                        {form.accent_color === c && <Check size={13} color="#000" />}
                      </button>
                    ))}
                  </div>
                  <div className="custom-color-row" style={{ marginTop: '0.8rem' }}>
                    <input type="color" value={form.accent_color}
                      onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                      className="color-picker" />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#666' }}>
                      {form.accent_color}
                    </span>
                  </div>
                </div>
              )}

              {/* Accent color display — not editing */}
              {!editing && (
                <div className="profile-card">
                  <div className="pcard-header">
                    <span className="section-label"><Palette size={13} /> Цвет акцента</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: accent, border: '1px solid #2a2a2a', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#888' }}>{accent}</span>
                  </div>
                </div>
              )}

            </div>
            )}

            {/* My posts tab */}
            {!editing && profileTab === 'posts' && (
              <div className="my-posts-list">
                {postsLoading && (
                  <div className="my-posts-loading">
                    <Loader size={18} className="spin" /> Загрузка...
                  </div>
                )}
                {!postsLoading && myPosts.length === 0 && (
                  <div className="my-posts-empty">
                    <FileImage size={32} />
                    <p>Вы ещё ничего не публиковали</p>
                    <span>Перейдите в Ленту чтобы создать пост</span>
                  </div>
                )}
                {myPosts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={user.id}
                    onLike={handleLike}
                    onDelete={handleDelete}
                    onVote={handleVote}
                  />
                ))}
              </div>
            )}

            {saved && <div className="save-toast"><Check size={14} /> Профиль сохранён</div>}
          </div>
        )}

        {tab === 'feed' && (
          <div className="profile-content" style={{ maxWidth: 680 }}>
            <Feed user={user} />
          </div>
        )}

        {tab === 'friends' && (
          <div className="profile-content">
            <Friends user={user} onOpenChat={(targetUser) => {
              setChatTarget(targetUser);
              setTab('messages');
            }} />
          </div>
        )}

        {tab === 'messages' && (
          <div className="profile-content profile-content--full">
            <Messages
              user={user}
              initialChat={chatTarget}
              onClearInitial={() => setChatTarget(null)}
            />
          </div>
        )}

        {tab === 'settings' && (
          <div className="profile-content">
            <Settings user={user} onUpdate={onUpdate} onLogout={onLogout} />
          </div>
        )}

        {tab === 'admin' && user.email === 'yamekel0@gmail.com' && (
          <div className="profile-content profile-content--full" style={{ padding: 0 }}>
            <Admin user={user} onBack={() => setTab('profile')} />
          </div>
        )}
      </main>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={cropType === 'avatar' ? 1 : 16 / 5}
          title={cropType === 'avatar' ? 'Обрезать аватарку' : 'Обрезать баннер'}
          onDone={handleCropDone}
          onCancel={handleCropCancel}
        />
      )}

      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}

      {/* Global call manager — always mounted so it can receive incoming calls */}
      <CallManager currentUser={user} />
    </div>
  );
}
