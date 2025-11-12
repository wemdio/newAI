import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import supabase from './supabaseClient';
import './App.css';
import './styles/telegram.css';
import Configuration from './pages/Configuration';
import Leads from './pages/Leads';
import Login from './pages/Login';
import AIMessaging from './pages/AIMessaging';
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
    const tg = window.Telegram?.WebApp;
    
    console.log('🔍 Context check:', {
      isTelegram: telegramApp,
      hasTelegramWebApp: !!tg,
      hostname: window.location.hostname,
      // Detailed Telegram info
      telegramVersion: tg?.version || 'none',
      platform: tg?.platform || 'none',
      initData: tg?.initData ? `${tg.initData.substring(0, 50)}...` : 'empty',
      initDataLength: tg?.initData?.length || 0,
      hasUser: !!(tg?.initDataUnsafe?.user),
      userId: tg?.initDataUnsafe?.user?.id || 'none',
      colorScheme: tg?.colorScheme || 'none'
    });
    
    setIsTelegram(telegramApp);
    
    if (telegramApp) {
      // Initialize Telegram Web App
      const tg = initTelegram();
      console.log('📱 Running in Telegram Web App', tg);
      
      // Try auto-login via Telegram
      handleTelegramAuth();
    } else {
      // Regular browser - check Supabase session
      console.log('🌐 Running in regular browser');
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
        console.error('❌ No Telegram user data available');
        console.log('telegramUser:', telegramUser);
        console.log('initData:', initData);
        console.error('⚠️ Telegram opened but no user data provided');
        console.log('💡 Opening via Menu Button instead of Web App button');
        console.log('📋 Falling back to email/password login in 2 seconds...');
        
        // Fall back to regular login after 2 seconds
        setTimeout(() => {
          setIsTelegram(false); // Switch to browser mode
          setLoading(false);
        }, 2000);
        return;
      }

      console.log('🔐 Authenticating via Telegram...', telegramUser);

      // Get API base URL
      const apiUrl = (
        window.location.hostname === 'telegram-scanner.ru' ||
        window.location.hostname.includes('twc1.net')
      )
        ? 'https://wemdio-newai-87c5.twc1.net/api'
        : 'http://localhost:3000/api';

      // Call backend to create/find user
      const response = await axios.post(`${apiUrl}/auth/telegram`, {
        initData: initData
      });

      if (response.data.success) {
        const userData = response.data.user;
        
        // Sign in using the email and password from backend
        if (userData.password) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: userData.email,
            password: userData.password
          });

          if (error) {
            console.error('Supabase sign in failed:', error);
            // Fallback to mock session
            setSession({
              user: {
                id: userData.id,
                email: userData.email,
                user_metadata: {
                  telegram_id: telegramUser.id,
                  telegram_username: telegramUser.username,
                  telegram_first_name: telegramUser.first_name
                }
              }
            });
          } else {
            console.log('✅ Telegram user signed in successfully');
            setSession(data.session);
          }
        } else {
          // No password - use mock session
          console.log('No password available, using mock session');
          setSession({
            user: {
              id: userData.id,
              email: userData.email,
              user_metadata: {
                telegram_id: telegramUser.id,
                telegram_username: telegramUser.username,
                telegram_first_name: telegramUser.first_name
              }
            }
          });
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

  // Show login for browser users (not Telegram)
  if (!session && !isTelegram) {
    return <Login supabase={supabase} />;
  }

  // Show loading if in Telegram but not authenticated yet
  if (!session && isTelegram) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner"></div>
        <p>Аутентификация через Telegram...</p>
        <div style={{ marginTop: '20px', padding: '0 20px', textAlign: 'left', maxWidth: '400px', margin: '20px auto' }}>
          <p style={{ fontSize: '14px', color: '#ff9800', marginBottom: '10px' }}>
            ⚠️ Загрузка долгая?
          </p>
          <p style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.6' }}>
            <strong>Для авто-входа через Telegram:</strong><br/>
            1. Напишите боту <strong>/start</strong><br/>
            2. Нажмите кнопку <strong>"🚀 Открыть Lead Scanner"</strong>
          </p>
          <p style={{ fontSize: '12px', color: '#888', marginTop: '15px', fontStyle: 'italic' }}>
            Если открыли через Menu Button - сейчас откроется форма входа
          </p>
        </div>
      </div>
    );
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
                  to="/messaging" 
                  className={`nav-link ${activeTab === 'messaging' ? 'active' : ''}`}
                  onClick={() => setActiveTab('messaging')}
                >
                  AI Рассылки
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
              to="/messaging" 
              className={`telegram-nav-item ${activeTab === 'messaging' ? 'active' : ''}`}
              onClick={() => setActiveTab('messaging')}
            >
              AI Рассылки
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
              <Route path="/messaging" element={<AIMessaging />} />
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
