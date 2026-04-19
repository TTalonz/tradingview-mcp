/**
 * Timeframe watcher — polls active TF every 2s, auto-syncs on change.
 * Exports updateWatcherState() and ensureWatcher() for use by pattern commands.
 * When run directly (node src/core/watcher.js), enters the polling loop.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { evaluate, getChartApi } from '../connection.js';
import { snapPivots, clearAlgoDrawings, runTduAlgo, runGzPattern } from './drawing.js';

export const PID_FILE   = join(process.cwd(), 'watcher.pid');
export const STATE_FILE = join(process.cwd(), 'watcher-state.json');

// ── State helpers ─────────────────────────────────────────────────────────────

export function readState() {
  if (!existsSync(STATE_FILE)) return { pairs: [] };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { pairs: [] }; }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/** Upsert a degree→pattern pair. Last write wins per degree. */
export function updateWatcherState(degree, pattern) {
  const state = readState();
  const key = degree ?? null;
  state.pairs = state.pairs.filter(p => p.degree !== key);
  state.pairs.push({ degree: key, pattern });
  writeState(state);
}

// ── Process helpers ───────────────────────────────────────────────────────────

function isWatcherAlive() {
  if (!existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Start watcher if not already running. No-op if alive. */
export function ensureWatcher() {
  if (isWatcherAlive()) return;
  if (!existsSync(STATE_FILE)) writeState({ pairs: [] });

  const script = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio:    'ignore',
    env:      process.env,
    cwd:      process.cwd(),
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid), 'utf8');
}

/** Kill watcher and remove state files. */
export function stopWatcher() {
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10);
      process.kill(pid, 'SIGTERM');
    } catch { /* already dead */ }
    unlinkSync(PID_FILE);
  }
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
}

// ── Polling loop (runs only when executed directly) ───────────────────────────

async function redrawAll(pairs) {
  await snapPivots();
  await new Promise(r => setTimeout(r, 300));
  await clearAlgoDrawings();
  for (const { degree, pattern } of pairs) {
    const deg = degree ?? undefined;
    if (pattern === 'tdu') await runTduAlgo({ degree: deg });
    else if (pattern === 'gz') await runGzPattern({ degree: deg });
  }
}

async function pollLoop() {
  const apiPath = await getChartApi();
  let lastTf = await evaluate(`${apiPath}.resolution()`);

  process.stderr.write(`[watcher] started — tf=${lastTf}\n`);

  const INTERVAL = 2000;
  while (true) {
    await new Promise(r => setTimeout(r, INTERVAL));
    try {
      const tf = await evaluate(`${apiPath}.resolution()`);
      if (tf !== lastTf) {
        process.stderr.write(`[watcher] tf change ${lastTf} → ${tf}\n`);
        lastTf = tf;
        const { pairs } = readState();
        if (pairs.length > 0) await redrawAll(pairs);
      }
    } catch (err) {
      process.stderr.write(`[watcher] error: ${err.message}\n`);
    }
  }
}

const isMain = process.argv[1] &&
  pathToFileURL(process.argv[1]).href === new URL(import.meta.url).href;

if (isMain) {
  process.on('SIGTERM', () => {
    process.stderr.write('[watcher] stopped\n');
    process.exit(0);
  });
  pollLoop().catch(err => {
    process.stderr.write(`[watcher] fatal: ${err.message}\n`);
    process.exit(1);
  });
}
