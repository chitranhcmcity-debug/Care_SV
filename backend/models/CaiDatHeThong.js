const mongoose = require('mongoose');

const CaiDatHeThongSchema = new mongoose.Schema(
  {
    systemTitle: { type: String, default: 'ITC Student Care System' },
    schoolName: { type: String, default: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)' },
    departmentName: { type: String, default: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên' },
    supportHotline: { type: String, default: '028 3965 1114' },
    supportEmail: { type: String, default: 'cskh@itc.edu.vn' },

    // DiemDanh & Exam Ban Rules
    examBanThreshold: { type: Number, default: 3 }, // Absent >= 3 sessions triggers ban
    parentWarningThreshold: { type: Number, default: 2 }, // Absent >= 2 sessions triggers parent warning
    taskAssignmentRule: {
      type: String,
      enum: ['round-robin', 'least-tasks', 'admin-only'],
      default: 'round-robin',
    },

    // Custom Absence Reasons for staff selection
    absenceReasons: {
      type: [String],
      default: ['Bệnh/Sức khỏe', 'Việc gia đình', 'Bận đi làm', 'Lý do cá nhân', 'Khác'],
    },

    // Gói sử dụng hệ thống: hệ thống dùng được tới thời điểm này (null = chưa khởi tạo dùng thử).
    subscriptionExpiresAt: { type: Date, default: null },
    subscriptionPlan: { type: String, default: 'dung_thu' },

    // SinhVien Tags list
    tags: {
      type: [String],
      default: ['#KhóKhănHọcPhí', '#HọcBổng', '#ĐiLàmĐêm', '#CảnhBáoVắng', '#CầnHỗTrợĐặcBiệt'],
    },
  },
  { timestamps: true },
);

const CaiDatHeThong = mongoose.model('CaiDatHeThong', CaiDatHeThongSchema, 'cai_dat_he_thong');
module.exports = CaiDatHeThong;
