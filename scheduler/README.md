# vantor 정시 신호 (Cloudflare Worker)

깃허브 예약 실행은 몇 시간씩 밀린다(국장 추천 16:40 → 실제 00:37~03:52, 2026-11).
이 워커가 매분 깨어나 `worker.js` 의 TABLE 시각에 맞춰 깃허브 작업을 실행시킨다.
깃허브 예약은 백업으로 남겨 둔다(작업마다 중복 실행은 스스로 건너뜀).

## 설치 (한 번)
1. 깃허브 sannaq 계정 → Settings → Developer settings → Fine-grained tokens → 새 토큰
   - Repository access: Only select → `sannaq/vantor`
   - Permissions: Actions → **Read and write** (다른 권한 없음)
2. `cd scheduler && npx wrangler deploy`
3. `npx wrangler secret put GH_TOKEN` (1의 토큰)
4. (선택) `npx wrangler secret put ALERT_WEBHOOK` — 신호 실패 알림용 디스코드 웹후크

## 확인
- `node test.mjs` — 시각표 검사
- `curl https://vantor-scheduler.<계정>.workers.dev/?at=2026-11-13T07:40:00Z` — 그 시각에 실행될 작업
