import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import SetupProfile from './pages/SetupProfile';
import Profile from './pages/Profile';
import { wsConnect, wsDisconnect } from './hooks/useWebSocket';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // Apply saved theme on mount
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // Load profile_music from server on startup (not stored in localStorage)
  // Also handles 401 — auto logout if token is invalid
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) { handleLogout(); return; }
    fetch('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(data => {
        if (data && data.profile_music !== undefined) {
          setUser(prev => prev ? { ...prev, profile_music: data.profile_music, animated_name: data.animated_name } : prev);
        }
      })
      .catch(() => {});
  }, []);

  // Connect WS as soon as we have a user/token
  useEffect(() => {
    if (user && localStorage.getItem('token')) {
      wsConnect();
    }
    return () => {};
  }, [user]);

  const handleLogin = (userData) => {
    // Don't store large base64 fields in localStorage
    const forStorage = { ...userData };
    if (forStorage.profile_music && forStorage.profile_music.startsWith('data:')) {
      delete forStorage.profile_music;
    }
    localStorage.setItem('user', JSON.stringify(forStorage));
    setUser(userData);
    // Connect immediately after login
    setTimeout(wsConnect, 100);
  };

  const handleUpdate = (updatedUser) => {
    // Don't store large base64 fields in localStorage (quota limit ~5MB)
    const forStorage = { ...updatedUser };
    if (forStorage.profile_music && forStorage.profile_music.startsWith('data:')) {
      delete forStorage.profile_music;
    }
    localStorage.setItem('user', JSON.stringify(forStorage));
    setUser(updatedUser); // keep full data in memory
  };

  const handleSetupComplete = (updatedUser) => {
    if (updatedUser) handleUpdate(updatedUser);
  };

  const handleLogout = () => {
    wsDisconnect();
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <Routes>
      <Route path="/login"    element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/profile" />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/profile" />} />
      <Route
        path="/setup"
        element={user ? <SetupProfile onComplete={handleSetupComplete} /> : <Navigate to="/login" />}
      />
      <Route
        path="/profile"
        element={
          user
            ? <Profile user={user} onUpdate={handleUpdate} onLogout={handleLogout} />
            : <Navigate to="/login" />
        }
      />
      <Route
        path="/profile/:username"
        element={
          user
            ? <Profile user={user} onUpdate={handleUpdate} onLogout={handleLogout} />
            : <Navigate to="/login" />
        }
      />
      <Route path="*" element={<Navigate to={user ? '/profile' : '/login'} />} />
    </Routes>
  );
}
