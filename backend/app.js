const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const crawlerRoutes = require('./routes/crawler');
const excelRoutes = require('./routes/excel');
const attendanceRoutes = require('./routes/attendance');
const callTaskRoutes = require('./routes/callTask');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');
const courseGroupRoutes = require('./routes/courseGroup');

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
app.use('/api/auth', authRoutes);
app.use('/api/crawler', crawlerRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/call-tasks', callTaskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/course-groups', courseGroupRoutes);

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
