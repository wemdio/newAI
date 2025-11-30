import express from 'express';
import {
  getDetectedLeads,
  getDetectedLead,
  updateDetectedLead,
  deleteDetectedLead,
  getLeadStatistics
} from '../../database/queries.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';
import { getSupabase } from '../../config/database.js';

const router = express.Router();

/**
 * GET /api/leads
 * List detected leads with filtering
 */
router.get('/', authenticateUser, asyncHandler(async (req, res) => {
  const {
    limit = 100,
    offset = 0,
    start_date,
    end_date,
    min_confidence,
    posted,
    contacted,
    lead_status
  } = req.query;
  
  const filters = {
    limit: parseInt(limit),
    offset: parseInt(offset),
    startDate: start_date,
    endDate: end_date,
    minConfidence: min_confidence ? parseInt(min_confidence) : null,
    posted: posted !== undefined ? posted === 'true' : null,
    contacted: contacted !== undefined ? contacted === 'true' : null,
    leadStatus: lead_status || null
  };
  
  logger.info('GET /api/leads request', { userId: req.userId, filters });
  
  const leads = await getDetectedLeads(req.userId, filters);
  
  logger.info('GET /api/leads response', { userId: req.userId, leadsCount: leads.length });
  
  res.json({
    success: true,
    count: leads.length,
    leads,
    filters: {
      ...filters,
      userId: req.userId
    }
  });
}));

/**
 * GET /api/leads/statistics
 * Get lead statistics
 */
router.get('/statistics', authenticateUser, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  
  const stats = await getLeadStatistics(req.userId, parseInt(days));
  
  res.json({
    success: true,
    statistics: stats,
    period: `${days} days`
  });
}));

/**
 * DELETE /api/leads/all
 * Delete all leads for user
 */
router.delete('/all', authenticateUser, asyncHandler(async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('detected_leads')
    .delete()
    .eq('user_id', req.userId);
  
  if (error) throw error;
  
  logger.info('Delete all leads', { userId: req.userId });
  
  res.json({
    success: true,
    message: 'All leads deleted successfully'
  });
}));

/**
 * DELETE /api/leads/bulk
 * Delete multiple leads
 */
router.delete('/bulk', authenticateUser, asyncHandler(async (req, res) => {
  const { lead_ids } = req.body;
  
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({
      error: 'Invalid lead IDs',
      message: 'Provide an array of lead IDs to delete'
    });
  }
  
  const supabase = getSupabase();
  const { error } = await supabase
    .from('detected_leads')
    .delete()
    .in('id', lead_ids)
    .eq('user_id', req.userId);
  
  if (error) throw error;
  
  logger.info('Bulk delete leads', { userId: req.userId, count: lead_ids.length });
  
  res.json({
    success: true,
    message: `${lead_ids.length} leads deleted successfully`
  });
}));

/**
 * GET /api/leads/:id
 * Get single lead details
 */
router.get('/:id', authenticateUser, asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id);
  
  if (isNaN(leadId)) {
    return res.status(400).json({
      error: 'Invalid lead ID',
      message: 'Lead ID must be a number'
    });
  }
  
  const lead = await getDetectedLead(leadId, req.userId);
  
  if (!lead) {
    return res.status(404).json({
      error: 'Lead not found',
      message: 'No lead found with this ID'
    });
  }
  
  res.json({
    success: true,
    lead
  });
}));

/**
 * PUT /api/leads/:id
 * Update lead (status, notes, etc.)
 */
router.put('/:id', authenticateUser, asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id);
  
  if (isNaN(leadId)) {
    return res.status(400).json({
      error: 'Invalid lead ID',
      message: 'Lead ID must be a number'
    });
  }
  
  const updates = {};
  
  if (req.body.is_contacted !== undefined) {
    updates.is_contacted = req.body.is_contacted;
  }
  
  if (req.body.notes !== undefined) {
    updates.notes = req.body.notes;
  }
  
  if (req.body.posted_to_telegram !== undefined) {
    updates.posted_to_telegram = req.body.posted_to_telegram;
  }
  
  if (req.body.lead_status !== undefined) {
    const validStatuses = ['lead', 'not_lead', 'sale'];
    if (!validStatuses.includes(req.body.lead_status)) {
      return res.status(400).json({
        error: 'Invalid lead status',
        message: 'Status must be one of: lead, not_lead, sale'
      });
    }
    updates.lead_status = req.body.lead_status;
  }
  
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: 'No updates provided',
      message: 'Provide at least one field to update'
    });
  }
  
  const updatedLead = await updateDetectedLead(leadId, req.userId, updates);
  
  logger.info('Lead updated', { leadId, userId: req.userId, updates });
  
  res.json({
    success: true,
    message: 'Lead updated successfully',
    lead: updatedLead
  });
}));

/**
 * DELETE /api/leads/:id
 * Delete a lead
 */
router.delete('/:id', authenticateUser, asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id);
  
  if (isNaN(leadId)) {
    return res.status(400).json({
      error: 'Invalid lead ID',
      message: 'Lead ID must be a number'
    });
  }
  
  await deleteDetectedLead(leadId, req.userId);
  
  logger.info('Lead deleted', { leadId, userId: req.userId });
  
  res.json({
    success: true,
    message: 'Lead deleted successfully'
  });
}));

/**
 * POST /api/leads/:id/mark-contacted
 * Mark lead as contacted
 */
router.post('/:id/mark-contacted', authenticateUser, asyncHandler(async (req, res) => {
  const leadId = parseInt(req.params.id);
  
  if (isNaN(leadId)) {
    return res.status(400).json({
      error: 'Invalid lead ID',
      message: 'Lead ID must be a number'
    });
  }
  
  const updatedLead = await updateDetectedLead(leadId, req.userId, {
    is_contacted: true
  });
  
  logger.info('Lead marked as contacted', { leadId, userId: req.userId });
  
  res.json({
    success: true,
    message: 'Lead marked as contacted',
    lead: updatedLead
  });
}));

/**
 * GET /api/leads/export
 * Export leads to CSV
 */
router.get('/export/csv', authenticateUser, asyncHandler(async (req, res) => {
  const {
    start_date,
    end_date,
    min_confidence
  } = req.query;
  
  const filters = {
    limit: 10000, // Export max 10k leads
    offset: 0,
    startDate: start_date,
    endDate: end_date,
    minConfidence: min_confidence ? parseInt(min_confidence) : null
  };
  
  const leads = await getDetectedLeads(req.userId, filters);
  
  if (leads.length === 0) {
    return res.status(404).json({
      error: 'No leads found',
      message: 'No leads match the specified filters'
    });
  }
  
  // Convert to CSV
  const csvHeaders = [
    'ID',
    'Detected At',
    'Confidence',
    'First Name',
    'Last Name',
    'Username',
    'Bio',
    'Channel',
    'Message',
    'Reasoning',
    'Contacted',
    'Posted to Telegram'
  ].join(',');
  
  const csvRows = leads.map(lead => {
    const message = lead.messages || {};
    return [
      lead.id,
      lead.detected_at,
      lead.confidence_score,
      message.first_name || '',
      message.last_name || '',
      message.username || '',
      message.bio ? `"${message.bio.replace(/"/g, '""')}"` : '',
      message.chat_name || '',
      message.message ? `"${message.message.replace(/"/g, '""')}"` : '',
      lead.reasoning ? `"${lead.reasoning.replace(/"/g, '""')}"` : '',
      lead.is_contacted ? 'Yes' : 'No',
      lead.posted_to_telegram ? 'Yes' : 'No'
    ].join(',');
  });
  
  const csv = [csvHeaders, ...csvRows].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${Date.now()}.csv"`);
  res.send(csv);
  
  logger.info('Leads exported to CSV', { userId: req.userId, count: leads.length });
}));

export default router;

