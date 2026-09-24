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
  guards/         Điều hướng theo phiên đăng nhập và vai trò
  interceptors/   Gắn token vào API và xử lý phiên hết hạn
```

Route gắn middleware phân quyền và nhận/trả dữ liệu HTTP; nghiệp vụ phức tạp (như điểm danh)
tách sang `services/`. Express 5 chuyển lỗi từ async handler đến middleware lỗi chung.

Giữ endpoint và hình dạng response hiện có khi refactor. Kiểm tra quyền ở backend;
guard Angular chỉ phục vụ điều hướng. Dùng các hằng trạng thái trong
`backend/utils/hangSo.js` để schema và validation thống nhất.

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

Sau `npm run build` ở frontend, chạy `npm start` ở backend. Express phục vụ Angular
từ `frontend/dist/frontend/browser`. `/api/health` trả 200 khi MongoDB đã kết nối,
503 khi chưa sẵn sàng. Production cần `NODE_ENV=production`, MongoDB bền vững và
`JWT_SECRET` riêng. `USE_MEMORY_DB` và `SEED_DEMO` bị chặn trong production.

Điểm danh hiện dùng ngày theo múi giờ của tiến trình Node; triển khai cần cấu hình
múi giờ nhất quán (ví dụ `Asia/Ho_Chi_Minh`). Khóa sửa cùng buổi chỉ có hiệu lực
trong một tiến trình; unique index chống bản ghi trùng, nhưng lưu điểm danh và
đồng bộ cuộc gọi chưa phải một transaction xuyên nhiều tiến trình.
