// admin-preview.cjs — serves the real admin UI (gas/admin*.html) on http://localhost:8787 against the real
// backend code running on in-memory mocks. google.script.run is replaced by a small fetch shim.
// Usage: npm run preview:admin   → log in as owner / owner-password (admin) or staff1 / staff-password (staff)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadGas } = require('./gas-mocks.cjs');

const gasDir = path.join(__dirname, '..', 'gas');
const port = Number(process.env.PORT || 8787);
const { context, run } = loadGas(gasDir);

// ---------- seed data ----------
run('setup()');
run(`upsertAdmin_('owner', 'owner-password', 'preview')`);
run(`withLock_(() => { const u = readUsers_(); u.push(newUser_('staff1', 'คุณแพร', 'staff', 'staff-password')); writeUsers_(u); })`);
run(`withLock_(() => writeSettings_({ shopName: 'NPBeauty', lineOaId: '@npbeauty', primaryColor: '#1F5FAE', workerUrl: 'https://npbeauty.ethermorph-corp.workers.dev' }))`);
const owner = run(`login('owner', 'owner-password')`).data.token;
const seed = [
  ['NP-001', 'เซรั่มวิตามินซี 30 ml', 'สกินแคร์', 'เซรั่มวิตามินซีเข้มข้น ช่วยให้ผิวดูกระจ่างใส\nเนื้อบางเบา ซึมไว\n\nขนาด 30 ml'],
  ['NP-002', 'ครีมกันแดด SPF50 PA++++ 40 g', 'ครีมกันแดด', 'กันแดดเนื้อบางเบา'],
  ['NP-003', 'ลิปทินท์ เนื้อแมตต์ สี Rose', 'เมคอัพ', ''],
  ['NP-004', 'โฟมล้างหน้า สูตรอ่อนโยน 100 ml', 'สกินแคร์', ''],
  ['NP-005', 'มาส์กหน้า ไฮยาลูรอน 5 ชิ้น', 'สกินแคร์', ''],
];
seed.forEach(([code, name, category, description]) => {
  context.__seed = { code, name, category, description };
  run(`createProduct('${owner}', __seed)`);
});
const np3 = run(`readProducts_().records.find((r) => r.code === 'NP-003').productId`);
run(`setStatus('${owner}', '${np3}', 'hidden')`);
run(`withLock_(() => ensureCategory_('ของแถม'))`);

// ---------- page ----------
const shim = `<script>
(function () {
  function runner(h) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { return runner(Object.assign({}, h, { ok: fn })); };
        if (prop === 'withFailureHandler') return function (fn) { return runner(Object.assign({}, h, { fail: fn })); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          fetch('/rpc', { method: 'POST', body: JSON.stringify({ name: prop, args: args }) })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              setTimeout(function () {
                if (res.thrown) { if (h.fail) h.fail(new Error(res.thrown)); }
                else if (h.ok) h.ok(res.result);
              }, 250); // simulate Apps Script latency so loading states are visible
            })
            .catch(function (e) { if (h.fail) h.fail(e); });
        };
      },
    });
  }
  window.google = { script: { get run() { return runner({}); } } };
})();
</script>`;

function page() {
  const read = (name) => fs.readFileSync(path.join(gasDir, name + '.html'), 'utf8');
  const boot = JSON.stringify(run('bootData_()')).replace(/</g, '\\u003c');
  return read('admin')
    // Apps Script adds the viewport meta via addMetaTag() in doGet; mirror that here.
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
    .replace("<?!= include_('admin_css') ?>", read('admin_css'))
    .replace('<?!= boot ?>', boot)
    .replace("<?!= include_('admin_js') ?>", shim + read('admin_js'));
}

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const { name, args } = JSON.parse(body);
        let out;
        // Like google.script.run: only top-level functions not ending in "_" are callable.
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || typeof context[name] !== 'function') out = { thrown: 'Script function not found: ' + name };
        else {
          try {
            out = { result: context[name](...args) };
          } catch (err) {
            out = { thrown: String(err.message || err) };
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page()); // re-read on every request so edits show after a refresh
  })
  .listen(port, () => console.log('Admin preview on http://localhost:' + port + '  (owner / owner-password, staff1 / staff-password)'));
