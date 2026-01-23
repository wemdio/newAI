const SPAM_KEYWORDS = [
  'казино',
  'casino',
  'бет',
  'bet',
  'ставки',
  'ставка',
  'крипто',
  'crypto',
  'airdrop',
  'нфт',
  'nft',
  'giveaway',
  'розыгрыш',
  'лотерея',
  'free',
  'бесплат',
  'бонус',
  'sale',
  'скидк',
  'promo',
  'промо',
  'подписывайся',
  'подпишись',
  'заработок',
  'доход',
  'инвест',
  'forex',
  'adult',
  'porn',
  'секс'
];

const USERNAME_SPAM_HINTS = [
  'casino',
  'bet',
  'betting',
  'crypto',
  'airdrop',
  'nft',
  'promo',
  'sale',
  'shop',
  'store',
  'bonus',
  'free',
  'xxx',
  'adult'
];

const LINK_REGEX = /(https?:\/\/|t\.me\/|tg:\/\/|bit\.ly\/|tinyurl\.com\/|wa\.me\/)/gi;

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeUsername = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  return raw.replace(/^@/, '').toLowerCase();
};

const countLinks = (text) => {
  if (!text) return 0;
  const matches = text.match(LINK_REGEX);
  return matches ? matches.length : 0;
};

const containsSpamKeywords = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SPAM_KEYWORDS.some((kw) => lower.includes(kw));
};

const usernameLooksBot = (username) => {
  if (!username) return false;
  return username.endsWith('bot') || username.endsWith('бот') || username.includes('_bot_');
};

const usernameLooksSpammy = (username) => {
  if (!username) return false;
  return USERNAME_SPAM_HINTS.some((hint) => username.includes(hint));
};

const usernameDigitsRatio = (username) => {
  if (!username) return 0;
  const digits = username.replace(/\D/g, '').length;
  return digits / username.length;
};

export const analyzeContactQuality = ({
  username,
  first_name,
  last_name,
  bio,
  messages = [],
  last_message_preview,
  messages_count
}) => {
  const reasons = [];
  let score = 0;

  const uname = normalizeUsername(username);
  const bioText = normalizeText(bio);
  const lastMessage = normalizeText(last_message_preview);
  const sampleText = [bioText, lastMessage, ...(messages || [])]
    .filter(Boolean)
    .join(' ');

  if (!uname) {
    score += 30;
    reasons.push('missing_username');
  }

  if (usernameLooksBot(uname)) {
    score += 80;
    reasons.push('username_bot');
  }

  if (usernameLooksSpammy(uname)) {
    score += 25;
    reasons.push('username_spam_hint');
  }

  const linkCount = countLinks(sampleText);
  if (linkCount >= 3) {
    score += 20;
    reasons.push('many_links');
  }

  if (containsSpamKeywords(sampleText)) {
    score += linkCount > 0 ? 20 : 15;
    reasons.push('spam_keywords');
  }

  if (uname && uname.length >= 8 && usernameDigitsRatio(uname) >= 0.5) {
    score += 10;
    reasons.push('username_many_digits');
  }

  if (uname && /_{2,}/.test(uname)) {
    score += 5;
    reasons.push('username_underscores');
  }

  const hasName = Boolean(normalizeText(first_name) || normalizeText(last_name));
  const hasBio = bioText.length >= 10;
  const msgCount = Number.isFinite(Number(messages_count)) ? Number(messages_count) : 0;

  const isSpam = score >= 60;
  const isLowQuality = !isSpam && !hasName && !hasBio && msgCount <= 1;

  return {
    is_spam: isSpam,
    spam_score: Math.min(100, Math.max(0, score)),
    spam_reasons: isSpam ? reasons : [],
    is_low_quality: isLowQuality
  };
};

export default {
  analyzeContactQuality
};
