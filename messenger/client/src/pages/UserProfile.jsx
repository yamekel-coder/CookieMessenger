import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, UserPlus, UserCheck, Users, FileText, MessageSquare, Shield } from 'lucide-react';
import PostCard from '../components/PostCard';

function Avatar({ user, size = 80 }) {
  const accent = user?.accent_color || '#fff';
  const label = user?.display_name || user?.username || '?';
  return (
    <div className="up-avatar" style={{
      width: size, height: size, minWidth: size,
      backgroundImage: user?.avatar ? `url(${user.avatar})` : undefined,
      borderColor: accent, fontSize: size * 0.35,
    }}>
      {!user?.avatar && label[0].toUpperCase()}
    </div>
  );
}

export default function UserProfile({ username, currentUser, onBack, onOpenChat }) {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [tab, setTab] = useState('posts'); // posts | followers | following
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const token = () => localStorage.getItem('token');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(`/api/users/${username}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        setProfile(await res.json());
      } else if (res.status === 403) {
        setProfileError('closed');
      } else {
        setProfileError('notfound');
      }
    } finally { setLoading(false); }
  }, [username]);

  const loadPosts = useCallback(async () => {
    const res = await fetch(`/api/users/${username}/posts`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts || []);
    }
  }, [username]);

  const loadFollowers = async () => {
    const res = await fetch(`/api/users/${username}/followers`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) setFollowers(await res.json());
  };

  const loadFollowing = async () => {
    const res = await fetch(`/api/users/${username}/following`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.ok) setFollowing(await res.json());
  };

  useEffect(() => {
    loadProfile();
    loadPosts();
    // Get online users
    fetch('/api/users/online', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(ids => setOnlineUsers(new Set(ids))).catch(() => {});
  }, [loadProfile, loadPosts]);

  // Listen for online/offline events
  useEffect(() => {
    const onOnline = (e) => setOnlineUsers(prev => new Set([...prev, e.detail.userId]));
    const onOffline = (e) => setOnlineUsers(prev => { const s = new Set(prev); s.delete(e.detail.userId); return s; });
    window.addEventListener('ws_user_online', onOnline);
    window.addEventListener('ws_user_offline', onOffline);
    return () => {
      window.removeEventListener('ws_user_online', onOnline);
      window.removeEventListener('ws_user_offline', onOffline);
    };
  }, []);

  const handleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    const res = await fetch(`/api/users/${profile.username}/follow`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(p => ({ ...p, isFollowing: data.following, followers: data.followers }));
    }
    setFollowLoading(false);
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'followers' && followers.length === 0) loadFollowers();
    if (t === 'following' && following.length === 0) loadFollowing();
  };

  const handleLike = async (postId) => {
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: data.liked, likes: data.count } : p));
  };

  const handleDelete = async (postId) => {
    const res = await fetch(`/api/feed/${postId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleVote = async (postId, optionId) => {
    const res = await fetch(`/api/feed/poll/${optionId}/vote`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) return;
    const updatedPoll = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: updatedPoll } : p));
  };

  if (loading) return <div className="up-loading">Загрузка...</div>;
  if (profileError === 'closed') return (
    <div className="up-loading">
      <button className="up-back" onClick={onBack}><ArrowLeft size={16} /> Назад</button>
      <div style={{ textAlign: 'center', marginTop: '3rem' }}>
        <Shield size={40} style={{ color: '#555', marginBottom: '1rem' }} />
        <p style={{ color: '#aaa', fontSize: '1rem' }}>Профиль закрыт</p>
        <span style={{ color: '#555', fontSize: '0.85rem' }}>Этот пользователь скрыл свой профиль</span>
      </div>
    </div>
  );
  if (!profile) return <div className="up-loading">Пользователь не найден</div>;

  const accent = profile.accent_color || '#fff';
  const isOnline = onlineUsers.has(profile.id);
  const isMe = profile.id === currentUser.id;

  return (
    <div className="user-profile">
      {/* Back button */}
      <button className="up-back" onClick={onBack}>
        <ArrowLeft size={16} /> Назад
      </button>

      {/* Banner */}
      <div className="up-banner" style={{ backgroundImage: profile.banner ? `url(${profile.banner})` : undefined }} />

      {/* Header */}
      <div className="up-header">
        <div className="up-avatar-wrap">
          <Avatar user={profile} size={72} />
          {isOnline && <span className="up-online-dot" />}
        </div>

        <div className="up-header-info">
          <div className="up-name-row">
            <div>
              <h2 
                className={`up-name${profile.animated_name ? ' gradient-name' : ''}`}
                style={profile.animated_name 
                  ? { background: profile.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
                  : { color: accent }
                }
              >
                {profile.display_name || profile.username}
              </h2>
              <span className="up-username">@{profile.username}</span>
              {isOnline && <span className="up-online-label">онлайн</span>}
              {profile.profile_music && (
                <audio controls className="profile-music-player" src={profile.profile_music} />
              )}
            </div>
            {!isMe && (
              <div className="up-actions">
                <button
                  className="up-msg-btn"
                  onClick={() => onOpenChat?.(profile)}
                  title="Написать сообщение"
                >
                  <MessageSquare size={14} /> Написать
                </button>
                <button
                  className={`up-follow-btn ${profile.isFollowing ? 'up-follow-btn--active' : ''}`}
                  style={profile.isFollowing ? { borderColor: accent, color: accent } : {}}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {profile.isFollowing ? <><UserCheck size={14} /> Подписан</> : <><UserPlus size={14} /> Подписаться</>}
                </button>
              </div>
            )}
          </div>

          {profile.bio && <p className="up-bio">{profile.bio}</p>}

          {/* Stats */}
          <div className="up-stats">
            <button className={`up-stat ${tab === 'posts' ? 'active' : ''}`}
              onClick={() => handleTabChange('posts')} style={tab === 'posts' ? { color: accent } : {}}>
              <FileText size={13} />
              <strong>{profile.postsCount}</strong> постов
            </button>
            <button className={`up-stat ${tab === 'followers' ? 'active' : ''}`}
              onClick={() => handleTabChange('followers')} style={tab === 'followers' ? { color: accent } : {}}>
              <Users size={13} />
              <strong>{profile.followers}</strong> подписчиков
            </button>
            <button className={`up-stat ${tab === 'following' ? 'active' : ''}`}
              onClick={() => handleTabChange('following')} style={tab === 'following' ? { color: accent } : {}}>
              <strong>{profile.following}</strong> подписок
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {tab === 'posts' && (
        <div className="up-posts">
          {posts.length === 0 && <p className="up-empty">Постов пока нет</p>}
          {posts.map(post => (
            <PostCard key={post.id} post={post} currentUserId={currentUser.id}
              onLike={handleLike} onDelete={handleDelete} onVote={handleVote} />
          ))}
        </div>
      )}

      {tab === 'followers' && (
        <div className="up-user-list">
          {followers.length === 0 && <p className="up-empty">Нет подписчиков</p>}
          {followers.map(u => <UserRow key={u.id} user={u} isOnline={onlineUsers.has(u.id)} />)}
        </div>
      )}

      {tab === 'following' && (
        <div className="up-user-list">
          {following.length === 0 && <p className="up-empty">Нет подписок</p>}
          {following.map(u => <UserRow key={u.id} user={u} isOnline={onlineUsers.has(u.id)} />)}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, isOnline }) {
  const accent = user.accent_color || '#fff';
  return (
    <div className="up-user-row">
      <div className="up-user-avatar-wrap">
        <div className="up-user-avatar" style={{
          backgroundImage: user.avatar ? `url(${user.avatar})` : undefined,
          borderColor: accent,
        }}>
          {!user.avatar && (user.display_name || user.username)[0].toUpperCase()}
        </div>
        {isOnline && <span className="up-online-dot up-online-dot--sm" />}
      </div>
      <div>
        <span className="up-user-name" style={{ color: accent }}>{user.display_name || user.username}</span>
        <span className="up-user-username">@{user.username}</span>
      </div>
    </div>
  );
}
