const axios = require('axios');
async function testTasks() {
  try {
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    
    console.log("Fetching call tasks...");
    const tasksRes = await axios.get('http://localhost:5000/api/call-tasks', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(JSON.stringify(tasksRes.data, null, 2));
  } catch(e) {
    console.error("Error:", e.response ? e.response.data : e.message);
  }
}
testTasks();
