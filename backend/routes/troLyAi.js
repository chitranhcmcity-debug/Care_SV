const express = require('express');
const router = express.Router();
const aiService = require('../services/dichVuTroLyAi');
const aiCare = require('../services/dichVuAiCare');
const aiActions = require('../services/dichVuAiThaoTac');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const CuocGoi = require('../models/CuocGoi');
const DiemDanh = require('../models/DiemDanh');
const SinhVien = require('../models/SinhVien');
const NhomHocPhan = require('../models/NhomHocPhan');
const NhiemVu = require('../models/NhiemVu');
const NguoiDung = require('../models/NguoiDung');
const { getWarningLevels, describeLevels } = require('../services/dichVuCanhBao');
const { TASK_STATUS, toLabel } = require('../utils/hangSo');
const { can } = require('../services/dichVuPhanQuyen');
const { assert, validateId, parseOptionalDate } = require('../utils/kiemTra');
const { staffProgress } = require('../services/dichVuTienDoNhanVien');
const { verifyToken, requirePermission, requireSignedIn } = require('../middleware/xacThuc');

// [{ _id: status, count }] for every document matching `match`.
function countByStatus(Model, match = {}) {
  return Model.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
}
const formatStatusCounts = (groups) =>
  groups.map((g) => `${toLabel(g._id)}: ${g.count}`).join(', ');

// Text-only { role, content } history resent by the client each turn.
function validateConversation(messages) {
  assert(Array.isArray(messages) && messages.length > 0, 'Cần ít nhất 1 tin nhắn');
  assert(messages.length <= 20, 'Cuộc trò chuyện quá dài, vui lòng bắt đầu lại');
  for (const m of messages) {
    assert(
      m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.trim() &&
        m.content.length <= 4000,
      'Định dạng tin nhắn không hợp lệ',
    );
  }
  assert(messages.at(-1).role === 'user', 'Tin nhắn cuối phải là câu hỏi của người dùng');
}

// GET /api/ai/care (every role) — AI Care profile for the signed-in user: what it helps with,
// which data it can look up for them, and suggested questions.
router.get('/care', verifyToken, requireSignedIn, (req, res) => {
  res.json(aiCare.profileFor(req.user));
});

// POST /api/ai/care (every role) — role-aware assistant. ChatGPT (OpenAI) looks data up through tools that
// are filtered, and scoped, by the caller's role and permissions.
router.post('/care', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    const messages = req.body?.messages;
    validateConversation(messages);
    // Actions the model prepared this turn (shown as Confirm / Cancel cards) and a page to open.
    const ctx = { actions: [], navigate: null };
    const reply = await aiService.chatWithTools({
      system: await aiCare.systemPromptFor(req.user),
      messages: messages.map(({ role, content }) => ({ role, content })),
      tools: aiCare.toolDefinitions(req.user),
      execute: (name, input) => aiCare.executeTool(req.user, name, input, ctx),
    });
    res.json({ reply, actions: ctx.actions, navigate: ctx.navigate });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/care/actions/:id/confirm — the user approved an action AI Care prepared.
router.post('/care/actions/:id/confirm', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    res.json(await aiActions.confirmAction(req.user, String(req.params.id)));
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/care/actions/:id/cancel — the user dismissed it.
router.post('/care/actions/:id/cancel', verifyToken, requireSignedIn, (req, res) => {
  aiActions.cancelAction(req.user, String(req.params.id));
  res.json({ ok: true });
});

// POST /api/ai/call-advice { careCaseId } (managers, or the staff member directed to the case)
// Suggests an opening line, questions to ask, and how to handle the situation.
router.post('/call-advice', verifyToken, requireSignedIn, async (req, res, next) => {
  try {
    const { careCaseId } = req.body ?? {};
    validateId(careCaseId);
    const careCase = await HoSoChamSoc.findById(careCaseId).populate(
      'studentId',
      'studentCode fullName classCode major',
    );
    assert(careCase, 'Không tìm thấy hồ sơ chăm sóc', 404);
    assert(
      can(req.user, 'care.manage') || String(careCase.assignedStaffId) === req.user.id,
      'Hồ sơ không thuộc về bạn',
      403,
    );
    const student = careCase.studentId;
    assert(student, 'Không tìm thấy thông tin sinh viên', 404);

    const [absentCount, priorCalls] = await Promise.all([
      DiemDanh.countDocuments({ absentStudents: student._id }),
      CuocGoi.find({ studentId: student._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('target outcome note')
        .lean(),
    ]);

    const prompt = `Sinh viên: ${student.fullName} (MSSV ${student.studentCode}, lớp ${student.classCode}, ngành ${student.major || 'chưa rõ'}).
Lý do cần chăm sóc: ${careCase.reason || '(không ghi)'}.
Tổng số buổi vắng học đã ghi nhận: ${absentCount}.
Nguyên nhân đã tìm hiểu: ${careCase.cause || '(chưa rõ)'}.
Chỉ đạo của cấp quản lý: ${careCase.directive || '(không có)'}.
Các cuộc gọi gần đây với sinh viên này:
${
  priorCalls
    .map((c) =>
      `- ${c.target === 'phu_huynh' ? 'Phụ huynh' : 'Sinh viên'}: ${c.outcome || 'chưa ghi kết quả'} ${c.note || ''}`.trim(),
    )
    .join('\n') || '(chưa từng liên hệ trước đó)'
}

Hãy đưa ra gợi ý ngắn gọn cho nhân viên chăm sóc sinh viên (CSSV) khi gọi điện cho sinh viên này, gồm 3 phần:
1. Câu mở đầu nên nói
2. 2-3 câu hỏi nên hỏi để tìm hiểu nguyên nhân
3. Hướng xử lý/khuyên nhủ phù hợp với tình huống

Trả lời bằng tiếng Việt, ngắn gọn, thực tế, không quá 150 từ.`;

    const advice = await aiService.chat({
      system:
        'Bạn là trợ lý hỗ trợ nhân viên chăm sóc sinh viên (CSSV) của một trường cao đẳng tại Việt Nam. Đưa ra lời khuyên thực tế, ngắn gọn, tôn trọng và mang tính xây dựng. Không bịa thông tin ngoài dữ liệu được cung cấp.',
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ advice });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/review-task-evidence (Admin only)
// Summarizes submitted evidence and suggests approve / needs-more-detail.
router.post(
  '/review-task-evidence',
  verifyToken,
  requirePermission('tasks.manage'),
  async (req, res, next) => {
    try {
      const { taskId } = req.body;
      validateId(taskId);
      const task = await NhiemVu.findById(taskId).populate('assignedTo', 'fullName');
      assert(task, 'Không tìm thấy nhiệm vụ', 404);
      assert(
        [TASK_STATUS.SUBMITTED, TASK_STATUS.COMPLETED, TASK_STATUS.REJECTED].includes(task.status),
        'Nhiệm vụ chưa có minh chứng để đánh giá',
      );

      const fileList = task.evidenceFiles.length
        ? task.evidenceFiles.map((f) => `${f.originalName} (${f.mimeType})`).join(', ')
        : '(không có file đính kèm)';

      const prompt = `Nhiệm vụ: "${task.title}"
Mô tả yêu cầu: ${task.description}
Người thực hiện: ${task.assignedTo?.fullName || ''}
Hạn chót: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('vi-VN') : 'không có'}

Minh chứng nhân viên đã nộp:
- Ghi chú: ${task.evidenceNote || '(không có)'}
- Link: ${task.evidenceLink || '(không có)'}
- File đính kèm: ${fileList}

Hãy đóng vai trợ lý giúp quản lý đánh giá nhanh minh chứng này. Trả lời gồm:
1. Tóm tắt 1-2 câu về những gì nhân viên đã báo cáo hoàn thành
2. Nhận xét minh chứng có đủ thuyết phục so với mô tả yêu cầu không
3. Đề xuất: DUYỆT hoặc CẦN LÀM RÕ THÊM

Trả lời bằng tiếng Việt, súc tích, dưới 120 từ.`;

      const analysis = await aiService.chat({
        system:
          'Bạn là trợ lý hỗ trợ quản lý duyệt nhiệm vụ nội bộ. Đưa ra nhận xét khách quan dựa trên nội dung được cung cấp, không suy diễn quá mức những gì không có trong minh chứng. Quyết định cuối cùng luôn thuộc về quản lý.',
        messages: [{ role: 'user', content: prompt }],
      });
      res.json({ analysis });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/ai/chat (Admin only) — stateless: the client resends the full
// conversation each turn, using the Responses API with explicit history.
router.post('/chat', verifyToken, requirePermission('ai.chat'), async (req, res, next) => {
  try {
    const { messages } = req.body;
    validateConversation(messages);

    const [totalStudents, totalCourseGroups, totalStaff, callStats, taskStats, levels] =
      await Promise.all([
        SinhVien.countDocuments(),
        NhomHocPhan.countDocuments(),
        NguoiDung.countDocuments({ role: 'staff', status: 'active' }),
        countByStatus(HoSoChamSoc),
        countByStatus(NhiemVu),
        getWarningLevels(),
      ]);

    const contextSnapshot = `Số liệu hệ thống hiện tại:
- Tổng số sinh viên: ${totalStudents}
- Tổng số học phần: ${totalCourseGroups}
- Tổng số nhân viên CSSV đang hoạt động: ${totalStaff}
- Hồ sơ chăm sóc sinh viên theo trạng thái: ${formatStatusCounts(callStats) || 'chưa có'}
- Nhiệm vụ nội bộ theo trạng thái: ${formatStatusCounts(taskStats) || 'chưa có'}
- Các mức cảnh báo vắng (tính theo tiết nghỉ):
${describeLevels(levels)}`;

    const reply = await aiService.chat({
      system: `Bạn là trợ lý AI nội bộ của hệ thống ITC SinhVien Care, hỗ trợ Quản trị viên. Trả lời dựa trên số liệu tổng quan được cung cấp dưới đây, bằng tiếng Việt, ngắn gọn. Nếu câu hỏi cần dữ liệu chi tiết hơn (VD: tên cụ thể từng sinh viên, danh sách chi tiết), hãy gợi ý người dùng vào đúng trang chức năng trong hệ thống để xem thay vì bịa số liệu.\n\n${contextSnapshot}`,
      messages,
    });
    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/staff-performance { staffId, from?, to? } (Trưởng phòng / PHT)
// AI nhận xét năng lực nhân viên dựa trên số liệu khách quan (tiến độ, đúng hạn, chất lượng,
// chăm sóc sinh viên) kèm KPI tham khảo do hệ thống tính.
router.post(
  '/staff-performance',
  verifyToken,
  requirePermission('tasks.manage'),
  async (req, res, next) => {
    try {
      const { staffId, from: fromText, to: toText } = req.body ?? {};
      validateId(staffId);
      const from = parseOptionalDate(fromText, 'Ngày bắt đầu không hợp lệ');
      const to = parseOptionalDate(toText, 'Ngày kết thúc không hợp lệ');
      const [row] = await staffProgress({ from, to, staffId });
      assert(row, 'Không tìm thấy nhân viên', 404);

      const recent = await NhiemVu.find({
        assignedTo: staffId,
        status: { $in: [TASK_STATUS.COMPLETED, TASK_STATUS.REJECTED] },
      })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select('title category priority status reviewScore reviewNote reworkCount')
        .lean();

      const { tasks: t, care: c, rates } = row;
      const pct = (value) => (value === null ? 'chưa có dữ liệu' : `${value}%`);
      const categories =
        Object.entries(t.byCategory)
          .map(([code, v]) => `- ${toLabel(code)}: ${v.completed}/${v.total} hoàn thành`)
          .join('\n') || '(chưa có)';
      const reviews =
        recent
          .map(
            (r) =>
              `- [${toLabel(r.category)} · ưu tiên ${toLabel(r.priority)}] "${r.title}": ${toLabel(r.status)}` +
              (r.reviewScore ? `, điểm ${r.reviewScore}/5` : '') +
              (r.reworkCount ? `, làm lại ${r.reworkCount} lần` : '') +
              (r.reviewNote ? ` — nhận xét: "${r.reviewNote.slice(0, 200)}"` : ''),
          )
          .join('\n') || '(chưa có)';
      const period =
        from || to
          ? `từ ${from ? from.toLocaleDateString('vi-VN') : 'đầu'} đến ${to ? to.toLocaleDateString('vi-VN') : 'nay'}`
          : 'toàn bộ thời gian';

      const prompt = `Nhân viên: ${row.staff.fullName} (${row.staff.email}) — kỳ đánh giá: ${period}

CÔNG VIỆC ĐƯỢC GIAO (tổng ${t.total}):
- Hoàn thành: ${t.completed} (đúng hạn ${t.completedOnTime}, trễ hạn ${t.completedLate})
- Đang thực hiện / chưa nhận: ${t.open}, tiến độ trung bình việc đang làm: ${t.avgProgress ?? 0}%
- Chờ duyệt: ${t.waitingReview}
- Quá hạn chưa xong: ${t.overdue}; việc ưu tiên cao/khẩn cấp còn tồn: ${t.urgentOpen}
- Số lần bị yêu cầu làm lại: ${t.reworkCount}
- Điểm chất lượng trung bình: ${t.avgScore ?? 'chưa chấm'}${t.avgScore ? '/5' : ''} (${t.scoredCount} việc được chấm)
- Thời gian hoàn thành trung bình: ${t.avgCompletionDays ?? '—'} ngày
Theo loại công việc:
${categories}

CHĂM SÓC SINH VIÊN (tổng ${c.total} hồ sơ được giao): đang chăm sóc ${c.inProgress}, chờ duyệt kết thúc ${c.closing}, đã kết thúc ${c.closed} (trong đó ${c.improved} hồ sơ sinh viên tiến bộ / ổn định); đã làm ${c.stepsDone}/${c.stepsTotal} bước chăm sóc.

TỶ LỆ: hoàn thành ${pct(rates.completion)}, đúng hạn ${pct(rates.onTime)}, chất lượng ${pct(rates.quality)}, bước chăm sóc đã làm ${pct(rates.care)}.
KPI tham khảo do hệ thống tính: ${row.kpiScore ?? 'chưa đủ dữ liệu'}${row.kpiScore === null ? '' : '/100'} (${row.kpiRating}).

Nhận xét gần đây của người duyệt:
${reviews}

Hãy đánh giá năng lực nhân viên này theo đúng 4 mục, mỗi mục 1–3 gạch đầu dòng:
1. Đánh giá chung (xếp loại và lý do chính)
2. Điểm mạnh
3. Điểm cần cải thiện
4. Đề xuất (phân công, đào tạo, hỗ trợ phù hợp)
Chỉ dựa trên số liệu trên, không suy đoán hoàn cảnh cá nhân. Nếu dữ liệu quá ít, nói rõ là chưa đủ cơ sở. Trả lời tiếng Việt, không quá 250 từ.`;

      const assessment = await aiService.chat({
        system:
          'Bạn là trợ lý nhân sự giúp Trưởng phòng / Phó hiệu trưởng đánh giá năng lực nhân viên một cách công bằng, khách quan, mang tính xây dựng, chỉ dựa trên số liệu được cung cấp.',
        messages: [{ role: 'user', content: prompt }],
      });
      res.json({ assessment, metrics: row, from, to });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
