// Audit.gs — append-only AuditLog tab. Call inside withLock_ so rows from concurrent writes never interleave.
// Never pass passwords or hashes in entries.

const AUDIT_MAX_VALUE = 500;

function audit_(user, action, entry) {
  auditMany_(user, action, [entry || {}]);
}

/** Appends one row per entry: { productId, code, field, before, after }. */
function auditMany_(user, action, entries) {
  if (!entries.length) return;
  const sh = sheet_(SHEET.audit);
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const rows = entries.map((e) =>
    [ts, user, action, e.productId, e.code, e.field, clip_(e.before), clip_(e.after)].map(toCell_)
  );
  const start = sh.getLastRow() + 1;
  ensureRows_(sh, start + rows.length - 1);
  sh.getRange(start, 1, rows.length, AUDIT_HEADERS.length).setValues(rows);
}

function clip_(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return s.length > AUDIT_MAX_VALUE ? s.slice(0, AUDIT_MAX_VALUE) + '…' : s;
}
