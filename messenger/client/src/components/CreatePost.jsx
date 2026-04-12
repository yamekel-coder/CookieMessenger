import { useState, useRef, useEffect, useCallback } from 'react';
import { Image, Video, BarChart2, X, Plus, Send, Smile } from 'lucide-react';
import EmojiPicker from './EmojiPicker';

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

export default function CreatePost({ user, onPost }) {
  const [type, setType] = useState('text');
  const [content, setContent] = useState('');
  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef();

  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionPos, setMentionPos] = useState(null); // cursor position of @

  const fileRef = useRef();
  const videoRef = useRef();
  const textareaRef = useRef();
  const accent = user.accent_color || '#fff';

  // Detect @mention while typing
  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionPos(cursor - match[0].length);
    } else {
      setMentionQuery('');
      setMentionResults([]);
      setMentionPos(null);
    }
  };

  // Fetch mention suggestions
  useEffect(() => {
    if (mentionQuery === '' && mentionPos !== null) {
      // show top users when just typed @
      fetch(`/api/feed/mention-search?q=`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }).then(r => r.json()).then(setMentionResults).catch(() => setMentionResults([]));
      return;
    }
    if (!mentionQuery) { setMentionResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/feed/mention-search?q=${encodeURIComponent(mentionQuery)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }).then(r => r.json()).then(setMentionResults).catch(() => setMentionResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [mentionQuery, mentionPos]);

  const insertMention = useCallback((username) => {
    const before = content.slice(0, mentionPos);
    const after = content.slice(textareaRef.current.selectionStart);
    const newContent = `${before}@${username} ${after}`;
    setContent(newContent);
    setMentionResults([]);
    setMentionQuery('');
    setMentionPos(null);
    setTimeout(() => {
      const pos = before.length + username.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [content, mentionPos]);

  const handleMedia = async (e, isVideo) => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    setMedia(b64);
    setMediaPreview({ src: b64, isVideo });
    setType(isVideo ? 'video' : 'image');
    e.target.value = '';
  };

  const clearMedia = () => { setMedia(null); setMediaPreview(null); setType('text'); };

  const addPollOption = () => setPollOptions(o => [...o, '']);
  const removePollOption = (i) => setPollOptions(o => o.filter((_, idx) => idx !== i));
  const updatePollOption = (i, v) => setPollOptions(o => o.map((x, idx) => idx === i ? v : x));

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const body = { type, content, media };
      if (type === 'poll') body.poll_options = pollOptions.filter(o => o.trim());
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onPost(data);
        setContent(''); setMedia(null); setMediaPreview(null);
        setType('text'); setPollOptions(['', '']);
        if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
      }
    } finally { setLoading(false); }
  };

  const handleStickerPick = async (sticker) => {
    setShowPicker(false);
    if (loading) return;
    const isReal = typeof sticker === 'object' && sticker.image;
    if (!isReal) return; // only real image stickers in feed
    setLoading(true);
    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ type: 'sticker', media: sticker.image }),
      });
      const data = await res.json();
      if (res.ok) onPost(data);
    } finally { setLoading(false); }
  };

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const canSubmit = type === 'poll'
    ? pollOptions.filter(o => o.trim()).length >= 2
    : content.trim() || media;

  return (
    <div className="create-post">
      <div className="cp-top">
        <div className="cp-avatar"
          style={{ backgroundImage: user.avatar ? `url(${user.avatar})` : undefined, borderColor: accent }}>
          {!user.avatar && <span>{(user.display_name || user.username)[0].toUpperCase()}</span>}
        </div>
        <div className="cp-input-wrap" style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            className="cp-input"
            placeholder={type === 'poll' ? 'Вопрос для опроса...' : 'Что у вас нового? Используйте @ для упоминания'}
            value={content}
            onChange={handleContentChange}
            rows={2}
            maxLength={2000}
            style={{ overflow: 'hidden', resize: 'none' }}
          />

          {/* Mention dropdown */}
          {mentionResults.length > 0 && (
            <div className="mention-dropdown">
              {mentionResults.map(u => (
                <button key={u.id} className="mention-item" onMouseDown={e => { e.preventDefault(); insertMention(u.username); }}>
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
        </div>
      </div>

      {/* Media preview */}
      {mediaPreview && (
        <div className="cp-media-preview">
          {mediaPreview.isVideo
            ? <video src={mediaPreview.src} controls className="cp-media-video" />
            : <img src={mediaPreview.src} alt="preview" className="cp-media-img" />
          }
          <button className="cp-media-remove" onClick={clearMedia}><X size={14} /></button>
        </div>
      )}

      {/* Poll options */}
      {type === 'poll' && (
        <div className="cp-poll">
          {pollOptions.map((opt, i) => (
            <div key={i} className="cp-poll-option">
              <input
                type="text"
                placeholder={`Вариант ${i + 1}`}
                value={opt}
                onChange={e => updatePollOption(i, e.target.value)}
                maxLength={80}
              />
              {pollOptions.length > 2 && (
                <button onClick={() => removePollOption(i)}><X size={14} /></button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button className="cp-poll-add" onClick={addPollOption}>
              <Plus size={14} /> Добавить вариант
            </button>
          )}
        </div>
      )}

      <div className="cp-bottom">
        <div className="cp-tools">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleMedia(e, false)} />
          <input ref={videoRef} type="file" accept="video/*" hidden onChange={e => handleMedia(e, true)} />
          <button className={`cp-tool ${type === 'image' ? 'active' : ''}`}
            onClick={() => fileRef.current.click()} title="Картинка">
            <Image size={18} />
          </button>
          <button className={`cp-tool ${type === 'video' ? 'active' : ''}`}
            onClick={() => videoRef.current.click()} title="Видео">
            <Video size={18} />
          </button>
          <button className={`cp-tool ${type === 'poll' ? 'active' : ''}`}
            onClick={() => setType(t => t === 'poll' ? 'text' : 'poll')} title="Опрос">
            <BarChart2 size={18} />
          </button>
          <div style={{ position: 'relative' }}>
            <button className={`cp-tool ${showPicker ? 'active' : ''}`}
              onClick={() => setShowPicker(v => !v)} title="Стикер">
              <Smile size={18} />
            </button>
            {showPicker && (
              <div ref={pickerRef} style={{ position: 'absolute', bottom: '110%', left: 0, zIndex: 100 }}>
                <EmojiPicker
                  accent={accent}
                  initialTab="stickers"
                  onEmoji={e => { setContent(c => c + e); setShowPicker(false); }}
                  onSticker={handleStickerPick}
                  onGif={() => {}}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}
          </div>
        </div>
        <button
          className="cp-submit"
          style={{ background: canSubmit ? accent : undefined, color: canSubmit ? '#000' : undefined }}
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
        >
          <Send size={15} />
          {loading ? 'Публикация...' : 'Опубликовать'}
        </button>
      </div>
    </div>
  );
}
