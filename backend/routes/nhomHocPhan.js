const express = require('express');
const router = express.Router();
const { verifyToken, requirePermission, requireSignedIn } = require('../middleware/xacThuc');
const ctrl = require('../controllers/dieuKhienNhomHocPhan');

const manage = [verifyToken, requirePermission('courses.manage')];

// GET /api/course-groups/timetable (every role) — schedule only, no student personal data.
router.get('/timetable', verifyToken, requireSignedIn, ctrl.getTimetable);

// GET /api/course-groups (List all course groups with student & teacher details)
router.get('/', verifyToken, requirePermission('courses.manage', 'excel.import'), ctrl.list);

// POST /api/course-groups (Create new Course Group with schedule & teacher)
router.post('/', ...manage, ctrl.create);

// PUT /api/course-groups/:id (Update Course Group schedule & info)
router.put('/:id', ...manage, ctrl.update);

// DELETE /api/course-groups/:id (Delete Course Group)
router.delete('/:id', ...manage, ctrl.remove);

// POST /api/course-groups/:id/assign-student (Enroll individual student by MSSV or ID)
router.post('/:id/assign-student', ...manage, ctrl.assignStudent);

// DELETE /api/course-groups/:id/remove-student/:studentId (Unenroll student)
router.delete('/:id/remove-student/:studentId', ...manage, ctrl.removeStudent);

// POST /api/course-groups/:id/assign-class (Enroll all students of an entire Class into this Course Group)
router.post('/:id/assign-class', ...manage, ctrl.assignClass);

module.exports = router;
