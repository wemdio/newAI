import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../supabaseClient';

const NotificationContext = createContext(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children, userId }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Load initial unread notifications
  const loadNotifications = useCallback(async () => {
    if (!userId) return;

    try {
      // Get hot_leads updated in last 24h that haven't been viewed
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('hot_leads')
        .select(`
          id,
          conversation_id,
          created_at,
          updated_at,
          conversation_history,
          contact_info,
          viewed_at,
          messaging_campaigns!inner(user_id, name),
          ai_conversations!inner(peer_username, peer_user_id)
        `)
        .eq('messaging_campaigns.user_id', userId)
        .gte('updated_at', twentyFourHoursAgo)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      // Transform data for notifications
      const notifs = (data || []).map(hl => ({
        id: hl.id,
        conversationId: hl.conversation_id,
        username: hl.ai_conversations?.peer_username || hl.contact_info?.username || 'Unknown',
        campaignName: hl.messaging_campaigns?.name || 'Campaign',
        createdAt: hl.created_at,
        updatedAt: hl.updated_at,
        isNew: hl.created_at === hl.updated_at,
        isRead: !!hl.viewed_at,
        messageCount: hl.conversation_history?.length || 0,
        lastMessage: getLastUserMessage(hl.conversation_history)
      }));

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.isRead).length);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [userId]);

  // Get last message from user in conversation
  const getLastUserMessage = (history) => {
    if (!history || !Array.isArray(history)) return '';
    const userMessages = history.filter(m => m.role === 'user');
    const lastMsg = userMessages[userMessages.length - 1];
    return lastMsg?.content?.substring(0, 100) || '';
  };

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return;

    loadNotifications();

    // Subscribe to hot_leads changes
    const channel = supabase
      .channel('hot_leads_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hot_leads'
        },
        async (payload) => {
          console.log('🔔 Hot lead change:', payload.eventType, payload);

          // Reload notifications on any change
          await loadNotifications();

          // Play notification sound for new/updated entries
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            playNotificationSound();
            showBrowserNotification(payload);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Notification subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);

  // Play notification sound
  const playNotificationSound = () => {
    try {
      // Create a simple beep using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log('Could not play notification sound:', e);
    }
  };

  // Show browser notification
  const showBrowserNotification = async (payload) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const isNew = payload.eventType === 'INSERT';
      const title = isNew
        ? '🔥 Новый горячий лид!'
        : '📬 Новое сообщение от горячего лида';

      new Notification(title, {
        body: 'Проверьте раздел AI Рассылки',
        icon: '/favicon.svg',
        tag: 'hot-lead-notification',
        renotify: true
      });
    }
  };

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await supabase
        .from('hot_leads')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', notificationId);

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length === 0) return;

    try {
      await supabase
        .from('hot_leads')
        .update({ viewed_at: new Date().toISOString() })
        .in('id', unreadIds);

      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, [notifications]);

  // Request browser notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const value = {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    requestNotificationPermission,
    refresh: loadNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
