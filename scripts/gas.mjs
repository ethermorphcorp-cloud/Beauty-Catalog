// Run clasp for one shop (or all) by writing gas/.clasp.json from shops.json.
// Usage: node scripts/gas.mjs <shop|all> <push|deploy|open|deployments> [description]
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gasDir = join(root, 'gas');
const shops = JSON.parse(readFileSync(join(root, 'shops.json'), 'utf8'));
const [target, command, description = 'update'] = process.argv.slice(2);

const commands = {
  push: () => ['push', '-f'],
  deploy: (shop) => {
    if (!shop.deploymentId) throw new Error('deploymentId is empty in shops.json');
    return ['deploy', '-i', shop.deploymentId, '-d', description];
  },
  open: () => ['open'],
  deployments: () => ['deployments'],
};

if (!target || !commands[command] || (target !== 'all' && !shops[target])) {
  console.error(`Usage: node scripts/gas.mjs <${Object.keys(shops).join('|')}|all> <${Object.keys(commands).join('|')}> [description]`);
  process.exit(1);
}

const names = target === 'all' ? Object.keys(shops) : [target];
let failed = false;
for (const name of names) {
  const shop = shops[name];
  if (!shop.scriptId) {
    console.error(`[${name}] scriptId is empty in shops.json — skipped`);
    failed = true;
    continue;
  }
  let args;
  try {
    args = commands[command](shop);
  } catch (err) {
    console.error(`[${name}] ${err.message} — skipped`);
    failed = true;
    continue;
  }
  writeFileSync(join(gasDir, '.clasp.json'), JSON.stringify({ scriptId: shop.scriptId, rootDir: '.' }, null, 2) + '\n');
  console.log(`[${name}] clasp ${args.join(' ')}`);
  // On Windows clasp is a .cmd shim and needs a shell, which splits on spaces, so quote each argument.
  const shell = process.platform === 'win32';
  const argv = shell ? args.map((x) => (/[s"&|<>^]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x)) : args;
  const result = spawnSync('clasp', argv, { cwd: gasDir, stdio: 'inherit', shell });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
