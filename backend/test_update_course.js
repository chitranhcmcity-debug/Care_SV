const axios = require('axios');

async function testUpdateCourse() {
  try {
    console.log("1. Logging in as Admin...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log("✅ Admin Logged In.");

    console.log("2. Fetching course groups to find 501_CSDL or any course...");
    const listRes = await axios.get('http://localhost:5000/api/course-groups', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Found Course Groups:", listRes.data.map(g => ({ id: g._id, code: g.groupCode })));

    if (listRes.data.length > 0) {
      const target = listRes.data[0];
      console.log(`3. Updating Course Group ID ${target._id} (${target.groupCode})...`);
      const updateRes = await axios.put(`http://localhost:5000/api/course-groups/${target._id}`, {
        courseName: target.courseName + ' (Updated Test)',
        shift: 'Chiều',
        room: 'A.102'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log("🎉 UPDATE SUCCESSFUL:", updateRes.data.message);
      console.log("Updated Group:", updateRes.data.group.courseName, updateRes.data.group.shift, updateRes.data.group.room);
    }
  } catch (error) {
    console.error("❌ UPDATE FAILED:", error.response ? error.response.data : error.message);
  }
}

testUpdateCourse();
