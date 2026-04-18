# TDU GZ — Locked Specification

> **This behavior is locked. Do not change any part of this spec unless explicitly requested.**

## Operator Aliases

| Phrase | Executes |
|---|---|
| `gz` | `node src/cli/index.js draw gz` |
| `tdu gz` | `node src/cli/index.js draw gz` |
| `run gz` | `node src/cli/index.js draw gz` |
| `run tdu gz` | `node src/cli/index.js draw gz` |

---

## CLI Command

```bash
# All flags (first 2 left to right, any color)
node src/cli/index.js draw gz

# Degree-filtered
node src/cli/index.js draw gz --degree 1
node src/cli/index.js draw gz --degree 2
node src/cli/index.js draw gz --degree 3
node src/cli/index.js draw gz --degree 4
```

## Refresh Command

Clears stale algo drawings, then redraws GZ from saved pivots (`pivots.json`).

```bash
node src/cli/index.js draw gz-refresh --degree 1
node src/cli/index.js draw gz-refresh --degree 2
node src/cli/index.js draw gz-refresh --degree 3
node src/cli/index.js draw gz-refresh --degree 4
```

- Uses saved pivots automatically — does not re-read TradingView flag coords
- Runs `clear-algo` first, then redraws
- Use after timeframe changes to restore the pattern from stable coords

Implemented in `src/core/drawing.js` → `runGzPattern()`

---

## Degree Selection

Follows shared flag-degree architecture (`docs/flag-degree-spec.md`):

1. Degree resolves to fixed color bucket
2. Filter flags to that color only
3. Sort filtered flags left to right by time
4. Assign P0, P1 from that filtered ordered set

TDU GZ is a **2-flag pattern** — requires minimum 2 flags in the selected set.

---

## Pivot Assignment

- P0 = first flag (leftmost) in selected set
- P1 = second flag in selected set

---

## Anchor Rule

```
anchor1.time  = P1.time
anchor1.price = P0.price
anchor2.time  = P1.time + (P1.time - P0.time)
anchor2.price = P1.price
```

The projected time span equals the P0→P1 distance, extended forward from P1.

---

## Tool 1 — Fib Retracement

- Shape: `fib_retracement`
- Points: `[anchor1, anchor2]`
- Preset: `TDU_FIB_OVERRIDES` + `TDU_LEVEL_PROPERTIES` applied via `setProperties` post-creation
- Same preset as TDU algo fib — do not change independently

### Fib Level Price Formula

```
level_price = anchor2.price - coeff × (anchor2.price - anchor1.price)
```

---

## Tool 2 — GZ Box

- Shape: `rectangle`
- Left edge: `anchor1.time`
- Right edge: `anchor2.time`
- Price calculations:
  ```
  range = anchor2.price - anchor1.price
  gz50  = anchor2.price - 0.50 × range
  gz65  = anchor2.price - 0.65 × range
  ```
- Style:
  ```
  backgroundColor: rgba(255, 220, 0, 0.12)
  color:           rgba(255, 220, 0, 0.4)
  linewidth:       1
  ```
- No label

---

## Constraints

- Placement only
- No tracking
- No screenshots
- No extra logic
