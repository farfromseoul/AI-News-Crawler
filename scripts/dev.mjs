import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('dist/index.html')) {
  const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    stdio: 'inherit',
  });
  const code = await new Promise((resolve) => build.on('exit', resolve));
  if (code) process.exit(code);
}
const commands = [
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'wrangler.jsonc',
    '--persist-to',
    '.wrangler/state',
    '--port',
    '8787',
    '--ip',
    '127.0.0.1',
  ],
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'],
];
const children = commands.map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => c.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 300).unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
children.forEach((c) => c.on('exit', (code) => stop(code ?? 1)));
