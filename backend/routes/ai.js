const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const aiService = require('../services/aiService');
const CallTask = require('../models/CallTask');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const CourseGroup = require('../models/CourseGroup');
const Task = require('../models/Task');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const { TASK_STATUS } = require('../constants/taskStatus');
const { assert, validateId } = require('../utils/validation');
const { verifyToken, requireAdmin, requireStaffOrAdmin } = require('../middleware/auth');

// [{ _id: status, count }] for every document matching `match`.
function countByStatus(Model, match = {}) {
  return Model.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
}
const formatStatusCounts = (groups) => groups.map((g) => `${g._id}: ${g.count}`).join(', ');

// POST /api/ai/call-advice (Admin, or the staff assigned to the call task)
// Suggests an opening line, questions to ask, and how to handle the situation.
router.post('/call-advice', verifyToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const { callTaskId } = req.body;
    validateId(callTaskId);
    const task = await CallTask.findById(callTaskId)
      .populate('studentId', 'studentCode fullName classCode major')
      .populate('courseGroupId', 'groupCode courseName');
    assert(task, 'Không tìm thấy nhiệm vụ cuộc gọi', 404);
    assert(
      req.user.role === 'admin' || String(task.assignedStaffId) === req.user.id,
      'Nhiệm vụ không thuộc về bạn',
      403,
    );
    const student = task.studentId;
    assert(student, 'Không tìm thấy thông tin sinh viên', 404);

    const [absentCount, priorCallTasks] = await Promise.all([
      Attendance.countDocuments({ absentStudents: student._id }),
      CallTask.find({ studentId: student._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('status callNote absenceReasonCategory')
        .lean(),
    ]);

    const prompt = `Sinh viên: ${student.fullName} (MSSV ${student.studentCode}, lớp ${student.classCode}, ngành ${student.major || 'chưa rõ'}).
Học phần đang vắng: ${task.courseGroupId?.courseName || ''} (${task.courseGroupId?.groupCode || ''}).
Tổng số buổi vắng học đã ghi nhận: ${absentCount}.
Số lần đã gọi cho nhiệm vụ này: ${task.callAttempts || 0}.
Trạng thái hiện tại: ${task.status}.
Ghi chú cuộc gọi hiện có: ${task.callNote || '(chưa có)'}.
Lịch sử liên hệ gần đây với sinh viên này:
${
  priorCallTasks
    .map((t) => `- [${t.status}] ${t.absenceReasonCategory || ''} ${t.callNote || ''}`.trim())
    .join('\n') || '(chưa từng liên hệ trước đó)'
}

Hãy đưa ra gợi ý ngắn gọn cho nhân viên chăm sóc sinh viên (CSKH) khi gọi điện cho sinh viên này, gồm 3 phần:
1. Câu mở đầu nên nói
2. 2-3 câu hỏi nên hỏi để tìm hiểu lý do vắng
3. Hướng xử lý/khuyên nhủ phù hợp với tình huống

Trả lời bằng tiếng Việt, ngắn gọn, thực tế, không quá 150 từ.`;

    const advice = await aiService.chat({
      system:
        'Bạn là trợ lý hỗ trợ nhân viên chăm sóc sinh viên (CSKH) của một trường cao đẳng tại Việt Nam. Đưa ra lời khuyên thực tế, ngắn gọn, tôn trọng và mang tính xây dựng. Không bịa thông tin ngoài dữ liệu được cung cấp.',
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ advice });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/review-task-evidence (Admin only)
// Summarizes submitted evidence and suggests approve / needs-more-detail.
router.post('/review-task-evidence', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { taskId } = req.body;
    validateId(taskId);
    const task = await Task.findById(taskId).populate('assignedTo', 'fullName');
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
});

// POST /api/ai/chat (Admin only) — stateless: the client resends the full
// conversation each turn, same pattern the Messages API itself uses.
router.post('/chat', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { messages } = req.body;
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

    const [totalStudents, totalCourseGroups, totalStaff, callStats, taskStats, settings] =
      await Promise.all([
        Student.countDocuments(),
        CourseGroup.countDocuments(),
        User.countDocuments({ role: 'staff', status: 'active' }),
        countByStatus(CallTask),
        countByStatus(Task),
        SystemSettings.findOne(),
      ]);

    const contextSnapshot = `Số liệu hệ thống hiện tại:
- Tổng số sinh viên: ${totalStudents}
- Tổng số học phần: ${totalCourseGroups}
- Tổng số nhân viên CSKH đang hoạt động: ${totalStaff}
- Nhiệm vụ gọi điện theo trạng thái: ${formatStatusCounts(callStats) || 'chưa có'}
- Nhiệm vụ nội bộ theo trạng thái: ${formatStatusCounts(taskStats) || 'chưa có'}
- Ngưỡng cảnh báo cấm thi: ${settings?.examBanThreshold ?? 3} buổi vắng`;

    const reply = await aiService.chat({
      system: `Bạn là trợ lý AI nội bộ của hệ thống ITC Student Care, hỗ trợ Quản trị viên. Trả lời dựa trên số liệu tổng quan được cung cấp dưới đây, bằng tiếng Việt, ngắn gọn. Nếu câu hỏi cần dữ liệu chi tiết hơn (VD: tên cụ thể từng sinh viên, danh sách chi tiết), hãy gợi ý người dùng vào đúng trang chức năng trong hệ thống để xem thay vì bịa số liệu.\n\n${contextSnapshot}`,
      messages,
    });
    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

// POST /api/ai/staff-performance (Admin only)
router.post('/staff-performance', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { staffId } = req.body;
    validateId(staffId);
    const staffObjectId = new mongoose.Types.ObjectId(staffId);
    const [staff, callGroups, workGroups] = await Promise.all([
      User.findById(staffId),
      CallTask.aggregate([
        { $match: { assignedStaffId: staffObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 }, attempts: { $sum: '$callAttempts' } } },
      ]),
      countByStatus(Task, { assignedTo: staffObjectId }),
    ]);
    assert(staff && staff.role === 'staff', 'Không tìm thấy nhân viên', 404);

    const sum = (groups, key) => groups.reduce((total, g) => total + g[key], 0);
    const totalCallTasks = sum(callGroups, 'count');
    const avgCallAttempts = totalCallTasks
      ? (sum(callGroups, 'attempts') / totalCallTasks).toFixed(1)
      : '0';
    const toStatusMap = (groups) => Object.fromEntries(groups.map((g) => [g._id, g.count]));
    const listStatusCounts = (groups) =>
      groups.map((g) => `- ${g._id}: ${g.count}`).join('\n') || '(chưa có)';

    const prompt = `Nhân viên: ${staff.fullName} (${staff.email})

Thống kê nhiệm vụ gọi điện chăm sóc sinh viên (tổng ${totalCallTasks} nhiệm vụ):
${listStatusCounts(callGroups)}
Số lần gọi trung bình mỗi nhiệm vụ: ${avgCallAttempts}

Thống kê nhiệm vụ nội bộ được giao (tổng ${sum(workGroups, 'count')} nhiệm vụ):
${listStatusCounts(workGroups)}

Hãy đưa ra nhận xét ngắn gọn về hiệu suất làm việc của nhân viên này dựa trên số liệu trên, gồm:
1. Điểm mạnh
2. Điểm cần cải thiện (nếu có)
Không suy diễn nguyên nhân cá nhân, chỉ nhận xét dựa trên số liệu khách quan. Trả lời tiếng Việt, dưới 120 từ.`;

    const assessment = await aiService.chat({
      system:
        'Bạn là trợ lý hỗ trợ Quản trị viên đánh giá hiệu suất làm việc dựa trên số liệu khách quan, công bằng, mang tính xây dựng, không suy đoán quá mức.',
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({
      assessment,
      stats: {
        callTasks: toStatusMap(callGroups),
        workTasks: toStatusMap(workGroups),
        avgCallAttempts,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
