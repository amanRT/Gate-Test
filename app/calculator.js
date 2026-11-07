/* ==========================================================================
   GATE Practice Hub - virtual scientific calculator
   Expression entry with real precedence: 2+3×4 = 14, 1÷2π = 1/(2π) (implicit
   products bind tighter than × ÷), −2² = −4, 2^−1 = 0.5.  Degrees / radians,
   memory, history, keyboard, draggable floating panel.
   window.GP.Calc.open() / close() / toggle() / evaluate(expr, deg) / format(v)
   ========================================================================== */
(function () {
  "use strict";
  const GP = (window.GP = window.GP || {});

  const STATE_KEY = "gp.calc";
  const st = { angle: "deg", mem: 0, ans: 0, lastExpr: "" };
  try {
    Object.assign(st, { angle: (JSON.parse(localStorage.getItem(STATE_KEY) || "{}").angle === "rad" ? "rad" : "deg") });
  } catch (_e) {
    /* ignore */
  }
  const saveState = () => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ angle: st.angle }));
    } catch (_e) {
      /* ignore */
    }
  };

  /* ------------------------------------------------------------ evaluator */

  // sin(180°) is 1.2e-16 in floating point; snap such residue to an exact 0
  const snap = (v) => (Math.abs(v) < 1e-13 ? 0 : v);
  const toRad = (x, d) => (d ? (x * Math.PI) / 180 : x);
  const FUNCS = {
    sin: (x, d) => snap(Math.sin(toRad(x, d))),
    cos: (x, d) => snap(Math.cos(toRad(x, d))),
    tan: (x, d) => (Math.abs(Math.cos(toRad(x, d))) < 1e-12 ? NaN : snap(Math.tan(toRad(x, d)))),
    asin: (x, d) => (d ? (Math.asin(x) * 180) / Math.PI : Math.asin(x)),
    acos: (x, d) => (d ? (Math.acos(x) * 180) / Math.PI : Math.acos(x)),
    atan: (x, d) => (d ? (Math.atan(x) * 180) / Math.PI : Math.atan(x)),
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    ln: Math.log,
    log: Math.log10,
    log2: Math.log2,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    exp: Math.exp,
  };
  // longest names first so "asinh" wins over "asin", "log2" over "log"
  const NAMES = Object.keys(FUNCS).concat(["pi", "Ans", "mod", "e"]).sort((a, b) => b.length - a.length);

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function tokenize(src) {
    const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi");
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === " ") {
        i++;
        continue;
      }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        if (s[j] === "E" && /[-+0-9]/.test(s[j + 1] || "")) {
          j++;
          if (s[j] === "-" || s[j] === "+") j++;
          while (j < s.length && /[0-9]/.test(s[j])) j++;
        }
        const raw = s.slice(i, j);
        if ((raw.match(/\./g) || []).length > 1 || raw === ".") throw new Error("Syntax error");
        out.push({ t: "num", v: parseFloat(raw) });
        i = j;
        continue;
      }
      const name = NAMES.find((n) => s.startsWith(n, i));
      if (name) {
        if (name === "pi") out.push({ t: "num", v: Math.PI });
        else if (name === "e") out.push({ t: "num", v: Math.E });
        else if (name === "Ans") out.push({ t: "num", v: st.ans || 0 });
        else if (name === "mod") out.push({ t: "op", v: "mod" });
        else out.push({ t: "fn", v: name });
        i += name.length;
        continue;
      }
      if ("+-*/^()!".includes(c)) {
        out.push({ t: c === "(" || c === ")" ? c : c === "!" ? "post" : "op", v: c });
        i++;
        continue;
      }
      throw new Error("Syntax error");
    }
    // implicit multiplication (2π, 3(4), )(, 2sin30, π2) - binds tighter than × and ÷
    const res = [];
    for (const b of out) {
      const a = res[res.length - 1];
      if (a && (a.t === "num" || a.t === ")" || a.t === "post") && (b.t === "num" || b.t === "(" || b.t === "fn")) {
        res.push({ t: "op", v: "imul" });
      }
      res.push(b);
    }
    return res;
  }

  // expr := term (('+'|'-') term)* ; term := unary (('*'|'/'|'mod') unary)*
  // unary := ('-'|'+') unary | implicit ; implicit := power ('imul' power)*
  // power := postfix ('^' unary)? ; postfix := primary '!'* ; primary := num | fn arg | '(' expr ')'
  function evaluate(src, deg) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = (...vs) => peek() && peek().t === "op" && vs.includes(peek().v);
    function expr() {
      let v = term();
      while (isOp("+", "-")) {
        const op = next().v;
        const r = term();
        v = op === "+" ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = unary();
      while (isOp("*", "/", "mod")) {
        const op = next().v;
        const r = unary();
        if (op === "*") v *= r;
        else if (op === "/") v = r === 0 ? NaN : v / r;
        else v = r === 0 ? NaN : ((v % r) + r) % r;
      }
      return v;
    }
    function unary() {
      if (isOp("-", "+")) {
        const op = next().v;
        const v = unary();
        return op === "-" ? -v : v;
      }
      return implicit();
    }
    function implicit() {
      let v = power();
      while (isOp("imul")) {
        next();
        v *= power();
      }
      return v;
    }
    function power() {
      const base = postfix();
      if (isOp("^")) {
        next();
        return Math.pow(base, unary());
      }
      return base;
    }
    function postfix() {
      let v = primary();
      while (peek() && peek().t === "post") {
        next();
        v = factorial(v);
      }
      return v;
    }
    function primary() {
      const tk = next();
      if (!tk) throw new Error("Syntax error");
      if (tk.t === "num") return tk.v;
      if (tk.t === "(") {
        const v = expr();
        if (peek() && peek().t === ")") next();
        return v;
      }
      if (tk.t === "fn") {
        const arg = peek() && peek().t === "(" ? primary() : postfix();
        return FUNCS[tk.v](arg, deg);
      }
      throw new Error("Syntax error");
    }
    const v = expr();
    if (p < toks.length) throw new Error("Syntax error");
    return v;
  }

  /** Display a number; exponents are written with "E" so the value can be typed back in. */
  function fmt(v) {
    if (typeof v !== "number" || !isFinite(v)) return "Math error";
    if (v === 0) return "0";
    const r = parseFloat(v.toPrecision(12));
    const a = Math.abs(r);
    if (a >= 1e12 || a < 1e-6) {
      return r.toExponential(11).replace(/\.?0+e/, "e").replace("e+", "E").replace("e", "E");
    }
    return String(r);
  }

  /** A value as a safe piece of expression ("(−1.6E−19)" stays one number). */
  function asExpr(v) {
    const s = fmt(v);
    if (s === "Math error") return "0";
    return s.startsWith("-") || s.includes("E") ? "(" + s.replace(/-/g, "−") + ")" : s;
  }

  /* ----------------------------------------------------------------- UI */

  let panel = null;
  let exprEl, valEl, flagsEl, histEl, angleBtn;
  let expr = "";
  let justEvaluated = false;
  let errorShown = false; // "Syntax error" stays visible until the next key
  const history = [];

  function build() {
    const { h } = GP;
    exprEl = h("div", { class: "calc-expr" });
    valEl = h("div", { class: "calc-val" }, "0");
    flagsEl = h("div", { class: "calc-flags" });
    histEl = h("div", { class: "calc-hist" });
    const keys = h("div", { class: "calc-keys" });
    const K = (label, action, cls, title) => {
      const b = h("button", { type: "button", class: cls || "", title: title || label }, label);
      b.addEventListener("click", () => {
        errorShown = false;
        action();
        refresh();
      });
      keys.appendChild(b);
      return b;
    };
    const ins = (s) => () => insert(s);
    const fn = (name) => () => insert(name + "(");

    // 8 columns: scientific keys on the left, number pad on the right
    angleBtn = K(st.angle === "deg" ? "Deg" : "Rad", toggleAngle, "mode active", "Degrees / radians");
    K("MC", () => (st.mem = 0), "mode", "Memory clear");
    K("MR", () => insertValue(asExpr(st.mem || 0)), "mode", "Memory recall");
    K("MS", () => (st.mem = currentValue()), "mode", "Memory store");
    K("M+", () => (st.mem = (st.mem || 0) + currentValue()), "mode", "Memory add");
    K("M−", () => (st.mem = (st.mem || 0) - currentValue()), "mode", "Memory subtract");
    K("⌫", backspace, "danger", "Backspace");
    K("C", clearAll, "danger", "Clear");

    K("sin", fn("sin"));
    K("cos", fn("cos"));
    K("tan", fn("tan"));
    K("π", ins("π"));
    K("(", ins("("));
    K(")", ins(")"));
    K("mod", ins(" mod "), "op");
    K("÷", ins("÷"), "op");

    K("sin⁻¹", fn("asin"));
    K("cos⁻¹", fn("acos"));
    K("tan⁻¹", fn("atan"));
    K("e", ins("e"));
    K("7", ins("7"), "num");
    K("8", ins("8"), "num");
    K("9", ins("9"), "num");
    K("×", ins("×"), "op");

    K("sinh", fn("sinh"));
    K("cosh", fn("cosh"));
    K("tanh", fn("tanh"));
    K("x²", ins("^2"));
    K("4", ins("4"), "num");
    K("5", ins("5"), "num");
    K("6", ins("6"), "num");
    K("−", ins("−"), "op");

    K("ln", fn("ln"));
    K("log", fn("log"));
    K("log₂", fn("log2"));
    K("√x", fn("sqrt"));
    K("1", ins("1"), "num");
    K("2", ins("2"), "num");
    K("3", ins("3"), "num");
    K("+", ins("+"), "op");

    K("eˣ", ins("e^("));
    K("10ˣ", ins("10^("));
    K("xʸ", ins("^"));
    K("ʸ√x", ins("^(1/"), "", "y-th root: x ^ (1/y)");
    K("±", negate, "", "Change sign");
    K("0", ins("0"), "num");
    K(".", ins("."), "num");
    K("=", evalNow, "eq");

    K("sinh⁻¹", fn("asinh"));
    K("cosh⁻¹", fn("acosh"));
    K("tanh⁻¹", fn("atanh"));
    K("x³", ins("^3"));
    K("∛x", fn("cbrt"));
    K("1/x", ins("^(−1)"));
    K("|x|", fn("abs"));
    K("n!", ins("!"));

    K("EXP", ins("E"), "", "×10^ (scientific notation)");
    K("Ans", ins("Ans"), "", "Last answer");

    const head = h(
      "div",
      { class: "calc-head" },
      h("b", null, "Scientific calculator"),
      h("button", { type: "button", title: "Close (Esc)", "aria-label": "Close calculator", onclick: close }, "×")
    );
    panel = h("div", { class: "calc hidden", role: "dialog", "aria-label": "Scientific calculator", tabindex: "-1" },
      head, h("div", { class: "calc-screen" }, exprEl, valEl, flagsEl), keys, histEl);
    document.body.appendChild(panel);
    drag(head);
    // capture phase: when the calculator takes a key, the exam underneath never sees it
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", () => {
      if (panel && !panel.classList.contains("hidden")) {
        const r = panel.getBoundingClientRect();
        place(r.left, r.top);
      }
    });
    refresh();
  }

  function currentValue() {
    if (justEvaluated) return st.ans || 0;
    try {
      const v = evaluate(closeParens(expr || "0"), st.angle === "deg");
      return isFinite(v) ? v : 0;
    } catch (_e) {
      return 0;
    }
  }

  function closeParens(s) {
    const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
    return s + ")".repeat(Math.max(0, open));
  }

  function insert(s) {
    if (justEvaluated) {
      // an operator right after "=" continues from the answer; anything else starts afresh
      expr = /^(?:[+×÷−^!]| mod )/.test(s) ? "Ans" : "";
      justEvaluated = false;
    }
    expr += s;
  }

  /** Insert a complete value (memory, history): never treated as "continue from Ans". */
  function insertValue(s) {
    if (justEvaluated) {
      expr = "";
      justEvaluated = false;
    }
    expr += s;
  }

  function backspace() {
    justEvaluated = false;
    const m = expr.match(/(asinh\(|acosh\(|atanh\(|asin\(|acos\(|atan\(|sinh\(|cosh\(|tanh\(|sin\(|cos\(|tan\(|log2\(|sqrt\(|cbrt\(|abs\(|ln\(|log\(| mod |Ans)$/);
    expr = m ? expr.slice(0, -m[0].length) : expr.slice(0, -1);
  }

  function clearAll() {
    expr = "";
    justEvaluated = false;
    valEl.textContent = "0";
  }

  function negate() {
    if (justEvaluated) {
      expr = "−(Ans)";
      justEvaluated = false;
      return;
    }
    const m = expr.match(/((?:\d+\.?\d*|\.\d+)(?:E[−-]?\d+)?)$/);
    if (m) {
      const before = expr.slice(0, -m[0].length);
      // toggling twice gives the plain number back, not "(5"
      if (before.endsWith("(−")) expr = before.slice(0, -2) + m[0];
      else expr = before + "(−" + m[0];
    } else {
      expr += "−";
    }
  }

  function toggleAngle() {
    // switches the mode for what comes next; a shown result is not recomputed
    st.angle = st.angle === "deg" ? "rad" : "deg";
    angleBtn.textContent = st.angle === "deg" ? "Deg" : "Rad";
    saveState();
  }

  function evalNow() {
    if (justEvaluated || !expr.trim()) return;
    try {
      const full = closeParens(expr);
      const v = evaluate(full, st.angle === "deg");
      const out = fmt(v);
      if (out === "Math error") {
        valEl.textContent = out;
        errorShown = true;
        return; // keep the expression so it can be corrected
      }
      st.ans = parseFloat(v.toPrecision(12));
      history.unshift({ e: full, r: out, v: st.ans });
      history.length = Math.min(history.length, 12);
      st.lastExpr = full;
      expr = full;
      valEl.textContent = out;
      justEvaluated = true;
    } catch (_e) {
      valEl.textContent = "Syntax error";
      errorShown = true;
    }
  }

  function refresh() {
    exprEl.textContent = expr || " ";
    if (!justEvaluated && !errorShown) {
      // live preview of the current expression
      try {
        valEl.textContent = expr ? fmt(evaluate(closeParens(expr), st.angle === "deg")) : "0";
        if (valEl.textContent === "Math error") valEl.textContent = "…";
      } catch (_e) {
        valEl.textContent = "…";
      }
    }
    flagsEl.replaceChildren(
      GP.h("span", { class: "on" }, st.angle === "deg" ? "DEG" : "RAD"),
      GP.h("span", { class: st.mem ? "on" : "" }, st.mem ? "M = " + fmt(st.mem) : "M"),
      GP.h("span", null, "Ans = " + fmt(st.ans || 0))
    );
    histEl.replaceChildren(
      ...history.map((it) => {
        const row = GP.h("div", { title: "Use this result" }, GP.h("span", null, it.e), GP.h("b", null, it.r));
        row.addEventListener("click", () => {
          insertValue(asExpr(it.v));
          refresh();
        });
        return row;
      })
    );
  }

  function onKey(e) {
    if (!panel || panel.classList.contains("hidden")) return;
    if (document.querySelector(".modal-back")) return;
    const ae = document.activeElement;
    const inPanel = panel.contains(ae);
    // inputs, options and buttons of the page keep their own keys; a click on plain
    // question text (focus on body / main) still lets the calculator take typing
    const interactive = ae && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(ae.tagName) || ae.isContentEditable || (ae.classList && ae.classList.contains("opt")));
    if (!inPanel && interactive) return;
    const k = e.key;
    const map = { "*": "×", "/": "÷", "-": "−", "+": "+", "^": "^", "(": "(", ")": ")", "!": "!", ".": ".", "%": " mod " };
    let handled = true;
    const wasError = errorShown;
    errorShown = false;
    if (e.ctrlKey || e.metaKey || e.altKey) handled = false;
    else if (/^[0-9]$/.test(k)) insert(k);
    else if (map[k]) insert(map[k]);
    else if (k === "Enter" || k === "=") evalNow();
    else if (k === "Backspace") backspace();
    else if (k === "Delete") clearAll();
    else if (k === "Escape") close();
    else handled = false;
    if (!handled) errorShown = wasError;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      if (panel && !panel.classList.contains("hidden")) refresh();
    }
  }

  function drag(handle) {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let on = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      on = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!on) return;
      place(ox + e.clientX - sx, oy + e.clientY - sy);
    });
    handle.addEventListener("pointerup", () => {
      on = false;
      const r = panel.getBoundingClientRect();
      st.pos = [r.left, r.top];
    });
  }

  function place(x, y) {
    const w = panel.offsetWidth || 430;
    const hgt = Math.min(panel.offsetHeight || 480, window.innerHeight - 16);
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(8, Math.min(window.innerHeight - hgt - 8, y));
    panel.style.left = x + "px";
    panel.style.top = y + "px";
  }

  function open() {
    if (!panel) build();
    panel.classList.remove("hidden");
    const pos = st.pos || [window.innerWidth - (panel.offsetWidth || 430) - 24, 70];
    place(pos[0], pos[1]);
    panel.focus({ preventScroll: true });
    refresh();
  }

  function close() {
    if (panel) panel.classList.add("hidden");
  }

  function toggle() {
    if (!panel || panel.classList.contains("hidden")) open();
    else close();
  }

  GP.Calc = {
    open,
    close,
    toggle,
    isOpen: () => !!panel && !panel.classList.contains("hidden"),
    evaluate: (s, deg = true) => evaluate(s, deg),
    format: fmt,
  };
})();
