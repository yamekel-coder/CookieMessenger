import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

// ── Emoji data ────────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  {
    id: 'recent', label: '🕐', title: 'Недавние',
    emojis: [],
  },
  {
    id: 'smileys', label: '😀', title: 'Смайлы',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  {
    id: 'gestures', label: '👋', title: 'Жесты',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸'],
  },
  {
    id: 'people', label: '👤', title: 'Люди',
    emojis: ['👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧝','🧛','🧟','🧞','🧜','🧚','👫','👬','👭','💏','💑','👪'],
  },
  {
    id: 'animals', label: '🐶', title: 'Животные',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  },
  {
    id: 'food', label: '🍕', title: 'Еда',
    emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'],
  },
  {
    id: 'travel', label: '✈️', title: 'Путешествия',
    emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸','🪐','🌍','🌎','🌏','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋'],
  },
  {
    id: 'objects', label: '💡', title: 'Объекты',
    emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','🧮','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💰','💴','💵','💶','💷','💸','💳','🪙','💹','📈','📉','📊','📋','🗒️','🗓️','📆','📅','🗑️','📁','📂','🗂️','🗃️','🗄️','🗑️','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
  },
  {
    id: 'symbols', label: '❤️', title: 'Символы',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🔕','🔇','🔈','🔉','🔊','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🀄','🎴'],
  },
];

// ── Sticker packs (big emoji used as stickers) ────────────────────────────────
const STICKER_PACKS = [
  {
    id: 'reactions', name: 'Реакции',
    stickers: ['😂','😭','🥺','😍','🤯','😤','🥳','😎','🤔','😴','🤮','😱','🥰','😈','💀','🤡','👻','🔥','💯','✨','💥','❤️','💔','🎉','🎊','👑','💎','🚀','⚡','🌈'],
  },
  {
    id: 'animals2', name: 'Зверята',
    stickers: ['🐶','🐱','🐸','🐼','🦊','🐨','🐯','🦁','🐮','🐷','🐙','🦋','🐢','🦄','🐧','🦆','🦉','🐺','🦝','🐻','🦘','🦔','🐿️','🦜','🦩','🦚','🦢','🕊️','🐇','🦭'],
  },
  {
    id: 'food2', name: 'Вкусняшки',
    stickers: ['🍕','🍔','🌮','🍜','🍣','🍩','🎂','🍦','🧁','🍫','🍿','🥐','🍰','🧇','🥞','🍟','🌭','🥪','🍱','🍛','🥗','🍝','🍲','🥘','🫕','🍤','🥟','🦪','🍡','🍢'],
  },
];

// ── GIF search via server proxy ───────────────────────────────────────────────
async function searchGifs(query) {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  const res = await fetch(`/api/gifs${params}`);
  const data = await res.json();
  return data.results || [];
}

// ── Recent emojis storage ─────────────────────────────────────────────────────
function getRecent() {
  try { return JSON.parse(localStorage.getItem('emoji_recent') || '[]'); } catch { return []; }
}
function addRecent(emoji) {
  const list = [emoji, ...getRecent().filter(e => e !== emoji)].slice(0, 24);
  localStorage.setItem('emoji_recent', JSON.stringify(list));
}

// ── Main EmojiPicker component ────────────────────────────────────────────────
export default function EmojiPicker({ onEmoji, onSticker, onGif, onClose, accent = '#fff', initialTab = 'emoji' }) {
  const [tab, setTab] = useState(initialTab);   // emoji | stickers | gifs
  const [emojiCat, setEmojiCat] = useState('smileys');
  const [stickerPack, setStickerPack] = useState(null);
  const [userPacks, setUserPacks] = useState([]);
  const [packsLoaded, setPacksLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [recent, setRecent] = useState(getRecent);
  const ref = useRef();
  const gifTimer = useRef();

  // Load user sticker packs when stickers tab opens
  useEffect(() => {
    if (tab === 'stickers' && !packsLoaded) {
      fetch('/api/stickers/my', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
        .then(r => r.json())
        .then(data => {
          setUserPacks(data);
          if (data.length > 0) setStickerPack(data[0].id);
          setPacksLoaded(true);
        })
        .catch(() => setPacksLoaded(true));
    }
    if (tab === 'gifs') loadGifs('');
  }, [tab]);

  const loadGifs = async (q) => {
    setGifsLoading(true);
    try {
      const results = await searchGifs(q);
      setGifs(results);
    } catch { setGifs([]); }
    setGifsLoading(false);
  };

  const handleGifSearch = (val) => {
    setGifSearch(val);
    clearTimeout(gifTimer.current);
    gifTimer.current = setTimeout(() => loadGifs(val), 500);
  };

  const pickEmoji = (emoji) => {
    addRecent(emoji);
    setRecent(getRecent());
    onEmoji(emoji);
  };

  const pickSticker = (sticker) => {
    // sticker can be { id, image } (real) or string (emoji sticker)
    onSticker(sticker);
  };

  const pickGif = (gif) => {
    onGif(gif);
  };

  // Filtered emojis
  const currentCat = EMOJI_CATEGORIES.find(c => c.id === emojiCat);
  const emojiList = emojiCat === 'recent'
    ? recent
    : search
      ? EMOJI_CATEGORIES.flatMap(c => c.emojis).filter(e => e.includes(search))
      : currentCat?.emojis || [];

  const currentPack = userPacks.find(p => p.id === stickerPack);

  return (
    <div className="epicker" ref={ref}>
      {/* Top tabs */}
      <div className="epicker-tabs">
        <button className={`epicker-tab ${tab === 'emoji' ? 'active' : ''}`}
          onClick={() => setTab('emoji')}
          style={tab === 'emoji' ? { color: accent } : {}}>
          😀 Эмодзи
        </button>
        <button className={`epicker-tab ${tab === 'stickers' ? 'active' : ''}`}
          onClick={() => setTab('stickers')}
          style={tab === 'stickers' ? { color: accent } : {}}>
          🎭 Стикеры
        </button>
        <button className={`epicker-tab ${tab === 'gifs' ? 'active' : ''}`}
          onClick={() => setTab('gifs')}
          style={tab === 'gifs' ? { color: accent } : {}}>
          🎬 GIF
        </button>
        <button className="epicker-close" onClick={onClose}><X size={14} /></button>
      </div>

      {/* ── EMOJI TAB ── */}
      {tab === 'emoji' && (
        <>
          <div className="epicker-search">
            <Search size={13} />
            <input
              placeholder="Поиск эмодзи..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && <button onClick={() => setSearch('')}><X size={12} /></button>}
          </div>
          {!search && (
            <div className="epicker-cats">
              {EMOJI_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`epicker-cat ${emojiCat === cat.id ? 'active' : ''}`}
                  onClick={() => setEmojiCat(cat.id)}
                  title={cat.title}
                  style={emojiCat === cat.id ? { borderColor: accent } : {}}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
          <div className="epicker-grid">
            {emojiList.length === 0 && (
              <div className="epicker-empty">
                {emojiCat === 'recent' ? 'Нет недавних' : 'Ничего не найдено'}
              </div>
            )}
            {emojiList.map((emoji, i) => (
              <button key={i} className="epicker-emoji" onClick={() => pickEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── STICKERS TAB ── */}
      {tab === 'stickers' && (
        <>
          {!packsLoaded && <div className="epicker-empty">Загрузка...</div>}
          {packsLoaded && userPacks.length === 0 && (
            <div className="epicker-empty" style={{ flexDirection: 'column', gap: 8 }}>
              <span>Нет стикер-паков</span>
              <span style={{ fontSize: '0.75rem', color: '#555' }}>Добавьте паки в разделе Стикеры</span>
            </div>
          )}
          {packsLoaded && userPacks.length > 0 && (
            <>
              <div className="epicker-pack-tabs">
                {userPacks.map(pack => (
                  <button
                    key={pack.id}
                    className={`epicker-pack-tab ${stickerPack === pack.id ? 'active' : ''}`}
                    onClick={() => setStickerPack(pack.id)}
                    style={stickerPack === pack.id ? { color: accent, borderColor: accent } : {}}
                    title={pack.name}
                  >
                    {pack.stickers?.[0]
                      ? <img src={pack.stickers[0].image} alt={pack.name} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                      : pack.name.slice(0, 2)
                    }
                  </button>
                ))}
              </div>
              <div className="epicker-sticker-grid">
                {(currentPack?.stickers || []).map(s => (
                  <button key={s.id} className="epicker-sticker" onClick={() => pickSticker(s)}>
                    <img src={s.image} alt="sticker" loading="lazy" />
                  </button>
                ))}
                {currentPack?.stickers?.length === 0 && (
                  <div className="epicker-empty">Пак пустой</div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── GIF TAB ── */}
      {tab === 'gifs' && (
        <>
          <div className="epicker-search">
            <Search size={13} />
            <input
              placeholder="Поиск GIF..."
              value={gifSearch}
              onChange={e => handleGifSearch(e.target.value)}
            />
            {gifSearch && <button onClick={() => { setGifSearch(''); loadGifs(''); }}><X size={12} /></button>}
          </div>
          <div className="epicker-gif-grid">
            {gifsLoading && <div className="epicker-empty">Загрузка...</div>}
            {!gifsLoading && gifs.length === 0 && <div className="epicker-empty">Ничего не найдено</div>}
            {!gifsLoading && gifs.map(gif => (
              <button key={gif.id} className="epicker-gif" onClick={() => pickGif(gif)}>
                <img src={gif.preview} alt={gif.title} loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
