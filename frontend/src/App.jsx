import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import './App.css';
import Configuration from './pages/Configuration';
import Leads from './pages/Leads';
import { getUserId, setUserId } from './services/api';

function App() {
  const [userId, setUserIdState] = useState(getUserId());
  const [activeTab, setActiveTab] = useState('leads');

  useEffect(() => {
    // If no user ID, generate a temporary one
    if (!userId) {
      const tempId = '00000000-0000-0000-0000-000000000001'; // Default test user ID
      setUserId(tempId);
      setUserIdState(tempId);
    }
  }, [userId]);

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
              <span className="user-id">User: {userId?.slice(0, 8)}...</span>
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
