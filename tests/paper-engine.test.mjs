import test from 'node:test';
import assert from 'node:assert/strict';
import { newAccount, advanceDay } from '../scripts/paper-engine.mjs';
import { reviewCandidate } from '../scripts/gemini-review.mjs';
const position = () => ({ symbol: 'TEST', name: 'Fixture', quantity: 10, entry: 100,
  stop: 90, target: 120, target1: 110, costBasis: 100, lastPrice: 100,
  heldDays: 1, entryDate: '20261028' });
test('gap through stop includes the full loss, including when account paused', () => {
  const a = newAccount('KR'); a.positions = [position()]; a.cash -= 1000; a.paused = true;
  const b = advanceDay(a, '20261030', { TEST: ['20261030', 70, 125, 60, 100, 1000] });
  assert.equal(b.positions.length, 0); assert.equal(b.trades[0].price, 70);
  assert.equal(b.trades[0].reason, 'stop'); assert(b.trades[0].pnl < -300);
  assert.equal(a.positions.length, 1);
});
test('missing bars preserve state; duplicate day cannot repeat trades', () => {
  const a = newAccount('KR'); a.positions = [position()];
  assert.throws(() => advanceDay(a, '20261030', {}), /price_data_missing/);
  const bars = { TEST: ['20261030', 100, 130, 95, 120, 1000] };
  const b = advanceDay(a, '20261030', bars);
  assert.equal(b.trades.length, 1);
  assert.deepEqual(advanceDay(b, '20261030', bars), b);
});
test('60-session exit and first target with remaining shares', () => {
  const a = newAccount('US'); a.positions = [{ ...position(), heldDays: 59 }];
  const b = advanceDay(a, '20261030', { TEST: ['20261030', 100, 105, 95, 101, 1000] });
  assert.equal(b.trades[0].reason, 'max_holding');
  a.positions[0].heldDays = 1;
  const c = advanceDay(a, '20261030', { TEST: ['20261030', 100, 115, 95, 111, 1000] });
  assert.equal(c.positions[0].quantity, 5); assert.equal(c.trades[0].reason, 'first_target');
  a.positions[0].heldDays = 59;
  const d = advanceDay(a, '20261030', { TEST: ['20261030', 100, 115, 95, 111, 1000] });
  assert.equal(d.positions.length, 0); assert.equal(d.trades.at(-1).reason, 'max_holding');
});
test('new limit entry cannot count earlier same-day high as a profit', () => {
  const a = newAccount('US'); a.lastDate = '20261029';
  a.pending = [{ ...position(), signalDate: '20261029',
    reviewCreatedAt: '2026-10-30T12:00:00Z', reviewExpiresAt: '2026-11-01T12:00:00Z' }];
  const b = advanceDay(a, '20261030', { TEST: ['20261030', 105, 150, 95, 100, 1000] });
  assert.equal(b.trades.length, 1); assert.equal(b.trades[0].side, 'buy');
  // NY is on DST: a review after 13:30 UTC is too late for this session.
  a.pending[0].reviewCreatedAt = '2026-10-30T14:00:00Z';
  assert.equal(advanceDay(a, '20261030', { TEST: ['20261030', 105, 150, 95, 100, 1000] }).trades.length, 0);
});
const params = () => ({ market: 'KR', candidate: { c: 'TEST', n: 'Fixture', date: '20261030',
  total: 80, per: 10, tv20: 100, accountSecret: 'NEVER_SEND' }, apiKey: 'fake-test-key',
  freeTierConfirmed: true, now: () => Date.parse('2026-10-30T09:00:00Z'),
  documents: [{ id: 'source1', type: 'news', title: 'Fixture', text: 'Synthetic public evidence.',
    url: 'https://example.com/fixture', verified: true,
    publishedAt: '2026-10-30T07:00:00Z', fetchedAt: '2026-10-30T08:00:00Z' }] });
test('key or free-project confirmation missing means zero network calls', async () => {
  const p = params(); p.fetcher = () => { throw Error('must not call'); };
  p.apiKey = ''; assert.equal((await reviewCandidate(p)).status, 'waiting_key');
  p.apiKey = 'test'; p.freeTierConfirmed = false;
  assert.equal((await reviewCandidate(p)).status, 'waiting_free_tier_confirmation');
});
test('quota or errors never retry or fall back to a paid model', async () => {
  let calls = 0; const p = params();
  p.fetcher = async () => { calls++; return { ok: false, status: 429 }; };
  assert.equal((await reviewCandidate(p)).status, 'quota_wait'); assert.equal(calls, 1);
});
test('model output must cite supplied evidence, private fields never sent', async () => {
  const p = params(); let sourceIds = ['source1'];
  p.fetcher = async (url, opts) => {
    assert(!url.includes(p.apiKey)); assert(!opts.body.includes('NEVER_SEND'));
    const body = JSON.parse(opts.body); assert.equal(body.tools, undefined);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify({ decision: 'pass', reason: '테스트 근거', company: '시험 회사', sourceIds }) }] } }] }) };
  };
  assert.equal((await reviewCandidate(p)).status, 'review_pass');
  sourceIds = ['fabricated']; assert.equal((await reviewCandidate(p)).status, 'review_invalid');
});
