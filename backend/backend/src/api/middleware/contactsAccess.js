import { getSupabase } from '../../config/database.js';

const ADMIN_USER_IDS = new Set(['f2aceadb-9997-409f-97c4-465f6258ff14']);

export const createContactsAdminGuard = (getUser = token => getSupabase().auth.getUser(token)) => (
  async (req, res, next) => {
    const token = /^Bearer ([^\s,]+)$/i.exec(req.get('authorization') || '')?.[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    let identity;
    try {
      identity = await getUser(token);
    } catch {
      return res.status(503).json({ success: false, error: 'Authentication unavailable' });
    }

    if (identity.error && Number(identity.error.status) >= 500) {
      return res.status(503).json({ success: false, error: 'Authentication unavailable' });
    }
    const user = identity.data?.user;
    if (identity.error || !user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    if (!ADMIN_USER_IDS.has(user.id)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    return next();
  }
);

export const requireContactsAdmin = createContactsAdminGuard();
