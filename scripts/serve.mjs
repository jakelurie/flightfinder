// Harness launch: finish a production build before accepting browser requests.
// Both common launch commands use this path, so stop/start cannot select next dev.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  if (child) child.kill(signal);
  else process.exit(0);
});
function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [next, ...args], {cwd: root, stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', (code) => { child = undefined; resolve(code ?? 1); });
  });
}
console.log('Preparing Flightfinder. The app opens after the build finishes.');
const build = await run(['build']);
if (stopping || build !== 0) process.exit(build);
process.exit(await run(['start', '-H', '0.0.0.0', '-p', '4340']));
