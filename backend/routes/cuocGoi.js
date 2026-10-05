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

// ======================= Stringee callbacks (public, called by Stringee) =======================
router.all('/stringee/answer', ctrl.stringeeAnswer);
router.post('/stringee/event', ctrl.stringeeEvent);

// ============================== App endpoints (signed in) ==============================
router.use(verifyToken, requireSignedIn);

// GET /api/calls/config — which call methods this server supports.
router.get('/config', ctrl.getConfig);

// POST /api/calls — start a call to a student or their parent; returns the number to dial
// (and a Stringee client token when calling through the switchboard). body.record: the caller
// agreed to record the call (asked every time).
router.post('/', ctrl.requireCaller, ctrl.startCall);

// PUT /api/calls/:id/end — outcome, note and duration once the call is over.
router.put('/:id/end', ctrl.loadCall, ctrl.endCall);

// POST /api/calls/:id/recording — attach a recording made on the phone (multipart "file").
router.post('/:id/recording', ctrl.loadCall, uploadRecording, ctrl.attachRecording);

// GET /api/calls/:id/recording — stream the recording (fetched from Stringee on first use).
// The caller hears their own calls; recordings.viewAll hears everyone's.
router.get('/:id/recording', ctrl.loadCallToHear, ctrl.streamRecording);

// GET /api/calls — the signed-in user's own calls; with scope=all (recordings.viewAll) everyone's.
router.get('/', ctrl.listCalls);

module.exports = router;
