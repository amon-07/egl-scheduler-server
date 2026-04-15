const mongoose = require('mongoose');

let connectingPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectingPromise) return connectingPromise;

  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error('MONGODB_URL is required for scheduler-server');
  }

  connectingPromise = mongoose
    .connect(mongoUrl)
    .then(() => {
      console.log('[scheduler-db] MongoDB connected');
      return mongoose.connection;
    })
    .catch((error) => {
      console.error('[scheduler-db] MongoDB connection error:', error.message);
      throw error;
    })
    .finally(() => {
      connectingPromise = null;
    });

  return connectingPromise;
}

module.exports = {
  connectDB,
};
