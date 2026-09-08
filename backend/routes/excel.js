const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const Student = require('../models/Student');
const CourseGroup = require('../models/CourseGroup');
const { verifyToken, requireAdmin } = require('../middleware/auth');

// Multer memory storage configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// =========================================================
// GET /api/excel/course-template
// Xuất file Excel mẫu theo từng học phần đã cấu hình
// Mỗi sheet = 1 groupCode, pre-fill SV hiện có
// =========================================================
router.get('/course-template', async (req, res, next) => {
  try {
    const courseGroups = await CourseGroup.find({})
      .populate('students', 'studentCode fullName phone parentPhone classCode')
      .sort({ groupCode: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ITC Student Care System';
    workbook.created = new Date();

    if (courseGroups.length === 0) {
      // Tạo sheet mẫu nếu chưa có học phần nào
      const sheet = workbook.addWorksheet('VD_MMT_HK1_26.27');
      setupCourseSheetColumns(sheet, 'VD_MMT_HK1_26.27');
      sheet.addRow({
        studentCode: '501250001',
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        parentPhone: '0987654321',
      });
    } else {
      for (const group of courseGroups) {
        // Excel worksheet name max 31 chars, clean special chars
        const sheetName = (group.groupCode || 'HocPhan')
          .replace(/[*?:/\\[\]]/g, '_')
          .substring(0, 31);

        const sheet = workbook.addWorksheet(sheetName);
        setupCourseSheetColumns(sheet, group.groupCode, group.courseName);

        // Pre-fill sinh viên đã đăng ký
        const students = Array.isArray(group.students) ? group.students : [];
        for (const st of students) {
          if (!st || typeof st !== 'object') continue;
          sheet.addRow({
            studentCode: st.studentCode || '',
            fullName: st.fullName || '',
            phone: st.phone || '',
            parentPhone: st.parentPhone || '',
          });
        }

        // Nếu chưa có SV thì thêm dòng mẫu
        if (students.length === 0) {
          const exRow = sheet.addRow({
            studentCode: '501250001',
            fullName: 'Nguyễn Văn A (Ví dụ)',
            phone: '0901234567',
            parentPhone: '0987654321',
          });
          exRow.font = { italic: true, color: { argb: 'FF9CA3AF' } };
        }
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Mau_Nhap_SV_Theo_HocPhan_${new Date().toISOString().split('T')[0]}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

function setupCourseSheetColumns(sheet, groupCode, courseName) {
  // Title row
  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `DANH SÁCH SINH VIÊN - ${groupCode}${courseName ? ' | ' + courseName : ''}`;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 25;

  // Header row 2
  sheet.columns = [
    { key: 'studentCode', width: 16 },
    { key: 'fullName', width: 30 },
    { key: 'phone', width: 18 },
    { key: 'parentPhone', width: 18 },
  ];

  const headerRow = sheet.getRow(2);
  headerRow.values = ['MSSV (Mã Sinh Viên)', 'Họ và Tên', 'SĐT Sinh Viên', 'SĐT Phụ Huynh'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  // Instruction row 3
  const instrRow = sheet.getRow(3);
  instrRow.values = ['← Bắt buộc (9 số)', '← Bắt buộc', '← Có thể để trống', '← Có thể để trống'];
  instrRow.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
  instrRow.height = 16;

  // Override columns to start data at row 4
  sheet._headerRowCount = 3;
}

// =========================================================
// POST /api/excel/import-by-course
// Upload Excel nhiều sheet (mỗi sheet = 1 groupCode)
// Tạo/cập nhật SV và gán vào học phần tương ứng
// =========================================================
router.post(
  '/import-by-course',
  verifyToken,
  requireAdmin,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'Vui lòng tải lên file Excel hợp lệ' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      let totalStudents = 0;
      let newStudents = 0;
      let updatedStudents = 0;
      let assignedCount = 0;
      const sheetResults = [];
      const errors = [];

      for (const worksheet of workbook.worksheets) {
        const sheetName = worksheet.name.trim();

        // Tìm CourseGroup tương ứng với tên sheet
        const courseGroup = await CourseGroup.findOne({
          groupCode: { $regex: new RegExp('^' + escapeRegex(sheetName) + '$', 'i') },
        });

        if (!courseGroup) {
          errors.push(
            `Sheet "${sheetName}": Không tìm thấy học phần với mã "${sheetName}" trong hệ thống. Bỏ qua.`,
          );
          continue;
        }

        let sheetStudentCount = 0;
        let sheetNewCount = 0;
        let sheetAssigned = 0;

        // Tìm header row (có chứa "MSSV" hoặc "mã")
        let headerRowIndex = -1;
        let colMap = {}; // colNumber → fieldName

        worksheet.eachRow((row, rowNumber) => {
          if (headerRowIndex !== -1) return;
          let foundHeader = false;
          row.eachCell((cell, colNumber) => {
            const val = String(cell.value || '')
              .trim()
              .toLowerCase();
            if (val.includes('mssv') || val.includes('mã sv') || val.includes('mã sinh viên')) {
              foundHeader = true;
              colMap[colNumber] = 'studentCode';
            } else if (val.includes('họ và tên') || val.includes('họ tên') || val.includes('tên')) {
              colMap[colNumber] = 'fullName';
            } else if ((val.includes('sđt') || val.includes('điện thoại')) && val.includes('phụ')) {
              colMap[colNumber] = 'parentPhone';
            } else if (val.includes('sđt') || val.includes('điện thoại')) {
              colMap[colNumber] = 'phone';
            }
          });
          if (foundHeader) headerRowIndex = rowNumber;
        });

        if (headerRowIndex === -1) {
          // Fallback: assume row 2 is header (after title)
          headerRowIndex = 2;
          const headerRow = worksheet.getRow(2);
          headerRow.eachCell((cell, colNumber) => {
            const val = String(cell.value || '')
              .trim()
              .toLowerCase();
            if (val.includes('mssv') || val.includes('mã')) colMap[colNumber] = 'studentCode';
            else if (val.includes('tên')) colMap[colNumber] = 'fullName';
            else if (val.includes('phụ')) colMap[colNumber] = 'parentPhone';
            else if (val.includes('sđt') || val.includes('phone')) colMap[colNumber] = 'phone';
          });
        }

        // Process data rows
        for (let r = headerRowIndex + 1; r <= worksheet.rowCount + 1; r++) {
          const row = worksheet.getRow(r);
          if (!row || row.values.length === 0) continue;

          let studentCode = '';
          let fullName = '';
          let phone = '';
          let parentPhone = '';

          // If no colMap found, use positional: col1=MSSV, col2=Name, col3=phone, col4=parentPhone
          if (Object.keys(colMap).length === 0) {
            const vals = row.values;
            studentCode = String(vals[1] || '').trim();
            fullName = String(vals[2] || '').trim();
            phone = String(vals[3] || '').trim();
            parentPhone = String(vals[4] || '').trim();
          } else {
            row.eachCell((cell, colNumber) => {
              const field = colMap[colNumber];
              const val =
                cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
              if (field === 'studentCode') studentCode = val;
              else if (field === 'fullName') fullName = val;
              else if (field === 'phone') phone = val;
              else if (field === 'parentPhone') parentPhone = val;
            });
          }

          // Skip invalid/example rows
          if (!studentCode || studentCode.length < 5) continue;
          if (fullName.includes('Ví dụ') || fullName.includes('Example')) continue;

          try {
            const isNew = !(await Student.findOne({ studentCode }));
            const student = await Student.findOneAndUpdate(
              { studentCode },
              {
                $set: {
                  ...(fullName ? { fullName } : {}),
                  ...(phone !== undefined ? { phone } : {}),
                  ...(parentPhone !== undefined ? { parentPhone } : {}),
                  classCode: sheetName.split('_').pop() || sheetName,
                },
              },
              { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
            );

            if (isNew) {
              sheetNewCount++;
              newStudents++;
            } else {
              updatedStudents++;
            }

            // Gán vào CourseGroup nếu chưa có
            if (!courseGroup.students.map((id) => id.toString()).includes(student._id.toString())) {
              courseGroup.students.push(student._id);
              sheetAssigned++;
              assignedCount++;
            }

            // Cập nhật courseGroups trong Student
            if (!student.courseGroups || !student.courseGroups.includes(courseGroup.groupCode)) {
              await Student.findByIdAndUpdate(student._id, {
                $addToSet: { courseGroups: courseGroup.groupCode },
              });
            }

            sheetStudentCount++;
            totalStudents++;
          } catch (rowErr) {
            errors.push(`Sheet "${sheetName}", MSSV "${studentCode}": ${rowErr.message}`);
          }
        }

        await courseGroup.save();

        sheetResults.push({
          sheetName,
          courseName: courseGroup.courseName,
          total: sheetStudentCount,
          newStudents: sheetNewCount,
          assigned: sheetAssigned,
        });
      }

      res.json({
        message: `Đồng bộ thành công! ${totalStudents} SV xử lý (${newStudents} mới, ${updatedStudents} cập nhật), ${assignedCount} SV được gán vào học phần.`,
        totalStudents,
        newStudents,
        updatedStudents,
        assignedCount,
        sheetResults,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      next(error);
    }
  },
);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =========================================================
// GET /api/excel/export-template (cũ — giữ backward compat)
// =========================================================
router.get('/export-template', async (req, res, next) => {
  try {
    const students = await Student.find({}).sort({ classCode: 1, studentCode: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ITC Student Care System';
    workbook.created = new Date();

    const groupedByClass = {};
    for (const student of students) {
      const cls = student.classCode || 'KHOA_CHUNG';
      if (!groupedByClass[cls]) groupedByClass[cls] = [];
      groupedByClass[cls].push(student);
    }

    const classKeys = Object.keys(groupedByClass);

    if (classKeys.length === 0) {
      const sheet = workbook.addWorksheet('CD25CT1');
      setupLegacySheetColumns(sheet);
      sheet.addRow({
        studentCode: '501250001',
        fullName: 'Nguyen Van A',
        dob: '01/01/2007',
        major: 'Công nghệ Thông tin',
        phone: '0901234567',
        parentPhone: '0987654321',
        courseGroups: '501_MMT_HK1_26.27_CD25LM',
      });
    } else {
      for (const cls of classKeys) {
        const sheetName = cls.replace(/[*?:/\\[\]]/g, '').substring(0, 31) || 'Lop';
        const sheet = workbook.addWorksheet(sheetName);
        setupLegacySheetColumns(sheet);
        for (const st of groupedByClass[cls]) {
          sheet.addRow({
            studentCode: st.studentCode,
            fullName: st.fullName,
            dob: st.dob || '',
            major: st.major || '',
            phone: st.phone || '',
            parentPhone: st.parentPhone || '',
            courseGroups: (st.courseGroups || []).join(', '),
          });
        }
      }
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Danh_Sach_Sinh_Vien_Theo_Lop.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

function setupLegacySheetColumns(sheet) {
  sheet.columns = [
    { header: 'Mã SV', key: 'studentCode', width: 16 },
    { header: 'Họ và Tên', key: 'fullName', width: 25 },
    { header: 'Ngày Sinh', key: 'dob', width: 15 },
    { header: 'Ngành', key: 'major', width: 25 },
    { header: 'SĐT Sinh Viên', key: 'phone', width: 18 },
    { header: 'SĐT Phụ Huynh', key: 'parentPhone', width: 18 },
    { header: 'Nhóm Học Phần Đăng Ký', key: 'courseGroups', width: 35 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
}

// =========================================================
// POST /api/excel/import-data (cũ — giữ backward compat)
// =========================================================
router.post(
  '/import-data',
  verifyToken,
  requireAdmin,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ message: 'Vui lòng tải lên file Excel hợp lệ' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      let updatedCount = 0;
      let groupCreatedCount = 0;

      for (const worksheet of workbook.worksheets) {
        let headerMap = {};
        let headerRowIndex = -1;

        worksheet.eachRow((row, rowNumber) => {
          if (headerRowIndex !== -1) return;
          row.eachCell((cell, colNumber) => {
            const val = String(cell.value || '')
              .trim()
              .toLowerCase();
            if (val.includes('mã sv') || val.includes('mssv') || val.includes('mã sinh viên')) {
              headerRowIndex = rowNumber;
            }
          });
        });

        if (headerRowIndex === -1) headerRowIndex = 1;

        const headerRow = worksheet.getRow(headerRowIndex);
        headerRow.eachCell((cell, colNumber) => {
          headerMap[colNumber] = String(cell.value || '').trim();
        });

        for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
          const row = worksheet.getRow(r);
          if (!row || !row.values || row.values.length === 0) continue;

          let studentCode = '',
            fullName = '',
            dob = '',
            major = '',
            phone = '',
            parentPhone = '',
            rawCourseGroups = '';

          row.eachCell((cell, colNumber) => {
            const colHeader = (headerMap[colNumber] || '').trim().toLowerCase();
            const cellVal =
              cell.value !== null && cell.value !== undefined ? String(cell.value).trim() : '';
            if (colHeader.includes('mã sv') || colHeader.includes('mssv')) studentCode = cellVal;
            else if (colHeader.includes('họ và tên') || colHeader.includes('tên'))
              fullName = cellVal;
            else if (colHeader.includes('ngày sinh')) dob = cellVal;
            else if (colHeader.includes('ngành')) major = cellVal;
            else if (colHeader.includes('sđt sinh viên') || colHeader.includes('sđt sv'))
              phone = cellVal;
            else if (colHeader.includes('sđt phụ huynh') || colHeader.includes('sđt ph'))
              parentPhone = cellVal;
            else if (colHeader.includes('nhóm học phần')) rawCourseGroups = cellVal;
          });

          if (!studentCode) continue;

          const courseGroupsArray = rawCourseGroups
            ? rawCourseGroups
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          const student = await Student.findOneAndUpdate(
            { studentCode },
            {
              ...(fullName ? { fullName } : {}),
              ...(dob ? { dob } : {}),
              ...(major ? { major } : {}),
              phone,
              parentPhone,
              courseGroups: courseGroupsArray,
              classCode: worksheet.name.trim(),
            },
            { upsert: true, returnDocument: 'after' },
          );

          updatedCount++;

          for (const gCode of courseGroupsArray) {
            await CourseGroup.findOneAndUpdate(
              { groupCode: gCode },
              {
                $setOnInsert: { courseName: `Học phần ${gCode}` },
                $addToSet: { students: student._id },
              },
              { upsert: true, returnDocument: 'after' },
            );
            groupCreatedCount++;
          }
        }
      }

      res.json({
        message: `Đồng bộ dữ liệu thành công! Đã cập nhật ${updatedCount} sinh viên và liên kết với các Nhóm học phần.`,
        updatedCount,
        groupCreatedCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
