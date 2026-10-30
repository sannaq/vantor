// Shared policy for the proposed KR/US paper portfolios. No broker or AI calls.
// Entry planning only: protective exits must remain independent of this gate.
export const PAPER_POLICY = Object.freeze({
  version: 1,
  mode: 'paper',
  markets: Object.freeze(['KR', 'US']),
  universe: 'liquid-financial-data-qualified',
  reviewAfterTradingDays: 20,
  maxHoldingTradingDays: 60,
  maxPositionFraction: 0.15,
  maxPlannedLossFraction: 0.01,
  pauseDrawdownFraction: 0.15,
  aiReviewRequired: true,
});

const positive = n => Number.isFinite(n) && n > 0;
const nonnegative = n => Number.isFinite(n) && n >= 0;
const wait = reason => ({ status: 'wait', reason, quantity: 0, mode: 'paper' });

// `evidence` and `snapshotId` come from the trusted data collector, never from
// model-created URLs. The adapter must verify document identity, dates and body.
// A successful review means only that this evidence passed the configured check.
export function reviewGate({ review, evidence, market, symbol, snapshotId, now }) {
  if (!Number.isFinite(now) || !snapshotId || !symbol) return 'invalid_context';
  if (!review || review.market !== market || review.symbol !== symbol ||
      review.snapshotId !== snapshotId) return 'review_missing_or_mismatched';
  const created = Date.parse(review.createdAt), expires = Date.parse(review.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) ||
      created > now || expires <= now || expires <= created) return 'review_expired_or_invalid';
  if (!['pass', 'hold'].includes(review.decision) ||
      typeof review.reason !== 'string' || !review.reason.trim()) return 'review_invalid';
  if (review.decision === 'hold') return 'ai_risk_hold';
  if (!Array.isArray(review.sourceIds) || !review.sourceIds.length ||
      !Array.isArray(evidence)) return 'evidence_missing';
  const sources = new Map(evidence.map(s => [s.id, s]));
  for (const id of review.sourceIds) {
    const s = sources.get(id);
    if (!s || s.market !== market || s.symbol !== symbol ||
        s.snapshotId !== snapshotId || s.verified !== true ||
        !['news', 'filing'].includes(s.type) ||
        typeof s.text !== 'string' || !s.text.trim()) return 'evidence_unverified';
    const published = Date.parse(s.publishedAt), fetched = Date.parse(s.fetchedAt);
    if (!Number.isFinite(published) || !Number.isFinite(fetched) ||
        published > created || fetched > created || fetched < published) return 'evidence_date_invalid';
    try {
      if (new URL(s.url).protocol !== 'https:') return 'evidence_url_invalid';
    } catch { return 'evidence_url_invalid'; }
  }
  return null;
}

// Allocate a NEW whole position, before splitting it into any entry tranches.
// quote.buyCostPerShare / sellCostPerShare include conservative fee+slippage
// assumptions supplied by the execution simulator. Zero must be explicit.
// Planned loss is not a guaranteed loss ceiling: gaps can fill below the stop.
export function planEntry({ account, candidate, quote, review, evidence, snapshotId, now }) {
  if (!account || !candidate || !quote) return wait('input_missing');
  const { market, symbol } = candidate;
  if (!PAPER_POLICY.markets.includes(market) || account.market !== market ||
      account.currency !== (market === 'KR' ? 'KRW' : 'USD')) return wait('market_or_currency_mismatch');
  if (!positive(account.equity) || !positive(account.peakEquity) ||
      account.peakEquity < account.equity || !nonnegative(account.cash) ||
      account.cash > account.equity || !Array.isArray(account.positions)) return wait('account_invalid');
  if (account.paused === true ||
      account.equity <= account.peakEquity * (1 - PAPER_POLICY.pauseDrawdownFraction)) {
    return { ...wait('drawdown_pause'), latchPause: true };
  }
  if (account.positions.some(p => p.symbol === symbol)) return wait('position_already_allocated');
  if (candidate.qualified !== true) return wait('quant_conditions_not_met');
  const aiBlock = reviewGate({ review, evidence, market, symbol, snapshotId, now });
  if (aiBlock) return wait(aiBlock);
  const { entry, stop, buyCostPerShare, sellCostPerShare } = quote;
  if (!positive(entry) || !positive(stop) || stop >= entry ||
      !nonnegative(buyCostPerShare) || !nonnegative(sellCostPerShare)) return wait('quote_or_costs_invalid');
  const cashPerShare = entry + buyCostPerShare;
  const lossPerShare = entry - stop + buyCostPerShare + sellCostPerShare;
  const positionBudget = account.equity * PAPER_POLICY.maxPositionFraction;
  const lossBudget = account.equity * PAPER_POLICY.maxPlannedLossFraction;
  const quantity = Math.floor(Math.min(account.cash / cashPerShare,
    positionBudget / cashPerShare, lossBudget / lossPerShare));
  if (!Number.isSafeInteger(quantity) || quantity < 1) return wait('budget_below_one_share');
  return { status: 'ready', mode: 'paper', policyVersion: PAPER_POLICY.version,
    market, symbol, quantity, entry, stop, plannedCost: quantity * cashPerShare,
    plannedLoss: quantity * lossPerShare, positionBudget, lossBudget,
    snapshotId, reviewId: review.id || null };
}
