const express = require('express');
const controller = require('../controllers/attendanceController');
const { verifyToken, requireStaffOrAdmin } = require('../middleware/auth');
const { requireCourseAccess } = require('../middleware/access');

const router = express.Router();
router.use(verifyToken, requireStaffOrAdmin);

router.get('/course-groups', controller.listCourseGroups);
router.get('/history/:courseGroupId', requireCourseAccess, controller.getHistory);
router.get('/today/:courseGroupId', requireCourseAccess, controller.getToday);
router.get('/schedule/:courseGroupId', requireCourseAccess, controller.getSchedule);
router.put('/history/:attendanceId', requireCourseAccess, controller.updateHistory);
router.delete('/history/:attendanceId', requireCourseAccess, controller.removeHistory);
router.get('/summary/:courseGroupId', requireCourseAccess, controller.getSummary);
router.post('/submit', requireCourseAccess, controller.submit);

module.exports = router;
