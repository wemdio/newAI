import express from 'express';
import amoCrmService from '../../services/amoCrm.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.post('/lead', async (req, res) => {
  try {
    const { name, contact, type } = req.body;

    if (!name || !contact) {
      return res.status(400).json({ error: 'Name and contact are required' });
    }

    // Send to AmoCRM (fire and forget or wait?)
    // We'll wait to log the result properly, but we could make it async
    const result = await amoCrmService.createLead({ name, contact, type });

    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error processing landing lead', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

