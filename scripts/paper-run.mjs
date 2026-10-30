// Cloud batch runner. This has no brokerage integration or real-money orders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newAccount, advanceDay, queueCandidate } from './paper-engine.mjs';
import { reviewCandidate, GEMINI_MODEL } from './gemini-review.mjs';
import { candles, collectEvidence, collectFilings } from './paper-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const persist = (file, state) => {
  const dest = path.join(root, file), tmp = dest + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, dest);
};
const key = process.env.GEMINI_API_KEY;
const freeConfirmed = process.env.GEMINI_FREE_TIER_CONFIRMED === 'true';
const messages = {
  waiting_key: 'Gemini 무료 API 키 등록 대기',
  waiting_free_tier_confirmation: '결제가 연결되지 않은 무료 프로젝트인지 확인 필요',
  price_data_missing: '가격 자료 확인 대기 · 이전 계좌 상태 보존',
  feed_stale: '최신 장마감 추천 자료 대기',
  quota_wait: '무료 호출 한도 도달 · 신규 검토와 매수 대기',
  daily_review_limit: '오늘 검토 한도 완료 · 다음 실행 대기',
  waiting_evidence: '기사 본문 확보 대기',
  ready: '장마감 모의운용 · 다음 거래일 주문 준비',
};
for (const market of ['KR', 'US']) {
  const suffix = market === 'US' ? '-us' : '', file = `feeds/paper-${market.toLowerCase()}.json`;
  let state;
  try { state = read(file); } catch { state = { account: newAccount(market), reviews: [], attempts: {} }; }
  state.model = GEMINI_MODEL; state.updatedAt = new Date().toISOString();
  state.mode = 'paper'; state.execution = 'daily-bars';
  state.notice = '가상 자금 · 장마감 일봉 모의체결 · 수수료·세금·체결차이 합산 가정: 매수/매도 각각 ' + (state.account.costRate * 100) + '% · 실제 체결과 다름';
  try {
    const picks = read(`feeds/stock-picks${suffix}.json`), scores = read(`feeds/stock-scores${suffix}.json`);
    const news = read(`feeds/stock-news${suffix}.json`);
    state.sourceDate = picks.date;
    const a = state.account;
    // No key does not stop managing existing paper holdings.
    if (a.positions.length || a.pending.length) {
      const needed = [...new Map([...a.positions, ...a.pending].map(p => [p.symbol, p])).values()];
      const histories = new Map();
      for (const p of needed) histories.set(p.symbol, await candles(market, market === 'US' ? p.rc : p.symbol));
      const ref = await candles(market, market === 'US' ? 'AAPL.O' : '005930');
      const days = ref.filter(b => b[0] > (a.lastDate || picks.date) && b[0] <= picks.date).map(b => b[0]);
      for (const date of days) {
        const bars = Object.fromEntries([...histories].map(([symbol, rows]) => [symbol, rows.find(b => b[0] === date)]));
        state.account = advanceDay(state.account, date, bars);
      }
    }
    if (!state.account.lastDate) state.account.lastDate = picks.date;
    state.status = !key ? 'waiting_key' : !freeConfirmed ? 'waiting_free_tier_confirmation' : 'ready';
    if (state.status === 'ready') {
      const ref = await candles(market, market === 'US' ? 'AAPL.O' : '005930');
      if (ref.at(-1)?.[0] !== picks.date || scores.date !== picks.date || news.date !== picks.date ||
          Date.now() - Date.parse(`${picks.date.slice(0,4)}-${picks.date.slice(4,6)}-${picks.date.slice(6)}T00:00:00Z`) > 7 * 864e5) {
        state.status = 'feed_stale';
      } else {
        const day = new Date().toISOString().slice(0,10), used = state.attempts[day] || 0;
        let calls = used;
        for (const row of picks.top || []) {
          if (state.account.paused) break;
          if (state.reviews.some(r => r.sourceDate === picks.date && r.symbol === row.c &&
                (['review_pass','risk_hold'].includes(r.status) || r.checkedDate === day)) ||
              [...state.account.positions, ...state.account.pending].some(p => p.symbol === row.c)) continue;
          if (calls >= 3) { state.status = 'daily_review_limit'; break; }
          const candidate = { ...row, date: picks.date,
            rc: market === 'US' ? scores.items[row.c]?.[14] : row.c,
            qualified: row.view === '추천' && Number.isFinite(row.per) && row.per > 0 &&
              row.tv20 >= (market === 'US' ? .1 : 50) && (market === 'US' || !(row.ref || []).includes('하락 추세')) };
          if (!candidate.qualified || !candidate.rc) continue;
          const documents = [...await collectEvidence(market, candidate, news.items[row.c] || []),
            ...await collectFilings(market, candidate)];
          if (!documents.some(d => d.type === 'filing') || !documents.some(d => d.type === 'news')) {
            state.reviews.push({ symbol: row.c, name: row.n, sourceDate: picks.date, checkedDate: day, status: 'waiting_evidence' }); continue;
          }
          // Persist attempt before request. No retry storm or paid-model fallback.
          state.attempts[day] = ++calls; persist(file, state);
          const result = await reviewCandidate({ market, candidate, documents, apiKey: key, freeTierConfirmed: freeConfirmed });
          const report = { symbol: row.c, name: row.n, sourceDate: picks.date, checkedDate: day, status: result.status };
          if (result.review) {
            report.review = result.review;
            report.sources = result.evidence.map(({ text, ...meta }) => meta); // never publish article bodies
            const plan = queueCandidate(state.account, candidate, result.review, result.evidence, result.snapshotId, Date.now());
            report.entryStatus = plan.status; report.entryReason = plan.reason || null;
          }
          state.reviews.push(report); persist(file, state);
          if (result.status === 'quota_wait' || result.status === 'api_error') { state.status = result.status; break; }
          await new Promise(resolve => setTimeout(resolve, 13000));
        }
      }
    }
  } catch {
    state.status = 'price_data_missing';
  }
  state.message = messages[state.status] || 'AI 검토 오류 · 신규 매수 대기';
  persist(file, state);
  console.log(`${market}: ${state.status}, positions=${state.account.positions.length}, pending=${state.account.pending.length}`);
}
