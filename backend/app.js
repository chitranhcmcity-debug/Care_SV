const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const fs = require('node:fs');
const path = require('node:path');
const errorHandler = require('./middleware/xuLyLoi');
const authRoutes = require('./routes/xacThuc');
const excelRoutes = require('./routes/nhapXuatExcel');
const attendanceRoutes = require('./routes/diemDanh');
const careCaseRoutes = require('./routes/hoSoChamSoc');
const analyticsRoutes = require('./routes/thongKe');
const settingsRoutes = require('./routes/caiDat');
const permissionRoutes = require('./routes/phanQuyen');
const courseGroupRoutes = require('./routes/nhomHocPhan');
const taskRoutes = require('./routes/nhiemVu');
const aiRoutes = require('./routes/troLyAi');
const billingRoutes = require('./routes/thanhToan');
const studentRoutes = require('./routes/sinhVien');
const callRoutes = require('./routes/cuocGoi');
const classAssignmentRoutes = require('./routes/phanCongLop');
const overviewRoutes = require('./routes/tongQuan');
const notificationRoutes = require('./routes/thongBao');
const parentAlertRoutes = require('./routes/thongBaoPhuHuynh');
const { requireActiveSubscription } = require('./middleware/goiDichVu');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.disable('x-powered-by');
// gzip/brotli for JSON and the Angular bundle; audio and images are skipped as incompressible.
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Route Registration
// Always reachable, so users can sign in and an admin can renew an expired subscription.
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/overview', overviewRoutes);
// Business features: locked with 402 once the subscription has expired.
app.use('/api/excel', requireActiveSubscription, excelRoutes);
app.use('/api/attendance', requireActiveSubscription, attendanceRoutes);
app.use('/api/care-cases', requireActiveSubscription, careCaseRoutes);
app.use('/api/analytics', requireActiveSubscription, analyticsRoutes);
app.use('/api/course-groups', requireActiveSubscription, courseGroupRoutes);
app.use('/api/tasks', requireActiveSubscription, taskRoutes);
app.use('/api/ai', requireActiveSubscription, aiRoutes);
app.use('/api/students', requireActiveSubscription, studentRoutes);
app.use('/api/calls', requireActiveSubscription, callRoutes);
app.use('/api/class-assignments', requireActiveSubscription, classAssignmentRoutes);
app.use('/api/notifications', requireActiveSubscription, notificationRoutes);
app.use('/api/parent-alerts', requireActiveSubscription, parentAlertRoutes);

app.get('/api/health', (req, res) =>
  res
    .status(mongoose.connection.readyState === 1 ? 200 : 503)
    .json({ ready: mongoose.connection.readyState === 1 }),
);
app.use('/api', (req, res) => res.status(404).json({ message: 'API not found' }));
const frontendDist = path.join(__dirname, '../frontend/dist/frontend/browser');
if (fs.existsSync(frontendDist)) {
  // Build output has content hashes in its names (main-AB12CD34.js), so it never changes and
  // can be cached for a year; other public files (fonts, images) for a week. index.html is
  // always revalidated so a new deploy is picked up at once.
  app.use(
    express.static(frontendDist, {
      index: false,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (/-[A-Za-z0-9]{8}\.(js|css)$/.test(name))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (name === 'sw.js' || name.endsWith('.html'))
          res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=604800');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('🚀 Hệ thống API Chăm sóc & Điểm danh Sinh viên ITC đang hoạt động!');
  });
}

app.use(errorHandler);
module.exports = app;
