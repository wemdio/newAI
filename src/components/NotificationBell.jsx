import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './NotificationContext';
import './NotificationBell.css';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  
  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    requestNotificationPermission
  } = useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request notification permission on first open
  useEffect(() => {
    if (isOpen) {
      requestNotificationPermission();
    }
  }, [isOpen, requestNotificationPermission]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification.id);
    setIsOpen(false);
    navigate('/messaging');
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
    return date.toLocaleDateString('ru');
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-notifications' : ''}`}
        onClick={handleToggle}
        aria-label={`Уведомления${unreadCount > 0 ? ` (${unreadCount} новых)` : ''}`}
        tabIndex={0}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
        
        {/* Connection indicator */}
        <span className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h3>Уведомления</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-read-btn"
                onClick={markAllAsRead}
              >
                Прочитать все
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <span className="empty-icon">🔔</span>
                <p>Нет уведомлений</p>
                <p className="hint">Новые горячие лиды появятся здесь</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(notification)}
                >
                  <div className="notification-icon">
                    {notification.isNew ? '🔥' : '📬'}
                  </div>
                  
                  <div className="notification-content">
                    <div className="notification-title">
                      {notification.isNew ? (
                        <span>Новый горячий лид</span>
                      ) : (
                        <span>Новое сообщение</span>
                      )}
                      <span className="notification-username">@{notification.username}</span>
                    </div>
                    
                    <div className="notification-preview">
                      {notification.lastMessage ? (
                        <span className="message-preview">"{notification.lastMessage.substring(0, 50)}..."</span>
                      ) : (
                        <span className="campaign-name">{notification.campaignName}</span>
                      )}
                    </div>
                    
                    <div className="notification-meta">
                      <span className="notification-time">{formatTime(notification.updatedAt)}</span>
                      <span className="notification-campaign">{notification.campaignName}</span>
                    </div>
                  </div>

                  {!notification.isRead && (
                    <div className="unread-indicator" />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="notification-footer">
            <button
              className="view-all-btn"
              onClick={() => {
                setIsOpen(false);
                navigate('/messaging');
              }}
            >
              Открыть AI Рассылки →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
