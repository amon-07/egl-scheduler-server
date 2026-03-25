/**
 * TESTING CONTROLLER
 *
 * Handles HTTP request/response for the testing module.
 * All business logic is delegated to the service.
 */

function createTestingController({ testingService }) {

  async function scheduleJobController(req, res) {
    try {
      const { name, time, data, jobId, callback } = req.body;
      const result = await testingService.scheduleJob({ name, time, data, jobId, callback });

      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      const statusCode = error.status || 500;
      return res.status(statusCode).json({
        status: false,
        message: error.message || 'Failed to schedule job.',
        error: { code: 'SCH001' },
      });
    }
  }

  async function cancelJobController(req, res) {
    try {
      const { jobId } = req.params;
      const result = await testingService.cancelJob(jobId);

      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      const statusCode = error.status || 500;
      return res.status(statusCode).json({
        status: false,
        message: error.message || 'Failed to cancel job.',
        error: { code: 'SCH002' },
      });
    }
  }

  async function listJobsController(_req, res) {
    try {
      const result = await testingService.listJobs();
      return res.status(200).json({ status: true, data: result });
    } catch (error) {
      return res.status(500).json({
        status: false,
        message: error.message || 'Failed to list jobs.',
        error: { code: 'SCH003' },
      });
    }
  }

  async function healthController(_req, res) {
    return res.status(200).json({
      status: true,
      data: {
        uptime: process.uptime(),
        registeredJobs: testingService.getRegisteredTypes(),
      },
    });
  }

  return {
    scheduleJobController,
    cancelJobController,
    listJobsController,
    healthController,
  };
}

module.exports = createTestingController;
