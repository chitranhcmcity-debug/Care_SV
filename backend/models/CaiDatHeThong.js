const mongoose = require('mongoose');

const CaiDatHeThongSchema = new mongoose.Schema(
  {
    systemTitle: { type: String, default: 'ITC Student Care System' },
    schoolName: { type: String, default: 'Trường Cao Đẳng Công Nghệ Thông Tin TP.HCM (ITC)' },
    departmentName: { type: String, default: 'Phòng Đào Tạo & Chăm Sóc Sinh Viên' },
    supportHotline: { type: String, default: '028 3965 1114' },
    supportEmail: { type: String, default: 'cskh@itc.edu.vn' },

    // Giao diện web (Admin)
    logoDataUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#673ab7' },

    // Khóa API tích hợp (Admin), mã hóa AES-GCM; xem services/dichVuCauHinhApi.js.
    integrations: { type: mongoose.Schema.Types.Mixed, default: null },

    // Mức cảnh báo vắng (Trưởng phòng / PHT). null = DEFAULT_WARNING_LEVELS.
    warningLevels: {
      type: [
        {
          _id: false,
          name: { type: String, required: true, trim: true, maxlength: 50 },
          unit: { type: String, enum: ['percent', 'periods'], required: true },
          threshold: { type: Number, required: true, min: 0.1, max: 1000 },
          color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
          examBan: { type: Boolean, default: false },
        },
      ],
      default: undefined,
    },

    // Custom Absence Reasons for staff selection
    absenceReasons: {
      type: [String],
      default: ['Bệnh/Sức khỏe', 'Việc gia đình', 'Bận đi làm', 'Lý do cá nhân', 'Khác'],
    },

    // Gói sử dụng hệ thống: hệ thống dùng được tới thời điểm này (null = chưa khởi tạo dùng thử).
    subscriptionExpiresAt: { type: Date, default: null },
    subscriptionPlan: { type: String, default: 'dung_thu' },

    // Bảng phân quyền { manager: [key], staff: [key], teacher: [key] }; vai trò chưa lưu
    // dùng DEFAULT_ROLE_PERMISSIONS (xem services/dichVuPhanQuyen.js).
    rolePermissions: { type: mongoose.Schema.Types.Mixed, default: null },

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
