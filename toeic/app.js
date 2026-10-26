(() => {
  const P5 = window.P5 || [], P6 = window.P6 || [], P7 = window.P7 || [];
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
  const S = Object.assign({ p5: {}, p6: {}, p7: {}, known: {}, wrong: [], log: {}, plan: {} },
    JSON.parse(localStorage.getItem(KEY) || "{}"));
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
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
  const routes = { home, p5, p6, p7, vocab, grammar, wrong, guide, res };
  function go() {
    const [r, arg] = (location.hash.slice(1) || "home").split("/");
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.r === r));
    (routes[r] || home)(arg ? decodeURIComponent(arg) : undefined);
  }
  window.addEventListener("hashchange", go);

  // ---------- 홈 ----------
  function home() {
    const p5n = Object.keys(S.p5).length, p5ok = Object.values(S.p5).filter(r => r.last).length;
    const known = Object.keys(S.known).length;
    const days = Object.keys(S.log).length;
    let html = `<h1>토익 700~800 학습판</h1>
    <div class="grid">
      <div class="card"><div class="muted">Part 5 푼 문제</div><div class="stat">${p5n} / ${P5.length}</div><div class="muted">최근 정답률 ${pct(p5ok, p5n)}%</div></div>
      <div class="card"><div class="muted">외운 단어</div><div class="stat">${known} / ${VOCAB.length}</div><div class="bar"><i style="width:${pct(known, VOCAB.length)}%"></i></div></div>
      <div class="card"><div class="muted">오답노트</div><div class="stat">${S.wrong.length}</div><div class="muted">다시 풀면 맞힌 건 빠져요</div></div>
      <div class="card"><div class="muted">오늘 푼 문제</div><div class="stat">${S.log[today()] || 0}</div><div class="muted">공부한 날 ${days}일</div></div>
    </div>
    <h2>바로 시작</h2>
    <div class="row">
      <a class="btn" href="#p5">Part 5 문제 풀기</a>
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
        record("p5", q.id, ok);
        if (ok) { right++; removeWrong("p5:" + q.id); } else missed.push(q);
        glossOpts(".opt", q);
        app.querySelector("#after").innerHTML = `<div class="exp"><b>${ok ? "정답" : "오답 — 정답 (" + L[q.answer] + ")"}</b><br>${esc(q.explain)}</div>${koBox(q)}
          <div class="row" style="margin-top:8px">${spk(q.q.replace("-------", q.choices[q.answer]), "▶ 문장 듣기")}</div>
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
      if (kind === "p5") { const q = P5.find(x => x.id === id); return q && { k, kind, q, label: q.q }; }
      const [sid, n] = [id.slice(0, id.lastIndexOf("-")), +id.slice(id.lastIndexOf("-") + 1)];
      const s = (kind === "p6" ? P6 : P7).find(x => x.id === sid);
      return s && s.questions[n] && { k, kind, s, n, label: `${s.title} — ${s.questions[n].q || "(" + (n + 1) + ")번 빈칸"}` };
    }).filter(Boolean);
    const p5w = items.filter(x => x.kind === "p5");
    h(`<h1>오답노트</h1><p class="muted">틀린 문제가 자동으로 쌓이고, 다시 풀어 맞히면 빠져요.</p>
      ${p5w.length ? `<button class="btn" id="redo">Part 5 오답 ${p5w.length}개 다시 풀기</button>` : ""}
      <div style="margin-top:12px">${items.length ? items.map(x => {
        const q = x.q || x.s.questions[x.n];
        return `<div class="card"><details><summary><span class="tag">${x.kind.toUpperCase()}</span>${blanks(x.label)}</summary>
          <div style="margin-top:10px">${review(q)}</div></details>
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

  go();
})();
