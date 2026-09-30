/** Per-page look of the page banner: subtitle, colour theme, mascot side and the tip card. */
export interface PageHero {
  subtitle: string;
  /** Gradient theme, see `.page-hero--*` in styles.css. */
  tone: 'violet' | 'blue' | 'teal' | 'sunset' | 'rose' | 'indigo';
  /** Which robot image floats next to the tile. */
  mascot: 'left' | 'right';
  /** Tip card on the right. */
  tipTitle: string;
  tipText: string;
}

const FALLBACK: PageHero = {
  subtitle: 'Theo dõi và quản lý công việc chăm sóc sinh viên.',
  tone: 'violet',
  mascot: 'right',
  tipTitle: 'Chúc bạn một ngày',
  tipText: 'làm việc hiệu quả!',
};

/** Keyed by route path, or by dashboard tab id for /admin and /management. */
const HEROES: Record<string, PageHero> = {
  '/students': {
    subtitle: 'Tra cứu hồ sơ, thông tin liên lạc và tình trạng học tập của sinh viên.',
    tone: 'indigo',
    mascot: 'right',
    tipTitle: 'Tìm nhanh',
    tipText: 'theo MSSV, lớp hoặc họ tên.',
  },
  '/attendance': {
    subtitle: 'Điểm danh từng buổi học và theo dõi chuyên cần của lớp.',
    tone: 'teal',
    mascot: 'left',
    tipTitle: 'Nhớ điểm danh',
    tipText: 'ngay trong buổi học nhé!',
  },
  '/care': {
    subtitle: 'Theo dõi hồ sơ chăm sóc, cuộc gọi và chỉ đạo xử lý sinh viên vắng.',
    tone: 'rose',
    mascot: 'right',
    tipTitle: 'Liên hệ sớm',
    tipText: 'giúp sinh viên quay lại lớp.',
  },
  '/tasks': {
    subtitle: 'Các nhiệm vụ được giao cho bạn và tiến độ xử lý.',
    tone: 'sunset',
    mascot: 'left',
    tipTitle: 'Ưu tiên việc',
    tipText: 'sắp đến hạn trước nhé!',
  },
  '/calls': {
    subtitle: 'Lịch sử cuộc gọi, ghi âm và kết quả liên hệ sinh viên.',
    tone: 'blue',
    mascot: 'right',
    tipTitle: 'Nghe lại ghi âm',
    tipText: 'để nắm rõ nội dung trao đổi.',
  },
  '/account-approvals': {
    subtitle: 'Xác nhận tài khoản giảng viên, nhân viên tự đăng ký và gửi key kích hoạt.',
    tone: 'indigo',
    mascot: 'right',
    tipTitle: 'Kiểm tra email',
    tipText: 'trước khi xác nhận người lạ.',
  },
  '/billing': {
    subtitle: 'Gói dịch vụ đang dùng, hạn sử dụng và lịch sử thanh toán.',
    tone: 'indigo',
    mascot: 'left',
    tipTitle: 'Gia hạn sớm',
    tipText: 'để không gián đoạn dịch vụ.',
  },
  courses: {
    subtitle: 'Cấu hình học phần, lớp học phần và lịch học của từng học kỳ.',
    tone: 'blue',
    mascot: 'right',
    tipTitle: 'Kiểm tra lịch học',
    tipText: 'trước khi mở học kỳ mới.',
  },
  classes: {
    subtitle: 'Phân công lớp cho nhân viên chăm sóc sinh viên.',
    tone: 'teal',
    mascot: 'left',
    tipTitle: 'Chia đều lớp',
    tipText: 'để mỗi nhân viên dễ theo dõi.',
  },
  warnings: {
    subtitle: 'Thiết lập các mức cảnh báo vắng và màu hiển thị.',
    tone: 'sunset',
    mascot: 'right',
    tipTitle: 'Mức cao nhất',
    tipText: 'thường dùng cho cấm thi.',
  },
  excel: {
    subtitle: 'Nhập danh sách sinh viên hàng loạt từ file Excel.',
    tone: 'teal',
    mascot: 'right',
    tipTitle: 'Dùng file mẫu',
    tipText: 'để nhập dữ liệu không lỗi.',
  },
  staff: {
    subtitle: 'Quản lý tài khoản, vai trò và nhân sự của hệ thống.',
    tone: 'indigo',
    mascot: 'left',
    tipTitle: 'Khóa tài khoản',
    tipText: 'khi nhân sự nghỉ việc.',
  },
  tasks: {
    subtitle: 'Giao việc cho nhân viên và theo dõi kết quả thực hiện.',
    tone: 'sunset',
    mascot: 'right',
    tipTitle: 'Đặt hạn rõ ràng',
    tipText: 'để dễ theo dõi tiến độ.',
  },
  progress: {
    subtitle: 'Theo dõi tiến độ xử lý công việc của từng nhân viên.',
    tone: 'blue',
    mascot: 'left',
    tipTitle: 'Xem ai đang',
    tipText: 'cần hỗ trợ thêm.',
  },
  analytics: {
    subtitle: 'Theo dõi hồ sơ chăm sóc, tỷ lệ vắng và sinh viên chạm mức cảnh báo.',
    tone: 'violet',
    mascot: 'right',
    tipTitle: 'Dữ liệu trực quan',
    tipText: 'tự làm mới mỗi 60 giây.',
  },
  permissions: {
    subtitle: 'Phân quyền truy cập chức năng theo từng vai trò.',
    tone: 'rose',
    mascot: 'left',
    tipTitle: 'Cấp vừa đủ quyền',
    tipText: 'cho đúng công việc.',
  },
  integrations: {
    subtitle: 'Kết nối tổng đài, AI và các dịch vụ bên ngoài.',
    tone: 'indigo',
    mascot: 'right',
    tipTitle: 'Giữ bí mật',
    tipText: 'khóa API của bạn.',
  },
  settings: {
    subtitle: 'Tùy chỉnh thông tin, giao diện và cấu hình chung của hệ thống.',
    tone: 'violet',
    mascot: 'left',
    tipTitle: 'Đổi màu, logo',
    tipText: 'cho đúng thương hiệu trường.',
  },
};

export function pageHero(key: string | null | undefined): PageHero {
  return (key && HEROES[key]) || FALLBACK;
}
