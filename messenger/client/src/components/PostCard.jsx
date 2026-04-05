import { useState, useRef, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Trash2, Send, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import VerifiedBadge from './VerifiedBadge';

function timeAgo(str) {
  const diff = (Date.now() - new Date(str + 'Z')) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч.`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн.`;
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function Avatar({ user, size = 34 }) {
  const accent = user?.accent_color || '#fff';
  const label = user?.display_name || user?.username || '?';
  return (
    <div className="post-avatar" style={{
      width: size, height: size, minWidth: size,
      backgroundImage: user?.avatar ? `url(${user.avatar})` : undefined,
      borderColor: accent,
      fontSize: size * 0.38,
    }}>
      {!user?.avatar && <span>{label[0].toUpperCase()}</span>}
    </div>
  );
}

// Render text with clickable @mentions
function RichText({ text, accent }) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^@[a-zA-Z0-9_]+$/.test(part)
          ? <span key={i} className="mention-tag" style={{ color: accent }}>{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function PollBlock({ post, onVote }) {
  const total = post.poll.reduce((s, o) => s + o.votes, 0);
  const hasVoted = post.poll.some(o => o.voted);
  const accent = post.accent_color || '#fff';

  return (
    <div className="poll-block">
      {post.poll.map(option => {
        const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
        return (
          <button
            key={option.id}
            className={`poll-option ${option.voted ? 'poll-voted' : ''} ${hasVoted ? 'poll-revealed' : ''}`}
            onClick={() => !hasVoted && onVote(option.id)}
            style={option.voted ? { borderColor: accent } : {}}
          >
            {hasVoted && (
              <div className="poll-bar"
                style={{ width: `${pct}%`, background: option.voted ? accent : '#1e1e1e' }} />
            )}
            <span className="poll-text">{option.text}</span>
            {hasVoted && <span className="poll-pct">{pct}%</span>}
          </button>
        );
      })}
      <p className="poll-total">
        {total} {total === 1 ? 'голос' : total < 5 ? 'голоса' : 'голосов'}
      </p>
    </div>
  );
}

// Inline mention autocomplete for comment input
function CommentInput({ onSubmit, accent }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionPos, setMentionPos] = useState(null);
  const inputRef = useRef();

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionPos(cursor - match[0].length);
    } else {
      setMentionQuery('');
      setMentionResults([]);
      setMentionPos(null);
    }
  };

  useEffect(() => {
    if (mentionPos === null) { setMentionResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/feed/mention-search?q=${encodeURIComponent(mentionQuery)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }).then(r => r.json()).then(setMentionResults).catch(() => setMentionResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [mentionQuery, mentionPos]);

  const insertMention = useCallback((username) => {
    const before = text.slice(0, mentionPos);
    const after = text.slice(inputRef.current.selectionStart);
    const newText = `${before}@${username} ${after}`;
    setText(newText);
    setMentionResults([]);
    setMentionQuery('');
    setMentionPos(null);
    setTimeout(() => {
      const pos = before.length + username.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }, [text, mentionPos]);

  const submit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(text.trim());
    if (ok) setText('');
    setSubmitting(false);
  };

  return (
    <div className="comment-input-row" style={{ position: 'relative' }}>
      {mentionResults.length > 0 && (
        <div className="mention-dropdown mention-dropdown--up">
          {mentionResults.map(u => (
            <button key={u.id} className="mention-item"
              onMouseDown={e => { e.preventDefault(); insertMention(u.username); }}>
              <div className="mention-avatar"
                style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : undefined, borderColor: u.accent_color || '#fff' }}>
                {!u.avatar && (u.display_name || u.username)[0].toUpperCase()}
              </div>
              <div className="mention-info">
                <span className="mention-name" style={{ color: u.accent_color || '#fff' }}>
                  {u.display_name || u.username}
                </span>
                <span className="mention-username">@{u.username}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="comment-input-wrap">
        <input
          ref={inputRef}
          type="text"
          placeholder="Написать комментарий... (@упоминание)"
          value={text}
          onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
          maxLength={500}
          autoFocus
        />
        <button
          className="comment-send-btn"
          onClick={submit}
          disabled={!text.trim() || submitting}
          style={{ color: text.trim() ? accent : undefined }}
          title="Отправить"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

export default function PostCard({ post, currentUserId, onLike, onDelete, onVote, onUserClick }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
  const [viewCount, setViewCount] = useState(post.views || 0);
  const [viewRegistered, setViewRegistered] = useState(false);
  const cardRef = useRef(null);
  const accent = post.accent_color || '#fff';

  // Listen for real-time comments from OTHER users only
  useEffect(() => {
    const handler = (e) => {
      const { postId, comment } = e.detail;
      if (postId !== post.id) return;
      // Skip our own comments — already added optimistically in submitComment
      if (comment.user_id === currentUserId) return;
      setComments(c => c !== null ? [...c, comment] : null);
      setCommentsCount(n => n + 1);
    };
    window.addEventListener('ws_new_comment', handler);
    return () => window.removeEventListener('ws_new_comment', handler);
  }, [post.id, currentUserId]);

  // Register view when post enters viewport (once per session)
  useEffect(() => {
    // Check localStorage to prevent duplicate views on page refresh
    const viewedKey = `post_viewed_${post.id}`;
    const alreadyViewed = localStorage.getItem(viewedKey);
    
    if (alreadyViewed || viewRegistered) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !viewRegistered) {
            // Post is visible, register view
            setViewRegistered(true);
            localStorage.setItem(viewedKey, 'true');
            
            fetch(`/api/feed/${post.id}/view`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            })
              .then(r => r.json())
              .then(data => {
                if (data.views !== undefined) {
                  setViewCount(data.views);
                }
              })
              .catch(() => {});
          }
        });
      },
      { threshold: 0.5 } // 50% of post must be visible
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (cardRef.current) {
        observer.unobserve(cardRef.current);
      }
    };
  }, [post.id, viewRegistered]);

  const toggleComments = async () => {
    if (!showComments && comments === null) {
      setLoadingComments(true);
      try {
        const res = await fetch(`/api/feed/${post.id}/comments`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setComments(Array.isArray(data) ? data : []);
      } catch {
        setComments([]);
      }
      setLoadingComments(false);
    }
    setShowComments(s => !s);
  };

  const submitComment = async (content) => {
    try {
      const res = await fetch(`/api/feed/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments(c => [...(c || []), data]);
        setCommentsCount(n => n + 1);
        return true;
      }
    } catch {}
    return false;
  };

  return (
    <div className="post-card" ref={cardRef}>
      {/* Header */}
      <div className="post-header">
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={post} />
          {post.isOnline && <span className="post-online-dot" />}
        </div>
        <div className="post-meta">
          <span className="post-name-row">
            <span
              className={`post-name${post.animated_name ? ' gradient-name' : ''}`}
              style={post.animated_name
                ? { background: post.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent', cursor: onUserClick ? 'pointer' : 'default' }
                : { color: accent, cursor: onUserClick ? 'pointer' : 'default' }
              }
              onClick={() => onUserClick?.(post.username)}
            >
              {post.display_name || post.username}
            </span>
            {post.verified ? <VerifiedBadge size={13} /> : null}
          </span>
          <span className="post-username">@{post.username} · {timeAgo(post.created_at)}</span>
        </div>
        {post.user_id === currentUserId && (
          <button className="post-delete" onClick={() => onDelete(post.id)} title="Удалить">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Content with @mentions */}
      {post.content && (
        <p className="post-content">
          <RichText text={post.content} accent={accent} />
        </p>
      )}

      {/* Image */}
      {post.type === 'image' && post.media && (
        <div className="post-media"><img src={post.media} alt="post" /></div>
      )}

      {/* Video */}
      {post.type === 'video' && post.media && (
        <div className="post-media"><video src={post.media} controls /></div>
      )}

      {/* Poll */}
      {post.type === 'poll' && post.poll && (
        <PollBlock post={post} onVote={(optId) => onVote(post.id, optId)} />
      )}

      {/* Actions */}
      <div className="post-actions">
        <button
          className={`post-action ${post.liked ? 'post-action-liked' : ''}`}
          onClick={() => onLike(post.id)}
          style={post.liked ? { color: accent } : {}}
        >
          <Heart size={16} fill={post.liked ? accent : 'none'} />
          <span>{post.likes}</span>
        </button>
        <button className={`post-action ${showComments ? 'post-action-active' : ''}`} onClick={toggleComments}>
          <MessageCircle size={16} />
          <span>{commentsCount}</span>
          {showComments ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <div className="post-views">
          <Eye size={16} />
          <span>{viewCount}</span>
        </div>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="post-comments">
          {loadingComments && <p className="comments-loading">Загрузка...</p>}

          {!loadingComments && comments?.length === 0 && (
            <p className="comments-empty">Пока нет комментариев. Будьте первым!</p>
          )}

          {!loadingComments && comments?.map(c => (
            <div key={c.id} className="comment">
              <Avatar user={c} size={28} />
              <div className="comment-body">
                <div className="comment-header">
                  <span className="verified-name-row">
                    <span
                      className={`comment-name${c.animated_name ? ' gradient-name' : ''}`}
                      style={c.animated_name
                        ? { background: c.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
                        : { color: c.accent_color || '#fff' }
                      }
                    >
                      {c.display_name || c.username}
                    </span>
                    {c.verified ? <VerifiedBadge size={12} /> : null}
                  </span>
                  <span className="comment-time">{timeAgo(c.created_at)}</span>
                </div>
                <p className="comment-text">
                  <RichText text={c.content} accent={c.accent_color || '#fff'} />
                </p>
              </div>
            </div>
          ))}

          <CommentInput onSubmit={submitComment} accent={accent} />
        </div>
      )}
    </div>
  );
}
