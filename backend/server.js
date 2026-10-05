require('dotenv').config();
// Ngày điểm danh và khung giờ học dùng giờ địa phương; mặc định là giờ Việt Nam khi máy chủ
// (vd container cloud dùng UTC) không đặt TZ.
process.env.TZ ||= 'Asia/Ho_Chi_Minh';
const mongoose = require('mongoose');
const app = require('./app');
const { getConfig } = require('./utils/moiTruong');
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
    await require('./scripts/chuyenDoiDuLieu')();
    // Các phân công lớp tạo trước khi có lịch sử phân công sẽ được bổ sung bản ghi lịch sử.
    await require('./services/dichVuPhanCongLop').syncLegacyAssignments();
    // Khóa API admin lưu trên giao diện được ưu tiên hơn .env.
    await require('./services/dichVuCauHinhApi').migrateAiToTrikun();
    await require('./services/dichVuCauHinhApi').applyIntegrations();
    if (config.seedDemo) await require('./scripts/taoDuLieuMau')();
    const admin = await require('./scripts/taoTaiKhoanQuanTri').ensureInitialAdmin();
    if (admin.created) console.log('Created the first admin account:', admin.user.email);
    else if (admin.reason === 'not-configured')
      console.warn('No admin account yet: set ADMIN_EMAIL and ADMIN_PASSWORD, then restart.');
    // Mọi tài khoản và bản ghi đều thuộc một đơn vị (mỗi Trưởng phòng / PHT sở hữu một đơn vị).
    await require('./scripts/ganDonVi').assignUnits();
    server = await new Promise((resolve, reject) => {
      const listener = app.listen(config.port, '0.0.0.0', () => resolve(listener));
      listener.on('error', reject);
    });
    console.log('Backend listening on port', config.port);
    // Nhắc gia hạn cho các tài khoản Trưởng phòng / PHT tự trả tiền gói riêng.
    require('./services/dichVuGiaHanTaiKhoan').startRenewalReminders();
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
