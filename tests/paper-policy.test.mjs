import test from 'node:test';
import assert from 'node:assert/strict';
import { planEntry, PAPER_POLICY } from '../scripts/paper-policy.mjs';

function fixture(market = 'KR') {
  return {
    account: { market, currency: market === 'KR' ? 'KRW' : 'USD', equity: 100000,
      peakEquity: 100000, cash: 100000, positions: [], paused: false },
    candidate: { market, symbol: 'TEST', qualified: true },
    quote: { entry: 100, stop: 90, buyCostPerShare: 0.1, sellCostPerShare: 0.1 },
    snapshotId: 'test-snapshot', now: Date.parse('2026-10-30T10:00:00Z'),
    review: { id: 'test-review', market, symbol: 'TEST', snapshotId: 'test-snapshot',
      createdAt: '2026-10-30T09:00:00Z', expiresAt: '2026-10-31T09:00:00Z',
      decision: 'pass', reason: 'Synthetic test evidence reviewed.', sourceIds: ['s1'] },
    evidence: [{ id: 's1', market, symbol: 'TEST', snapshotId: 'test-snapshot',
      verified: true, type: 'filing', text: 'Synthetic fixture; not a real filing.',
      publishedAt: '2026-10-30T08:00:00Z', fetchedAt: '2026-10-30T08:30:00Z',
      url: 'https://example.com/test-filing' }],
  };
}

for (const market of ['KR', 'US']) {
  test(`${market}: fees included, planned loss <= 1%, position <= 15%`, () => {
    const x = fixture(market), p = planEntry(x);
    assert.equal(p.status, 'ready'); assert.equal(p.quantity, 98);
    assert(p.plannedLoss <= x.account.equity * .01);
    assert(p.plannedCost <= x.account.equity * .15);
    x.quote.stop = 99;
    const tight = planEntry(x); assert.equal(tight.quantity, 149);
    assert(tight.plannedCost <= 15000);
  });
}
test('15% drawdown latches pause even if prices subsequently recover', () => {
  const x = fixture(); x.account.equity = 85000; x.account.cash = 85000;
  assert.equal(planEntry(x).latchPause, true);
  x.account.equity = 99000; x.account.paused = true;
  assert.equal(planEntry(x).reason, 'drawdown_pause');
});
test('missing, failed, stale, future and wrong-stock reviews cannot buy', () => {
  for (const mutate of [x => x.review = null, x => x.review.decision = 'error',
    x => x.review.expiresAt = '2026-10-29T10:00:00Z',
    x => x.review.createdAt = '2026-11-01T10:00:00Z',
    x => x.review.symbol = 'OTHER', x => x.review.snapshotId = 'old']) {
    const x = fixture(); mutate(x); assert.equal(planEntry(x).status, 'wait');
  }
});
test('AI holds and invented citations cannot become passes', () => {
  const x = fixture(); x.review.decision = 'hold';
  assert.equal(planEntry(x).reason, 'ai_risk_hold');
  x.review.decision = 'pass'; x.review.sourceIds = ['invented'];
  assert.equal(planEntry(x).reason, 'evidence_unverified');
});
test('headline-only, unverified and future evidence cannot approve buying', () => {
  for (const mutate of [s => s.text = '', s => s.verified = false,
    s => s.publishedAt = '2027-01-01T00:00:00Z', s => s.symbol = 'OTHER']) {
    const x = fixture(); mutate(x.evidence[0]); assert.equal(planEntry(x).status, 'wait');
  }
});
test('cash, duplicates, currency, eligibility and invalid numbers fail closed', () => {
  for (const mutate of [x => x.account.cash = 1, x => x.account.equity = NaN,
    x => x.account.positions = [{ symbol: 'TEST' }], x => x.account.currency = 'USD',
    x => x.candidate.qualified = false, x => x.quote.stop = 110,
    x => x.quote.buyCostPerShare = undefined]) {
    const x = fixture(); mutate(x); assert.equal(planEntry(x).status, 'wait');
  }
});
test('AI cannot change immutable accepted risk limits', () => {
  const x = fixture(); x.review.maxPositionFraction = 1; x.review.maxPlannedLossFraction = 1;
  assert.equal(planEntry(x).quantity, 98);
  assert.throws(() => { PAPER_POLICY.maxPositionFraction = 1; });
});
