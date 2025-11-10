/**
 * Telegram Web App utilities
 * Handles integration with Telegram Mini App
 */

/**
 * Check if running inside Telegram Web App
 * More reliable check - not just SDK presence, but actual Telegram context
 */
export const isTelegramWebApp = () => {
  if (typeof window === 'undefined') return false;
  
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  
  // Check if we have actual init data from Telegram
  // If initData is empty or initDataUnsafe is empty, we're not in Telegram
  const hasInitData = !!(tg.initData && tg.initData.length > 0);
  const hasUser = !!(tg.initDataUnsafe && tg.initDataUnsafe.user);
  
  // Also check for platform - real Telegram always has platform
  const hasPlatform = !!(tg.platform && tg.platform !== 'unknown');
  
  console.log('🔍 Telegram detection:', {
    hasTelegramObject: !!tg,
    hasInitData,
    hasUser,
    hasPlatform,
    initDataLength: tg.initData?.length || 0,
    platform: tg.platform || 'none',
    version: tg.version || 'none'
  });
  
  // We're in Telegram only if we have init data or user data
  // BUT if we're opening from URL directly (not via bot), we won't have data
  // So check platform as fallback
  return hasInitData || hasUser || hasPlatform;
};

/**
 * Get Telegram Web App instance
 */
export const getTelegramWebApp = () => {
  if (!isTelegramWebApp()) {
    return null;
  }
  return window.Telegram.WebApp;
};

/**
 * Initialize Telegram Web App
 */
export const initTelegram = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    console.log('Not running in Telegram Web App');
    return null;
  }

  try {
    // Expand to full height
    tg.expand();
    
    // Set theme colors
    tg.setHeaderColor('#0a0a0a');
    tg.setBackgroundColor('#0a0a0a');
    
    // Enable closing confirmation
    tg.enableClosingConfirmation();
    
    // Tell Telegram that the app is ready
    tg.ready();
    
    console.log('Telegram Web App initialized', {
      version: tg.version,
      platform: tg.platform,
      colorScheme: tg.colorScheme
    });
    
    return tg;
  } catch (error) {
    console.error('Failed to initialize Telegram Web App', error);
    return null;
  }
};

/**
 * Get Telegram user data
 */
export const getTelegramUser = () => {
  const tg = getTelegramWebApp();
  
  if (!tg || !tg.initDataUnsafe?.user) {
    return null;
  }
  
  return {
    id: tg.initDataUnsafe.user.id,
    firstName: tg.initDataUnsafe.user.first_name,
    lastName: tg.initDataUnsafe.user.last_name,
    username: tg.initDataUnsafe.user.username,
    languageCode: tg.initDataUnsafe.user.language_code,
    isPremium: tg.initDataUnsafe.user.is_premium,
    photoUrl: tg.initDataUnsafe.user.photo_url
  };
};

/**
 * Get Telegram init data for backend verification
 */
export const getTelegramInitData = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    return null;
  }
  
  return tg.initData;
};

/**
 * Show Telegram main button
 */
export const showMainButton = (text, onClick) => {
  const tg = getTelegramWebApp();
  
  if (!tg) return;
  
  tg.MainButton.setText(text);
  tg.MainButton.show();
  tg.MainButton.onClick(onClick);
};

/**
 * Hide Telegram main button
 */
export const hideMainButton = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) return;
  
  tg.MainButton.hide();
};

/**
 * Show Telegram back button
 */
export const showBackButton = (onClick) => {
  const tg = getTelegramWebApp();
  
  if (!tg) return;
  
  tg.BackButton.show();
  tg.BackButton.onClick(onClick);
};

/**
 * Hide Telegram back button
 */
export const hideBackButton = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) return;
  
  tg.BackButton.hide();
};

/**
 * Show alert in Telegram
 */
export const showAlert = (message) => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    alert(message);
    return;
  }
  
  tg.showAlert(message);
};

/**
 * Show confirm dialog in Telegram
 */
export const showConfirm = (message, callback) => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    const result = confirm(message);
    callback(result);
    return;
  }
  
  tg.showConfirm(message, callback);
};

/**
 * Open link in Telegram
 */
export const openLink = (url) => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    window.open(url, '_blank');
    return;
  }
  
  tg.openLink(url);
};

/**
 * Open Telegram link
 */
export const openTelegramLink = (url) => {
  const tg = getTelegramWebApp();
  
  if (!tg) {
    window.open(url, '_blank');
    return;
  }
  
  tg.openTelegramLink(url);
};

/**
 * Close Telegram Web App
 */
export const closeTelegramApp = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) return;
  
  tg.close();
};

/**
 * Haptic feedback
 */
export const hapticFeedback = (type = 'impact', style = 'medium') => {
  const tg = getTelegramWebApp();
  
  if (!tg || !tg.HapticFeedback) return;
  
  if (type === 'impact') {
    tg.HapticFeedback.impactOccurred(style); // light, medium, heavy, rigid, soft
  } else if (type === 'notification') {
    tg.HapticFeedback.notificationOccurred(style); // error, success, warning
  } else if (type === 'selection') {
    tg.HapticFeedback.selectionChanged();
  }
};

/**
 * Get Telegram theme colors
 */
export const getTelegramTheme = () => {
  const tg = getTelegramWebApp();
  
  if (!tg) return null;
  
  return {
    colorScheme: tg.colorScheme, // light or dark
    themeParams: tg.themeParams,
    backgroundColor: tg.themeParams.bg_color,
    textColor: tg.themeParams.text_color,
    hintColor: tg.themeParams.hint_color,
    linkColor: tg.themeParams.link_color,
    buttonColor: tg.themeParams.button_color,
    buttonTextColor: tg.themeParams.button_text_color
  };
};

export default {
  isTelegramWebApp,
  getTelegramWebApp,
  initTelegram,
  getTelegramUser,
  getTelegramInitData,
  showMainButton,
  hideMainButton,
  showBackButton,
  hideBackButton,
  showAlert,
  showConfirm,
  openLink,
  openTelegramLink,
  closeTelegramApp,
  hapticFeedback,
  getTelegramTheme
};

