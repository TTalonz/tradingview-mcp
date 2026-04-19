/**
 * Timeframe watcher — polls active TF every 2s, auto-syncs on change.
 * Exports updateWatcherState() and ensureWatcher() for use by pattern commands.
 * When run directly (node src/core/watcher.js), enters the polling loop.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, openSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { evaluate, getChartApi, getTargetInfo, probeEval } from '../connection.js';
import { snapPivots, clearAlgoDrawings, runTduAlgo, runGzPattern, drawShape, removeOne } from './drawing.js';

export const PID_FILE    = join(process.cwd(), 'watcher.pid');
export const STATE_FILE  = join(process.cwd(), 'watcher-state.json');
const        MARKER_FILE = join(process.cwd(), 'watcher-marker.json');

// ── State helpers ─────────────────────────────────────────────────────────────

export function readState() {
  if (!existsSync(STATE_FILE)) return { pairs: [] };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { pairs: [] }; }
}

function writeState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

const PIVOTS_FILE = join(process.cwd(), 'pivots.json');

function readMarkerId() {
  if (!existsSync(MARKER_FILE)) return null;
  try { return JSON.parse(readFileSync(MARKER_FILE, 'utf8')).entity_id || null; } catch { return null; }
}

function writeMarkerId(entity_id) {
  writeFileSync(MARKER_FILE, JSON.stringify({ entity_id }), 'utf8');
}

function clearMarkerFile() {
  try { if (existsSync(MARKER_FILE)) unlinkSync(MARKER_FILE); } catch { }
}

/** Place 👁 marker near P0. overridePos = { time, price } from snap; falls back to pivots.json. */
export async function placeWatcherMarker(overridePos = null) {
  await removeWatcherMarker();
  let pos = overridePos;
  if (!pos) {
    if (!existsSync(PIVOTS_FILE)) return;
    try {
      const pivots = JSON.parse(readFileSync(PIVOTS_FILE, 'utf8'));
      const ids = Object.keys(pivots);
      if (!ids.length) return;
      ids.sort((a, b) => pivots[a].time - pivots[b].time);
      pos = { time: pivots[ids[0]].time, price: pivots[ids[0]].price };
    } catch { return; }
  }
  try {
    const markerPos = { time: pos.time, price: pos.price * 0.997 };
    const overrides = { fontsize: 14, color: 'rgba(140,140,140,1)', fillBackground: false, drawBorder: false };
    const result = await drawShape({ shape: 'text', points: [markerPos], text: '👁', overrides });
    if (result.entity_id) writeMarkerId(result.entity_id);
  } catch { /* TV unavailable */ }
}

/** Remove the 👁 marker from chart and clear marker file. */
export async function removeWatcherMarker() {
  const entity_id = readMarkerId();
  if (!entity_id) return;
  try { await removeOne({ entity_id }); } catch { /* already gone or wrong chart */ }
  clearMarkerFile();
}

/** Remove all registered pattern pairs. Watcher keeps running. */
export function clearWatcherPairs() {
  const state = readState();
  state.pairs = [];
  writeState(state);
}

const CDP_PORT = 9222;

/**
 * Return the chart_id of the single visible chart tab, or null if ambiguous.
 * Uses visibilityState — only returns a value when exactly one chart is visible.
 * In split-pane layouts where multiple charts are visible, returns null (safe: no unplant).
 */
async function getActiveFocusedChartId() {
  try {
    const resp = await fetch(`http://localhost:${CDP_PORT}/json/list`);
    const targets = await resp.json();
    const charts = targets.filter(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url));
    if (charts.length === 0) return null;
    if (charts.length === 1) return charts[0].url.match(/\/chart\/([^/?]+)/)?.[1] || null;
    const visible = [];
    for (const t of charts) {
      const state = await probeEval(t.id, 'document.visibilityState');
      if (state === 'visible') visible.push(t);
    }
    if (visible.length === 1) return visible[0].url.match(/\/chart\/([^/?]+)/)?.[1] || null;
  } catch {}
  return null;
}

/** Read the current CDP target's chart_id and persist it to watcher-state.json. */
export async function storePlantChartId() {
  try {
    const info = await getTargetInfo();
    const chart_id = info?.url?.match(/\/chart\/([^/?]+)/)?.[1] || null;
    if (chart_id) {
      const state = readState();
      state.chart_id = chart_id;
      writeState(state);
    }
    return chart_id;
  } catch { return null; }
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
  const logPath = join(process.cwd(), 'watcher.log');
  const logFd = openSync(logPath, 'a');
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio:    ['ignore', logFd, logFd],
    env:      process.env,
    cwd:      process.cwd(),
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid), 'utf8');
}

/** Kill watcher and remove state files. */
export async function stopWatcher() {
  try { await removeWatcherMarker(); } catch { /* ignore */ }
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
  let snapResult;
  try {
    snapResult = await snapPivots();
    process.stderr.write(`[watcher] snap: ${JSON.stringify(snapResult)}\n`);
  } catch (err) {
    process.stderr.write(`[watcher] snap error: ${err.message}\n`);
    return;
  }

  const attachedIds = new Set((snapResult.snapped || []).map(s => s.id));
  const snapPositions = {};
  for (const s of (snapResult.snapped || [])) snapPositions[s.id] = { time: s.targetTime, price: s.price };

  // Reposition 👁 marker to snapped P0 (earliest snapped pivot by time)
  const snappedList = (snapResult.snapped || []).slice().sort((a, b) => a.targetTime - b.targetTime);
  if (snappedList.length > 0) {
    const p0 = snappedList[0];
    try { await placeWatcherMarker({ time: p0.targetTime, price: p0.price }); } catch (err) {
      process.stderr.write(`[watcher] marker error: ${err.message}\n`);
    }
  }

  await new Promise(r => setTimeout(r, 800));
  if (pairs.length > 0) {
    await clearAlgoDrawings();
    for (const { degree, pattern } of pairs) {
      const deg = degree ?? undefined;
      const label = `${pattern}${deg != null ? ` d${deg}` : ''}`;
      try {
        if (pattern === 'tdu') await runTduAlgo({ degree: deg, attachedIds, snapPositions });
        else if (pattern === 'gz') await runGzPattern({ degree: deg, attachedIds, snapPositions });
        process.stderr.write(`[watcher] drew ${label}\n`);
      } catch (err) {
        process.stderr.write(`[watcher] skip ${label}: ${err.message}\n`);
      }
    }
  }
}

async function autoUnplant(reason) {
  process.stderr.write(`[watcher] auto-unplant: ${reason}\n`);
  // Leave MARKER_FILE intact — removal will be attempted by next plant on the correct chart
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { }
  try { if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE); } catch { }
  process.exit(0);
}

function isConnectionError(err) {
  return /ECONNREFUSED|ECONNRESET|WebSocket|closed|not open|Target/i.test(err.message || '');
}

async function pollLoop() {
  const apiPath = await getChartApi();
  let lastTf  = await evaluate(`${apiPath}.resolution()`);
  let lastSym = await evaluate(`${apiPath}.symbol()`);
  const { chart_id: plantedChartId = null } = readState();
  let errorCount = 0;

  process.stderr.write(`[watcher] started — tf=${lastTf} sym=${lastSym}\n`);

  const INTERVAL = 2000;
  while (true) {
    await new Promise(r => setTimeout(r, INTERVAL));
    try {
      const tf  = await evaluate(`${apiPath}.resolution()`);
      const sym = await evaluate(`${apiPath}.symbol()`);
      errorCount = 0;

      if (sym !== lastSym) {
        await autoUnplant(`symbol changed ${lastSym} → ${sym}`);
        return;
      }

      if (plantedChartId) {
        const activeChartId = await getActiveFocusedChartId();
        if (activeChartId && activeChartId !== plantedChartId) {
          await autoUnplant('chart changed');
          return;
        }
      }

      if (tf !== lastTf) {
        process.stderr.write(`[watcher] tf change ${lastTf} → ${tf}\n`);
        lastTf = tf;
        const { pairs } = readState();
        await redrawAll(pairs);
      }
    } catch (err) {
      process.stderr.write(`[watcher] error: ${err.message}\n`);
      if (isConnectionError(err)) {
        await autoUnplant('connection lost');
        return;
      }
      errorCount++;
      if (errorCount >= 3) {
        await autoUnplant(`3 consecutive errors: ${err.message}`);
        return;
      }
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
