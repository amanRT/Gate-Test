/* ==========================================================================
   GATE Practice Hub - router and app bootstrap.
   Routes (hash based so the app also works when opened from disk):
     #/                    library home          #/b/<CODE>        branch
     #/s/<seriesId>        papers of a series    #/p/<paperId>     paper overview
     #/exam/<paperId>      CBT exam              #/practice/<id>   practice mode
     #/read/<paperId>      questions & solutions #/result/<id>     result + review
     #/custom/<mode>       custom set            #/search?q=       search
     #/bank #/bookmarks #/mistakes #/stats #/settings
   ========================================================================== */
(function () {
  "use strict";
  const GP = window.GP;
  const { h } = GP;

  const ROUTES = [
    [/^\/?$/, "home", []],
    [/^\/b\/([^/]+)$/, "branch", ["code"]],
    [/^\/s\/([^/]+)$/, "series", ["id"]],
    [/^\/p\/([^/]+)$/, "paper", ["id"]],
    [/^\/exam\/([^/]+)$/, "exam", ["id"]],
    [/^\/practice\/([^/]+)$/, "practice", ["id"]],
    [/^\/read\/([^/]+)$/, "read", ["id"]],
    [/^\/result\/([^/]+)$/, "result", ["id"]],
    [/^\/custom\/(exam|practice)$/, "custom", ["mode"]],
    [/^\/search$/, "search", []],
    [/^\/bank$/, "bank", []],
    [/^\/bookmarks$/, "bookmarks", []],
    [/^\/mistakes$/, "mistakes", []],
    [/^\/stats$/, "stats", []],
    [/^\/settings$/, "settings", []],
  ];
  const NAV_OF = { home: "home", branch: "home", series: "home", paper: "home", read: "home", result: "home", bank: "bank", bookmarks: "bookmarks", mistakes: "mistakes", stats: "stats" };

  function parse() {
    const raw = (location.hash || "#/").slice(1) || "/";
    const qi = raw.indexOf("?");
    let path = qi >= 0 ? raw.slice(0, qi) : raw;
    try {
      path = decodeURIComponent(path);
    } catch (_e) {
      /* a malformed %-escape (e.g. "#/p/100%") simply matches no route */
    }
    const query = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : "");
    for (const [re, name, keys] of ROUTES) {
      const m = re.exec(path);
      if (m) {
        const params = { query };
        keys.forEach((k, i) => (params[k] = m[i + 1]));
        return { name, params };
      }
    }
    return { name: "notfound", params: { query } };
  }

  let token = 0;
  let lastName = null;
  // Back to a long list returns to where you were: remember the scroll of every
  // page left, and treat a jump to the previous entry of our own stack as "back".
  let prevHash = null;
  const scrollPos = new Map();
  const navStack = [];

  GP.route = async function route() {
    const my = ++token;
    const alive = () => my === token;
    const hash = location.hash || "#/";
    if (prevHash !== null && prevHash !== hash) scrollPos.set(prevHash, window.scrollY);
    let isBack = false;
    if (navStack.length >= 2 && navStack[navStack.length - 2] === hash) {
      navStack.pop();
      isBack = true;
    } else if (navStack[navStack.length - 1] !== hash) {
      navStack.push(hash);
      if (navStack.length > 60) navStack.shift();
    }
    prevHash = hash;
    if (GP.currentSession) {
      GP.currentSession.destroy();
      GP.currentSession = null;
    }
    document.body.classList.remove("exam-mode");
    GP.closeModals();
    const { name, params } = parse();
    GP.$$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === NAV_OF[name]));
    const s = GP.$("#global-search");
    if (s && document.activeElement !== s) s.value = name === "search" ? params.query.get("q") || "" : "";
    const app = GP.$("#app");
    GP.clearMath(app);
    const view = GP.views[name];
    if (!view) {
      app.replaceChildren(h("div", { class: "page" }, h("div", { class: "empty" }, h("strong", null, "Page not found"), h("a", { class: "btn", href: "#/" }, "Go to library"))));
      return;
    }
    const slow = setTimeout(() => {
      if (alive()) app.replaceChildren(h("div", { class: "boot" }, "Loading…"));
    }, 120);
    try {
      const node = await view(params, app, alive);
      clearTimeout(slow);
      if (!alive()) return;
      if (node) {
        app.replaceChildren(node);
        if (isBack && scrollPos.has(hash)) {
          const y = scrollPos.get(hash);
          window.scrollTo(0, y); // content is in the DOM: layout is forced synchronously
          setTimeout(() => {
            if (window.scrollY < y - 4) window.scrollTo(0, y); // late layout (images) may have clamped it
          }, 80);
        } else if (name !== lastName || name !== "search") {
          window.scrollTo(0, 0);
        }
        document.title = titleFor(name, params);
      } else {
        document.title = titleFor(name, params);
      }
      lastName = name;
    } catch (err) {
      clearTimeout(slow);
      if (!alive()) return;
      console.error(err);
      app.replaceChildren(h("div", { class: "page" }, h("div", { class: "empty" },
        h("strong", null, "Something went wrong"),
        h("span", null, String(err && err.message ? err.message : err)),
        h("p", { class: "muted", style: { marginTop: "8px" } }, "If you opened index.html straight from the folder and data does not load, run START.bat (local server) instead."),
        h("div", { style: { marginTop: "12px" } }, h("a", { class: "btn", href: "#/" }, "Go to library")))));
    }
  };

  function titleFor(name, params) {
    const base = "Divya's GATE Prep";
    const p = params.id && GP.idx.papers.get(params.id);
    if (p && ["paper", "exam", "practice", "read"].includes(name)) return `${p.title} - ${base}`;
    if (name === "branch" && GP.idx.branches.get(params.code)) return `${GP.idx.branches.get(params.code).name} - ${base}`;
    if (name === "series" && GP.idx.series.get(params.id)) return `${GP.idx.series.get(params.id).name} - ${base}`;
    if (name === "result") return `Result - ${base}`;
    return base;
  }

  /* ---------------------------------------------------------------- boot */

  function bindChrome() {
    // our router restores list positions itself; the browser's own restoration would
    // fight it (it scrolls before the page is rendered and clamps to the old height)
    try {
      history.scrollRestoration = "manual";
    } catch (_e) {
      /* ignore */
    }
    GP.$$("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => GP.applyTheme(b.dataset.themeBtn)));
    GP.applyTheme(GP.settings.theme);

    const search = GP.$("#global-search");
    let timer = 0;
    const go = () => {
      const q = search.value.trim();
      if (!q) {
        if (parse().name === "search") location.hash = "#/";
        return;
      }
      const cur = parse();
      const t = cur.name === "search" ? cur.params.query.get("t") || "papers" : "papers";
      const target = "#/search?" + new URLSearchParams({ q, t }).toString();
      if (cur.name === "search") {
        history.replaceState(null, "", target);
        GP.route();
      } else {
        location.hash = target;
      }
    };
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(go, 220);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(timer);
        go();
      } else if (e.key === "Escape") {
        search.value = "";
        search.blur();
        if (parse().name === "search") location.hash = "#/";
      }
    });
    document.addEventListener("keydown", (e) => {
      if (document.body.classList.contains("exam-mode")) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.focus();
        search.select();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        search.focus();
      }
    });
    window.addEventListener("hashchange", GP.route);
    // Another tab may finish an exam: keep lists fresh when coming back.
    window.addEventListener("storage", (e) => {
      if (!e.key || e.key.startsWith("gp.qstat")) GP.qstat._cache = null;
      if (!e.key || e.key === "gp.attempts") GP.attempts.invalidate();
    });
  }

  function boot() {
    if (!GP.lib) {
      GP.$("#app").replaceChildren(h("div", { class: "page" }, h("div", { class: "empty" },
        h("strong", null, "Library data not found"),
        h("span", null, "data/library.js is missing. Run the build step (see README.md) or keep the data folder next to index.html."))));
      return;
    }
    bindChrome();
    const q = parse();
    if (q.name === "search") GP.$("#global-search").value = q.params.query.get("q") || "";
    GP.route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
