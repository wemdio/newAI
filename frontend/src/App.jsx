import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import supabase from './supabaseClient';
import './App.css';
import './styles/telegram.css';
import Configuration from './pages/Configuration';
import Leads from './pages/Leads';
import Login from './pages/Login';
import { isTelegramWebApp, initTelegram, getTelegramUser, getTelegramInitData } from './utils/telegram';
import axios from 'axios';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('leads');
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    // Check if running in Telegram
    const telegramApp = isTelegramWebApp();
    setIsTelegram(telegramApp);
    
    if (telegramApp) {
      // Initialize Telegram Web App
      initTelegram();
      console.log('Running in Telegram Web App');
      
      // Try auto-login via Telegram
      handleTelegramAuth();
    } else {
      // Regular browser - check Supabase session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      });
    }

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleTelegramAuth = async () => {
    try {
      const telegramUser = getTelegramUser();
      const initData = getTelegramInitData();
      
      if (!telegramUser || !initData) {
        console.error('No Telegram user data available');
        setLoading(false);
        return;
      }

      console.log('Authenticating via Telegram...', telegramUser);

      // Get API base URL
      const apiUrl = window.location.hostname.includes('twc1.net')
        ? 'https://wemdio-newai-87c5.twc1.net/api'
        : 'http://localhost:3000/api';

      // Call backend to create/find user
      const response = await axios.post(`${apiUrl}/auth/telegram`, {
        initData: initData
      });

      if (response.data.success) {
        // Create Supabase session using the virtual email
        const { data, error } = await supabase.auth.signInWithPassword({
          email: response.data.user.email,
          password: `telegram_${telegramUser.id}` // This won't work - need better solution
        });

        if (error) {
          // User exists but we need admin to sign them in
          // For now, just set a mock session
          console.log('Telegram user authenticated', response.data.user);
          setSession({
            user: {
              id: response.data.user.id,
              email: response.data.user.email,
              user_metadata: {
                telegram_id: telegramUser.id,
                telegram_username: telegramUser.username
              }
            }
          });
        } else {
          setSession(data.session);
        }
      }
    } catch (error) {
      console.error('Telegram auth failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
    }

  if (!session) {
    return <Login supabase={supabase} />;
  }

  return (
    <Router>
      <div className={`app ${isTelegram ? 'telegram-mode' : 'browser-mode'}`}>
        {/* Navigation - hidden in Telegram */}
        {!isTelegram && (
          <nav className="app-nav">
            <div className="container">
              <div className="nav-links">
                <Link 
                  to="/" 
                  className={`nav-link ${activeTab === 'leads' ? 'active' : ''}`}
                  onClick={() => setActiveTab('leads')}
                >
                  Лиды
                </Link>
                <Link 
                  to="/config" 
                  className={`nav-link ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => setActiveTab('config')}
                >
                  Настройки
                </Link>
              </div>
              <div className="user-info">
                <span className="user-email">{session.user.email}</span>
                <button onClick={handleSignOut} className="btn-signout">
                  Выйти
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* Telegram Navigation (alternative for Telegram) */}
        {isTelegram && (
          <nav className="telegram-nav">
            <Link 
              to="/" 
              className={`telegram-nav-item ${activeTab === 'leads' ? 'active' : ''}`}
              onClick={() => setActiveTab('leads')}
            >
              Лиды
            </Link>
            <Link 
              to="/config" 
              className={`telegram-nav-item ${activeTab === 'config' ? 'active' : ''}`}
              onClick={() => setActiveTab('config')}
            >
              Настройки
            </Link>
          </nav>
        )}

        {/* Main Content */}
        <main className="app-main">
          <div className="container">
            <Routes>
              <Route path="/" element={<Leads />} />
              <Route path="/config" element={<Configuration />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>

        {/* Footer - hidden in Telegram */}
        {!isTelegram && (
          <footer className="app-footer">
            <div className="container">
              <p>Сканер и анализатор лидов в Telegram © 2025</p>
            </div>
          </footer>
        )}
      </div>
    </Router>
  );
}

export default App;
