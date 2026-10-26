(() => {
  const P5 = window.P5 || [], P6 = window.P6 || [], P7 = window.P7 || [];
  const DAILY = window.DAILY || [], SENT = window.SENT || [], BASIC = (window.BASIC || []).sort((a, b) => a.no - b.no);
  // 초보자반 문제에 id 를 붙여 오답노트·기록과 연결
  const BQ = [];
  BASIC.forEach(l => l.quiz.forEach((q, i) => { q.id = `b${l.no}-${i}`; q.topic = `${l.no}강`; q.level = 1; q._kind = "bq"; BQ.push(q); }));
  DAILY.forEach(q => q._kind = "dl");
  const ZERO = window.ZERO || { alphabet: [], phonics: [], words: [], phrases: [] };
  const ZQ = [];
  ZERO.phonics.forEach(l => l.quiz.forEach((q, i) => { q.id = `z${l.no}-${i}`; q.topic = `발음 ${l.no}`; q.level = 1; q._kind = "zq"; ZQ.push(q); }));
  const VOCAB = window.VOCAB || [], GRAMMAR = window.GRAMMAR || [];
  const RES = window.RES || [], GUIDE = window.GUIDE || [], PLAN = window.PLAN || [];
  const KO_P5 = window.KO_P5 || {}, KO_P6 = window.KO_P6 || {}, KO_P7 = window.KO_P7 || {};
  // 해석을 문제에 붙여 둔다 (보기를 섞어도 뜻이 같이 따라가게)
  P5.forEach(q => { const k = KO_P5[q.id]; if (k) { q.ko = k.ko; q.cko = k.cko; } });
  P6.forEach(s => { const k = KO_P6[s.id]; if (!k) return; s.ko = [k.ko]; s.questions.forEach((q, n) => { if (k.q && k.q[n]) q.cko = k.q[n].cko; }); });
  P7.forEach(s => { const k = KO_P7[s.id]; if (!k) return; s.ko = k.ko; s.questions.forEach((q, n) => { if (k.q && k.q[n]) { q.qko = k.q[n].qko; q.cko = k.q[n].cko; } }); });
  const app = document.getElementById("app");

  // ---------- 저장 ----------
  const KEY = "toeic.v1";
  const S = Object.assign({ p5: {}, p6: {}, p7: {}, dl: {}, bq: {}, st: {}, zq: {}, sknown: {}, known: {}, wrong: [], log: {}, plan: {} },
    JSON.parse(localStorage.getItem(KEY) || "{}"));
  let pushTimer = null;
  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(S));
    // 로그인 상태면 2초 모아서 서버에도 저장
    if (Auth.ok) { clearTimeout(pushTimer); pushTimer = setTimeout(Auth.push, 2000); }
  };
  const today = () => new Date().toLocaleDateString("sv-SE");
  function record(kind, id, ok) {
    const r = S[kind][id] || (S[kind][id] = { ok: 0, n: 0 });
    r.n++; if (ok) r.ok++;
    r.last = ok;
    S.log[today()] = (S.log[today()] || 0) + 1;
    const k = kind + ":" + id;
    if (!ok && !S.wrong.includes(k)) S.wrong.push(k);
    save();
  }
  const removeWrong = k => { S.wrong = S.wrong.filter(x => x !== k); save(); };

  // ---------- 도구 ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = a => [...new Set(a)];
  const L = "ABCD";
  const blanks = s => esc(s).replace(/\[(\d)\]/g, '<b class="tag">($1)</b>').replace(/-------/g, "<b>_______</b>");
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const h = (html) => { app.innerHTML = html; window.scrollTo(0, 0); };

  // ---------- 라우터 ----------
  const routes = { home, zero, account, admin, basic, daily, sent, p5, p6, p7, vocab, grammar, wrong, guide, res };
  function go() {
    const [r, arg] = (location.hash.slice(1) || "home").split("/");
    // 승인 회원만 이용: 서버 연결이 돼 있으면 로그인·승인 전에는 회원 화면만
    if (Auth.ready && r !== "account") {
      if (!Auth.checked) { h(`<div class="card">불러오는 중…</div>`); return; }
      if (!Auth.ok) { document.querySelectorAll("#nav a").forEach(a => a.classList.remove("on")); account(Auth.user ? undefined : "gate"); return; }
    }
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
    (routes[r] || home)(arg ? decodeURIComponent(arg) : undefined);
  }
  window.addEventListener("hashchange", go);

  // ---------- 홈 ----------
  function home() {
    const p5n = Object.keys(S.p5).length, p5ok = Object.values(S.p5).filter(r => r.last).length;
    const known = Object.keys(S.known).length;
    const days = Object.keys(S.log).length;
    let html = `<h1>TOTORI <span class="muted" style="font-size:15px">왕초보부터 토익 800까지</span></h1>
    ${Auth.ok ? `<p class="muted">${esc(Auth.nick())} 님, 기록은 계정에 자동 저장돼요.</p>` : ""}
    <div class="grid">
      <div class="card"><div class="muted">Part 5 푼 문제</div><div class="stat">${p5n} / ${P5.length}</div><div class="muted">최근 정답률 ${pct(p5ok, p5n)}%</div></div>
      <div class="card"><div class="muted">외운 단어</div><div class="stat">${known} / ${VOCAB.length}</div><div class="bar"><i style="width:${pct(known, VOCAB.length)}%"></i></div></div>
      <div class="card"><div class="muted">오답노트</div><div class="stat">${S.wrong.length}</div><div class="muted">다시 풀면 맞힌 건 빠져요</div></div>
      <div class="card"><div class="muted">오늘 푼 문제</div><div class="stat">${S.log[today()] || 0}</div><div class="muted">공부한 날 ${days}일</div></div>
    </div>
    <h2>바로 시작</h2>
    <div class="row">
      <a class="btn ghost" href="#zero">왕초보 0단계</a>
      <a class="btn" href="#daily">매일 문법 50문항</a>
      <a class="btn ghost" href="#basic">초보자반</a>
      <a class="btn ghost" href="#sent">오늘 문장</a>
      <a class="btn ghost" href="#p5">Part 5 주제별</a>
      <a class="btn ghost" href="#vocab">오늘 단어</a>
      <a class="btn ghost" href="#p7">Part 7 지문</a>
      <a class="btn ghost" href="#wrong">오답 다시 풀기</a>
    </div>`;
    if (PLAN.length) {
      html += `<h2>8주 학습 계획</h2><p class="muted">한 주를 끝내면 체크해 두세요.</p>`;
      html += PLAN.map(w => `<div class="card"><label class="row"><input type="checkbox" data-week="${w.week}" ${S.plan[w.week] ? "checked" : ""}> <b>${w.week}주차 — ${esc(w.title)}</b></label>
        <ul>${(w.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
    }
    h(html);
    app.querySelectorAll("[data-week]").forEach(c => c.onchange = () => { S.plan[c.dataset.week] = c.checked; save(); });
  }

  // ---------- Part 5 ----------
  const p5cfg = { topics: [], level: 0, count: 10, mode: "new" };
  function p5(topicArg) {
    if (topicArg) p5cfg.topics = [topicArg];
    const topics = uniq(P5.map(q => q.topic));
    const chip = (on, label, attr) => `<button class="chip ${on ? "on" : ""}" ${attr}>${esc(label)}</button>`;
    const stat = t => { const qs = P5.filter(q => q.topic === t); const done = qs.filter(q => S.p5[q.id]); return `${done.length}/${qs.length}`; };
    h(`<h1>Part 5 — 문법·어휘</h1>
      <div class="card">
        <div class="muted">주제 (여러 개 선택 가능, 아무것도 안 고르면 전체)</div>
        <div class="chips">${topics.map(t => chip(p5cfg.topics.includes(t), `${t} ${stat(t)}`, `data-topic="${esc(t)}"`)).join("")}</div>
        <div class="muted">난이도</div>
        <div class="chips">${[[0, "전체"], [1, "쉬움"], [2, "보통"], [3, "어려움"]].map(([v, l]) => chip(p5cfg.level === v, l, `data-level="${v}"`)).join("")}</div>
        <div class="muted">문제 수</div>
        <div class="chips">${[10, 20, 30].map(n => chip(p5cfg.count === n, n + "문제", `data-count="${n}"`)).join("")}</div>
        <div class="muted">출제 방식</div>
        <div class="chips">${[["new", "안 푼 문제 먼저"], ["all", "전체 무작위"], ["wrong", "틀린 문제만"]].map(([v, l]) => chip(p5cfg.mode === v, l, `data-mode="${v}"`)).join("")}</div>
        <button class="btn" id="start">시작</button> <span class="muted" id="avail"></span>
      </div>`);
    const pool = () => {
      let qs = P5.filter(q => (!p5cfg.topics.length || p5cfg.topics.includes(q.topic)) && (!p5cfg.level || q.level === p5cfg.level));
      if (p5cfg.mode === "wrong") qs = qs.filter(q => S.wrong.includes("p5:" + q.id));
      qs = shuffle(qs);
      if (p5cfg.mode === "new") qs.sort((a, b) => (S.p5[a.id] ? 1 : 0) - (S.p5[b.id] ? 1 : 0));
      return qs;
    };
    app.querySelector("#avail").textContent = `해당 문제 ${pool().length}개`;
    app.querySelectorAll("[data-topic]").forEach(b => b.onclick = () => { const t = b.dataset.topic; p5cfg.topics = p5cfg.topics.includes(t) ? p5cfg.topics.filter(x => x !== t) : [...p5cfg.topics, t]; p5(); });
    app.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { p5cfg.level = +b.dataset.level; p5(); });
    app.querySelectorAll("[data-count]").forEach(b => b.onclick = () => { p5cfg.count = +b.dataset.count; p5(); });
    app.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { p5cfg.mode = b.dataset.mode; p5(); });
    app.querySelector("#start").onclick = () => {
      const qs = pool().slice(0, p5cfg.count);
      if (!qs.length) return alert("조건에 맞는 문제가 없어요.");
      quiz(qs, "#p5");
    };
  }

  // 한 문제씩 풀기 (Part 5 / 오답노트 공용)
  // 보기 순서를 섞어 정답 위치가 외워지지 않게 한다
  const mix = q => { const o = shuffle(q.choices.map((c, k) => k)); return { ...q, choices: o.map(k => q.choices[k]), cko: q.cko && o.map(k => q.cko[k]), answer: o.indexOf(q.answer) }; };
  // 채점 후 보기 옆에 뜻 붙이기
  const glossOpts = (sel, q) => app.querySelectorAll(sel).forEach(o => { const c = q.cko && q.cko[+o.dataset.k]; if (c && !o.querySelector(".gl")) o.insertAdjacentHTML("beforeend", ` <span class="gl muted">— ${esc(c)}</span>`); });
  const koBox = (q) => q.ko ? `<div class="exp ko"><b>해석</b><br>${esc(q.ko)}</div>` : "";
  // 오답노트·결과용: 문제 전체 펼쳐 보기
  const review = (q) => `<div class="q">${q.qko ? esc(q.q || "") + `<div class="muted">${esc(q.qko)}</div>` : blanks(q.q || "")}</div>
    ${q.choices.map((c, k) => `<div class="opt ${k === q.answer ? "ok" : ""}" style="cursor:default">(${L[k]}) ${esc(c)}${q.cko ? ` <span class="muted">— ${esc(q.cko[k])}</span>` : ""}</div>`).join("")}
    <div class="exp"><b>정답 (${L[q.answer]})</b><br>${esc(q.explain)}</div>${koBox(q)}`;
  function quiz(qs, back) {
    qs = qs.map(mix);
    let i = 0, right = 0; const missed = [];
    const show = () => {
      const q = qs[i];
      h(`<div class="row" style="justify-content:space-between"><span class="muted">${i + 1} / ${qs.length}</span><span><span class="tag">${esc(q.topic)}</span><span class="tag">${"★".repeat(q.level || 1)}</span></span></div>
        <div class="bar"><i style="width:${pct(i, qs.length)}%"></i></div>
        <div class="card"><div class="q">${blanks(q.q)}</div>
        ${q.choices.map((c, k) => `<button class="opt" data-k="${k}">(${L[k]}) ${esc(c)}</button>`).join("")}
        <div id="after"></div></div>
        <a class="muted" href="${back}">그만하기</a>`);
      app.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        const k = +b.dataset.k, ok = k === q.answer;
        app.querySelectorAll(".opt").forEach(o => { o.disabled = true; if (+o.dataset.k === q.answer) o.classList.add("ok"); });
        if (!ok) b.classList.add("bad");
        const kind = q._kind || "p5";
        record(kind, q.id, ok);
        if (ok) { right++; removeWrong(kind + ":" + q.id); } else missed.push(q);
        glossOpts(".opt", q);
        app.querySelector("#after").innerHTML = `<div class="exp"><b>${ok ? "정답" : "오답 — 정답 (" + L[q.answer] + ")"}</b><br>${esc(q.explain)}</div>${koBox(q)}
          ${q.q.includes("-------") && !/[가-힣]/.test(q.q) ? `<div class="row" style="margin-top:8px">${spk(q.q.replace("-------", q.choices[q.answer]), "▶ 문장 듣기")}</div>` : ""}
          <div class="row" style="margin-top:12px"><button class="btn" id="next">${i + 1 < qs.length ? "다음 문제" : "결과 보기"}</button></div>`;
        app.querySelector("#next").onclick = () => { i++; i < qs.length ? show() : done(); };
      });
    };
    const done = () => {
      h(`<h1>결과</h1><div class="card"><div class="stat">${right} / ${qs.length}</div><div class="muted">정답률 ${pct(right, qs.length)}%</div></div>
        ${missed.length ? `<h2>틀린 문제</h2>` + missed.map(q => `<div class="card">${review(q)}</div>`).join("") : ""}
        <div class="row">${missed.length ? `<button class="btn" id="again">틀린 문제 다시</button>` : ""}<a class="btn ghost" href="${back}">처음으로</a></div>`);
      const a = app.querySelector("#again"); if (a) a.onclick = () => quiz(shuffle(missed), back);
    };
    show();
  }

  // ---------- Part 6 / 7 공용: 지문 세트 ----------
  function setList(kind, sets, title, desc) {
    return (filter) => {
      const kinds = kind === "p7" ? uniq(sets.map(s => s.kind)) : [];
      const list = sets.filter(s => !filter || s.kind === filter);
      h(`<h1>${title}</h1><p class="muted">${desc}</p>
        ${kinds.length ? `<div class="chips"><a class="chip ${!filter ? "on" : ""}" href="#${kind}">전체</a>${kinds.map(k => `<a class="chip ${filter === k ? "on" : ""}" href="#${kind}/${encodeURIComponent(k)}">${esc(k)}</a>`).join("")}</div>` : ""}
        <div class="card">${list.map(s => {
          const r = s.questions.map((_, n) => S[kind][s.id + "-" + n]).filter(Boolean);
          const st = r.length ? `${r.filter(x => x.last).length}/${s.questions.length} 맞음` : "안 풂";
          return `<div class="list-item"><div>${s.kind ? `<span class="tag">${esc(s.kind)}</span>` : ""}${esc(s.title)} <span class="muted">· ${s.questions.length}문항</span></div>
            <div class="row"><span class="muted">${st}</span><button class="btn ghost" data-open="${s.id}">풀기</button></div></div>`;
        }).join("")}</div>`);
      app.querySelectorAll("[data-open]").forEach(b => b.onclick = () => solveSet(kind, sets.find(s => s.id === b.dataset.open), location.hash || "#" + kind));
    };
  }
  function solveSet(kind, s, back) {
    const passages = s.passages || [s.passage];
    const picked = {};
    h(`<a class="muted" href="${back}">← 목록</a><h1>${esc(s.title)}</h1>
      ${passages.map(p => `<div class="passage">${blanks(p)}</div>`).join("")}
      <div id="kopass"></div>
      ${s.questions.map((q, n) => `<div class="card" data-q="${n}"><div class="q"><b>${kind === "p6" ? "(" + (q.n || n + 1) + ")" : n + 1 + "."}</b> ${esc(q.q || "빈칸에 알맞은 것은?")}</div>
        ${q.choices.map((c, k) => `<button class="opt" data-n="${n}" data-k="${k}">(${L[k]}) ${esc(c)}</button>`).join("")}<div class="after"></div></div>`).join("")}
      <div class="row"><button class="btn" id="grade">채점하기</button><a class="btn ghost" href="${back}">목록</a></div>`);
    app.querySelectorAll(".opt").forEach(b => b.onclick = () => {
      if (b.disabled) return;
      const n = b.dataset.n; picked[n] = +b.dataset.k;
      app.querySelectorAll(`.opt[data-n="${n}"]`).forEach(o => o.style.borderColor = o === b ? "var(--accent)" : "");
    });
    app.querySelector("#grade").onclick = () => {
      if (Object.keys(picked).length < s.questions.length && !confirm("안 고른 문제가 있어요. 그래도 채점할까요?")) return;
      let right = 0;
      s.questions.forEach((q, n) => {
        const k = picked[n], ok = k === q.answer, id = s.id + "-" + n;
        if (ok) { right++; removeWrong(kind + ":" + id); }
        record(kind, id, ok);
        app.querySelectorAll(`.opt[data-n="${n}"]`).forEach(o => { o.disabled = true; o.style.borderColor = ""; const kk = +o.dataset.k; if (kk === q.answer) o.classList.add("ok"); else if (kk === k) o.classList.add("bad"); });
        glossOpts(`.opt[data-n="${n}"]`, q);
        app.querySelector(`[data-q="${n}"] .after`).innerHTML = `${q.qko ? `<div class="muted">문제 뜻: ${esc(q.qko)}</div>` : ""}<div class="exp"><b>${ok ? "정답" : "오답 — 정답 (" + L[q.answer] + ")"}</b><br>${esc(q.explain)}</div>`;
      });
      if (s.ko) app.querySelector("#kopass").innerHTML = s.ko.map((t, i) => `<div class="card"><details open><summary>지문 해석${s.ko.length > 1 ? " " + (i + 1) : ""}</summary><div class="passage">${blanks(t)}</div></details></div>`).join("");
      const g = app.querySelector("#grade"); g.disabled = true; g.textContent = `${right} / ${s.questions.length} 맞음`;
    };
  }
  function p6(f) { setList("p6", P6, "Part 6 — 장문 빈칸", "지문을 읽고 빈칸 4개를 모두 고른 뒤 채점하세요. 문장 넣기 문제 포함.")(f); }
  function p7(f) { setList("p7", P7, "Part 7 — 독해", "단일·이중·삼중 지문. 문제를 먼저 읽고 지문에서 근거를 찾는 연습을 하세요.")(f); }

  // ---------- 단어 ----------
  // ---------- 음성 (브라우저 내장 영어 음성) ----------
  const TTS = "speechSynthesis" in window;
  let enVoice = null;
  const pickVoice = () => { const vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang)); enVoice = vs.find(v => /Samantha|Google US|Aria|Jenny|Zira/i.test(v.name)) || vs[0] || null; };
  if (TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text) {
    if (!TTS || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; if (enVoice) u.voice = enVoice; u.rate = vc.rate;
    speechSynthesis.speak(u);
  }
  const spk = (text, label = "🔊") => TTS ? `<button class="say" data-say="${esc(text)}" title="읽어주기">${label}</button>` : "";
  app.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) { e.stopPropagation(); say(b.dataset.say); } }, true);

  const vc = Object.assign({ day: 1, mode: "card", hideKnown: false, auto: true, rate: 0.9 }, JSON.parse(localStorage.getItem("toeic.vc") || "{}"));
  const saveVc = () => localStorage.setItem("toeic.vc", JSON.stringify({ auto: vc.auto, rate: vc.rate }));
  function vocab() {
    const days = uniq(VOCAB.map(v => v.day)).sort((a, b) => a - b);
    const words = VOCAB.filter(v => v.day === vc.day && !(vc.hideKnown && S.known[v.w]));
    const dayDone = d => VOCAB.filter(v => v.day === d && S.known[v.w]).length;
    let html = `<h1>단어</h1>
      <div class="chips">${days.map(d => `<button class="chip ${vc.day === d ? "on" : ""}" data-day="${d}">Day ${d} <span class="muted">${dayDone(d)}</span></button>`).join("")}</div>
      <div class="chips">${[["card", "카드"], ["quiz", "뜻 맞히기"], ["list", "목록"]].map(([v, l]) => `<button class="chip ${vc.mode === v ? "on" : ""}" data-mode="${v}">${l}</button>`).join("")}
      <label class="chip"><input type="checkbox" id="hk" ${vc.hideKnown ? "checked" : ""}> 외운 단어 숨기기</label></div>
      ${TTS ? `<div class="chips"><label class="chip"><input type="checkbox" id="auto" ${vc.auto ? "checked" : ""}> 🔊 단어 자동 읽기</label>
        ${[[0.7, "느리게"], [0.9, "보통"], [1.1, "빠르게"]].map(([r, l]) => `<button class="chip ${vc.rate === r ? "on" : ""}" data-rate="${r}">${l}</button>`).join("")}</div>` : `<div class="muted">이 브라우저는 음성 읽기를 지원하지 않아요.</div>`}
      <div id="vbox"></div>`;
    h(html);
    app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { vc.day = +b.dataset.day; vocab(); });
    app.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { vc.mode = b.dataset.mode; vocab(); });
    app.querySelector("#hk").onchange = e => { vc.hideKnown = e.target.checked; vocab(); };
    if (TTS) {
      app.querySelector("#auto").onchange = e => { vc.auto = e.target.checked; saveVc(); };
      app.querySelectorAll("[data-rate]").forEach(b => b.onclick = () => { vc.rate = +b.dataset.rate; saveVc(); vocab(); });
    }
    const box = app.querySelector("#vbox");
    if (!words.length) { box.innerHTML = `<div class="card">이 Day 단어를 다 외웠어요. 👍</div>`; return; }
    if (vc.mode === "list") {
      box.innerHTML = `<input type="search" id="vs" placeholder="전체 단어 검색 (영어·뜻)"><div class="card" id="vl" style="margin-top:10px"></div>`;
      const render = term => {
        const src = term ? VOCAB.filter(v => (v.w + v.m).toLowerCase().includes(term.toLowerCase())) : words;
        box.querySelector("#vl").innerHTML = src.slice(0, 200).map(v => `<div class="list-item"><div>${spk(v.w)}<b>${esc(v.w)}</b> <span class="tag">${esc(v.pos)}</span> ${esc(v.m)}<div class="muted">${spk(v.ex, "▶")}${esc(v.ex)}${v.tip ? " · " + esc(v.tip) : ""}</div></div>
          <button class="chip ${S.known[v.w] ? "on" : ""}" data-known="${esc(v.w)}">${S.known[v.w] ? "외움" : "외웠어요"}</button></div>`).join("") || "결과 없음";
        box.querySelectorAll("[data-known]").forEach(b => b.onclick = () => { const w = b.dataset.known; S.known[w] ? delete S.known[w] : S.known[w] = 1; save(); render(term); });
      };
      box.querySelector("#vs").oninput = e => render(e.target.value.trim());
      render("");
    } else if (vc.mode === "card") {
      const deck = shuffle(words); let i = 0, flipped = false;
      const show = () => {
        const v = deck[i];
        if (vc.auto && !flipped) say(v.w);
        box.innerHTML = `<div class="muted">${i + 1} / ${deck.length} · 카드를 누르면 뜻이 보여요</div>
          <div class="card flash" id="fc"><div class="w">${esc(v.w)} ${spk(v.w)}</div>${flipped ? `<div class="m"><span class="tag">${esc(v.pos)}</span>${esc(v.m)}</div><div class="muted" style="margin-top:8px">${spk(v.ex, "▶ 예문")} ${esc(v.ex)}</div>${v.tip ? `<div class="muted">${esc(v.tip)}</div>` : ""}` : ""}</div>
          <div class="row"><button class="btn ghost" id="again">아직 모름</button><button class="btn" id="know">외웠어요</button></div>`;
        box.querySelector("#fc").onclick = () => { flipped = !flipped; show(); };
        const next = () => { flipped = false; i++; i < deck.length ? show() : vocab(); };
        box.querySelector("#again").onclick = () => { deck.push(v); next(); };
        box.querySelector("#know").onclick = () => { S.known[v.w] = 1; save(); next(); };
      };
      show();
    } else {
      const deck = shuffle(words).slice(0, 20); let i = 0, right = 0;
      const show = () => {
        const v = deck[i];
        const others = shuffle(VOCAB.filter(x => x.w !== v.w && x.m !== v.m)).slice(0, 3);
        const opts = shuffle([v, ...others]);
        if (vc.auto) say(v.w);
        box.innerHTML = `<div class="muted">${i + 1} / ${deck.length}</div><div class="card"><div class="q"><b>${esc(v.w)}</b> ${spk(v.w)} <span class="tag">${esc(v.pos)}</span></div>
          ${opts.map(o => `<button class="opt" data-w="${esc(o.w)}">${esc(o.m)}</button>`).join("")}<div id="va"></div></div>`;
        box.querySelectorAll(".opt").forEach(b => b.onclick = () => {
          const ok = b.dataset.w === v.w;
          box.querySelectorAll(".opt").forEach(o => { o.disabled = true; if (o.dataset.w === v.w) o.classList.add("ok"); });
          if (!ok) b.classList.add("bad"); else { right++; S.known[v.w] = 1; save(); }
          box.querySelector("#va").innerHTML = `<div class="exp">${spk(v.ex, "▶")} ${esc(v.ex)}${v.tip ? "<br>" + esc(v.tip) : ""}</div><button class="btn" style="margin-top:10px" id="vn">${i + 1 < deck.length ? "다음" : "결과"}</button>`;
          box.querySelector("#vn").onclick = () => { i++; i < deck.length ? show() : (box.innerHTML = `<div class="card"><div class="stat">${right} / ${deck.length}</div><div class="muted">맞힌 단어는 '외움'으로 표시돼요.</div></div><button class="btn" id="vr">다시</button>`, box.querySelector("#vr").onclick = vocab); };
        });
      };
      show();
    }
  }

  // ---------- 문법 정리 ----------
  function grammar() {
    h(`<h1>문법 정리</h1><p class="muted">주제별 핵심 규칙과 함정. 읽고 바로 그 주제 문제를 풀어보세요.</p>
      ${GRAMMAR.map(g => {
        const topic = g.topic || uniq(P5.map(q => q.topic)).find(t => g.title.includes(t) || t.split(/[\/·]/).some(p => g.title.includes(p)));
        return `<div class="card"><details><summary>${esc(g.title)}</summary><div>${g.body}</div>
        ${topic ? `<a class="btn ghost" href="#p5/${encodeURIComponent(topic)}">이 주제 문제 풀기</a>` : ""}</details></div>`;
      }).join("")}`);
  }

  // ---------- 오답노트 ----------
  function wrong() {
    const items = S.wrong.map(k => {
      const [kind, id] = k.split(":");
      const single = { p5: P5, dl: DAILY, bq: BQ, zq: ZQ }[kind];
      if (single) { const q = single.find(x => x.id === id); return q && { k, kind, q, label: q.q }; }
      if (kind === "st") { const t = SENT.find(x => x.id === id); return t && { k, kind, t, label: t.en }; }
      const [sid, n] = [id.slice(0, id.lastIndexOf("-")), +id.slice(id.lastIndexOf("-") + 1)];
      const s = (kind === "p6" ? P6 : P7).find(x => x.id === sid);
      return s && s.questions[n] && { k, kind, s, n, label: `${s.title} — ${s.questions[n].q || "(" + (n + 1) + ")번 빈칸"}` };
    }).filter(Boolean);
    const p5w = items.filter(x => x.q);
    const TAG = { p5: "P5", p6: "P6", p7: "P7", dl: "매일 문법", bq: "초보자반", st: "문장", zq: "왕초보" };
    h(`<h1>오답노트</h1><p class="muted">틀린 문제가 자동으로 쌓이고, 다시 풀어 맞히면 빠져요.</p>
      ${p5w.length ? `<button class="btn" id="redo">문법 오답 ${p5w.length}개 다시 풀기</button>` : ""}
      <div style="margin-top:12px">${items.length ? items.map(x => {
        const body = x.t ? `<div class="q">${spk(x.t.en)}${esc(x.t.en)}</div><div class="exp ko"><b>해석</b><br>${esc(x.t.ko)}</div><div class="muted">${esc(x.t.key)}</div>` : review(x.q || x.s.questions[x.n]);
        return `<div class="card"><details><summary><span class="tag">${TAG[x.kind] || x.kind}</span>${blanks(x.label)}</summary>
          <div style="margin-top:10px">${body}</div></details>
          <div class="row" style="margin-top:8px">${x.s ? `<button class="btn ghost" data-set="${x.kind}|${x.s.id}">지문 열어 다시 풀기</button>` : ""}<button class="chip" data-del="${x.k}">삭제</button></div></div>`;
      }).join("") : `<div class="card">아직 틀린 문제가 없어요.</div>`}</div>`);
    const r = app.querySelector("#redo"); if (r) r.onclick = () => quiz(shuffle(p5w.map(x => x.q)), "#wrong");
    app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { removeWrong(b.dataset.del); wrong(); });
    app.querySelectorAll("[data-set]").forEach(b => b.onclick = () => { const [kind, id] = b.dataset.set.split("|"); solveSet(kind, (kind === "p6" ? P6 : P7).find(s => s.id === id), "#wrong"); });
  }

  // ---------- 요령 ----------
  function guide() {
    h(`<h1>파트별 요령</h1>${GUIDE.map((g, i) => `<div class="card"><details ${i === 0 ? "open" : ""}><summary>${esc(g.title)}</summary><div>${g.body}</div></details></div>`).join("")}`);
  }

  // ---------- 자료 모음 ----------
  const rc = { cat: "", term: "" };
  function res() {
    const cats = uniq(RES.map(r => r.cat));
    h(`<h1>자료 모음</h1><p class="muted">무료 위주의 외부 자료. 분류를 골라 들어가세요.</p>
      <div class="chips"><button class="chip ${!rc.cat ? "on" : ""}" data-cat="">전체 ${RES.length}</button>${cats.map(c => `<button class="chip ${rc.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)} ${RES.filter(r => r.cat === c).length}</button>`).join("")}</div>
      <input type="search" id="rs" placeholder="검색" value="${esc(rc.term)}">
      <div class="card res" id="rl" style="margin-top:10px"></div>`);
    const render = () => {
      const t = rc.term.toLowerCase();
      app.querySelector("#rl").innerHTML = RES.filter(r => (!rc.cat || r.cat === rc.cat) && (!t || (r.title + r.desc).toLowerCase().includes(t)))
        .map(r => `<div class="list-item"><div><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a> ${r.free === false ? '<span class="tag">유료·체험</span>' : '<span class="tag">무료</span>'}<div class="muted">${esc(r.cat)} · ${esc(r.desc)}</div></div></div>`).join("") || "결과 없음";
    };
    app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { rc.cat = b.dataset.cat; res(); });
    app.querySelector("#rs").oninput = e => { rc.term = e.target.value; render(); };
    render();
  }

  // ---------- 초보자반 ----------
  function basic(arg) {
    if (arg) {
      const l = BASIC.find(x => String(x.no) === arg); if (!l) return basic();
      const prev = BASIC.find(x => x.no === l.no - 1), next = BASIC.find(x => x.no === l.no + 1);
      h(`<a class="muted" href="#basic">← 초보자반 목록</a><h1>${l.no}강. ${esc(l.title)}</h1>
        ${l.goal ? `<p class="muted">목표: ${esc(l.goal)}</p>` : ""}
        <div class="card lesson">${l.body}</div>
        <div class="row"><button class="btn" id="lq">확인 문제 ${l.quiz.length}개 풀기</button>
        ${prev ? `<a class="btn ghost" href="#basic/${prev.no}">← ${prev.no}강</a>` : ""}${next ? `<a class="btn ghost" href="#basic/${next.no}">${next.no}강 →</a>` : ""}</div>`);
      app.querySelector("#lq").onclick = () => quiz(l.quiz, "#basic/" + l.no);
      return;
    }
    h(`<h1>초보자반 — 완전 기초부터</h1><p class="muted">중학 영문법부터 차근차근. 강의를 읽고 확인 문제를 풀어요. 끝까지 하면 매일 문법 Day 1 로 넘어가세요.</p>
      <div class="card">${BASIC.length ? BASIC.map(l => {
        const r = l.quiz.map(q => S.bq[q.id]).filter(Boolean), ok = r.filter(x => x.last).length;
        return `<div class="list-item"><div><b>${l.no}강</b> ${esc(l.title)}</div>
          <div class="row"><span class="muted">${r.length ? `${ok}/${l.quiz.length} 맞음` : "시작 전"}</span><a class="btn ghost" href="#basic/${l.no}">공부하기</a></div></div>`;
      }).join("") : "강의를 불러오지 못했어요."}</div>`);
  }

  // ---------- 매일 문법 ----------
  const DAYS_T = ["", "품사 자리 ① 명사·형용사", "품사 자리 ② 부사·동사", "대명사", "수일치", "시제 ①", "시제 ② 완료", "능동/수동 ①", "수동태 ②", "to부정사", "동명사",
    "분사", "분사구문", "관계대명사", "관계부사·복합관계사", "접속사 vs 전치사", "등위·상관접속사", "명사절 접속사", "부사절 접속사", "비교", "가정법·도치",
    "전치사 ①", "전치사 ② 관용", "어휘 ① 동사", "어휘 ② 명사", "어휘 ③ 형용사·부사", "어휘 ④ 혼동·짝꿍", "명사·한정사", "조동사·당위 that절", "실전 모의 ①", "실전 모의 ②"];
  function daily(arg) {
    const days = uniq(DAILY.map(q => q.day)).sort((a, b) => a - b);
    const stat = d => { const qs = DAILY.filter(q => q.day === d), r = qs.map(q => S.dl[q.id]).filter(Boolean); return { n: qs.length, done: r.length, ok: r.filter(x => x.last).length }; };
    if (arg) {
      const d = +arg, qs = DAILY.filter(q => q.day === d), st = stat(d);
      const left = qs.filter(q => !S.dl[q.id] || !S.dl[q.id].last);
      h(`<a class="muted" href="#daily">← 매일 문법</a><h1>Day ${d} — ${esc(DAYS_T[d] || "")}</h1>
        <div class="card"><div class="stat">${st.done} / ${st.n}</div><div class="muted">푼 문제 · 맞힌 문제 ${st.ok}개</div><div class="bar"><i style="width:${pct(st.done, st.n)}%"></i></div></div>
        <div class="row"><button class="btn" data-go="all">처음부터 ${qs.length}문항</button>
        ${left.length && left.length < qs.length ? `<button class="btn ghost" data-go="left">안 푼·틀린 것만 ${left.length}문항</button>` : ""}
        <a class="btn ghost" href="#grammar">문법 정리 보기</a></div>`);
      app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => quiz(b.dataset.go === "all" ? qs : left, "#daily/" + d));
      return;
    }
    const next = days.find(d => stat(d).done < stat(d).n) || days[0];
    h(`<h1>매일 문법 — 30일 · 하루 50문항</h1><p class="muted">그날 주제 40문항 + 앞 일차 복습 10문항. 풀면서 해석·보기 뜻을 바로 확인해요.</p>
      ${next ? `<a class="btn" href="#daily/${next}">이어서 하기: Day ${next}</a>` : ""}
      <div class="grid" style="margin-top:12px">${days.map(d => { const t = stat(d); return `<a class="card" href="#daily/${d}" style="text-decoration:none;color:inherit">
        <b>Day ${d}</b><div class="muted">${esc(DAYS_T[d] || "")}</div><div class="bar"><i style="width:${pct(t.done, t.n)}%"></i></div>
        <div class="muted">${t.done ? `${t.ok}/${t.n} 맞음` : `${t.n}문항`}</div></a>`; }).join("") || "<div class='card'>문제를 불러오지 못했어요.</div>"}</div>`);
  }

  // ---------- 문장 ----------
  const sc = { day: 1, mode: "card" };
  const norm = t => t.toLowerCase().replace(/[.’]/g, m => m === "’" ? "'" : "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
  function sent() {
    const days = uniq(SENT.map(x => x.day)).sort((a, b) => a - b);
    const list = SENT.filter(x => x.day === sc.day);
    const dayDone = d => SENT.filter(x => x.day === d && S.sknown[x.id]).length;
    h(`<h1>문장</h1><p class="muted">토익 빈출 문장 300개 · 하루 10문장. 듣고, 뜻 보고, 순서 맞추고, 받아쓰고, 영작을 골라요.</p>
      <div class="chips">${days.map(d => `<button class="chip ${sc.day === d ? "on" : ""}" data-day="${d}">Day ${d} <span class="muted">${dayDone(d)}</span></button>`).join("")}</div>
      <div class="chips">${[["card", "문장 카드"], ["order", "순서 맞추기"], ["dict", "듣고 받아쓰기"], ["pick", "영작 고르기"]].map(([v, l]) => `<button class="chip ${sc.mode === v ? "on" : ""}" data-mode="${v}">${l}</button>`).join("")}</div>
      <div id="sbox"></div>`);
    app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { sc.day = +b.dataset.day; sent(); });
    app.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { sc.mode = b.dataset.mode; sent(); });
    const box = app.querySelector("#sbox");
    if (!list.length) { box.innerHTML = `<div class="card">문장을 불러오지 못했어요.</div>`; return; }
    const deck = shuffle(list); let i = 0, right = 0;
    const mark = (t, ok) => { record("st", t.id, ok); if (ok) { right++; removeWrong("st:" + t.id); S.sknown[t.id] = 1; save(); } };
    const footer = (t, ok) => `<div class="exp"><b>${ok === undefined ? "" : ok ? "정답" : "오답"}</b>${ok === undefined ? "" : "<br>"}${spk(t.en, "▶")} ${esc(t.en)}<br>${esc(t.ko)}<div class="muted">${esc(t.key || "")}</div></div>
      <button class="btn" style="margin-top:10px" id="sn">${i + 1 < deck.length ? "다음" : "결과"}</button>`;
    const nextBtn = () => box.querySelector("#sn").onclick = () => { i++; i < deck.length ? show() : done(); };
    const done = () => { box.innerHTML = sc.mode === "card" ? `<div class="card">Day ${sc.day} 문장 카드를 다 봤어요.</div><button class="btn" id="sr">다시</button>`
      : `<div class="card"><div class="stat">${right} / ${deck.length}</div><div class="muted">틀린 문장은 오답노트에 쌓여요.</div></div><button class="btn" id="sr">다시</button>`; box.querySelector("#sr").onclick = sent; };
    const head = () => `<div class="muted">${i + 1} / ${deck.length} · ${esc(deck[i].tag || "")}</div>`;
    const show = () => {
      const t = deck[i];
      if (sc.mode === "card") {
        let open = false;
        const draw = () => {
          box.innerHTML = `${head()}<div class="card flash" id="fc"><div class="m" style="font-size:20px">${esc(t.en)} ${spk(t.en)}</div>
            ${open ? `<div class="m">${esc(t.ko)}</div><div class="muted" style="margin-top:6px">${esc(t.key || "")}</div>` : `<div class="muted" style="margin-top:8px">눌러서 뜻 보기</div>`}</div>
            <div class="row"><button class="btn ghost" id="again">다시 볼래요</button><button class="btn" id="know">외웠어요</button></div>`;
          box.querySelector("#fc").onclick = () => { open = !open; draw(); };
          box.querySelector("#again").onclick = () => { deck.push(t); i++; show(); };
          box.querySelector("#know").onclick = () => { S.sknown[t.id] = 1; save(); i++; i < deck.length ? show() : done(); };
        };
        if (vc.auto) say(t.en);
        draw();
      } else if (sc.mode === "order") {
        const words = t.en.split(" "); const pool = shuffle(words.map((w, k) => ({ w, k }))); const built = [];
        const draw = () => {
          box.innerHTML = `${head()}<div class="card"><div class="q">${esc(t.ko)}</div>
            <div class="passage" style="min-height:48px">${built.map((b, j) => `<button class="chip on" data-b="${j}">${esc(b.w)}</button>`).join(" ") || '<span class="muted">아래 단어를 순서대로 눌러요 (누른 단어를 다시 누르면 빠져요)</span>'}</div>
            <div class="chips">${pool.map((p, j) => `<button class="chip" data-p="${j}">${esc(p.w)}</button>`).join("")}</div>
            <button class="btn" id="chk" ${pool.length ? "disabled" : ""}>확인</button><div id="sa"></div></div>`;
          box.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { built.push(pool.splice(+b.dataset.p, 1)[0]); draw(); });
          box.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { pool.push(built.splice(+b.dataset.b, 1)[0]); draw(); });
          box.querySelector("#chk").onclick = () => { const ok = built.map(b => b.w).join(" ") === t.en; mark(t, ok); box.querySelector("#chk").disabled = true; box.querySelector("#sa").innerHTML = footer(t, ok); say(t.en); nextBtn(); };
        };
        draw();
      } else if (sc.mode === "dict") {
        box.innerHTML = `${head()}<div class="card"><div class="row">${spk(t.en, "🔊 듣기")}${TTS ? `<button class="say" id="slow">🐢 천천히</button>` : ""}<span class="muted">힌트: ${esc(t.ko)}</span></div>
          <input type="search" id="din" placeholder="들은 문장을 영어로 써요" style="margin-top:10px" autocomplete="off">
          <div class="row" style="margin-top:8px"><button class="btn" id="chk">확인</button></div><div id="sa"></div></div>`;
        if (TTS) { say(t.en); box.querySelector("#slow").onclick = () => { const r = vc.rate; vc.rate = 0.6; say(t.en); vc.rate = r; }; }
        const inp = box.querySelector("#din"); inp.focus();
        const chk = () => {
          const ok = norm(inp.value) === norm(t.en); mark(t, ok); inp.disabled = true; box.querySelector("#chk").disabled = true;
          const want = norm(t.en).split(" "), got = norm(inp.value).split(" ");
          const diff = want.map((w, k) => got[k] === w ? esc(w) : `<b style="color:var(--bad)">${esc(w)}</b>`).join(" ");
          box.querySelector("#sa").innerHTML = (ok ? "" : `<div class="muted" style="margin-top:8px">틀린 자리: ${diff}</div>`) + footer(t, ok); nextBtn();
        };
        box.querySelector("#chk").onclick = chk; inp.onkeydown = e => { if (e.key === "Enter" && !inp.disabled) chk(); };
      } else {
        const opts = shuffle([t.en, ...(t.wrong || [])]);
        box.innerHTML = `${head()}<div class="card"><div class="q">${esc(t.ko)}</div><div class="muted">알맞은 영어 문장을 고르세요</div>
          ${opts.map(o => `<button class="opt" data-o="${esc(o)}">${esc(o)}</button>`).join("")}<div id="sa"></div></div>`;
        box.querySelectorAll(".opt").forEach(b => b.onclick = () => {
          const ok = b.dataset.o === t.en; mark(t, ok);
          box.querySelectorAll(".opt").forEach(o => { o.disabled = true; if (o.dataset.o === t.en) o.classList.add("ok"); }); if (!ok) b.classList.add("bad");
          box.querySelector("#sa").innerHTML = footer(t, ok); say(t.en); nextBtn();
        });
      }
    };
    show();
  }

  // ---------- 회원 (Supabase, VOLTA 방식: 아이디+비밀번호, 관리자 승인) ----------
  // 기록 합치기: 문제별로 더 많이 푼 쪽, 외운 목록은 합집합, 날짜별 횟수는 큰 값
  function mergeState(a, b) {
    const out = { ...a };
    ["p5", "p6", "p7", "dl", "bq", "st", "zq"].forEach(k => {
      out[k] = { ...(a[k] || {}) };
      Object.entries(b[k] || {}).forEach(([id, r]) => { if (!out[k][id] || (r.n || 0) > (out[k][id].n || 0)) out[k][id] = r; });
    });
    ["known", "sknown", "plan"].forEach(k => out[k] = { ...(a[k] || {}), ...(b[k] || {}) });
    out.log = { ...(a.log || {}) };
    Object.entries(b.log || {}).forEach(([d, n]) => out.log[d] = Math.max(out.log[d] || 0, n));
    out.wrong = uniq([...(a.wrong || []), ...(b.wrong || [])]).filter(w => { const [k, id] = w.split(":"); const r = out[k] && out[k][id]; return !r || !r.last; });
    return out;
  }
  // 아이디만 받으므로 Supabase Auth 용 이메일은 내부용으로 만들어 쓴다 (메일은 보내지 않음)
  const idToEmail = id => `${id.toLowerCase()}@users.totori.local`;
  const ID_RE = /^[a-z0-9_.-]{3,20}$/;
  const Auth = {
    sb: null, user: null, member: null, ready: false, checked: false, status: "",
    get ok() { return !!(this.user && this.member && this.member.status === "approved"); },
    get admin() { return this.ok && this.member.role === "admin"; },
    init() {
      const c = window.TOTORI_CONFIG || {};
      if (!c.supabaseUrl || !c.supabaseAnonKey || !window.supabase) return;
      this.sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { storageKey: "totori-auth" } });
      this.ready = true;
      this.sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => this.onSession(session), 0); });
    },
    async onSession(session) {
      const prev = this.user && this.user.id, first = !this.checked;
      this.user = session ? session.user : null;
      this.checked = true;
      if (!this.user) { this.member = null; renderAcct(); go(); return; }
      if (prev === this.user.id && this.member && !first) return;
      await this.loadMember();
      if (this.ok) { await this.sb.rpc("totori_touch_login"); await this.pull(); }
      renderAcct();
      go();
    },
    async loadMember() {
      const { data } = await this.sb.from("totori_members").select("*").eq("user_id", this.user.id).maybeSingle();
      this.member = data || null;
    },
    nick() { return (this.member && (this.member.nick || this.member.username)) || ""; },
    async pull() {
      this.status = "기록 불러오는 중…"; renderAcct();
      const { data, error } = await this.sb.from("totori_progress").select("data").eq("user_id", this.user.id).maybeSingle();
      if (error) { this.status = "기록을 불러오지 못했어요: " + error.message; return; }
      const merged = mergeState(S, (data && data.data) || {});
      Object.keys(S).forEach(k => delete S[k]); Object.assign(S, merged);
      localStorage.setItem(KEY, JSON.stringify(S));
      await this.push();
    },
    push: async () => {
      if (!Auth.ok) return;
      const { error } = await Auth.sb.from("totori_progress").upsert({ user_id: Auth.user.id, data: S, updated_at: new Date().toISOString() });
      Auth.status = error ? "서버 저장 실패: " + error.message : "저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    },
  };
  function renderAcct() {
    const a = document.getElementById("acct"); if (!a) return;
    a.textContent = !Auth.user ? "로그인" : Auth.ok ? "👤 " + Auth.nick() : "승인 대기";
    const ad = document.getElementById("adminLink"); if (ad) ad.style.display = Auth.admin ? "" : "none";
  }
  const msgBox = (t, bad) => { const m = app.querySelector("#amsg"); if (m) m.innerHTML = `<div class="exp" style="${bad ? "border-color:var(--bad)" : ""}">${esc(t)}</div>`; };
  function account(arg) {
    if (!Auth.ready) {
      h(`<h1>회원</h1><div class="card">회원 기능을 준비하고 있어요. 서버 연결이 끝나면 여기서 가입·로그인할 수 있어요.<br><span class="muted">지금도 기록은 이 기기에 저장돼요.</span></div>`); return;
    }
    const sb = Auth.sb;
    if (Auth.user) {
      const m = Auth.member;
      if (!m || m.status !== "approved") {
        h(`<h1>${m && m.status === "rejected" ? "가입이 거절됐어요" : "승인 대기 중"}</h1><div class="card">
          ${m && m.status === "rejected" ? "관리자가 가입을 승인하지 않았어요." : `<b>${esc(m ? m.username : "")}</b> 님, 가입 신청이 접수됐어요. 관리자가 승인하면 바로 이용할 수 있어요.`}
          <div class="row" style="margin-top:10px"><button class="btn ghost" id="re">승인됐는지 다시 확인</button><button class="btn ghost" id="out">로그아웃</button></div></div>`);
        app.querySelector("#re").onclick = async () => { await Auth.loadMember(); if (Auth.ok) { await sb.rpc("totori_touch_login"); await Auth.pull(); } renderAcct(); account(); };
        app.querySelector("#out").onclick = async () => { await sb.auth.signOut(); location.hash = "#home"; };
        return;
      }
      h(`<h1>내 정보</h1><div class="card"><div class="stat">${esc(Auth.nick())}</div><div class="muted">아이디 ${esc(m.username)}${Auth.admin ? " · 관리자" : ""}</div>
        <p>학습 기록이 이 계정에 저장돼요. 다른 기기에서 같은 아이디로 로그인하면 이어서 공부할 수 있어요.</p>
        <div class="muted" id="ast">${esc(Auth.status)}</div>
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="sync">지금 저장</button>${Auth.admin ? `<a class="btn" href="#admin">회원 승인 관리</a>` : ""}<button class="btn ghost" id="out">로그아웃</button></div></div>
        <div class="card"><b>비밀번호 바꾸기</b><input type="password" id="np" class="inp" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password"><button class="btn ghost" id="cp">변경</button><div id="amsg"></div></div>`);
      app.querySelector("#sync").onclick = async () => { await Auth.push(); app.querySelector("#ast").textContent = Auth.status; };
      app.querySelector("#out").onclick = async () => { await Auth.push(); await sb.auth.signOut(); location.hash = "#home"; };
      app.querySelector("#cp").onclick = async () => { const v = app.querySelector("#np").value; if (v.length < 6) return msgBox("6자 이상으로 써 주세요.", 1); const { error } = await sb.auth.updateUser({ password: v }); error ? msgBox(error.message, 1) : msgBox("비밀번호를 바꿨어요."); };
      return;
    }
    const signup = arg === "signup";
    h(`${arg === "gate" ? `<div class="card"><b>TOTORI</b> 는 승인된 회원만 이용할 수 있어요. 로그인하거나 가입 신청해 주세요.</div>` : ""}<h1>${signup ? "회원가입" : "로그인"}</h1>
      <div class="chips"><a class="chip ${!signup ? "on" : ""}" href="#account">로그인</a><a class="chip ${signup ? "on" : ""}" href="#account/signup">회원가입</a></div>
      <div class="card">
        <input id="uid" class="inp" placeholder="아이디 (영문 소문자·숫자 3~20자)" autocomplete="username" autocapitalize="off">
        ${signup ? `<input id="nick" class="inp" placeholder="닉네임 (화면에 보일 이름)">` : ""}
        <input id="pw" type="password" class="inp" placeholder="비밀번호 (6자 이상)" autocomplete="${signup ? "new-password" : "current-password"}">
        ${signup ? `<input id="pw2" type="password" class="inp" placeholder="비밀번호 확인" autocomplete="new-password">` : ""}
        <div class="row" style="margin-top:10px"><button class="btn" id="go">${signup ? "가입 신청" : "로그인"}</button></div>
        <div id="amsg"></div>
        <p class="muted">${signup ? "가입하면 관리자 승인 후 이용할 수 있어요." : "비밀번호를 잊었으면 관리자에게 문의해 주세요."} 이 기기에 있던 기록은 로그인하면 계정 기록과 합쳐져요.</p></div>`);
    const v = id => ((app.querySelector("#" + id) || {}).value || "");
    const run = async () => {
      const id = v("uid").trim().toLowerCase(), pw = v("pw");
      if (!ID_RE.test(id)) return msgBox("아이디는 영문 소문자·숫자·_ . - 로 3~20자예요.", 1);
      if (pw.length < 6) return msgBox("비밀번호는 6자 이상이에요.", 1);
      if (signup) {
        if (pw !== v("pw2")) return msgBox("비밀번호 확인이 달라요.", 1);
        const { data, error } = await sb.auth.signUp({ email: idToEmail(id), password: pw, options: { data: { username: id, nick: v("nick").trim() || id } } });
        if (error) return msgBox(/registered|already/i.test(error.message) ? "이미 있는 아이디예요." : error.message, 1);
        if (!data.session) return msgBox("서버 설정 확인이 필요해요 (이메일 확인 기능이 켜져 있어요). 관리자에게 알려 주세요.", 1);
        location.hash = "#account";
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: idToEmail(id), password: pw });
        if (error) return msgBox(/Invalid login/i.test(error.message) ? "아이디 또는 비밀번호가 맞지 않아요." : error.message, 1);
        location.hash = "#account";
      }
    };
    app.querySelector("#go").onclick = run;
    app.querySelectorAll(".inp").forEach(i => i.onkeydown = e => { if (e.key === "Enter") run(); });
  }

  // ---------- 관리자: 회원 승인 ----------
  const adm = { f: "pending" };
  async function admin() {
    if (!Auth.admin) { h(`<h1>관리자</h1><div class="card">관리자만 볼 수 있어요.</div>`); return; }
    h(`<h1>회원 승인 관리</h1><div class="card">불러오는 중…</div>`);
    const { data: ms, error } = await Auth.sb.from("totori_members").select("*").order("created_at", { ascending: false });
    if (error) { h(`<h1>회원 승인 관리</h1><div class="card">불러오지 못했어요: ${esc(error.message)}</div>`); return; }
    const { data: pr } = await Auth.sb.from("totori_progress").select("user_id,data,updated_at");
    const prog = {}; (pr || []).forEach(r => { const d = r.data || {}; prog[r.user_id] = { n: ["p5", "dl", "bq", "zq", "st"].reduce((a, k) => a + Object.keys(d[k] || {}).length, 0), at: r.updated_at }; });
    const ST = { pending: "승인 대기", approved: "승인됨", rejected: "거절" };
    const cnt = k => ms.filter(m => m.status === k).length;
    const list = ms.filter(m => adm.f === "all" || m.status === adm.f);
    h(`<h1>회원 승인 관리</h1>
      <div class="chips">${[["pending", "승인 대기"], ["approved", "승인됨"], ["rejected", "거절"], ["all", "전체"]].map(([k, l]) => `<button class="chip ${adm.f === k ? "on" : ""}" data-f="${k}">${l} ${k === "all" ? ms.length : cnt(k)}</button>`).join("")}</div>
      <div class="card">${list.map(m => `<div class="list-item"><div><b>${esc(m.nick || m.username)}</b> <span class="muted">@${esc(m.username)}</span> <span class="tag">${ST[m.status] || m.status}</span>${m.role === "admin" ? '<span class="tag">관리자</span>' : ""}
          <div class="muted">가입 ${esc(fmtT(m.created_at))} · 최근 로그인 ${esc(fmtT(m.last_login))} · 로그인 ${m.login_count || 0}회${prog[m.user_id] ? ` · 푼 문제 ${prog[m.user_id].n}개` : ""}</div></div>
          <div class="row">${m.role === "admin" ? "" : [["approved", "승인"], ["rejected", "거절"], ["pending", "대기로"]].filter(([k]) => k !== m.status).map(([k, l]) => `<button class="${k === "approved" ? "btn" : "chip"}" data-set="${m.user_id}|${k}">${l}</button>`).join("")}</div></div>`).join("") || "해당하는 회원이 없어요."}</div>`);
    app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { adm.f = b.dataset.f; admin(); });
    app.querySelectorAll("[data-set]").forEach(b => b.onclick = async () => {
      const [uid, st] = b.dataset.set.split("|");
      const { error } = await Auth.sb.from("totori_members").update({ status: st }).eq("user_id", uid);
      if (error) alert("바꾸지 못했어요: " + error.message); admin();
    });
  }
  const fmtT = iso => iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  // ---------- 왕초보 0단계 ----------
  const zc = { tab: "abc", cat: "" };
  function zero(arg) {
    if (arg && arg.startsWith("p")) {
      const l = ZERO.phonics.find(x => "p" + x.no === arg); if (!l) return zero();
      const prev = ZERO.phonics.find(x => x.no === l.no - 1), next = ZERO.phonics.find(x => x.no === l.no + 1);
      h(`<a class="muted" href="#zero">← 왕초보</a><h1>발음 ${l.no}. ${esc(l.title)}</h1><div class="card lesson">${l.body}</div>
        <h2>소리 내 보기</h2><div class="card">${l.words.map(x => `<div class="list-item"><div>${spk(x.w)}<b>${esc(x.w)}</b> <span class="muted">[${esc(x.pron)}]</span> ${esc(x.ko)}</div></div>`).join("")}</div>
        <div class="row"><button class="btn" id="zq">확인 문제 ${l.quiz.length}개</button>${prev ? `<a class="btn ghost" href="#zero/p${prev.no}">← ${prev.no}</a>` : ""}${next ? `<a class="btn ghost" href="#zero/p${next.no}">${next.no} →</a>` : `<a class="btn ghost" href="#basic">초보자반으로 →</a>`}</div>`);
      app.querySelector("#zq").onclick = () => quiz(l.quiz, "#zero/p" + l.no);
      return;
    }
    const tabs = [["abc", "알파벳"], ["ph", "발음 규칙"], ["w", "기초 단어"], ["ex", "인사·생활 문장"]];
    let body = "";
    if (zc.tab === "abc") body = `<p class="muted">글자를 누르면 이름과 예시 단어를 읽어줘요.</p><div class="grid">${ZERO.alphabet.map(a => `<button class="card abc" data-say="${esc(a.low + ". " + a.word)}" style="text-align:center;cursor:pointer;font:inherit;color:inherit">
        <div style="font-size:34px;font-weight:700">${esc(a.up)} ${esc(a.low)}</div><div>${esc(a.name)}</div><div class="muted">소리: ${esc(a.sound)}</div><div class="muted">${esc(a.word)} [${esc(a.wordPron)}] ${esc(a.wordKo)}</div></button>`).join("")}</div>`;
    else if (zc.tab === "ph") body = `<p class="muted">영어 글자가 어떤 소리가 나는지 규칙을 배워요. 1번부터 차례대로.</p><div class="card">${ZERO.phonics.map(l => {
        const r = l.quiz.map(q => S.zq[q.id]).filter(Boolean), ok = r.filter(x => x.last).length;
        return `<div class="list-item"><div><b>${l.no}</b> ${esc(l.title)}</div><div class="row"><span class="muted">${r.length ? `${ok}/${l.quiz.length}` : ""}</span><a class="btn ghost" href="#zero/p${l.no}">배우기</a></div></div>`; }).join("")}</div>`;
    else if (zc.tab === "w") {
      const cats = uniq(ZERO.words.map(x => x.cat)); if (!zc.cat) zc.cat = cats[0];
      body = `<div class="chips">${cats.map(c => `<button class="chip ${zc.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <div class="card">${ZERO.words.filter(x => x.cat === zc.cat).map(x => `<div class="list-item"><div>${spk(x.w)}<b>${esc(x.w)}</b> <span class="muted">[${esc(x.pron)}]</span> ${esc(x.ko)}</div>
          <button class="chip ${S.known[x.w] ? "on" : ""}" data-known="${esc(x.w)}">${S.known[x.w] ? "외움" : "외웠어요"}</button></div>`).join("")}</div>`;
    } else body = `<div class="card">${ZERO.phrases.map(x => `<div class="list-item"><div>${spk(x.en)}<b>${esc(x.en)}</b><div class="muted">[${esc(x.pron)}] ${esc(x.ko)} · ${esc(x.sit)}</div></div></div>`).join("")}</div>`;
    h(`<h1>왕초보 0단계</h1><p class="muted">영어를 처음 시작해도 괜찮아요. 알파벳 → 발음 규칙 → 기초 단어 → 인사 문장 순서로 하고, 다 하면 초보자반으로 넘어가요. 🔊 를 누르면 읽어줘요.</p>
      <div class="chips">${tabs.map(([v, l]) => `<button class="chip ${zc.tab === v ? "on" : ""}" data-tab="${v}">${l}</button>`).join("")}</div>${body}`);
    app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { zc.tab = b.dataset.tab; zero(); });
    app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { zc.cat = b.dataset.cat; zero(); });
    app.querySelectorAll("[data-known]").forEach(b => b.onclick = () => { const w = b.dataset.known; S.known[w] ? delete S.known[w] : S.known[w] = 1; save(); zero(); });
  }

  Auth.init();
  renderAcct();
  go();
})();
