/**
 * TESTING ROUTES
 *
 * Route definitions + validation for the testing module.
 *
 * Endpoints:
 *   GET    /health       — health check + registered job types
 *   POST   /schedule     — schedule a delayed job
 *   GET    /jobs         — list all pending jobs
 *   DELETE /jobs/:jobId  — cancel a scheduled job
 */

const express = require('express');

// ── DI: wire service → controller → routes ───────────────────────────

const createTestingService = require('./testing.service');
const createTestingController = require('./testing.controller');

const testingService = createTestingService();
const testingController = createTestingController({ testingService });

// ── Router ───────────────────────────────────────────────────────────

const router = express.Router();

/**
 * GET /health
 * Health check + list of registered job types.
 */
router.get('/health', testingController.healthController);

/**
 * POST /schedule
 * Schedule a delayed job.
 *
 * Body:
 *   name     (string, required)  — registered job name
 *   time     (string, required)  — "11 AM", "3:30 PM", "14:00", ISO string
 *   data     (object, optional)  — payload for handler / callback body
 *   jobId    (string, optional)  — deduplication/upsert key
 *   callback (object, optional)  — { url, method?, headers?, timeout? }
 */
router.post('/schedule', testingController.scheduleJobController);

/**
 * GET /jobs
 * List all pending (delayed + waiting) jobs.
 */
router.get('/jobs', testingController.listJobsController);

/**
 * DELETE /jobs/:jobId
 * Cancel a scheduled job by ID.
 */
router.delete('/jobs/:jobId', testingController.cancelJobController);

module.exports = router;
