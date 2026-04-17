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
    ['impulse', {
      description: 'Run Elliott Impulse pattern: read 6 flags → draw 6 tools',
      handler: () => core.runImpulse(),
    }],
    ['tdu', {
      description: 'Run TDU algo: read flags → draw pitchfork + fib',
      handler: () => core.runTduAlgo(),
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
