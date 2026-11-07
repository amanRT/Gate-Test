/* ==========================================================================
   GATE Practice Hub - library pages, paper page, search, question bank,
   bookmarks, mistakes notebook, stats, settings.
   ========================================================================== */
(function () {
  "use strict";
  const GP = window.GP;
  const { h } = GP;
  GP.views = GP.views || {};

  /* --------------------------------------------------------------- helpers */

  function paperStatus(p) {
    const run = GP.runs.exam(p.id);
    const best = GP.attempts.best(p.id);
    return { run, best, latest: GP.attempts.latest(p.id) };
  }

  function progressBlock(done, total, label) {
    return h("div", { class: "progress" },
      h("div", { class: "progress-track" }, h("span", { class: "progress-fill", style: { width: (total ? Math.round((done / total) * 100) : 0) + "%" } })),
      h("p", { class: "progress-text" }, done ? `${done} of ${total} ${label || "attempted"}` : `${GP.fmtInt(total)} papers waiting`));
  }

  function attemptedSet() {
    const s = new Set();
    GP.attempts.list().forEach((a) => a.paperId && s.add(a.paperId));
    return s;
  }

  function highlight(text, tokens) {
    if (!tokens.length) return text;
    const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(h("mark", { class: "hl" }, m[0]));
      last = m.index + m[0].length;
      if (!m[0].length) re.lastIndex++;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function starPaper(p) {
    const b = h("button", { class: "star-btn" + (GP.saved.has(p.id) ? " on" : ""), type: "button", title: "Save paper", "aria-label": "Save paper" }, GP.icon("star"));
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = GP.saved.toggle(p.id);
      b.classList.toggle("on", on);
      GP.toast(on ? "Saved to your list" : "Removed from saved");
    });
    return b;
  }

  function paperCard(p, opts = {}) {
    const { run, best } = paperStatus(p);
    const accent = p.branch.accent;
    const tokens = opts.tokens || [];
    const card = h("a", { class: "pcard", href: `#/p/${p.id}`, style: { "--card-accent": accent } },
      h("div", { class: "top" },
        h("span", { class: "num" }, "#" + p.num),
        h("span", { class: "tag" }, GP.CATEGORY_LABELS[p.category] || "Other"),
        p.year ? h("span", { class: "tag tag-accent" }, p.year) : null,
        run ? h("span", { class: "tag tag-warn" }, "In progress") : null),
      h("div", { class: "name" }, highlight(p.title, tokens)),
      opts.crumb ? h("div", { class: "crumb" }, `${p.branch.code} · ${p.provider.name} · ${p.series.name}`) : null,
      h("div", { class: "facts" },
        h("span", null, `${p.q} Q`),
        h("span", null, GP.fmtMins(p.dur)),
        p.max != null ? h("span", null, `${GP.fmtNum(p.max)} marks`) : h("span", null, "count-scored"),
        p.types ? h("span", { class: "faint" }, GP.typesText(p.types)) : null),
      h("div", { class: "foot" },
        h("span", { class: "start-pill" }, run ? "Resume" : best ? "Reattempt" : "Start", GP.icon("arrow")),
        best ? h("span", { class: "score-pill " + GP.scoreTone(best.pct) }, `Best ${Math.round(best.pct)}%`) : null),
      starPaper(p));
    return card;
  }
  GP.paperCard = paperCard;

  function emptyBox(title, text, action) {
    return h("div", { class: "empty" }, h("strong", null, title), h("span", null, text), action ? h("div", { style: { marginTop: "12px" } }, action) : null);
  }

  /* ------------------------------------------------------------------ home */

  GP.views.home = function () {
    const lib = GP.lib;
    const page = h("div", { class: "page" });
    const attempts = GP.attempts.list();
    const done = attemptedSet();

    const runs = GP.store.keys().filter((k) => k.startsWith("run.")).map((k) => [k, GP.store.get(k, null)]).filter((x) => x[1]);
    const last = runs.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0))[0];
    const resumeBtn = last
      ? h("a", { class: "btn", href: last[0] === "run.custom" ? "#/custom/exam?resume=1" : `#/exam/${last[0].slice(4)}` }, GP.icon("play"), "Resume unfinished test")
      : null;

    page.appendChild(h("section", { class: "card hero" },
      h("div", null,
        h("p", { class: "eyebrow" }, "Made for Divya · offline · all branches"),
        h("h1", null, "Divya's ", h("span", null, "GATE Prep")),
        h("p", { class: "subtitle" },
          `${GP.fmtInt(lib.paperCount)} test papers and ${GP.fmtInt(lib.questionCount)} questions with answer keys and solutions. ` +
          "Real CBT exam simulation (palette, timer, calculator, mark-for-review), instant-check practice, detailed analysis and a mistakes notebook."),
        h("div", { class: "hero-actions" },
          h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => GP.$("#branches").scrollIntoView({ behavior: "smooth" }) }, "Browse branches", GP.icon("arrow")),
          resumeBtn,
          h("a", { class: "btn btn-lg", href: "#/bank" }, GP.icon("shuffle"), "Question bank"))),
      h("div", { class: "stats" },
        h("div", { class: "stat" }, h("b", null, String(lib.branches.length)), h("span", null, "Branches")),
        h("div", { class: "stat" }, h("b", null, GP.fmtInt(lib.paperCount)), h("span", null, "Papers")),
        h("div", { class: "stat" }, h("b", null, GP.fmtInt(lib.questionCount)), h("span", null, "Questions")),
        h("div", { class: "stat stat-you" }, h("b", null, GP.fmtInt(attempts.length)), h("span", null, "Tests you submitted")))));

    // activity
    const saved = GP.saved.all().map((id) => GP.idx.papers.get(id)).filter(Boolean);
    if (attempts.length || runs.length || saved.length) {
      const scored = attempts.filter((a) => a.max > 0 || a.countBased);
      const avg = scored.length ? scored.reduce((s, a) => s + a.pct, 0) / scored.length : null;
      const best = scored.reduce((b, a) => (!b || a.pct > b.pct ? a : b), null);
      const qs = GP.qstat.all();
      let c = 0;
      let w = 0;
      Object.values(qs).forEach((v) => {
        c += v.c || 0;
        w += v.w || 0;
      });
      const tabsDef = [
        ["recent", "Recent results", attempts.length],
        ["progress", "In progress", runs.length],
        ["saved", "Saved papers", saved.length],
      ];
      let tab = GP.store.get("ui.homeTab", attempts.length ? "recent" : runs.length ? "progress" : "saved");
      const tabsEl = h("div", { class: "tabs", role: "tablist" });
      const listEl = h("div", { class: "mini-list" });
      const draw = () => {
        tabsEl.replaceChildren(...tabsDef.map(([k, label, n]) => h("button", { class: "tab" + (tab === k ? " active" : ""), type: "button", onclick: () => { tab = k; GP.store.set("ui.homeTab", k); draw(); } }, label, h("span", { class: "n" }, String(n)))));
        let items = [];
        if (tab === "recent") {
          items = attempts.slice(-12).reverse().map((a) =>
            h("a", { class: "mini", href: `#/result/${a.id}` },
              h("span", { class: "t" }, a.title),
              h("span", { class: "m" },
                h("span", { class: "score-pill " + GP.scoreTone(a.pct) }, a.countBased ? `${a.correct}/${a.total} correct` : `${GP.fmtNum(a.score)}/${GP.fmtNum(a.max)} · ${Math.round(a.pct)}%`),
                h("span", null, GP.relTime(a.submittedAt)), a.code ? h("span", null, a.code) : null)));
        } else if (tab === "progress") {
          items = runs.map(([k, s]) => {
            const pid = k.slice(4);
            const p = GP.idx.papers.get(pid);
            const title = k === "run.custom" ? (s.meta && s.meta.title) || "Custom test" : p ? p.title : pid;
            const answered = Object.keys(s.ans || {}).length;
            return h("a", { class: "mini", href: k === "run.custom" ? "#/custom/exam?resume=1" : `#/exam/${pid}` },
              h("span", { class: "t" }, title),
              h("span", { class: "m" }, h("span", { class: "tag tag-warn" }, "Resume"), h("span", null, `${GP.fmtClock(s.remaining)} left · ${answered} answered`), h("span", null, GP.relTime(s.savedAt))));
          });
        } else {
          items = saved.map((p) => paperCard(p, { crumb: true }));
        }
        listEl.className = tab === "saved" ? "papers" : "mini-list";
        listEl.replaceChildren(...(items.length ? items : [emptyBox("Nothing here yet", tab === "saved" ? "Tap the star on any paper to keep it here." : "Start a paper and it will show up here.")]));
      };
      draw();
      page.appendChild(h("section", { class: "section card pad" },
        h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Your progress"), h("h2", null, "Pick up where you left off")), h("a", { class: "btn btn-sm", href: "#/stats" }, "Full stats")),
        h("div", { class: "kpi-row" },
          GP.kpi("Tests submitted", GP.fmtInt(attempts.length), "accent"),
          GP.kpi("Papers attempted", GP.fmtInt(done.size), ""),
          GP.kpi("Average score", avg == null ? "-" : Math.round(avg) + "%", ""),
          GP.kpi("Best score", best ? Math.round(best.pct) + "%" : "-", "good"),
          GP.kpi("Questions checked", GP.fmtInt(c + w), "violet"),
          GP.kpi("Accuracy", c + w ? Math.round((c / (c + w)) * 100) + "%" : "-", "warn")),
        tabsEl, listEl));
    }

    // branches
    const grid = h("div", { class: "grid-cards" });
    lib.branches.forEach((b) => {
      const total = b.paperCount;
      let opened = 0;
      b.providers.forEach((p) => p.series.forEach((s) => s.papers.forEach((x) => done.has(x.id) && opened++)));
      grid.appendChild(h("a", { class: "bcard", href: `#/b/${b.code}`, style: { "--card-accent": b.accent } },
        h("div", { class: "card-head" }, h("span", { class: "code-badge" }, b.code), h("h3", null, b.name)),
        h("p", { class: "meta" }, `${GP.plural(b.providers.length, "provider")} · ${GP.plural(total, "paper")} · ${GP.fmtInt(b.questionCount)} questions`),
        progressBlock(opened, total)));
    });
    page.appendChild(h("section", { class: "section", id: "branches" },
      h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Step 1"), h("h2", null, "Select your branch"))),
      grid));
    page.appendChild(h("p", { class: "faint", style: { marginTop: "26px", fontSize: "12.5px", textAlign: "center" } },
      `Library snapshot of ${lib.source} · built ${lib.generatedAt.replace("T", " ")} · for personal practice.`));
    return page;
  };

  /* ---------------------------------------------------------------- branch */

  GP.views.branch = function ({ code }) {
    const b = GP.idx.branches.get(code);
    if (!b) return h("div", { class: "page" }, emptyBox("Branch not found", "", h("a", { class: "btn", href: "#/" }, "Library")));
    const done = attemptedSet();
    const page = h("div", { class: "page" },
      h("nav", { class: "crumbs" }, h("a", { href: "#/" }, "Library"), h("span", { class: "sep" }, "/"), h("span", null, b.name)),
      h("section", { class: "card pad", style: { "--card-accent": b.accent } },
        h("div", { class: "card-head" }, h("span", { class: "code-badge", style: { "--card-accent": b.accent } }, b.code), h("h1", { style: { fontSize: "clamp(20px,2.6vw,28px)" } }, b.name)),
        h("p", { class: "muted", style: { marginTop: "8px" } }, `${GP.plural(b.providers.length, "provider")} · ${GP.plural(b.paperCount, "paper")} · ${GP.fmtInt(b.questionCount)} questions`),
        h("div", { class: "row", style: { marginTop: "14px" } },
          h("a", { class: "btn btn-sm", href: `#/bank?b=${b.code}` }, GP.icon("shuffle"), "Build a custom test from this branch"))));
    b.providers.forEach((p) => {
      const grid = h("div", { class: "grid-cards" });
      p.series.forEach((s) => {
        let opened = 0;
        s.papers.forEach((x) => done.has(x.id) && opened++);
        const years = s.years.length >= 2 ? `${s.years[0]}-${s.years[s.years.length - 1]}` : s.years[0] || "Batch";
        grid.appendChild(h("a", { class: "bcard", href: `#/s/${s.id}`, style: { "--card-accent": b.accent } },
          h("div", { class: "card-head" }, h("span", { class: "code-badge" }, years)),
          h("h3", null, s.name),
          h("p", { class: "meta" }, `${GP.plural(s.paperCount, "paper")} · ${GP.fmtInt(s.questionCount)} questions`),
          progressBlock(opened, s.paperCount)));
      });
      page.appendChild(h("section", { class: "provider-block" },
        h("h3", null, p.name, h("span", { class: "tag" }, `${GP.plural(p.paperCount, "paper")}`)), grid));
    });
    return page;
  };

  /* ---------------------------------------------------------------- series */

  GP.views.series = function ({ id }) {
    const s = GP.idx.series.get(id);
    if (!s) return h("div", { class: "page" }, emptyBox("Series not found", "", h("a", { class: "btn", href: "#/" }, "Library")));
    const b = s.branch;
    const ui = GP.store.get("ui.series." + id, { cat: "all", year: "all", sort: "default", q: "", hide: false });
    const papers = s.papers.filter((p) => !p.missing);
    const cats = new Map([["all", papers.length]]);
    const years = new Map();
    papers.forEach((p) => {
      cats.set(p.category, (cats.get(p.category) || 0) + 1);
      if (p.year) years.set(p.year, (years.get(p.year) || 0) + 1);
    });
    const page = h("div", { class: "page" });
    page.appendChild(h("nav", { class: "crumbs" }, h("a", { href: "#/" }, "Library"), h("span", { class: "sep" }, "/"), h("a", { href: `#/b/${b.code}` }, b.name), h("span", { class: "sep" }, "/"), h("span", null, s.name)));
    page.appendChild(h("section", { class: "card pad" },
      h("p", { class: "eyebrow" }, `${b.code} · ${s.provider.name}`),
      h("h1", { style: { fontSize: "clamp(20px,2.6vw,28px)", margin: "8px 0" } }, s.name),
      h("p", { class: "muted" }, `${GP.plural(papers.length, "paper")} · ${GP.fmtInt(s.questionCount)} questions`),
      h("div", { class: "row", style: { marginTop: "12px" } },
        h("a", { class: "btn btn-sm", href: `#/bank?b=${b.code}&s=${s.id}` }, GP.icon("shuffle"), "Random practice from this series"))));

    const filterInput = h("input", { type: "search", placeholder: "Filter papers (subject, number…)", value: ui.q || "" });
    const sortSel = h("select", null,
      [["default", "Series order"], ["az", "Title A → Z"], ["za", "Title Z → A"], ["score", "Best score first"], ["qdesc", "Most questions"]].map(([v, l]) => h("option", { value: v, selected: ui.sort === v ? true : null }, l)));
    const hide = h("input", { type: "checkbox" });
    hide.checked = !!ui.hide;
    const catChips = h("div", { class: "chip-wrap" });
    const yearChips = h("div", { class: "chip-wrap" });
    const meta = h("div", { class: "list-meta" });
    const list = h("div", { class: "papers" });
    const done = attemptedSet();

    const draw = () => {
      GP.store.set("ui.series." + id, ui);
      catChips.replaceChildren(...GP.CATEGORY_ORDER.filter((k) => cats.has(k)).map((k) =>
        h("button", { class: "chip" + (ui.cat === k ? " active" : ""), type: "button", onclick: () => { ui.cat = k; draw(); } }, GP.CATEGORY_LABELS[k] || k, h("span", { class: "n" }, String(cats.get(k))))));
      yearChips.replaceChildren(...(years.size > 1 ? [["all", papers.length], ...[...years.entries()].sort()] : []).map(([k, n]) =>
        h("button", { class: "chip" + (ui.year === k ? " active" : ""), type: "button", onclick: () => { ui.year = k; draw(); } }, k === "all" ? "All years" : k, h("span", { class: "n" }, String(n)))));
      const tokens = (ui.q || "").toLowerCase().split(/\s+/).filter(Boolean);
      let vis = papers.filter((p) => (ui.cat === "all" || p.category === ui.cat) && (ui.year === "all" || p.year === ui.year) && (!ui.hide || !done.has(p.id)) && tokens.every((t) => p.hay.includes(t)));
      // numeric collation: "Test-2" before "Test-10"
      const cmp = (a, c) => a.title.localeCompare(c.title, undefined, { numeric: true, sensitivity: "base" });
      if (ui.sort === "az") vis.sort(cmp);
      else if (ui.sort === "za") vis.sort((a, c) => cmp(c, a));
      else if (ui.sort === "qdesc") vis.sort((a, c) => c.q - a.q);
      else if (ui.sort === "score") {
        const best = new Map(vis.map((p) => [p.id, (GP.attempts.best(p.id) || {}).pct ?? -1]));
        vis.sort((a, c) => best.get(c.id) - best.get(a.id));
      }
      meta.replaceChildren(h("span", null, `Showing ${vis.length} of ${papers.length} papers`), h("label", { class: "toggle" }, hide, "Hide papers I already attempted"));
      list.replaceChildren(...(vis.length ? vis.map((p) => paperCard(p, { tokens })) : [emptyBox("No papers match", "Try another keyword or clear the filters.")]));
    };
    filterInput.addEventListener("input", () => { ui.q = filterInput.value; draw(); });
    sortSel.addEventListener("change", () => { ui.sort = sortSel.value; draw(); });
    hide.addEventListener("change", () => { ui.hide = hide.checked; draw(); });
    page.appendChild(h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", null, "Test papers"), h("div", { class: "tools" }, filterInput, sortSel)),
      catChips, h("div", { style: { height: "8px" } }), yearChips, meta, list));
    draw();
    return page;
  };

  /* ----------------------------------------------------------------- paper */

  GP.views.paper = async function ({ id }) {
    const meta = GP.idx.papers.get(id);
    if (!meta) return h("div", { class: "page" }, emptyBox("Paper not found", "", h("a", { class: "btn", href: "#/" }, "Library")));
    const paper = await GP.loadPaper(id);
    const page = h("div", { class: "page" });
    page.appendChild(GP.crumbsFor(meta).cloneNode(true));
    page.lastChild.lastChild.replaceWith(h("span", null, meta.title));

    const types = paper.stats && paper.stats.types ? paper.stats.types : {};
    const negQs = paper.questions.filter((q) => GP.negOf(q) > 0).length;
    const head = h("section", { class: "card paper-head", style: { "--card-accent": meta.branch.accent } },
      h("div", null,
        h("p", { class: "eyebrow" }, `${meta.branch.code} · ${meta.provider.name} · ${GP.CATEGORY_LABELS[meta.category] || "Paper"} · #${meta.num}`),
        h("h1", null, paper.title),
        h("p", { class: "muted" }, paper.series),
        h("div", { class: "facts-grid" },
          h("div", { class: "fact" }, h("b", null, String(paper.questions.length)), h("span", null, "Questions")),
          h("div", { class: "fact" }, h("b", null, GP.fmtMins(paper.durationSec)), h("span", null, "Duration")),
          h("div", { class: "fact" }, h("b", null, paper.countBased ? "-" : GP.fmtNum(paper.max)), h("span", null, paper.countBased ? "Count-scored" : "Max marks")),
          h("div", { class: "fact" }, h("b", null, GP.typesText(types) || "-"), h("span", null, "Question types")),
          h("div", { class: "fact" }, h("b", null, String(paper.sections.length)), h("span", null, paper.sections.map((s) => `${s.name} (${s.count})`).join(", "))),
          h("div", { class: "fact" }, h("b", null, negQs ? `${negQs} Qs` : "None"), h("span", null, "Negative marking")))),
      h("div", { class: "row", style: { alignItems: "flex-start" } }, starPaper(meta)));
    head.querySelector(".star-btn").style.position = "static";
    page.appendChild(head);

    const notes = [];
    if (paper.marksInferred) notes.push(`Per-question marks were reconstructed from the source (it stores only section totals)${paper.marksApprox ? `; ${paper.marksApprox} are estimates` : ""}. MCQ penalty = 1/3 of the marks.`);
    if (paper.stats && paper.stats.withoutKey) notes.push(`${paper.stats.withoutKey} question(s) have no answer key in the source - they are shown with their solution but not scored.`);
    if (paper.countBased) notes.push("This paper is scored by number of correct answers.");
    if (notes.length) page.appendChild(h("section", { class: "section card pad" }, h("p", { class: "eyebrow" }, "Data notes"), h("ul", { class: "muted", style: { margin: "6px 0 0", paddingLeft: "20px" } }, notes.map((n) => h("li", null, n)))));

    const run = GP.runs.exam(id);
    if (run) {
      page.appendChild(h("section", { class: "section resume-bar" },
        h("div", null, h("b", null, "Unfinished exam attempt"), h("div", { class: "muted" }, `${GP.fmtClock(run.remaining)} left · ${Object.keys(run.ans || {}).length} answered · saved ${GP.relTime(run.savedAt)}`)),
        h("div", { class: "row" },
          h("a", { class: "btn btn-primary", href: `#/exam/${id}` }, GP.icon("play"), "Resume exam"),
          h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
            if (await GP.confirm("Discard unfinished attempt?", "Your answers in this unfinished attempt will be lost.", "Discard", "btn-bad")) {
              GP.store.del(GP.runs.examKey(id));
              GP.route();
            }
          } }, "Discard"))));
    }

    const prac = GP.runs.practice(id);
    const pracInfo = prac ? `${Object.keys(prac.checked || {}).length}/${paper.questions.length} checked` : null;
    page.appendChild(h("section", { class: "section mode-grid" },
      h("a", { class: "mode", href: run ? `#/exam/${id}` : `#/exam/${id}?fresh=1`, style: { textDecoration: "none" } },
        h("h3", null, h("span", { class: "ico" }, GP.icon("exam")), run ? "Resume exam" : "Start exam (CBT)"),
        h("p", null, "Real GATE-style computer based test: countdown timer, sections, question palette, mark for review, virtual calculator and on-screen keypad. Full analysis after submit.")),
      h("a", { class: "mode", href: `#/practice/${id}`, style: { textDecoration: "none" } },
        h("h3", null, h("span", { class: "ico" }, GP.icon("practice")), "Practice mode"),
        h("p", null, "One question at a time - answer, check instantly, read the solution. No pressure, progress is saved." + (pracInfo ? ` (${pracInfo})` : ""))),
      h("a", { class: "mode", href: `#/read/${id}`, style: { textDecoration: "none" } },
        h("h3", null, h("span", { class: "ico" }, GP.icon("read")), "Questions & solutions"),
        h("p", null, "The whole paper on one page with answer keys and worked solutions. Hide answers for a self-test, or print / save as PDF."))));

    // attempts
    const atts = GP.attempts.forPaper(id).slice().reverse();
    if (atts.length) {
      page.appendChild(h("section", { class: "section card pad" },
        h("div", { class: "section-head" }, h("h3", null, `Your attempts (${atts.length})`)),
        h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
          h("thead", null, h("tr", null, ["Date", "Score", "%", "Correct", "Wrong", "Skipped", "Time", ""].map((t, i) => h("th", { class: i && i < 7 ? "num" : "" }, t)))),
          h("tbody", null, atts.map((a) => h("tr", null,
            h("td", null, GP.fmtDate(a.submittedAt)),
            h("td", { class: "num" }, a.countBased ? `${a.correct}/${a.total}` : `${GP.fmtNum(a.score)} / ${GP.fmtNum(a.max)}`),
            h("td", { class: "num" }, h("span", { class: "score-pill " + GP.scoreTone(a.pct) }, Math.round(a.pct) + "%")),
            h("td", { class: "num" }, a.correct), h("td", { class: "num" }, a.wrong), h("td", { class: "num" }, a.skipped),
            h("td", { class: "num" }, GP.fmtDur(a.timeUsedSec)),
            h("td", null, h("a", { class: "btn btn-sm", href: `#/result/${a.id}` }, "View")))))))));
    }

    page.appendChild(h("section", { class: "section card pad" }, h("div", { class: "section-head" }, h("h3", null, "Instructions")), GP.instructionsBody(paper)));
    page.appendChild(h("p", { class: "faint", style: { marginTop: "16px", fontSize: "12.5px" } }, `Source file: ${paper.source}`));
    return page;
  };

  /* --------------------------------------------------- exam / practice routes */

  GP.views.exam = async function ({ id, query }, root, alive) {
    const paper = await GP.loadPaper(id);
    if (!alive()) return null;
    let fresh = query.get("fresh") === "1";
    const existing = GP.runs.exam(id);
    if (existing && fresh) {
      const ok = await GP.confirm("Start a fresh attempt?", "You have an unfinished attempt on this paper. Starting fresh discards it.", "Start fresh", "btn-bad");
      if (!alive()) return null;
      if (!ok) fresh = false;
    }
    if (!existing || fresh) {
      const go = await GP.modal({ title: "Ready to start?", body: GP.instructionsBody(paper), wide: true, actions: [{ label: "Cancel", value: false }, { label: "I am ready - start the test", cls: "btn-primary", value: true }] });
      if (!alive()) return null;
      if (!go) {
        location.hash = `#/p/${id}`;
        return null;
      }
      fresh = true;
    }
    GP.startExam(root, paper, { fresh });
    return null;
  };

  GP.views.practice = async function ({ id, query }, root, alive) {
    const paper = await GP.loadPaper(id);
    if (!alive()) return null;
    const q = query.get("q");
    GP.startPractice(root, paper, { startAt: q != null ? Number(q) : null });
    return null;
  };

  /** Start a custom set (question bank, mistakes, bookmarks, retry). */
  GP.startCustom = async function (refs, opts) {
    if (!refs || !refs.length) {
      GP.toast("No questions to practise.");
      return;
    }
    const mode = opts.mode === "exam" ? "exam" : "practice";
    const storeKey = mode === "exam" ? "run.custom" : "prac.custom";
    const old = GP.store.get(storeKey, null);
    const progress = old && Object.keys((mode === "exam" ? old.ans : old.checked) || {}).length > 0;
    if (progress) {
      const ok = await GP.confirm(
        "Replace the unfinished set?",
        `You have an unfinished custom ${mode === "exam" ? "test" : "practice set"} ("${(old.meta && old.meta.title) || "custom set"}"). Starting a new one discards it.`,
        "Start new", "btn-bad");
      if (!ok) return;
    }
    const set = { id: GP.uid(), refs, title: opts.title || "Custom set", subtitle: opts.subtitle || "Question bank", mode, durationSec: opts.durationSec || null, createdAt: Date.now() };
    GP.store.del(storeKey);
    GP.store.set("custom.pending", set);
    const target = `#/custom/${mode}`;
    if (location.hash === target) GP.route();
    else location.hash = target;
  };

  GP.views.custom = async function ({ mode }, root, alive) {
    const storeKey = mode === "exam" ? "run.custom" : "prac.custom";
    const saved = GP.store.get(storeKey, null);
    const pending = GP.store.get("custom.pending", null);
    let set = null;
    let fresh = false;
    if (pending && pending.mode === mode && pending.refs && !(saved && saved.meta && saved.meta.id === pending.id)) {
      set = pending; // a newly requested set never inherits another set's saved answers
      fresh = true;
    } else if (saved && saved.refs && saved.refs.length) {
      set = Object.assign({}, saved.meta || {}, { refs: saved.refs }); // resume
    }
    if (!set) {
      return h("div", { class: "page" }, emptyBox("No custom set in progress", "Build one from the question bank, your mistakes or bookmarks.", h("a", { class: "btn", href: "#/bank" }, "Question bank")));
    }
    const paper = await GP.buildVirtualPaper(set.refs, { id: "custom-" + (set.id || "x"), title: set.title, subtitle: set.subtitle, durationSec: set.durationSec });
    if (!alive()) return null;
    if (!paper.questions.length) return h("div", { class: "page" }, emptyBox("Questions unavailable", "The questions of this set could not be loaded."));
    const runMeta = { id: set.id, title: set.title, subtitle: set.subtitle, durationSec: paper.durationSec, mode };
    if (mode === "exam") GP.startExam(root, paper, { storeKey, runMeta, fresh });
    else GP.startPractice(root, paper, { storeKey, runMeta, fresh });
    // consumed: going Back to this URL later resumes or says "nothing in progress",
    // it never silently starts the set again
    if (pending && pending.mode === mode) GP.store.del("custom.pending");
    return null;
  };

  /* ---------------------------------------------------------------- search */

  GP.views.search = async function ({ query }, root, alive) {
    const q = (query.get("q") || "").trim();
    const tab = query.get("t") || "papers";
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const page = h("div", { class: "page" });
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Search"), h("h2", null, q ? `Results for "${q}"` : "Search the library"))));
    if (!tokens.length) {
      page.appendChild(emptyBox("Type to search", "Search paper titles (subject, test number, year, branch) or the text of every question."));
      return page;
    }
    // papers
    const papers = [];
    GP.idx.list.forEach((p) => {
      if (!tokens.every((t) => p.hay.includes(t))) return;
      const title = p.title.toLowerCase();
      let score = 0;
      tokens.forEach((t) => {
        const i = title.indexOf(t);
        score += i === 0 ? 60 : i > 0 ? 30 - Math.min(i, 20) : 0;
      });
      papers.push([score - p.title.length / 12, p]);
    });
    papers.sort((a, b) => b[0] - a[0]);

    const tabs = h("div", { class: "tabs" });
    const body = h("div", null);
    page.appendChild(tabs);
    page.appendChild(body);
    let activeTab = tab;
    const setTab = (t) => {
      activeTab = t;
      const qs = new URLSearchParams({ q, t });
      history.replaceState(null, "", "#/search?" + qs.toString());
      drawTabs(t);
      if (t === "papers") drawPapers();
      else drawQuestions();
    };
    let qCount = "…";
    const drawTabs = (t) => tabs.replaceChildren(
      h("button", { class: "tab" + (t === "papers" ? " active" : ""), type: "button", onclick: () => setTab("papers") }, "Papers", h("span", { class: "n" }, String(papers.length))),
      h("button", { class: "tab" + (t === "questions" ? " active" : ""), type: "button", onclick: () => setTab("questions") }, "Questions", h("span", { class: "n" }, String(qCount))));
    let limit = 60;
    const drawPapers = () => {
      const shown = papers.slice(0, limit).map((x) => paperCard(x[1], { crumb: true, tokens }));
      GP.put(body,
        shown.length ? h("div", { class: "papers" }, shown) : emptyBox("No paper matches", "Try the Questions tab to search inside questions."),
        papers.length > limit ? h("button", { class: "btn btn-block", style: { marginTop: "12px" }, type: "button", onclick: () => { limit += 60; drawPapers(); } }, `Show more (${papers.length - limit} left)`) : null);
    };
    let qResults = null;
    let qLimit = 50;
    const drawQuestions = async () => {
      if (!qResults) {
        body.replaceChildren(h("div", { class: "boot" }, "Searching every question…"));
        const all = await Promise.all(GP.lib.branches.map((b) => GP.loadQIndex(b.code).then((rows) => rows).catch(() => [])));
        if (!alive()) return;
        // Every word must appear in the question text or in its paper title / section
        // ("fluid mechanics" finds the questions of fluid mechanics papers);
        // questions whose own text matches more words rank first.
        const scored = [];
        all.flat().forEach((row) => {
          const text = (row[4] || "").toLowerCase();
          const p = GP.idx.papers.get(row[0]);
          const ctx = p ? (p.title + " " + (row[3] || "")).toLowerCase() : "";
          let inText = 0;
          for (const t of tokens) {
            if (text.includes(t)) inText++;
            else if (!ctx.includes(t)) return;
          }
          scored.push([inText, row]);
        });
        scored.sort((a, b) => b[0] - a[0]);
        qResults = scored.map((x) => x[1]);
        qCount = qResults.length;
        drawTabs(activeTab);
        if (activeTab !== "questions") return; // user switched back to Papers meanwhile
      }
      const list = h("div", { class: "qlist" });
      qResults.slice(0, qLimit).forEach((row) => list.appendChild(questionRow(row, tokens)));
      GP.put(body,
        qResults.length ? list : emptyBox("No question text matches", "Many papers (ZEAL, ACE) have image-only questions, so their text is not searchable."),
        qResults.length > qLimit ? h("button", { class: "btn btn-block", style: { marginTop: "12px" }, type: "button", onclick: () => { qLimit += 50; drawQuestions(); } }, `Show more (${qResults.length - qLimit} left)`) : null,
        qResults.length ? h("div", { class: "row", style: { marginTop: "14px" } },
          h("button", { class: "btn btn-primary", type: "button", onclick: () => GP.startCustom(qResults.slice(0, 200).map((r) => [r[0], r[1]]), { title: `Search: ${q}`, subtitle: "Search results", mode: "practice" }) }, GP.icon("practice"), `Practice these ${Math.min(200, qResults.length)} questions`)) : null);
    };
    drawTabs(tab);
    if (tab === "questions") drawQuestions();
    else drawPapers();
    return page;
  };

  function questionRow(row, tokens, extra) {
    const [pid, qi, type, sec, snippet] = row;
    const p = GP.idx.papers.get(pid);
    return h("div", { class: "qitem" },
      h("span", { class: "tag " + ({ MCQ: "tag-accent", MSQ: "tag-violet", NAT: "tag-warn" }[type] || "") }, type),
      h("div", { class: "txt" },
        h("div", { class: "s" }, snippet ? highlight(snippet, tokens || []) : h("span", { class: "faint" }, "(image question)")),
        h("div", { class: "m" }, `${p ? p.branch.code + " · " + p.title : pid} · Q${qi + 1}${sec ? " · " + sec : ""}`, extra ? [" · ", extra] : null)),
      h("div", { class: "acts" },
        h("a", { class: "btn btn-sm", href: `#/practice/${pid}?q=${qi}` }, "Practice"),
        h("a", { class: "btn btn-sm btn-ghost", href: `#/read/${pid}` }, "Paper")));
  }

  /* ---------------------------------------------------------- question bank */

  GP.views.bank = async function ({ query }, root, alive) {
    const page = h("div", { class: "page" });
    const ui = Object.assign({ b: GP.lib.branches[0].code, series: "all", sec: "all", types: ["MCQ", "MSQ", "NAT"], status: "all", kw: "", n: 20, order: "random", mode: "practice", cat: "all" }, GP.store.get("ui.bank", {}));
    if (query.get("b")) ui.b = query.get("b");
    if (query.get("s")) ui.series = query.get("s");
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Question bank"), h("h2", null, "Build a custom practice set or test"),
      h("p", { class: "muted", style: { marginTop: "6px" } }, "Mix questions from any papers of a branch - filter by series, section, question type, paper type, keyword or your history."))));
    const form = h("section", { class: "card pad" });
    const countEl = h("b", null, "…");
    const startBtn = h("button", { class: "btn btn-primary btn-lg", type: "button" }, GP.icon("play"), "Start");
    page.appendChild(form);
    let rows = [];
    let matches = [];

    const sel = (label, options, value, onchange) => {
      const s = h("select", null, options.map(([v, l]) => h("option", { value: v, selected: v === value ? true : null }, l)));
      s.addEventListener("change", () => onchange(s.value));
      return h("label", { class: "field" }, h("span", null, label), s);
    };

    let drawToken = 0;
    const draw = async () => {
      const myDraw = ++drawToken;
      GP.store.set("ui.bank", ui);
      const b = GP.idx.branches.get(ui.b) || GP.lib.branches[0];
      ui.b = b.code;
      form.replaceChildren(h("div", { class: "boot" }, "Loading question index…"));
      const loaded = await GP.loadQIndex(b.code);
      // a newer draw (quick branch switch) owns the form now
      if (!alive() || myDraw !== drawToken) return;
      rows = loaded;
      const seriesList = [];
      b.providers.forEach((p) => p.series.forEach((s) => seriesList.push([s.id, `${p.name} · ${s.name}`])));
      if (ui.series !== "all" && !seriesList.some((x) => x[0] === ui.series)) ui.series = "all";
      const secCounts = new Map();
      rows.forEach((r) => {
        const p = GP.idx.papers.get(r[0]);
        if (!p || (ui.series !== "all" && p.series.id !== ui.series)) return;
        secCounts.set(r[3] || "Questions", (secCounts.get(r[3] || "Questions") || 0) + 1);
      });
      const secOpts = [["all", "All sections"], ...[...secCounts.entries()].sort((a, c) => c[1] - a[1]).slice(0, 200).map(([k, n]) => [k, `${k} (${n})`])];
      // a filter that is not offered any more must not stay active invisibly
      if (ui.sec !== "all" && !secOpts.some((o) => o[0] === ui.sec)) ui.sec = "all";
      const cats = new Set();
      rows.forEach((r) => {
        const p = GP.idx.papers.get(r[0]);
        if (p && (ui.series === "all" || p.series.id === ui.series)) cats.add(p.category);
      });
      if (ui.cat !== "all" && !cats.has(ui.cat)) ui.cat = "all";
      const typeChips = h("div", { class: "check-list" }, ["MCQ", "MSQ", "NAT"].map((t) =>
        h("button", { class: "chip" + (ui.types.includes(t) ? " active" : ""), type: "button", onclick: () => {
          ui.types = ui.types.includes(t) ? ui.types.filter((x) => x !== t) : ui.types.concat(t);
          if (!ui.types.length) ui.types = [t];
          draw();
        } }, t)));
      const kw = h("input", { type: "search", placeholder: "e.g. thermodynamics, Fourier, deadlock", value: ui.kw });
      kw.addEventListener("input", () => { ui.kw = kw.value; GP.store.set("ui.bank", ui); recount(); });
      const nIn = h("input", { type: "number", min: "1", max: "200", value: String(ui.n) });
      nIn.addEventListener("input", () => { ui.n = Math.max(1, Math.min(200, Number(nIn.value) || 20)); GP.store.set("ui.bank", ui); recount(); });
      form.replaceChildren(
        h("div", { class: "form-grid" },
          sel("Branch", GP.lib.branches.map((x) => [x.code, `${x.code} · ${x.name}`]), ui.b, (v) => { ui.b = v; ui.series = "all"; ui.sec = "all"; draw(); }),
          sel("Series", [["all", "All series"], ...seriesList], ui.series, (v) => { ui.series = v; draw(); }),
          sel("Section", secOpts, ui.sec, (v) => { ui.sec = v; recount(); }),
          sel("Paper type", [["all", "All paper types"], ...GP.CATEGORY_ORDER.filter((k) => cats.has(k)).map((k) => [k, GP.CATEGORY_LABELS[k]])], ui.cat, (v) => { ui.cat = v; recount(); }),
          sel("Your history", [["all", "Any question"], ["new", "Never attempted"], ["wrong", "Got wrong before"], ["bookmarked", "Bookmarked"]], ui.status, (v) => { ui.status = v; recount(); }),
          h("label", { class: "field" }, h("span", null, "Keyword (question text or paper title)"), kw),
          h("div", { class: "field" }, h("span", null, "Question types"), typeChips),
          h("label", { class: "field" }, h("span", null, "Number of questions"), nIn),
          sel("Order", [["random", "Random"], ["paper", "Paper order"]], ui.order, (v) => { ui.order = v; GP.store.set("ui.bank", ui); }),
          sel("Mode", [["practice", "Practice (instant check)"], ["exam", "Timed test (3 min / question)"]], ui.mode, (v) => { ui.mode = v; GP.store.set("ui.bank", ui); })),
        h("div", { class: "row", style: { marginTop: "18px", justifyContent: "space-between" } },
          h("span", { class: "muted" }, countEl, " matching questions"),
          startBtn));
      recount();
    };

    const recount = () => {
      const tokens = (ui.kw || "").toLowerCase().split(/\s+/).filter(Boolean);
      const qs = GP.qstat.all();
      const bm = GP.bookmarks.all();
      matches = rows.filter((r) => {
        const p = GP.idx.papers.get(r[0]);
        if (!p) return false;
        if (ui.series !== "all" && p.series.id !== ui.series) return false;
        if (ui.sec !== "all" && (r[3] || "Questions") !== ui.sec) return false;
        if (ui.cat !== "all" && p.category !== ui.cat) return false;
        if (!ui.types.includes(r[2])) return false;
        const key = r[0] + ":" + r[1];
        if (ui.status === "new" && qs[key]) return false;
        if (ui.status === "wrong" && !(qs[key] && qs[key].w > 0)) return false;
        if (ui.status === "bookmarked" && !bm[key]) return false;
        if (tokens.length) {
          const hay = ((r[4] || "") + " " + p.title).toLowerCase();
          if (!tokens.every((t) => hay.includes(t))) return false;
        }
        return true;
      });
      countEl.textContent = GP.fmtInt(matches.length);
      startBtn.disabled = !matches.length;
    };

    startBtn.addEventListener("click", () => {
      let pick = ui.order === "random" ? GP.shuffle(matches) : matches.slice();
      pick = pick.slice(0, ui.n);
      const b = GP.idx.branches.get(ui.b);
      const title = `${b.code} custom ${ui.mode === "exam" ? "test" : "practice"} · ${pick.length} Q${ui.kw ? " · " + ui.kw : ""}${ui.sec !== "all" ? " · " + ui.sec : ""}`;
      GP.startCustom(pick.map((r) => [r[0], r[1]]), { title, subtitle: "Question bank", mode: ui.mode, durationSec: ui.mode === "exam" ? pick.length * 180 : null });
    });
    await draw();
    return page;
  };

  /* ------------------------------------------------- bookmarks & mistakes */

  async function snippetsFor(keys) {
    const codes = new Set();
    keys.forEach((k) => {
      const p = GP.idx.papers.get(k.split(":")[0]);
      if (p) codes.add(p.branch.code);
    });
    const map = new Map();
    await Promise.all([...codes].map((c) => GP.loadQIndex(c).then((rows) => rows.forEach((r) => map.set(r[0] + ":" + r[1], r))).catch(() => null)));
    return map;
  }

  // read the stores at click time: rows removed on this page must not come back
  const bookmarkKeys = () => {
    const all = GP.bookmarks.all();
    return Object.keys(all).sort((a, b) => all[b].t - all[a].t);
  };
  const mistakeKeys = () => {
    const qs = GP.qstat.all();
    return Object.keys(qs).filter((k) => qs[k].r === "w" && GP.idx.papers.has(k.split(":")[0])).sort((a, b) => qs[b].t - qs[a].t);
  };

  GP.views.bookmarks = async function (_p, root, alive) {
    const all = GP.bookmarks.all();
    const keys = bookmarkKeys();
    const page = h("div", { class: "page" });
    const heading = h("h2", null, `Bookmarked questions (${keys.length})`);
    const recount = () => {
      const n = bookmarkKeys().length;
      heading.textContent = `Bookmarked questions (${n})`;
      if (!n) GP.route();
    };
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Bookmarks"), heading),
      keys.length ? h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => GP.startCustom(bookmarkKeys().map(splitKey), { title: "Bookmarked questions", subtitle: "Bookmarks", mode: "practice" }) }, GP.icon("practice"), "Practice all"),
        h("button", { class: "btn", type: "button", onclick: () => { const k = bookmarkKeys(); GP.startCustom(GP.shuffle(k.map(splitKey)).slice(0, 65), { title: "Bookmarks test", subtitle: "Bookmarks", mode: "exam", durationSec: Math.min(65, k.length) * 180 }); } }, GP.icon("exam"), "Timed test")) : null));
    if (!keys.length) {
      page.appendChild(emptyBox("No bookmarks yet", "Use the ☆ button on any question (exam, practice, review or read mode) to save it here."));
      return page;
    }
    const map = await snippetsFor(keys);
    if (!alive()) return null;
    const list = h("div", { class: "qlist" });
    keys.forEach((k) => {
      const [pid, qi] = splitKey(k);
      const row = map.get(k) || [pid, qi, "", "", all[k].s || ""];
      const item = questionRow(row, [], GP.relTime(all[k].t));
      item.querySelector(".acts").appendChild(h("button", { class: "btn btn-sm btn-ghost", type: "button", title: "Remove bookmark", onclick: () => { if (GP.bookmarks.has(pid, qi)) GP.bookmarks.toggle(pid, qi); item.remove(); recount(); } }, GP.icon("trash")));
      list.appendChild(item);
    });
    page.appendChild(list);
    return page;
  };

  function splitKey(k) {
    const i = k.lastIndexOf(":");
    return [k.slice(0, i), Number(k.slice(i + 1))];
  }

  GP.views.mistakes = async function (_p, root, alive) {
    const qs = GP.qstat.all();
    const keys = mistakeKeys();
    const page = h("div", { class: "page" });
    const heading = h("h2", null, `Questions you got wrong (${keys.length})`);
    const recount = () => {
      const n = mistakeKeys().length;
      heading.textContent = `Questions you got wrong (${n})`;
      if (!n) GP.route();
    };
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Mistakes notebook"), heading,
      h("p", { class: "muted", style: { marginTop: "6px" } }, "Every wrong answer from exams and practice lands here. Answer it correctly later and it leaves the list automatically.")),
      keys.length ? h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => GP.startCustom(mistakeKeys().map(splitKey), { title: "Mistakes revision", subtitle: "Mistakes notebook", mode: "practice" }) }, GP.icon("practice"), "Practice all"),
        h("button", { class: "btn", type: "button", onclick: () => { const k = mistakeKeys(); GP.startCustom(GP.shuffle(k.map(splitKey)).slice(0, 30), { title: "Mistakes test", subtitle: "Mistakes notebook", mode: "exam", durationSec: Math.min(30, k.length) * 180 }); } }, GP.icon("exam"), "Timed test (30 Q)")) : null));
    if (!keys.length) {
      page.appendChild(emptyBox("No mistakes recorded", "Wrong answers from your exams and practice sessions will appear here."));
      return page;
    }
    const map = await snippetsFor(keys);
    if (!alive()) return null;
    const list = h("div", { class: "qlist" });
    keys.forEach((k) => {
      const [pid, qi] = splitKey(k);
      const st = qs[k];
      const row = map.get(k) || [pid, qi, "", "", ""];
      const item = questionRow(row, [], `wrong ${st.w}× · right ${st.c}× · ${GP.relTime(st.t)}`);
      item.querySelector(".acts").appendChild(h("button", { class: "btn btn-sm btn-ghost", type: "button", title: "Mark as learnt", onclick: () => { GP.qstat.clearMistake(pid, qi); item.remove(); recount(); } }, GP.icon("check")));
      list.appendChild(item);
    });
    page.appendChild(list);
    return page;
  };

  /* ----------------------------------------------------------------- stats */

  GP.views.stats = function () {
    const atts = GP.attempts.list();
    const page = h("div", { class: "page" });
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Analytics"), h("h2", null, "Your performance"))));
    const qs = GP.qstat.all();
    let c = 0;
    let w = 0;
    Object.values(qs).forEach((v) => {
      c += v.c || 0;
      w += v.w || 0;
    });
    const time = atts.reduce((s, a) => s + (a.timeUsedSec || 0), 0);
    const avg = atts.length ? atts.reduce((s, a) => s + a.pct, 0) / atts.length : null;
    page.appendChild(h("section", { class: "kpi-row" },
      GP.kpi("Tests submitted", String(atts.length), "accent"),
      GP.kpi("Average score", avg == null ? "-" : Math.round(avg) + "%", ""),
      GP.kpi("Best score", atts.length ? Math.round(Math.max(...atts.map((a) => a.pct))) + "%" : "-", "good"),
      GP.kpi("Time in tests", GP.fmtDur(time), "violet"),
      GP.kpi("Questions checked", GP.fmtInt(c + w), ""),
      GP.kpi("Overall accuracy", c + w ? Math.round((c / (c + w)) * 100) + "%" : "-", "warn"),
      GP.kpi("Open mistakes", String(Object.values(qs).filter((v) => v.r === "w").length), "bad"),
      GP.kpi("Bookmarks", String(Object.keys(GP.bookmarks.all()).length), "")));
    if (!atts.length) {
      page.appendChild(h("div", { class: "section" }, emptyBox("No tests submitted yet", "Submit an exam and your analytics appear here.", h("a", { class: "btn btn-primary", href: "#/" }, "Browse papers"))));
      return page;
    }
    // trend
    const spark = h("div", { class: "spark" });
    atts.slice(-40).forEach((a) => {
      const bar = h("i", { title: `${a.title} · ${Math.round(a.pct)}% · ${GP.fmtDate(a.submittedAt)}`, style: { height: Math.max(4, a.pct) + "%", cursor: "pointer" } });
      bar.addEventListener("click", () => (location.hash = `#/result/${a.id}`));
      spark.appendChild(bar);
    });
    page.appendChild(h("section", { class: "section card pad" }, h("div", { class: "section-head" }, h("h3", null, "Score trend (last 40 tests)"), h("span", { class: "muted" }, "percentage of max marks")), spark));

    // per section / type from stored breakdowns
    const agg = { sec: {}, type: {}, branch: {} };
    atts.forEach((a) => {
      const full = GP.attempts.get(a.id);
      const br = agg.branch[a.code || "Custom"] = agg.branch[a.code || "Custom"] || { n: 0, pct: 0 };
      br.n += 1;
      br.pct += a.pct;
      if (!full || !full.breakdown) return;
      [["sec", full.breakdown.bySection], ["type", full.breakdown.byType]].forEach(([k, src]) => {
        Object.entries(src || {}).forEach(([name, b]) => {
          const t = (agg[k][name] = agg[k][name] || { correct: 0, wrong: 0, skipped: 0, total: 0 });
          t.correct += b.correct;
          t.wrong += b.wrong;
          t.skipped += b.skipped;
          t.total += b.total;
        });
      });
    });
    const barsFor = (obj) => Object.entries(obj).sort((a, b) => b[1].total - a[1].total).slice(0, 16).map(([name, b]) => {
      const tot = Math.max(1, b.total);
      return h("div", { class: "bar-row" },
        h("span", { title: name, style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, name),
        h("div", { class: "bar" }, h("i", { class: "g", style: { width: (b.correct / tot) * 100 + "%" } }), h("i", { class: "r", style: { width: (b.wrong / tot) * 100 + "%" } })),
        h("span", { class: "muted", style: { textAlign: "right" } }, b.correct + b.wrong ? Math.round((b.correct / (b.correct + b.wrong)) * 100) + "% acc" : "-"));
    });
    page.appendChild(h("section", { class: "section two-col" },
      h("div", { class: "card pad" }, h("div", { class: "section-head" }, h("h3", null, "By section"), h("span", { class: "muted" }, "green correct · red wrong")), barsFor(agg.sec)),
      h("div", { class: "card pad" }, h("div", { class: "section-head" }, h("h3", null, "By question type")), barsFor(agg.type),
        h("div", { class: "section-head", style: { marginTop: "18px" } }, h("h3", null, "By branch")),
        Object.entries(agg.branch).map(([k, v]) => h("div", { class: "bar-row" }, h("span", null, k), h("div", { class: "bar" }, h("i", { class: "a", style: { width: v.pct / v.n + "%" } })), h("span", { class: "muted", style: { textAlign: "right" } }, `${Math.round(v.pct / v.n)}% · ${v.n}`))))));

    // all attempts
    page.appendChild(h("section", { class: "section card pad" },
      h("div", { class: "section-head" }, h("h3", null, `All attempts (${atts.length})`)),
      h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["Date", "Paper", "Score", "%", "Time", ""].map((t, i) => h("th", { class: i >= 2 && i <= 4 ? "num" : "" }, t)))),
        h("tbody", null, atts.slice().reverse().map((a) => h("tr", null,
          h("td", { class: "nowrap" }, GP.fmtDate(a.submittedAt)),
          h("td", null, a.title),
          h("td", { class: "num" }, a.countBased ? `${a.correct}/${a.total}` : `${GP.fmtNum(a.score)}/${GP.fmtNum(a.max)}`),
          h("td", { class: "num" }, h("span", { class: "score-pill " + GP.scoreTone(a.pct) }, Math.round(a.pct) + "%")),
          h("td", { class: "num" }, GP.fmtDur(a.timeUsedSec)),
          h("td", null, h("a", { class: "btn btn-sm", href: `#/result/${a.id}` }, "View")))))))));
    return page;
  };

  /* -------------------------------------------------------------- settings */

  GP.views.settings = function () {
    const s = GP.settings;
    const page = h("div", { class: "page" });
    page.appendChild(h("div", { class: "section-head" }, h("div", null, h("p", { class: "eyebrow" }, "Settings"), h("h2", null, "Preferences & data"))));
    const check = (key, label, help) => {
      const box = h("input", { type: "checkbox" });
      box.checked = !!s[key];
      box.addEventListener("change", () => {
        GP.saveSettings({ [key]: box.checked });
        GP.toast("Saved");
      });
      return h("div", { class: "stack", style: { gap: "4px" } }, h("label", { class: "toggle" }, box, h("b", { style: { color: "var(--ink)" } }, label)), help ? h("p", { class: "muted", style: { fontSize: "13px", marginLeft: "24px" } }, help) : null);
    };
    const name = h("input", { type: "text", value: s.name || "", maxlength: "40" });
    name.addEventListener("change", () => { GP.saveSettings({ name: name.value.trim() || "Divya" }); GP.toast("Saved"); });
    const scale = h("input", { type: "range", min: "0.85", max: "1.4", step: "0.05", value: String(s.fontScale || 1) });
    const scaleVal = h("span", { class: "muted" }, Math.round((s.fontScale || 1) * 100) + "%");
    scale.addEventListener("input", () => { GP.saveSettings({ fontScale: Number(scale.value) }); scaleVal.textContent = Math.round(Number(scale.value) * 100) + "%"; });
    page.appendChild(h("section", { class: "card pad stack" },
      h("h3", null, "Exam behaviour"),
      h("label", { class: "field", style: { maxWidth: "360px" } }, h("span", null, "Candidate name (shown in the exam panel)"), name),
      check("strict", "Strict GATE saving", "A response is kept only after Save & Next or Mark for Review & Next - exactly like the real CBT. Turn off to save answers as soon as you click them."),
      check("gateRule", "Official GATE marking for MSQ / NAT", "No negative marks for MSQ and NAT even if a source paper lists one (a few papers do). MSQ never gets partial credit."),
      check("keypad", "On-screen keypad for numerical answers", "Physical keyboard typing always works too."),
      h("div", { class: "field", style: { maxWidth: "360px" } }, h("span", null, "Question text size"), h("div", { class: "row" }, scale, scaleVal))));

    // data
    const used = (() => {
      let n = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k.startsWith("gp.")) n += k.length + (localStorage.getItem(k) || "").length;
        }
      } catch (_e) {
        /* ignore */
      }
      return n;
    })();
    const file = h("input", { type: "file", accept: "application/json,.json", class: "hidden" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = ""; // choosing the same file again must fire "change" again
      if (!f) return;
      let data;
      try {
        data = JSON.parse(await f.text());
        if (!data || data.app !== "gate-practice-hub" || !data.items || typeof data.items !== "object") throw new Error("not a GATE Practice Hub backup");
      } catch (e) {
        GP.toast("Import failed: " + e.message, 4000);
        return;
      }
      if (!(await GP.confirm("Import backup?", `This replaces your current progress with the backup from ${GP.fmtDate(data.exportedAt)} (${Object.keys(data.items).length} records).`, "Import", "btn-primary"))) return;
      // keep a snapshot so a failed write (storage full) can be rolled back completely
      const snapshot = {};
      GP.store.keys().forEach((k) => (snapshot[k] = GP.store.get(k, null)));
      GP.store.keys().forEach((k) => GP.store.del(k));
      const failed = Object.entries(data.items).some(([k, v]) => !GP.store.set(k, v));
      if (failed) {
        GP.store.keys().forEach((k) => GP.store.del(k));
        Object.entries(snapshot).forEach(([k, v]) => GP.store.set(k, v));
        GP.toast("Import failed: the backup does not fit in this browser's storage. Nothing was changed.", 5000);
        return;
      }
      GP.toast("Backup imported");
      setTimeout(() => location.reload(), 600);
    });
    page.appendChild(h("section", { class: "section card pad stack" },
      h("h3", null, "Your data"),
      h("p", { class: "muted" }, `Progress (attempts, practice, bookmarks, mistakes) is stored in this browser's local storage - about ${Math.round((used * 2) / 1024)} KB used. Export a backup to move it to another browser or computer.`),
      h("div", { class: "row" },
        h("button", { class: "btn btn-primary", type: "button", onclick: () => {
          const items = {};
          GP.store.keys().forEach((k) => (items[k] = GP.store.get(k, null)));
          GP.download(`gate-practice-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "gate-practice-hub", v: 1, exportedAt: Date.now(), items }));
        } }, "Export backup"),
        h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Import backup"), file,
        h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
          if (await GP.confirm("Erase all progress?", "Deletes every attempt, practice state, bookmark and mistake from this browser. Settings are kept.", "Erase everything", "btn-bad")) {
            GP.store.keys().filter((k) => k !== "settings").forEach((k) => GP.store.del(k));
            GP.qstat._cache = null;
            GP.attempts.invalidate();
            GP.toast("All progress erased");
            GP.route();
          }
        } }, GP.icon("trash"), "Erase progress"))));

    const lib = GP.lib;
    page.appendChild(h("section", { class: "section card pad stack" },
      h("h3", null, "About this library"),
      h("p", { class: "muted" }, `${GP.fmtInt(lib.paperCount)} papers · ${GP.fmtInt(lib.questionCount)} questions · ${lib.branches.length} branches · snapshot of ${lib.source} built ${lib.generatedAt.replace("T", " ")}.`),
      h("p", { class: "muted" }, "Data lives in the data/ folder (data/json has one readable JSON file per paper) and images in media/. An exact offline copy of the original site is in mirror/. To refresh from the website, run the scripts in tools/ (see README)."),
      h("div", { class: "row" }, lib.branches.map((b) => h("span", { class: "tag" }, `${b.code}: ${b.paperCount} papers / ${GP.fmtInt(b.questionCount)} Q`)))));
    return page;
  };
})();
