// Unit Test: 3-Tier Task Routing Logic Test

const activeStaffs = [
  { _id: 'staff1', fullName: 'Staff 1', managedClasses: ['CD25CT1'], managedStudents: ['student_exc_1'] },
  { _id: 'staff2', fullName: 'Staff 2', managedClasses: ['CD25CT2'], managedStudents: [] },
  { _id: 'staff3', fullName: 'Staff 3', managedClasses: [], managedStudents: [] },
];

const testStudents = [
  { _id: 'student_exc_1', fullName: 'SV Ngoại Lệ 1', classCode: 'CD25CT2' }, // Managed as exception by Staff 1 (even though class is CD25CT2)
  { _id: 'student_class_2', fullName: 'SV Lớp 2', classCode: 'CD25CT2' }, // Managed by Staff 2 via class
  { _id: 'student_unassigned', fullName: 'SV Tự Do', classCode: 'CD25CT3' }, // Unassigned -> Round robin
];

function dispatchTask(student, index, startIndex) {
  const studentId = student._id;
  const studentClassCode = (student.classCode || '').trim().toUpperCase();
  const N = activeStaffs.length;

  // Tier 1: Check managedStudents match (individual student exception assignment)
  let assignedStaff = activeStaffs.find(
    (s) => Array.isArray(s.managedStudents) && s.managedStudents.some(msId => msId.toString() === studentId.toString())
  );

  // Tier 2: Check managedClasses match (base cohort class assignment via student.classCode)
  if (!assignedStaff) {
    assignedStaff = activeStaffs.find(
      (s) => Array.isArray(s.managedClasses) && s.managedClasses.includes(studentClassCode)
    );
  }

  // Tier 3: Fallback round-robin / least-busy active staff assignment
  if (!assignedStaff) {
    assignedStaff = activeStaffs[(startIndex + index) % N];
  }

  return assignedStaff;
}

console.log('Testing 3-Tier Task Routing Dispatcher...');

const res1 = dispatchTask(testStudents[0], 0, 0);
console.log(`Student 1 (Exception): Assigned to ${res1.fullName} (Expected: Staff 1) -> ${res1._id === 'staff1' ? '✅ PASS' : '❌ FAIL'}`);

const res2 = dispatchTask(testStudents[1], 1, 0);
console.log(`Student 2 (Class): Assigned to ${res2.fullName} (Expected: Staff 2) -> ${res2._id === 'staff2' ? '✅ PASS' : '❌ FAIL'}`);

const res3 = dispatchTask(testStudents[2], 2, 0);
console.log(`Student 3 (Fallback): Assigned to ${res3.fullName} (Expected: Staff 3) -> ${res3._id === 'staff3' ? '✅ PASS' : '❌ FAIL'}`);

if (res1._id === 'staff1' && res2._id === 'staff2' && res3._id === 'staff3') {
  console.log('\n🎉 ALL 3-TIER DISPATCHER UNIT TESTS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error('\n❌ UNIT TEST FAILED!');
  process.exit(1);
}
