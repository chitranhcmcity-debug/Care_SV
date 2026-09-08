const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema(
  {
    systemTitle: { type: String, default: 'ITC Student Care System' },
    schoolName: { type: String, default: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)' },
    departmentName: { type: String, default: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên' },
    supportHotline: { type: String, default: '028 3965 1114' },
    supportEmail: { type: String, default: 'cskh@itc.edu.vn' },

    // Attendance & Exam Ban Rules
    examBanThreshold: { type: Number, default: 3 }, // Absent >= 3 sessions triggers ban
    parentWarningThreshold: { type: Number, default: 2 }, // Absent >= 2 sessions triggers parent warning
    taskAssignmentRule: {
      type: String,
      enum: ['round-robin', 'least-tasks', 'admin-only'],
      default: 'round-robin',
    },

    // Crawler Default Configuration
    defaultMajorPrefixes: {
      type: [String],
      default: ['501', '602', '502', '601', '401', '402', '701'],
    },
    crawlerMajorPrefixes: {
      type: [String],
      default: ['501', '602', '502', '601', '401', '402', '701'],
    },
    defaultConcurrency: { type: Number, default: 6 },
    defaultYearFilter: { type: String, default: '25,26' },

    // Custom Absence Reasons for staff selection
    absenceReasons: {
      type: [String],
      default: ['Bệnh/Sức khỏe', 'Việc gia đình', 'Bận đi làm', 'Lý do cá nhân', 'Khác'],
    },

    // Student Tags list
    tags: {
      type: [String],
      default: ['#KhóKhănHọcPhí', '#HọcBổng', '#ĐiLàmĐêm', '#CảnhBáoVắng', '#CầnHỗTrợĐặcBiệt'],
    },
  },
  { timestamps: true },
);

const SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema);
module.exports = SystemSettings;
module.exports.SystemConfig = SystemSettings;
