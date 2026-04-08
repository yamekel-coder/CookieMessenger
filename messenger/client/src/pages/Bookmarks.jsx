import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import PostCard from '../components/PostCard';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  });
}

export default function Bookmarks({ user, onUserClick }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/bookmarks').then(r => r.json()).then(data => {
      setPosts(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLike = async (postId) => {
    const res = await api(`/api/feed/${postId}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: data.count, liked: data.liked } : p));
    }
  };

  const handleDelete = async (postId) => {
    const res = await api(`/api/feed/${postId}`, { method: 'DELETE' });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return (
    <div className="bookmarks-page">
      <div className="feed-header" style={{ marginBottom: '1rem' }}>
        <span className="feed-title">Закладки</span>
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#444' }}>Загрузка...</div>}

      {!loading && posts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#444' }}>
          <Bookmark size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ fontSize: '1rem', color: '#555', marginBottom: '0.4rem' }}>Нет закладок</p>
          <span style={{ fontSize: '0.85rem' }}>Сохраняйте посты, чтобы вернуться к ним позже</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user.id}
            onLike={handleLike}
            onDelete={handleDelete}
            onVote={() => {}}
            onUserClick={onUserClick}
          />
        ))}
      </div>
    </div>
  );
}
