const axios = require('axios');
async function testSubmit() {
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    
    console.log("Fetching groups...");
    const groupsRes = await axios.get('http://localhost:5000/api/attendance/course-groups', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const group = groupsRes.data[0];
    if (!group) return console.log("No group found");
    
    const students = group.students.map(s => s._id);
    console.log("Submitting attendance...");
    
    const res = await axios.post('http://localhost:5000/api/attendance/submit', {
      courseGroupId: group._id,
      absentStudentIds: [students[0]]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log("Success:", res.data);
  } catch(e) {
    console.error("Error:", e.response ? e.response.data : e.message);
  }
}
testSubmit();
