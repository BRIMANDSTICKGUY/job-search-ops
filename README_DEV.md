# Job Search Ops — DEV Guardrails (READ THIS BEFORE TOUCHING TYPES)

This file exists to prevent future regressions caused by lane drift, storage key mismatches,
or “quick fixes” made under time pressure.

If something breaks, **do not bypass these rules**. Fix the code to obey them.

---

## 1) Lanes policy (NON-NEGOTIABLE)

### Canonical (state + storage)
These are the ONLY values allowed in application state and LocalStorage:

- `inbox`
- `verified`
- `clientSent`
- `watchlist`
- `rejected`

These map to the `LaneId` type in `app/types.ts`.

### UI only (display / selects / pills)
These values are **display-only** and must NEVER be stored:

- `INBOX`
- `VERIFIED`
- `CLIENT-SENT`
- `WATCHLIST`
- `REJECTED`

These map to the `UpperLaneId` type.

### Required helpers
All conversions must go through these helpers in `app/types.ts`:

- `toUpperLane(lane: LaneId): UpperLaneId`
- `toLowerLane(lane: UpperLaneId): LaneId`
- `normalizeLane(input: unknown): LaneId`

**Rule:**  
If you see uppercase lanes in state, jobs, or LocalStorage — that is a bug.

---

## 2) LocalStorage policy (single source of truth)

The entire app (coach + client) uses ONE storage key:

