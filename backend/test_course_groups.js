const axios = require('axios');

async function testCourseGroupsAPI() {
  try {
    console.log("1. Logging in as Admin...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log("✅ Admin Logged In.");

    console.log("2. Creating new Course Group (Chuyên đề Frontend)...");
    const createRes = await axios.post('http://localhost:5000/api/course-groups', {
      courseCode: 'FE301',
      groupCode: '701_FRONTEND_HK1_CD25',
      courseName: 'Chuyên Đề Lập Trình Frontend Advanced',
      shift: 'Tối',
      scheduleDays: ['Thứ 3', 'Thứ 5', 'Thứ 7'],
      room: 'Lab 05',
      teacherName: 'ThS. Hoàng Thị Mai'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Group Created:", createRes.data.group.groupCode);

    console.log("3. Enrolling entire class CD25CT1 into this Course Group...");
    const enrollRes = await axios.post(`http://localhost:5000/api/course-groups/${createRes.data.group._id}/assign-class`, {
      classCode: 'CD25CT1'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Class Enrolled:", enrollRes.data.message);

    console.log("4. Fetching all Course Groups...");
    const listRes = await axios.get('http://localhost:5000/api/course-groups', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Total Course Groups in DB:", listRes.data.length);
    listRes.data.forEach(g => {
      console.log(` - [${g.shift || 'Sáng'}] ${g.groupCode} (${g.courseName}): ${g.students ? g.students.length : 0} SV enrolled`);
    });

  } catch (error) {
    console.error("❌ Error testing course groups API:", error.response ? error.response.data : error.message);
  }
}

testCourseGroupsAPI();
