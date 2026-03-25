/**
 * Test Job — for verifying the scheduler works
 *
 * Schedule via API:
 *   POST /schedule { "name": "test", "time": "11 AM", "data": { "msg": "hello" } }
 *
 * When the time arrives, this handler runs and logs the payload.
 */

module.exports = {
  name: 'test',

  handler: async (payload, context) => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  TEST JOB FIRED!`);
    console.log(`  Scheduled for : ${context.meta?.scheduledFor}`);
    console.log(`  Fired at      : ${new Date().toISOString()}`);
    console.log(`  Attempt       : ${context.attempt}`);
    console.log(`  Payload       :`, payload);
    console.log(`${'='.repeat(50)}\n`);

    return { success: true, received: payload };
  },

  options: {
    attempts: 2,
  },
};
