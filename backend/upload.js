const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function run() {
  try {
    console.log("Logging in...");
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@itc.edu.vn',
      password: 'admin123'
    });
    const token = loginRes.data.token;
    console.log("Logged in successfully.");

    console.log("Uploading file...");
    const form = new FormData();
    form.append('file', fs.createReadStream('d:\\mean\\backend\\import_test.xlsx'));

    const uploadRes = await axios.post('http://localhost:5000/api/excel/import-data', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });
    console.log("Upload success:", uploadRes.data);
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
  }
}

run();
