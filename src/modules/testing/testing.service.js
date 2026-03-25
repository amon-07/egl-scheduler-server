/**
 * TESTING SERVICE
 *
 * Business logic for the testing module.
 * Wraps core/scheduler with validation, defaults, and domain logic.
 */

const scheduler = require('../../core/scheduler');
const registry = require('../../core/registry');

function createTestingService() {

  /**
   * Schedule a delayed job.
   *
   * @param {object} params
   * @param {string} params.name       — registered job name
   * @param {string|number} params.time — when to fire
   * @param {object} [params.data]     — payload
   * @param {string} [params.jobId]    — dedup/upsert key
   * @returns {Promise<object>}
   */
  async function scheduleJob({ name, time, data = {}, jobId }) {
    if (!name) throw { status: 400, message: 'name is required' };
    if (!time) throw { status: 400, message: 'time is required. e.g. "11 AM", "25-03-2026 3:30 PM", "in 5m"' };

    return scheduler.schedule(name, data, time, { jobId });
  }

  /**
   * Cancel a scheduled job by ID.
   *
   * @param {string} jobId
   * @returns {Promise<object>}
   */
  async function cancelJob(jobId) {
    if (!jobId) throw { status: 400, message: 'jobId is required' };

    const removed = await scheduler.cancel(jobId);
    if (!removed) throw { status: 404, message: 'Job not found' };

    return { cancelled: true, jobId };
  }

  /**
   * List all pending (delayed + waiting) jobs.
   *
   * @returns {Promise<object>}
   */
  async function listJobs() {
    const jobs = await scheduler.list();
    return { count: jobs.length, jobs };
  }

  /**
   * Get all registered job type names.
   *
   * @returns {string[]}
   */
  function getRegisteredTypes() {
    return registry.listRegistered();
  }

  return {
    scheduleJob,
    cancelJob,
    listJobs,
    getRegisteredTypes,
  };
}

module.exports = createTestingService;
