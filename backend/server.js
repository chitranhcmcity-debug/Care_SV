require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { getConfig } = require('./config/env');
async function startServer() {
  const config = getConfig();
  let memoryServer;
  let server;
  try {
    let uri = config.mongoUri;
    if (config.useMemoryDatabase) {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      console.warn('Using a temporary database; data will not persist.');
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    if (config.seedDemo) await require('./scripts/seedDemo')();
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port, '0.0.0.0', () => resolve(listener));
      listener.on('error', reject);
    });
    console.log('Backend listening on port', config.port);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      if (memoryServer) await memoryServer.stop();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return { server, stop };
  } catch (error) {
    await mongoose.disconnect();
    if (memoryServer) await memoryServer.stop();
    throw error;
  }
}
if (require.main === module)
  startServer().catch((error) => {
    console.error(
      'Startup failed:',
      error.name,
      error.name === 'Error' ? error.message : 'Check database configuration and connectivity.',
    );
    process.exitCode = 1;
  });
module.exports = { startServer };
