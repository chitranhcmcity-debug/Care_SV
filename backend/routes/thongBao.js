const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const NhiemVu = require('../models/NhiemVu');
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const { assert } = require('../utils/kiemTra');
const { CALL_STATUS, TASK_STATUS } = require('../utils/hangSo');

const SCOPES = ['callTasks', 'tasks'];

// Work waiting for the signed-in user (call tasks not yet called, assigned tasks new or rejected)
// and how much of it appeared since they last looked at it — through the bell, or by opening that
// kind's page. updatedAt is used so a reassigned call task or a rejected task counts as new again.
async function summary(userId) {
  const user = await NguoiDung.findById(userId).select('notificationsSeen').lean();
  const seen = user?.notificationsSeen || {};
  const since = (at) => (at ? { updatedAt: { $gt: at } } : {});
  const callFilter = { assignedStaffId: userId, status: CALL_STATUS.PENDING };
  const taskFilter = {
    assignedTo: userId,
    status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.REJECTED] },
  };
  const [callPending, callNew, taskPending, taskNew] = await Promise.all([
    NhiemVuGoiDien.countDocuments(callFilter),
    NhiemVuGoiDien.countDocuments({ ...callFilter, ...since(seen.callTasks) }),
    NhiemVu.countDocuments(taskFilter),
    NhiemVu.countDocuments({ ...taskFilter, ...since(seen.tasks) }),
  ]);
  return {
    callTasks: { pending: callPending, new: callNew },
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

// PUT /api/notifications/seen — body { scope?: 'callTasks' | 'tasks' }; no scope = the bell,
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
