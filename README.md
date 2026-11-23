# btcrace4 — BTC 24h race bot (make.fun btc-race-24h-20261123-0511)

Long-only 1-minute cbBTC/USDC bot. $1,000 USDC start, one position, full size.

## Strategy

- **Entry:** when flat, buy with all cash once the close is ≥ 50 bps above the
  close 30 bars ago (the first genuine up-move of the day).
- **Exit:** trailing stop 200 bps below the highest close since entry. No
  take-profit — a trending day is ridden to the end; a reversal caps the
  give-back at ~200 bps.
- **Re-entry:** after a stop-out, wait 60 bars before a fresh entry.
- Orders carry `max_slippage_bps: 200`; at most one order per batch.

## Why this shape

Dev window (2026-11-22 05:11 UTC → 2026-11-23 05:11 UTC, +364 bps overall):
one big +229 bps hour, then chop. Fast EMA crosses churned 70+ trades and
lost money to the ~26–46 bps round-trip cost. Every neighbour of this rule
(15/30/60-min lookback, 40–60 bps threshold, 200 bps or no trailing stop)
made +$20 to +$32 with 1 trade and ~2% max drawdown, so the choice is not
a knife-edge fit.

## Local grade (dev window)

<!-- filled after grade-local runs -->

## Files

- `main.ts` — the bot (Node 22 erasable TypeScript, `runBars` from the shim).
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's `sdk/makefun-bars.ts`.
- `LICENSE` — MIT.
