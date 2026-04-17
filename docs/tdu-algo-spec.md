# TDU Algo — Locked Specification

> **This behavior is locked. Do not change any part of this spec unless explicitly requested.**

## CLI Command

```
node src/cli/index.js draw tdu
```

Implemented in `src/core/drawing.js` → `runTduAlgo()`

---

## Pivot Source and Ordering

- Source: all `flag` shapes currently on the chart
- Minimum required: 3 flags
- Ordering: sorted left to right by timestamp
- Assignment: P0 = earliest, P1 = middle, P2 = latest

---

## Tool 1 — Pitchfork

- Shape: `pitchfork`
- Points: `[P0, P1, P2]`
  - P0 = handle
  - P1 = left tine
  - P2 = right tine
- Style: Andrews (style 0, default)
- Level enabled: whichever level key has coefficient `1.0` — found dynamically via `setProperties` post-creation
- All other levels: off

---

## Tool 2 — Fib Retracement

- Shape: `fib_retracement`
- Anchors:
  - anchor1: `{ time: P1.time, price: P0.price }`
  - anchor2: `{ time: P2.time, price: P1.price }`
- Level colors/visibility applied via `setProperties` post-creation (level arrays ignored by `createMultipointShape`)
- Preset: `TDU_FIB_OVERRIDES` + `TDU_LEVEL_PROPERTIES` defined in `src/core/drawing.js`

### Fib Level Price Formula

TV renders the fib from anchor2.price → anchor1.price:

```
level_price = anchor2.price - coeff × (anchor2.price - anchor1.price)
```

---

## Tool 3 — GZ Box

- Shape: `rectangle`
- Marks the golden zone between the 0.5 and 0.65 fib levels
- Points:
  - top-left:     `{ time: P1.time, price: gz50 }`
  - bottom-right: `{ time: P2.time, price: gz65 }`
- Price calculations (no screenshot needed — pure math):
  ```
  range = anchor2.price - anchor1.price  (= P1.price - P0.price)
  gz50  = anchor2.price - 0.50 × range
  gz65  = anchor2.price - 0.65 × range
  ```
- Style: subdued yellow fill, yellow border, no label
  ```
  backgroundColor: rgba(255, 220, 0, 0.12)
  color:           rgba(255, 220, 0, 0.4)
  linewidth:       1
  ```

---

## Remove Algo Drawings

```
node src/cli/index.js draw clear-algo
```

Removes all non-flag shapes. Flags are never touched.
