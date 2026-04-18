# Pivot Snap — Locked Specification

> **This behavior is locked. Do not change any part of this spec unless explicitly requested.**

## Operator Aliases

| Phrase | Executes |
|---|---|
| `save pivots` | `node src/cli/index.js draw pivots-save` |
| `snap pivots` | `node src/cli/index.js draw pivots-snap` |
| `sync algo d1` | `node src/cli/index.js draw tdu-sync --degree 1` |
| `sync algo d2` | `node src/cli/index.js draw tdu-sync --degree 2` |
| `sync algo d3` | `node src/cli/index.js draw tdu-sync --degree 3` |
| `sync algo d4` | `node src/cli/index.js draw tdu-sync --degree 4` |
| `sync gz d1` | `node src/cli/index.js draw gz-sync --degree 1` |
| `sync gz d2` | `node src/cli/index.js draw gz-sync --degree 2` |
| `sync gz d3` | `node src/cli/index.js draw gz-sync --degree 3` |
| `sync gz d4` | `node src/cli/index.js draw gz-sync --degree 4` |
| `refresh algo d1` | `node src/cli/index.js draw tdu-refresh --degree 1` |
| `refresh algo d2` | `node src/cli/index.js draw tdu-refresh --degree 2` |
| `refresh algo d3` | `node src/cli/index.js draw tdu-refresh --degree 3` |
| `refresh algo d4` | `node src/cli/index.js draw tdu-refresh --degree 4` |
| `refresh gz d1` | `node src/cli/index.js draw gz-refresh --degree 1` |
| `refresh gz d2` | `node src/cli/index.js draw gz-refresh --degree 2` |
| `refresh gz d3` | `node src/cli/index.js draw gz-refresh --degree 3` |
| `refresh gz d4` | `node src/cli/index.js draw gz-refresh --degree 4` |

---

## Primary Daily Workflow

```bash
# 1. On reference timeframe (1D) — place flags at swing pivots
node src/cli/index.js draw pivots-save

# 2. Switch to any lower timeframe (4H, 1H, etc.)

# 3. One command — snap flags + clear stale drawings + redraw pattern
node src/cli/index.js draw tdu-sync --degree 1
# or
node src/cli/index.js draw gz-sync --degree 1
```

**Sync is the normal daily-use workflow.** Use `tdu-refresh` / `gz-refresh` only when pivots are already snapped and you just want to redraw.

---

## Sync Step Order

```
tdu-sync --degree N:
  1. snapPivots()          — find correct lower-TF bars, move flags visually
  2. 300ms settle delay
  3. clearAlgoDrawings()   — remove stale drawings
  4. runTduAlgo({ degree }) — redraw from updated pivot positions

gz-sync --degree N:
  1. snapPivots()
  2. 300ms settle delay
  3. clearAlgoDrawings()
  4. runGzPattern({ degree })
```

---

## Snap Targeting Rule

For each saved pivot (from `pivots.json`):

1. **Search window:** `[savedTime, savedTime + 86400)` — the full 1D candle span
2. **Scan** all lower-timeframe bars within that window
3. **Score** each bar: `min(|savedPrice − O|, |savedPrice − H|, |savedPrice − L|, |savedPrice − C|)`
4. **Select** the bar with the lowest score (exact OHLC hit = priceDelta 0)
5. **Target:** use that bar's `time` and `timePointToIndex(time)` as `index`
6. **Price:** keep `savedPrice` unchanged — never modify the pivot price

Fallback: if no bars found in window, use `savedTime` directly.

After snap, `pivots.json` is updated with `targetTime` values so pattern draws anchor to the same bars the flags are on.

---

## Movement Path

After target is resolved, move the flag via model layer:

```js
source.setPoint(0, { time: targetTime, price: savedPrice, index: barIndex })
source.pointsetUpdated()
source._updateAllPaneViews()   // if available
```

This is the confirmed working path. Do not change it.

**Key findings:**
- `index` is required — without it TV updates the model but does not render the flag icon
- `pointsetUpdated()` triggers the render cycle
- `_updateAllPaneViews()` ensures pane repaint

---

## Constraints

- Price is never modified by snap
- `pivots-save` from 1D always restores stable 1D coords as the baseline
- Works for any lower timeframe (4H, 1H, etc.) as long as bars are loaded in chart
- Implemented in `src/core/drawing.js` → `snapPivots()`, `syncTdu()`, `syncGz()`
