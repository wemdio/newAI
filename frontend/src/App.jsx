import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import './App.css';
import Configuration from './pages/Configuration';
import Leads from './pages/Leads';
import Login from './pages/Login';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://liavhyhyzqadilfmicba.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpYXZoeWh5enFhZGlsZm1pY2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODQ1NzIsImV4cCI6MjA3NzE2MDU3Mn0.tlqzG7LygCEKPtFIiXxChqef4JNMaXqj69ygLww1GQM'
);

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('leads');

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      <div className="app">
        {/* Header */}
        <header className="app-header">
          <div className="container">
            <h1>Telegram Lead Scanner</h1>
            <p className="subtitle">AI-Powered Lead Detection</p>
          </div>
        </header>

        {/* Navigation */}
        <nav className="app-nav">
          <div className="container">
            <div className="nav-links">
              <Link 
                to="/" 
                className={`nav-link ${activeTab === 'leads' ? 'active' : ''}`}
                onClick={() => setActiveTab('leads')}
              >
                Leads
              </Link>
              <Link 
                to="/config" 
                className={`nav-link ${activeTab === 'config' ? 'active' : ''}`}
                onClick={() => setActiveTab('config')}
              >
                Configuration
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

        {/* Footer */}
        <footer className="app-footer">
          <div className="container">
            <p>Telegram Lead Scanner & Analyzer © 2025</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
