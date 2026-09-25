const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const errorHandler = require('./middleware/xuLyLoi');
const authRoutes = require('./routes/xacThuc');
const excelRoutes = require('./routes/nhapXuatExcel');
const attendanceRoutes = require('./routes/diemDanh');
const callTaskRoutes = require('./routes/nhiemVuGoiDien');
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
const { requireActiveSubscription } = require('./middleware/goiDichVu');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Route Registration
// Always reachable, so users can sign in and an admin can renew an expired subscription.
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/billing', billingRoutes);
// Business features: locked with 402 once the subscription has expired.
app.use('/api/excel', requireActiveSubscription, excelRoutes);
app.use('/api/attendance', requireActiveSubscription, attendanceRoutes);
app.use('/api/call-tasks', requireActiveSubscription, callTaskRoutes);
app.use('/api/analytics', requireActiveSubscription, analyticsRoutes);
app.use('/api/course-groups', requireActiveSubscription, courseGroupRoutes);
app.use('/api/tasks', requireActiveSubscription, taskRoutes);
app.use('/api/ai', requireActiveSubscription, aiRoutes);
app.use('/api/students', requireActiveSubscription, studentRoutes);
app.use('/api/calls', requireActiveSubscription, callRoutes);
app.use('/api/class-assignments', requireActiveSubscription, classAssignmentRoutes);

app.get('/api/health', (req, res) =>
  res
    .status(mongoose.connection.readyState === 1 ? 200 : 503)
    .json({ ready: mongoose.connection.readyState === 1 }),
);
app.use('/api', (req, res) => res.status(404).json({ message: 'API not found' }));
const frontendDist = path.join(__dirname, '../frontend/dist/frontend/browser');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('🚀 Hệ thống API Chăm sóc & Điểm danh Sinh viên ITC đang hoạt động!');
  });
}

app.use(errorHandler);
module.exports = app;
