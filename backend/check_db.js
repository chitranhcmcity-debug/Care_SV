const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/itc_care', { serverSelectionTimeoutMS: 2000 }).catch(async () => {
     // try in memory? Wait, the server is using in-memory db from memory-server!
     // If it's an in-memory DB, I cannot query it from a separate process easily unless I know the URI, which was generated dynamically!
  });
}
check();
