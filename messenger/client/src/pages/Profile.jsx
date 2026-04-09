import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  User, Camera, ImagePlus, FileText, Palette, Check,
  Pencil, X, Save, AtSign, Calendar, Shield, LogOut, Rss,
  Users, MessageSquare, FileImage, Loader, ShieldAlert, UsersRound,
  Sparkles, Music, Upload, Bookmark,
} from 'lucide-react';
import ImageCropper from '../components/ImageCropper';
import ChangelogModal from '../components/ChangelogModal';
import CallManager from '../components/CallManager';
import NotificationBell from '../components/NotificationPanel';
import PostCard from '../components/PostCard';
import ProfileMusicPlayer from '../components/ProfileMusicPlayer';
import VerifiedBadge from '../components/VerifiedBadge';
import UserProfile from './UserProfile';
import { validateFileSize } from '../utils/imageCompressor';
import Admin from './Admin';
import Settings from './Settings';
import Feed from './Feed';
import Friends from './Friends';
import Messages from './Messages';
import Groups from './Groups';
import Channels from './Channels';
import Bookmarks from './Bookmarks';

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
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive initial tab from URL path
  const TAB_ROUTES = ['feed', 'friends', 'messages', 'groups', 'channels', 'bookmarks', 'settings', 'admin'];
  const pathTab = TAB_ROUTES.find(t => location.pathname === `/${t}`);

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(pathTab || 'profile');
  const [profileTab, setProfileTab] = useState('info');
  // Support opening chat from UserProfile page via navigation state
  const [chatTarget, setChatTarget] = useState(location.state?.chatTarget || null);

  // Sync tab → URL
  const switchTab = useCallback((newTab) => {
    setTab(newTab);
    if (newTab === 'profile') {
      navigate('/profile', { replace: true });
    } else {
      navigate(`/${newTab}`, { replace: true });
    }
  }, [navigate]);

  // Unread counters for sidebar badges
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadGroups, setUnreadGroups] = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);

  // Load unread counts on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/messages/unread-count', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setUnreadMessages(d.count || 0)).catch(() => {});
    fetch('/api/friends/requests', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setPendingFriends(Array.isArray(d) ? d.length : 0)).catch(() => {});
  }, []);

  // Real-time unread updates
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e.detail;
      if (msg.sender_id !== user.id && tab !== 'messages') {
        setUnreadMessages(n => n + 1);
      }
    };
    const onGroupMsg = (e) => {
      if (tab !== 'groups') setUnreadGroups(n => n + 1);
    };
    const onFriendReq = () => setPendingFriends(n => n + 1);
    const onFriendAcc = () => setPendingFriends(n => Math.max(0, n - 1));
    window.addEventListener('ws_new_message', onMsg);
    window.addEventListener('ws_group_message', onGroupMsg);
    window.addEventListener('ws_friend_request', onFriendReq);
    window.addEventListener('ws_friend_accepted', onFriendAcc);
    return () => {
      window.removeEventListener('ws_new_message', onMsg);
      window.removeEventListener('ws_group_message', onGroupMsg);
      window.removeEventListener('ws_friend_request', onFriendReq);
      window.removeEventListener('ws_friend_accepted', onFriendAcc);
    };
  }, [user.id, tab]);

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

  // Real-time stats update
  useEffect(() => {
    const onFollow = () => loadStats();
    window.addEventListener('ws_notification', onFollow);
    return () => window.removeEventListener('ws_notification', onFollow);
  }, [loadStats]);

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
    const res = await fetch(`/api/feed/poll/${optionId}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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
  const musicRef = useRef();

  // VIP state
  const [hasVIP, setHasVIP] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vipForm, setVipForm] = useState({ animated_name: user.animated_name || '', profile_music: user.profile_music || null });
  const [vipSaving, setVipSaving] = useState(false);
  const [vipMsg, setVipMsg] = useState(null);
  const [showVipPanel, setShowVipPanel] = useState(false);

  // Gradient builder state
  const [gradColors, setGradColors] = useState(() => {
    // Parse existing gradient or defaults
    if (user.animated_name) {
      const matches = user.animated_name.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
      if (matches && matches.length >= 2) return matches.slice(0, 3);
    }
    return ['#ff0080', '#7928ca', '#ff0080'];
  });
  const [gradAngle, setGradAngle] = useState(() => {
    if (user.animated_name) {
      const m = user.animated_name.match(/(\d+)deg/);
      if (m) return parseInt(m[1]);
    }
    return 90;
  });
  const [gradEnabled, setGradEnabled] = useState(!!user.animated_name);

  // Cropper state
  const [cropSrc, setCropSrc] = useState(null);
  const [cropType, setCropType] = useState(null); // 'avatar' | 'banner'

  const accent = editing ? form.accent_color : (user.accent_color || '#ffffff');

  // Load VIP permissions + verified status from server
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/roles/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d || d.error) return;
        setHasVIP(d.permissions?.includes('animated_name') || d.permissions?.includes('profile_music'));
        const adminRoles = ['admin', 'owner'];
        const hasAdminRole = Array.isArray(d.roles) && d.roles.some(r => adminRoles.includes(r));
        setIsAdmin(hasAdminRole);
      })
      .catch(() => {});

    // Reload verified + animated_name from server (not stored in localStorage)
    fetch('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) onUpdate({ ...user, verified: data.verified, animated_name: data.animated_name, profile_music: data.profile_music });
      })
      .catch(() => {});
  }, []);

  // Sync gradient builder → vipForm
  useEffect(() => {
    if (!gradEnabled) {
      setVipForm(f => ({ ...f, animated_name: '' }));
      return;
    }
    const grad = `linear-gradient(${gradAngle}deg, ${gradColors.join(', ')})`;
    setVipForm(f => ({ ...f, animated_name: grad }));
  }, [gradColors, gradAngle, gradEnabled]);

  const handleAvatar = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateFileSize(file)) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('avatar'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBanner = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateFileSize(file)) {
      e.target.value = '';
      return;
    }
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

  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setVipMsg({ ok: false, text: 'Только аудио файлы (MP3, OGG, WAV)' });
      setTimeout(() => setVipMsg(null), 3000);
      return;
    }
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) {
      setVipMsg({ ok: false, text: 'Файл слишком большой. Максимум 15MB' });
      setTimeout(() => setVipMsg(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setVipForm(f => ({ ...f, profile_music: ev.target.result }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVipSave = async () => {
    setVipSaving(true);
    try {
      const token = localStorage.getItem('token');

      // Save gradient (small, always send)
      const gradRes = await fetch('/api/profile/vip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ animated_name: vipForm.animated_name }),
      });
      const gradData = await gradRes.json();
      if (!gradRes.ok) {
        setVipMsg({ ok: false, text: gradData.error || 'Ошибка сохранения градиента' });
        setVipSaving(false);
        setTimeout(() => setVipMsg(null), 3500);
        return;
      }

      // Save music separately only if a new file was selected
      let musicSaved = false;
      if (vipForm.profile_music && vipForm.profile_music.startsWith('data:')) {
        const musicRes = await fetch('/api/profile/vip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profile_music: vipForm.profile_music }),
        });
        const musicData = await musicRes.json();
        if (!musicRes.ok) {
          setVipMsg({ ok: false, text: musicData.error || 'Ошибка сохранения музыки' });
          setVipSaving(false);
          setTimeout(() => setVipMsg(null), 3500);
          return;
        }
        musicSaved = true;
      } else if (vipForm.profile_music === '') {
        // Explicitly remove music
        await fetch('/api/profile/vip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profile_music: null }),
        });
      }

      setVipMsg({ ok: true, text: 'VIP настройки сохранены' });
      setShowVipPanel(false);
      onUpdate({
        ...user,
        animated_name: gradData.animated_name,
        profile_music: musicSaved ? vipForm.profile_music : (vipForm.profile_music === '' ? null : user.profile_music),
      });
    } catch (e) {
      setVipMsg({ ok: false, text: 'Ошибка сети: ' + (e.message || 'неизвестная ошибка') });
    } finally {
      setVipSaving(false);
      setTimeout(() => setVipMsg(null), 4000);
    }
  };

  const displayAvatar = editing ? form.avatar : user.avatar;
  const displayBanner = editing ? form.banner : user.banner;
  const displayName = user.display_name || user.username;

  // Viewing another user's profile — render inside full layout
  if (username && username !== user.username) {
    return (
      <div className="profile-page">
        <aside className="profile-sidebar">
          <div className="sidebar-logo" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
            <div className="sidebar-logo-icon" style={{ borderColor: user.accent_color || '#fff' }}>
              {user.avatar ? <img src={user.avatar} alt="avatar" /> : <User size={18} />}
            </div>
            <span>RLC</span>
          </div>
          <nav className="sidebar-nav">
            <button className="sidebar-item" onClick={() => navigate('/profile')} style={{ color: user.accent_color || '#fff' }}>
              <User size={17} /> Профиль
            </button>
            <button className="sidebar-item" onClick={() => navigate('/feed')}>
              <Rss size={17} /> Лента
            </button>
            <button className="sidebar-item" onClick={() => navigate('/friends')}>
              <Users size={17} /> Друзья
            </button>
            <button className="sidebar-item" onClick={() => navigate('/messages')}>
              <MessageSquare size={17} /> Сообщения
            </button>
            <button className="sidebar-item" onClick={() => navigate('/groups')}>
              <UsersRound size={17} /> Группы
            </button>
            <button className="sidebar-item" onClick={() => navigate('/settings')}>
              <Shield size={17} /> Настройки
            </button>
          </nav>
          <div className="sidebar-footer">
            <a href="/status" className="sidebar-footer-link">Статус серверов</a>
            <a href="/terms" className="sidebar-footer-link">Условия использования</a>
            <a href="/privacy" className="sidebar-footer-link">Конфиденциальность</a>
            <a href="/cookies" className="sidebar-footer-link">Политика Cookies</a>
            <span className="sidebar-footer-copy">© 2026 RLC</span>
          </div>
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={15} /> Выйти
          </button>
        </aside>
        <main className="profile-main">
          <UserProfile
            username={username}
            currentUser={user}
            onBack={() => navigate(-1)}
            onOpenChat={(targetUser) => {
              navigate('/messages', { state: { chatTarget: targetUser } });
            }}
          />
        </main>
        <CallManager currentUser={user} />
      </div>
    );
  }

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
            onClick={() => switchTab('profile')} style={tab === 'profile' ? { color: accent } : {}}>
            <User size={17} /> Профиль
          </button>
          <button className={`sidebar-item ${tab === 'feed' ? 'active' : ''}`}
            onClick={() => switchTab('feed')} style={tab === 'feed' ? { color: accent } : {}}>
            <Rss size={17} /> Лента
          </button>
          <button className={`sidebar-item ${tab === 'friends' ? 'active' : ''}`}
            onClick={() => { switchTab('friends'); setPendingFriends(0); }} style={tab === 'friends' ? { color: accent } : {}}>
            <Users size={17} /> Друзья
            {pendingFriends > 0 && <span className="sidebar-badge">{pendingFriends}</span>}
          </button>
          <button className={`sidebar-item ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => { switchTab('messages'); setUnreadMessages(0); }} style={tab === 'messages' ? { color: accent } : {}}>
            <MessageSquare size={17} /> Сообщения
            {unreadMessages > 0 && <span className="sidebar-badge">{unreadMessages}</span>}
          </button>
          <button className={`sidebar-item ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => { switchTab('groups'); setUnreadGroups(0); }} style={tab === 'groups' ? { color: accent } : {}}>
            <UsersRound size={17} /> Группы
            {unreadGroups > 0 && <span className="sidebar-badge">{unreadGroups}</span>}
          </button>
          <button className={`sidebar-item ${tab === 'channels' ? 'active' : ''}`}
            onClick={() => switchTab('channels')} style={tab === 'channels' ? { color: accent } : {}}>
            <Rss size={17} /> Каналы
          </button>
          <button className={`sidebar-item ${tab === 'bookmarks' ? 'active' : ''}`}
            onClick={() => switchTab('bookmarks')} style={tab === 'bookmarks' ? { color: accent } : {}}>
            <Bookmark size={17} /> Закладки
          </button>
          <button className={`sidebar-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => switchTab('settings')} style={tab === 'settings' ? { color: accent } : {}}>
            <Shield size={17} /> Настройки
          </button>
          {(user.email === 'yamekel0@gmail.com' || isAdmin) && (
            <button className={`sidebar-item ${tab === 'admin' ? 'active' : ''}`}
              onClick={() => switchTab('admin')} style={tab === 'admin' ? { color: '#ff6b6b' } : { color: '#ff6b6b', opacity: 0.6 }}>
              <ShieldAlert size={17} /> Админ-панель
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <a href="/status" className="sidebar-footer-link">Статус серверов</a>
          <a href="/terms" className="sidebar-footer-link">Условия использования</a>
          <a href="/privacy" className="sidebar-footer-link">Конфиденциальность</a>
          <a href="/cookies" className="sidebar-footer-link">Политика Cookies</a>
          <span className="sidebar-footer-copy">© 2026 RLC</span>
        </div>
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
                    <span className="verified-name-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <h1 
                        className={`profile-name${user.animated_name ? ' gradient-name' : ''}`}
                        style={user.animated_name 
                          ? { background: user.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
                          : { color: accent }
                        }
                      >
                        {displayName}
                      </h1>
                      {user.verified ? <VerifiedBadge size={20} /> : null}
                    </span>
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

              {/* VIP panel */}
              {!editing && hasVIP && (
                <div className="profile-card pcard-full">
                  <div className="pcard-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="section-label"><Sparkles size={13} style={{ color: '#ffd43b' }} /> VIP Оформление</span>
                    <button className="btn-edit-profile" onClick={() => setShowVipPanel(v => !v)} style={{ color: '#ffd43b', borderColor: '#ffd43b44' }}>
                      <Pencil size={13} /> {showVipPanel ? 'Скрыть' : 'Изменить'}
                    </button>
                  </div>

                  {vipMsg && (
                    <div style={{ padding: '0.5rem 0.75rem', borderRadius: 8, marginBottom: '0.75rem', fontSize: '0.85rem',
                      background: vipMsg.ok ? 'rgba(105,219,124,0.08)' : 'rgba(255,107,107,0.08)',
                      border: `1px solid ${vipMsg.ok ? 'rgba(105,219,124,0.2)' : 'rgba(255,107,107,0.2)'}`,
                      color: vipMsg.ok ? '#69db7c' : '#ff6b6b' }}>
                      {vipMsg.text}
                    </div>
                  )}

                  {!showVipPanel && (
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', color: '#555' }}>
                        Ник: {user.animated_name
                          ? <span style={{ background: user.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 600 }}>Градиент активен ✓</span>
                          : <span style={{ color: '#333' }}>Не задан</span>}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#555' }}>
                        Музыка: {user.profile_music ? <span style={{ color: '#69db7c' }}>Загружена ✓</span> : <span style={{ color: '#333' }}>Не загружена</span>}
                      </span>
                    </div>
                  )}

                  {showVipPanel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                      {/* ── Gradient builder ── */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#555', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Sparkles size={12} /> Градиент ника
                          </span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', color: gradEnabled ? '#ffd43b' : '#444' }}>
                            <span>{gradEnabled ? 'Включён' : 'Выключен'}</span>
                            <button type="button" onClick={() => setGradEnabled(v => !v)}
                              style={{ width: 36, height: 20, borderRadius: 10, background: gradEnabled ? '#ffd43b' : '#222', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                              <span style={{ position: 'absolute', top: 2, left: gradEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: gradEnabled ? '#000' : '#555', transition: 'left 0.2s' }} />
                            </button>
                          </label>
                        </div>

                        {gradEnabled && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              {gradColors.map((c, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                  <input type="color" value={c}
                                    onChange={e => setGradColors(prev => prev.map((col, idx) => idx === i ? e.target.value : col))}
                                    style={{ width: 44, height: 44, border: '2px solid #333', borderRadius: 10, cursor: 'pointer', padding: 2, background: '#0a0a0a' }} />
                                  <span style={{ fontSize: '0.65rem', color: '#444', fontFamily: 'monospace' }}>{c}</span>
                                </div>
                              ))}
                              {gradColors.length < 4 && (
                                <button type="button" onClick={() => setGradColors(prev => [...prev, '#ffffff'])}
                                  style={{ width: 44, height: 44, border: '2px dashed #333', borderRadius: 10, background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '1.4rem', marginBottom: 18 }}>+</button>
                              )}
                              {gradColors.length > 2 && (
                                <button type="button" onClick={() => setGradColors(prev => prev.slice(0, -1))}
                                  style={{ width: 44, height: 44, border: '2px dashed #ff6b6b44', borderRadius: 10, background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.4rem', marginBottom: 18 }}>−</button>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontSize: '0.75rem', color: '#555', whiteSpace: 'nowrap' }}>Угол: {gradAngle}°</span>
                              <input type="range" min={0} max={360} value={gradAngle}
                                onChange={e => setGradAngle(parseInt(e.target.value))}
                                className="zoom-slider" style={{ flex: 1 }} />
                            </div>

                            <div style={{ padding: '0.6rem 1rem', borderRadius: 8, background: '#0d0d0d', border: '1px solid #1e1e1e' }}>
                              <span style={{ fontSize: '0.75rem', color: '#444' }}>Предпросмотр: </span>
                              <span style={{ background: vipForm.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 700, fontSize: '1rem' }}>
                                {user.display_name || user.username}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Music upload ── */}
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#555', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                          <Music size={12} /> Музыка на профиле (MP3, макс. 15MB)
                        </span>
                        <input ref={musicRef} type="file" accept="audio/mp3,audio/mpeg,audio/ogg,audio/wav,audio/*" hidden onChange={handleMusicUpload} />
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => musicRef.current.click()}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', background: 'transparent', border: '1px solid #333', borderRadius: 8, color: '#888', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <Upload size={14} /> {vipForm.profile_music ? 'Заменить файл' : 'Загрузить MP3'}
                          </button>
                          {(vipForm.profile_music || user.profile_music) && (
                            <button type="button" onClick={() => setVipForm(f => ({ ...f, profile_music: '' }))}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.8rem', background: 'transparent', border: '1px solid #ff6b6b44', borderRadius: 8, color: '#ff6b6b', fontSize: '0.85rem', cursor: 'pointer' }}>
                              <X size={13} /> Убрать
                            </button>
                          )}
                        </div>
                        {vipForm.profile_music && vipForm.profile_music.startsWith('data:') && (
                          <audio controls src={vipForm.profile_music} style={{ marginTop: '0.6rem', width: '100%', maxWidth: 320 }} />
                        )}
                        {!vipForm.profile_music && user.profile_music && (
                          <span style={{ fontSize: '0.8rem', color: '#69db7c', marginTop: '0.4rem', display: 'block' }}>✓ Музыка уже загружена</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #1a1a1a' }}>
                        <button type="button"
                          onClick={() => { setShowVipPanel(false); setGradEnabled(!!user.animated_name); setVipForm({ animated_name: user.animated_name || '', profile_music: user.profile_music || null }); }}
                          style={{ padding: '0.55rem 1.1rem', background: 'transparent', border: '1px solid #222', borderRadius: 8, color: '#555', fontSize: '0.85rem', cursor: 'pointer' }}>
                          Отмена
                        </button>
                        <button type="button" onClick={handleVipSave} disabled={vipSaving}
                          style={{ padding: '0.55rem 1.3rem', background: '#ffd43b', border: 'none', borderRadius: 8, color: '#000', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: vipSaving ? 0.6 : 1 }}>
                          {vipSaving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  )}
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
          <div className="profile-content" style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
            <Feed user={user} onOpenChat={(targetUser) => {
              setChatTarget(targetUser);
              switchTab('messages');
            }} />
          </div>
        )}

        {tab === 'friends' && (
          <div className="profile-content">
            <Friends user={user} onOpenChat={(targetUser) => {
              setChatTarget(targetUser);
              switchTab('messages');
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

        {tab === 'groups' && (
          <div className="profile-content profile-content--full">
            <Groups user={user} />
          </div>
        )}

        {tab === 'channels' && (
          <div className="profile-content profile-content--full">
            <Channels user={user} />
          </div>
        )}

        {tab === 'bookmarks' && (
          <div className="profile-content" style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
            <Bookmarks user={user} onUserClick={(username) => navigate(`/profile/${username}`)} />
          </div>
        )}

        {tab === 'admin' && (user.email === 'yamekel0@gmail.com' || isAdmin) && (
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

      {user.profile_music && tab === 'profile' && (
        <ProfileMusicPlayer src={user.profile_music} username={user.username} accent={accent} />
      )}

      {/* Notification bell — fixed top right, only on feed tab */}
      {tab === 'feed' && (
        <div className="notif-bell-wrap" style={{ position: 'fixed', top: 20, right: 20, zIndex: 200 }}>
          <NotificationBell accent={accent} />
        </div>
      )}

      {/* Global call manager — always mounted so it can receive incoming calls */}
      <CallManager currentUser={user} />
    </div>
  );
}
