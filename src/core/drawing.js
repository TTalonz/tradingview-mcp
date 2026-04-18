/**
 * Core drawing logic.
 */
import { evaluate as _evaluate, getChartApi as _getChartApi, safeString, requireFinite } from '../connection.js';

// ── Resolution helper ─────────────────────────────────────────────────────────
export function resolutionToSeconds(resolution) {
  const r = String(resolution).toUpperCase();
  if (r === 'D' || r === '1D') return 86400;
  if (r === 'W' || r === '1W') return 604800;
  if (r === 'M' || r === '1M') return 2592000;
  const n = parseInt(r, 10);
  if (!isNaN(n) && n > 0) return n * 60;
  throw new Error(`Cannot convert resolution to seconds: ${resolution}`);
}

// ── Pitchfork style mapping ───────────────────────────────────────────────────
// Maps semantic names to TradingView's internal style integers.
// style 0 = Andrews (original), 1 = Schiff, 2 = Modified Schiff
export const PITCHFORK_STYLE = {
  original:           0,
  original_recipient: 0,
  corrective:         1,
  channel:            2,
};

// ── TDU Fib preset ────────────────────────────────────────────────────────────
// Level format: [coefficient, color, enabled, label]
// Scalar overrides (fillBackground, showPrices, etc.) apply via createMultipointShape.
// Level arrays are ignored by that path — applied post-creation via setProperties instead.
const TDU_FIB_OVERRIDES = {
  showCoeffs: true,
  showPrices: true,
  fillBackground: false,
  extendLines: false,
  extendLinesLeft: false,
  showText: true,
  labelFontSize: 12,
  level1:  [0,      'rgba(128, 128, 128, 1)',  false, ''],
  level2:  [0.236,  'rgba(204, 40, 40, 1)',    false, ''],
  level3:  [0.382,  'rgba(152, 152, 152, 1)',  false, ''],
  level4:  [0.5,    'rgba(255, 235, 59, 1)',   true,  ''],
  level5:  [0.618,  'rgba(255, 215, 0, 1)',    true,  ''],
  level6:  [0.786,  'rgba(93, 96, 107, 1)',    true,  ''],
  level7:  [1,      'rgba(128, 128, 128, 1)',  false, ''],
  level8:  [-0.236, 'rgba(0, 200, 83, 1)',     true,  ''],
  level9:  [-0.618, 'rgba(0, 200, 83, 1)',     true,  ''],
  level10: [0.886,  'rgba(149, 40, 204, 1)',   false, ''],
  level11: [0.707,  'rgba(255, 255, 255, 1)',  false, ''],
  level12: [0.65,   'rgba(255, 215, 0, 1)',    true,  ''],
  level13: [-0.236, 'rgba(149, 152, 161, 1)',  false, ''],
  level14: [0.854,  'rgba(255, 255, 0, 1)',    false, ''],
  level15: [-1,     'rgba(0, 200, 83, 1)',     true,  ''],
  level16: [-1.236, 'rgba(40, 204, 149, 1)',   false, ''],
  level17: [-0.65,  'rgba(255, 255, 0, 1)',    false, ''],
  level18: [0.9,    'rgba(128, 128, 128, 1)',  false, ''],
  level19: [3.414,  'rgba(40, 40, 204, 1)',    false, ''],
  level20: [4,      'rgba(204, 40, 40, 1)',    false, ''],
  level21: [4.272,  'rgba(149, 40, 204, 1)',   false, ''],
  level22: [1.382,  'rgba(204, 40, 149, 1)',   false, ''],
  level23: [4.618,  'rgba(149, 204, 40, 1)',   false, ''],
  level24: [-1.618, 'rgba(246, 178, 107, 1)',  false, ''],
};

// Applied post-creation via setProperties — level arrays are ignored by createMultipointShape overrides
const TDU_LEVEL_PROPERTIES = {
  level4:  [0.5,    'rgba(255, 235, 59, 1)',   true,  ''],
  level5:  [0.618,  'rgba(255, 215, 0, 1)',    true,  ''],
  level6:  [0.786,  'rgba(93, 96, 107, 1)',    true,  ''],
  level8:  [-0.236, 'rgba(0, 200, 83, 1)',     true,  ''],
  level9:  [-0.618, 'rgba(0, 200, 83, 1)',     true,  ''],
  level12: [0.65,   'rgba(255, 215, 0, 1)',    true,  ''],
  level15: [-1,     'rgba(0, 200, 83, 1)',     true,  ''],
  level1:  [0,      'rgba(128, 128, 128, 1)',  false, ''],
  level2:  [0.236,  'rgba(204, 40, 40, 1)',    false, ''],
  level3:  [0.382,  'rgba(152, 152, 152, 1)',  false, ''],
  level7:  [1,      'rgba(128, 128, 128, 1)',  false, ''],
  level10: [0.886,  'rgba(149, 40, 204, 1)',   false, ''],
  level11: [0.707,  'rgba(255, 255, 255, 1)',  false, ''],
  level13: [-0.236, 'rgba(149, 152, 161, 1)',  false, ''],
  level14: [0.854,  'rgba(255, 255, 0, 1)',    false, ''],
  level16: [-1.236, 'rgba(40, 204, 149, 1)',   false, ''],
  level17: [-0.65,  'rgba(255, 255, 0, 1)',    false, ''],
  level18: [0.9,    'rgba(128, 128, 128, 1)',  false, ''],
  level19: [3.414,  'rgba(40, 40, 204, 1)',    false, ''],
  level20: [4,      'rgba(204, 40, 40, 1)',    false, ''],
  level21: [4.272,  'rgba(149, 40, 204, 1)',   false, ''],
  level22: [1.382,  'rgba(204, 40, 149, 1)',   false, ''],
  level23: [4.618,  'rgba(149, 204, 40, 1)',   false, ''],
  level24: [-1.618, 'rgba(246, 178, 107, 1)',  false, ''],
};

// ── Degree-based flag selection ───────────────────────────────────────────────
// Fixed color-to-degree map based on user workflow.
// degree=undefined → returns all flags (existing behavior).
const DEGREE_COLOR_MAP = {
  1: 'rgba(242, 54, 69, 1)',   // red
  2: 'rgba(128, 128, 128, 1)', // gray
  3: 'rgba(251, 192, 45, 1)',  // yellow
  4: 'rgba(41, 98, 255, 1)',   // blue
};

export async function getFlagsByDegree({ degree, minCount = 3, _deps } = {}) {
  const { shapes } = await listDrawings(_deps);
  const flagShapes = shapes.filter(s => s.name === 'flag');

  const flags = [];
  for (const { id } of flagShapes) {
    const props = await getProperties({ entity_id: id, _deps });
    if (props.points?.[0]) {
      flags.push({
        id,
        time:  props.points[0].time,
        price: props.points[0].price,
        color: props.properties?.flagColor || null,
      });
    }
  }
  flags.sort((a, b) => a.time - b.time);

  if (degree == null) {
    if (flags.length < minCount) throw new Error(`Need at least ${minCount} flag pivots, found ${flags.length}`);
    return flags;
  }

  const N = Number(degree);
  const targetColor = DEGREE_COLOR_MAP[N];
  if (!targetColor) {
    throw new Error(`Degree ${N} not found — valid degrees are 1 (red), 2 (gray), 3 (yellow), 4 (blue)`);
  }

  const filtered = flags.filter(f => f.color === targetColor);

  if (filtered.length < minCount) {
    throw new Error(`Degree ${N} (color ${targetColor}) has only ${filtered.length} flag${filtered.length !== 1 ? 's' : ''}, need at least ${minCount}`);
  }

  return filtered;
}

export async function drawTduFib({ degree, _deps } = {}) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const apiPath = await getChartApi();

  // 1. Read flags filtered by degree (or all if no degree)
  const [P0, P1, P2] = await getFlagsByDegree({ degree, minCount: 3, _deps });

  // 3. TDU fib anchors: anchor1=(P1.time, P0.price), anchor2=(P2.time, P1.price)
  const anchor1 = { time: P1.time, price: P0.price };
  const anchor2 = { time: P2.time, price: P1.price };

  const result = await drawShape({
    shape: 'fib_retracement',
    points: [anchor1, anchor2],
    overrides: JSON.stringify(TDU_FIB_OVERRIDES),
    _deps,
  });

  // Apply level colors via setProperties — level arrays are ignored by createMultipointShape overrides
  if (result.entity_id) {
    await evaluate(`
      (function() {
        var api = ${apiPath};
        var shape = api.getShapeById(${JSON.stringify(result.entity_id)});
        if (shape && typeof shape.setProperties === 'function') {
          shape.setProperties(${JSON.stringify(TDU_LEVEL_PROPERTIES)});
        }
      })()
    `);
  }

  return result;
}

export async function trackTduFibTargets({ entity_id, since_time, interval = 5000, _deps } = {}) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const apiPath = await getChartApi();
  const MODEL = 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model()';

  // Read fib anchors to compute target level prices
  const { points } = await getProperties({ entity_id, _deps });
  if (!points || points.length < 2) throw new Error(`Fib ${entity_id} not found or missing points`);
  const a1 = points[0]; // anchor1: P0.price at P1.time
  const a2 = points[1]; // anchor2: P1.price at P2.time+1bar

  const trackFrom = since_time != null ? since_time : a2.time;
  const lvlPrice = (c) => a2.price + c * (a1.price - a2.price);
  const goingDown = a1.price > a2.price;

  const targets = [
    { coeff: -0.236, key: 'level8',  label: '-0.236', color: 'rgba(0, 200, 83, 1)' },
    { coeff: -0.618, key: 'level9',  label: '-0.618', color: 'rgba(0, 200, 83, 1)' },
    { coeff: -1,     key: 'level15', label: '-1',      color: 'rgba(0, 200, 83, 1)' },
  ].map(t => ({ ...t, price: lvlPrice(t.coeff), hit: false }));

  const checkedBarTimes = new Set();
  let running = true;
  process.on('SIGINT',  () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  process.stderr.write(`[track:tdu-fib] entity=${entity_id} from=${trackFrom} targets=${targets.map(t => `${t.label}@${t.price.toFixed(2)}`).join(', ')}\n`);

  while (running) {
    try {
      // Get confirmed closed bars after trackFrom (skip current forming bar)
      const bars = await evaluate(`
        (function() {
          var m = ${MODEL};
          var b = m.mainSeries().bars();
          var last = b.lastIndex();
          var result = [];
          for (var i = last - 1; i >= 0 && result.length < 50; i--) {
            var v = b.valueAt(i);
            if (!v || v[0] <= ${JSON.stringify(trackFrom)}) break;
            result.push({ time: v[0], high: v[2], low: v[3], close: v[4] });
          }
          return result;
        })()
      `);

      for (const bar of (bars || [])) {
        if (checkedBarTimes.has(bar.time)) continue;
        checkedBarTimes.add(bar.time);

        for (const t of targets) {
          if (t.hit) continue;
          const crossed = goingDown ? bar.low <= t.price : bar.high >= t.price;
          if (!crossed) continue;

          t.hit = true;
          // Append checkmark to level label — only modifies text, keeps color and enabled state
          await evaluate(`
            (function() {
              var shape = ${apiPath}.getShapeById(${JSON.stringify(entity_id)});
              if (shape && typeof shape.setProperties === 'function') {
                var p = {};
                p[${JSON.stringify(t.key)}] = [${t.coeff}, ${JSON.stringify(t.color)}, true, ${JSON.stringify(' \u2713')}];
                shape.setProperties(p);
              }
            })()
          `);
          process.stdout.write(JSON.stringify({ type: 'target_hit', level: t.label, level_price: t.price, bar_close: bar.close, bar_time: bar.time }) + '\n');
        }
      }

      if (targets.every(t => t.hit)) {
        process.stderr.write(`[track:tdu-fib] all targets hit\n`);
        break;
      }
    } catch (err) {
      if (/CDP|ECONNREFUSED/i.test(err.message)) { await new Promise(r => setTimeout(r, 2000)); continue; }
      process.stderr.write(`[track:tdu-fib] error: ${err.message}\n`);
    }
    await new Promise(r => setTimeout(r, interval));
  }

  return { done: true, targets: targets.map(t => ({ level: t.label, price: t.price, hit: t.hit })) };
}

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate, getChartApi: deps?.getChartApi || _getChartApi };
}

export async function drawShape({ shape, points, overrides: overridesRaw, text, _deps }) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const overrides = overridesRaw ? (typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw) : {};
  const apiPath = await getChartApi();
  const overridesStr = JSON.stringify(overrides || {});
  const textStr = text ? JSON.stringify(text) : '""';

  const validatedPoints = points.map((p, i) => ({
    time: requireFinite(p.time, `points[${i}].time`),
    price: requireFinite(p.price, `points[${i}].price`),
  }));

  const pointsStr = JSON.stringify(validatedPoints);

  const before = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);

  if (validatedPoints.length === 1) {
    await evaluate(`
      ${apiPath}.createShape(
        ${JSON.stringify(validatedPoints[0])},
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  } else {
    await evaluate(`
      ${apiPath}.createMultipointShape(
        ${pointsStr},
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  }

  await new Promise(r => setTimeout(r, 200));
  const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  const newId = (after || []).find(id => !(before || []).includes(id)) || null;

  // Simulate the final user click: call finish() on the internal model object to
  // commit multi-point tools that createMultipointShape leaves in "drawing in progress" state.
  if (newId && validatedPoints.length > 1) {
    await evaluate(`
      (function() {
        var col = window._exposed_chartWidgetCollection;
        if (!col) return;
        var w = col.activeChartWidget && col.activeChartWidget.value ? col.activeChartWidget.value() : null;
        if (!w) return;
        var model = w.model ? w.model() : null;
        if (!model) return;
        var sources = model.dataSources ? model.dataSources() : [];
        for (var i = 0; i < sources.length; i++) {
          var s = sources[i];
          if (s.id && s.id() === ${JSON.stringify(newId)} && typeof s.finish === 'function') {
            s.finish();
            break;
          }
        }
      })()
    `);
  }

  return { success: true, shape, entity_id: newId };
}

export async function listDrawings(_deps) {
  const { evaluate } = _resolve(_deps);
  const apiPath = await (_deps?.getChartApi || _getChartApi)();
  const shapes = await evaluate(`
    (function() {
      var api = ${apiPath};
      var all = api.getAllShapes();
      return all.map(function(s) { return { id: s.id, name: s.name }; });
    })()
  `);
  return { success: true, count: shapes?.length || 0, shapes: shapes || [] };
}

export async function getProperties({ entity_id, _deps }) {
  const { evaluate } = _resolve(_deps);
  const apiPath = await (_deps?.getChartApi || _getChartApi)();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var props = { entity_id: eid };
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      var methods = [];
      try { for (var key in shape) { if (typeof shape[key] === 'function') methods.push(key); } props.available_methods = methods; } catch(e) {}
      try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) { props.points_error = e.message; }
      try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {
        try { var ovr2 = shape.properties(); if (ovr2) props.properties = ovr2; } catch(e2) { props.properties_error = e2.message; }
      }
      try { props.visible = shape.isVisible(); } catch(e) {}
      try { props.locked = shape.isLocked(); } catch(e) {}
      try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
      try {
        var all = api.getAllShapes();
        for (var i = 0; i < all.length; i++) { if (all[i].id === eid) { props.name = all[i].name; break; } }
      } catch(e) {}
      return props;
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function removeOne({ entity_id, _deps }) {
  const { evaluate } = _resolve(_deps);
  const apiPath = await (_deps?.getChartApi || _getChartApi)();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var before = api.getAllShapes();
      var found = false;
      for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
      if (!found) return { removed: false, error: 'Shape not found: ' + eid, available: before.map(function(s) { return s.id; }) };
      api.removeEntity(eid);
      var after = api.getAllShapes();
      var stillExists = false;
      for (var j = 0; j < after.length; j++) { if (after[j].id === eid) { stillExists = true; break; } }
      return { removed: !stillExists, entity_id: eid, remaining_shapes: after.length };
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, entity_id: result?.entity_id, removed: result?.removed, remaining_shapes: result?.remaining_shapes };
}

export async function clearAll(_deps) {
  const { evaluate } = _resolve(_deps);
  const apiPath = await (_deps?.getChartApi || _getChartApi)();
  await evaluate(`${apiPath}.removeAllShapes()`);
  return { success: true, action: 'all_shapes_removed' };
}

export async function clearAlgoDrawings(_deps) {
  const { shapes } = await listDrawings(_deps);
  const { evaluate } = _resolve(_deps);
  const apiPath = await (_deps?.getChartApi || _getChartApi)();
  const removed = [];
  for (const s of shapes) {
    if (s.name === 'flag') continue;
    await evaluate(`${apiPath}.removeEntity(${JSON.stringify(s.id)})`);
    removed.push(s.id);
  }
  return { success: true, removed };
}

// ── Impulse pattern level presets ────────────────────────────────────────────
// fib_trend_ext uses 6-element arrays: [coeff, color, enabled, {}/null, {}/null, label]

const IMPULSE_W3_EXT_LEVELS = {
  level1:  [0,     'rgba(128,128,128,1)', false, null, null, ''],
  level2:  [0.236, 'rgba(204,40,40,1)',   false, null, null, ''],
  level3:  [0.382, 'rgba(149,204,40,1)',  false, null, null, ''],
  level4:  [0.5,   'rgba(40,204,40,1)',   false, null, null, ''],
  level5:  [0.618, 'rgba(255,255,255,1)', false, null, null, ''],
  level6:  [0.786, 'rgba(40,149,204,1)',  false, null, null, ''],
  level7:  [1,     'rgba(128,128,128,1)', false, null, null, ''],
  level8:  [1.127, 'rgba(120,123,134,1)', true,  null, null, ''],
  level9:  [1.618, 'rgba(120,123,134,1)', true,  null, null, ''],
  level10: [1.75,  'rgba(0,255,255,1)',   false, null, null, ''],
  level11: [2.0,   'rgba(73,133,231,1)',  true,  null, null, ''],
  level13: [0.886, 'rgba(204,40,40,1)',   false, null, null, ''],
  level15: [1.382, 'rgba(40,204,40,1)',   false, null, null, ''],
  level16: [2.5,   'rgba(40,204,149,1)',  false, null, null, ''],
  level17: [2.618, 'rgba(40,149,204,1)',  true,  null, null, ''],
  level19: [3.414, 'rgba(40,40,204,1)',   false, null, null, ''],
  level20: [3.618, 'rgba(204,40,40,1)',   true,  null, null, ''],
  level21: [3,     'rgba(149,40,204,1)',  false, null, null, ''],
};

const IMPULSE_W5_EXT_LEVELS = {
  level1:  [0,     'rgba(128,128,128,1)', false, null, null, ''],
  level2:  [0.236, 'rgba(204,40,40,1)',   false, null, null, ''],
  level3:  [0.382, 'rgba(149,204,40,1)',  false, null, null, ''],
  level4:  [0.5,   'rgba(40,204,40,1)',   true,  null, null, ''],
  level5:  [0.618, 'rgba(255,255,255,1)', true,  null, null, ''],
  level6:  [0.786, 'rgba(40,149,204,1)',  false, null, null, ''],
  level7:  [1,     'rgba(128,128,128,1)', false, null, null, ''],
  level8:  [1.272, 'rgba(120,123,134,1)', false, null, null, ''],
  level9:  [1.618, 'rgba(120,123,134,1)', false, null, null, ''],
  level10: [1.75,  'rgba(0,255,255,1)',   false, null, null, ''],
  level11: [2.0,   'rgba(73,133,231,1)',  false, null, null, ''],
  level17: [2.618, 'rgba(40,149,204,1)',  false, null, null, ''],
  level20: [3.618, 'rgba(204,40,40,1)',   false, null, null, ''],
};

async function applyExtLevels(entity_id, levels, apiPath, evaluate) {
  await evaluate(`
    (function() {
      var shape = ${apiPath}.getShapeById(${JSON.stringify(entity_id)});
      if (shape && typeof shape.setProperties === 'function') {
        shape.setProperties(${JSON.stringify(levels)});
      }
    })()
  `);
}

// ── Elliott Impulse pattern execution ─────────────────────────────────────────
export async function runImpulse({ _deps } = {}) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const apiPath = await getChartApi();
  const resolution = await evaluate(`${apiPath}.resolution()`);
  const barSeconds = resolutionToSeconds(resolution);

  // Read flags → sort → P0..P5
  const { shapes } = await listDrawings(_deps);
  const flagShapes = shapes.filter(s => s.name === 'flag');
  if (flagShapes.length < 6) throw new Error(`Need 6 flag pivots, found ${flagShapes.length}`);

  const flags = [];
  for (const { id } of flagShapes) {
    const { points } = await getProperties({ entity_id: id, _deps });
    if (points?.[0]) flags.push({ time: points[0].time, price: points[0].price });
  }
  if (flags.length < 6) throw new Error(`Need 6 flag pivots with points, found ${flags.length}`);
  flags.sort((a, b) => a.time - b.time);
  const [P0, P1, P2, P3, P4, P5] = flags;

  // Tool 1 — Elliott Impulse Wave: P0–P5
  const t1 = await drawShape({ shape: 'elliott_impulse_wave', points: [P0,P1,P2,P3,P4,P5], _deps });

  // Tool 2 — Base Channel: P0 P2 P1
  const t2 = await drawShape({ shape: 'parallel_channel', points: [P0, P2, P1], _deps });

  // Tool 3 — Wave 2 Fib: anchor1=(P1.time, P0.price), anchor2=(P2.time+1bar, P1.price)
  const t3 = await drawShape({
    shape: 'fib_retracement',
    points: [{ time: P1.time, price: P0.price }, { time: P2.time + barSeconds, price: P1.price }],
    _deps,
  });

  // Tool 4 — Wave 3 Extension: anchor1=(P1.time, P0.price), anchor2=P1, anchor3=P2
  const t4 = await drawShape({
    shape: 'fib_trend_ext',
    points: [{ time: P1.time, price: P0.price }, P1, P2],
    _deps,
  });
  if (t4.entity_id) await applyExtLevels(t4.entity_id, IMPULSE_W3_EXT_LEVELS, apiPath, evaluate);

  // Tool 5 — Wave 4 Fib: anchor1=(P3.time, P2.price), anchor2=P3
  const t5 = await drawShape({
    shape: 'fib_retracement',
    points: [{ time: P3.time, price: P2.price }, P3],
    _deps,
  });

  // Tool 6 — Wave 5 Extension: anchor1=(P3.time, P0.price), anchor2=P2, anchor3=P3
  const t6 = await drawShape({
    shape: 'fib_trend_ext',
    points: [{ time: P3.time, price: P0.price }, P2, P3],
    _deps,
  });
  if (t6.entity_id) await applyExtLevels(t6.entity_id, IMPULSE_W5_EXT_LEVELS, apiPath, evaluate);

  return {
    success: true,
    pivots: flags.map((p, i) => ({ label: 'P'+i, time: p.time, price: p.price })),
    tools: { t1: t1.entity_id, t2: t2.entity_id, t3: t3.entity_id, t4: t4.entity_id, t5: t5.entity_id, t6: t6.entity_id },
  };
}

// ── TDU algo — lean placement only ───────────────────────────────────────────
// Read flags → sort → draw pitchfork + TDU fib. No tracking, no screenshots.
export async function runTduAlgo({ degree, _deps } = {}) {
  // 1. Read flags filtered by degree (or all if no degree)
  const [P0, P1, P2] = await getFlagsByDegree({ degree, minCount: 3, _deps });

  // 2. Draw pitchfork: P0 = handle, P1 = left tine, P2 = right tine
  //    level5 (coeff 1.0) enabled via setProperties — createMultipointShape ignores level arrays
  const pitchfork = await drawShape({ shape: 'pitchfork', points: [P0, P1, P2], _deps });
  if (pitchfork.entity_id) {
    const { evaluate: ev, getChartApi: gca } = _resolve(_deps);
    const api = await gca();
    await ev(`
      (function() {
        var shape = ${api}.getShapeById(${JSON.stringify(pitchfork.entity_id)});
        if (!shape || typeof shape.setProperties !== 'function') return;
        var props = shape.getProperties();
        var update = {};
        for (var key in props) {
          var lvl = props[key];
          if (Array.isArray(lvl) && lvl[0] === 1) {
            update[key] = [lvl[0], lvl[1], true, lvl[3], lvl[4]];
            break;
          }
        }
        if (Object.keys(update).length) shape.setProperties(update);
      })()
    `);
  }

  // 3. Draw TDU fib (reads flags internally, same pivot order)
  const fib = await drawTduFib({ degree, _deps });

  // 4. GZ box: 0.5 → 0.65 fib levels, subdued yellow, no label
  //    fib goes anchor2.price → anchor1.price, so: level = anchor2.price - coeff × range
  const fibAnchor1Price = P0.price;
  const fibAnchor2Price = P1.price;
  const fibRange = fibAnchor2Price - fibAnchor1Price;
  const gz50  = fibAnchor2Price - 0.5  * fibRange;
  const gz65  = fibAnchor2Price - 0.65 * fibRange;
  const gz = await drawShape({
    shape: 'rectangle',
    points: [{ time: P1.time, price: gz50 }, { time: P2.time, price: gz65 }],
    overrides: JSON.stringify({ backgroundColor: 'rgba(255, 220, 0, 0.12)', color: 'rgba(255, 220, 0, 0.4)', linewidth: 1 }),
    _deps,
  });

  return {
    success: true,
    pivots: {
      P0: { id: P0.id, time: P0.time, price: P0.price },
      P1: { id: P1.id, time: P1.time, price: P1.price },
      P2: { id: P2.id, time: P2.time, price: P2.price },
    },
    pitchfork: pitchfork.entity_id,
    fib: fib.entity_id,
    gz: gz.entity_id,
  };
}

// ── GZ pattern — 2-flag fib + GZ box ─────────────────────────────────────────
// P0 = first flag, P1 = second flag (left to right)
// anchor1 = (P1.time, P0.price), anchor2 = (P1.time + span, P1.price)
// where span = P1.time - P0.time
export async function runGzPattern({ degree, _deps } = {}) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const apiPath = await getChartApi();

  // 1. Read 2 flags (filtered by degree if provided)
  const flags = await getFlagsByDegree({ degree, minCount: 2, _deps });
  const [P0, P1] = flags;

  // 2. Compute anchors
  const span = P1.time - P0.time;
  const anchor1 = { time: P1.time,          price: P0.price };
  const anchor2 = { time: P1.time + span,   price: P1.price };

  // 3. Draw TDU fib with overrides
  const fib = await drawShape({
    shape: 'fib_retracement',
    points: [anchor1, anchor2],
    overrides: JSON.stringify(TDU_FIB_OVERRIDES),
    _deps,
  });
  if (fib.entity_id) {
    await evaluate(`
      (function() {
        var shape = ${apiPath}.getShapeById(${JSON.stringify(fib.entity_id)});
        if (shape && typeof shape.setProperties === 'function') {
          shape.setProperties(${JSON.stringify(TDU_LEVEL_PROPERTIES)});
        }
      })()
    `);
  }

  // 4. GZ box: 0.5 → 0.65 levels, same style as TDU algo
  //    fib renders anchor2.price → anchor1.price, so: level = anchor2.price - coeff × range
  const range = anchor2.price - anchor1.price;
  const gz50 = anchor2.price - 0.50 * range;
  const gz65 = anchor2.price - 0.65 * range;
  const gz = await drawShape({
    shape: 'rectangle',
    points: [{ time: anchor1.time, price: gz50 }, { time: anchor2.time, price: gz65 }],
    overrides: JSON.stringify({ backgroundColor: 'rgba(255, 220, 0, 0.12)', color: 'rgba(255, 220, 0, 0.4)', linewidth: 1 }),
    _deps,
  });

  return {
    success: true,
    pivots: {
      P0: { id: P0.id, time: P0.time, price: P0.price },
      P1: { id: P1.id, time: P1.time, price: P1.price },
    },
    anchors: { anchor1, anchor2 },
    fib: fib.entity_id,
    gz: gz.entity_id,
  };
}
