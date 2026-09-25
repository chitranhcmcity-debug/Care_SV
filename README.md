# Care_SV

Ứng dụng MEAN quản lý điểm danh và chăm sóc sinh viên: MongoDB/Mongoose, Express 5,
Angular và Node.js. Backend dùng CommonJS; frontend dùng TypeScript và standalone components.

## Chạy development

Trên Windows, sau khi cài thư viện và cấu hình `.env` theo hướng dẫn bên dưới,
nhấp đúp `run_app.bat`. Giữ cửa sổ này mở trong khi sử dụng; nhấn `Ctrl+C` để dừng.
Trình duyệt chỉ tự mở khi giao diện và API đã sẵn sàng. Nếu khởi động thất bại,
cửa sổ giữ lại thông báo lỗi để kiểm tra.

Cần Node.js `>=24.15.0 <25` (phiên bản tham chiếu trong `.nvmrc`) và MongoDB.
Tạo `backend/.env` từ `backend/.env.example`, cấu hình `MONGO_URI` và thay
`JWT_SECRET` bằng chuỗi ngẫu nhiên ít nhất 32 ký tự. Không commit `.env`.

Terminal backend:

```powershell
cd backend
npm ci
npm run dev
```

Terminal frontend:

```powershell
cd frontend
npm ci
npm start
```

Mở `http://localhost:4201`. Angular chuyển `/api` đến Express cổng 5000 qua
`frontend/proxy.conf.json`. Nếu đổi cổng backend, cập nhật proxy tương ứng.
`API_BASE_URL` là injection token dùng chung cho các Angular service.

## Cấu trúc và quy ước

```text
backend/
  app.js          Express app, middleware, API routes và static frontend
  server.js       Kết nối database, khởi động và dừng server
  routes/         Khai báo endpoint và handler HTTP
  services/       Truy vấn, xử lý điểm danh và phân công cuộc gọi
  models/         Schema, validation và index MongoDB
  middleware/     Xác thực, phân quyền và xử lý lỗi
  scripts/        Dữ liệu mẫu và chuyển đổi dữ liệu cũ khi khởi động
  utils/          Cấu hình môi trường, hằng số nghiệp vụ, validation và tiện ích ngày
  tests/          Kiểm thử API với database tạm riêng biệt
frontend/src/app/
  components/     Standalone components và template HTML riêng
  models/         Kiểu dữ liệu và hợp đồng API
  services/       HTTP và trạng thái dùng chung
  config/         Cấu hình API qua dependency injection
  guards/         Điều hướng theo phiên đăng nhập và quyền (bảng phân quyền do admin cấu hình)
  interceptors/   Gắn token vào API và xử lý phiên hết hạn
```

Route gắn middleware phân quyền và nhận/trả dữ liệu HTTP; nghiệp vụ phức tạp (như điểm danh)
tách sang `services/`. Express 5 chuyển lỗi từ async handler đến middleware lỗi chung.

Giữ endpoint và hình dạng response hiện có khi refactor. Kiểm tra quyền ở backend;
guard Angular chỉ phục vụ điều hướng. Dùng các hằng trạng thái trong
`backend/utils/hangSo.js` để schema và validation thống nhất.

## Vai trò và nghiệp vụ

- **Admin**: quản trị hệ thống — tài khoản, phân quyền, cấu hình hệ thống, cấu hình API
  (ChatGPT (OpenAI), Stringee, SMTP; khóa mã hóa trong database, ghi đè `.env`), giao diện web (tên, logo, màu).
  Chỉ **xem** dữ liệu nghiệp vụ.
- **Trưởng phòng / Phó hiệu trưởng**: giao việc, phân lớp hành chính cho CSKH (có lịch sử),
  xử lý hàng chờ cuộc gọi chưa phân công, học phần & thời khóa biểu, cấu hình **mức cảnh báo**
  (tên, ngưỡng theo tiết hoặc % tổng số tiết, màu, mức cấm thi), điểm danh ngoài giờ.
- **Nhân viên CSKH**: chỉ thấy sinh viên các lớp hành chính được phân công; cuộc gọi của SV vắng
  tự giao cho người phụ trách lớp, lớp chưa có người thì vào hàng chờ Trưởng phòng.
- **Giảng viên**: điểm danh học phần mình dạy chỉ trong giờ học theo thời khóa biểu (mở sớm
  10 phút), sửa được đến hết ngày; mọi cuộc gọi cho sinh viên được lưu lịch sử.
- **AI Care** nhận cấu hình hiện hành (mức cảnh báo, quy định điểm danh, phân lớp) ở mỗi câu hỏi.

Quyền chi tiết nằm ở `PERMISSIONS` trong `backend/utils/hangSo.js`; admin bật/tắt cho từng vai trò.

## Kiểm tra trước khi bàn giao

```powershell
cd backend
npm test
cd ../frontend
npm test -- --watch=false
npm run build
npm run format:check
```

Backend test khởi động MongoDB tạm bằng `mongodb-memory-server`, không đọc database
trong `.env`. Lần đầu cần tải MongoDB binary. Các script `backend/test_*.js` cũ là
script thủ công, không thuộc bộ `npm test` và có thể thay đổi dữ liệu khi tự chạy.

`.editorconfig` và `.prettierrc.json` thống nhất UTF-8 và cách định dạng. Chạy
`npm run format` trong `frontend` để định dạng mã nguồn frontend và backend.

## Chạy bản build

### Tài khoản quản lý khi phát triển

Trong thư mục `backend`, chạy `npm run create:manager` để tạo tài khoản `manager`
(Trưởng phòng / Phó hiệu trưởng) trong MongoDB cấu hình bởi `.env`. Lệnh in mật khẩu
ngẫu nhiên khi tạo mới; chạy lại giữ nguyên mật khẩu và trạng thái tài khoản hiện có.
Có thể đặt `DEMO_MANAGER_PASSWORD` (8–128 ký tự) để chọn mật khẩu khi tạo; biến này
cũng tạo tài khoản quản lý khi bật `SEED_DEMO`. Script không chạy trong production.
Sau đăng nhập, tài khoản mở `/management`, mặc định là Tổng quan & cảnh báo;
các chức năng hiển thị theo quyền được quản trị viên cấp.

### Triển khai

Sau `npm run build` ở frontend, chạy `npm start` ở backend. Express phục vụ Angular
từ `frontend/dist/frontend/browser`. `/api/health` trả 200 khi MongoDB đã kết nối,
503 khi chưa sẵn sàng. Production cần `NODE_ENV=production`, MongoDB bền vững và
`JWT_SECRET` riêng. `USE_MEMORY_DB` và `SEED_DEMO` bị chặn trong production.

Điểm danh hiện dùng ngày theo múi giờ của tiến trình Node; triển khai cần cấu hình
múi giờ nhất quán (ví dụ `Asia/Ho_Chi_Minh`). Khóa sửa cùng buổi chỉ có hiệu lực
trong một tiến trình; unique index chống bản ghi trùng, nhưng lưu điểm danh và
đồng bộ cuộc gọi chưa phải một transaction xuyên nhiều tiến trình.

### Railway

`railway.json` và `package.json` ở thư mục gốc đã cấu hình sẵn: Railway chạy `npm run build`
(cài backend, cài frontend kèm devDependencies, build Angular) rồi `npm start`, health check
`/api/health`. Biến cần đặt cho service:

| Biến                            | Giá trị                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `production`                                                                      |
| `MONGO_URI`                     | chuỗi kết nối MongoDB (vd. `${{MongoDB.MONGO_URL}}` nếu dùng MongoDB của Railway) |
| `JWT_SECRET`                    | chuỗi ngẫu nhiên ≥ 32 ký tự                                                       |
| `APP_URL`                       | tên miền public của service, vd. `https://<app>.up.railway.app`                   |
| `TZ`                            | `Asia/Ho_Chi_Minh` (điểm danh tính ngày theo múi giờ tiến trình)                  |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | tài khoản admin đầu tiên (mật khẩu 12–128 ký tự), chỉ tạo khi chưa có admin       |

Gắn một Volume cho service (mount path tùy ý, vd. `/data`): file ghi âm và minh chứng được lưu
vào `<mount path>/uploads` nên không mất khi deploy lại. Không có Volume thì các file này mất sau
mỗi lần deploy. SMTP, OpenAI, Stringee, PayOS là tùy chọn (xem `backend/.env.example`).
