// Smoke test: verify node-telegram-bot-api routes through a proxy agent.
// Read-only — calls getMe() only, never sends a message.
//   node scripts/test-telegram-proxy.js "socks5://user:pass@host:port"
//   node scripts/test-telegram-proxy.js                # direct (no proxy)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readEnv = (file, key) => {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith('#') || !t.includes('=')) continue;
      const [k, ...rest] = t.split('=');
      if (k.trim() === key) return rest.join('=').trim();
    }
  } catch {}
  return null;
};

const token = (process.env.TELEGRAM_BOT_TOKEN
  || readEnv(path.join(__dirname, '..', '..', '.env'), 'TELEGRAM_BOT_TOKEN')
  || '').trim();
if (!token) { console.error('No TELEGRAM_BOT_TOKEN found'); process.exit(1); }

const proxyUrl = (process.argv[2] || '').trim();
const scheme = proxyUrl ? (proxyUrl.split('://')[0] || '').toLowerCase() : '';
const agent = !proxyUrl ? null
  : scheme.startsWith('socks') ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

const bot = new TelegramBot(token, {
  polling: false,
  filepath: false,
  ...(agent ? { request: { agent } } : {})
});

try {
  const me = await bot.getMe();
  console.log(`OK via ${agent ? scheme + ' proxy' : 'DIRECT'} -> @${me.username} (id ${me.id})`);
} catch (e) {
  console.error(`FAIL via ${agent ? scheme + ' proxy' : 'DIRECT'}: ${e.message}`);
  process.exit(2);
}
