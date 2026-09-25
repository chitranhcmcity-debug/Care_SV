const express = require('express');
const router = express.Router();
const NguoiDung = require('../models/NguoiDung');
const NhiemVuGoiDien = require('../models/NhiemVuGoiDien');
const NhiemVu = require('../models/NhiemVu');
const { verifyToken, requireSignedIn } = require('../middleware/xacThuc');
const { CALL_STATUS, TASK_STATUS } = require('../utils/hangSo');

// The bell: work waiting for the signed-in user (call tasks not yet called, assigned tasks new
// or rejected) and how much of it appeared since they last opened the bell. updatedAt is used
// so a reassigned call task or a rejected task counts as new again.
async function summary(user) {
  const seenAt = user.notificationsSeenAt;
  const since = seenAt ? { updatedAt: { $gt: seenAt } } : {};
  const callFilter = { assignedStaffId: user._id, status: CALL_STATUS.PENDING };
  const taskFilter = {
    assignedTo: user._id,
    status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.REJECTED] },
  };
  const [callPending, callNew, taskPending, taskNew] = await Promise.all([
    NhiemVuGoiDien.countDocuments(callFilter),
    NhiemVuGoiDien.countDocuments({ ...callFilter, ...since }),
    NhiemVu.countDocuments(taskFilter),
    NhiemVu.countDocuments({ ...taskFilter, ...since }),
  ]);
  return {
    callTasks: { pending: callPending, new: callNew },
    tasks: { pending: taskPending, new: taskNew },
    unseen: callNew + taskNew,
    seenAt,
  };
}

router.use(verifyToken, requireSignedIn);

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const user = await NguoiDung.findById(req.user.id).select('notificationsSeenAt');
    res.json(await summary(user));
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/seen — the user opened the bell: everything so far is seen.
router.put('/seen', async (req, res, next) => {
  try {
    const user = await NguoiDung.findByIdAndUpdate(
      req.user.id,
      { notificationsSeenAt: new Date() },
      { returnDocument: 'after' },
    ).select('notificationsSeenAt');
    res.json(await summary(user));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
