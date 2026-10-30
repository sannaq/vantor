import { PAPER_POLICY, planEntry } from './paper-policy.mjs';

// Daily-bar PAPER simulation, not exchange execution. Costs are explicit
// conservative assumptions including fees/taxes/slippage, not broker quotes.
export function newAccount(market) {
  const capital = market === 'KR' ? 100000000 : 100000;
  return { version: 1, mode: 'paper', market, currency: market === 'KR' ? 'KRW' : 'USD',
    initialCapital: capital, cash: capital, equity: capital, peakEquity: capital,
    paused: false, positions: [], pending: [], trades: [], history: [], lastDate: null,
    costRate: market === 'KR' ? .0025 : .0015 };
}

export function validBar(b) {
  return Array.isArray(b) && /^\d{8}$/.test(b[0]) && b.slice(1, 6).every(Number.isFinite) &&
    b.slice(1, 5).every(n => n > 0) && b[5] > 0 &&
    b[2] >= Math.max(b[1], b[4]) && b[3] <= Math.min(b[1], b[4]) && b[2] >= b[3];
}

export function mark(account) {
  account.equity = account.cash + account.positions.reduce((s, p) => s + p.quantity * p.lastPrice, 0);
  account.peakEquity = Math.max(account.peakEquity, account.equity);
  if (account.equity <= account.peakEquity * .85) account.paused = true;
}

// Call only for a complete trading session. A missing bar aborts the whole
// transition, preserving the last coherent portfolio for a later retry.
export function advanceDay(original, date, bars) {
  if (original.lastDate && date <= original.lastDate) return structuredClone(original);
  for (const p of [...original.positions, ...original.pending]) {
    if (!validBar(bars[p.symbol]) || bars[p.symbol][0] !== date) throw new Error('price_data_missing');
  }
  const a = structuredClone(original), fee = a.costRate;
  const sell = (p, quantity, price, reason) => {
    const proceeds = quantity * price * (1 - fee);
    a.cash += proceeds; p.quantity -= quantity;
    a.trades.push({ date, symbol: p.symbol, name: p.name, side: 'sell', quantity,
      price, cost: quantity * price * fee, reason, pnl: proceeds - quantity * p.costBasis });
  };
  // Accepted orders are valid for the next observed exchange session only.
  const pending = a.pending; a.pending = [];
  for (const p of pending) {
    if (p.signalDate >= date) { a.pending.push(p); continue; }
    const [, open, , low] = bars[p.symbol];
    const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`;
    const refMs = Date.parse(iso + 'T14:30:00Z');
    const nyHour = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(refMs);
    const openMs = a.market === 'KR' ? Date.parse(iso + 'T09:00:00+09:00') : refMs - (nyHour - 9) * 3600000;
    if (a.paused || Date.parse(p.reviewCreatedAt) >= openMs ||
        Date.parse(p.reviewExpiresAt) <= openMs || open <= p.stop || low > p.entry) continue;
    const price = Math.min(open, p.entry), debit = p.quantity * price * (1 + fee);
    if (debit > a.cash || a.positions.some(x => x.symbol === p.symbol)) continue;
    a.cash -= debit;
    a.positions.push({ ...p, entryDate: date, heldDays: 0, costBasis: price * (1 + fee),
      lastPrice: price, firstTargetDone: false });
    a.trades.push({ date, symbol: p.symbol, name: p.name, side: 'buy', quantity: p.quantity,
      price, cost: p.quantity * price * fee, reason: 'reviewed_limit_entry' });
  }
  for (const p of a.positions) {
    const [, open, high, low, close] = bars[p.symbol]; p.heldDays++; p.lastPrice = close;
    // Stops win ambiguous same-bar collisions. Gaps are filled at the open,
    // so realized losses may exceed the planned 1% risk budget.
    if (low <= p.stop) sell(p, p.quantity, Math.min(open, p.stop), 'stop');
    else if (p.entryDate === date) continue; // unknown intraday path: never book entry-day target profits
    else if (p.target && high >= p.target) sell(p, p.quantity, p.target, 'target');
    else if (p.target1 && !p.firstTargetDone && high >= p.target1 && p.quantity > 1) {
      sell(p, Math.floor(p.quantity / 2), p.target1, 'first_target'); p.firstTargetDone = true;
      // Breakeven change takes effect from the following session.
      if (p.breakeven) p.stop = Math.max(p.stop, p.entry);
    }
    if (p.quantity > 0 && p.heldDays >= PAPER_POLICY.maxHoldingTradingDays) sell(p, p.quantity, close, 'max_holding');
  }
  a.positions = a.positions.filter(p => p.quantity > 0);
  mark(a); a.lastDate = date;
  a.history.push({ date, equity: a.equity, cash: a.cash, drawdown: 1 - a.equity / a.peakEquity });
  return a;
}

export function queueCandidate(a, candidate, review, evidence, snapshotId, now) {
  if (a.pending.some(p => p.symbol === candidate.c)) return { status: 'wait', reason: 'already_pending' };
  const lv = candidate.lv || {}, reserved = a.pending.reduce((s, p) => s + p.reserved, 0);
  const available = { ...a, cash: Math.max(0, a.cash - reserved) };
  const plan = planEntry({ account: available,
    candidate: { market: a.market, symbol: candidate.c, qualified: candidate.qualified },
    quote: { entry: lv.b1, stop: lv.st, buyCostPerShare: lv.b1 * a.costRate,
      sellCostPerShare: lv.st * a.costRate }, review, evidence, snapshotId, now });
  if (plan.status === 'ready') a.pending.push({ symbol: candidate.c, name: candidate.n,
    rc: candidate.rc, quantity: plan.quantity, entry: plan.entry, stop: plan.stop,
    target: lv.tg > lv.b1 ? lv.tg : null, target1: lv.tg1 > lv.b1 ? lv.tg1 : null,
    breakeven: /\|be$/.test(lv.rule || ''), reserved: plan.plannedCost,
    signalDate: candidate.date, reviewCreatedAt: review.createdAt,
    reviewExpiresAt: review.expiresAt, snapshotId, reviewId: review.id });
  return plan;
}
