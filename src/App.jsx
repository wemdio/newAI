import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import supabase from './supabaseClient';
import './App.css';
import './styles/telegram.css';
import { isTelegramWebApp, initTelegram, getTelegramUser, getTelegramInitData } from './utils/telegram';
import axios from 'axios';
import { NotificationProvider } from './components/NotificationContext';
import NotificationBell from './components/NotificationBell';

// Lazy load pages
const Configuration = React.lazy(() => import('./pages/Configuration'));
const Leads = React.lazy(() => import('./pages/Leads'));
const Login = React.lazy(() => import('./pages/Login'));
const AIMessaging = React.lazy(() => import('./pages/AIMessaging'));
const LeadAudit = React.lazy(() => import('./pages/LeadAudit'));
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const Contacts = React.lazy(() => import('./pages/Contacts'));
const Outreach = React.lazy(() => import('./pages/Outreach'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));

const LoadingSpinner = () => (
  <div className="app loading-screen">
    <div className="loading-spinner"></div>
    <p>Загрузка...</p>
  </div>
);

const METRIKA_COUNTERS = [105579261, 106370874];

const trackMetrikaHit = (url) => {
  if (typeof window === 'undefined' || !window.ym) return;
  METRIKA_COUNTERS.forEach((id) => {
    window.ym(id, 'hit', url);
  });
};

const MetrikaTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const url = `${location.pathname}${location.search}${location.hash}`;
    trackMetrikaHit(url);
  }, [location.pathname, location.search, location.hash]);

  return null;
};

// Component for the authenticated application layout
const AuthenticatedApp = ({ session, isTelegram, handleSignOut, activeTab, setActiveTab }) => {
  const userId = session?.user?.id;
  
  return (
    <NotificationProvider userId={userId}>
      <div className={`app ${isTelegram ? 'telegram-mode' : 'browser-mode'}`}>
        {/* Navigation - hidden in Telegram */}
        {!isTelegram && (
          <nav className="app-nav">
            <div className="container">
              <div className="nav-links">
                <Link 
                  to="/leads" 
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
                  to="/outreach" 
                  className={`nav-link ${activeTab === 'outreach' ? 'active' : ''}`}
                  onClick={() => setActiveTab('outreach')}
                >
                  Аутрич
                </Link>
                <Link 
                  to="/contacts" 
                  className={`nav-link ${activeTab === 'contacts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('contacts')}
                >
                  Контакты
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
                <NotificationBell />
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
            <div className="telegram-nav-main">
              <Link 
                to="/leads" 
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
                to="/outreach" 
                className={`telegram-nav-item ${activeTab === 'outreach' ? 'active' : ''}`}
                onClick={() => setActiveTab('outreach')}
              >
                Аутрич
              </Link>
              <Link 
                to="/contacts" 
                className={`telegram-nav-item ${activeTab === 'contacts' ? 'active' : ''}`}
                onClick={() => setActiveTab('contacts')}
              >
                Контакты
              </Link>
              <Link 
                to="/config" 
                className={`telegram-nav-item ${activeTab === 'config' ? 'active' : ''}`}
                onClick={() => setActiveTab('config')}
              >
                Настройки
              </Link>
            </div>
            <div className="telegram-nav-notifications">
              <NotificationBell />
            </div>
          </nav>
        )}

        {/* Main Content */}
        <main className="app-main">
          <div className="container">
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/leads" element={<Leads />} />
                <Route path="/config" element={<Configuration />} />
                <Route path="/messaging" element={<AIMessaging />} />
                <Route path="/outreach" element={<Outreach />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/audit" element={<LeadAudit />} />
                <Route path="*" element={<Navigate to="/leads" replace />} />
              </Routes>
            </Suspense>
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
    </NotificationProvider>
  );
};

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
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Supabase signOut error (continuing to local cleanup):', error);
      }
    } catch (error) {
      console.error('Unexpected error during signOut:', error);
    } finally {
      // Aggressively clear all Supabase-related items from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      // Also clear any session storage
      sessionStorage.clear();
      
      setSession(null);
      
      if (!isTelegram) {
        // Force reload to ensure clean state
        window.location.href = '/';
      }
    }
  };

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  // Telegram Loading Screen (authenticated but waiting for session)
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
      <MetrikaTracker />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={
             !session && !isTelegram ? <LandingPage /> : <Navigate to="/leads" replace />
          } />
          
          <Route path="/login" element={
             !session && !isTelegram ? <Login supabase={supabase} /> : <Navigate to="/leads" replace />
          } />

          <Route path="/privacy-policy" element={<PrivacyPolicy />} />

          {/* Protected Routes */}
          <Route path="/*" element={
             session || isTelegram ? (
               <AuthenticatedApp 
                 session={session} 
                 isTelegram={isTelegram} 
                 handleSignOut={handleSignOut} 
                 activeTab={activeTab} 
                 setActiveTab={setActiveTab} 
               />
             ) : (
               <Navigate to="/login" replace />
             )
          } />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
