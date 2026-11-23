// btcrace4 — BTC 24h race bot for make.fun btc-race-24h-20261123-0511.
//
// Strategy (written from scratch for this entry, long only, $1,000 USDC start):
//   Entry: when flat, buy with all cash once the close is at least 50 bps above
//     the close 30 bars (30 minutes) ago — the first genuine up-move of the day.
//   Exit: a trailing stop 200 bps below the highest close seen since entry.
//     No take-profit: the stop alone decides the exit, so a trending day is
//     ridden to the end and a reversal caps the give-back at ~200 bps.
//   After a stop-out, wait 60 bars before a fresh entry (no same-pop re-entry).
//   Orders carry max_slippage_bps 200; one position, full size, at most one
//   order per batch.
//
// Why this shape: on the dev window (2026-11-22 05:11 UTC → 2026-11-23 05:11 UTC,
// +364 bps overall, one big +229 bps hour then chop) fast EMA crosses churned
// 70+ trades and lost money to the ~26-46 bps round-trip cost, while every
// neighbour of this rule (15/30/60-min lookback, 40-60 bps threshold, 200 bps
// or no trailing stop) made +$20 to +$32 with 1 trade and ~2% max drawdown.
// The rule is deliberately slow and low-frequency: it pays the round-trip
// cost once and lets the trend do the work.
//
// Determinism: every decision is a pure function of the closes the harness
// sent. No wall clock, no environment, no Math.random, no network.
import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Entry: 30-bar return in bps that triggers a full-size buy.
const LOOKBACK_BARS = 30;
const ENTRY_RETURN_BPS = 50;
// Exit: trailing stop, in bps below the peak close since entry.
const TRAIL_STOP_BPS = 200;
// Bars to wait after a stop-out before a fresh entry is allowed.
const REENTRY_COOLDOWN_BARS = 60;
// Max slippage vs the latest close the harness sent, in bps.
const MAX_SLIPPAGE_BPS = 200;

const closes: number[] = [];
let priceScale = 5;
let pendingBuy = false;
let pendingSell = false;
let peak = 0; // highest close seen while long, in USDC
let cooldownUntilSeq = -1;

await runBars({
  onHello(state) {
    const sym = state.hello.symbols.find((s) => s.symbol === SYMBOL);
    if (sym !== undefined) priceScale = sym.price_scale;
  },

  onBatch(state, batch) {
    // Reconcile the previous batch's orders from this batch's fills.
    for (const f of batch.fills) {
      if (f.symbol !== SYMBOL) continue;
      if (f.side === 'buy') {
        pendingBuy = false;
        if (f.status === 'filled') peak = Number(state.close(SYMBOL) ?? 0n) / 10 ** priceScale;
      } else if (f.side === 'sell' && f.status === 'filled') {
        pendingSell = false;
        peak = 0;
        cooldownUntilSeq = state.seq + REENTRY_COOLDOWN_BARS;
      } else if (f.side === 'sell') {
        pendingSell = false;
      }
    }

    // Only decide on bars that actually carry this symbol.
    if (!batch.bars.some((b) => b.symbol === SYMBOL)) return [];
    if (state.warmingUp) return [];
    const closeRaw = state.close(SYMBOL);
    if (closeRaw === null) return [];
    const close = Number(closeRaw) / 10 ** priceScale;
    closes.push(close);

    const qty = state.positions.get(SYMBOL)?.qty ?? 0n;

    if (qty > 0n) {
      // Long: maintain the trailing stop.
      if (pendingSell) return [];
      peak = Math.max(peak, close);
      if (peak > 0 && ((peak - close) / peak) * 10000 >= TRAIL_STOP_BPS) {
        pendingSell = true;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: consider an entry.
    if (pendingBuy) return [];
    if (state.seq <= cooldownUntilSeq) return [];
    if (closes.length > LOOKBACK_BARS && state.cash >= 1000000n) {
      const past = closes[closes.length - 1 - LOOKBACK_BARS];
      if (((close - past) / past) * 10000 >= ENTRY_RETURN_BPS) {
        pendingBuy = true;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
