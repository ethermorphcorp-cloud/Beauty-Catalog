// SelfTest.gs — end-to-end check on the real Sheet. Run from the editor or the menu Catalog → ทดสอบระบบ.
// Creates temporary users and products, exercises the main flows (including the live shop page on the
// Worker when a Worker URL is set), then removes everything it made (product rows, their Drive folders,
// test category, test users and their AuditLog rows). One summary row stays in AuditLog (user "selftest").

function _selfTest() {
  requireEditorContext_();
  const tag = 'selftest' + Date.now().toString(36);
  const adminName = tag + '_a';
  const staffName = tag + '_s';
  const password = randomToken_().slice(0, 16);
  const category = 'ทดสอบระบบ ' + tag;
  const results = [];
  let failed = false;
  let productId = null;

  const check = (label, condition, detail) => {
    results.push((condition ? 'PASS ' : 'FAIL ') + label + (!condition && detail ? ' — ' + detail : ''));
    if (!condition) failed = true;
  };

  // Live shop page checks go through the Worker (sync → KV → page). A unique query string bypasses its cache.
  const workerUrl = String(readSettings_().workerUrl || '').replace(/\/+$/, '');
  const page = (code) =>
    UrlFetchApp.fetch(workerUrl + '/p/' + encodeURIComponent(code) + '?selftest=' + Date.now(), { muteHttpExceptions: true, followRedirects: false });
  const onWorker = (label, fn) => {
    if (!workerUrl) {
      results.push('SKIP ' + label + ' (ยังไม่ได้ตั้ง Worker URL)');
      return;
    }
    try {
      fn();
    } catch (err) {
      check(label, false, String(err.message || err));
    }
  };

  withLock_(() => {
    const users = readUsers_();
    users.push(newUser_(adminName, 'Self test admin', 'admin', password), newUser_(staffName, 'Self test staff', 'staff', password));
    writeUsers_(users);
  });

  try {
    const a = login(adminName, password);
    check('login admin', a.ok, a.error);
    const s = login(staffName, password);
    check('login staff', s.ok, s.error);
    check('wrong password rejected', !login(adminName, password + 'x').ok);
    const adminToken = a.data.token;
    const staffToken = s.data.token;

    const code1 = ('ST-' + tag).slice(0, 36);
    const created = createProduct(adminToken, { code: code1, name: 'สินค้าทดสอบ', category, description: 'บรรทัด 1\nบรรทัด 2' });
    check('createProduct → productId P000000', created.ok && /^P\d{6}$/.test(created.data.product.productId), created.error);
    productId = created.ok ? created.data.product.productId : null;
    onWorker('shop page shows new product', () => {
      check('sync to Worker after create', created.data.sync.synced, JSON.stringify(created.data.sync));
      const res = page(code1);
      check('shop page shows new product', res.getResponseCode() === 200 && res.getContentText().indexOf('สินค้าทดสอบ') >= 0, 'HTTP ' + res.getResponseCode());
    });

    check('duplicate code rejected (case-insensitive)', !createProduct(adminToken, { code: code1.toLowerCase(), name: 'x', category: '' }).ok);
    check('invalid code rejected', !createProduct(adminToken, { code: 'มี space', name: 'x', category: '' }).ok);

    const code2 = code1 + '-B';
    const updated = updateProduct(staffToken, productId, { code: code2, name: '=สินค้าทดสอบ (แก้แล้ว)' });
    check('staff can update code + name', updated.ok && updated.data.product.code === code2, updated.error);
    check('text starting with = stays text', getProduct(adminToken, productId).data.product.name === '=สินค้าทดสอบ (แก้แล้ว)');

    const viaOld = apiProduct_(code1);
    check('old code redirects to new code', viaOld.ok && viaOld.redirect === code2, JSON.stringify(viaOld));
    const viaNew = apiProduct_(code2.toLowerCase());
    check('new code resolves (case-insensitive)', viaNew.ok && viaNew.product && viaNew.product.productId === productId, JSON.stringify(viaNew));
    onWorker('shop page after rename', () => {
      const renamed = page(code2);
      check('shop page shows the edited name right away', renamed.getResponseCode() === 200 && renamed.getContentText().indexOf('แก้แล้ว') >= 0, 'HTTP ' + renamed.getResponseCode());
      const old = page(code1);
      const headers = old.getHeaders();
      const location = String(headers.Location || headers.location || '');
      check('old shop link 301 → new code', old.getResponseCode() === 301 && location.indexOf('/p/' + code2) >= 0, old.getResponseCode() + ' ' + location);
    });

    const hidden = setStatus(staffToken, productId, 'hidden');
    check('staff can hide product', hidden.ok, hidden.error);
    const viaHidden = apiProduct_(code2);
    check('api reports hidden without details', viaHidden.ok && viaHidden.product.status === 'hidden' && !viaHidden.product.name);
    onWorker('shop page after hide', () => {
      const gone = page(code2);
      check('hidden product page is 410 "ไม่พร้อมจำหน่าย"', gone.getResponseCode() === 410 && gone.getContentText().indexOf('สินค้านี้ไม่พร้อมจำหน่าย') >= 0, 'HTTP ' + gone.getResponseCode());
    });

    const cats = getCategories(adminToken);
    const cat = cats.ok && cats.data.find((c) => c.name === category);
    check('category auto-added with count 1', cat && cat.count === 1, JSON.stringify(cat));
    check('category in use cannot be deleted', !deleteCategory(adminToken, category).ok);

    const forbidden = createUser(staffToken, { username: tag + '_x', role: 'staff', password });
    check('staff cannot create users', !forbidden.ok && forbidden.code === 'forbidden', forbidden.error);
    check('staff cannot list users', !listUsers(staffToken).ok);
    check('staff cannot delete users', !deleteUser(staffToken, adminName).ok);
    check('admin cannot delete self', !deleteUser(adminToken, adminName).ok);

    const preview = previewCsv(adminToken, [
      { code: code2, name: 'ซ้ำ' },
      { code: tag + '-N', name: 'ใหม่' },
      { code: tag + '-N', name: 'ซ้ำในไฟล์' },
      { code: tag + '-E', name: '' },
    ]);
    const statuses = preview.ok ? preview.data.map((r) => r.status).join(',') : preview.error;
    check('previewCsv statuses', statuses === 'duplicate,new,duplicate,invalid', statuses);

    const imported = importCsv(adminToken, [
      { code: tag + '-CSV1', name: 'นำเข้าจาก CSV, ทดสอบ', category, description: 'บรรทัด 1\nบรรทัด 2' },
      { code: code2, name: 'รหัสซ้ำ' },
      { code: tag + '-CSV2', name: '' },
    ]);
    check(
      'importCsv creates new rows and skips duplicate / missing name',
      imported.ok && imported.data.created.length === 1 && imported.data.skipped.length === 2,
      imported.ok ? JSON.stringify(imported.data) : imported.error
    );

    const lockName = tag + '_l';
    withLock_(() => {
      const users = readUsers_();
      users.push(newUser_(lockName, 'Self test lock', 'staff', password));
      writeUsers_(users);
    });
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) login(lockName, password + 'wrong');
    const locked = login(lockName, password);
    check('5 wrong passwords lock the account (even the right one is refused)', !locked.ok && locked.code === 'locked', locked.code);

    const reset = resetPassword(adminToken, staffName, password + 'new');
    check('admin can reset password', reset.ok, reset.error);
    check('old staff session ends after reset', !listProducts(staffToken).ok);
  } catch (err) {
    failed = true;
    results.push('ERROR ' + (err.stack || err));
  } finally {
    cleanupSelfTest_(tag, category, results);
  }

  const passed = results.filter((r) => r.indexOf('PASS') === 0).length;
  const total = results.filter((r) => /^(PASS|FAIL)/.test(r)).length;
  const problems = results.filter((r) => /^(FAIL|ERROR|SKIP)/.test(r)).join(' | ');
  const summary = (failed ? 'FAIL ' : 'PASS ') + passed + '/' + total + (problems ? ' — ' + problems : '');
  withLock_(() => audit_('selftest', 'selfTest', { after: summary }));
  console.log(results.join('\n'));
  if (failed) throw new Error('selfTest failed:\n' + results.join('\n'));
  return results;
}

function cleanupSelfTest_(tag, category, results) {
  withLock_(() => {
    // Every product the test made carries the tag in its code (current or old).
    const table = readProducts_();
    const mine = table.records.filter((r) => (r.code + ',' + r.oldCodes).indexOf(tag) >= 0);
    mine.forEach((rec) => {
      try {
        if (rec.folderId) DriveApp.getFolderById(rec.folderId).setTrashed(true);
      } catch (err) {
        results.push('WARN folder not removed: ' + err);
      }
    });
    mine
      .map((r) => r._row)
      .sort((a, b) => b - a)
      .forEach((row) => table.sheet.deleteRow(row));
    const cats = readCategories_();
    const cat = findCategory_(cats, category);
    if (cat) cats.sheet.deleteRow(cat._row);

    writeUsers_(readUsers_().filter((u) => u.username.indexOf(tag) !== 0));

    const audit = sheet_(SHEET.audit);
    const values = audit.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][1]).indexOf(tag) === 0) audit.deleteRow(i + 1);
    }
  });
  results.push('CLEANUP done');
}
