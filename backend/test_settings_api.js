const axios = require('axios');

async function testSettingsAPI() {
  try {
    console.log("1. Logging in as Admin...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log("✅ Admin Logged In.");

    console.log("2. Fetching System Settings...");
    const getRes = await axios.get('http://localhost:5000/api/settings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Current Settings:", getRes.data);

    console.log("3. Updating Exam Ban Threshold to 3...");
    const updateRes = await axios.put('http://localhost:5000/api/settings', {
      examBanThreshold: 3,
      systemTitle: 'ITC Student Care & Attendance Hub'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("✅ Update Response:", updateRes.data);
  } catch (error) {
    console.error("❌ Error testing settings API:", error.response ? error.response.data : error.message);
  }
}

testSettingsAPI();
