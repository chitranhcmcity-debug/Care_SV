const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    classCode: { type: String, required: true, trim: true },
    dob: { type: String, default: '' },
    major: { type: String, default: '' },
    phone: { type: String, default: '' },
    parentPhone: { type: String, default: '' },
    courseGroups: [{ type: String }],
    tags: [{ type: String }],
  },
  { timestamps: true },
);

module.exports = mongoose.model('Student', StudentSchema);
