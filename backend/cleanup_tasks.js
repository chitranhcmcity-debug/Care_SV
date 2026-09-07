// Script xóa duplicate call tasks
const mongoose = require('mongoose');
const CallTask = require('./models/CallTask');

async function cleanup() {
  // Connect to persistent local DB
  try {
    await mongoose.connect('mongodb://127.0.0.1:27018/itccare_persistent');
  } catch {
    await mongoose.connect('mongodb://127.0.0.1:27017/itccare');
  }

  const all = await CallTask.find().sort({ createdAt: 1 });
  console.log('Total tasks before:', all.length);

  // Group by studentId + courseGroupId + day
  const seen = new Map();
  const toDelete = [];
  for (const t of all) {
    const dateStr = new Date(t.absenceDate).toDateString();
    const key = `${t.studentId}_${t.courseGroupId}_${dateStr}`;
    if (seen.has(key)) {
      toDelete.push(t._id);
      console.log('  DELETE duplicate:', t._id.toString(), '| student:', t.studentId.toString(), '| date:', dateStr);
    } else {
      seen.set(key, t._id);
    }
  }

  console.log('Duplicates found:', toDelete.length);
  if (toDelete.length > 0) {
    const result = await CallTask.deleteMany({ _id: { $in: toDelete } });
    console.log('Deleted:', result.deletedCount);
  }

  const remaining = await CallTask.countDocuments();
  console.log('Tasks remaining:', remaining);
  process.exit(0);
}

cleanup().catch(e => { console.error(e.message); process.exit(1); });
