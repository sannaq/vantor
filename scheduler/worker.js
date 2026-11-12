// vantor 정시 신호 워커 (2026-11-13 사용자 결정: 깃허브 예약 지연 → Cloudflare 정시 신호)
// 매분 깨어나서 아래 표에 맞는 시각이면 깃허브 작업을 workflow_dispatch 로 실행시킨다.
// 깃허브 예약(schedule)은 백업으로 그대로 둔다 — 각 작업은 이미 중복 실행을 스스로 건너뛴다
// (picks·picks-us = automation_schedule.py, us/kr 브리핑 = --check, 이벤트 = events-sent.json).
//
// 비밀값 (wrangler secret put):
//   GH_TOKEN      — sannaq/vantor 만 고른 fine-grained 토큰, 권한 Actions: Read and write
//   ALERT_WEBHOOK — (선택) 실행 신호를 못 보냈을 때 알릴 디스코드 웹후크
//
// 시각은 모두 UTC (깃허브 cron 과 같은 기준). 요일 0=일 … 6=토.

const REPO = "sannaq/vantor";

export const TABLE = [
  // 국장 추천 16:40 KST + 재시도
  { wf: "picks.yml", cron: ["40 7 * * 1-5", "17 8-15 * * 1-5"], inputs: { send: "yes", force: "no" } },
  // 미장 추천 07:00 KST + 재시도
  { wf: "picks-us.yml", cron: ["0 22 * * 1-5", "17 23 * * 1-5", "17 0-3 * * 2-6"], inputs: { send: "yes", force: "no" } },
  // 미장 브리핑 — 스크립트가 미국 동부 시각으로 맞는 슬롯만 만든다
  { wf: "us-brief.yml", cron: ["13,43 * * * *"], inputs: { slot: "", send: "yes" } },
  // 국내 브리핑 누락 복구
  { wf: "kr-brief.yml", cron: ["23,53 * * * *"], inputs: { send: "yes" } },
  // 이번주 이벤트 06:00 KST
  { wf: "events.yml", cron: ["0 21 * * *"], inputs: { force: "no" } },
  // 시장 심리·전망 채점 06:20 KST
  { wf: "fear.yml", cron: ["20 21 * * *"] },
  // 수급 — 장중 30분 + 16:00·19:00
  { wf: "flow.yml", cron: ["*/30 0-6 * * 1-5", "0 7,10 * * 1-5"] },
  // 뉴스 30분마다
  { wf: "news.yml", cron: ["10,40 * * * *"] },
  // AI 퀀트 모의계좌
  { wf: "paper.yml", cron: ["11 8,10,23 * * *"] },
  // 주간·월간
  { wf: "levels-study.yml", cron: ["0 0 * * 6"] },
  { wf: "backtest.yml", cron: ["0 0 1 * *"] },
];

function fieldMatch(expr, v, min, max) {
  return expr.split(",").some((part) => {
    let [range, step] = part.split("/");
    step = step ? parseInt(step, 10) : 1;
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) { [lo, hi] = range.split("-").map(Number); }
    else { lo = hi = Number(range); if (part.includes("/")) hi = max; }
    return v >= lo && v <= hi && (v - lo) % step === 0;
  });
}

export function cronMatch(cron, d) {
  const [mi, h, dom, mon, dow] = cron.trim().split(/\s+/);
  return fieldMatch(mi, d.getUTCMinutes(), 0, 59) &&
    fieldMatch(h, d.getUTCHours(), 0, 23) &&
    fieldMatch(dom, d.getUTCDate(), 1, 31) &&
    fieldMatch(mon, d.getUTCMonth() + 1, 1, 12) &&
    fieldMatch(dow, d.getUTCDay(), 0, 6);
}

export function due(d) {
  return TABLE.filter((t) => t.cron.some((c) => cronMatch(c, d)));
}

async function dispatch(env, t) {
  const body = { ref: "main" };
  if (t.inputs) body.inputs = t.inputs;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${t.wf}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "vantor-scheduler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    });
    if (r.status === 204) return { ok: true };
    const text = (await r.text()).slice(0, 200);
    if (r.status < 500 && r.status !== 429) return { ok: false, status: r.status, text };
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    if (i === 2) return { ok: false, status: r.status, text };
  }
}

async function alert(env, msg) {
  if (!env.ALERT_WEBHOOK) return;
  await fetch(env.ALERT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: msg }),
  }).catch(() => {});
}

export default {
  async scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime);
    const list = due(d);
    if (!list.length) return;
    const results = await Promise.all(list.map((t) => dispatch(env, t).then((r) => ({ t, r }))));
    const bad = results.filter((x) => !x.r.ok);
    if (bad.length) {
      const kst = new Date(d.getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
      await alert(env, `🚨 **정시 신호 실패** (${kst} KST)\n` +
        bad.map((x) => `- ${x.t.wf}: HTTP ${x.r.status} ${x.r.text || ""}`).join("\n"));
    }
  },
  // 상태 확인: GET /?at=2026-11-13T07:40:00Z → 그 시각에 실행될 작업 목록 (실행은 안 함)
  async fetch(req) {
    const at = new URL(req.url).searchParams.get("at");
    const d = at ? new Date(at) : new Date();
    return Response.json({ at: d.toISOString(), due: due(d).map((t) => t.wf) });
  },
};
