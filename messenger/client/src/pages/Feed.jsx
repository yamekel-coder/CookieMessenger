import { useState, useEffect, useCallback, useRef } from 'react';
import CreatePost from '../components/CreatePost';
import PostCard from '../components/PostCard';
import NotificationBell from '../components/NotificationPanel';
import UserProfile from './UserProfile';
import { useWebSocket } from '../hooks/useWebSocket';
import { Loader } from 'lucide-react';

export default function Feed({ user, onOpenChat }) {
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initial, setInitial] = useState(true);
  const [error, setError] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [viewingUser, setViewingUser] = useState(null); // username string
  const notifRef = useRef(null);
  const accent = user.accent_color || '#fff';

  const loadPosts = useCallback(async (p = 1, replace = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed?page=${p}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setPosts(prev => replace ? (data.posts || []) : [...prev, ...(data.posts || [])]);
      setHasMore(data.hasMore ?? false);
      setPage(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setInitial(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(1, true);
    // Load initial online users
    fetch('/api/users/online', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(ids => setOnlineUsers(new Set(ids))).catch(() => {});
  }, [loadPosts]);

  useWebSocket({
    new_post: (post) => {
      setPosts(prev => prev.find(p => p.id === post.id) ? prev : [post, ...prev]);
    },
    delete_post: ({ postId }) => {
      setPosts(prev => prev.filter(p => p.id !== postId));
    },
    like_update: ({ postId, liked, count, actorId }) => {
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        if (actorId === user.id) return { ...p, liked, likes: count };
        return { ...p, likes: count };
      }));
    },
    new_comment: ({ postId, comment }) => {
      if (comment.user_id === user.id) return;
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
      ));
      // ws_comment is auto-dispatched by useWebSocket hook
    },
    poll_update: ({ postId, poll }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll } : p));
    },
    notification: (notif) => {
      notifRef.current?.bumpUnread(notif);
    },
    // friend_request, friend_accepted, new_message, user_online, user_offline
    // are auto-dispatched as ws_* DOM events by the useWebSocket hook
    user_online: ({ userId }) => {
      setOnlineUsers(prev => new Set([...prev, userId]));
    },
    user_offline: ({ userId }) => {
      setOnlineUsers(prev => { const s = new Set(prev); s.delete(userId); return s; });
    },
  });

  const handlePost = (newPost) => {
    setPosts(prev => prev.find(p => p.id === newPost.id) ? prev : [newPost, ...prev]);
  };

  const handleLike = async (postId) => {
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: data.liked, likes: data.count } : p));
  };

  const handleDelete = async (postId) => {
    const res = await fetch(`/api/feed/${postId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleVote = async (postId, optionId) => {
    const res = await fetch(`/api/feed/poll/${optionId}/vote`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return;
    const updatedPoll = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: updatedPoll } : p));
  };

  // Viewing another user's profile
  if (viewingUser) {
    return (
      <div className="feed-page">
        <UserProfile
          username={viewingUser}
          currentUser={user}
          onBack={() => setViewingUser(null)}
          onOpenChat={onOpenChat}
        />
      </div>
    );
  }

  return (
    <div className="feed-page">
      <div className="feed-header">
        <span className="feed-title">Лента</span>
        <NotificationBell ref={notifRef} accent={accent} />
      </div>

      <div className="feed-content">
        <CreatePost user={user} onPost={handlePost} />

        {initial && loading && (
          <div className="feed-loader"><Loader size={20} className="spin" /></div>
        )}

        {error && (
          <div className="feed-empty">
            <p>Ошибка загрузки</p>
            <span>{error}</span>
            <button className="feed-load-more" style={{ marginTop: '1rem' }} onClick={() => loadPosts(1, true)}>
              Попробовать снова
            </button>
          </div>
        )}

        <div className="feed-list">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={{ ...post, isOnline: onlineUsers.has(post.user_id) }}
              currentUserId={user.id}
              onLike={handleLike}
              onDelete={handleDelete}
              onVote={handleVote}
              onUserClick={(username) => {
                if (username !== user.username) setViewingUser(username);
              }}
            />
          ))}
        </div>

        {!initial && !error && posts.length === 0 && (
          <div className="feed-empty">
            <p>Пока нет постов</p>
            <span>Будьте первым — напишите что-нибудь</span>
          </div>
        )}

        {hasMore && !loading && !error && (
          <button className="feed-load-more" onClick={() => loadPosts(page + 1)}>
            Загрузить ещё
          </button>
        )}

        {loading && !initial && (
          <div className="feed-loader"><Loader size={18} className="spin" /></div>
        )}
      </div>
    </div>
  );
}
