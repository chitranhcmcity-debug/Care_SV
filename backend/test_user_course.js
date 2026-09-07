const axios = require('axios');

async function testUserCourseCreation() {
  try {
    console.log("1. Logging in as Admin...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log("✅ Logged in.");

    console.log("2. Fetching staff list to get staff2 ID...");
    const staffRes = await axios.get('http://localhost:5000/api/auth/staff-list', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const staff2 = staffRes.data.find(s => s.email === 'staff2@itc.edu.vn') || staffRes.data[0];
    const sId = staff2.id || staff2._id;
    console.log("✅ Staff Selected:", staff2.fullName, sId);

    console.log("3. Creating Course Group '501_CTMT_TEST_SUCCESS'...");
    const createRes = await axios.post('http://localhost:5000/api/course-groups', {
      groupCode: '501_CTMT_TEST_SUCCESS',
      courseName: 'Cấu Trúc Máy Tính Nâng Cao',
      shift: 'Sáng',
      scheduleDays: ['Thứ 3'],
      room: 'A.101',
      teacherId: sId
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("🎉 SUCCESS! Group Created:", createRes.data.message);
    console.log("Group Details:", createRes.data.group);
  } catch (error) {
    console.error("❌ ERROR:", error.response ? error.response.data : error.message);
  }
}

testUserCourseCreation();
