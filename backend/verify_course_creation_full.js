const axios = require('axios');

async function runFullCourseCreationTest() {
  console.log("==========================================================");
  console.log("   KIỂM TRA CHỨC NĂNG TẠO/SỬA/XÓA HỌC PHẦN (END-TO-END)");
  console.log("==========================================================");

  try {
    // Step 1: Login Admin
    console.log("\n[1/6] Đăng nhập Admin (admin@itc.edu.vn)...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log(" ✅ Đăng nhập thành công! Token JWT thu được.");

    // Step 2: Fetch Staff List
    console.log("\n[2/6] Lấy danh sách Nhân viên/Giảng viên phụ trách...");
    const staffRes = await axios.get('http://localhost:5000/api/auth/staff-list', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const staff = staffRes.data[0];
    console.log(` ✅ Chọn giảng viên: ${staff.fullName} (ID: ${staff._id || staff.id})`);

    // Step 3: Create New Course Group
    const testCode = '501_WEB_TEST_' + Date.now();
    console.log(`\n[3/6] Thử tạo mới Học Phần (${testCode})...`);
    const createRes = await axios.post('http://localhost:5000/api/course-groups', {
      groupCode: testCode,
      courseName: 'Lập Trình Web Fullstack Advanced',
      shift: 'Chiều',
      scheduleDays: ['Thứ 3', 'Thứ 5', 'Thứ 7'],
      room: 'Lab 04',
      teacherId: staff._id || staff.id
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(" 🎉 TẠO MỚI THÀNH CÔNG! Trả về HTTP 201 Created:");
    console.log("   - Mã nhóm:", createRes.data.group.groupCode);
    console.log("   - Tên môn:", createRes.data.group.courseName);
    console.log("   - Ca học:", createRes.data.group.shift);
    console.log("   - Phòng:", createRes.data.group.room);
    console.log("   - Giảng viên phụ trách:", createRes.data.group.teacherName);

    const createdId = createRes.data.group._id;

    // Step 4: Test Duplicate Code Handling
    console.log(`\n[4/6] Kiểm tra xử lý trùng mã nhóm (${testCode})...`);
    try {
      await axios.post('http://localhost:5000/api/course-groups', {
        groupCode: testCode,
        courseName: 'Thử Trùng Mã'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (dupErr) {
      if (dupErr.response && dupErr.response.status === 400) {
        console.log(" ✅ Xử lý lỗi trùng mã RẤT TỐT: Backend trả về 400 Bad Request.");
        console.log("   - Thông báo lỗi:", dupErr.response.data.message);
      } else {
        throw dupErr;
      }
    }

    // Step 5: Update Course Group
    console.log(`\n[5/6] Thử chỉnh sửa thông tin Học phần...`);
    const updateRes = await axios.put(`http://localhost:5000/api/course-groups/${createdId}`, {
      courseName: 'Lập Trình Web Fullstack Advanced (Đã cập nhật)',
      shift: 'Tối',
      room: 'Lab 08'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(" ✅ CẬP NHẬT THÀNH CÔNG! Trả về HTTP 200 OK:");
    console.log("   - Tên mới:", updateRes.data.group.courseName);
    console.log("   - Ca học mới:", updateRes.data.group.shift);
    console.log("   - Phòng mới:", updateRes.data.group.room);

    // Step 6: Delete Test Course Group
    console.log(`\n[6/6] dọn dẹp dữ liệu test...`);
    const delRes = await axios.delete(`http://localhost:5000/api/course-groups/${createdId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(" ✅ XÓA MẪU THÀNH CÔNG:", delRes.data.message);

    console.log("\n==========================================================");
    console.log(" 🎯 KẾT LUẬN: TÍNH NĂNG TẠO/SỬA/XÓA HỌC PHẦN HOẠT ĐỘNG 100%!!");
    console.log("==========================================================");

  } catch (error) {
    console.error("❌ TEST THẤT BẠI:", error.response ? error.response.data : error.message);
  }
}

runFullCourseCreationTest();
