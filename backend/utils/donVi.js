// Đơn vị (unit): each Trưởng phòng / PHT owns one unit with its own students, classes,
// attendance, care cases, calls, tasks, staff and settings. A signed-in request runs inside its
// unit (set by verifyToken), and the unitPlugin below scopes every query of a business model to
// that unit and stamps new documents with it. Admins and system work (startup, webhooks,
// reminders) run without a unit and see every unit.
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');

const storage = new AsyncLocalStorage();

/** Runs fn inside a unit (null = every unit). */
const runInUnit = (unitId, fn) => storage.run({ unitId: unitId ? String(unitId) : null }, fn);

/** Unit of the current request, or null outside one (admin, system work). */
const currentUnit = () => storage.getStore()?.unitId ?? null;

/**
 * Unit a user works in (a manager's unitId is their own _id). Admins have none; an account not
 * yet in a unit (only before the startup conversion has run) is not scoped either.
 */
const unitOf = (user) =>
  user && user.role !== 'admin' && user.unitId ? String(user.unitId) : null;

/**
 * Wraps a middleware that resumes from stream callbacks (multer), where the request's unit
 * would otherwise be lost, so the handlers after it still run inside the unit.
 */
const keepUnit = (middleware) => (req, res, next) => {
  const unitId = currentUnit();
  middleware(req, res, (error) => runInUnit(unitId, () => next(error)));
};

const QUERY_HOOKS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

/** Adds `unitId` to a schema and scopes all its queries and new documents to the current unit. */
function unitPlugin(schema) {
  schema.add({
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'NguoiDung', default: null, index: true },
  });
  schema.pre(QUERY_HOOKS, function () {
    const unitId = currentUnit();
    if (unitId) this.where({ unitId });
  });
  schema.pre('aggregate', function () {
    const unitId = currentUnit();
    if (unitId)
      this.pipeline().unshift({ $match: { unitId: new mongoose.Types.ObjectId(unitId) } });
  });
  schema.pre('validate', function () {
    const unitId = currentUnit();
    if (unitId && this.isNew && !this.unitId) this.unitId = unitId;
  });
  schema.pre('insertMany', function (docs) {
    const unitId = currentUnit();
    const list = Array.isArray(docs) ? docs : [docs];
    if (unitId) for (const doc of list) if (doc && !doc.unitId) doc.unitId = unitId;
  });
}

module.exports = { runInUnit, currentUnit, unitOf, keepUnit, unitPlugin };
