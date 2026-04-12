# Примеры использования Auth API на клиенте

## Axios interceptor для автоматического обновления токенов

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  withCredentials: true, // Важно для cookies
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor для автоматического refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Если 401 и это не повторный запрос
    if (error.response?.status === 401 && !originalRequest._retry) {
      
      // Если токен истёк
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          // Добавляем запрос в очередь
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(token => {
              originalRequest.headers['Authorization'] = 'Bearer ' + token;
              return api(originalRequest);
            })
            .catch(err => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStorage.getItem('refreshToken');
          const { data } = await api.post('/auth/refresh', { refreshToken });
          
          const newAccessToken = data.accessToken;
          localStorage.setItem('accessToken', newAccessToken);
          
          api.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
          originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;
          
          processQueue(null, newAccessToken);
          
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          
          // Refresh token тоже истёк - редирект на логин
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

## React Context для аутентификации

```javascript
import React, { createContext, useState, useEffect, useContext } from 'react';
import api from './api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверяем токен при загрузке
    const token = localStorage.getItem('accessToken');
    if (token) {
      verifyToken();
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async () => {
    try {
      const { data } = await api.get('/auth/verify');
      setUser(data.user);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, rememberMe = false) => {
    const { data } = await api.post('/auth/login', { email, password, rememberMe });
    
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    
    api.defaults.headers.common['Authorization'] = 'Bearer ' + data.accessToken;
    
    setUser(data.user);
    return data;
  };

  const register = async (username, email, password) => {
    await api.post('/auth/register', { username, email, password });
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { refreshToken });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  const logoutAll = async () => {
    try {
      await api.post('/auth/logout-all');
    } catch (error) {
      console.error('Logout all error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  };

  const getSessions = async () => {
    const { data } = await api.get('/auth/sessions');
    return data.sessions;
  };

  const getLoginHistory = async () => {
    const { data } = await api.get('/auth/login-history');
    return data.history;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        logoutAll,
        getSessions,
        getLoginHistory,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isModerator: user?.roles?.includes('moderator') || user?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

## Компонент Login

```javascript
import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err) {
      const errorData = err.response?.data;
      
      // Обработка специальных кодов ошибок
      if (errorData?.code === 'ACCOUNT_LOCKED') {
        setError('Аккаунт временно заблокирован из-за множественных неудачных попыток входа');
      } else if (errorData?.code === 'ACCOUNT_BANNED') {
        setError(errorData.error);
      } else {
        setError(errorData?.error || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Вход</h2>
      
      {error && <div className="error">{error}</div>}
      
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      
      <label>
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        Запомнить меня (30 дней)
      </label>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Вход...' : 'Войти'}
      </button>
    </form>
  );
};

export default Login;
```

## Компонент Sessions (управление сессиями)

```javascript
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getSessions, logoutAll } = useAuth();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    if (confirm('Выйти со всех устройств?')) {
      await logoutAll();
      window.location.href = '/login';
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div>
      <h2>Активные сессии</h2>
      
      <button onClick={handleLogoutAll} className="danger">
        Выйти со всех устройств
      </button>
      
      <div className="sessions-list">
        {sessions.map(session => (
          <div key={session.id} className="session-card">
            <div className="device">{session.device_info}</div>
            <div className="ip">IP: {session.ip_address}</div>
            <div className="time">
              Создана: {new Date(session.created_at).toLocaleString()}
            </div>
            <div className="time">
              Последняя активность: {new Date(session.last_used_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sessions;
```

## Protected Route

```javascript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ProtectedRoute = ({ children, requireAdmin = false, requireVerified = false }) => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return <div>Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" />;
  }

  if (requireVerified && !user.verified) {
    return <Navigate to="/verify-email" />;
  }

  return children;
};

export default ProtectedRoute;
```

## Использование в App.jsx

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Login from './Login';
import Register from './Register';
import Dashboard from './Dashboard';
import AdminPanel from './AdminPanel';
import Sessions from './Sessions';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/sessions"
            element={
              <ProtectedRoute>
                <Sessions />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPanel />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
```

## Обработка ошибок

```javascript
// Глобальный обработчик ошибок
api.interceptors.response.use(
  response => response,
  error => {
    const errorData = error.response?.data;
    
    switch (errorData?.code) {
      case 'TOKEN_EXPIRED':
        // Обрабатывается автоматически в interceptor
        break;
        
      case 'ACCOUNT_LOCKED':
        alert('Аккаунт временно заблокирован. Попробуйте позже.');
        break;
        
      case 'ACCOUNT_BANNED':
        alert('Ваш аккаунт заблокирован: ' + errorData.error);
        localStorage.clear();
        window.location.href = '/login';
        break;
        
      case 'EMAIL_NOT_VERIFIED':
        window.location.href = '/verify-email';
        break;
        
      default:
        // Обычная обработка ошибок
    }
    
    return Promise.reject(error);
  }
);
```
