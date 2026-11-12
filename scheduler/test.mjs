import { due } from "./worker.js";
const cases = {
  "2026-11-13T07:40:00Z": ["picks.yml","news.yml"],          // 금 16:40 KST
  "2026-11-14T07:40:00Z": ["news.yml"],                      // 토 → 국장 추천 없음
  "2026-11-12T22:00:00Z": ["picks-us.yml"],        // 목 22:00 UTC = 금 07:00 KST
  "2026-11-13T00:30:00Z": ["flow.yml"],            // 금 09:30 KST
  "2026-11-13T00:17:00Z": ["picks-us.yml"],        // 재시도
  "2026-11-12T21:00:00Z": ["events.yml"],
  "2026-11-13T08:11:00Z": ["paper.yml"],
  "2026-11-13T10:00:00Z": ["flow.yml"],
  "2026-12-01T00:00:00Z": ["flow.yml","backtest.yml"],
  "2026-11-13T05:13:00Z": ["us-brief.yml"],
};
let fail = 0;
for (const [at, want] of Object.entries(cases)) {
  const got = due(new Date(at)).map((t) => t.wf).sort();
  const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
  if (!ok) fail++;
  console.log(ok ? "OK " : "XX ", at, got.join(","));
}
process.exit(fail ? 1 : 0);
