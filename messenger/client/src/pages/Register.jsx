import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, UserPlus, MessageCircle, Eye, EyeOff, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

// Generate simple math captcha
function generateCaptcha() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b;
  if (op === '+') { a = Math.floor(Math.random() * 20) + 1; b = Math.floor(Math.random() * 20) + 1; }
  else if (op === '-') { a = Math.floor(Math.random() * 20) + 10; b = Math.floor(Math.random() * a) + 1; }
  else { a = Math.floor(Math.random() * 9) + 2; b = Math.floor(Math.random() * 9) + 2; }
  return { question: `${a} ${op} ${b}`, answer: op === '+' ? a + b : op === '-' ? a - b : a * b };
}

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [captcha, setCaptcha] = useState(() => generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');
  const [discordToken, setDiscordToken] = useState(null);
  const [discordUser, setDiscordUser] = useState(null);
  const [discordLoading, setDiscordLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle Discord OAuth callback params
  useEffect(() => {
    const dt = searchParams.get('discord_token');
    const du = searchParams.get('discord_username');
    const de = searchParams.get('discord_email');
    const da = searchParams.get('discord_avatar');
    if (dt) {
      setDiscordToken(dt);
      setDiscordUser({ username: du, email: de, avatar: da });
      if (de) setForm(f => ({ ...f, email: de }));
      // Clean URL
      window.history.replaceState({}, '', '/register');
    }
    const err = searchParams.get('error');
    if (err) setError('Ошибка авторизации через Discord. Попробуйте снова.');
  }, []);

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  };

  const handleDiscordLogin = () => {
    setDiscordLoading(true);
    window.location.href = '/api/auth/discord?mode=register';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!captchaInput.trim()) return setError('Введите ответ на капчу');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          captchaQuestion: captcha.question,
          captchaAnswer: captchaInput,
          discordToken: discordToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        refreshCaptcha();
        return setError(data.error);
      }
      setSuccess('Аккаунт создан! Перенаправляем...');
      setTimeout(() => navigate('/login'), 1500);
    } catch {
      setError('Ошибка соединения с сервером');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon"><MessageCircle size={22} /></div>
          <span>RLC</span>
        </div>

        <h2 className="auth-title">Создать аккаунт</h2>
        <p className="auth-subtitle">Присоединяйтесь к нам</p>

        {error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}
        {success && <div className="alert alert-success"><CheckCircle size={15} />{success}</div>}

        {/* Discord verification status */}
        {discordUser ? (
          <div className="discord-verified-badge">
            {discordUser.avatar && <img src={discordUser.avatar} alt="discord" className="discord-avatar" />}
            <div>
              <span className="discord-verified-label">✓ Discord подтверждён</span>
              <span className="discord-verified-name">@{discordUser.username}</span>
            </div>
            <button className="discord-remove-btn" onClick={() => { setDiscordToken(null); setDiscordUser(null); }} title="Отвязать">×</button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-discord"
            onClick={handleDiscordLogin}
            disabled={discordLoading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            {discordLoading ? 'Перенаправление...' : 'Подтвердить через Discord'}
          </button>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><User size={13} /> Имя пользователя</label>
            <div className="input-wrapper">
              <User size={16} />
              <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="username" required />
            </div>
          </div>

          <div className="form-group">
            <label><Mail size={13} /> Email</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
            </div>
          </div>

          <div className="form-group">
            <label><Lock size={13} /> Пароль</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Минимум 8 символов" required />
              <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Math captcha */}
          <div className="form-group">
            <label>Капча — сколько будет?</label>
            <div className="captcha-row">
              <div className="captcha-question">{captcha.question} = ?</div>
              <div className="input-wrapper captcha-input-wrap">
                <input
                  type="number"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  placeholder="Ответ"
                  required
                />
              </div>
              <button type="button" className="captcha-refresh" onClick={refreshCaptcha} title="Новая капча">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn-submit">
            <UserPlus size={17} />
            Создать аккаунт
          </button>
        </form>

        <div className="auth-divider">или</div>
        <p className="auth-link">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </div>
    </div>
  );
}
