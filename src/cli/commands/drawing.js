import { register } from '../router.js';
import * as core from '../../core/drawing.js';

register('draw', {
  description: 'Drawing tools (shape, list, get, remove, clear)',
  subcommands: new Map([
    ['shape', {
      description: 'Draw a shape on the chart',
      options: {
        type: { type: 'string', short: 't', description: 'Drawing tool name (e.g., horizontal_line, trend_line, price_range, fibonacci_retracement)' },
        price: { type: 'string', short: 'p', description: 'Price level' },
        time: { type: 'string', description: 'Unix timestamp' },
        price2: { type: 'string', description: 'Second point price' },
        time2: { type: 'string', description: 'Second point time' },
        points: { type: 'string', description: 'JSON array of points e.g. \'[{"time":123,"price":456},...]\' (overrides --time/--price flags)' },
        text: { type: 'string', description: 'Text content (for annotation tools)' },
        overrides: { type: 'string', description: 'JSON style overrides' },
      },
      handler: (opts) => {
        const points = opts.points
          ? JSON.parse(opts.points)
          : [{ time: Number(opts.time), price: Number(opts.price) }];
        if (!opts.points && opts.price2) points.push({ time: Number(opts.time2), price: Number(opts.price2) });
        return core.drawShape({ shape: opts.type || 'horizontal_line', points, overrides: opts.overrides, text: opts.text });
      },
    }],
    ['list', {
      description: 'List all drawings on the chart',
      handler: () => core.listDrawings(),
    }],
    ['get', {
      description: 'Get properties of a drawing',
      handler: (opts, positionals) => core.getProperties({ entity_id: positionals[0] }),
    }],
    ['remove', {
      description: 'Remove a drawing by entity ID',
      handler: (opts, positionals) => core.removeOne({ entity_id: positionals[0] }),
    }],
    ['clear', {
      description: 'Remove all drawings',
      handler: () => core.clearAll(),
    }],
    ['clear-algo', {
      description: 'Remove all algo drawings, keep flags',
      handler: () => core.clearAlgoDrawings(),
    }],
    ['pivots-fix', {
      description: 'Reposition live flag objects to their saved pivot coords in pivots.json',
      options: {
        id: { type: 'string', description: 'Entity ID of specific flag to fix' },
      },
      handler: (opts) => core.fixPivots({ id: opts.id }),
    }],
    ['pivots-save', {
      description: 'Save all flag pivot coordinates from TradingView to pivots.json (use on reference timeframe)',
      handler: () => core.savePivots(),
    }],
    ['pivots-snap', {
      description: 'Snap live flags to nearest OHLC price on current timeframe bars',
      handler: () => core.snapPivots(),
    }],
    ['pivots-clear', {
      description: 'Clear saved pivot records — all, or by --id',
      options: {
        id: { type: 'string', description: 'Entity ID of specific pivot to clear' },
      },
      handler: (opts) => core.clearPivots({ id: opts.id }),
    }],
    ['impulse', {
      description: 'Run Elliott Impulse pattern: read 6 flags → draw 6 tools',
      handler: () => core.runImpulse(),
    }],
    ['tdu', {
      description: 'Run TDU algo: read flags → draw pitchfork + fib',
      options: {
        degree: { type: 'string', description: 'Degree 1–4: filter flags by D-N color (derived left→right by first unique color)' },
      },
      handler: (opts) => core.runTduAlgo({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['tdu-refresh', {
      description: 'Clear algo drawings and redraw TDU from saved pivots',
      options: {
        degree: { type: 'string', description: 'Degree 1–4' },
      },
      handler: (opts) => core.refreshTdu({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['gz-refresh', {
      description: 'Clear algo drawings and redraw GZ from saved pivots',
      options: {
        degree: { type: 'string', description: 'Degree 1–4' },
      },
      handler: (opts) => core.refreshGz({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['tdu-sync', {
      description: 'Full sync: snap pivots → clear algo → redraw TDU on current timeframe',
      options: {
        degree: { type: 'string', description: 'Degree 1–4' },
      },
      handler: (opts) => core.syncTdu({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['gz-sync', {
      description: 'Full sync: snap pivots → clear algo → redraw GZ on current timeframe',
      options: {
        degree: { type: 'string', description: 'Degree 1–4' },
      },
      handler: (opts) => core.syncGz({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['gz', {
      description: 'GZ pattern: 2 flags → TDU fib + GZ box (projected time)',
      options: {
        degree: { type: 'string', description: 'Filter flags by degree color (1–4)' },
      },
      handler: (opts) => core.runGzPattern({ degree: opts.degree != null ? Number(opts.degree) : undefined }),
    }],
    ['tdu-fib', {
      description: 'Draw TDU fib retracement from ordered flag pivots (P0, P1, P2)',
      handler: () => core.drawTduFib(),
    }],
    ['track-targets', {
      description: 'Track TDU fib target levels in real time, mark crossed levels with ✓',
      options: {
        id:       { type: 'string', description: 'Fib entity ID to track (from draw tdu-fib output)' },
        since:    { type: 'string', description: 'Only check bars after this unix timestamp (default: fib anchor2 time)' },
        interval: { type: 'string', description: 'Poll interval in ms (default 5000)' },
      },
      handler: async (opts) => {
        if (!opts.id) throw new Error('--id is required');
        return core.trackTduFibTargets({
          entity_id: opts.id,
          since_time: opts.since ? Number(opts.since) : undefined,
          interval: opts.interval ? Number(opts.interval) : undefined,
        });
      },
    }],
  ]),
});
