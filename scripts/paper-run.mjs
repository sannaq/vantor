// Cloud batch runner. This has no brokerage integration or real-money orders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newAccount, queueCandidate } from './paper-engine.mjs';
import { reviewCandidate, GEMINI_MODEL } from './gemini-review.mjs';
import { candles, collectEvidence, collectFilingResult } from './paper-data.mjs';

import {newTrainer, advanceTrainer, recordTrainerReview, candidateFor, trainerUniverse} from './paper-trainer.mjs';
import { advancePortfolio, evidenceCoverage } from './paper-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const persist = (file, state) => {
  const dest = path.join(root, file), tmp = dest + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, dest);
};
const key = process.env.GEMINI_API_KEY;
const freeConfirmed = process.env.GEMINI_FREE_TIER_CONFIRMED === 'true';
// 시장별 하루 AI 검토 횟수. 3 → 10 (2026-11-04 사용자 결정, 두 시장 합계 20회 · 무료 한도 안).
// 429 가 오면 그날 검토는 바로 멈춘다(quota_wait).
const DAILY_REVIEW_LIMIT = 10;
const EARN_WINDOW_DAYS = 10; // 추천일부터 이 기간 안에 실적 발표가 있으면 절반 비중
const ymdMs = d => Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const messages = {
  waiting_key: 'Gemini 무료 API 키 등록 대기',
  waiting_free_tier_confirmation: '결제가 연결되지 않은 무료 프로젝트인지 확인 필요',
  price_data_missing: '가격 자료 확인 대기 · 이전 계좌 상태 보존',
  feed_stale: '최신 장마감 추천 자료 대기',
  quota_wait: '무료 호출 한도 도달 · 신규 검토와 매수 대기',
  daily_review_limit: '오늘 검토 한도 완료 · 다음 실행 대기',
  waiting_evidence: '공시 원문·기사 본문 확보 대기',
  waiting_sec_contact: '미국 공시 수집 연락 이메일 등록 대기',
  sec_access_denied: 'SEC 공시 서버 접근 거부 · 신규 모의매수 대기',
  sec_rate_limited: 'SEC 요청 제한 · 신규 모의매수 대기',
  drawdown_pause: '계좌 하락 한도 도달 · 신규 매수 중단, 보유 종목 관리 계속',
  ready: '장마감 모의운용 · 다음 거래일 주문 준비',
};
for (const market of ['KR', 'US']) {
  const suffix = market === 'US' ? '-us' : '', file = `feeds/paper-${market.toLowerCase()}.json`;
  let state;
  try { state = read(file); } catch (error) {
    if (error.code !== 'ENOENT') throw error; // never reset a damaged account to fresh capital
    state = { account: newAccount(market), reviews: [], attempts: {} };
  }
  delete state.filingStatus;
  state.filingCoverage = { checked: 0, verified: 0, officialIr: 0, held: 0 };
  state.model = GEMINI_MODEL; state.updatedAt = new Date().toISOString();
  state.mode = 'paper'; state.execution = 'daily-bars';
  state.notice = '가상 자금 · 장마감 일봉 모의체결 · 수수료·세금·체결차이 합산 가정: 매수/매도 각각 ' + (state.account.costRate * 100) + '% · 실제 체결과 다름';
  const priceCache = new Map();
  const prices = (m,c) => {const k=m+':'+c;if(!priceCache.has(k))priceCache.set(k,candles(m,c));return priceCache.get(k);};
  let trainerReady=false;
  try {
    const advanced = await advancePortfolio(state.account, market, prices);
    state.account = advanced.account;
    state.valuationDate = advanced.latestDate;
    try {
      if(!state.trainer)state.trainer=newTrainer(market,advanced.latestDate);
      state.trainer=await advanceTrainer(state.trainer,market,prices);
      trainerReady=true;
    }catch(error){
      state.trainerStatus=error.message==='trainer_invalid'?'trainer_invalid':'price_data_missing';
    }
    if(trainerReady)delete state.trainerStatus;
    let picks, scores, news;
    try {
      picks = read(`feeds/stock-picks${suffix}.json`); scores = read(`feeds/stock-scores${suffix}.json`);
      news = read(`feeds/stock-news${suffix}.json`);
    } catch { throw Error('feed_stale'); }
    state.sourceDate = picks.date;
    if (!state.account.lastDate) state.account.lastDate = advanced.latestDate;
    state.status = !key ? 'waiting_key' : !freeConfirmed ? 'waiting_free_tier_confirmation' : 'ready';
    if (state.status === 'ready') {
      if (advanced.latestDate !== picks.date || scores.date !== picks.date || news.date !== picks.date ||
          Date.now() - Date.parse(`${picks.date.slice(0,4)}-${picks.date.slice(4,6)}-${picks.date.slice(6)}T00:00:00Z`) > 7 * 864e5) {
        state.status = 'feed_stale';
      } else {
        const day = new Date().toISOString().slice(0,10), used = state.attempts[day] || 0;
        let calls = used;
        const candidates=(picks.top||[]).map(row=>candidateFor(row,market,scores,picks.date));
        let earn={}; try { earn=read(`feeds/earn${suffix}.json`).items||{}; } catch {}
        for (const c of candidates) {
          const d = Array.isArray(earn[c.c]) ? String(earn[c.c][0]||'') : '';
          if (/^\d{8}$/.test(d) && d >= picks.date && ymdMs(d) - ymdMs(picks.date) <= EARN_WINDOW_DAYS * 864e5) c.earnSoon = d;
        }
        const universe=trainerUniverse(candidates);
        const record=(report,candidate,result) => {
          // 같은 날 다시 본 자료 대기 기록은 하나만 남긴다
          state.reviews=state.reviews.filter(r=>!(r.status==='waiting_evidence'&&r.symbol===report.symbol&&
            r.sourceDate===report.sourceDate&&r.checkedDate===report.checkedDate));
          state.reviews.push(report);
          if(trainerReady) {
            try {recordTrainerReview(state.trainer,candidate,universe,report,result);}
            catch {trainerReady=false;state.trainerStatus='trainer_invalid';}
          }
        };
        for (const row of picks.top || []) {
          if (state.account.paused) break;
          if (state.reviews.some(r => r.sourceDate === picks.date && r.symbol === row.c &&
                (['review_pass','risk_hold'].includes(r.status) ||
                 // 자료 대기는 같은 날 다시 본다 — 회사 맥 SEC 캐시가 뒤늦게 올라올 수 있다 (AI 호출 없음)
                 (r.checkedDate === day && r.status !== 'waiting_evidence'))) ||
              [...state.account.positions, ...state.account.pending].some(p => p.symbol === row.c)) continue;
          if (calls >= DAILY_REVIEW_LIMIT) { state.status = 'daily_review_limit'; break; }
          const candidate = candidates.find(c=>c.c===row.c);
          if (!candidate.qualified || !candidate.rc) continue;
          const filingResult = await collectFilingResult(market, candidate);
          state.filingCoverage.checked++;
          if (!filingResult.documents.length) {
            state.filingCoverage.held++;
            state.filingStatus = filingResult.reason;
            record({ symbol: row.c, name: row.n, sourceDate: picks.date, checkedDate: day,
              status: 'waiting_evidence', evidenceReason: filingResult.reason, secReason: filingResult.secReason },candidate);
            continue; // one unsupported issuer must not block later verified IR candidates
          }
          state.filingCoverage.verified++;
          if (filingResult.provider === 'official_ir') state.filingCoverage.officialIr++;
          const articles = await collectEvidence(market, candidate, news.items[row.c] || []).catch(() => []);
          const documents = [...articles, ...filingResult.documents];
          if (!documents.some(d => d.type === 'filing') || !documents.some(d => d.type === 'news')) {
            record({ symbol: row.c, name: row.n, sourceDate: picks.date, checkedDate: day, status: 'waiting_evidence', evidenceReason: 'news_missing' },candidate); continue;
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
            if (plan.sizeReason) { report.sizeReason = plan.sizeReason; report.earnDate = plan.earnDate; }
          }
          record(report,candidate,result); persist(file, state);
          if (result.status === 'quota_wait' || result.status === 'api_error') { state.status = result.status; break; }
          await new Promise(resolve => setTimeout(resolve, 13000));
        }
        if (state.status === 'ready' && state.filingCoverage.held && !state.filingCoverage.verified) state.status = 'waiting_evidence';
      }
    }
  } catch (error) {
    state.status = error.message === 'feed_stale' ? 'feed_stale' : 'price_data_missing';
  }
  state.filingCoverage = evidenceCoverage(state.reviews, state.sourceDate);
  if (state.status === 'ready' && state.filingCoverage.held) state.status = 'waiting_evidence';
  if (state.account.paused) state.status = 'drawdown_pause';
  state.message = messages[state.status] || 'AI 검토 오류 · 신규 매수 대기';
  if (market === 'US' && state.filingCoverage.checked) {
    const c = state.filingCoverage;
    state.message += ` · 추천 기준일 검토 공시 확인 ${c.verified}/${c.checked}종목(공식 IR ${c.officialIr}), 자료 미확보 ${c.held}종목 보류`;
  }
  persist(file, state);
  console.log(`${market}: ${state.status}, positions=${state.account.positions.length}, pending=${state.account.pending.length}`);
}
