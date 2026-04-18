# Flag Degree Architecture — Locked Specification

> **This architecture is locked. Do not change unless explicitly requested.**

## Core Rule

```
1. Degree resolves to a fixed color bucket
2. Filter flags to that color only
3. Sort filtered flags left to right by time
4. Assign pivots from that filtered ordered set
5. Pattern logic is separate from degree logic
```

Degree is **color first**. Pivot order is **left to right second**.

---

## Fixed Color-to-Degree Map

| Degree | Color | Exact `flagColor` value |
|---|---|---|
| D1 | red | `rgba(242, 54, 69, 1)` |
| D2 | gray | `rgba(128, 128, 128, 1)` |
| D3 | yellow | `rgba(251, 192, 45, 1)` |
| D4 | blue | `rgba(41, 98, 255, 1)` |

Matching is by exact string. Map is never derived dynamically.

---

## Pattern Pivot Requirements

Each pattern declares how many flags it needs. Degree selection must satisfy that minimum.

| Pattern | Flags required | CLI | Spec |
|---|---|---|---|
| TDU algo | 3 | `draw tdu` | `docs/tdu-algo-spec.md` |
| TDU GZ | 2 | `draw gz` | `docs/gz-spec.md` |

---

## CLI Syntax

```bash
# No degree — use all flags regardless of color
node src/cli/index.js draw <pattern>

# Degree-filtered
node src/cli/index.js draw <pattern> --degree 1
node src/cli/index.js draw <pattern> --degree 2
node src/cli/index.js draw <pattern> --degree 3
node src/cli/index.js draw <pattern> --degree 4
```

---

## Shared Helper

`getFlagsByDegree({ degree, minCount, _deps })` in `src/core/drawing.js`

- `degree` — 1–4 or undefined (all flags)
- `minCount` — set by each pattern (3 for TDU, 2 for GZ)
- Returns filtered, sorted flag array or throws with a clear error

**Errors:**
```
Degree {N} not found — valid degrees are 1 (red), 2 (gray), 3 (yellow), 4 (blue)
Degree {N} (color {hex}) has only {count} flags, need at least {min}
```
