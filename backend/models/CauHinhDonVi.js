const mongoose = require('mongoose');
const { unitPlugin } = require('../utils/donVi');

// Care settings of one unit, set by its Trưởng phòng / PHT: warning levels, absence reasons and
// student tags. A unit without a document uses the defaults.
const CauHinhDonViSchema = new mongoose.Schema(
  {
    // null = DEFAULT_WARNING_LEVELS.
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
    absenceReasons: {
      type: [String],
      default: ['Bệnh/Sức khỏe', 'Việc gia đình', 'Bận đi làm', 'Lý do cá nhân', 'Khác'],
    },
    tags: {
      type: [String],
      default: ['#KhóKhănHọcPhí', '#HọcBổng', '#ĐiLàmĐêm', '#CảnhBáoVắng', '#CầnHỗTrợĐặcBiệt'],
    },
  },
  { timestamps: true },
);

CauHinhDonViSchema.plugin(unitPlugin);
CauHinhDonViSchema.index({ unitId: 1 }, { unique: true });

module.exports = mongoose.model('CauHinhDonVi', CauHinhDonViSchema, 'cau_hinh_don_vi');
