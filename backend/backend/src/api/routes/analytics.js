import express from 'express';
import { getMonthlyUsage, getUsageStatistics } from '../../services/costOptimizer.js';
import { getProcessingHistory } from '../../services/leadDetector.js';
import { getLeadStatistics } from '../../database/queries.js';
import { authenticateUser } from '../middleware/auth.js';
import { asyncHandler } from '../../utils/errorHandler.js';

const router = express.Router();

/**
 * GET /api/analytics/usage
 * Get API usage and cost statistics
 */
router.get('/usage', authenticateUser, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  
  const usage = await getUsageStatistics(req.userId, parseInt(days));
  const monthlyUsage = await getMonthlyUsage(req.userId);
  
  res.json({
    success: true,
    period: `${days} days`,
    usage: {
      ...usage,
      currentMonth: {
        totalCost: monthlyUsage.totalCost,
        totalCalls: monthlyUsage.totalCalls,
        totalInputTokens: monthlyUsage.totalInputTokens,
        totalOutputTokens: monthlyUsage.totalOutputTokens
      }
    }
  });
}));

/**
 * GET /api/analytics/performance
 * Get processing performance metrics
 */
router.get('/performance', authenticateUser, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  
  const history = await getProcessingHistory(req.userId, parseInt(limit));
  
  if (history.length === 0) {
    return res.json({
      success: true,
      message: 'No processing history available',
      metrics: {
        averageProcessingTime: 0,
        averageMessagesProcessed: 0,
        averageLeadsFound: 0,
        totalRuns: 0
      },
      history: []
    });
  }
  
  // Calculate metrics
  const metrics = {
    averageProcessingTime: Math.round(
      history.reduce((sum, log) => sum + log.processing_duration_ms, 0) / history.length
    ),
    averageMessagesProcessed: Math.round(
      history.reduce((sum, log) => sum + log.messages_analyzed, 0) / history.length
    ),
    averageLeadsFound: Math.round(
      history.reduce((sum, log) => sum + log.leads_found, 0) / history.length * 10
    ) / 10, // One decimal place
    totalRuns: history.length,
    successRate: Math.round(
      (history.filter(log => !log.errors || log.errors.length === 0).length / history.length) * 100
    )
  };
  
  res.json({
    success: true,
    metrics,
    history: history.slice(0, 20) // Return last 20 runs
  });
}));

/**
 * GET /api/analytics/leads
 * Get lead statistics and trends
 */
router.get('/leads', authenticateUser, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  
  const stats = await getLeadStatistics(req.userId, parseInt(days));
  
  // Calculate trends
  const trends = {
    leadsPerDay: stats.totalLeads > 0 ? (stats.totalLeads / days).toFixed(2) : 0,
    contactRate: stats.totalLeads > 0 ? 
      Math.round((stats.contacted / stats.totalLeads) * 100) : 0,
    postingRate: stats.totalLeads > 0 ?
      Math.round((stats.posted / stats.totalLeads) * 100) : 0
  };
  
  res.json({
    success: true,
    period: `${days} days`,
    statistics: stats,
    trends
  });
}));

/**
 * GET /api/analytics/dashboard
 * Get all analytics data for dashboard
 */
router.get('/dashboard', authenticateUser, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const daysInt = parseInt(days);
  
  // Fetch all data in parallel
  const [usage, monthlyUsage, history, leadStats] = await Promise.all([
    getUsageStatistics(req.userId, daysInt),
    getMonthlyUsage(req.userId),
    getProcessingHistory(req.userId, 50),
    getLeadStatistics(req.userId, daysInt)
  ]);
  
  // Calculate performance metrics
  const performanceMetrics = history.length > 0 ? {
    averageProcessingTime: Math.round(
      history.reduce((sum, log) => sum + log.processing_duration_ms, 0) / history.length
    ),
    averageMessagesProcessed: Math.round(
      history.reduce((sum, log) => sum + log.messages_analyzed, 0) / history.length
    ),
    averageLeadsFound: Math.round(
      history.reduce((sum, log) => sum + log.leads_found, 0) / history.length * 10
    ) / 10,
    totalRuns: history.length,
    successRate: Math.round(
      (history.filter(log => !log.errors || log.errors.length === 0).length / history.length) * 100
    )
  } : {
    averageProcessingTime: 0,
    averageMessagesProcessed: 0,
    averageLeadsFound: 0,
    totalRuns: 0,
    successRate: 100
  };
  
  // Calculate lead trends
  const leadTrends = leadStats.totalLeads > 0 ? {
    leadsPerDay: (leadStats.totalLeads / daysInt).toFixed(2),
    contactRate: Math.round((leadStats.contacted / leadStats.totalLeads) * 100),
    postingRate: Math.round((leadStats.posted / leadStats.totalLeads) * 100)
  } : {
    leadsPerDay: 0,
    contactRate: 0,
    postingRate: 0
  };
  
  res.json({
    success: true,
    period: `${days} days`,
    dashboard: {
      usage: {
        ...usage,
        currentMonth: {
          totalCost: monthlyUsage.totalCost,
          totalCalls: monthlyUsage.totalCalls,
          totalInputTokens: monthlyUsage.totalInputTokens,
          totalOutputTokens: monthlyUsage.totalOutputTokens
        }
      },
      performance: {
        metrics: performanceMetrics,
        recentRuns: history.slice(0, 10)
      },
      leads: {
        statistics: leadStats,
        trends: leadTrends
      }
    }
  });
}));

/**
 * GET /api/analytics/budget
 * Get budget status and projections
 */
router.get('/budget', authenticateUser, asyncHandler(async (req, res) => {
  const monthlyUsage = await getMonthlyUsage(req.userId);
  const monthlyLimit = parseFloat(process.env.MONTHLY_BUDGET_USD) || 50;
  
  const currentSpend = monthlyUsage.totalCost;
  const remainingBudget = monthlyLimit - currentSpend;
  const percentUsed = Math.round((currentSpend / monthlyLimit) * 100);
  
  // Calculate days remaining in month
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.ceil((endOfMonth - now) / (1000 * 60 * 60 * 24));
  
  // Project end-of-month spend
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysPassed = now.getDate();
  const dailyAverage = currentSpend / daysPassed;
  const projectedSpend = dailyAverage * daysInMonth;
  
  const status = percentUsed >= 100 ? 'exceeded' :
                 percentUsed >= 90 ? 'critical' :
                 percentUsed >= 75 ? 'warning' :
                 percentUsed >= 50 ? 'moderate' : 'healthy';
  
  res.json({
    success: true,
    budget: {
      monthlyLimit,
      currentSpend,
      remainingBudget,
      percentUsed,
      status,
      projections: {
        dailyAverage,
        projectedSpend,
        projectedPercentage: Math.round((projectedSpend / monthlyLimit) * 100),
        daysRemaining
      }
    }
  });
}));

export default router;

