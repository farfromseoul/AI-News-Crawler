import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const schedule = JSON.parse(
  readFileSync(new URL('../packages/domain/schedule.json', import.meta.url), 'utf8'),
);
export function nextRun(now = Date.now()) {
  const date = new Date(now);
  let next = Infinity;
  for (let day = 0; day <= 7; day++)
    for (const job of schedule.jobs) {
      const time = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + day,
        job.hourUTC,
      );
      if (time > now && (!job.days.length || job.days.includes(new Date(time).getUTCDay())))
        next = Math.min(next, time);
    }
  return next;
}
export function isDue(now, scheduledAt, running) {
  return !running && now >= scheduledAt;
}
function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  process.chdir(root);
  mkdirSync('.cache', { recursive: true });
  const lock = '.cache/scheduler.pid';
  try {
    const pid = Number(readFileSync(lock, 'utf8'));
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        console.error('Scheduler already running:', pid);
        process.exit(1);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    unlinkSync(lock);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const log = (event) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event });
    console.log(line);
    appendFileSync('.cache/scheduler.log', line + '\n');
  };
  let due = nextRun(),
    child,
    stopping = false;
  log({
    status: 'scheduled',
    pid: process.pid,
    nextRun: new Date(due).toISOString(),
    timezone: 'Asia/Seoul',
    policy: 'per-source',
  });
  const timer = setInterval(() => {
    if (stopping || !isDue(Date.now(), due, !!child)) return;
    // On wake, run once for a missed deadline; never replay every missed day.
    const scheduledAt = due;
    due = nextRun();
    // Do not burst through missed jobs after sleep; discard deadlines over 15 minutes old.
    if (Date.now() - scheduledAt > 15 * 60000) {
      log({ status: 'skipped_missed', scheduledAt });
      return;
    }
    log({ status: 'started', nextRun: new Date(due).toISOString() });
    child = spawn(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'scripts/collect.ts',
        '--scheduled-at',
        String(scheduledAt),
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (data) => {
        process.stdout.write(data);
        appendFileSync('.cache/scheduler.log', data);
      });
    child.on('error', (error) => log({ status: 'spawn_error', code: error.code }));
    child.on('close', (code, signal) => {
      child = undefined;
      log({ status: 'finished', code, signal });
      if (stopping) process.exit(0);
    });
  }, 15000);
  function stop() {
    stopping = true;
    clearInterval(timer);
    log({ status: 'stopping' });
    if (child) child.kill('SIGTERM');
    else process.exit(0);
  }
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  process.on('exit', () => {
    try {
      if (readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock);
    } catch {}
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
