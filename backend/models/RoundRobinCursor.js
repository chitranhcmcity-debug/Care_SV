const mongoose = require('mongoose');

// A single persistent counter used to rotate call-task assignment across separate
// saveAttendance calls (and processes). Kept out of SystemSettings, which is a
// user-editable singleton elsewhere in the app — mixing an internal counter into it
// would break code that assumes at most one settings document exists.
const RoundRobinCursorSchema = new mongoose.Schema({
  _id: { type: String, default: 'callTaskAssignment' },
  value: { type: Number, default: 0 },
});

module.exports = mongoose.model('RoundRobinCursor', RoundRobinCursorSchema);
