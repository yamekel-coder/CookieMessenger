import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ArrowLeft, MessageSquare, Image, Video, X, Phone, Video as VideoIcon, Smile, Search, ChevronDown, ChevronUp } from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...opts.headers,
    },
  });
}

function msgTime(str) {
  return new Date(str + 'Z').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function Avatar({ user, size = 38 }) {
  const accent = user?.accent_color || '#fff';
  const label = user?.display_name || user?.username || '?';
  return (
    <div className="msg-avatar" style={{
      width: size, height: size, minWidth: size,
      backgroundImage: user?.avatar ? `url(${user.avatar})` : undefined,
      borderColor: accent, fontSize: size * 0.38,
    }}>
      {!user?.avatar && label[0].toUpperCase()}
    </div>
  );
}

function ConversationList({ convos, activeId, onSelect, currentUserId, unreadMap }) {
  if (convos.length === 0) {
    return (
      <div className="msg-empty-convos">
        <MessageSquare size={28} />
        <p>Нет сообщений</p>
        <span>Начните чат с другом</span>
      </div>
    );
  }
  return convos.map(c => {
    const name = c.display_name || c.username;
    const accent = c.accent_color || '#fff';
    const unread = unreadMap[c.id] || 0;
    const preview = c.last_media_type === 'image' ? '📷 Фото'
      : c.last_media_type === 'video' ? '🎥 Видео'
      : c.last_message || '';
    return (
      <button key={c.id} className={`msg-convo ${activeId === c.id ? 'active' : ''}`}
        onClick={() => onSelect(c)}>
        <Avatar user={c} size={40} />
        <div className="msg-convo-info">
          <div className="msg-convo-top">
            <span className="msg-convo-name" style={{ color: accent }}>{name}</span>
            <span className="msg-convo-time">{msgTime(c.last_at)}</span>
          </div>
          <div className="msg-convo-bottom">
            <span className="msg-convo-preview">
              {c.last_sender_id === currentUserId ? 'Вы: ' : ''}{preview}
            </span>
            {unread > 0 && (
              <span className="msg-unread-badge" style={{ background: accent, color: '#000' }}>
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  });
}

function MessageBubble({ m, isMine, accent, activeUser }) {
  const [lightbox, setLightbox] = useState(false);

  // Sticker — big emoji
  if (m.media_type === 'sticker') {
    return (
      <div className={`msg-bubble msg-bubble-sticker ${isMine ? 'msg-bubble-mine-sticker' : ''}`}>
        <span className="msg-sticker">{m.content}</span>
        <span className="msg-bubble-time" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {msgTime(m.created_at)}
        </span>
      </div>
    );
  }

  // GIF
  if (m.media_type === 'gif') {
    return (
      <div className={`msg-bubble msg-bubble-gif ${isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs'}`}
        style={{ padding: 0, background: 'transparent' }}>
        <img src={m.media} alt="gif" className="msg-media-img" style={{ borderRadius: 12 }} />
        <span className="msg-bubble-time" style={{ padding: '0 0.5rem 0.3rem', opacity: 0.5 }}>
          {msgTime(m.created_at)}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={`msg-bubble ${isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs'}`}
        style={isMine && !m.media ? { background: accent, color: '#000' } : {}}>

        {/* Image */}
        {m.media && m.media_type === 'image' && (
          <img
            src={m.media}
            alt="img"
            className="msg-media-img"
            onClick={() => setLightbox(true)}
          />
        )}

        {/* Video */}
        {m.media && m.media_type === 'video' && (
          <video src={m.media} controls className="msg-media-video" />
        )}

        {/* Text */}
        {m.content && (
          <span className="msg-bubble-text" style={isMine && m.media ? { color: '#000' } : {}}>
            {m.content}
          </span>
        )}

        <span className="msg-bubble-time" style={isMine && !m.media ? { color: 'rgba(0,0,0,0.45)' } : {}}>
          {msgTime(m.created_at)}
        </span>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="msg-lightbox" onClick={() => setLightbox(false)}>
          <button className="msg-lightbox-close"><X size={20} /></button>
          <img src={m.media} alt="full" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

export default function Messages({ user, initialChat, onClearInitial }) {
  const [convos, setConvos] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadMap, setUnreadMap] = useState({});
  const [mediaPreview, setMediaPreview] = useState(null); // { src, type, file }
  const [showPicker, setShowPicker] = useState(false);
  const [convoSearch, setConvoSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const bottomRef = useRef();
  const inputRef = useRef();
  const fileRef = useRef();
  const videoRef = useRef();
  const pickerRef = useRef();
  const accent = user.accent_color || '#fff';

  const loadConvos = useCallback(async () => {
    const res = await api('/api/messages/conversations');
    if (res.ok) {
      const data = await res.json();
      setConvos(data);
      const map = {};
      data.forEach(c => { if (c.unread > 0) map[c.id] = c.unread; });
      setUnreadMap(map);
    }
  }, []);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  useEffect(() => {
    if (initialChat) { openChat(initialChat); onClearInitial?.(); }
  }, [initialChat]);

  const openChat = async (targetUser) => {
    setActiveUser(targetUser);
    setMediaPreview(null);
    setText('');
    setUnreadMap(prev => ({ ...prev, [targetUser.id]: 0 }));
    const res = await api(`/api/messages/${targetUser.id}`);
    if (res.ok) {
      setMessages(await res.json());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
    }
    inputRef.current?.focus();
  };

  const handleMediaPick = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const src = await fileToBase64(file);
    setMediaPreview({ src, type });
    e.target.value = '';
    inputRef.current?.focus();
  };

  const clearMedia = () => setMediaPreview(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const handleEmojiPick = (emoji) => {
    const el = inputRef.current;
    if (!el) { setText(t => t + emoji); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const handleStickerPick = async (emoji) => {
    setShowPicker(false);
    if (!activeUser) return;
    await api(`/api/messages/${activeUser.id}`, {
      method: 'POST',
      body: JSON.stringify({ content: emoji, media: null, media_type: 'sticker' }),
    });
  };

  const handleGifPick = async (gif) => {
    setShowPicker(false);
    if (!activeUser) return;
    await api(`/api/messages/${activeUser.id}`, {
      method: 'POST',
      body: JSON.stringify({ content: null, media: gif.url, media_type: 'gif' }),
    });
  };

  const sendMessage = async () => {
    if ((!text.trim() && !mediaPreview) || sending || !activeUser) return;
    setSending(true);
    try {
      const body = {
        content: text.trim() || null,
        media: mediaPreview?.src || null,
        media_type: mediaPreview?.type || null,
      };
      
      const res = await api(`/api/messages/${activeUser.id}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      
      if (res.ok) {
        setText('');
        setMediaPreview(null);
        loadConvos();
      } else {
        const error = await res.json();
        alert(`Ошибка отправки: ${error.error || 'Неизвестная ошибка'}`);
      }
    } catch (err) {
      alert('Ошибка отправки сообщения');
    } finally {
      setSending(false);
    }
  };

  // Real-time messages via WS
  useEffect(() => {
    const handler = (e) => {
      const msg = e.detail;
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;

      if (activeUser?.id === partnerId) {
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
        // Mark as read
        if (msg.sender_id !== user.id) api(`/api/messages/${msg.sender_id}`);
      } else if (msg.sender_id !== user.id) {
        setUnreadMap(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
      }
      loadConvos();
    };
    window.addEventListener('ws_new_message', handler);
    return () => window.removeEventListener('ws_new_message', handler);
  }, [activeUser, user.id, loadConvos]);

  const canSend = (text.trim() || mediaPreview) && !sending;

  return (
    <div className="messages-page">
      {/* Sidebar */}
      <div className={`msg-sidebar ${activeUser ? 'hidden' : ''}`}>
        <div className="msg-sidebar-header">
          <span>Сообщения</span>
          <button 
            className="msg-search-toggle" 
            onClick={() => setSearchVisible(v => !v)}
            title={searchVisible ? 'Скрыть поиск' : 'Показать поиск'}
          >
            {searchVisible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        <div className={`msg-search-wrap ${searchVisible ? 'visible' : ''}`}>
          <Search size={14} className="msg-search-icon" />
          <input
            className="msg-search-input"
            placeholder="Поиск диалогов..."
            value={convoSearch}
            onChange={e => setConvoSearch(e.target.value)}
          />
          {convoSearch && (
            <button className="msg-search-clear" onClick={() => setConvoSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="msg-convo-list">
          <ConversationList
            convos={convos.filter(c => {
              if (!convoSearch) return true;
              const q = convoSearch.toLowerCase();
              return (c.display_name || '').toLowerCase().includes(q) ||
                     c.username.toLowerCase().includes(q);
            })}
            activeId={activeUser?.id}
            onSelect={openChat}
            currentUserId={user.id}
            unreadMap={unreadMap}
          />
        </div>
      </div>

      {/* Chat */}
      <div className={`msg-chat ${!activeUser ? 'hidden' : ''}`}>
        {!activeUser ? (
          <div className="msg-chat-empty">
            <MessageSquare size={40} />
            <p>Выберите диалог</p>
            <span>или начните новый чат из списка друзей</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="msg-chat-header">
              <button className="msg-back-btn" onClick={() => setActiveUser(null)}>
                <ArrowLeft size={16} />
              </button>
              <Avatar user={activeUser} size={34} />
              <div className="msg-chat-header-info">
                <span className="msg-chat-name" style={{ color: activeUser.accent_color || '#fff' }}>
                  {activeUser.display_name || activeUser.username}
                </span>
                <span className="msg-chat-username">@{activeUser.username}</span>
              </div>
              <div className="msg-call-btns">
                <button
                  className="msg-call-btn"
                  title="Аудио звонок"
                  onClick={() => window.__startCall?.(activeUser, 'audio')}
                >
                  <Phone size={16} />
                </button>
                <button
                  className="msg-call-btn"
                  title="Видео звонок"
                  onClick={() => window.__startCall?.(activeUser, 'video')}
                >
                  <VideoIcon size={16} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="msg-messages">
              {messages.map((m, i) => {
                const isMine = m.sender_id === user.id;
                const showAvatar = !isMine && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
                return (
                  <div key={m.id} className={`msg-row ${isMine ? 'msg-row-mine' : 'msg-row-theirs'}`}>
                    {!isMine && (
                      <div style={{ width: 28, flexShrink: 0 }}>
                        {showAvatar && <Avatar user={activeUser} size={28} />}
                      </div>
                    )}
                    <MessageBubble m={m} isMine={isMine} accent={accent} activeUser={activeUser} />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Media preview bar */}
            {mediaPreview && (
              <div className="msg-media-preview">
                {mediaPreview.type === 'image'
                  ? <img src={mediaPreview.src} alt="preview" />
                  : <video src={mediaPreview.src} />
                }
                <button className="msg-media-remove" onClick={clearMedia}><X size={14} /></button>
                <span className="msg-media-label">
                  {mediaPreview.type === 'image' ? 'Фото' : 'Видео'}
                </span>
              </div>
            )}

            {/* Input */}
            <div className="msg-input-area">
              {/* Emoji picker popup */}
              {showPicker && (
                <div className="msg-picker-wrap" ref={pickerRef}>
                  <EmojiPicker
                    accent={accent}
                    onEmoji={handleEmojiPick}
                    onSticker={handleStickerPick}
                    onGif={handleGifPick}
                    onClose={() => setShowPicker(false)}
                  />
                </div>
              )}

              <div className="msg-input-row">
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleMediaPick(e, 'image')} />
                <input ref={videoRef} type="file" accept="video/*" hidden onChange={e => handleMediaPick(e, 'video')} />

                <button className="msg-media-btn" onClick={() => fileRef.current.click()} title="Фото">
                  <Image size={17} />
                </button>
                <button className="msg-media-btn" onClick={() => videoRef.current.click()} title="Видео">
                  <Video size={17} />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  className="msg-input"
                  placeholder="Написать сообщение..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  maxLength={2000}
                />

                {/* Emoji button */}
                <button
                  className={`msg-media-btn msg-emoji-btn ${showPicker ? 'active' : ''}`}
                  onClick={() => setShowPicker(v => !v)}
                  title="Эмодзи / Стикеры / GIF"
                  style={showPicker ? { color: accent, borderColor: accent } : {}}
                >
                  <Smile size={17} />
                </button>

                <button
                  className="msg-send-btn"
                  onClick={sendMessage}
                  disabled={!canSend}
                  style={canSend ? { background: accent, color: '#000' } : {}}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
