import React, { useState, useEffect } from 'react';
import {
  Bell, Mail, Key, Trash2, ChevronRight,
  Eye, EyeOff, Check, AlertTriangle, Shield, User, Sun, Moon, AtSign,
  MessageSquare, Phone, UserPlus,
} from 'lucide-react';

function Toggle({ checked, onChange }) {
  return (
    <button
      className={`toggle ${checked ? 'toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span className="toggle-thumb" />
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="settings-group">
      <p className="settings-group-label">{title}</p>
      <div className="settings-card">{children}</div>
    </div>
  );
}

function SettingRow({ icon, label, desc, right, onClick, danger }) {
  return (
    <button className={`settings-row ${danger ? 'danger' : ''}`} onClick={onClick} type="button">
      <div className="settings-row-left">
        {icon}
        <div>
          <p>{label}</p>
          {desc && <span>{desc}</span>}
        </div>
      </div>
      {right}
    </button>
  );
}

export default function Settings({ user, onUpdate, onLogout }) {
  const token = () => localStorage.getItem('token');

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // loaded settings
  const [notif, setNotif] = useState({ notif_messages: true, notif_mentions: true, notif_updates: true });
  const [privacy, setPrivacy] = useState({
    privacy_show_email: true,
    privacy_public_profile: true,
    privacy_who_can_message: 'friends',
    privacy_who_can_call: 'friends',
    privacy_who_can_add: 'everyone',
    privacy_show_online: true,
  });
  const [loading, setLoading] = useState(true);

  // expanded panels
  const [panel, setPanel] = useState(null); // 'email' | 'password' | 'delete'

  // forms
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [passForm, setPassForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [deleteForm, setDeleteForm] = useState({ password: '' });

  // ui state
  const [showPw, setShowPw] = useState({});
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(d => {
        setNotif({ notif_messages: !!d.notif_messages, notif_mentions: !!d.notif_mentions, notif_updates: !!d.notif_updates });
        setPrivacy({
          privacy_show_email: !!d.privacy_show_email,
          privacy_public_profile: !!d.privacy_public_profile,
          privacy_who_can_message: d.privacy_who_can_message || 'friends',
          privacy_who_can_call: d.privacy_who_can_call || 'friends',
          privacy_who_can_add: d.privacy_who_can_add || 'everyone',
          privacy_show_online: d.privacy_show_online !== 0,
        });
        setLoading(false);
      });
  }, []);

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3500); };

  const saveNotif = async (next) => {
    setNotif(next);
    await fetch('/api/settings/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(next),
    });
    flash('ok', 'Настройки уведомлений сохранены');
  };

  const savePrivacy = async (next) => {
    setPrivacy(next);
    await fetch('/api/settings/privacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(next),
    });
    flash('ok', 'Настройки конфиденциальности сохранены');
  };

  const handleEmailChange = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings/change-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(emailForm),
      });
      const data = await res.json();
      if (!res.ok) return flash('err', data.error);
      onUpdate({ ...user, email: data.email });
      setEmailForm({ email: '', password: '' });
      setPanel(null);
      flash('ok', 'Email успешно изменён');
    } finally { setSaving(false); }
  };

  const handlePasswordChange = async e => {
    e.preventDefault();
    if (passForm.new_password !== passForm.confirm) return flash('err', 'Пароли не совпадают');
    setSaving(true);
    try {
      const res = await fetch('/api/settings/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(passForm),
      });
      const data = await res.json();
      if (!res.ok) return flash('err', data.error);
      setPassForm({ current_password: '', new_password: '', confirm: '' });
      setPanel(null);
      flash('ok', 'Пароль успешно изменён');
    } finally { setSaving(false); }
  };

  const handleDeleteAccount = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(deleteForm),
      });
      const data = await res.json();
      if (!res.ok) return flash('err', data.error);
      onLogout();
    } finally { setSaving(false); }
  };

  const pw = (key) => showPw[key] ? 'text' : 'password';
  const togglePw = (key) => setShowPw(s => ({ ...s, [key]: !s[key] }));

  if (loading) return <div className="settings-loading">Загрузка...</div>;

  return (
    <div className="settings-page">
      <h2 className="settings-title">Настройки</h2>

      {msg && (
        <div className={`settings-flash ${msg.type === 'ok' ? 'flash-ok' : 'flash-err'}`}>
          {msg.type === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
          {msg.text}
        </div>
      )}

      {/* Appearance */}
      <Section title="Внешний вид">
        <SettingRow
          icon={theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          label={theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}
          desc="Переключить оформление"
          right={<Toggle checked={theme === 'light'} onChange={toggleTheme} />}
        />
      </Section>

      {/* Notifications */}
      <Section title="Уведомления">
        <SettingRow
          icon={<Bell size={17} />}
          label="Сообщения"
          desc="Уведомления о новых сообщениях"
          right={<Toggle checked={notif.notif_messages} onChange={v => saveNotif({ ...notif, notif_messages: v })} />}
        />
        <div className="settings-divider" />
        <SettingRow
          icon={<Bell size={17} />}
          label="Упоминания"
          desc="Когда вас упоминают в постах"
          right={<Toggle checked={notif.notif_mentions} onChange={v => saveNotif({ ...notif, notif_mentions: v })} />}
        />
        <div className="settings-divider" />
        <SettingRow
          icon={<Bell size={17} />}
          label="Обновления платформы"
          desc="Новости и обновления RLC"
          right={<Toggle checked={notif.notif_updates} onChange={v => saveNotif({ ...notif, notif_updates: v })} />}
        />
      </Section>

      {/* Privacy */}
      <Section title="Конфиденциальность">
        <SettingRow
          icon={<Eye size={17} />}
          label="Показывать email"
          desc="Другие пользователи видят ваш email"
          right={<Toggle checked={privacy.privacy_show_email} onChange={v => savePrivacy({ ...privacy, privacy_show_email: v })} />}
        />
        <div className="settings-divider" />
        <SettingRow
          icon={<Shield size={17} />}
          label="Открытый профиль"
          desc="Профиль виден всем пользователям"
          right={<Toggle checked={privacy.privacy_public_profile} onChange={v => savePrivacy({ ...privacy, privacy_public_profile: v })} />}
        />
        <div className="settings-divider" />
        <SettingRow
          icon={<Eye size={17} />}
          label="Показывать онлайн-статус"
          desc="Другие видят когда вы онлайн"
          right={<Toggle checked={privacy.privacy_show_online} onChange={v => savePrivacy({ ...privacy, privacy_show_online: v })} />}
        />
        <div className="settings-divider" />
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <MessageSquare size={17} />
            <div>
              <p>Кто может писать мне</p>
              <span>Ограничьте входящие сообщения</span>
            </div>
          </div>
          <select className="privacy-select" value={privacy.privacy_who_can_message}
            onChange={e => savePrivacy({ ...privacy, privacy_who_can_message: e.target.value })}>
            <option value="everyone">Все</option>
            <option value="friends">Только друзья</option>
            <option value="nobody">Никто</option>
          </select>
        </div>
        <div className="settings-divider" />
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <Phone size={17} />
            <div>
              <p>Кто может звонить мне</p>
              <span>Ограничьте входящие звонки</span>
            </div>
          </div>
          <select className="privacy-select" value={privacy.privacy_who_can_call}
            onChange={e => savePrivacy({ ...privacy, privacy_who_can_call: e.target.value })}>
            <option value="everyone">Все</option>
            <option value="friends">Только друзья</option>
            <option value="nobody">Никто</option>
          </select>
        </div>
        <div className="settings-divider" />
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-left">
            <UserPlus size={17} />
            <div>
              <p>Кто может добавлять меня</p>
              <span>В друзья и группы</span>
            </div>
          </div>
          <select className="privacy-select" value={privacy.privacy_who_can_add}
            onChange={e => savePrivacy({ ...privacy, privacy_who_can_add: e.target.value })}>
            <option value="everyone">Все</option>
            <option value="nobody">Никто</option>
          </select>
        </div>
      </Section>

      {/* Account */}
      <Section title="Аккаунт">
        <SettingRow
          icon={<Mail size={17} />}
          label="Изменить email"
          desc={user.email}
          right={<ChevronRight size={16} className="settings-chevron" />}
          onClick={() => setPanel(panel === 'email' ? null : 'email')}
        />
        {panel === 'email' && (
          <form className="settings-inline-form" onSubmit={handleEmailChange}>
            <div className="sif-field">
              <label>Новый email</label>
              <input type="email" value={emailForm.email} placeholder="new@example.com"
                onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="sif-field">
              <label>Текущий пароль</label>
              <div className="sif-pw">
                <input type={pw('ep')} value={emailForm.password} placeholder="Подтвердите паролем"
                  onChange={e => setEmailForm(f => ({ ...f, password: e.target.value }))} required />
                <button type="button" onClick={() => togglePw('ep')}>{showPw.ep ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              </div>
            </div>
            <div className="sif-actions">
              <button type="button" className="sif-cancel" onClick={() => setPanel(null)}>Отмена</button>
              <button type="submit" className="sif-submit" disabled={saving}>Сохранить</button>
            </div>
          </form>
        )}

        <div className="settings-divider" />

        <SettingRow
          icon={<Key size={17} />}
          label="Изменить пароль"
          desc="Последнее изменение неизвестно"
          right={<ChevronRight size={16} className="settings-chevron" />}
          onClick={() => setPanel(panel === 'password' ? null : 'password')}
        />
        {panel === 'password' && (
          <form className="settings-inline-form" onSubmit={handlePasswordChange}>
            <div className="sif-field">
              <label>Текущий пароль</label>
              <div className="sif-pw">
                <input type={pw('cp')} value={passForm.current_password} placeholder="••••••••"
                  onChange={e => setPassForm(f => ({ ...f, current_password: e.target.value }))} required />
                <button type="button" onClick={() => togglePw('cp')}>{showPw.cp ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              </div>
            </div>
            <div className="sif-field">
              <label>Новый пароль</label>
              <div className="sif-pw">
                <input type={pw('np')} value={passForm.new_password} placeholder="Минимум 6 символов"
                  onChange={e => setPassForm(f => ({ ...f, new_password: e.target.value }))} required />
                <button type="button" onClick={() => togglePw('np')}>{showPw.np ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              </div>
            </div>
            <div className="sif-field">
              <label>Повторите пароль</label>
              <div className="sif-pw">
                <input type={pw('rp')} value={passForm.confirm} placeholder="••••••••"
                  onChange={e => setPassForm(f => ({ ...f, confirm: e.target.value }))} required />
                <button type="button" onClick={() => togglePw('rp')}>{showPw.rp ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              </div>
            </div>
            <div className="sif-actions">
              <button type="button" className="sif-cancel" onClick={() => setPanel(null)}>Отмена</button>
              <button type="submit" className="sif-submit" disabled={saving}>Сохранить</button>
            </div>
          </form>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Опасная зона">
        <SettingRow
          icon={<User size={17} />}
          label="Выйти из аккаунта"
          desc="Завершить текущую сессию"
          right={<ChevronRight size={16} className="settings-chevron" />}
          onClick={onLogout}
          danger
        />
        <div className="settings-divider" />
        <SettingRow
          icon={<Trash2 size={17} />}
          label="Удалить аккаунт"
          desc="Все данные будут удалены безвозвратно"
          right={<ChevronRight size={16} className="settings-chevron" />}
          onClick={() => setPanel(panel === 'delete' ? null : 'delete')}
          danger
        />
        {panel === 'delete' && (
          <form className="settings-inline-form settings-inline-form--danger" onSubmit={handleDeleteAccount}>
            <div className="sif-warning">
              <AlertTriangle size={16} />
              Это действие необратимо. Все ваши данные, посты и настройки будут удалены навсегда.
            </div>
            <div className="sif-field">
              <label>Введите пароль для подтверждения</label>
              <div className="sif-pw">
                <input type={pw('dp')} value={deleteForm.password} placeholder="Ваш пароль"
                  onChange={e => setDeleteForm({ password: e.target.value })} required />
                <button type="button" onClick={() => togglePw('dp')}>{showPw.dp ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
              </div>
            </div>
            <div className="sif-actions">
              <button type="button" className="sif-cancel" onClick={() => setPanel(null)}>Отмена</button>
              <button type="submit" className="sif-submit sif-submit--danger" disabled={saving}>Удалить аккаунт</button>
            </div>
          </form>
        )}
      </Section>

      <p className="settings-version">RLC v1.0.0</p>
    </div>
  );
}
