const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const CuocGoi = require('../models/CuocGoi');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const stringee = require('../services/dichVuStringee');
const { verifyToken, requireSignedIn, requireOperator } = require('../middleware/xacThuc');
const { canAccessStudent } = require('../middleware/phanQuyen');
const { assert, validateId } = require('../utils/kiemTra');
const { getAppUrl, getUploadDir } = require('../utils/moiTruong');

// ---- Recordings live on disk and are only served through the authenticated route below.
const RECORDING_DIR = path.join(getUploadDir(), 'recordings');
fs.mkdirSync(RECORDING_DIR, { recursive: true });
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
const EXT_BY_MIME = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav' };
const randomName = (ext) => `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, RECORDING_DIR),
    filename: (req, file, cb) =>
      cb(null, randomName(path.extname(path.basename(file.originalname)).slice(0, 10))),
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
const removeRecording = (recording) => {
  if (recording?.storedName) fs.unlink(path.join(RECORDING_DIR, recording.storedName), () => {});
};

const MAX_CALL_SEC = 4 * 60 * 60;
const OUTCOMES = ['', 'nghe_may', 'khong_nghe_may', 'may_ban', 'sai_so'];
// A Stringee call must reach answer_url shortly after its log was created.
const STRINGEE_ANSWER_WINDOW_MS = 10 * 60 * 1000;

const callPopulation = [
  { path: 'callerId', select: 'fullName email role' },
  { path: 'studentId', select: 'studentCode fullName classCode' },
  { path: 'courseGroupId', select: 'groupCode courseName' },
];

/** Loads :id; only the caller may read or change a call. */
const loadCall = async (req, res, next) => {
  try {
    validateId(req.params.id);
    const call = await CuocGoi.findById(req.params.id);
    assert(call, 'Không tìm thấy cuộc gọi', 404);
    assert(String(call.callerId) === req.user.id, 'Bạn không có quyền với cuộc gọi này', 403);
    req.call = call;
    next();
  } catch (error) {
    next(error);
  }
};

// ======================= Stringee callbacks (public, called by Stringee) =======================

// answer_url: Stringee asks what to do with an outgoing browser call. We only connect calls
// that match a fresh call log made by the same user for the same number — so a leaked client
// token cannot be used to dial arbitrary numbers on the school's hotline.
router.all('/stringee/answer', async (req, res) => {
  const params = { ...req.query, ...(typeof req.body === 'object' ? req.body : {}) };
  try {
    const custom = typeof params.custom === 'string' ? JSON.parse(params.custom) : params.custom;
    const callLogId = custom?.callLogId;
    if (!stringee.isConfigured() || !/^[a-f\d]{24}$/i.test(String(callLogId))) return res.json([]);
    const call = await CuocGoi.findById(callLogId);
    const valid =
      call &&
      call.method === 'stringee' &&
      call.status === 'dang_goi' &&
      Date.now() - call.createdAt.getTime() < STRINGEE_ANSWER_WINDOW_MS &&
      String(call.callerId) === String(params.userId || params.from) &&
      stringee.toInternational(params.to) === stringee.toInternational(call.phoneNumber);
    if (!valid) return res.json([]);
    if (params.callId && !call.stringeeCallId) {
      call.stringeeCallId = String(params.callId);
      await call.save();
    }
    res.json(
      stringee.recordAndConnect({
        to: call.phoneNumber,
        eventUrl: `${getAppUrl()}/api/calls/stringee/event`,
      }),
    );
  } catch {
    res.json([]); // malformed request → no call
  }
});

// event_url: call/recording events. Nothing to trust here; recordings are fetched on demand.
router.post('/stringee/event', (req, res) => res.json({ ok: true }));

// ============================== App endpoints (signed in) ==============================
router.use(verifyToken, requireSignedIn);

// GET /api/calls/config — which call methods this server supports.
router.get('/config', (req, res) => {
  res.json({ stringee: stringee.isConfigured(), hotline: stringee.hotline() });
});

// POST /api/calls — start a call to a student or their parent; returns the number to dial
// (and a Stringee client token when calling through the switchboard).
router.post('/', requireOperator, async (req, res, next) => {
  try {
    const { studentId, target, method, callTaskId, courseGroupId } = req.body ?? {};
    validateId(studentId);
    assert(['sinh_vien', 'phu_huynh'].includes(target), 'Chọn gọi sinh viên hoặc phụ huynh');
    assert(['dien_thoai', 'stringee'].includes(method), 'Phương thức gọi không hợp lệ');
    assert(
      method !== 'stringee' || stringee.isConfigured(),
      'Máy chủ chưa cấu hình tổng đài Stringee',
      503,
    );

    const student = await SinhVien.findById(studentId);
    assert(student, 'Không tìm thấy sinh viên', 404);
    assert(
      await canAccessStudent(req.user, student),
      'Bạn không được phân công sinh viên này',
      403,
    );
    const phoneNumber = (target === 'phu_huynh' ? student.parentPhone : student.phone)?.trim();
    assert(
      phoneNumber,
      target === 'phu_huynh' ? 'Sinh viên chưa có SĐT phụ huynh' : 'Sinh viên chưa có SĐT',
    );

    // Optional context must belong to the same student / the caller.
    if (callTaskId) {
      validateId(callTaskId);
      assert(
        await NhiemVuGoiDien.exists({ _id: callTaskId, studentId: student._id }),
        'Nhiệm vụ gọi điện không khớp sinh viên',
      );
    }
    if (courseGroupId) {
      validateId(courseGroupId);
      const group = await NhomHocPhan.findById(courseGroupId);
      assert(
        group && group.students.some((s) => String(s) === String(student._id)),
        'Học phần không khớp sinh viên',
      );
      assert(
        req.user.role !== 'teacher' || String(group.teacherId) === req.user.id,
        'Bạn không được phân công học phần này',
        403,
      );
    }

    const call = await CuocGoi.create({
      callerId: req.user.id,
      callerRole: req.user.role,
      studentId: student._id,
      target,
      phoneNumber,
      method,
      callTaskId: callTaskId || null,
      courseGroupId: courseGroupId || null,
    });
    res.status(201).json({
      call,
      phoneNumber,
      stringee:
        method === 'stringee'
          ? {
              accessToken: stringee.clientToken(req.user.id),
              from: stringee.hotline(),
              to: stringee.toInternational(phoneNumber),
            }
          : null,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/calls/:id/end — outcome, note and duration once the call is over.
router.put('/:id/end', loadCall, async (req, res, next) => {
  try {
    const { outcome = '', note = '', durationSec, stringeeCallId } = req.body ?? {};
    assert(OUTCOMES.includes(outcome), 'Kết quả cuộc gọi không hợp lệ');
    assert(typeof note === 'string' && note.length <= 2000, 'Ghi chú tối đa 2000 ký tự');
    const call = req.call;
    if (call.status === 'dang_goi') {
      call.endedAt = new Date();
      const measured = Number(durationSec);
      call.durationSec = Math.round(
        Number.isFinite(measured) && measured >= 0
          ? Math.min(measured, MAX_CALL_SEC)
          : Math.min((call.endedAt - call.startedAt) / 1000, MAX_CALL_SEC),
      );
      call.status = 'ket_thuc';
    }
    call.outcome = outcome;
    call.note = note.trim();
    if (typeof stringeeCallId === 'string' && stringeeCallId && !call.stringeeCallId)
      call.stringeeCallId = stringeeCallId.slice(0, 100);
    await call.save();
    res.json({ call: await call.populate(callPopulation) });
  } catch (error) {
    next(error);
  }
});

// POST /api/calls/:id/recording — attach a recording made on the phone (multipart "file").
router.post('/:id/recording', loadCall, (req, res, next) => {
  upload.single('file')(req, res, async (uploadError) => {
    try {
      if (uploadError)
        throw uploadError.code === 'LIMIT_FILE_SIZE'
          ? Object.assign(new Error('File ghi âm tối đa 50MB'), { status: 400 })
          : uploadError;
      assert(req.file, 'Chưa chọn file ghi âm');
      const previous = req.call.recording;
      req.call.recording = {
        storedName: req.file.filename,
        originalName: path.basename(req.file.originalname).slice(0, 200),
        mimeType: req.file.mimetype,
        size: req.file.size,
        source: 'tai_len',
      };
      await req.call.save();
      removeRecording(previous);
      res.json({ call: await req.call.populate(callPopulation) });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(error);
    }
  });
});

// GET /api/calls/:id/recording — stream the recording (fetched from Stringee on first use).
router.get('/:id/recording', loadCall, async (req, res, next) => {
  try {
    const call = req.call;
    if (!call.recording && call.stringeeCallId) {
      const downloaded = await stringee.downloadRecording(call.stringeeCallId);
      if (downloaded) {
        const storedName = randomName(EXT_BY_MIME[downloaded.mimeType] || '.mp3');
        await fs.promises.writeFile(path.join(RECORDING_DIR, storedName), downloaded.buffer);
        call.recording = {
          storedName,
          originalName: `stringee-${call.stringeeCallId}.mp3`,
          mimeType: downloaded.mimeType,
          size: downloaded.buffer.length,
          source: 'stringee',
        };
        await call.save();
      }
    }
    assert(call.recording, 'Cuộc gọi chưa có bản ghi âm', 404);
    res.setHeader('Content-Type', call.recording.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path.join(RECORDING_DIR, call.recording.storedName), (err) => {
      if (err) next(err);
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/calls — history of the signed-in user's own calls, whatever their role.
// Query: studentId, page, limit.
router.get('/', async (req, res, next) => {
  try {
    const { studentId } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const filter = { callerId: req.user.id };
    if (studentId) {
      validateId(studentId);
      filter.studentId = studentId;
    }
    const [items, total] = await Promise.all([
      CuocGoi.find(filter)
        .populate(callPopulation)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CuocGoi.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
