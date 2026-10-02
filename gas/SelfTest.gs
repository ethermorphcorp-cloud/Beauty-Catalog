// SelfTest.gs — end-to-end check of the backend. Run from the editor or the menu Catalog → ทดสอบระบบ.
// Creates temporary users and a test product, exercises the main flows, then removes everything it made
// (product row, its Drive folder, test category, test users and their AuditLog rows).

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

    const hidden = setStatus(staffToken, productId, 'hidden');
    check('staff can hide product', hidden.ok, hidden.error);
    const viaHidden = apiProduct_(code2);
    check('api reports hidden without details', viaHidden.ok && viaHidden.product.status === 'hidden' && !viaHidden.product.name);

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

    const reset = resetPassword(adminToken, staffName, password + 'new');
    check('admin can reset password', reset.ok, reset.error);
    check('old staff session ends after reset', !listProducts(staffToken).ok);
  } catch (err) {
    failed = true;
    results.push('ERROR ' + (err.stack || err));
  } finally {
    cleanupSelfTest_(tag, productId, category, results);
  }

  console.log(results.join('\n'));
  if (failed) throw new Error('selfTest failed:\n' + results.join('\n'));
  return results;
}

function cleanupSelfTest_(tag, productId, category, results) {
  withLock_(() => {
    if (productId) {
      const table = readProducts_();
      const rec = table.records.find((r) => r.productId === productId);
      if (rec) {
        if (rec.folderId) {
          try {
            DriveApp.getFolderById(rec.folderId).setTrashed(true);
          } catch (err) {
            results.push('WARN folder not removed: ' + err);
          }
        }
        table.sheet.deleteRow(rec._row);
      }
    }
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
