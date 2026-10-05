const express = require('express');
const { keepUnit } = require('../utils/donVi');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienCuocGoi');

const AUDIO_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/webm',
  'audio/ogg',
  'audio/amr',
  'audio/3gpp',
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ctrl.RECORDING_DIR),
    filename: (req, file, cb) =>
      cb(null, ctrl.randomName(path.extname(path.basename(file.originalname)).slice(0, 10))),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    AUDIO_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(
          Object.assign(new Error('Chỉ nhận file ghi âm (mp3, m4a, wav, aac, ogg, amr...)'), {
            status: 400,
          }),
        ),
});
const uploadRecording = (req, res, next) => {
  keepUnit(upload.single('file'))(req, res, (uploadError) =>
    next(
      uploadError?.code === 'LIMIT_FILE_SIZE'
        ? Object.assign(new Error('File ghi âm tối đa 50MB'), { status: 400 })
        : uploadError,
    ),
  );
};

// ======================= Callback của Stringee (công khai, do Stringee gọi) =======================
router.all('/stringee/answer', ctrl.stringeeAnswer);
router.post('/stringee/event', ctrl.stringeeEvent);

// ============================== Endpoint của ứng dụng (đã đăng nhập) ==============================
router.use(verifyToken, requireSignedIn);

// GET /api/calls/config — các phương thức gọi mà máy chủ này hỗ trợ.
router.get('/config', ctrl.getConfig);

// POST /api/calls — bắt đầu cuộc gọi tới sinh viên hoặc phụ huynh; trả về số cần gọi
// (và token client Stringee khi gọi qua tổng đài). body.record: người gọi
// đồng ý ghi âm cuộc gọi (hỏi mỗi lần).
router.post('/', ctrl.requireCaller, ctrl.startCall);

// PUT /api/calls/:id/end — kết quả, ghi chú và thời lượng khi cuộc gọi kết thúc.
router.put('/:id/end', ctrl.loadCall, ctrl.endCall);

// POST /api/calls/:id/recording — đính kèm bản ghi âm thực hiện trên điện thoại (multipart "file").
router.post('/:id/recording', ctrl.loadCall, uploadRecording, ctrl.attachRecording);

// GET /api/calls/:id/recording — phát bản ghi âm (lấy từ Stringee ở lần dùng đầu tiên).
// Người gọi nghe được cuộc gọi của mình; recordings.viewAll nghe được của mọi người.
router.get('/:id/recording', ctrl.loadCallToHear, ctrl.streamRecording);

// GET /api/calls — cuộc gọi của chính người dùng; với scope=all (recordings.viewAll) là của mọi người.
router.get('/', ctrl.listCalls);

module.exports = router;
