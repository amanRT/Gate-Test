/* ==========================================================================
   GATE Practice Hub - question renderer, CBT exam session, practice session.
   ========================================================================== */
(function () {
  "use strict";
  const GP = window.GP;
  const { h } = GP;

  /* ------------------------------------------------------- question renderer */

  /**
   * Render the body of one question.
   * opts: { math, resp, onChange(resp), locked, reveal, keypad }
   * reveal => colour options by the key and show the answer line.
   */
  GP.renderQuestionBody = function (q, opts = {}) {
    const math = !!opts.math;
    const wrap = h("div", { class: "q-body" });
    if (q.sourceIssue) {
      wrap.appendChild(h("div", { class: "answer-reveal warn", style: { marginTop: "0", marginBottom: "12px" } }, h("b", null, "⚠ Source issue:"), h("span", null, q.sourceIssue)));
    }
    if (q.paragraph) {
      wrap.appendChild(h("div", { class: "para-box" }, h("div", { class: "lbl" }, "Common data / Passage"), GP.qhtml(q.paragraph, math)));
    }
    wrap.appendChild(GP.qhtml(q.html, math));

    if (q.type === "NAT") {
      wrap.appendChild(renderNat(q, opts));
    } else {
      wrap.appendChild(renderOptions(q, opts));
    }
    return wrap;
  };

  function renderOptions(q, opts) {
    const isMsq = q.type === "MSQ";
    const box = h("div", { class: "opts", role: isMsq ? "group" : "radiogroup" });
    const selected = () => {
      const r = opts.resp;
      if (isMsq) return new Set(Array.isArray(r) ? r : []);
      return new Set(r != null && r !== "" ? [String(r)] : []);
    };
    const keySet = new Set(q.hasKey ? q.answer : []);
    const paint = () => {
      const sel = selected();
      box.querySelectorAll(".opt").forEach((el) => {
        const k = el.dataset.key;
        const isSel = sel.has(k);
        el.classList.toggle("sel", isSel && !opts.reveal);
        el.setAttribute("aria-checked", String(isSel));
        if (opts.reveal) {
          el.classList.toggle("is-correct", keySet.has(k));
          el.classList.toggle("is-wrong", isSel && !keySet.has(k));
          el.classList.toggle("is-missed", isMsq && keySet.has(k) && !isSel && sel.size > 0);
          const mark = el.querySelector(".mark");
          if (mark) {
            mark.textContent = isSel && keySet.has(k) ? "Your answer ✓" : isSel ? "Your answer ✗" : keySet.has(k) ? "Correct" : "";
            mark.style.color = keySet.has(k) ? "var(--good)" : "var(--bad)";
          }
        }
      });
    };
    q.options.forEach((o, idx) => {
      const el = h(
        "div",
        {
          class: "opt" + (isMsq ? " msq" : "") + (opts.locked ? " locked" : ""),
          role: isMsq ? "checkbox" : "radio",
          tabindex: opts.locked ? null : "0",
          dataset: { key: o.key },
        },
        h("span", { class: "key" }, o.key),
        GP.qhtml(o.html, opts.math, "body"),
        opts.reveal ? h("span", { class: "mark" }) : null
      );
      const choose = () => {
        if (opts.locked) return;
        let next;
        if (isMsq) {
          const s = selected();
          if (s.has(o.key)) s.delete(o.key);
          else s.add(o.key);
          next = [...s].sort();
        } else {
          next = o.key;
        }
        opts.resp = next;
        paint();
        if (opts.onChange) opts.onChange(next);
      };
      el.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        choose();
      });
      // Space toggles a focused option; Enter is left to the session (Save & Next / Check)
      el.addEventListener("keydown", (e) => {
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          choose();
        }
      });
      box.appendChild(el);
      box.dataset["opt" + idx] = o.key;
    });
    box._paint = paint;
    box._choose = (key) => {
      const el = box.querySelector(`.opt[data-key="${key}"]`);
      if (el) el.click();
    };
    paint();
    return box;
  }

  function renderNat(q, opts) {
    const box = h("div", { class: "nat-box" });
    const input = h("input", {
      class: "nat-input",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: opts.locked ? "" : "Type numeric answer",
      "aria-label": "Numeric answer",
    });
    input.value = opts.resp != null ? String(opts.resp) : "";
    if (opts.locked) input.readOnly = true;
    if (opts.reveal) {
      const r = GP.evaluate(q, opts.resp);
      if (r.status === "correct") input.classList.add("ok");
      else if (r.status === "wrong") input.classList.add("bad");
    }
    const emit = () => {
      opts.resp = input.value;
      if (opts.onChange) opts.onChange(input.value);
    };
    input.addEventListener("input", () => {
      const clean = input.value.replace(/[−–]/g, "-").replace(/[^0-9.\-eE+]/g, "");
      if (clean !== input.value) input.value = clean;
      emit();
    });
    // typing must not trigger option shortcuts; Enter goes on to the session
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") e.stopPropagation();
    });
    box.appendChild(input);
    if (!opts.locked && opts.keypad !== false && GP.settings.keypad) {
      const press = (k) => {
        let v = input.value;
        if (k === "bs") v = v.slice(0, -1);
        else if (k === "clr") v = "";
        else if (k === "-") v = v.startsWith("-") ? v.slice(1) : "-" + v;
        else if (k === ".") v = v.includes(".") ? v : (v === "" || v === "-" ? v + "0." : v + ".");
        else v += k;
        input.value = v;
        emit();
      };
      const keys = [["7"], ["8"], ["9"], ["bs", "⌫"], ["4"], ["5"], ["6"], ["-", "±"], ["1"], ["2"], ["3"], [".", "."], ["0", "0", "wide"], ["clr", "Clear", "wide"]];
      box.appendChild(
        h("div", { class: "keypad" },
          keys.map(([k, label, cls]) =>
            // tabindex -1 + no focus on mousedown: Enter afterwards must not "press" the last key again
            h("button", { type: "button", class: cls || "", tabindex: "-1", onmousedown: (e) => e.preventDefault(), onclick: () => press(k) }, label || k)))
      );
    }
    box._input = input;
    return box;
  }

  GP.renderAnswerLine = function (q, resp, opts = {}) {
    const r = GP.evaluate(q, resp, opts.rules);
    let cls = "";
    let headline;
    if (!q.hasKey) {
      cls = "warn";
      headline = "Answer key not available for this question - check the solution below.";
    } else if (r.status === "correct") {
      cls = "good";
      headline = opts.countBased ? "Correct!" : `Correct! +${GP.fmtNum(r.pos)}`;
    } else if (r.status === "wrong") {
      cls = "bad";
      headline = opts.countBased || !r.neg ? "Incorrect" : `Incorrect  -${GP.fmtNum(r.neg)}`;
    } else {
      headline = "Not attempted";
    }
    return h(
      "div",
      { class: "answer-reveal " + cls },
      h("b", null, headline),
      h("span", { class: "muted" }, "Correct answer: ", h("b", null, GP.answerLabel(q))),
      GP.isAttempted(q, resp) ? h("span", { class: "muted" }, "Your answer: ", h("b", null, GP.respLabel(q, resp))) : null
    );
  };

  GP.renderSolution = function (q, math, open) {
    const has = q.solution && GP.stripText(q.solution).length + (q.solution.includes("<img") ? 1 : 0) > 0;
    const d = h("details", { class: "sol" }, h("summary", null, has ? "Solution" : "Solution (not provided)"));
    if (has) {
      let filled = false;
      const fill = () => {
        if (filled) return;
        filled = true;
        d.appendChild(GP.qhtml(q.solution, math));
      };
      d.addEventListener("toggle", () => d.open && fill());
      if (open) {
        d.open = true;
        fill();
      }
    } else {
      d.appendChild(h("div", { class: "qhtml muted" }, "No worked solution was included in the source paper."));
    }
    return d;
  };

  function marksBadge(q, countBased) {
    if (countBased) return h("span", { class: "marks" }, "Marks not specified in source");
    const neg = GP.negOf(q);
    return h(
      "span",
      { class: "marks", title: q.marksApprox ? "Estimated - the source paper lists only section totals" : "" },
      "Marks: ",
      h("span", { class: "p" }, "+" + GP.fmtNum(q.marks.pos)),
      " / ",
      h("span", { class: "n" }, neg ? "-" + GP.fmtNum(neg) : "0"),
      q.marksApprox ? " (est.)" : ""
    );
  }
  GP.marksBadge = marksBadge;

  function typeTag(q) {
    const label = { MCQ: "MCQ · single correct", MSQ: "MSQ · multiple correct", NAT: "NAT · numerical" }[q.type] || q.type;
    const cls = { MCQ: "tag-accent", MSQ: "tag-violet", NAT: "tag-warn" }[q.type] || "";
    return h("span", { class: "tag " + cls }, label);
  }
  GP.typeTag = typeTag;

  function bookmarkBtn(pid, qi, info) {
    const on = () => GP.bookmarks.has(pid, qi);
    const b = h("button", { class: "star-btn" + (on() ? " on" : ""), type: "button", title: "Bookmark question", style: { position: "static" } }, GP.icon("star"));
    b.addEventListener("click", () => {
      const now = GP.bookmarks.toggle(pid, qi, typeof info === "function" ? info() : info);
      b.classList.toggle("on", now);
      GP.toast(now ? "Question bookmarked" : "Bookmark removed");
    });
    return b;
  }
  GP.bookmarkBtn = bookmarkBtn;

  /* --------------------------------------------------------- shared helpers */

  function sectionIndexOf(paper, i) {
    for (let s = 0; s < paper.sections.length; s++) {
      const sec = paper.sections[s];
      if (i >= sec.start && i < sec.start + sec.count) return s;
    }
    return 0;
  }

  function cloneResp(r) {
    return Array.isArray(r) ? r.slice() : r;
  }

  function sameResp(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const x = Array.isArray(a) ? a : [];
      const y = Array.isArray(b) ? b : [];
      return x.length === y.length && x.every((v, i) => v === y[i]);
    }
    return (a ?? "") === (b ?? "");
  }

  function refOf(paper, q) {
    return q.ref ? q.ref : [paper.id, q.i];
  }

  /** A response worth saving: attempted, and for NAT an actual number. */
  function validResp(q, r) {
    return GP.isAttempted(q, r) && (q.type !== "NAT" || GP.parseNum(r) != null);
  }

  /** Keyboard -> option: a letter picks that option, a digit picks the n-th option shown. */
  function optionForKey(q, k) {
    if (!q.options || !q.options.length || !k || k.length !== 1) return null;
    if (/^[1-9]$/.test(k)) {
      const o = q.options[Number(k) - 1];
      return o ? o.key : null;
    }
    if (/^[a-z]$/i.test(k)) {
      const up = k.toUpperCase();
      return q.options.some((o) => o.key === up) ? up : null;
    }
    return null;
  }

  function instructionsBody(paper) {
    const qs = paper.questions;
    const types = qs.reduce((m, q) => ((m[q.type] = (m[q.type] || 0) + 1), m), {});
    const negs = new Set(qs.filter((q) => GP.negOf(q)).map((q) => `${q.type} ${GP.fmtNum(q.marks.pos)} mark → -${GP.fmtNum(GP.negOf(q))}`));
    return h(
      "div",
      { class: "instructions" },
      h("p", null, `${paper.title}`),
      h("p", { class: "muted" }, `${qs.length} questions · ${GP.fmtMins(paper.durationSec)} · ${paper.countBased ? "scored by number of correct answers" : "maximum " + GP.fmtNum(paper.max) + " marks"}`),
      h(
        "ul",
        null,
        h("li", null, `Question types: ${GP.typesText(types, ", ")}.`),
        h("li", null, "MCQ: one correct option. MSQ: one or more correct options - all must be chosen, no partial credit. NAT: type a number; it is correct when inside the key range."),
        paper.countBased
          ? h("li", null, "This source paper does not state per-question marks, so the score is the number of correct answers.")
          : h("li", null, negs.size ? `Negative marking: ${[...negs].join("; ")}. Unanswered questions score zero.` : "No negative marking in this paper."),
        h("li", null, "The countdown timer is at the top. When it reaches zero the test is submitted automatically."),
        h("li", null, GP.settings.strict
          ? "A response is saved only when you click Save & Next or Mark for Review & Next (exactly like the GATE CBT). Selecting an option and moving away without saving discards it."
          : "Responses are saved as soon as you select them (relaxed mode - change in Settings)."),
        h("li", null, "Questions marked for review that have an answer (Answered & Marked) are evaluated."),
        h("li", null, "Shortcuts: A-D / 1-4 choose an option, Enter = Save & Next, M = Mark for Review & Next, ← / → move between questions.")
      ),
      h(
        "div",
        { class: "legend-inline" },
        legendItem("nv", "Not visited"),
        legendItem("na", "Not answered"),
        legendItem("an", "Answered"),
        legendItem("mr", "Marked for review"),
        legendItem("amr", "Answered & marked (evaluated)")
      )
    );
  }
  GP.instructionsBody = instructionsBody;

  function legendItem(cls, label, count) {
    return h("div", { class: "it" }, h("span", { class: "pq " + cls }, count != null ? String(count) : ""), label);
  }

  /* ============================================================ EXAM SESSION */

  class ExamSession {
    constructor(root, paper, saved, meta) {
      this.root = root;
      this.paper = paper;
      this.meta = meta || {};
      this.key = meta.storeKey;
      const n = paper.questions.length;
      this.s = saved || {
        v: 1,
        startedAt: Date.now(),
        durationSec: paper.durationSec,
        remaining: paper.durationSec,
        cur: 0,
        visited: {},
        ans: {},
        marked: {},
        qtime: {},
        draft: null,
        paused: false,
      };
      this.s.visited = this.s.visited || {};
      this.s.ans = this.s.ans || {};
      this.s.marked = this.s.marked || {};
      this.s.qtime = this.s.qtime || {};
      if (this.s.cur >= n) this.s.cur = 0;
      this.n = n;
      this.lastTick = performance.now();
      this.saveCounter = 0;
      this.build();
      // a clicked button keeps focus, so Enter would "click" it again instead of Save & Next
      this.examEl.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("button");
        if (b && !b.closest(".calc")) b.blur();
      });
      this.go(this.s.cur, true);
      this.timer = setInterval(() => this.tick(), 1000);
      this.onKey = (e) => this.key_(e);
      document.addEventListener("keydown", this.onKey);
      this.onHide = () => this.persist();
      window.addEventListener("beforeunload", this.onHide);
      document.addEventListener("visibilitychange", this.onHide);
      if (this.s.paused) this.showPause();
      this.persist();
    }

    destroy() {
      clearInterval(this.timer);
      document.removeEventListener("keydown", this.onKey);
      window.removeEventListener("beforeunload", this.onHide);
      document.removeEventListener("visibilitychange", this.onHide);
      if (!this.finished) this.persist();
      GP.Calc && GP.Calc.close();
      document.body.classList.remove("exam-mode");
    }

    persist() {
      if (this.finished) return;
      const s = this.s;
      s.savedAt = Date.now();
      GP.store.set(this.key, Object.assign({}, s, { refs: this.paper.virtual ? this.paper.refs : undefined, meta: this.meta.runMeta || null }));
    }

    /* ---------------------------------------------------------------- build */
    build() {
      const p = this.paper;
      document.body.classList.add("exam-mode");
      this.timerEl = h("b", null, GP.fmtClock(this.s.remaining));
      this.timerBox = h("div", { class: "timer", title: "Time left" }, h("span", null, "Time left"), this.timerEl);
      this.pauseBtn = h("button", { class: "btn btn-sm", type: "button", onclick: () => this.togglePause() }, GP.icon("pause"), h("span", { class: "lbl" }, "Pause"));
      const top = h(
        "div",
        { class: "exam-top" },
        h("div", { class: "exam-title" }, h("strong", null, p.title), h("span", null, [p.code, p.provider, p.series].filter(Boolean).join(" · "))),
        this.timerBox,
        h("button", { class: "btn btn-sm", type: "button", title: "Scientific calculator", onclick: () => GP.Calc.toggle() }, GP.icon("calc"), h("span", { class: "lbl" }, "Calculator")),
        this.pauseBtn,
        h("button", { class: "btn btn-sm", type: "button", onclick: () => this.showInstructions() }, GP.icon("info"), h("span", { class: "lbl" }, "Instructions")),
        h("button", { class: "btn btn-sm pal-toggle", type: "button", onclick: () => this.side.classList.toggle("open") }, GP.icon("grid"), h("span", { class: "lbl" }, "Palette")),
        h("button", { class: "btn btn-sm btn-bad", type: "button", onclick: () => this.askSubmit() }, "Submit")
      );

      this.secTabs = h("div", { class: "sec-tabs" });
      this.qHead = h("div", { class: "q-head" });
      this.qInner = h("div", { class: "q-inner" });
      this.qScroll = h("div", { class: "q-scroll" }, this.qInner);
      const qpane = h("section", { class: "exam-q" }, this.secTabs, this.qHead, this.qScroll);

      this.legend = h("div", { class: "legend" });
      this.palScroll = h("div", { class: "pal-scroll" });
      this.side = h(
        "aside",
        { class: "exam-side" },
        h("div", { class: "side-close" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => this.side.classList.remove("open") }, GP.icon("close"), "Close")),
        h("div", { class: "cand" }, h("div", { class: "av" }, (GP.settings.name || "C").slice(0, 1).toUpperCase()),
          h("div", null, h("div", { class: "nm" }, GP.settings.name || "Divya"), h("div", { class: "sub" }, p.virtual ? "Custom test" : (p.code || "") + " · " + (p.category ? GP.CATEGORY_LABELS[p.category] || p.category : "Test")))),
        this.legend,
        this.palScroll,
        h("div", { class: "side-actions" },
          h("button", { class: "btn", type: "button", onclick: () => this.showPaper() }, "Question paper"),
          h("button", { class: "btn", type: "button", onclick: () => this.showInstructions() }, "Instructions"),
          h("button", { class: "btn btn-bad full", type: "button", onclick: () => this.askSubmit() }, "Submit test"))
      );

      const foot = h(
        "div",
        { class: "exam-foot" },
        h("button", { class: "btn btn-violet", type: "button", onclick: () => this.markNext() }, "Mark for Review & Next"),
        h("button", { class: "btn", type: "button", onclick: () => this.clear() }, "Clear Response"),
        h("div", { class: "grow" }),
        h("button", { class: "btn", type: "button", onclick: () => this.back() }, GP.icon("back"), "Back"),
        h("button", { class: "btn btn-good", type: "button", onclick: () => this.saveNext() }, "Save & Next", GP.icon("arrow"))
      );

      this.examEl = h("div", { class: "exam" }, top, h("div", { class: "exam-main" }, qpane, this.side), foot);
      this.root.replaceChildren(this.examEl);
    }

    /* ------------------------------------------------------------- statuses */
    statusOf(i) {
      if (!this.s.visited[i]) return "nv";
      const q = this.paper.questions[i];
      const answered = GP.isAttempted(q, this.s.ans[i]);
      if (this.s.marked[i]) return answered ? "amr" : "mr";
      return answered ? "an" : "na";
    }

    counts(range) {
      const c = { nv: 0, na: 0, an: 0, mr: 0, amr: 0 };
      const [a, b] = range || [0, this.n];
      for (let i = a; i < b; i++) c[this.statusOf(i)] += 1;
      return c;
    }

    renderChrome() {
      const p = this.paper;
      const curSec = sectionIndexOf(p, this.s.cur);
      // section tabs
      this.secTabs.replaceChildren(
        ...p.sections.map((sec, si) => {
          const c = this.counts([sec.start, sec.start + sec.count]);
          return h(
            "button",
            { class: "sec-tab" + (si === curSec ? " active" : ""), type: "button", onclick: () => this.leaveTo(sec.start) },
            sec.name,
            h("span", { class: "n" }, `${c.an + c.amr}/${sec.count}`)
          );
        })
      );
      this.secTabs.classList.toggle("hidden", p.sections.length < 2);
      // legend for current section
      const sec = p.sections[curSec];
      const c = this.counts([sec.start, sec.start + sec.count]);
      this.legend.replaceChildren(
        legendItem("an", "Answered", c.an),
        legendItem("na", "Not answered", c.na),
        legendItem("nv", "Not visited", c.nv),
        legendItem("mr", "Marked for review", c.mr),
        h("div", { class: "it full" }, h("span", { class: "pq amr" }, String(c.amr)), "Answered & marked for review (will be evaluated)")
      );
      // palette for current section (GATE shows the active section)
      const grid = h("div", { class: "pal-grid" });
      for (let i = sec.start; i < sec.start + sec.count; i++) {
        const st = this.statusOf(i);
        const b = h("button", { class: `pq ${st}${i === this.s.cur ? " cur" : ""}`, type: "button", title: `Question ${i + 1}` }, String(i + 1));
        b.addEventListener("click", () => {
          this.leaveTo(i);
          this.side.classList.remove("open");
        });
        grid.appendChild(b);
      }
      this.palScroll.replaceChildren(h("div", { class: "pal-sec" }, `${sec.name} · ${sec.count} questions`), grid);
    }

    renderQuestion() {
      const p = this.paper;
      const i = this.s.cur;
      const q = p.questions[i];
      const math = p.virtual ? q.srcMath : p.math;
      this.qTimeEl = h("span", { class: "qtime" }, "Time on question: " + GP.fmtClock(this.s.qtime[i] || 0));
      const [rpid, rqi] = refOf(p, q);
      GP.put(this.qHead, 
        h("span", { class: "qno" }, `Question ${i + 1}`),
        typeTag(q),
        marksBadge(q, p.countBased),
        q.srcTitle ? h("span", { class: "tag" }, q.srcTitle) : null,
        this.qTimeEl,
        bookmarkBtn(rpid, rqi, () => ({ s: GP.stripText(q.html).slice(0, 160), title: q.srcTitle || p.title }))
      );
      this.body = GP.renderQuestionBody(q, {
        math,
        resp: cloneResp(this.s.draft),
        onChange: (r) => {
          this.s.draft = cloneResp(r);
          if (!GP.settings.strict) {
            if (validResp(q, r)) this.s.ans[i] = cloneResp(r);
            else delete this.s.ans[i];
            this.renderChrome();
          }
        },
      });
      GP.clearMath(this.qInner);
      this.qInner.replaceChildren(this.body);
      this.qScroll.scrollTop = 0;
    }

    /* ----------------------------------------------------------- navigation */
    go(i, initial) {
      i = Math.max(0, Math.min(this.n - 1, i));
      this.s.cur = i;
      this.s.visited[i] = true;
      if (!initial || this.s.draft == null) this.s.draft = cloneResp(this.s.ans[i] ?? null);
      this.renderQuestion();
      this.renderChrome();
      this.persist();
    }

    /** Move away without saving (palette, section tab, Back). */
    leaveTo(i) {
      this.commitIfRelaxed();
      this.go(i);
    }

    commitIfRelaxed() {
      if (GP.settings.strict) return;
      const i = this.s.cur;
      const q = this.paper.questions[i];
      if (validResp(q, this.s.draft)) this.s.ans[i] = cloneResp(this.s.draft);
      else delete this.s.ans[i];
    }

    saveCurrent() {
      const i = this.s.cur;
      const q = this.paper.questions[i];
      if (GP.isAttempted(q, this.s.draft)) {
        if (q.type === "NAT" && GP.parseNum(this.s.draft) == null) {
          GP.toast("Enter a valid number (e.g. 12, -3.5, 0.25)");
          return false;
        }
        this.s.ans[i] = cloneResp(this.s.draft);
      } else {
        delete this.s.ans[i];
      }
      return true;
    }

    nextIndex() {
      return this.s.cur + 1 < this.n ? this.s.cur + 1 : 0;
    }

    saveNext() {
      if (!this.saveCurrent()) return;
      delete this.s.marked[this.s.cur];
      this.go(this.nextIndex());
    }

    markNext() {
      if (!this.saveCurrent()) return;
      this.s.marked[this.s.cur] = true;
      this.go(this.nextIndex());
    }

    clear() {
      const i = this.s.cur;
      this.s.draft = null;
      delete this.s.ans[i];
      this.renderQuestion();
      this.renderChrome();
      this.persist();
    }

    back() {
      if (this.s.cur > 0) this.leaveTo(this.s.cur - 1);
    }

    /* ---------------------------------------------------------------- timer */
    tick() {
      const now = performance.now();
      let dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      // Background tabs / a locked phone tick slowly - that time still counts, as in
      // a real exam. A gap over 10 minutes means the computer slept: treat it as a pause.
      if (dt > 600) {
        dt = 0;
        if (!this.s.paused && !this.finished) GP.toast("The timer was paused while your computer was asleep.", 4000);
      }
      if (this.s.paused || this.finished) return;
      this.s.remaining = Math.max(0, this.s.remaining - dt);
      const i = this.s.cur;
      this.s.qtime[i] = (this.s.qtime[i] || 0) + dt;
      const rem = Math.ceil(this.s.remaining);
      this.timerEl.textContent = GP.fmtClock(rem);
      this.timerBox.classList.toggle("low", rem <= 600);
      this.timerBox.classList.toggle("crit", rem <= 120);
      if (this.qTimeEl) this.qTimeEl.textContent = "Time on question: " + GP.fmtClock(this.s.qtime[i]);
      if (++this.saveCounter % 5 === 0) this.persist();
      if (this.s.remaining <= 0) {
        GP.toast("Time is up - your test has been submitted.", 4000);
        this.submit(true);
      }
    }

    togglePause() {
      this.s.paused = !this.s.paused;
      if (this.s.paused) this.showPause();
      else this.hidePause();
      this.persist();
    }

    showPause() {
      this.pauseBtn.replaceChildren(GP.icon("play"), h("span", { class: "lbl" }, "Resume"));
      if (this.veil) return;
      this.veil = h(
        "div",
        { class: "pause-veil" },
        h("div", { class: "box" }, h("h2", null, "Test paused"), h("p", { class: "muted" }, `Time left: ${GP.fmtClock(this.s.remaining)} · questions are hidden while paused.`),
          h("div", { class: "spacer" }), h("button", { class: "btn btn-primary btn-lg", type: "button", onclick: () => this.togglePause() }, GP.icon("play"), "Resume test"))
      );
      this.examEl.style.position = "relative";
      this.examEl.appendChild(this.veil);
    }

    hidePause() {
      this.pauseBtn.replaceChildren(GP.icon("pause"), h("span", { class: "lbl" }, "Pause"));
      if (this.veil) this.veil.remove();
      this.veil = null;
      this.lastTick = performance.now();
    }

    /* -------------------------------------------------------------- dialogs */
    showInstructions() {
      GP.modal({ title: "Instructions", body: instructionsBody(this.paper), wide: true });
    }

    showPaper() {
      const p = this.paper;
      const list = h("div", { class: "qlist" });
      p.questions.forEach((q, i) => {
        const st = this.statusOf(i);
        list.appendChild(
          h("div", { class: "qitem" },
            h("span", { class: "pq " + st, style: { width: "40px", flex: "none" } }, String(i + 1)),
            h("div", { class: "txt" }, h("div", { class: "s" }, GP.stripText(q.html).slice(0, 220) || "(question is an image)"), h("div", { class: "m" }, `${q.section || ""} · ${q.type}`)),
            h("div", { class: "acts" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => { GP.closeModals(); this.leaveTo(i); } }, "Go")))
        );
      });
      GP.modal({ title: "Question paper", body: list, wide: true });
    }

    summaryTable() {
      const rows = this.paper.sections.map((sec) => {
        const c = this.counts([sec.start, sec.start + sec.count]);
        return h("tr", null, h("td", null, sec.name), h("td", { class: "num" }, sec.count), h("td", { class: "num" }, c.an), h("td", { class: "num" }, c.na), h("td", { class: "num" }, c.mr), h("td", { class: "num" }, c.amr), h("td", { class: "num" }, c.nv));
      });
      return h(
        "div",
        { class: "tbl-wrap" },
        h("table", { class: "tbl" },
          h("thead", null, h("tr", null, ["Section", "Questions", "Answered", "Not answered", "Marked", "Answered & marked", "Not visited"].map((t, k) => h("th", { class: k ? "num" : "" }, t)))),
          h("tbody", null, rows))
      );
    }

    async askSubmit() {
      const unsaved = !GP.settings.strict ? false : !sameResp(this.s.draft ?? null, this.s.ans[this.s.cur] ?? null) && GP.isAttempted(this.paper.questions[this.s.cur], this.s.draft);
      const body = h(
        "div",
        { class: "stack" },
        h("p", null, `Time left: ${GP.fmtClock(this.s.remaining)}`),
        this.summaryTable(),
        unsaved ? h("p", { style: { color: "var(--warn)" } }, "The answer on the current question is not saved. Use Save & Next first if you want it counted.") : null,
        h("p", { class: "muted" }, "Once submitted you cannot change answers. The result and full solutions open next.")
      );
      const ok = await GP.modal({ title: "Submit the test?", body, wide: true, actions: [{ label: "Back to test", value: false }, { label: "Submit test", cls: "btn-bad", value: true }] });
      if (ok) this.submit(false);
    }

    submit(auto) {
      if (this.finished) return;
      this.commitIfRelaxed();
      const p = this.paper;
      const rules = GP.currentRules();
      const res = GP.scoreAll(p.questions, this.s.ans, { rules });
      const usedSec = Math.round(this.s.durationSec - this.s.remaining);
      const att = {
        id: GP.uid(),
        kind: p.virtual ? "custom" : "paper",
        paperId: p.virtual ? null : p.id,
        refs: p.virtual ? p.refs : undefined,
        title: p.title,
        code: p.code || (p.meta && p.meta.branch && p.meta.branch.code) || "",
        mode: "exam",
        startedAt: this.s.startedAt,
        submittedAt: Date.now(),
        durationSec: this.s.durationSec,
        timeUsedSec: usedSec,
        autoSubmitted: !!auto,
        countBased: !!p.countBased,
        resp: this.s.ans,
        marked: Object.keys(this.s.marked).map(Number),
        visited: Object.keys(this.s.visited).map(Number),
        qtime: Object.fromEntries(Object.entries(this.s.qtime).map(([k, v]) => [k, Math.round(v)])),
        summary: { score: res.score, max: res.max, pct: res.pct, correct: res.correct, wrong: res.wrong, skipped: res.skipped, nokey: res.nokey, total: res.total, accuracy: res.accuracy },
        breakdown: { bySection: res.bySection, byType: res.byType },
        rules,
        virtualMeta: p.virtual ? { title: p.title, subtitle: p.series, durationSec: p.durationSec } : undefined,
      };
      // Save first; only a stored attempt may replace the resumable run.
      if (!GP.attempts.save(att)) {
        this.s.paused = true;
        this.showPause();
        this.persist();
        GP.modal({
          title: "Could not save your result",
          body: "The browser's storage for this app is full, so the attempt was NOT submitted. Your answers are safe in the paused test. Go to Settings → Export backup, then delete some old attempts (or Erase progress) and submit again.",
          actions: [{ label: "OK", cls: "btn-primary", value: true }],
        });
        return;
      }
      this.finished = true;
      clearInterval(this.timer);
      p.questions.forEach((q, i) => {
        const [rpid, rqi] = refOf(p, q);
        GP.qstat.record(rpid, rqi, res.per[i].status);
      });
      GP.qstat.flush();
      GP.store.del(this.key);
      if (p.virtual) GP.store.del("custom.pending");
      GP.currentSession = null;
      this.destroy();
      location.hash = "#/result/" + att.id;
    }

    /* ------------------------------------------------------------ keyboard */
    key_(e) {
      if (GP.$(".modal-back")) return;
      if (e.target && e.target.closest && e.target.closest(".calc")) return;
      const tag = (e.target && e.target.tagName) || "";
      if (this.s.paused || this.finished) return;
      if (tag === "INPUT" && e.key === "Enter" && e.target.classList.contains("nat-input")) {
        e.preventDefault();
        if (!e.repeat) this.saveNext();
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // A focused button already reacts to Enter/Space natively - don't act twice.
      if ((tag === "BUTTON" || tag === "A") && (e.key === "Enter" || e.key === " ")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const q = this.paper.questions[this.s.cur];
      const optKey = q.type !== "NAT" ? optionForKey(q, k) : null;
      if (optKey) {
        const box = this.body && this.body.querySelector(".opts");
        if (box && box._choose) {
          e.preventDefault();
          box._choose(optKey);
        }
      } else if (e.repeat && (k === "Enter" || k === "m" || k === "M")) {
        e.preventDefault(); // holding the key must not race through the paper
      } else if (k === "Enter") {
        e.preventDefault();
        this.saveNext();
      } else if (k === "m" || k === "M") {
        e.preventDefault();
        this.markNext();
      } else if (k === "ArrowRight") {
        e.preventDefault();
        this.leaveTo(this.nextIndex());
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        this.back();
      }
    }
  }

  GP.startExam = function (root, paper, opts = {}) {
    const key = opts.storeKey || GP.runs.examKey(paper.id);
    const saved = opts.fresh ? null : GP.store.get(key, null);
    if (opts.fresh) GP.store.del(key);
    const sess = new ExamSession(root, paper, saved, { storeKey: key, runMeta: opts.runMeta });
    GP.currentSession = sess;
    return sess;
  };

  /* ======================================================== PRACTICE SESSION */

  // ans: responses · checked: status per checked question · seen: opened ·
  // qtime: seconds · self: self-grade for key-less questions · keyShown: the answer
  // was already displayed (later checks are not counted) · noCount: such a check
  const PRACTICE_MAPS = ["ans", "checked", "seen", "qtime", "self", "keyShown", "noCount"];

  class PracticeSession {
    static blank() {
      const s = { v: 2, startedAt: Date.now(), cur: 0 };
      PRACTICE_MAPS.forEach((k) => (s[k] = {}));
      return s;
    }

    constructor(root, paper, saved, meta) {
      this.root = root;
      this.paper = paper;
      this.key = meta.storeKey;
      this.meta = meta;
      this.n = paper.questions.length;
      this.s = saved || PracticeSession.blank();
      PRACTICE_MAPS.forEach((k) => {
        this.s[k] = this.s[k] || {};
        // defensive: never keep entries that point outside this set
        Object.keys(this.s[k]).forEach((i) => {
          if (!(Number(i) >= 0 && Number(i) < this.n)) delete this.s[k][i];
        });
      });
      if (meta.startAt != null && meta.startAt >= 0 && meta.startAt < this.n) this.s.cur = meta.startAt;
      if (!(this.s.cur >= 0 && this.s.cur < this.n)) this.s.cur = 0;
      this.lastTick = performance.now();
      this.build();
      this.examEl.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("button");
        if (b && !b.closest(".calc")) b.blur();
      });
      this.go(this.s.cur);
      this.timer = setInterval(() => this.tick(), 1000);
      this.onKey = (e) => this.key_(e);
      document.addEventListener("keydown", this.onKey);
      this.onHide = () => this.persist();
      window.addEventListener("beforeunload", this.onHide);
      document.addEventListener("visibilitychange", this.onHide);
    }

    destroy() {
      clearInterval(this.timer);
      document.removeEventListener("keydown", this.onKey);
      window.removeEventListener("beforeunload", this.onHide);
      document.removeEventListener("visibilitychange", this.onHide);
      this.persist();
      GP.qstat.flush();
      GP.Calc && GP.Calc.close();
      document.body.classList.remove("exam-mode");
    }

    persist() {
      GP.store.set(this.key, Object.assign({}, this.s, { refs: this.paper.virtual ? this.paper.refs : undefined, meta: this.meta.runMeta || null }));
    }

    build() {
      const p = this.paper;
      document.body.classList.add("exam-mode");
      this.progEl = h("span", null);
      this.watchEl = h("b", null, "00:00:00");
      const top = h(
        "div",
        { class: "exam-top" },
        h("div", { class: "exam-title" }, h("strong", null, "Practice · " + p.title), this.progEl),
        h("div", { class: "timer", title: "Time on this question" }, h("span", null, "This question"), this.watchEl),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => GP.Calc.toggle() }, GP.icon("calc"), h("span", { class: "lbl" }, "Calculator")),
        h("button", { class: "btn btn-sm pal-toggle", type: "button", onclick: () => this.side.classList.toggle("open") }, GP.icon("grid"), h("span", { class: "lbl" }, "Palette")),
        h("button", { class: "btn btn-sm", type: "button", onclick: () => this.finish() }, "Finish")
      );
      this.secTabs = h("div", { class: "sec-tabs" });
      this.qHead = h("div", { class: "q-head" });
      this.qInner = h("div", { class: "q-inner" });
      this.qScroll = h("div", { class: "q-scroll" }, this.qInner);
      this.legend = h("div", { class: "legend" });
      this.palScroll = h("div", { class: "pal-scroll" });
      this.side = h(
        "aside",
        { class: "exam-side" },
        h("div", { class: "side-close" }, h("button", { class: "btn btn-sm", type: "button", onclick: () => this.side.classList.remove("open") }, GP.icon("close"), "Close")),
        this.legend,
        this.palScroll,
        h("div", { class: "side-actions" },
          h("button", { class: "btn", type: "button", onclick: () => this.jumpUnseen() }, "Next unchecked"),
          h("button", { class: "btn", type: "button", onclick: () => this.reset() }, GP.icon("refresh"), "Reset"),
          h("button", { class: "btn btn-primary full", type: "button", onclick: () => this.finish() }, "Finish & see summary"))
      );
      this.checkBtn = h("button", { class: "btn btn-good", type: "button", onclick: () => this.check() }, GP.icon("check"), "Check answer");
      this.solBtn = h("button", { class: "btn", type: "button", onclick: () => this.reveal() }, "Show solution");
      const foot = h(
        "div",
        { class: "exam-foot" },
        this.checkBtn,
        this.solBtn,
        h("button", { class: "btn", type: "button", onclick: () => this.retry() }, "Try again"),
        h("div", { class: "grow" }),
        h("button", { class: "btn", type: "button", onclick: () => this.go(this.s.cur - 1) }, GP.icon("back"), "Prev"),
        h("button", { class: "btn btn-primary", type: "button", onclick: () => this.go(this.s.cur + 1) }, "Next", GP.icon("arrow"))
      );
      this.examEl = h("div", { class: "exam" }, top, h("div", { class: "exam-main" }, h("section", { class: "exam-q" }, this.secTabs, this.qHead, this.qScroll), this.side), foot);
      this.root.replaceChildren(this.examEl);
    }

    resultOf(i) {
      const st = this.s.checked[i];
      const self = this.s.self[i];
      if (self && (st === "nokey" || st === "revealed")) return self === "right" ? "correct" : "wrong";
      if (st) return st;
      return this.s.seen[i] ? "seen" : "unseen";
    }

    renderChrome() {
      const p = this.paper;
      const curSec = sectionIndexOf(p, this.s.cur);
      this.secTabs.replaceChildren(
        ...p.sections.map((sec, si) =>
          h("button", { class: "sec-tab" + (si === curSec ? " active" : ""), type: "button", onclick: () => this.go(sec.start) }, sec.name, h("span", { class: "n" }, String(sec.count)))
        )
      );
      this.secTabs.classList.toggle("hidden", p.sections.length < 2);
      const c = { correct: 0, wrong: 0, nokey: 0, revealed: 0 };
      for (let i = 0; i < this.n; i++) {
        const r = this.resultOf(i);
        if (r in c) c[r] += 1;
      }
      const checked = Object.keys(this.s.checked).length;
      const bm = GP.bookmarks.all(); // read once, not once per palette button
      this.progEl.textContent = `${checked}/${this.n} checked · ${c.correct} correct · ${c.wrong} wrong`;
      this.legend.replaceChildren(
        h("div", { class: "it" }, h("span", { class: "pq r-correct" }, String(c.correct)), "Correct"),
        h("div", { class: "it" }, h("span", { class: "pq r-wrong" }, String(c.wrong)), "Wrong"),
        h("div", { class: "it" }, h("span", { class: "pq r-seen" }, ""), "Seen / solution viewed"),
        h("div", { class: "it" }, h("span", { class: "pq nv" }, ""), "Not opened"),
        h("div", { class: "it full" }, h("span", { class: "pq r-nokey" }, String(c.nokey)), "Checked, answer key not available")
      );
      const frag = document.createDocumentFragment();
      p.sections.forEach((sec) => {
        frag.appendChild(h("div", { class: "pal-sec" }, `${sec.name} · ${sec.count}`));
        const grid = h("div", { class: "pal-grid" });
        for (let i = sec.start; i < sec.start + sec.count; i++) {
          const r = this.resultOf(i);
          const q = p.questions[i];
          const [rpid, rqi] = refOf(p, q);
          const cls = r === "unseen" ? "nv" : r === "seen" || r === "revealed" ? "r-seen" : "r-" + r;
          const b = h("button", { class: `pq ${cls}${i === this.s.cur ? " cur" : ""}${bm[rpid + ":" + rqi] ? " bm" : ""}`, type: "button" }, String(i + 1));
          b.addEventListener("click", () => {
            this.go(i);
            this.side.classList.remove("open");
          });
          grid.appendChild(b);
        }
        frag.appendChild(grid);
      });
      this.palScroll.replaceChildren(frag);
    }

    renderQuestion() {
      const p = this.paper;
      const i = this.s.cur;
      const q = p.questions[i];
      const math = p.virtual ? q.srcMath : p.math;
      const status = this.s.checked[i];
      const done = status && status !== "revealed";
      const [rpid, rqi] = refOf(p, q);
      const st = GP.qstat.get(rpid, rqi);
      GP.put(this.qHead, 
        h("span", { class: "qno" }, `Question ${i + 1} of ${this.n}`),
        typeTag(q),
        marksBadge(q, p.countBased || (q.ref && false)),
        q.srcTitle ? h("span", { class: "tag" }, q.srcTitle) : null,
        st && (st.c || st.w) ? h("span", { class: "tag " + (st.r === "w" ? "tag-bad" : "tag-good") }, `History: ${st.c}✓ ${st.w}✗`) : null,
        h("span", { class: "qtime" }),
        bookmarkBtn(rpid, rqi, () => ({ s: GP.stripText(q.html).slice(0, 160), title: q.srcTitle || p.title }))
      );
      const body = GP.renderQuestionBody(q, {
        math,
        resp: cloneResp(this.s.ans[i]),
        locked: !!done,
        reveal: !!done,
        onChange: (r) => {
          if (GP.isAttempted(q, r)) this.s.ans[i] = cloneResp(r);
          else delete this.s.ans[i];
        },
      });
      this.body = body;
      const inner = [body];
      if (done) inner.push(GP.renderAnswerLine(q, this.s.ans[i], { countBased: p.countBased }));
      if (done && this.s.noCount[i] && q.hasKey) inner.push(h("p", { class: "muted", style: { marginTop: "8px", fontSize: "13px" } }, "Not added to your history - the answer had already been shown for this question."));
      if (status && !q.hasKey) inner.push(this.selfGrade(i));
      if (status) inner.push(GP.renderSolution(q, math, true));
      GP.clearMath(this.qInner);
      this.qInner.replaceChildren(...inner);
      this.checkBtn.disabled = !!done;
      this.solBtn.disabled = !!status;
      this.watchEl.textContent = GP.fmtClock(this.s.qtime[i] || 0);
    }

    /** Questions without an official key: let the learner grade themselves after reading the solution. */
    selfGrade(i) {
      const q = this.paper.questions[i];
      const self = this.s.self;
      const mark = (verdict) => {
        const prev = self[i];
        if (prev === verdict) return;
        const [rpid, rqi] = refOf(this.paper, q);
        // changing your mind replaces the earlier verdict instead of adding another one
        if (prev) GP.qstat.unrecord(rpid, rqi, prev === "right" ? "correct" : "wrong");
        self[i] = verdict;
        GP.qstat.record(rpid, rqi, verdict === "right" ? "correct" : "wrong");
        GP.qstat.flush();
        this.renderQuestion();
        this.renderChrome();
        this.persist();
      };
      return h("div", { class: "answer-reveal warn" },
        h("b", null, "No official key - grade yourself after reading the solution:"),
        h("button", { class: "btn btn-sm btn-good", type: "button", onclick: () => mark("right") }, self[i] === "right" ? "✓ I was right" : "I was right"),
        h("button", { class: "btn btn-sm btn-bad", type: "button", onclick: () => mark("wrong") }, self[i] === "wrong" ? "✗ I was wrong" : "I was wrong"),
        self[i] ? h("span", { class: "muted" }, "Saved to your history" + (self[i] === "wrong" ? " and mistakes notebook." : ".")) : null);
    }

    go(i) {
      if (i < 0 || i >= this.n) {
        if (i >= this.n) GP.toast("That was the last question - Finish to see your summary.");
        return;
      }
      this.s.cur = i;
      this.s.seen[i] = true;
      this.renderQuestion();
      this.renderChrome();
      this.qScroll.scrollTop = 0;
      this.persist();
    }

    check() {
      const i = this.s.cur;
      const q = this.paper.questions[i];
      const resp = this.s.ans[i];
      if (!GP.isAttempted(q, resp)) {
        GP.toast(q.type === "NAT" ? "Type an answer first" : "Choose an option first");
        return;
      }
      if (q.type === "NAT" && GP.parseNum(resp) == null) {
        GP.toast("Enter a valid number");
        return;
      }
      const r = GP.evaluate(q, resp);
      this.s.checked[i] = r.status;
      // once the key has been shown (earlier check / solution), a re-check is practice only
      if (this.s.keyShown[i]) {
        this.s.noCount[i] = true;
      } else {
        delete this.s.noCount[i];
        const [rpid, rqi] = refOf(this.paper, q);
        GP.qstat.record(rpid, rqi, r.status);
        GP.qstat.flush();
      }
      if (q.hasKey) this.s.keyShown[i] = true;
      this.renderQuestion();
      this.renderChrome();
      this.persist();
    }

    reveal() {
      const i = this.s.cur;
      this.s.keyShown[i] = true;
      if (!this.s.checked[i]) this.s.checked[i] = "revealed";
      this.renderQuestion();
      this.renderChrome();
      this.qInner.querySelector("details.sol")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      this.persist();
    }

    retry() {
      const i = this.s.cur;
      delete this.s.checked[i];
      delete this.s.ans[i];
      delete this.s.self[i];
      delete this.s.noCount[i];
      this.renderQuestion();
      this.renderChrome();
      this.persist();
    }

    jumpUnseen() {
      for (let k = 1; k <= this.n; k++) {
        const i = (this.s.cur + k) % this.n;
        if (!this.s.checked[i]) {
          this.go(i);
          this.side.classList.remove("open");
          return;
        }
      }
      GP.toast("Every question has been checked.");
    }

    async reset() {
      const ok = await GP.confirm("Reset practice?", "Clears your practice answers for this set (your exam attempts and history stay).", "Reset", "btn-bad");
      if (!ok) return;
      this.s = PracticeSession.blank();
      this.go(0);
    }

    tick() {
      const now = performance.now();
      let dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      if (dt > 120) dt = 0;
      if (document.hidden) return;
      const i = this.s.cur;
      this.s.qtime[i] = (this.s.qtime[i] || 0) + dt;
      this.watchEl.textContent = GP.fmtClock(this.s.qtime[i]);
    }

    finish() {
      const p = this.paper;
      let correct = 0;
      let wrong = 0;
      let marks = 0;
      for (let i = 0; i < this.n; i++) {
        const r = this.resultOf(i);
        const q = p.questions[i];
        if (r === "correct") correct += 1;
        if (r === "wrong") wrong += 1;
        // marks only for questions graded against a real key
        if (q.hasKey && this.s.checked[i] === "correct") marks += q.marks.pos;
        if (q.hasKey && this.s.checked[i] === "wrong") marks -= GP.negOf(q);
      }
      const vals = Object.keys(this.s.checked);
      const time = Object.values(this.s.qtime).reduce((a, b) => a + b, 0);
      const body = h(
        "div",
        { class: "stack" },
        h("div", { class: "kpi-row" },
          h("div", { class: "kpi good" }, h("b", null, String(correct)), h("span", null, "Correct")),
          h("div", { class: "kpi bad" }, h("b", null, String(wrong)), h("span", null, "Wrong")),
          h("div", { class: "kpi" }, h("b", null, String(this.n - vals.length)), h("span", null, "Not checked")),
          h("div", { class: "kpi accent" }, h("b", null, correct + wrong ? Math.round((correct / (correct + wrong)) * 100) + "%" : "-"), h("span", null, "Accuracy")),
          p.countBased ? null : h("div", { class: "kpi violet" }, h("b", null, GP.fmtNum(marks)), h("span", null, "Marks (checked questions)")),
          h("div", { class: "kpi" }, h("b", null, GP.fmtDur(time)), h("span", null, "Time spent"))),
        h("p", { class: "muted" }, "Practice progress is saved automatically - you can come back any time. Wrong answers are added to your Mistakes notebook.")
      );
      GP.modal({
        title: "Practice summary",
        body,
        wide: true,
        actions: [
          { label: "Keep practising", value: "stay" },
          { label: "Reset practice", value: "reset", cls: "btn-bad" },
          { label: "Exit", value: "exit", cls: "btn-primary" },
        ],
      }).then((v) => {
        if (v === "reset") this.reset();
        if (v === "exit") history.length > 1 ? history.back() : (location.hash = "#/");
      });
    }

    key_(e) {
      if (GP.$(".modal-back")) return;
      if (e.target && e.target.closest && e.target.closest(".calc")) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Enter" && tag === "INPUT" && e.target.classList.contains("nat-input")) {
          e.preventDefault();
          if (e.repeat) return;
          const st = this.s.checked[this.s.cur];
          if (st && st !== "revealed") this.go(this.s.cur + 1);
          else this.check();
        }
        return;
      }
      if ((tag === "BUTTON" || tag === "A") && (e.key === "Enter" || e.key === " ")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const i = this.s.cur;
      const q = this.paper.questions[i];
      const st = this.s.checked[i];
      const locked = st && st !== "revealed";
      const optKey = q.type !== "NAT" && !locked ? optionForKey(q, k) : null;
      if (optKey) {
        const box = this.body && this.body.querySelector(".opts");
        if (box && box._choose) box._choose(optKey);
      } else if (k === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        if (locked || (st === "revealed" && !GP.isAttempted(q, this.s.ans[i]))) this.go(i + 1);
        else this.check();
      } else if (k === "ArrowRight") {
        this.go(this.s.cur + 1);
      } else if (k === "ArrowLeft") {
        this.go(this.s.cur - 1);
      } else if (k === "s" || k === "S") {
        this.reveal();
      }
    }
  }

  GP.startPractice = function (root, paper, opts = {}) {
    const key = opts.storeKey || GP.runs.pracKey(paper.id);
    const saved = opts.fresh ? null : GP.store.get(key, null);
    const sess = new PracticeSession(root, paper, saved, { storeKey: key, startAt: opts.startAt, runMeta: opts.runMeta });
    GP.currentSession = sess;
    return sess;
  };
})();
