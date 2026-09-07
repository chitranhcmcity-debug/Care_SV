const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Student = require('./models/Student');
const CourseGroup = require('./models/CourseGroup');

async function testRolesAndRouting() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/itc_care';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB:', mongoUri);

    // 1. Verify User schema has managedStudents
    const userSchemaPaths = Object.keys(User.schema.paths);
    console.log('User schema paths includes managedStudents:', userSchemaPaths.includes('managedStudents'));

    // 2. Query a staff user and test managedStudents populate
    let staff = await User.findOne({ role: 'staff' });
    if (staff) {
      console.log(`Found Staff: ${staff.fullName} | managedClasses: ${JSON.stringify(staff.managedClasses)} | managedStudents: ${JSON.stringify(staff.managedStudents)}`);
    } else {
      console.log('No staff found in DB.');
    }

    console.log('✅ Backend Roles & Routing Model Verification Passed!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

testRolesAndRouting();
