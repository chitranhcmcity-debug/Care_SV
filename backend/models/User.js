const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tokenVersion: { type: Number, default: 0 },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff', 'teacher'], default: 'staff' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    managedClasses: [{ type: String }],
    managedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  },
  { timestamps: true },
);

UserSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
