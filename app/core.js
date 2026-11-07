/* ==========================================================================
   GATE Practice Hub - core: DOM helpers, storage, data loading, scoring,
   rendering of question HTML (images, math), modal and toast.
   Vanilla JS, no build step; works from file:// and from a local server.
   ========================================================================== */
(function () {
  "use strict";

  const GP = (window.GP = window.GP || {});

  /* ------------------------------------------------------------ DOM helpers */

  GP.$ = (sel, root = document) => root.querySelector(sel);
  GP.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "text") el.textContent = v;
        else if (k === "style" && typeof v === "object") {
          for (const sk of Object.keys(v)) {
            if (v[sk] == null) continue;
            if (sk.startsWith("--")) el.style.setProperty(sk, v[sk]); // custom properties need setProperty
            else el.style[sk] = v[sk];
          }
        }
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  GP.h = h;

  /** replaceChildren() that skips null/false (the DOM would print them as text). */
  GP.put = function (el, ...kids) {
    el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
    return el;
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  GP.icon = function icon(name) {
    const paths = ICONS[name] || ICONS.dot;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach((d) => {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  };
  const ICONS = {
    arrow: ["M5 12h14", "M13 6l6 6-6 6"],
    back: ["M19 12H5", "M11 18l-6-6 6-6"],
    star: ["M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"],
    clock: ["M12 7v5l3 2", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
    exam: ["M9 4h6", "M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M9 11l2 2 4-4", "M9 17h6"],
    practice: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z", "M9 7h7", "M9 11h5"],
    read: ["M2 6s3-2 10-2 10 2 10 2v14s-3-2-10-2S2 20 2 20z", "M12 4v16"],
    calc: ["M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M8 6h8v4H8z", "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01", "M16 18h.01"],
    pause: ["M8 5v14", "M16 5v14"],
    play: ["M7 4l13 8-13 8z"],
    grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v6", "M12 7.5h.01"],
    close: ["M6 6l12 12", "M18 6L6 18"],
    check: ["M5 12l5 5L20 7"],
    refresh: ["M3 12a9 9 0 0 1 15.5-6.3L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.5 6.3L3 16", "M3 21v-5h5"],
    print: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
    trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15"],
    shuffle: ["M16 3h5v5", "M4 20L21 3", "M21 16v5h-5", "M15 15l6 6", "M4 4l5 5"],
    flag: ["M4 22V4", "M4 4h13l-2 4 2 4H4"],
    dot: ["M12 12h.01"],
    fullscreen: ["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"],
  };

  /* ---------------------------------------------------------------- storage */

  const PREFIX = "gp.";
  GP.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (_e) {
        GP.toast("Browser storage is full - export and clear old attempts in Settings.");
        return false;
      }
    },
    del(key) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch (_e) {
        /* ignore */
      }
    },
    keys() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
        }
      } catch (_e) {
        /* ignore */
      }
      return out;
    },
  };

  const DEFAULT_SETTINGS = {
    theme: "dark",
    strict: true, // answers are kept only via Save & Next / Mark for Review & Next (real GATE behaviour)
    keypad: true, // on-screen keypad for NAT answers
    fontScale: 1,
    confirmSubmit: true,
    gateRule: true, // official GATE rule: MSQ and NAT never carry negative marks
    name: "Divya",
  };
  GP.settings = Object.assign({}, DEFAULT_SETTINGS, GP.store.get("settings", {}));
  if (!GP.settings.name || GP.settings.name === "Candidate") GP.settings.name = "Divya"; // older default
  GP.saveSettings = function (patch) {
    Object.assign(GP.settings, patch || {});
    GP.store.set("settings", GP.settings);
    document.documentElement.style.setProperty("--q-scale", GP.settings.fontScale || 1);
  };

  GP.applyTheme = function (name) {
    const theme = { dark: 1, bright: 1, green: 1 }[name] ? name : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    GP.$$("[data-theme-btn]").forEach((b) => b.classList.toggle("active", b.dataset.themeBtn === theme));
    if (GP.settings.theme !== theme) GP.saveSettings({ theme });
  };

  /* ------------------------------------------------------------- formatting */

  const nf = new Intl.NumberFormat("en-IN");
  GP.fmtInt = (n) => nf.format(n || 0);
  GP.fmtNum = function (n, d = 2) {
    if (n == null || !isFinite(n)) return "-";
    const r = Math.round(n * 10 ** d) / 10 ** d;
    return String(r);
  };
  GP.plural = (n, one, many) => `${GP.fmtInt(n)} ${n === 1 ? one : many || one + "s"}`;
  GP.fmtClock = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };
  GP.fmtDur = function (sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${hh}h ${mm}m` : `${hh}h`;
  };
  GP.fmtMins = (sec) => {
    const m = Math.round((sec || 0) / 60);
    return m >= 60 && m % 60 === 0 ? `${m / 60} hr` : `${m} min`;
  };
  GP.relTime = function (ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const m = Math.round(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const hr = Math.round(m / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.round(hr / 24);
    if (d === 1) return "yesterday";
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  GP.fmtDate = (ts) =>
    ts ? new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  GP.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  GP.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------------------------------------------------------------- library */

  const CATEGORY_LABELS = {
    all: "All types",
    mock: "Mock",
    "practice-mock": "Practice mock",
    subjectwise: "Subjectwise",
    "practice-subjectwise": "Practice subjectwise",
    "multi-subjectwise": "Multi-subject",
    topicwise: "Topicwise",
    "practice-topicwise": "Practice topicwise",
    aptitude: "Aptitude",
    advance: "Advance",
    basic: "Basic",
    demo: "Demo",
    "full-syllabus": "Full syllabus",
    "part-syllabus": "Part syllabus",
    other: "Other",
  };
  GP.CATEGORY_LABELS = CATEGORY_LABELS;
  GP.CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
  const BRANCH_HUES = { DA: 192, CS: 265, EC: 212, EE: 45, ME: 340, CE: 25 };
  GP.accentFor = (code) => `hsl(${BRANCH_HUES[code] ?? 210} 72% 60%)`;

  GP.lib = window.DVR_LIBRARY || null;
  GP.idx = { papers: new Map(), series: new Map(), branches: new Map(), list: [] };

  function buildIndex() {
    const lib = GP.lib;
    if (!lib) return;
    lib.branches.forEach((b) => {
      b.accent = GP.accentFor(b.code);
      GP.idx.branches.set(b.code, b);
      b.providers.forEach((p) => {
        p.branch = b;
        p.series.forEach((s) => {
          s.provider = p;
          s.branch = b;
          GP.idx.series.set(s.id, s);
          s.papers.forEach((paper, order) => {
            paper.series = s;
            paper.provider = p;
            paper.branch = b;
            paper.order = order;
            paper.hay = `${paper.title} ${b.name} ${b.code} ${p.name} ${s.name} ${(paper.secs || []).join(" ")} ${CATEGORY_LABELS[paper.category] || ""}`.toLowerCase();
            if (!paper.missing) {
              GP.idx.papers.set(paper.id, paper);
              GP.idx.list.push(paper);
            }
          });
        });
      });
    });
  }
  buildIndex();

  /* ------------------------------------------------------------ data loading */

  const scriptCache = new Map();
  GP.loadScript = function (src) {
    if (scriptCache.has(src)) return scriptCache.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
    scriptCache.set(src, p);
    p.catch(() => scriptCache.delete(src));
    return p;
  };
  GP.loadCSS = function (href) {
    if (scriptCache.has(href)) return scriptCache.get(href);
    const p = new Promise((resolve) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = () => resolve();
      l.onerror = () => resolve();
      document.head.appendChild(l);
    });
    scriptCache.set(href, p);
    return p;
  };

  const paperCache = new Map();
  GP.loadPaper = function (id) {
    if (paperCache.has(id)) return paperCache.get(id);
    const p = GP.loadScript(`data/papers/${encodeURIComponent(id)}.js`).then(() => {
      const raw = window.DVR_PAPERS && window.DVR_PAPERS[id];
      if (!raw) throw new Error("Paper data missing for " + id);
      window.DVR_PAPERS[id] = null;
      return preparePaper(raw);
    });
    paperCache.set(id, p);
    p.catch(() => paperCache.delete(id));
    return p;
  };

  function preparePaper(paper) {
    const countBased = paper.scoring !== "marks";
    paper.countBased = countBased;
    paper.questions.forEach((q, i) => {
      q.i = i;
      q.pid = paper.id;
      if (!q.marks || countBased) q.marks = q.marks && !countBased ? q.marks : { pos: 1, neg: 0 };
      q.hasKey = q.type === "NAT" ? Array.isArray(q.natRange) : Array.isArray(q.answer) && q.answer.length > 0;
    });
    if (!paper.sections || !paper.sections.length) {
      paper.sections = [{ name: "Questions", start: 0, count: paper.questions.length }];
    }
    paper.max = paper.questions.reduce((s, q) => s + (q.hasKey ? q.marks.pos : 0), 0);
    paper.meta = GP.idx.papers.get(paper.id) || null;
    return paper;
  }
  GP.preparePaper = preparePaper;

  const qindexCache = new Map();
  GP.loadQIndex = function (code) {
    if (qindexCache.has(code)) return qindexCache.get(code);
    const p = GP.loadScript(`data/qindex/${code}.js`).then(() => (window.DVR_QINDEX && window.DVR_QINDEX[code]) || []);
    qindexCache.set(code, p);
    p.catch(() => qindexCache.delete(code));
    return p;
  };

  /* ---------------------------------------------------------------- scoring */

  GP.parseNum = function (value) {
    if (value == null) return null;
    let s = String(value).trim().replace(/−/g, "-").replace(/,/g, "");
    if (s === "" || s === "-" || s === "." || s === "-.") return null;
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    const v = Number(s);
    return isFinite(v) ? v : null;
  };

  GP.isAttempted = function (q, resp) {
    if (resp == null) return false;
    if (q.type === "MSQ") return Array.isArray(resp) && resp.length > 0;
    if (q.type === "NAT") return String(resp).trim() !== "";
    return String(resp) !== "";
  };

  /**
   * Evaluate one response.
   *  MCQ  correct when the chosen option is a key option (+pos), otherwise -neg.
   *  MSQ  all and only the key options (+pos), otherwise -neg (0 in GATE; no partial credit).
   *  NAT  value inside the inclusive key range (+pos), otherwise -neg.
   * Questions without an answer key are reported as "nokey" and never scored.
   */
  /**
   * Effective penalty of a question (GATE rule: none for MSQ / NAT).
   * rules: optional {gateRule} captured when an attempt was submitted, so a
   * result is always re-scored the way it was scored originally.
   */
  GP.negOf = (q, rules) => {
    const gateRule = rules && rules.gateRule != null ? rules.gateRule : GP.settings.gateRule;
    return q.marks ? (gateRule && q.type !== "MCQ" ? 0 : q.marks.neg || 0) : 0;
  };
  GP.currentRules = () => ({ gateRule: !!GP.settings.gateRule });

  GP.evaluate = function (q, resp, rules) {
    const attempted = GP.isAttempted(q, resp);
    const pos = q.marks ? q.marks.pos : 1;
    const neg = GP.negOf(q, rules);
    if (!q.hasKey) return { status: attempted ? "nokey" : "skipped", marks: 0, attempted, pos, neg };
    if (!attempted) return { status: "skipped", marks: 0, attempted, pos, neg };
    let correct = false;
    if (q.type === "MCQ") {
      correct = q.answer.includes(String(resp));
    } else if (q.type === "MSQ") {
      const a = new Set(q.answer);
      const r = new Set(resp);
      correct = a.size === r.size && [...a].every((k) => r.has(k));
    } else {
      const v = GP.parseNum(resp);
      if (v != null) {
        const [lo, hi] = q.natRange;
        // float-noise tolerance only (a relative 1e-9 would accept +-1,000,000 on a 16-digit key)
        const eps = Math.max(1e-9, 8 * Number.EPSILON * Math.max(Math.abs(lo), Math.abs(hi)));
        correct = v >= lo - eps && v <= hi + eps;
      }
    }
    return { status: correct ? "correct" : "wrong", marks: correct ? pos : -neg, attempted, pos, neg };
  };

  GP.answerLabel = function (q) {
    if (!q.hasKey) return q.answerText ? `${q.answerText} (not auto-graded)` : "Not available";
    if (q.type === "NAT") {
      const [lo, hi] = q.natRange;
      return lo === hi ? GP.fmtNum(lo, 6) : `${GP.fmtNum(lo, 6)} to ${GP.fmtNum(hi, 6)}`;
    }
    return q.answer.join(", ");
  };
  GP.respLabel = function (q, resp) {
    if (!GP.isAttempted(q, resp)) return "Not attempted";
    if (q.type === "MSQ") return [...resp].sort().join(", ");
    return String(resp);
  };

  /** Score a whole response set. questions: array; resp: {index: answer}. */
  GP.scoreAll = function (questions, resp, opts = {}) {
    const res = {
      score: 0, max: 0, pos: 0, neg: 0, correct: 0, wrong: 0, skipped: 0, nokey: 0, attempted: 0,
      total: questions.length, per: [], bySection: {}, byType: {},
    };
    questions.forEach((q, i) => {
      const r = GP.evaluate(q, resp ? resp[i] : undefined, opts.rules);
      res.per.push(r);
      const secName = (opts.sectionOf && opts.sectionOf(q, i)) || q.section || "Questions";
      const sec = (res.bySection[secName] = res.bySection[secName] || { total: 0, correct: 0, wrong: 0, skipped: 0, nokey: 0, score: 0, max: 0, attempted: 0 });
      const ty = (res.byType[q.type] = res.byType[q.type] || { total: 0, correct: 0, wrong: 0, skipped: 0, nokey: 0, score: 0, max: 0, attempted: 0 });
      [res, sec, ty].forEach((bucket) => {
        if (bucket !== res) bucket.total += 1;
        if (q.hasKey) bucket.max += r.pos;
        bucket.score += r.marks;
        if (r.attempted) bucket.attempted += 1;
        if (r.status === "correct") bucket.correct += 1;
        else if (r.status === "wrong") bucket.wrong += 1;
        else if (r.status === "nokey") bucket.nokey += 1;
        else bucket.skipped += 1;
      });
      if (r.marks > 0) res.pos += r.marks;
      if (r.marks < 0) res.neg += -r.marks;
    });
    const round = (x) => Math.round(x * 100) / 100;
    res.score = round(res.score);
    res.pos = round(res.pos);
    res.neg = round(res.neg);
    res.max = round(res.max);
    Object.values(res.bySection).concat(Object.values(res.byType)).forEach((b) => {
      b.score = round(b.score);
      b.max = round(b.max);
    });
    const graded = res.correct + res.wrong;
    res.accuracy = graded ? (res.correct / graded) * 100 : 0;
    res.pct = res.max > 0 ? Math.max(0, (res.score / res.max) * 100) : 0;
    return res;
  };

  GP.scoreTone = (pct) => (pct >= 60 ? "score-good" : pct >= 35 ? "score-mid" : "score-low");

  /** "MCQ 38 · MSQ 6 · NAT 21" in a fixed order. */
  GP.typesText = (types, sep = " · ") =>
    ["MCQ", "MSQ", "NAT"].filter((t) => types && types[t]).map((t) => `${t} ${types[t]}`).join(sep);

  /* --------------------------------------------------------- attempts & stats */

  GP.attempts = {
    _list: null,
    // parsed once and shared; paper cards and sorts call this many times per render
    list() {
      if (!this._list) this._list = GP.store.get("attempts", []);
      return this._list;
    },
    invalidate() {
      this._list = null;
    },
    get(id) {
      return GP.store.get("att." + id, null);
    },
    forPaper(pid) {
      return this.list().filter((a) => a.paperId === pid);
    },
    best(pid) {
      const list = this.forPaper(pid);
      if (!list.length) return null;
      return list.reduce((b, a) => (a.pct > b.pct ? a : b));
    },
    latest(pid) {
      const list = this.forPaper(pid);
      return list.length ? list[list.length - 1] : null;
    },
    /** Returns the summary, or null when the browser storage refused the write. */
    save(att) {
      const list = this.list().slice();
      const summary = {
        id: att.id, kind: att.kind, paperId: att.paperId || null, title: att.title, code: att.code || null,
        mode: att.mode, startedAt: att.startedAt, submittedAt: att.submittedAt, timeUsedSec: att.timeUsedSec,
        score: att.summary.score, max: att.summary.max, pct: att.summary.pct, correct: att.summary.correct,
        wrong: att.summary.wrong, skipped: att.summary.skipped, total: att.summary.total, countBased: !!att.countBased,
      };
      list.push(summary);
      // detail first, then the list - a list entry must never point at a missing attempt
      if (!GP.store.set("att." + att.id, att)) return null;
      if (!GP.store.set("attempts", list)) {
        GP.store.del("att." + att.id);
        return null;
      }
      this._list = list;
      return summary;
    },
    remove(id) {
      const list = this.list().filter((a) => a.id !== id);
      GP.store.set("attempts", list);
      GP.store.del("att." + id);
      this._list = list;
    },
  };

  /** Per-question history used by the mistakes notebook and the question bank. */
  GP.qstat = {
    all() {
      if (!this._cache) this._cache = GP.store.get("qstat", {});
      return this._cache;
    },
    get(pid, qi) {
      return this.all()[pid + ":" + qi] || null;
    },
    record(pid, qi, status) {
      if (!pid || status === "skipped") return;
      const all = this.all();
      const key = pid + ":" + qi;
      const cur = all[key] || { c: 0, w: 0 };
      if (status === "correct") cur.c += 1;
      if (status === "wrong") cur.w += 1;
      // an ungraded attempt says nothing about right or wrong: keep the last verdict
      if (status === "correct" || status === "wrong") cur.r = status === "correct" ? "c" : "w";
      else if (!cur.r) cur.r = "n";
      cur.t = Date.now();
      all[key] = cur;
    },
    /** Undo one earlier record() (used when a self-grade is changed). */
    unrecord(pid, qi, status) {
      const cur = this.all()[pid + ":" + qi];
      if (!cur) return;
      if (status === "correct" && cur.c > 0) cur.c -= 1;
      if (status === "wrong" && cur.w > 0) cur.w -= 1;
    },
    flush() {
      if (this._cache) GP.store.set("qstat", this._cache);
    },
    clearMistake(pid, qi) {
      const all = this.all();
      const cur = all[pid + ":" + qi];
      if (cur) {
        cur.r = "c";
        cur.cleared = Date.now();
        this.flush();
      }
    },
  };

  GP.bookmarks = {
    all() {
      return GP.store.get("bm", {});
    },
    has(pid, qi) {
      return !!this.all()[pid + ":" + qi];
    },
    toggle(pid, qi, info) {
      const all = this.all();
      const key = pid + ":" + qi;
      if (all[key]) delete all[key];
      else all[key] = Object.assign({ t: Date.now() }, info || {});
      GP.store.set("bm", all);
      return !!all[key];
    },
  };

  GP.saved = {
    all() {
      return GP.store.get("saved", []);
    },
    has(pid) {
      return this.all().includes(pid);
    },
    toggle(pid) {
      const list = this.all();
      const i = list.indexOf(pid);
      if (i >= 0) list.splice(i, 1);
      else list.push(pid);
      GP.store.set("saved", list);
      return i < 0;
    },
  };

  GP.runs = {
    examKey: (pid) => "run." + pid,
    pracKey: (pid) => "prac." + pid,
    exam(pid) {
      return GP.store.get(this.examKey(pid), null);
    },
    practice(pid) {
      return GP.store.get(this.pracKey(pid), null);
    },
  };

  /* -------------------------------------------------------- render question */

  // MathJax 3 (tex-svg-full, bundled offline) configured like the source site.
  let mathPromise = null;
  let mathQueue = Promise.resolve();
  GP.ensureMath = function () {
    if (!mathPromise) {
      window.MathJax = {
        loader: { load: [] },
        tex: {
          // the source site's set plus color / cancel / verb, which GATE Overflow content uses
          // (\color, \cancel, \verb were shown as red errors). textmacros is left out on
          // purpose: it turns "_" inside \text{...} into errors.
          packages: ["base", "ams", "newcommand", "noundefined", "configmacros", "boldsymbol", "color", "cancel", "verb"],
          inlineMath: [["$", "$"], ["\\(", "\\)"]],
          displayMath: [["$$", "$$"], ["\\[", "\\]"]],
          processEscapes: true,
          processEnvironments: true,
        },
        options: {
          skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "annotation", "annotation-xml"],
          ignoreHtmlClass: "no-math",
        },
        svg: { fontCache: "global", scale: 1 },
        startup: { typeset: false },
      };
      mathPromise = GP.loadScript("app/vendor/mathjax/tex-svg-full.js").then(() =>
        window.MathJax && window.MathJax.startup ? window.MathJax.startup.promise : null
      );
      mathPromise.catch(() => (mathPromise = null));
    }
    return mathPromise;
  };

  // Elements are collected and typeset in one MathJax pass per tick
  // (a question with 4 options used to cost 5 separate passes).
  const pendingMath = new Set();
  let mathFlush = 0;
  GP.typeset = function (el) {
    pendingMath.add(el);
    if (!mathFlush) {
      mathFlush = setTimeout(() => {
        mathFlush = 0;
        const els = [...pendingMath];
        pendingMath.clear();
        mathQueue = mathQueue
          .then(() => GP.ensureMath())
          .then(() => {
            const live = els.filter((e) => e.isConnected);
            if (!live.length || !window.MathJax || !window.MathJax.typesetPromise) return null;
            return window.MathJax.typesetPromise(live);
          })
          .catch(() => null);
      }, 0);
    }
    return mathQueue;
  };

  /** Resolves when every formula queued so far has been typeset. */
  GP.mathIdle = () => new Promise((r) => setTimeout(r, 5)).then(() => mathQueue);

  /** Forget typeset math inside root before it is thrown away (MathJax keeps references). */
  GP.clearMath = function (root) {
    try {
      if (root && window.MathJax && window.MathJax.typesetClear) window.MathJax.typesetClear([root]);
    } catch (_e) {
      /* ignore */
    }
  };

  function fixImages(root) {
    root.querySelectorAll("img").forEach((img) => {
      img.loading = "lazy";
      img.decoding = "async";
      // width/height attributes are the intended display size (many files are 2-3x larger);
      // CSS max-width:100% + height:auto keeps them responsive

      img.addEventListener(
        "error",
        () => {
          const span = document.createElement("span");
          span.className = "img-missing";
          span.textContent = "image unavailable";
          img.replaceWith(span);
        },
        { once: true }
      );
    });
    root.querySelectorAll("a[href]").forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }

  /** Inject trusted paper HTML into el, then fix images and typeset math. */
  GP.setHTML = function (el, html, math) {
    el.innerHTML = html || "";
    fixImages(el);
    if (math) GP.typeset(el);
    return el;
  };
  GP.qhtml = function (html, math, cls) {
    return GP.setHTML(h("div", { class: "qhtml" + (cls ? " " + cls : "") }), html, math);
  };

  // <template> content is inert: images inside are not downloaded just to read text
  const textTpl = document.createElement("template");
  GP.stripText = function (html) {
    textTpl.innerHTML = html || "";
    const t = (textTpl.content.textContent || "").replace(/\s+/g, " ").trim();
    textTpl.innerHTML = "";
    return t;
  };

  /* --------------------------------------------------------- modal & toast */

  let toastTimer = 0;
  GP.toast = function (msg, ms = 2600) {
    const t = GP.$("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  };

  /**
   * Open a modal. actions: [{label, cls, value}] -> resolves with the clicked
   * action's value (or null when dismissed).
   */
  GP.modal = function ({ title, body, actions = [{ label: "Close", value: null }], dismissable = true, wide = false }) {
    return new Promise((resolve) => {
      const root = GP.$("#modal-root");
      const close = (value) => {
        back.remove();
        document.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape" && dismissable) {
          e.stopPropagation();
          close(null);
        }
      };
      const foot = h(
        "div",
        { class: "modal-foot" },
        actions.map((a) => h("button", { class: "btn " + (a.cls || ""), type: "button", onclick: () => close(a.value) }, a.label))
      );
      const modal = h(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true", style: wide ? { width: "min(940px, 100%)" } : null },
        h("div", { class: "modal-head" }, h("h3", null, title || ""),
          dismissable ? h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: () => close(null) }, GP.icon("close")) : null),
        h("div", { class: "modal-body" }, body instanceof Node ? body : h("p", null, String(body || ""))),
        foot
      );
      const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back && dismissable) close(null); } }, modal);
      back._close = close; // lets GP.closeModals() resolve the promise and drop the key listener
      root.appendChild(back);
      document.addEventListener("keydown", onKey, true);
      const primary = foot.querySelector(".btn-primary") || foot.querySelector(".btn");
      if (primary) primary.focus();
    });
  };
  /** Close every open modal properly (resolves with null, removes listeners). */
  GP.closeModals = function () {
    GP.$$(".modal-back").forEach((b) => (b._close ? b._close(null) : b.remove()));
  };
  GP.confirm = (title, text, okLabel = "OK", cls = "btn-primary") =>
    GP.modal({ title, body: text, actions: [{ label: "Cancel", value: false }, { label: okLabel, cls, value: true }] }).then((v) => !!v);

  /* --------------------------------------------------------------- helpers */

  GP.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  GP.download = function (filename, text, type = "application/json") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /** Build a virtual paper from [pid, qi] refs (question bank, mistakes, bookmarks). */
  GP.buildVirtualPaper = async function (refs, meta) {
    const pids = [...new Set(refs.map((r) => r[0]))];
    const papers = new Map();
    await Promise.all(pids.map((pid) => GP.loadPaper(pid).then((p) => papers.set(pid, p)).catch(() => null)));
    const questions = [];
    const keptRefs = [];
    refs.forEach(([pid, qi]) => {
      const p = papers.get(pid);
      if (!p || !p.questions[qi]) {
        // keep a placeholder: saved answers are keyed by position, so nothing may shift
        questions.push({
          type: "MCQ", html: "<p><i>This question is no longer available in the library.</i></p>", options: [],
          answer: [], natRange: null, marks: { pos: 0, neg: 0 }, hasKey: false, solution: "", section: "Unavailable",
          ref: [pid, qi], srcTitle: (GP.idx.papers.get(pid) || {}).title || pid, srcMath: false, missing: true,
        });
        keptRefs.push([pid, qi]);
        return;
      }
      const src = p.questions[qi];
      const q = Object.assign({}, src, { ref: [pid, qi], srcTitle: p.title, srcMath: !!p.math });
      if (p.countBased) q.marks = { pos: 1, neg: 0 };
      questions.push(q);
      keptRefs.push([pid, qi]);
    });
    questions.forEach((q, i) => (q.i = i));
    const anyMath = questions.some((q) => q.srcMath);
    const total = questions.reduce((s, q) => s + (q.hasKey ? q.marks.pos : 0), 0);
    return {
      id: meta.id || "custom-" + GP.uid(),
      virtual: true,
      title: meta.title || "Custom practice set",
      branch: meta.branch || "",
      code: meta.code || "",
      provider: "",
      series: meta.subtitle || "Question bank",
      durationSec: meta.durationSec || Math.max(10 * 60, questions.length * 3 * 60),
      math: anyMath,
      countBased: false,
      sections: [{ name: meta.sectionName || "Questions", start: 0, count: questions.length }],
      questions,
      refs: keptRefs,
      max: total,
    };
  };
})();
