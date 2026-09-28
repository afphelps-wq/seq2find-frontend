"use strict";

(() => {
  const API = (window.SEQ2FIND_API || "").replace(/\/+$/, "");
  const TOKEN_KEY = "seq2find_token";
  const SEARCH_TIMEOUT_MS = 180000;

  const $ = (id) => document.getElementById(id);

  // localStorage can throw (private windows, blocked storage); the app works without it.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const state = {
    token: store.get(TOKEN_KEY),
    user: null,
    current: null,   // {query, results, cached, cachedAt} of the latest search
    savedCount: 0,
  };

  /* ---------- small helpers ------------------------------------------------ */

  // Builds DOM without innerHTML: all text goes through text nodes, so API-provided
  // strings can never inject markup.
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid);
    return node;
  }

  // Namespaced so the stroke-based icons inherit the stylesheet's svg rules.
  function icon(...paths) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    return svg;
  }

  function showMessage(text, kind = "error") {
    const box = el("div", { class: `message ${kind}` },
      el("span", { text }),
      el("button", { "aria-label": "Dismiss", text: "×", onclick: (e) => e.target.closest(".message").remove() }));
    $("messages").append(box);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const clearMessages = () => $("messages").replaceChildren();

  function busy(on, text = "Working…") {
    $("busy-text").textContent = text;
    $("busy").classList.toggle("is-hidden", !on);
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }

  // "1 match" / "3 matches": sibilant endings take -es.
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : /(s|x|z|ch|sh)$/.test(word) ? "es" : "s"}`;

  // Only http(s) links are rendered. NCBI returns ftp:// URLs, which current browsers no longer
  // open, but the same paths are served over https.
  function safeUrl(u) {
    if (typeof u !== "string") return null;
    try {
      const url = new URL(u.replace(/^ftp:\/\//i, "https://"));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch { return null; }
  }

  /* ---------- API ---------------------------------------------------------- */

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  function describeDetail(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
        return field ? `${field}: ${d.msg}` : d.msg;
      }).join("; ");
    }
    return "";
  }

  async function api(path, { method = "GET", body, signal, auth = true } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
    let res;
    try {
      res = await fetch(API + path, {
        method, headers, signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      throw new ApiError(0, "Can't reach the server. It may be waking up — wait a moment and try again.");
    }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      if (res.status === 401 && auth) signOut("Your session expired. Please sign in again.");
      throw new ApiError(res.status, describeDetail(data && data.detail) || `Request failed (${res.status})`);
    }
    return data;
  }

  function friendly(err) {
    if (err instanceof ApiError) {
      if (err.status === 502) return "GEO or OpenAI could not be reached. Please try again in a moment.";
      if (err.status === 422) return `Please check your input. ${err.message}`;
      return err.message;
    }
    return "Something went wrong. Please try again.";
  }

  /* ---------- views ------------------------------------------------------- */

  const NAV = { "panel-search": "nav-search", "panel-results": "nav-results", "panel-saved": "nav-saved" };

  function lockNav(locked) {
    for (const id of Object.values(NAV)) {
      $(id).classList.toggle("is-locked", locked);
      if (locked) $(id).classList.remove("is-active");   // no active marker on a locked rail
    }
  }

  function markNav(panelId) {
    for (const [panel, nav] of Object.entries(NAV)) $(nav).classList.toggle("is-active", panel === panelId);
  }

  function showView(name) {
    $("view-login").hidden = name !== "login";
    $("view-app").hidden = name !== "app";
    $("account-card").hidden = name !== "app";
    lockNav(name !== "app");
  }

  function signOut(message) {
    store.del(TOKEN_KEY);
    state.token = null;
    state.user = null;
    state.current = null;
    state.savedCount = 0;
    $("search-results").replaceChildren();
    $("result-actions").replaceChildren();
    $("save-host").replaceChildren();
    $("saved-list").replaceChildren();
    $("saved-open").replaceChildren();
    $("panel-results").classList.add("is-hidden");
    resetStats();
    showView("login");
    clearMessages();
    if (message) showMessage(message, "warn");
  }

  function enterApp(user) {
    state.user = user;
    $("user-email").textContent = user.email;
    $("refresh-wrap").classList.toggle("is-hidden", !user.is_admin);
    showView("app");
    markNav("panel-search");
    loadSaved();
  }

  /* ---------- stat cards --------------------------------------------------- */

  function resetStats() {
    $("stat-results").textContent = "—";
    $("stat-requirement").classList.add("is-hidden");
    $("requirement-empty").classList.remove("is-hidden");
    $("stat-saved").textContent = "—";
  }

  function updateStats() {
    const cur = state.current;
    $("stat-results").textContent = cur ? String(cur.results.length) : "—";

    const asked = Boolean(cur && cur.query.data_availability);
    $("stat-requirement").classList.toggle("is-hidden", !asked);
    $("requirement-empty").classList.toggle("is-hidden", asked);
    if (asked) {
      $("stat-requirement").textContent = String(cur.results.filter((r) => r.meets_data_availability).length);
    }
    $("stat-saved").textContent = String(state.savedCount);
  }

  /* ---------- result rendering -------------------------------------------- */

  function downloadLinks(r) {
    const out = [];
    for (const raw of r.download_links || []) {
      const href = safeUrl(raw);
      if (!href) continue;
      const label = /\/suppl\/?$/.test(href) ? "Supplementary files" : "Series files";
      out.push(el("a", { href, target: "_blank", rel: "noopener noreferrer", text: label }));
    }
    return out;
  }

  function resultCard(r, showRequirement) {
    const geo = safeUrl(r.geo_url);
    const conf = ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low";
    const meta = [r.organism, r.n_samples != null ? plural(r.n_samples, "sample") : null].filter(Boolean).join(" · ");
    const links = downloadLinks(r);
    return el("article", { class: "card" },
      el("div", { class: "card-head" },
        geo
          ? el("a", { class: "acc", href: geo, target: "_blank", rel: "noopener noreferrer", text: r.accession })
          : el("span", { class: "acc", text: r.accession }),
        el("span", { class: `tag tag-${conf}`, text: `${conf} confidence` }),
        showRequirement
          ? el("span", {
              class: `chip ${r.meets_data_availability ? "chip-met" : "chip-unmet"}`,
              text: r.meets_data_availability ? "requirement met" : "not confirmed",
            })
          : null),
      el("h3", { text: r.title }),
      meta ? el("p", { class: "card-meta", text: meta }) : null,
      r.match_summary ? el("p", { text: r.match_summary }) : null,
      r.data_availability_evidence
        ? el("p", { class: "evidence", text: `From the study text: “${r.data_availability_evidence}”` })
        : null,
      (r.matched_conditions || []).length
        ? el("ul", { class: "conditions", "aria-label": "Matched conditions" },
            r.matched_conditions.map((c) => el("li", { text: c })))
        : null,
      links.length
        ? el("div", { class: "links" }, el("span", { class: "eyebrow", text: "Download" }), links)
        : null);
  }

  const resultList = (results, query) =>
    results.map((r) => resultCard(r, Boolean(query && query.data_availability)));

  const defaultSaveName = (q) => [q.methodology, q.tissue].filter(Boolean).join(" · ").slice(0, 200);

  function renderResults() {
    const cur = state.current;
    const panel = $("panel-results");
    const box = $("search-results");
    const actions = $("result-actions");
    $("save-host").replaceChildren();
    box.replaceChildren();
    actions.replaceChildren();
    panel.classList.remove("is-hidden");
    $("nav-results").classList.remove("is-locked");

    if (!cur.results.length) {
      $("result-origin").textContent = "";
      box.append(el("p", { class: "empty",
        text: "No matching datasets found. Try broader wording for the assay or tissue — for example “spatial transcriptomics” instead of a specific platform." }));
      return;
    }

    $("result-origin").textContent = cur.cached
      ? `${plural(cur.results.length, "match")} · cached result from ${fmtDate(cur.cachedAt) || "earlier"}`
      : `${plural(cur.results.length, "match")} · fresh search`;

    const saveBtn = el("button", { type: "button", class: "btn btn-ghost btn-small", text: "Save this search" });
    const copyBtn = el("button", { type: "button", class: "btn btn-ghost btn-small", text: "Copy accessions" });
    saveBtn.addEventListener("click", () => openSaveForm(saveBtn));
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(cur.results.map((r) => r.accession).join("\n"));
        showMessage(`Copied ${plural(cur.results.length, "accession")} to the clipboard.`, "warn");
      } catch {
        showMessage("Couldn't reach the clipboard. Select the accessions manually.");
      }
    });
    actions.append(saveBtn, copyBtn);
    box.append(...resultList(cur.results, cur.query));
  }

  function openSaveForm(saveBtn) {
    const host = $("save-host");
    if (host.childElementCount) { host.replaceChildren(); return; }
    const input = el("input", { id: "save-name", maxlength: "200", value: defaultSaveName(state.current.query) });
    const go = el("button", { type: "submit", class: "btn btn-primary btn-small", text: "Save" });
    const form = el("form", { class: "save-row" },
      el("label", { class: "field" }, el("span", { text: "Name this search" }), input), go);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return showMessage("Give the saved search a name.");
      go.disabled = true;
      try {
        await api("/saved-searches", {
          method: "POST",
          body: { name, query: state.current.query, results: state.current.results },
        });
        host.replaceChildren();
        saveBtn.textContent = "Saved ✓";
        saveBtn.disabled = true;
        await loadSaved();
      } catch (err) {
        showMessage(friendly(err));
        go.disabled = false;
      }
    });
    host.append(form);
    input.focus();
    input.select();
  }

  /* ---------- search ------------------------------------------------------- */

  function readQuery() {
    const val = (id) => $(id).value.trim();
    const query = {
      methodology: val("f-methodology"),
      organism: val("f-organism"),
      tissue: val("f-tissue"),
      conditions: $("f-conditions").value.split("\n").map((s) => s.trim()).filter(Boolean),
      max_results: parseInt($("f-max").value, 10) || 10,
    };
    const availability = val("f-availability");
    if (availability) query.data_availability = availability;
    return query;
  }

  function fillForm(q) {
    $("f-methodology").value = q.methodology || "";
    $("f-organism").value = q.organism || "";
    $("f-tissue").value = q.tissue || "";
    $("f-conditions").value = (q.conditions || []).join("\n");
    $("f-availability").value = q.data_availability || "";
    $("f-max").value = String(q.max_results || 10);
  }

  async function runSearch(e) {
    e.preventDefault();
    clearMessages();
    const query = readQuery();
    if (!query.methodology || !query.organism || !query.tissue) {
      return showMessage("Methodology, organism and tissue are all required.");
    }
    const refresh = Boolean(state.user && state.user.is_admin && $("f-refresh").checked);
    const button = $("search-submit");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    const started = Date.now();
    const tick = () => {
      const s = Math.round((Date.now() - started) / 1000);
      busy(true, s > 12
        ? `Searching GEO and ranking matches… ${s}s. A new search takes 20–30 s, and longer if the server was asleep.`
        : `Searching GEO and ranking matches… ${s}s`);
    };

    button.disabled = true;
    tick();
    const timer = setInterval(tick, 1000);
    try {
      const data = await api(`/search${refresh ? "?refresh=true" : ""}`, {
        method: "POST", body: query, signal: controller.signal,
      });
      state.current = { query, results: data.results, cached: data.cached, cachedAt: data.cached_at };
      renderResults();
      updateStats();
      markNav("panel-results");
      $("panel-results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (err && err.name === "AbortError") showMessage("The search timed out. Please try again.");
      else if (state.token) showMessage(friendly(err));
    } finally {
      clearTimeout(timeout);
      clearInterval(timer);
      busy(false);
      button.disabled = false;
    }
  }

  /* ---------- saved searches ---------------------------------------------- */

  async function loadSaved() {
    const list = $("saved-list");
    try {
      const items = await api("/saved-searches");
      state.savedCount = items.length;
      updateStats();
      list.replaceChildren();
      $("saved-open").replaceChildren();
      $("nav-saved").classList.toggle("is-locked", false);
      if (!items.length) {
        list.append(el("p", { class: "empty",
          text: "No saved searches yet. Run a search and choose “Save this search”." }));
        return;
      }
      for (const item of items) list.append(savedCard(item));
    } catch (err) {
      if (state.token) showMessage(friendly(err));
    }
  }

  function savedCard(item) {
    const q = item.query;
    const when = fmtDate(item.created_at);
    const desc = [q.methodology, q.organism, q.tissue].filter(Boolean).join(" · ");
    const openBtn = el("button", { type: "button", class: "btn btn-ghost btn-small", text: "Open" });
    const useBtn = el("button", { type: "button", class: "btn btn-ghost btn-small", text: "Search again" });
    const delBtn = el("button", { type: "button", class: "btn btn-ghost btn-small btn-danger", text: "Delete" });

    openBtn.addEventListener("click", () => {
      const host = $("saved-open");
      host.replaceChildren(
        el("div", { class: "result-head" },
          el("span", { class: "result-count", text: `Snapshot of “${item.name}” saved ${when}` }),
          el("button", {
            type: "button", class: "btn btn-ghost btn-small", text: "Close",
            onclick: () => host.replaceChildren(),
          })),
        ...resultList(item.results, q));
      host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    useBtn.addEventListener("click", () => {
      fillForm(q);
      markNav("panel-search");
      $("panel-search").scrollIntoView({ behavior: "smooth", block: "start" });
      $("f-methodology").focus();
    });
    delBtn.addEventListener("click", async () => {
      if (!window.confirm(`Delete “${item.name}”?`)) return;
      delBtn.disabled = true;
      try {
        await api(`/saved-searches/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        await loadSaved();
      } catch (err) {
        showMessage(friendly(err));
        delBtn.disabled = false;
      }
    });

    return el("article", { class: "card saved-item" },
      el("div", {},
        el("h3", { text: item.name }),
        el("p", { class: "card-meta", text: `${desc} · ${plural(item.results.length, "result")} · saved ${when}` })),
      el("div", { class: "btns" }, openBtn, useBtn, delBtn));
  }

  /* ---------- theme -------------------------------------------------------- */

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const MOON = ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"];
  const SUN = ["M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"];

  const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");

  function syncThemeButton() {
    const dark = currentTheme() === "dark";
    const button = $("theme-btn");
    const svg = icon(...(dark ? SUN : MOON));
    if (dark) {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12"); c.setAttribute("cy", "12"); c.setAttribute("r", "4");
      svg.prepend(c);
    }
    button.replaceChildren(svg);                            // shows the mode you would switch to
    button.title = dark ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-pressed", String(dark));
  }

  $("theme-btn").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    syncThemeButton();
  });

  systemDark.addEventListener("change", () => {
    if (document.documentElement.dataset.theme) return;      // an explicit choice wins
    syncThemeButton();
  });

  /* ---------- wiring ------------------------------------------------------- */

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    if (!email || !password) return showMessage("Enter your email and password.");
    const button = $("login-submit");
    button.disabled = true;
    busy(true, "Signing in… this can take a minute if the server was idle.");
    try {
      const token = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
      state.token = token.access_token;
      store.set(TOKEN_KEY, state.token);
      const user = await api("/auth/me");
      $("login-password").value = "";
      enterApp(user);
    } catch (err) {
      if (!state.user) { state.token = null; store.del(TOKEN_KEY); }
      showMessage(friendly(err));
    } finally {
      busy(false);
      button.disabled = false;
    }
  });

  $("logout").addEventListener("click", () => signOut(""));
  $("search-form").addEventListener("submit", runSearch);
  $("saved-refresh").addEventListener("click", loadSaved);

  for (const [panel, nav] of Object.entries(NAV)) {
    $(nav).addEventListener("click", () => markNav(panel));
  }

  $("help-btn").addEventListener("click", () => {
    clearMessages();
    showMessage("Describe an assay, organism and tissue, and Seq2Find queries NCBI GEO live, then " +
      "uses a language model to rank the candidates against your conditions and data-availability " +
      "requirement. Results link straight to the GEO series and its files — nothing is re-hosted. " +
      "Accounts are created by the lab admin.", "warn");
  });

  async function boot() {
    syncThemeButton();
    if (!state.token) return showView("login");
    showView("login");
    busy(true, "Checking your session… this can take a minute if the server was idle.");
    try {
      const user = await api("/auth/me");
      enterApp(user);
    } catch (err) {
      if (state.token) showMessage(friendly(err));            // a 401 already reset the view
    } finally {
      busy(false);
    }
  }

  boot();
})();
