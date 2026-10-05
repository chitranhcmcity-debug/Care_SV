const NguoiDung = require('../models/NguoiDung');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const NhiemVu = require('../models/NhiemVu');
const { assert } = require('../utils/kiemTra');
const { CARE_STATUS, TASK_STATUS } = require('../utils/hangSo');
const { can, permissionsForRole } = require('../services/dichVuPhanQuyen');

const SCOPES = ['care', 'tasks'];

/** Hồ sơ chăm sóc cần người dùng xử lý: hồ sơ đang chăm sóc của chính họ (nhân viên), hoặc hồ sơ đang chờ
 *  chỉ đạo hoặc chờ duyệt kết thúc (quản lý). */
function careFilter(user) {
  const mine = { assignedStaffId: user._id, status: CARE_STATUS.IN_PROGRESS };
  if (user.role === 'admin' || !can(user, 'care.manage')) return mine;
  return { $or: [mine, { status: { $in: [CARE_STATUS.AWAITING, CARE_STATUS.CLOSING] } }] };
}

// Công việc đang chờ người dùng đăng nhập (hồ sơ chăm sóc, nhiệm vụ mới được giao hoặc bị từ chối) và số lượng
// đã thay đổi từ lần xem gần nhất — qua chuông thông báo hoặc mở trang tương ứng.
// Dùng updatedAt để hồ sơ có phản hồi mới hoặc nhiệm vụ bị từ chối được tính là mới trở lại.
async function summary(userId) {
  const user = await NguoiDung.findById(userId).select('role notificationsSeen').lean();
  user.permissions = await permissionsForRole(user.role);
  const seen = user?.notificationsSeen || {};
  const since = (at) => (at ? { updatedAt: { $gt: at } } : {});
  const callFilter = careFilter(user);
  const taskFilter = {
    assignedTo: userId,
    status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.REJECTED] },
  };
  const [callPending, callNew, taskPending, taskNew] = await Promise.all([
    HoSoChamSoc.countDocuments(callFilter),
    HoSoChamSoc.countDocuments({ ...callFilter, ...since(seen.care) }),
    NhiemVu.countDocuments(taskFilter),
    NhiemVu.countDocuments({ ...taskFilter, ...since(seen.tasks) }),
  ]);
  return {
    care: { pending: callPending, new: callNew },
    tasks: { pending: taskPending, new: taskNew },
    unseen: callNew + taskNew,
  };
}

async function getSummary(req, res, next) {
  try {
    res.json(await summary(req.user.id));
  } catch (error) {
    next(error);
  }
}

async function markSeen(req, res, next) {
  try {
    const scope = req.body?.scope;
    assert(scope === undefined || SCOPES.includes(scope), 'Loại thông báo không hợp lệ');
    const now = new Date();
    const $set = Object.fromEntries(
      (scope ? [scope] : SCOPES).map((key) => [`notificationsSeen.${key}`, now]),
    );
    await NguoiDung.updateOne({ _id: req.user.id }, { $set });
    res.json(await summary(req.user.id));
  } catch (error) {
    next(error);
  }
}

module.exports = { getSummary, markSeen };
