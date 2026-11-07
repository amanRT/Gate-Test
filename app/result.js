/* ==========================================================================
   GATE Practice Hub - result analysis, answer review, read (Q&A) mode.
   ========================================================================== */
(function () {
  "use strict";
  const GP = window.GP;
  const { h } = GP;
  GP.views = GP.views || {};

  const STATUS_LABEL = { correct: "Correct", wrong: "Wrong", skipped: "Not attempted", nokey: "Not graded" };
  const STATUS_TAG = { correct: "tag-good", wrong: "tag-bad", skipped: "", nokey: "tag-warn" };

  function crumbsFor(meta, extra) {
    const parts = [h("a", { href: "#/" }, "Library")];
    if (meta) {
      parts.push(h("span", { class: "sep" }, "/"), h("a", { href: `#/b/${meta.branch.code}` }, meta.branch.name));
      parts.push(h("span", { class: "sep" }, "/"), h("a", { href: `#/s/${meta.series.id}` }, meta.series.name));
      parts.push(h("span", { class: "sep" }, "/"), h("a", { href: `#/p/${meta.id}` }, meta.title));
    }
    (extra || []).forEach((x) => parts.push(h("span", { class: "sep" }, "/"), h("span", null, x)));
    return h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, parts);
  }
  GP.crumbsFor = crumbsFor;

  function kpi(label, value, cls) {
    return h("div", { class: "kpi " + (cls || "") }, h("b", null, value), h("span", null, label));
  }
  GP.kpi = kpi;

  function ring(pct, label, sub) {
    const tone = pct >= 60 ? "var(--good)" : pct >= 35 ? "var(--warn)" : "var(--bad)";
    const el = h("div", { class: "ring", style: { "--p": String(Math.max(0, Math.min(100, pct))), "--c": tone } },
      h("div", null, h("b", null, label), h("span", null, sub)));
    return el;
  }
  GP.ring = ring;

  function bucketTable(title, buckets, countBased) {
    const rows = Object.entries(buckets).map(([name, b]) => {
      const graded = b.correct + b.wrong;
      return h("tr", null,
        h("td", null, name),
        h("td", { class: "num" }, b.total),
        h("td", { class: "num" }, b.attempted),
        h("td", { class: "num", style: { color: "var(--good)" } }, b.correct),
        h("td", { class: "num", style: { color: "var(--bad)" } }, b.wrong),
        h("td", { class: "num" }, b.skipped),
        h("td", { class: "num" }, countBased ? `${b.correct}/${b.total - b.nokey}` : `${GP.fmtNum(b.score)} / ${GP.fmtNum(b.max)}`),
        h("td", { class: "num" }, graded ? Math.round((b.correct / graded) * 100) + "%" : "-"));
    });
    return h("div", { class: "card pad" },
      h("div", { class: "section-head" }, h("h3", null, title)),
      h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["", "Qs", "Attempted", "Correct", "Wrong", "Skipped", countBased ? "Correct" : "Score", "Accuracy"].map((t, i) => h("th", { class: i ? "num" : "" }, t)))),
        h("tbody", null, rows))));
  }

  /* ------------------------------------------------------- review renderer */

  GP.renderReviewItem = function (paper, q, i, resp, r, opts = {}) {
    const math = paper.virtual ? q.srcMath : paper.math;
    const [rpid, rqi] = q.ref ? q.ref : [paper.id, q.i];
    const t = opts.qtime != null ? opts.qtime : null;
    const marksTxt = r.status === "correct" ? `+${GP.fmtNum(r.marks)}` : r.status === "wrong" ? (r.marks ? GP.fmtNum(r.marks) : "0") : "0";
    const head = h("div", { class: "rq-head" },
      h("span", { class: "qno" }, `Q${i + 1}`),
      GP.typeTag(q),
      q.section ? h("span", { class: "tag" }, q.section) : null,
      q.srcTitle ? h("span", { class: "tag" }, q.srcTitle) : null,
      h("span", { class: "tag " + (STATUS_TAG[r.status] || "") }, STATUS_LABEL[r.status] + (paper.countBased || (r.status !== "correct" && r.status !== "wrong") ? "" : `  ${marksTxt}`)),
      opts.marked ? h("span", { class: "tag tag-violet" }, "Marked for review") : null,
      t != null ? h("span", { class: "tag" }, "⏱ " + GP.fmtDur(t)) : null,
      h("span", { class: "grow" }),
      GP.bookmarkBtn(rpid, rqi, () => ({ s: GP.stripText(q.html).slice(0, 160), title: q.srcTitle || paper.title })));
    const item = h("article", { class: "review-q", id: "rq-" + i, dataset: { status: r.status } }, head);
    // Render the question lazily when it scrolls into view: large papers stay fast.
    const fill = () => {
      if (item._filled) return;
      item._filled = true;
      item.appendChild(GP.renderQuestionBody(q, { math, resp, locked: true, reveal: true }));
      item.appendChild(GP.renderAnswerLine(q, resp, { countBased: paper.countBased, rules: opts.rules }));
      item.appendChild(GP.renderSolution(q, math, !!opts.openSolutions));
    };
    item._fill = fill;
    return item;
  };

  /**
   * Jump to review/read item i. Everything above it is rendered first (lazily
   * rendered items would otherwise grow during the scroll and the jump would
   * stop far short), then the target is shown instantly and re-aligned once
   * MathJax has laid out its formulas - unless the user has scrolled meanwhile.
   */
  function jumpToItem(items, i) {
    for (let k = 0; k <= i; k++) if (items[k]._fill) items[k]._fill();
    // synchronous: forces layout now (no reliance on animation frames, which
    // do not run in background tabs)
    items[i].scrollIntoView({ block: "start" });
    let y = window.scrollY;
    const settle = () => {
      if (Math.abs(window.scrollY - y) < 4) {
        items[i].scrollIntoView({ block: "start" });
        y = window.scrollY;
      }
    };
    setTimeout(settle, 60);
    setTimeout(() => GP.mathIdle().then(settle), 120);
  }
  GP.jumpToItem = jumpToItem;

  function lazyFill(container) {
    const items = GP.$$(".review-q, .read-q", container);
    if (!("IntersectionObserver" in window)) {
      items.forEach((it) => it._fill && it._fill());
      return;
    }
    // the first screenful right away: no blank flash, and content even if the
    // observer is delayed (it only runs with the page's rendering)
    items.filter((it) => !it.classList.contains("hidden")).slice(0, 4).forEach((it) => it._fill && it._fill());
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.target._fill) {
          en.target._fill();
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "600px 0px" });
    items.forEach((it) => io.observe(it));
    return io;
  }
  GP.lazyFill = lazyFill;

  /* ----------------------------------------------------------------- result */

  GP.views.result = async function ({ id }) {
    const att = GP.attempts.get(id);
    if (!att) {
      return h("div", { class: "page" }, h("div", { class: "empty" }, h("strong", null, "Result not found"), "This attempt may have been deleted.", h("div", { class: "spacer" }), h("a", { class: "btn", href: "#/" }, "Go to library")));
    }
    const paper = att.kind === "paper" ? await GP.loadPaper(att.paperId) : await GP.buildVirtualPaper(att.refs || [], Object.assign({ title: att.title }, att.virtualMeta || {}));
    const res = GP.scoreAll(paper.questions, att.resp, { rules: att.rules });
    const meta = paper.meta;
    const countBased = !!paper.countBased;
    const marked = new Set(att.marked || []);
    const qtime = att.qtime || {};
    const page = h("div", { class: "page" });
    page.appendChild(crumbsFor(meta, ["Result"]));

    // hero
    const scoreLabel = countBased ? `${res.correct}/${res.total - res.nokey}` : `${GP.fmtNum(res.score)}`;
    const heroText = h("div", { class: "stack" },
      h("p", { class: "eyebrow" }, att.autoSubmitted ? "Auto-submitted (time up)" : "Test submitted"),
      h("h1", { style: { fontSize: "clamp(20px,2.4vw,28px)" } }, paper.title),
      h("p", { class: "muted" }, `${GP.fmtDate(att.submittedAt)} · time used ${GP.fmtDur(att.timeUsedSec)} of ${GP.fmtMins(att.durationSec)}`),
      h("p", { style: { fontSize: "18px" } }, countBased
        ? h("span", null, h("b", null, `${res.correct}`), ` correct out of ${res.total - res.nokey} graded questions`)
        : h("span", null, "Score ", h("b", null, `${GP.fmtNum(res.score)} / ${GP.fmtNum(res.max)}`), `  ·  +${GP.fmtNum(res.pos)}  −${GP.fmtNum(res.neg)}`)),
      h("div", { class: "row" },
        att.kind === "paper" ? h("a", { class: "btn btn-primary", href: `#/exam/${att.paperId}?fresh=1` }, GP.icon("refresh"), "Reattempt") : h("button", { class: "btn btn-primary", type: "button", onclick: () => GP.startCustom(att.refs, { title: att.title, mode: "exam", durationSec: att.durationSec }) }, GP.icon("refresh"), "Reattempt"),
        res.wrong + res.skipped > 0 ? h("button", { class: "btn", type: "button", onclick: () => {
          const refs = paper.questions.map((q, i) => [q, i]).filter(([, i]) => res.per[i].status === "wrong" || res.per[i].status === "skipped").map(([q]) => (q.ref ? q.ref : [paper.id, q.i]));
          GP.startCustom(refs, { title: "Retry: " + paper.title, mode: "practice" });
        } }, GP.icon("practice"), "Practice wrong & skipped") : null,
        att.kind === "paper" ? h("a", { class: "btn", href: `#/read/${att.paperId}` }, GP.icon("read"), "Read all solutions") : null,
        att.kind === "paper" ? h("a", { class: "btn btn-ghost", href: `#/p/${att.paperId}` }, "Paper page") : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: async () => {
          if (await GP.confirm("Delete this attempt?", "The score and answers of this attempt will be removed.", "Delete", "btn-bad")) {
            GP.attempts.remove(att.id);
            location.hash = att.kind === "paper" ? `#/p/${att.paperId}` : "#/stats";
          }
        } }, GP.icon("trash"), "Delete")));
    page.appendChild(h("section", { class: "card res-hero" }, ring(res.pct, countBased ? scoreLabel : Math.round(res.pct) + "%", countBased ? "correct" : `${scoreLabel} marks`), heroText));

    // KPIs
    const totalTime = Object.values(qtime).reduce((a, b) => a + b, 0);
    page.appendChild(h("section", { class: "section kpi-row" },
      kpi("Correct", String(res.correct), "good"),
      kpi("Wrong", String(res.wrong), "bad"),
      kpi("Not attempted", String(res.skipped), "warn"),
      res.nokey ? kpi("Not graded (no key)", String(res.nokey), "") : null,
      kpi("Accuracy", Math.round(res.accuracy) + "%", "accent"),
      kpi("Attempted", `${res.attempted}/${res.total}`, ""),
      countBased ? null : kpi("Negative marks", "−" + GP.fmtNum(res.neg), "bad"),
      kpi("Avg time / attempted", res.attempted ? GP.fmtDur(totalTime / Math.max(1, res.attempted)) : "-", "violet")));

    // tables
    const secCount = Object.keys(res.bySection).length;
    page.appendChild(h("section", { class: "section two-col" },
      secCount > 1 || true ? bucketTable("Section-wise", res.bySection, countBased) : null,
      bucketTable("Question type", res.byType, countBased)));

    // time analysis
    const maxT = Math.max(1, ...paper.questions.map((_q, i) => qtime[i] || 0));
    const bars = h("div", { class: "timebars" });
    paper.questions.forEach((_q, i) => {
      const t = qtime[i] || 0;
      const st = res.per[i].status;
      const color = st === "correct" ? "var(--good)" : st === "wrong" ? "var(--bad)" : st === "nokey" ? "var(--warn)" : "var(--faint)";
      const b = h("i", { title: `Q${i + 1}: ${GP.fmtDur(t)} · ${STATUS_LABEL[st]}`, style: { height: Math.max(3, (t / maxT) * 100) + "%", background: color, cursor: "pointer" } });
      b.addEventListener("click", () => jumpTo(i));
      bars.appendChild(b);
    });
    const slow = paper.questions.map((q, i) => [i, qtime[i] || 0]).sort((a, b) => b[1] - a[1]).slice(0, 5).filter((x) => x[1] > 0);
    page.appendChild(h("section", { class: "section card pad" },
      h("div", { class: "section-head" }, h("h3", null, "Time spent per question"), h("span", { class: "muted" }, `Total ${GP.fmtDur(totalTime)} · green correct · red wrong · grey skipped`)),
      bars,
      slow.length ? h("p", { class: "muted", style: { marginTop: "10px" } }, "Slowest: ", ...slow.map(([i, t], k) => [k ? ", " : "", h("a", { href: "#", onclick: (e) => { e.preventDefault(); jumpTo(i); } }, `Q${i + 1}`), ` (${GP.fmtDur(t)})`])) : null));

    // attempts trend for this paper
    if (att.kind === "paper") {
      const list = GP.attempts.forPaper(att.paperId);
      if (list.length > 1) {
        const spark = h("div", { class: "spark" });
        list.slice(-20).forEach((a) => spark.appendChild(h("i", { title: `${GP.fmtDate(a.submittedAt)}: ${Math.round(a.pct)}%`, style: { height: Math.max(4, a.pct) + "%", background: a.id === att.id ? "var(--accent-2)" : "var(--accent)" } })));
        page.appendChild(h("section", { class: "section card pad" }, h("div", { class: "section-head" }, h("h3", null, `Your attempts on this paper (${list.length})`), h("span", { class: "muted" }, `Best ${Math.round(Math.max(...list.map((a) => a.pct)))}%`)), spark));
      }
    }

    // question map
    const map = h("div", { class: "res-grid" });
    paper.questions.forEach((q, i) => {
      const st = res.per[i].status;
      const b = h("button", { class: `pq r-${st}${marked.has(i) ? " bm" : ""}`, type: "button", title: `Q${i + 1} · ${STATUS_LABEL[st]}` }, String(i + 1));
      b.addEventListener("click", () => jumpTo(i));
      map.appendChild(b);
    });
    page.appendChild(h("section", { class: "section card pad" }, h("div", { class: "section-head" }, h("h3", null, "Question map"), h("span", { class: "muted" }, "Click a number to jump to its review · ★ = you marked it for review")), map));

    // review list with filters
    const filters = [
      ["all", "All", paper.questions.length],
      ["wrong", "Wrong", res.wrong],
      ["skipped", "Not attempted", res.skipped],
      ["correct", "Correct", res.correct],
      ["marked", "Marked", marked.size],
      ["nokey", "Not graded", res.nokey],
    ].filter((f) => f[0] === "all" || f[2] > 0);
    let active = "all";
    let openAll = false;
    const chips = h("div", { class: "chip-wrap" });
    const list = h("div", null);
    const items = paper.questions.map((q, i) => GP.renderReviewItem(paper, q, i, att.resp[i], res.per[i], { qtime: qtime[i], marked: marked.has(i), rules: att.rules }));
    items.forEach((it) => list.appendChild(it));
    const applyFilter = () => {
      chips.replaceChildren(...filters.map(([k, label, n]) => h("button", { class: "chip" + (active === k ? " active" : ""), type: "button", onclick: () => { active = k; applyFilter(); } }, label, h("span", { class: "n" }, String(n)))));
      items.forEach((it, i) => {
        const st = res.per[i].status;
        const show = active === "all" || (active === "marked" ? marked.has(i) : st === active);
        it.classList.toggle("hidden", !show);
      });
    };
    const solBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => {
      openAll = !openAll;
      items.forEach((it) => {
        it._fill();
        const d = it.querySelector("details.sol");
        if (d) {
          d.open = openAll;
          d.dispatchEvent(new Event("toggle"));
        }
      });
      solBtn.textContent = openAll ? "Close all solutions" : "Open all solutions";
    } }, "Open all solutions");
    applyFilter();
    page.appendChild(h("section", { class: "section" },
      h("div", { class: "section-head" }, h("h2", null, "Answer review"), h("div", { class: "row" }, chips, solBtn)),
      list));

    function jumpTo(i) {
      if (items[i].classList.contains("hidden")) {
        active = "all";
        applyFilter();
      }
      jumpToItem(items, i);
    }

    setTimeout(() => lazyFill(list), 0);
    return page;
  };

  /* ------------------------------------------------------------- read mode */

  GP.views.read = async function ({ id }) {
    const paper = await GP.loadPaper(id);
    const meta = paper.meta;
    const page = h("div", { class: "page" });
    page.appendChild(crumbsFor(meta, ["Questions & solutions"]));
    const listWrap = h("div", null);
    let hidden = false;
    let open = false;
    const hideBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => {
      hidden = !hidden;
      listWrap.classList.toggle("hide-answers", hidden);
      hideBtn.textContent = hidden ? "Show answers" : "Hide answers (self test)";
    } }, "Hide answers (self test)");
    const items = paper.questions.map((q, i) => {
      const math = paper.math;
      const card = h("article", { class: "card read-q", id: "q-" + (i + 1) },
        h("div", { class: "rq-head" },
          h("span", { class: "qno" }, `Q${i + 1}`),
          GP.typeTag(q),
          GP.marksBadge(q, paper.countBased),
          q.section ? h("span", { class: "tag" }, q.section) : null,
          h("span", { class: "grow" }),
          h("a", { class: "btn btn-sm btn-ghost no-print", href: `#/practice/${paper.id}?q=${i}` }, "Practice"),
          GP.bookmarkBtn(paper.id, i, () => ({ s: GP.stripText(q.html).slice(0, 160), title: paper.title }))));
      card._fill = () => {
        if (card._filled) return;
        card._filled = true;
        card.appendChild(GP.renderQuestionBody(q, { math, resp: null, locked: true, reveal: true }));
        card.appendChild(h("div", { class: "answer-reveal" + (q.hasKey ? "" : " warn") }, h("span", { class: "muted" }, "Answer: "), h("b", null, GP.answerLabel(q))));
        card.appendChild(GP.renderSolution(q, math, open));
      };
      return card;
    });
    const solBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => {
      open = !open;
      items.forEach((it) => {
        it._fill();
        const d = it.querySelector("details.sol");
        if (d) {
          d.open = open;
          d.dispatchEvent(new Event("toggle"));
        }
      });
      solBtn.textContent = open ? "Close all solutions" : "Open all solutions";
    } }, "Open all solutions");
    const jump = h("select", { "aria-label": "Jump to question", onchange: (e) => jumpToItem(items, Number(e.target.value)) },
      paper.questions.map((q, i) => h("option", { value: String(i) }, `Q${i + 1} · ${q.type}`)));
    page.appendChild(h("section", { class: "card pad" },
      h("p", { class: "eyebrow" }, `${paper.code} · ${paper.provider}`),
      h("h1", { style: { fontSize: "clamp(20px,2.4vw,28px)", margin: "8px 0" } }, paper.title),
      h("p", { class: "muted" }, `${paper.questions.length} questions · ${GP.fmtMins(paper.durationSec)}${paper.countBased ? "" : " · " + GP.fmtNum(paper.max) + " marks"} · ${paper.series}`)));
    page.appendChild(h("div", { class: "card read-tools section" },
      hideBtn, solBtn, jump,
      h("button", { class: "btn btn-sm", type: "button", onclick: async () => {
        GP.toast("Preparing the printable paper…", 6000);
        items.forEach((it) => it._fill());
        open = true;
        solBtn.textContent = "Close all solutions";
        items.forEach((it) => { const d = it.querySelector("details.sol"); if (d) { d.open = true; d.dispatchEvent(new Event("toggle")); } });
        // wait for every image and formula instead of a fixed delay
        await new Promise((r) => setTimeout(r, 50));
        const imgs = GP.$$("img", listWrap);
        imgs.forEach((img) => (img.loading = "eager"));
        await Promise.race([
          Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); })))),
          new Promise((r) => setTimeout(r, 20000)),
        ]);
        await GP.mathIdle();
        window.print();
      } }, GP.icon("print"), "Print / PDF"),
      h("span", { class: "grow" }),
      h("a", { class: "btn btn-sm btn-primary", href: `#/exam/${paper.id}` }, "Start exam"),
      h("a", { class: "btn btn-sm", href: `#/practice/${paper.id}` }, "Practice")));
    items.forEach((it) => listWrap.appendChild(it));
    page.appendChild(listWrap);
    setTimeout(() => lazyFill(listWrap), 0);
    return page;
  };
})();
