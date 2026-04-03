import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, UserPlus, MessageCircle, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPass, setShowPass] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
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
          <div className="auth-logo-icon">
            <MessageCircle size={22} />
          </div>
          <span>RLC</span>
        </div>

        <h2 className="auth-title">Создать аккаунт</h2>
        <p className="auth-subtitle">Присоединяйтесь к нам</p>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={15} />
            {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            <CheckCircle size={15} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><User size={13} /> Имя пользователя</label>
            <div className="input-wrapper">
              <User size={16} />
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="username"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label><Mail size={13} /> Email</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label><Lock size={13} /> Пароль</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
              <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-submit">
            <UserPlus size={17} />
            Создать аккаунт
          </button>
        </form>

        <div className="auth-divider">или</div>

        <p className="auth-link">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
