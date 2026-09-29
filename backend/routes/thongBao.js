const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const HoSoChamSoc = require('../models/HoSoChamSoc');
const NhiemVu = require('../models/NhiemVu');
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const { assert } = require('../utils/kiemTra');
const { CARE_STATUS, TASK_STATUS } = require('../utils/hangSo');
const { can, permissionsForRole } = require('../services/dichVuPhanQuyen');

const SCOPES = ['care', 'tasks'];

/** Care cases that need the user: their own cases in progress (staff), or cases waiting for a
 *  directive or a closing approval (managers). */
function careFilter(user) {
  const mine = { assignedStaffId: user._id, status: CARE_STATUS.IN_PROGRESS };
  if (user.role === 'admin' || !can(user, 'care.manage')) return mine;
  return { $or: [mine, { status: { $in: [CARE_STATUS.AWAITING, CARE_STATUS.CLOSING] } }] };
}

// Work waiting for the signed-in user (care cases, assigned tasks new or rejected) and how much of
// it changed since they last looked at it — through the bell, or by opening that kind's page.
// updatedAt is used so a case with a new reply or a rejected task counts as new again.
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

router.use(verifyToken, requireSignedIn);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    res.json(await summary(req.user.id));
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/seen — body { scope?: 'care' | 'tasks' }; no scope = the bell,
// which marks every kind as seen.
router.put('/seen', async (req, res, next) => {
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
});

module.exports = router;
