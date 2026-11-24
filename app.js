/* സ്വാന്തന കേന്ദ്രം — ഉപകരണ ലൈബ്രറി (പാലത്തുങ്കര)
   Offline-first PWA. Data: IndexedDB (device) ⇄ Firebase Realtime Database (REST). */
(function () {
  "use strict";

  /* =====================================================================
     1. CONFIG
     ===================================================================== */
  const CFG = {
    DB: "https://swanthanam-253da-default-rtdb.asia-southeast1.firebasedatabase.app", // ← Firebase Realtime Database URL (e.g. https://xxxx-default-rtdb.asia-southeast1.firebasedatabase.app). Can also be set once via  ?db=<url>
    ROOT: "santhwanam-v1",
    IDB: "santhwanam",
    DB_KEY: "snt_db_url",
    SYNC_DEBOUNCE: 1200,
    POLL_MS: 45000,
    AUTOLOCK_MS: 5 * 60 * 1000,
    MAX_TRIES: 5,
    LOCK_MS: 30000
  };
  const COLS = ["items", "loans", "requests", "replies", "announcements", "services", "members", "staff", "info", "settings"];
  const PUBLIC_COLS = ["items", "announcements", "services", "info"];
  const BACKUP_COLS = ["items", "loans", "requests", "replies", "announcements", "services", "members", "staff"];
  const CATEGORIES = ["വീൽചെയർ", "വാക്കർ", "ക്രച്ചസ് / വടി", "ഹോസ്പിറ്റൽ കട്ടിൽ", "എയർ / വാട്ടർ ബെഡ്", "കമ്മോഡ് ചെയർ", "ഓക്സിജൻ കോൺസെൻട്രേറ്റർ", "നെബുലൈസർ", "BP / ഷുഗർ മെഷീൻ", "മറ്റുള്ളവ"];
  const SOURCES = { donation: "ദാനം ലഭിച്ചത്", purchase: "വാങ്ങിയത്" };
  const REQ_STATUS = { new: "പുതിയത്", approved: "അനുവദിച്ചു", waiting: "ലഭ്യമാകുമ്പോൾ അറിയിക്കും", declined: "ഇപ്പോൾ ലഭ്യമല്ല", cancelled: "റദ്ദാക്കി" };
  const ANSWERS = { return: "തിരിച്ചു തരാം", later: "കുറച്ച് കഴിഞ്ഞ് തരാം", no: "ഇപ്പോൾ സാധ്യമല്ല" };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const pad = (n) => String(n).padStart(2, "0");
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = (s) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ");
  const norm = (s) => clean(s).toLowerCase();
  const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const kgFmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  // Local calendar date (NOT UTC) — fixes wrong "today" in India before 5:30 AM
  const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayIso = () => isoOf(new Date());
  const monthNow = () => todayIso().slice(0, 7);
  const parseIso = (iso) => { const p = String(iso || "").split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const MONTHS = ["ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ"];
  const WD = ["ഞായർ", "തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി"];
  const fmtDate = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); };
  const fmtDay = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + ", " + WD[d.getDay()]; };
  const fmtMonth = (k) => { const p = String(k).split("-").map(Number); return MONTHS[(p[1] || 1) - 1] + " " + p[0]; };
  const initial = (s) => { const t = clean(s) || "?"; return (typeof Intl !== "undefined" && Intl.Segmenter) ? (Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(t), (x) => x.segment)[0] || "?") : Array.from(t)[0]; };
  const segs = (s) => (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(s), (x) => x.segment) : Array.from(s);

  function cyrb53(str, seed) {
    seed = seed || 0;
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const pinHash = (pin) => String(cyrb53("mc-pin:" + pin));

  const ICON = (() => {
    const p = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6"/>',
      cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>',
      store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5"/>',
      chart: '<path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-9"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4"/>',
      lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
      msg: '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20l1.3-5A8.4 8.4 0 1 1 21 11.5z"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
      upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
      print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',
      book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM4 17a3 3 0 0 1 3-3h12"/>',
      refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4"/>',
      delete: '<path d="M21 4H8l-6 8 6 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6"/>',
      phone2: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'
    };
    const o = {};
    Object.keys(p).forEach((k) => { o[k] = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p[k] + "</svg>"; });
    return o;
  })();


  Object.assign(ICON, (() => {
    const mk = (p) => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
    return {
      sun: mk('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
      moon: mk('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
      bell: mk('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>'),
      list: mk('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
      users: mk('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
      truck: mk('<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'),
      flask: mk('<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3M7.5 15h9"/>'),
      settings: mk('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
      rupee: mk('<path d="M6 3h12M6 8h12M6 13h4a4 4 0 0 0 0-5M9 13l7 8"/>')
    };
  })());


  Object.assign(ICON, (() => {
    const mk = (p) => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
    return {
      sun: mk('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
      moon: mk('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
      bell: mk('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>'),
      list: mk('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
      home: mk('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>'),
      box: mk('<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>'),
      inbox: mk('<path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'),
      heart: mk('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
      hand: mk('<path d="M3 15l4-4 4 2 5-4 5 3v6l-9 4-9-3z"/><path d="M8 11V6a1.5 1.5 0 0 1 3 0v4"/>'),
      search: mk('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
      undo: mk('<path d="M3 7v6h6M3.5 13A9 9 0 1 0 6 6.3L3 9"/>'),
      user: mk('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>'),
      users: mk('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
      clock: mk('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
      link: mk('<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>'),
      mega: mk('<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>'),
      more: mk('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
      settings: mk('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>')
    };
  })());

  /* =====================================================================
     3. STATE & LOCAL PERSISTENCE
     ===================================================================== */
  const defaultInfo = () => ({ id: "main", updatedAt: 0, name: "സ്വാന്തന കേന്ദ്രം", tag: "മുസ്ലിം ജമാഅത്ത് • SYS • SSF", place: "പാലത്തുങ്കര", phone: "", wa: "", hours: "", about: "രോഗികൾക്കും വികലാംഗർക്കും ആവശ്യമായ ഉപകരണങ്ങൾ ആവശ്യക്കാർക്ക് ഉപയോഗത്തിനായി നൽകുന്ന സേവന കേന്ദ്രം." });
  const defaultSettings = () => ({ id: "main", updatedAt: 0, adminHash: pinHash("1234"), entryCode: "1000" });
  function defaultState() {
    return {
      v: 1,
      data: { items: {}, loans: {}, requests: {}, replies: {}, announcements: {}, services: {}, members: {}, staff: {}, info: { main: defaultInfo() }, settings: { main: defaultSettings() } },
      dirty: {}, lastSync: 0, lastAutoBackup: "", lock: { n: 0, until: 0 }, theme: "light", myReq: [], me: null
    };
  }
  let state = defaultState();
  let session = null; // { role:'admin'|'staff', name, id }
  let ui = { tab: "p_items", cat: "all", search: "", loanF: "out", loanQ: "", reqF: "new", gate: false, hash: null, month: monthNow() };
  let persistTimer = null, dbPromise = null;
  // Office info doubles as "biz" for the PDF writer
  const S = () => ({ biz: state.data.info.main });
  const INFO = () => state.data.info.main;
  const ST = () => state.data.settings.main;

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("no idb"));
        const q = indexedDB.open(CFG.IDB, 1);
        q.onupgradeneeded = () => q.result.createObjectStore("kv");
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    return dbPromise;
  }
  async function idbGet(k) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const r = db.transaction("kv", "readonly").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbSet(k, v) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  async function loadState() {
    const base = defaultState();
    let saved = null;
    try { saved = await withTimeout(idbGet("state"), 3000); } catch (e) { /* ignore */ }
    if (!saved) { try { const raw = localStorage.getItem("snt_state_v1"); if (raw) saved = JSON.parse(raw); } catch (e) { /* ignore */ } }
    if (saved && typeof saved === "object" && saved.data) {
      state = Object.assign(base, saved);
      COLS.forEach((c) => { if (!state.data[c] || typeof state.data[c] !== "object") state.data[c] = base.data[c]; });
      if (!state.data.settings.main) state.data.settings.main = defaultSettings();
      if (!state.data.info.main) state.data.info.main = defaultInfo();
      if (!state.dirty) state.dirty = {};
      if (!state.lock) state.lock = { n: 0, until: 0 };
      if (!Array.isArray(state.myReq)) state.myReq = [];
      if (!state.me || typeof state.me !== "object") state.me = null;
      const inf = state.data.info.main; if (inf && inf.name === "\u0d38\u0d3e\u0d28\u0d4d\u0d24\u0d4d\u0d35\u0d28\u0d02" && !inf.updatedAt) { inf.name = defaultInfo().name; }
      const sm = state.data.settings.main; if (sm && sm.entryCode == null) sm.entryCode = "1000";
    }
  }
  function persist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 250); }
  async function persistNow() {
    clearTimeout(persistTimer);
    try { await withTimeout(idbSet("state", JSON.parse(JSON.stringify(state))), 4000); }
    catch (e) { try { localStorage.setItem("snt_state_v1", JSON.stringify(state)); } catch (e2) { /* full */ } }
  }

  /* =====================================================================
     4. DATA ACCESS & BUSINESS LOGIC
     ===================================================================== */
  const live = (col) => Object.values(state.data[col]).filter((r) => r && !r.deleted);
  const byId = (col, id) => { const r = state.data[col][id]; return r && !r.deleted ? r : null; };
  const isAdmin = () => !!session && session.role === "admin";
  const isStaff = () => !!session;
  const PERMS = [["item_edit", "ഉപകരണങ്ങൾ ചേർക്കാനും തിരുത്താനും", 1], ["item_del", "ഉപകരണം നീക്കം ചെയ്യാൻ", 0], ["lend", "ഉപകരണം നൽകാനും തിരിച്ചെടുക്കാനും", 1], ["view_loans", "കൊണ്ടുപോയവരുടെ വിവരങ്ങൾ കാണാൻ", 1], ["loan_edit", "നൽകിയ എൻട്രി തിരുത്താനും നീക്കാനും", 0], ["remind", "WhatsApp ഉണർത്തൽ അയക്കാൻ", 1], ["reqs", "അപേക്ഷകൾ കൈകാര്യം ചെയ്യാൻ", 1], ["ann", "അറിയിപ്പുകൾ നൽകാൻ", 0], ["services", "പ്രവർത്തനങ്ങൾ ചേർക്കാൻ", 0], ["members", "ജോയിൻ ചെയ്തവരുടെ പട്ടിക കാണാൻ", 0], ["reports", "PDF റിപ്പോർട്ടുകൾ എടുക്കാൻ", 1]];
  const can = (k) => {
    if (!session) return false; if (session.role === "admin") return true;
    const st = state.data.staff[session.id], p = st && st.perms;
    if (p && k in p) return !!p[k];
    const d = PERMS.find((x) => x[0] === k); return !!(d && d[2]);
  };
  const need = (k) => { if (can(k)) return true; toast("ഈ പ്രവർത്തനത്തിന് അനുമതി ഇല്ല", "error"); return false; };
  const codeKey = (x) => clean(x).toLowerCase();
  const validCode = (c) => /^[a-z0-9]{4,12}$/.test(c);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ml");
  const newest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

  function save(col, rec) {
    rec.updatedAt = Date.now();
    state.data[col][rec.id] = rec;
    state.dirty[col + "/" + rec.id] = 1;
    persist(); scheduleSync();
    return rec;
  }
  function softDelete(col, id) { const r = state.data[col][id]; if (r) { r.deleted = true; save(col, r); } }

  const activeLoans = (itemId) => live("loans").filter((l) => l.status === "out" && (!itemId || l.itemId === itemId));
  const outQty = (itemId) => activeLoans(itemId).reduce((a, l) => a + num(l.qty), 0);
  const availQty = (it) => Math.max(0, num(it.qty) - num(it.damaged) - outQty(it.id));
  // Public devices cannot read loans, so staff devices keep item.avail up to date
  const shownAvail = (it) => (session ? availQty(it) : (it.avail == null ? Math.max(0, num(it.qty) - num(it.damaged)) : num(it.avail)));
  function updateAvail(itemId) { const it = byId("items", itemId); if (it) { const a = availQty(it); if (it.avail !== a) { it.avail = a; save("items", it); } } }
  function reconcileAvail() { if (!session) return; live("items").forEach((it) => { const a = availQty(it); if (it.avail !== a) { it.avail = a; save("items", it); } }); }
  const isOverdue = (l) => l.status === "out" && !!l.due && l.due < todayIso();
  const replyOf = (loan) => { const r = state.data.replies[loan.id]; return r && !r.deleted && r.token === loan.token ? r : null; };
  const pendingReq = () => live("requests").filter((r) => r.status === "new");
  const waitingFor = (itemId) => live("requests").filter((r) => r.itemId === itemId && (r.status === "new" || r.status === "waiting"));
  const unackReplies = () => live("loans").filter((l) => l.status === "out" && replyOf(l) && !replyOf(l).ack);
  const rndToken = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
  const waNum = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? "91" + d.slice(-10) : ""; };
  const appBase = () => location.origin + location.pathname.replace(/index\.html$/, "");
  const replyLink = (l) => appBase() + "#r=" + l.id + "." + l.token;

  function applyTheme() { document.documentElement.setAttribute("data-theme", state.theme === "dark" ? "dark" : "light"); }

  /* =====================================================================
     5. FIREBASE SYNC
     ===================================================================== */
  let syncing = false, syncTimer = null, syncState = "idle", syncErr = "";
  const online = () => navigator.onLine !== false;
  const pending = () => Object.keys(state.dirty).length;
  function dbBase() { try { const u = localStorage.getItem(CFG.DB_KEY); if (u) return u; } catch (e) { /* ignore */ } return CFG.DB; }
  const hasDb = () => !!dbBase();
  const url = (path) => dbBase().replace(/\/+$/, "") + "/" + CFG.ROOT + (path ? "/" + path : "") + ".json";
  async function getJson(path) {
    const r = await fetch(url(path), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function mergeRemote(root) {
    if (!root) return false;
    let changed = false;
    COLS.forEach((col) => {
      const rc = root[col];
      if (!rc || typeof rc !== "object") return;
      Object.keys(rc).forEach((id) => {
        const rv = rc[id];
        if (!rv || typeof rv !== "object") return;
        const lv = state.data[col][id];
        if (!lv || (rv.updatedAt || 0) > (lv.updatedAt || 0)) { state.data[col][id] = rv; delete state.dirty[col + "/" + id]; changed = true; }
      });
    });
    return changed;
  }
  async function pull() {
    if (session) return mergeRemote(await getJson(""));
    // Public devices read only the public collections + their own requests
    const root = {};
    await Promise.all(PUBLIC_COLS.map(async (c) => { root[c] = await getJson(c); }));
    const mine = {};
    await Promise.all(state.myReq.map(async (id) => { const v = await getJson("requests/" + id); if (v) mine[id] = v; }));
    root.requests = mine;
    return mergeRemote(root);
  }
  async function pullAuth() { return mergeRemote({ settings: await getJson("settings"), staff: await getJson("staff"), info: await getJson("info") }); }
  async function push() {
    const keys = Object.keys(state.dirty);
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        const [col, id] = k.split("/");
        const rec = state.data[col] && state.data[col][id];
        if (!rec) { delete state.dirty[k]; return; }
        const stamp = rec.updatedAt;
        const r = await fetch(url(k), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const now = state.data[col][id];
        if (now && now.updatedAt === stamp) delete state.dirty[k];
      }));
    }
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), CFG.SYNC_DEBOUNCE); updateStatus(); }
  async function sync(manual) {
    if (!hasDb()) { syncState = "nodb"; updateStatus(); return "nodb"; }
    if (syncing) return manual ? "busy" : undefined;
    if (!online()) { updateStatus(); return "offline"; }
    syncing = true; syncState = "busy"; syncErr = ""; updateStatus();
    let changed = false;
    try { await push(); } catch (e) { syncErr = String((e && e.message) || e); }
    try { changed = await pull(); } catch (e) { syncErr = syncErr || String((e && e.message) || e); }
    if (!syncErr) {
      state.lastSync = Date.now(); syncState = "ok";
      if (session) { reconcileAvail(); }
      if (changed || pending()) { try { await push(); } catch (e) { /* retry next time */ } }
    } else { syncState = "err"; }
    syncing = false;
    persist(); updateStatus();
    if (changed) softRefresh();
    return syncState;
  }
  function statusText() {
    const n = pending();
    if (!hasDb()) return ["off", "ഓൺലൈൻ സിങ്ക് സജ്ജമാക്കിയിട്ടില്ല • ഫോണിൽ മാത്രം സേവ് ആകുന്നു"];
    if (!online()) return ["off", "ഓഫ്‌ലൈൻ" + (n ? " • " + n + " മാറ്റം അയക്കാനുണ്ട്" : "")];
    if (syncState === "busy") return ["busy", "സിങ്ക് ചെയ്യുന്നു…"];
    if (syncState === "err") return ["err", "സെർവർ ലഭ്യമല്ല (" + syncErr + ")" + (n ? " • " + n + " മാറ്റം പിന്നീട് അയക്കും" : "")];
    if (n) return ["", "ഓൺലൈൻ • " + n + " മാറ്റം അയക്കാനുണ്ട്"];
    return ["", "ഓൺലൈൻ • സിങ്ക് പൂർത്തിയായി"];
  }
  function updateStatus() {
    const d = $("#syncDot"), t = $("#syncText");
    if (!d || !t) return;
    const s = statusText(); d.className = "dot " + s[0]; t.textContent = s[1];
  }

  /* =====================================================================
     6. UI PLUMBING: toast, modal
     ===================================================================== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (kind ? " " + kind : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }
  let modal = null;
  function openModal(m) {
    modal = m;
    renderModal();
    if (m.focus !== false) { const f = $("#modalRoot input:not([readonly]), #modalRoot select"); if (f) setTimeout(() => f.focus(), 60); }
  }
  function closeModal() { modal = null; renderModal(); }
  function renderModal() {
    const root = $("#modalRoot");
    if (!modal) { root.innerHTML = ""; return; }
    root.innerHTML = '<div class="overlay" data-act="modal-bg"><div class="sheet' + (modal.wide ? " wide" : "") + '" role="dialog" aria-modal="true"><h3>' + h(modal.title) + "</h3>" +
      (modal.text ? '<p class="t">' + h(modal.text) + "</p>" : "") + (modal.body || "") + '<p id="modalErr" class="neg" style="margin:0;font-size:.78rem;font-weight:700" hidden></p>' +
      (modal.footer ? modal.footer : '<div class="acts"><button type="button" class="btn ghost" data-act="modal-cancel">റദ്ദാക്കുക</button><button type="button" class="btn ' + (modal.danger ? "danger" : "") + '" data-act="modal-ok">' + h(modal.ok || "സേവ്") + "</button></div>") + "</div></div>";
  }
  const mv = (id) => { const e = document.getElementById("mf_" + id); return e ? (e.type === "checkbox" ? e.checked : e.value) : ""; };
  function modalErr(msg) { const e = $("#modalErr"); if (e) { e.textContent = msg; e.hidden = false; } return false; }
  function confirmBox(title, text, okLabel, fn) { openModal({ title, text, ok: okLabel, danger: true, focus: false, onOk: fn }); }

  /* =====================================================================
     7. LOGIN (staff / admin)
     ===================================================================== */
  function gateView() {
    const b = INFO(), me = state.me, st = statusText();
    return '<div class="login gate"><div class="login-card"><div class="login-head"><div class="logo">' + ICON.heart + "</div><h1>" + h(b.name) + '</h1><div class="place">' + h(b.place) + '</div>' + (b.tag ? '<div class="tag">' + h(b.tag) + "</div>" : "") + "</div>" +
      '<div class="login-body" style="text-align:left"><h2>' + ICON.lock + ' എൻട്രി കോഡ്</h2><p>പൊതു എൻട്രി കോഡ് — അല്ലെങ്കിൽ അഡ്മിൻ / കമ്മിറ്റി / സ്റ്റാഫ് കോഡ് നൽകി പ്രവേശിക്കാം</p>' +
      '<input id="g_code" class="in code" type="password" autocomplete="off" autocapitalize="off" placeholder="കോഡ് നൽകുക"><div class="pin-err" id="gateErr"></div><button type="button" class="btn block lg" data-act="enter">' + ICON.check + "പ്രവേശിക്കുക</button>" +
      '<div class="or"><span>അല്ലെങ്കിൽ</span></div><h2>' + ICON.user + ' ജോയിൻ ചെയ്യുക</h2><p>പേര്, ഫോൺ നമ്പർ, സ്ഥലം എന്നിവ നൽകി ചേരാം</p>' +
      '<div class="stack"><input id="g_name" class="in" placeholder="പേര്" autocomplete="name" value="' + h(me ? me.name : "") + '"><input id="g_phone" class="in" placeholder="ഫോൺ നമ്പർ" inputmode="tel" autocomplete="tel" value="' + h(me ? me.phone : "") + '"><input id="g_place" class="in" placeholder="സ്ഥലം" value="' + h(me ? me.place : "") + '"></div><div class="pin-err" id="joinErr"></div><button type="button" class="btn ghost block lg" data-act="join">' + ICON.users + "ജോയിൻ ചെയ്യുക</button>" +
      '<div class="sync-note"><span class="dot ' + st[0] + '" id="syncDot"></span><span id="syncText">' + h(st[1]) + "</span></div>" + (me ? '<div class="center"><button type="button" class="linkbtn" data-act="gate-back">← തിരികെ പോകുക</button></div>' : "") + "</div></div></div>";
  }
  const gateMsg = (id, msg) => { const e = $("#" + id); if (e) e.textContent = msg || ""; };
  async function enter() {
    const code = codeKey(($("#g_code") || {}).value), now = Date.now();
    if (!code) return gateMsg("gateErr", "കോഡ് നൽകുക");
    if (state.lock.until > now) return gateMsg("gateErr", "കുറച്ച് സമയത്തിന് ശേഷം ശ്രമിക്കുക (" + Math.ceil((state.lock.until - now) / 1000) + " സെക്കൻഡ്)");
    gateMsg("gateErr", "പരിശോധിക്കുന്നു…");
    if (online() && hasDb()) { try { await withTimeout(pullAuth(), 7000); } catch (e) { /* use local copy */ } }
    const hs = pinHash(code);
    let sess = null;
    if (hs === ST().adminHash) sess = { role: "admin", name: "അഡ്മിൻ", id: "admin" };
    else { const stf = live("staff").find((x) => x.pinHash === hs); if (stf) sess = { role: "staff", name: stf.name, id: stf.id }; }
    if (sess) {
      state.lock = { n: 0, until: 0 }; persist();
      session = sess; ui.gate = false; ui.tab = "s_home";
      autoBackupCheck(); render(); toast("സ്വാഗതം " + sess.name); sync(false); return;
    }
    if (ST().entryCode && code === codeKey(ST().entryCode)) {
      state.lock = { n: 0, until: 0 }; state.me = state.me || { name: "", phone: "", place: "", id: "" };
      ui.gate = false; ui.tab = "p_items"; persist(); render(); toast("സ്വാഗതം"); sync(false); return;
    }
    state.lock.n++;
    if (state.lock.n >= CFG.MAX_TRIES) { state.lock = { n: 0, until: Date.now() + CFG.LOCK_MS }; gateMsg("gateErr", "5 തവണ തെറ്റി. 30 സെക്കൻഡ് കാത്തിരിക്കുക."); }
    else gateMsg("gateErr", "തെറ്റായ കോഡ്! (" + (CFG.MAX_TRIES - state.lock.n) + " ശ്രമങ്ങൾ ബാക്കി)");
    persist();
  }
  function join() {
    const name = clean(($("#g_name") || {}).value), digits = String(($("#g_phone") || {}).value || "").replace(/\D/g, "").slice(-10), place = clean(($("#g_place") || {}).value);
    if (!name) return gateMsg("joinErr", "പേര് നൽകുക");
    if (digits.length < 10) return gateMsg("joinErr", "ശരിയായ ഫോൺ നമ്പർ നൽകുക (10 അക്കം)");
    if (!place) return gateMsg("joinErr", "സ്ഥലം നൽകുക");
    const id = "m" + digits, old = state.data.members[id];
    save("members", { id, name, phone: digits, place, at: old ? old.at : Date.now(), deleted: false });
    state.me = { name, phone: digits, place, id }; ui.gate = false; ui.tab = "p_items"; persist(); render(); toast("സ്വാഗതം " + name); sync(false);
  }
  function logout() { session = null; ui.tab = "p_items"; ui.gate = false; modal = null; renderModal(); render(); }

  /* =====================================================================
     8. SHELL
     ===================================================================== */
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const PUB_TABS = [["p_items", "ഉപകരണങ്ങൾ", "heart"], ["p_my", "എന്റെ അപേക്ഷ", "inbox"], ["p_contact", "ബന്ധപ്പെടുക", "phone"]];
  const staffTabs = () => [["s_home", "ഹോം", "home"], ["s_items", "ഉപകരണങ്ങൾ", "box"], ["s_loans", "കൊടുത്തവ", "hand"], ["s_reqs", "അപേക്ഷകൾ", "inbox"], ["s_more", isAdmin() ? "അഡ്മിൻ" : "കൂടുതൽ", "settings"]].filter((t) => (t[0] !== "s_loans" || can("view_loans")) && (t[0] !== "s_reqs" || can("reqs")));
  function render() {
    const root = $("#root");
    if (ui.hash) { root.innerHTML = replyPageView(); return; }
    if (!session && (!state.me || ui.gate)) { root.innerHTML = gateView(); return; }
    const b = INFO(), st = statusText();
    const tabs = session ? staffTabs() : PUB_TABS;
    if (!tabs.some((t) => t[0] === ui.tab)) ui.tab = tabs[0][0];
    const badge = (k) => { if (k !== "s_reqs") return ""; const n = pendingReq().length; return n ? '<b class="bdg">' + n + "</b>" : ""; };
    root.innerHTML =
      '<div class="app"><header class="header"><div class="header-in"><div class="brand"><div class="logo">' + ICON.heart + '</div><div style="min-width:0"><b>' + h(b.name) + (session ? '<span class="role ' + (isAdmin() ? "" : "staff") + '">' + (isAdmin() ? "ADMIN" : "STAFF") + "</span>" : "") + "</b><small>" + h(b.place) + (b.tag ? " • " + h(b.tag) : "") + "</small></div></div>" +
      '<div class="hbtns"><button type="button" class="hb" data-act="theme" aria-label="Theme">' + (state.theme === "dark" ? ICON.sun : ICON.moon) + '</button><button type="button" class="hb" data-act="install" id="btnInstall" aria-label="Install">' + ICON.phone2 + "</button>" +
      (session ? '<button type="button" class="hb red" data-act="logout">' + ICON.lock + "<span>ലോക്ക്</span></button>" : '<button type="button" class="hb" data-act="to-gate">' + ICON.user + "<span>സ്റ്റാഫ്</span></button>") + "</div></div>" +
      '<div class="statusbar"><span class="dot ' + st[0] + '" id="syncDot"></span><span id="syncText">' + h(st[1]) + "</span></div></header>" +
      '<main class="main" id="app">' + paneHtml() + '</main><nav class="dock">' + tabs.map((t) => '<button type="button" data-act="tab" data-t="' + t[0] + '" class="' + (ui.tab === t[0] ? "on" : "") + '">' + ICON[t[2]] + "<span>" + t[1] + "</span>" + badge(t[0]) + "</button>").join("") + "</nav></div>";
    const inst = $("#btnInstall"); if (inst) inst.hidden = isStandalone();
  }
  function paneHtml() {
    switch (ui.tab) {
      case "p_my": return myReqView();
      case "p_contact": return contactView();
      case "s_home": return dashView();
      case "s_items": return itemsView();
      case "s_loans": return loansView();
      case "s_reqs": return reqsView();
      case "s_more": return moreView();
      default: return pubItemsView();
    }
  }
  function softRefresh() {
    if (modal || ui.hash) return;
    const a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $("#app") && $("#app").contains(a)) return;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }

  const emptyBox = (t) => '<div class="empty">' + h(t) + "</div>";
  const opt = (v, label, sel, extra) => '<option value="' + h(v) + '"' + (sel ? " selected" : "") + (extra || "") + ">" + h(label) + "</option>";
  const telBtn = (p) => (p ? '<a class="ib" href="tel:' + h(p) + '" aria-label="Call">' + ICON.phone + "</a>" : "");
  const waBtn = (p) => (waNum(p) ? '<a class="ib wa" target="_blank" rel="noopener" href="https://wa.me/' + waNum(p) + '" aria-label="WhatsApp">' + ICON.msg + "</a>" : "");
  const availChip = (it) => { const a = shownAvail(it); return a > 0 ? '<span class="chip ok"><i class="mk g"></i>ലഭ്യം ' + a + "</span>" : '<span class="chip rose"><i class="mk r"></i>ലഭ്യമല്ല</span>'; };
  const lamp = (it) => shownAvail(it) > 0 ? '<span class="lamp-b g"><i class="lamp"></i><b>ലഭ്യമാണ്</b><small>ഇപ്പോൾ എടുക്കാം</small></span>' : '<span class="lamp-b r"><i class="lamp"></i><b>ലഭ്യമല്ല</b><small>ഇപ്പോൾ ഇല്ല</small></span>';
  const servicesCards = () => {
    const arr = live("services").sort((a, b) => (a.order || 0) - (b.order || 0) || (a.at || 0) - (b.at || 0));
    if (!arr.length) return "";
    return '<section class="card"><div class="pad-s"><h2>ഞങ്ങളുടെ പ്രവർത്തനങ്ങൾ</h2></div><div class="list">' + arr.map((x) => '<div class="li wrapli"><div class="av">' + ICON.heart + '</div><div class="grow"><div class="t">' + h(x.title) + "</div>" + (x.text ? '<div class="s">' + h(x.text) + "</div>" : "") + "</div></div>").join("") + "</div></section>";
  };
  const catChips = () => {
    const used = Array.from(new Set(live("items").map((i) => i.category || "മറ്റുള്ളവ")));
    return '<div class="chips"><button type="button" data-act="cat" data-c="all" class="' + (ui.cat === "all" ? "on" : "") + '">എല്ലാം</button>' + used.map((c) => '<button type="button" data-act="cat" data-c="' + h(c) + '" class="' + (ui.cat === c ? "on" : "") + '">' + h(c) + "</button>").join("") + "</div>";
  };
  const filteredItems = () => { const q = norm(ui.search); return live("items").filter((i) => (ui.cat === "all" || (i.category || "മറ്റുള്ളവ") === ui.cat) && (!q || norm(i.name + " " + (i.category || "") + " " + (i.note || "")).includes(q))).sort(byName); };

  function announceCards(max) {
    const arr = live("announcements").sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.at || 0) - (a.at || 0)).slice(0, max || 3);
    return arr.map((a) => '<section class="notice"><div class="nh">' + ICON.mega + (a.pinned ? "📌 " : "") + h(a.title || "അറിയിപ്പ്") + '<span>' + h(fmtDate(isoOf(new Date(a.at || Date.now())))) + '</span></div><div class="nt">' + h(a.text) + "</div></section>").join("");
  }

  /* ---------- PUBLIC ---------- */
  function pubItemsView() {
    const b = INFO(), items = filteredItems();
    return '<section class="hero"><div class="hero-t">' + h(b.name) + '</div><p>' + h(b.about) + '</p><div class="row wrap">' + (b.phone ? '<a class="btn amber sm" href="tel:' + h(b.phone) + '">' + ICON.phone + "വിളിക്കുക</a>" : "") + (waNum(b.wa || b.phone) ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/' + waNum(b.wa || b.phone) + '">' + ICON.msg + "WhatsApp</a>" : "") + "</div></section>" +
      announceCards(3) + servicesCards() +
      '<section class="card stack"><label class="searchbox">' + ICON.search + '<input class="in" data-ui="search" placeholder="ഉപകരണം തിരയുക… (വീൽചെയർ, വാക്കർ…)" value="' + h(ui.search) + '"></label>' + catChips() + "</section>" +
      '<div class="grid-cards">' + (items.length ? items.map((it) => '<article class="icard ' + (shownAvail(it) > 0 ? "ok" : "no") + '"><div class="row between"><div class="t">' + h(it.name) + "</div>" + lamp(it) + '</div><div class="s">' + h(it.category || "മറ്റുള്ളവ") + (it.note ? " • " + h(it.note) : "") + '</div><button type="button" class="btn block ' + (shownAvail(it) > 0 ? "" : "ghost") + '" data-act="req" data-id="' + h(it.id) + '">' + ICON.hand + (shownAvail(it) > 0 ? "അപേക്ഷിക്കുക" : "ലഭ്യമാകുമ്പോൾ അറിയിക്കുക") + "</button></article>").join("") : emptyBox(live("items").length ? "ഒന്നും കണ്ടെത്തിയില്ല" : "ഉപകരണങ്ങൾ ഉടൻ ചേർക്കും")) + "</div>" +
      '<section class="card stack"><b>ഇവിടെ ഇല്ലാത്ത ഉപകരണം വേണോ?</b><div class="muted">ലിസ്റ്റിൽ ഇല്ലാത്ത ഉപകരണത്തിനും അപേക്ഷ നൽകാം. ഓഫീസ് സ്റ്റാഫ് ബന്ധപ്പെടും.</div><button type="button" class="btn ghost block" data-act="req" data-id="">' + ICON.plus + "മറ്റൊരു ഉപകരണത്തിന് അപേക്ഷിക്കുക</button></section>";
  }
  function myReqView() {
    const arr = state.myReq.map((id) => state.data.requests[id]).filter((r) => r && !r.deleted).sort(newest);
    return '<section class="card"><div class="pad-s"><h2>എന്റെ അപേക്ഷകൾ</h2><div class="muted">ഈ ഫോണിൽ നിന്ന് നൽകിയ അപേക്ഷകളുടെ നിലവിലെ അവസ്ഥ ഇവിടെ കാണാം</div></div><div class="list">' + (arr.length ? arr.map((r) => reqCard(r, false)).join("") : emptyBox("അപേക്ഷകൾ ഇല്ല")) + "</div></section>";
  }
  function contactView() {
    const b = INFO();
    return '<section class="card stack"><h2>' + h(b.name) + '</h2><div class="muted">' + h(b.tag) + '</div><p style="margin:0">' + h(b.about) + "</p>" +
      (b.place ? '<div class="kv"><span>സ്ഥലം</span><b>' + h(b.place) + "</b></div>" : "") + (b.hours ? '<div class="kv"><span>പ്രവർത്തന സമയം</span><b>' + h(b.hours) + "</b></div>" : "") + (b.phone ? '<div class="kv"><span>ഫോൺ</span><b>' + h(b.phone) + "</b></div>" : "") +
      '<div class="row wrap">' + (b.phone ? '<a class="btn" href="tel:' + h(b.phone) + '">' + ICON.phone + "വിളിക്കുക</a>" : "") + (waNum(b.wa || b.phone) ? '<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/' + waNum(b.wa || b.phone) + '">' + ICON.msg + "WhatsApp</a>" : "") + "</div></section>" + servicesCards() + announceCards(10);
  }
  function reqCard(r, staff) {
    const cls = { new: "amber", approved: "", waiting: "blue", declined: "rose", cancelled: "" }[r.status] || "";
    return '<div class="li wrapli"><div class="av">' + h(initial(r.name)) + '</div><div class="grow"><div class="t">' + (staff ? h(r.name) + " • " : "") + h(r.itemName || "ഉപകരണം (ലിസ്റ്റിൽ ഇല്ല)") + (r.qty > 1 ? " × " + r.qty : "") + '</div><div class="s">' + h(fmtDay(isoOf(new Date(r.createdAt || Date.now())))) + (r.neededOn ? " • ആവശ്യം: " + h(fmtDate(r.neededOn)) : "") + (staff ? (r.phone ? " • " + h(r.phone) : "") + (r.place ? " • " + h(r.place) : "") : "") + "</div>" +
      (r.need ? '<div class="s">“' + h(r.need) + "”</div>" : "") + (r.reply ? '<div class="reply-box">' + ICON.msg + h(r.reply) + "</div>" : "") + '</div><div class="right"><span class="chip ' + cls + '">' + h(REQ_STATUS[r.status] || r.status) + "</span></div>" +
      (staff ? "" : (r.status === "new" ? '<div class="acts-row row"><button type="button" class="btn sm ghost red" data-act="cancel-req" data-id="' + h(r.id) + '">റദ്ദാക്കുക</button></div>' : "")) + "</div>";
  }

  /* ---------- STAFF: dashboard ---------- */
  function dashView() {
    const items = live("items"), total = items.reduce((a, i) => a + num(i.qty), 0), out = activeLoans().reduce((a, l) => a + num(l.qty), 0);
    const od = activeLoans().filter(isOverdue), np = pendingReq(), ur = unackReplies();
    return '<div class="tiles"><div class="tile hero"><div class="lbl">ആകെ ഉപകരണങ്ങൾ</div><div class="val">' + total + '</div><div class="sub">' + items.length + ' ഇനങ്ങൾ</div></div><div class="tile"><div class="lbl">ഉപയോഗത്തിൽ</div><div class="val">' + out + '</div><div class="sub">' + activeLoans().length + ' പേർ</div></div>' +
      '<div class="tile amber"><div class="lbl">പുതിയ അപേക്ഷകൾ</div><div class="val">' + np.length + '</div><div class="sub">മറുപടി നൽകാനുണ്ട്</div></div><div class="tile rose"><div class="lbl">തിരിച്ചേൽപ്പിക്കാൻ വൈകിയവ</div><div class="val">' + od.length + '</div><div class="sub">ഓർമ്മപ്പെടുത്താം</div></div></div>' +
      (ur.length ? '<section class="card"><div class="pad-s"><h2>📩 ഉപയോക്താക്കളുടെ മറുപടികൾ</h2></div><div class="list">' + ur.map((l) => { const r = replyOf(l); return '<div class="li wrapli"><div class="grow"><div class="t">' + h(l.borrower) + " • " + h(l.itemName) + '</div><div class="s"><b>' + h(ANSWERS[r.answer] || r.answer) + "</b>" + (r.when ? " • " + h(fmtDate(r.when)) : "") + (r.msg ? " — " + h(r.msg) : "") + '</div></div><div class="acts-row row">' + telBtn(l.phone) + '<button type="button" class="btn sm" data-act="ack-reply" data-id="' + h(l.id) + '">' + ICON.check + "കണ്ടു</button>" + (r.answer === "return" && can("lend") ? '<button type="button" class="btn sm ghost" data-act="return" data-id="' + h(l.id) + '">തിരിച്ചെടുത്തു</button>' : "") + "</div></div>"; }).join("") + "</div></section>" : "") +
      '<section class="card"><div class="row between pad-s"><h2>പുതിയ അപേക്ഷകൾ</h2><button type="button" class="btn sm ghost" data-act="tab" data-t="s_reqs">എല്ലാം</button></div><div class="list">' + (np.length ? np.sort(newest).slice(0, 5).map((r) => reqCard(r, true)).join("") : emptyBox("പുതിയ അപേക്ഷകൾ ഇല്ല")) + "</div></section>" +
      '<div class="row wrap">' + (can("lend") ? '<button type="button" class="btn grow" data-act="lend">' + ICON.hand + 'ഉപകരണം നൽകുക</button>' : "") + '' + (can("item_edit") ? '<button type="button" class="btn ghost grow" data-act="add-item">' + ICON.plus + "പുതിയ ഉപകരണം</button>" : "") + "</div>" + announceCards(3);
  }

  /* ---------- STAFF: items ---------- */
  function itemsView() {
    const items = filteredItems();
    return '<section class="card stack"><div class="row between"><h2>ഉപകരണങ്ങൾ</h2>' + (can("item_edit") ? '<button type="button" class="btn sm" data-act="add-item">' + ICON.plus + "പുതിയത്</button>" : "") + '</div><label class="searchbox">' + ICON.search + '<input class="in" data-ui="search" placeholder="തിരയുക…" value="' + h(ui.search) + '"></label>' + catChips() + "</section>" +
      '<section class="card"><div class="list">' + (items.length ? items.map((it) => {
        const out = outQty(it.id), a = availQty(it), w = waitingFor(it.id).length;
        return '<div class="li wrapli"><div class="av">' + ICON.box + '</div><div class="grow"><div class="t">' + h(it.name) + '</div><div class="s">' + h(it.category || "") + " • " + h(SOURCES[it.source] || "") + (it.source === "donation" && it.donor ? " (" + h(it.donor) + ")" : "") + (it.source === "purchase" && num(it.price) ? " (" + money(it.price) + ")" : "") + '</div><div class="s">ആകെ ' + num(it.qty) + " • ഉപയോഗത്തിൽ " + out + (num(it.damaged) ? " • കേടായത് " + num(it.damaged) : "") + (w ? " • കാത്തിരിക്കുന്നവർ " + w : "") + '</div></div><div class="right">' + (a > 0 ? '<span class="chip ok"><i class="mk g"></i>ലഭ്യം ' + a + "</span>" : '<span class="chip rose"><i class="mk r"></i>ഇല്ല</span>') + '</div><div class="acts-row row">' +
          (can("lend") ? '<button type="button" class="btn sm" data-act="lend" data-id="' + h(it.id) + '"' + (a > 0 ? "" : " disabled") + ">" + ICON.hand + "നൽകുക</button>" : "") + '<button type="button" class="btn sm ghost" data-act="hist" data-id="' + h(it.id) + '">' + ICON.list + "</button>" +
          (can("item_edit") ? '<button type="button" class="btn sm ghost" data-act="edit-item" data-id="' + h(it.id) + '">' + ICON.edit + "</button>" : "") + (can("item_del") ? '<button type="button" class="btn sm ghost red" data-act="del-item" data-id="' + h(it.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
      }).join("") : emptyBox("ഉപകരണങ്ങൾ ഇല്ല" + (can("item_edit") ? " — 'പുതിയത്' അമർത്തി ചേർക്കുക" : ""))) + "</div></section>";
  }

  /* ---------- STAFF: loans ---------- */
  function loansView() {
    const q = norm(ui.loanQ);
    let arr = live("loans");
    if (ui.loanF === "out") arr = arr.filter((l) => l.status === "out");
    else if (ui.loanF === "late") arr = arr.filter(isOverdue);
    else arr = arr.filter((l) => l.status === "returned");
    arr = arr.filter((l) => !q || norm(l.borrower + " " + l.phone + " " + l.itemName + " " + (l.place || "")).includes(q)).sort((a, b) => (b.dateOut || "").localeCompare(a.dateOut || "") || newest(a, b));
    const seg = (k, t) => '<button type="button" data-act="loanf" data-k="' + k + '" class="' + (ui.loanF === k ? "on" : "") + '">' + t + "</button>";
    return '<section class="card stack"><div class="row between"><h2>നൽകിയ ഉപകരണങ്ങൾ</h2>' + (can("lend") ? '<button type="button" class="btn sm" data-act="lend">' + ICON.plus + 'നൽകുക</button>' : "") + '</div><div class="seg">' + seg("out", "ഉപയോഗത്തിൽ") + seg("late", "വൈകിയവ") + seg("ret", "തിരിച്ചെടുത്തവ") + '</div><label class="searchbox">' + ICON.search + '<input class="in" data-ui="loanQ" placeholder="പേര് / ഫോൺ / ഉപകരണം" value="' + h(ui.loanQ) + '"></label></section>' +
      '<section class="card"><div class="list">' + (arr.length ? arr.map(loanCard).join("") : emptyBox("ഒന്നും ഇല്ല")) + "</div></section>";
  }
  function loanCard(l) {
    const r = replyOf(l), od = isOverdue(l), w = waitingFor(l.itemId).length, out = l.status === "out";
    return '<div class="li wrapli"><div class="av' + (od ? " late" : "") + '">' + h(initial(l.borrower)) + '</div><div class="grow"><div class="t">' + h(l.borrower) + '</div><div class="s">' + h(l.itemName) + (l.qty > 1 ? " × " + l.qty : "") + (l.phone ? " • " + h(l.phone) : "") + (l.place ? " • " + h(l.place) : "") + '</div><div class="s">എടുത്തത്: ' + h(fmtDate(l.dateOut)) + (l.due ? " • തിരിച്ച്: " + h(fmtDate(l.due)) : "") + (!out && l.dateIn ? " • തിരിച്ചെടുത്തത്: " + h(fmtDate(l.dateIn)) : "") + "</div>" + (l.note ? '<div class="s">' + h(l.note) + "</div>" : "") +
      (r ? '<div class="reply-box">' + ICON.msg + "<b>" + h(ANSWERS[r.answer] || r.answer) + "</b>" + (r.when ? " • " + h(fmtDate(r.when)) : "") + (r.msg ? " — " + h(r.msg) : "") + "</div>" : "") + '</div><div class="right">' + (out ? (od ? '<span class="chip rose">വൈകി</span>' : '<span class="chip blue">ഉപയോഗത്തിൽ</span>') + (w ? '<span class="chip amber">' + w + " പേർ കാത്തിരിക്കുന്നു</span>" : "") : '<span class="chip">തിരിച്ചെടുത്തു</span>') + "</div>" +
      '<div class="acts-row row">' + telBtn(l.phone) + (out ? (can("lend") ? '<button type="button" class="btn sm" data-act="return" data-id="' + h(l.id) + '">' + ICON.undo + "തിരിച്ചെടുക്കുക</button>" : "") + (can("remind") ? '<button type="button" class="btn sm ghost wa" data-act="remind" data-id="' + h(l.id) + '">' + ICON.bell + "ഉണർത്തുക</button>" + '<button type="button" class="btn sm ghost" data-act="rec-reply" data-id="' + h(l.id) + '">' + ICON.msg + "</button>" : "") : "") +
      (can("loan_edit") ? '<button type="button" class="btn sm ghost" data-act="edit-loan" data-id="' + h(l.id) + '">' + ICON.edit + "</button>" : "") + (can("loan_edit") ? '<button type="button" class="btn sm ghost red" data-act="del-loan" data-id="' + h(l.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>";
  }

  /* ---------- STAFF: requests ---------- */
  function reqsView() {
    const seg = (k, t, n) => '<button type="button" data-act="reqf" data-k="' + k + '" class="' + (ui.reqF === k ? "on" : "") + '">' + t + (n ? " (" + n + ")" : "") + "</button>";
    const all = live("requests");
    const arr = all.filter((r) => (ui.reqF === "new" ? r.status === "new" : ui.reqF === "wait" ? r.status === "waiting" : r.status !== "new" && r.status !== "waiting")).sort(newest);
    return '<section class="card stack"><h2>അപേക്ഷകൾ</h2><div class="seg">' + seg("new", "പുതിയത്", all.filter((r) => r.status === "new").length) + seg("wait", "കാത്തിരിക്കുന്നു", all.filter((r) => r.status === "waiting").length) + seg("done", "പൂർത്തിയായവ") + '</div><button type="button" class="btn ghost block" data-act="add-req">' + ICON.plus + "ഫോൺ / നേരിട്ട് വന്ന അപേക്ഷ ചേർക്കുക</button></section>" +
      '<section class="card"><div class="list">' + (arr.length ? arr.map((r) => {
        const it = r.itemId ? byId("items", r.itemId) : null, a = it ? availQty(it) : 0;
        const open = r.status === "new" || r.status === "waiting";
        return reqCard(r, true).replace(/<\/div>$/, "") + (open ? '<div class="acts-row row">' + telBtn(r.phone) + waBtn(r.phone) + '<button type="button" class="btn sm" data-act="req-allow" data-id="' + h(r.id) + '">' + ICON.check + "അനുവദിക്കുക</button>" + '<button type="button" class="btn sm ghost" data-act="req-no" data-id="' + h(r.id) + '">ലഭ്യമല്ല</button>' + (it && a === 0 ? '<button type="button" class="btn sm ghost wa" data-act="req-ask" data-id="' + h(r.id) + '">' + ICON.bell + "ഉപയോഗിക്കുന്നവരോട് ചോദിക്കുക</button>" : "") + "</div>" : "") +
          (isAdmin() ? '<div class="acts-row row"><button type="button" class="btn sm ghost red" data-act="del-req" data-id="' + h(r.id) + '">' + ICON.trash + "</button></div>" : "") + "</div>";
      }).join("") : emptyBox("ഒന്നും ഇല്ല")) + "</div></section>";
  }

  /* ---------- STAFF: more / admin ---------- */
  let snapCache = [];
  async function getSnapshots() { try { return (await withTimeout(idbGet("snapshots"), 3000)) || []; } catch (e) { return []; } }
  function moreView() {
    const b = INFO(); let o = "";
    const hd = (t, sub, btn) => '<div class="row between pad-s"><div><h2>' + t + "</h2>" + (sub ? '<div class="muted">' + sub + "</div>" : "") + "</div>" + (btn || "") + "</div>";
    const eb = (act, id, ic, cls) => '<button type="button" class="btn sm ghost ' + (cls || "") + '" data-act="' + act + '" data-id="' + h(id) + '">' + ic + "</button>";
    if (isAdmin()) {
      o += (ST().adminHash === pinHash("1234") ? '<div class="banner red">⚠️ ഡിഫോൾട്ട് അഡ്മിൻ കോഡ് (1234) ഇപ്പോഴും ഉപയോഗത്തിലുണ്ട്. ഉടൻ മാറ്റുക.</div>' : "") + (ST().entryCode === "1000" ? '<div class="banner red">⚠️ പൊതു എൻട്രി കോഡ് ഡിഫോൾട്ട് (1000) ആണ്. നിങ്ങളുടെ കോഡ് നൽകുക.</div>' : "");
    }
    if (can("ann")) {
      const arr = live("announcements").sort((a, c) => (c.at || 0) - (a.at || 0));
      o += '<section class="card">' + hd("അറിയിപ്പുകൾ", "ജോയിൻ ചെയ്ത എല്ലാവർക്കും കാണും", '<button type="button" class="btn sm" data-act="add-ann">' + ICON.plus + "പുതിയത്</button>") + '<div class="list">' +
        (arr.length ? arr.map((a) => '<div class="li wrapli"><div class="grow"><div class="t">' + (a.pinned ? "📌 " : "") + h(a.title) + '</div><div class="s">' + h(a.text) + '</div></div><div class="acts-row row">' + eb("edit-ann", a.id, ICON.edit) + eb("del-ann", a.id, ICON.trash, "red") + "</div></div>").join("") : emptyBox("അറിയിപ്പുകൾ ഇല്ല")) + "</div></section>";
    }
    if (can("services")) {
      const arr = live("services").sort((a, c) => (a.order || 0) - (c.order || 0) || (a.at || 0) - (c.at || 0));
      o += '<section class="card">' + hd("പ്രവർത്തനങ്ങൾ", "സ്വാന്തന കേന്ദ്രത്തിന് കീഴിലെ പ്രവർത്തനങ്ങൾ — എല്ലാവർക്കും കാണും", '<button type="button" class="btn sm" data-act="add-svc">' + ICON.plus + "പുതിയത്</button>") + '<div class="list">' +
        (arr.length ? arr.map((x) => '<div class="li wrapli"><div class="grow"><div class="t">' + h(x.title) + '</div><div class="s">' + h(x.text) + '</div></div><div class="acts-row row">' + eb("edit-svc", x.id, ICON.edit) + eb("del-svc", x.id, ICON.trash, "red") + "</div></div>").join("") : emptyBox("പ്രവർത്തനങ്ങൾ ചേർത്തിട്ടില്ല")) + "</div></section>";
    }
    if (can("members")) {
      const arr = live("members").sort((a, c) => (c.at || 0) - (a.at || 0));
      o += '<section class="card">' + hd("ജോയിൻ ചെയ്തവർ (" + arr.length + ")", "പേര്, ഫോൺ, സ്ഥലം നൽകി ചേർന്നവർ") + '<div class="list">' +
        (arr.length ? arr.map((m) => '<div class="li wrapli"><div class="av">' + h(initial(m.name)) + '</div><div class="grow"><div class="t">' + h(m.name) + '</div><div class="s">' + h(m.phone) + " • " + h(m.place) + " • " + h(fmtDate(isoOf(new Date(m.at || Date.now())))) + '</div></div><div class="acts-row row">' + telBtn(m.phone) + waBtn(m.phone) + (isAdmin() ? eb("del-member", m.id, ICON.trash, "red") : "") + "</div></div>").join("") : emptyBox("ആരും ജോയിൻ ചെയ്തിട്ടില്ല")) + "</div></section>";
    }
    if (isAdmin()) {
      o += '<section class="card stack"><h2>ഓഫീസ് വിവരങ്ങൾ</h2><label class="f">പേര്<input id="b_name" class="in" value="' + h(b.name) + '"></label><label class="f">ടാഗ്‌ലൈൻ<input id="b_tag" class="in" value="' + h(b.tag) + '"></label><div class="g2"><label class="f">സ്ഥലം<input id="b_place" class="in" value="' + h(b.place) + '"></label><label class="f">ഫോൺ<input id="b_phone" class="in" inputmode="tel" value="' + h(b.phone) + '"></label></div><label class="f">WhatsApp നമ്പർ<input id="b_wa" class="in" inputmode="tel" value="' + h(b.wa) + '"></label><label class="f">പ്രവർത്തന സമയം<input id="b_hours" class="in" value="' + h(b.hours) + '" placeholder="ഉദാ: രാവിലെ 9 – വൈകിട്ട് 5"></label><label class="f">വിവരണം<textarea id="b_about" class="ta" rows="3">' + h(b.about) + '</textarea></label><button type="button" class="btn" data-act="save-info">സേവ്</button></section>' +
        '<section class="card">' + hd("സ്റ്റാഫ്", "ഓരോരുത്തർക്കും സ്വന്തം കോഡും അനുമതികളും", '<button type="button" class="btn sm" data-act="add-staff">' + ICON.plus + "പുതിയത്</button>") + '<div class="list">' +
        (live("staff").length ? live("staff").sort(byName).map((p) => '<div class="li"><div class="av">' + h(initial(p.name)) + '</div><div class="grow"><div class="t">' + h(p.name) + '</div><div class="s">' + PERMS.filter((x) => (p.perms && x[0] in p.perms ? p.perms[x[0]] : x[2])).length + " / " + PERMS.length + " അനുമതികൾ</div></div>" + eb("edit-staff", p.id, ICON.edit) + eb("del-staff", p.id, ICON.trash, "red") + "</div>").join("") : emptyBox("സ്റ്റാഫ് ഇല്ല")) + "</div></section>" +
        '<section class="card stack"><h2>കോഡുകൾ</h2><label class="f">പൊതു എൻട്രി കോഡ് (എല്ലാവർക്കും നൽകാം)<input id="a_entry" class="in" autocomplete="off" maxlength="12" value="' + h(ST().entryCode || "") + '"></label><button type="button" class="btn" data-act="save-entry">എൻട്രി കോഡ് സേവ് ചെയ്യുക</button>' +
        '<label class="f" style="margin-top:8px">പുതിയ അഡ്മിൻ കോഡ് (4–12 അക്ഷരം/അക്കം)<input id="a_pin" class="in" autocomplete="off" maxlength="12"></label><button type="button" class="btn ghost" data-act="save-pin">അഡ്മിൻ കോഡ് മാറ്റുക</button></section>';
    }
    if (can("reports")) {
      o += '<section class="card stack"><h2>റിപ്പോർട്ട്</h2><div class="muted">മാസാവസാനം ആരൊക്കെ, ഏതൊക്കെ ഉപകരണങ്ങൾ കൊണ്ടുപോയി എന്ന PDF (പ്രിന്റ് ചെയ്യാം)</div><label class="f">മാസം<input id="rp_month" type="month" class="in" value="' + h(ui.month) + '"></label><div class="row wrap"><button type="button" class="btn" data-act="month-pdf">' + ICON.file + 'മാസ റിപ്പോർട്ട് PDF</button><button type="button" class="btn ghost" data-act="month-wa">' + ICON.msg + 'WhatsApp</button></div>' +
        '<div class="muted" style="margin-top:6px">സ്റ്റോക്ക് ലിസ്റ്റ്</div><div class="row wrap"><button type="button" class="btn ghost" data-act="stock-pdf">' + ICON.file + 'സ്റ്റോക്ക് PDF</button><button type="button" class="btn ghost" data-act="stock-wa">' + ICON.msg + "WhatsApp</button></div></section>";
    }
    o += '<section class="card stack"><h2>ബാക്കപ്പ് & സിങ്ക്</h2><div class="banner green" id="syncBanner">' + h(statusText()[1]) + (state.lastSync ? " • അവസാന സിങ്ക്: " + new Date(state.lastSync).toLocaleString("en-IN") : "") + '</div><div class="muted">ഡാറ്റ ബേസ്: ' + h(dbBase() || "സജ്ജമാക്കിയിട്ടില്ല") + '</div><div class="row wrap"><button type="button" class="btn" data-act="sync-now">' + ICON.refresh + 'സിങ്ക്</button><button type="button" class="btn ghost" data-act="snapshot">' + ICON.download + 'ഫോൺ ബാക്കപ്പ്</button><button type="button" class="btn ghost" data-act="export">' + ICON.file + 'JSON</button>' +
      (isAdmin() ? '<label class="btn ghost" style="cursor:pointer">' + ICON.upload + 'റീസ്റ്റോർ<input type="file" accept=".json,application/json" data-ch="restore-file" hidden></label><button type="button" class="btn ghost" data-act="db-url">Firebase വിലാസം</button>' : "") + '</div><div id="snapList" class="stack"><div class="muted">ലോഡ് ചെയ്യുന്നു…</div></div></section>';
    getSnapshots().then((arr) => { snapCache = arr; const el = $("#snapList"); if (el) el.innerHTML = arr.length ? arr.map((x) => '<div class="li" style="border:1px solid var(--line);border-radius:13px"><div class="grow"><div class="t">' + h(x.label) + '</div><div class="s">' + h(x.ts) + "</div></div>" + (isAdmin() ? '<button type="button" class="btn sm ghost" data-act="restore-snap" data-id="' + h(x.id) + '">Restore</button>' : "") + "</div>").join("") : '<div class="muted">ഫോൺ ബാക്കപ്പുകൾ ഇല്ല</div>'; });
    return o;
  }

  /* ---------- Borrower reply page (opened from WhatsApp link, no login) ---------- */
  let replyCtx = null; // { id, token, loan, done, err }
  function replyPageView() {
    const b = INFO(), c = replyCtx || {};
    let body;
    if (c.done) body = '<div class="done-box">' + ICON.check + "<h2>നന്ദി!</h2><p>താങ്കളുടെ മറുപടി ഓഫീസിൽ അറിയിച്ചിട്ടുണ്ട്. ജസാകല്ലാഹു ഖൈർ 🤲</p></div>";
    else if (c.err) body = '<div class="banner red">' + h(c.err) + "</div>" + (b.phone ? '<a class="btn block" href="tel:' + h(b.phone) + '">' + ICON.phone + "ഓഫീസിൽ വിളിക്കുക</a>" : "");
    else if (!c.loan) body = '<div class="empty">ലോഡ് ചെയ്യുന്നു…</div>';
    else if (c.loan.status !== "out") body = '<div class="done-box">' + ICON.check + "<h2>ഈ ഉപകരണം തിരിച്ചേൽപ്പിച്ചതായി രേഖപ്പെടുത്തിയിട്ടുണ്ട്.</h2><p>നന്ദി!</p></div>";
    else body = '<p class="lead">സലാം, <b>' + h(c.loan.borrower) + '</b>.<br>താങ്കൾ എടുത്തിട്ടുള്ള <b>“' + h(c.loan.itemName) + '”</b> ഇപ്പോൾ മറ്റൊരാൾക്ക് ആവശ്യമുണ്ട്. താങ്കളുടെ സൗകര്യം അറിയിക്കുക:</p>' +
      '<div class="ans"><button type="button" class="btn block lg" data-act="reply-go" data-a="return">' + ICON.check + "തിരിച്ചു തരാം</button><button type=\"button\" class=\"btn ghost block lg\" data-act=\"reply-go\" data-a=\"later\">" + ICON.clock + "കുറച്ച് കഴിഞ്ഞ് തരാം</button><button type=\"button\" class=\"btn ghost block lg red\" data-act=\"reply-go\" data-a=\"no\">" + ICON.x + "ഇപ്പോൾ സാധ്യമല്ല</button></div>" +
      '<label class="f">എപ്പോൾ തരാൻ കഴിയും? (ഓപ്ഷണൽ)<input id="rp_when" class="in" type="date"></label><label class="f">സന്ദേശം (ഓപ്ഷണൽ)<textarea id="rp_msg" class="ta" rows="2" maxlength="300" placeholder="ഉദാ: നാളെ വൈകിട്ട് കൊണ്ടുവരാം"></textarea></label>';
    return '<div class="login"><div class="login-card"><div class="login-head"><div class="logo">' + ICON.heart + "</div><h1>" + h(b.name) + '</h1><div class="tag">' + h(b.place) + '</div></div><div class="login-body" style="text-align:left">' + body + '<div class="center"><button type="button" class="linkbtn" data-act="reply-home">ഉപകരണങ്ങളുടെ ലിസ്റ്റ് കാണുക</button></div></div></div></div>';
  }

  /* =====================================================================
     9. MESSAGES (WhatsApp)
     ===================================================================== */
  const orgLine = () => INFO().name + (INFO().place ? ", " + INFO().place : "");
  function askText(l) {
    const w = waitingFor(l.itemId).length;
    const od = isOverdue(l);
    return ["സലാം " + l.borrower + ",", orgLine() + " ൽ നിന്നുള്ള അറിയിപ്പ്.",
      w > 0 ? "താങ്കൾ എടുത്തിട്ടുള്ള \"" + l.itemName + "\" ഇപ്പോൾ മറ്റൊരു ആവശ്യക്കാരന് ആവശ്യമുണ്ട്. തിരിച്ചേൽപ്പിക്കാൻ സാധിക്കുമെങ്കിൽ ദയവായി തിരിച്ചേൽപ്പിക്കുക. ഇപ്പോൾ സാധ്യമല്ലെങ്കിൽ അതും അറിയിക്കുക."
        : od ? "താങ്കൾ എടുത്തിട്ടുള്ള \"" + l.itemName + "\" തിരിച്ചേൽപ്പിക്കേണ്ട തീയതി (" + fmtDate(l.due) + ") കഴിഞ്ഞിരിക്കുന്നു. ദയവായി തിരിച്ചേൽപ്പിക്കുകയോ കൂടുതൽ സമയം ആവശ്യമെങ്കിൽ അറിയിക്കുകയോ ചെയ്യുക."
          : "താങ്കൾ എടുത്തിട്ടുള്ള \"" + l.itemName + "\" ഇപ്പോഴും ആവശ്യമുണ്ടോ? ഉപയോഗം കഴിഞ്ഞെങ്കിൽ തിരിച്ചേൽപ്പിക്കാൻ അഭ്യർത്ഥിക്കുന്നു.",
      "", "മറുപടി നൽകാൻ: " + replyLink(l), INFO().phone ? "ഫോൺ: " + INFO().phone : ""].filter((x, i, a) => x !== "" || (a[i - 1] !== "")).join("\n");
  }
  function allowText(r, l) {
    return ["സലാം " + r.name + ",", orgLine() + " ൽ നിന്ന്:", "താങ്കൾ അപേക്ഷിച്ച \"" + (r.itemName || "ഉപകരണം") + "\" ലഭ്യമാണ്." + (l ? " ഓഫീസിൽ വന്ന് കൈപ്പറ്റാവുന്നതാണ്." : ""), INFO().hours ? "സമയം: " + INFO().hours : "", INFO().phone ? "ഫോൺ: " + INFO().phone : ""].filter(Boolean).join("\n");
  }
  function declineText(r) {
    return ["സലാം " + r.name + ",", orgLine() + " ൽ നിന്ന്:", r.reply || (r.status === "waiting" ? "താങ്കൾ അപേക്ഷിച്ച ഉപകരണം ഇപ്പോൾ ലഭ്യമല്ല. ലഭ്യമാകുമ്പോൾ അറിയിക്കാം." : "ക്ഷമിക്കണം, താങ്കൾ അപേക്ഷിച്ച ഉപകരണം ഇപ്പോൾ ലഭ്യമല്ല."), INFO().phone ? "ഫോൺ: " + INFO().phone : ""].filter(Boolean).join("\n");
  }

  function openWa(phone, text) {
    const p = String(phone || "").replace(/\D/g, "");
    window.open((p.length >= 10 ? "https://wa.me/91" + p.slice(-10) : "https://wa.me/") + "?text=" + encodeURIComponent(text), "_blank");
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  /* ---------- backups ---------- */
  function dataSnapshot() { const o = {}; BACKUP_COLS.forEach((c) => { o[c] = JSON.parse(JSON.stringify(state.data[c])); }); return o; }
  async function createSnapshot(label) {
    const arr = await getSnapshots();
    arr.unshift({ id: "bk" + Date.now(), label, ts: new Date().toLocaleString("en-IN"), data: dataSnapshot() });
    try { await idbSet("snapshots", arr.slice(0, 15)); } catch (e) { /* ignore */ }
  }
  async function autoBackupCheck() { const t = todayIso(); if (state.lastAutoBackup !== t) { state.lastAutoBackup = t; persist(); await createSnapshot("Auto Backup (" + t + ")"); } }
  function restoreData(data) {
    const now = Date.now();
    BACKUP_COLS.forEach((col) => {
      const src = data[col]; if (!src) return;
      const map = Array.isArray(src) ? Object.fromEntries(src.filter((r) => r && r.id).map((r) => [r.id, r])) : src;
      Object.keys(state.data[col]).forEach((id) => { if (!map[id] && !state.data[col][id].deleted) { state.data[col][id].deleted = true; state.data[col][id].updatedAt = now; state.dirty[col + "/" + id] = 1; } });
      Object.keys(map).forEach((id) => { state.data[col][id] = Object.assign({}, map[id], { id, deleted: !!map[id].deleted, updatedAt: now }); state.dirty[col + "/" + id] = 1; });
    });
    persist(); scheduleSync();
  }
  /* --- canvas → JPEG → minimal PDF (works offline; browser shapes Malayalam correctly) --- */
  const PW = 1240, PH = 1754, MX = 80, TOP = 200, BOT = 110;
  const FONT = '"Noto Sans Malayalam","Noto Sans","Manjari","Meera","Nirmala UI","Kartika",system-ui,sans-serif';
  const fit = (ctx, str, maxW) => { if (ctx.measureText(str).width <= maxW) return str; const g = segs(str); while (g.length > 1 && ctx.measureText(g.join("") + "…").width > maxW) g.pop(); return g.join("") + "…"; };
  const rrect = (ctx, x, y, w, hh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  class PdfDoc {
    constructor(title, subtitle) { this.title = title; this.subtitle = subtitle; this.pages = []; this.newPage(); }
    newPage() {
      const c = document.createElement("canvas"); c.width = PW; c.height = PH;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, PW, PH);
      const g = x.createLinearGradient(0, 0, PW, 0); g.addColorStop(0, "#134e4a"); g.addColorStop(1, "#0f766e");
      x.fillStyle = g; x.fillRect(0, 0, PW, 170);
      x.fillStyle = "#fbbf24"; x.fillRect(0, 170, PW, 8);
      this.c = c; this.x = x; this.pages.push(c);
      const b = S().biz;
      this.t(b.name + "  •  " + b.place + "  •  " + b.phone, MX, 40, { size: 22, weight: 600, color: "#99f6e4", maxW: PW - 2 * MX });
      this.t(this.title, MX, 92, { size: 44, weight: 800, color: "#fff", maxW: PW - 2 * MX });
      this.t(this.subtitle, MX, 140, { size: 27, weight: 600, color: "#ccfbf1", maxW: PW - 2 * MX });
      this.y = TOP;
    }
    t(str, x, y, o) {
      o = o || {}; const ctx = this.x;
      ctx.font = (o.weight || 500) + " " + (o.size || 26) + "px " + FONT; ctx.fillStyle = o.color || "#0f172a"; ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle";
      let s = String(str); if (o.maxW) s = fit(ctx, s, o.maxW); ctx.fillText(s, x, y);
    }
    ensure(hh) { if (this.y + hh > PH - BOT) this.newPage(); }
    heading(text) { this.ensure(110); this.y += 10; this.x.fillStyle = "#059669"; rrect(this.x, MX, this.y, 10, 46, 5); this.x.fill(); this.t(text, MX + 28, this.y + 24, { size: 33, weight: 800, color: "#134e4a", maxW: PW - 2 * MX - 28 }); this.y += 70; }
    kpis(list) {
      const w = (PW - 2 * MX - 20 * (list.length - 1)) / list.length; this.ensure(170);
      list.forEach((k, i) => { const x0 = MX + i * (w + 20), x = this.x; x.fillStyle = k.bg || "#ecfdf5"; rrect(x, x0, this.y, w, 140, 22); x.fill(); this.t(k.label, x0 + 22, this.y + 38, { size: 21, weight: 700, color: "#475569", maxW: w - 40 }); this.t(k.value, x0 + 22, this.y + 94, { size: 38, weight: 800, color: k.color || "#047857", maxW: w - 40 }); });
      this.y += 170;
    }
    table(cols, rows, o) {
      o = o || {}; const RH = 60, total = PW - 2 * MX;
      const xOf = (c, cx, w) => (c.align === "right" ? cx + w - 18 : c.align === "center" ? cx + w / 2 : cx + 18);
      const head = () => { this.ensure(RH * 2); this.x.fillStyle = "#ccfbf1"; rrect(this.x, MX, this.y, total, RH - 8, 14); this.x.fill(); let cx = MX; cols.forEach((c) => { const w = c.w * total; this.t(c.label, xOf(c, cx, w), this.y + (RH - 8) / 2, { size: 22, weight: 800, color: "#134e4a", align: c.align, maxW: w - 30 }); cx += w; }); this.y += RH; };
      head();
      rows.forEach((r, i) => {
        if (this.y + RH > PH - BOT) { this.newPage(); head(); }
        this.x.fillStyle = r.hot ? "#fef3c7" : i % 2 ? "#f8fafc" : "#fff"; this.x.fillRect(MX, this.y, total, RH);
        this.x.fillStyle = "#e2e8f0"; this.x.fillRect(MX, this.y + RH - 1, total, 1);
        let cx = MX; cols.forEach((c, ci) => { const w = c.w * total; this.t(r.cells[ci], xOf(c, cx, w), this.y + RH / 2, { size: 25, weight: c.bold || r.bold ? 800 : 500, align: c.align, maxW: w - 30, color: (r.colors && r.colors[ci]) || c.color || "#0f172a" }); cx += w; });
        this.y += RH;
      });
      this.y += 26;
    }
    kv(label, value, o) {
      o = o || {}; this.ensure(70);
      if (o.line) { this.x.fillStyle = "#134e4a"; this.x.fillRect(PW / 2, this.y, PW / 2 - MX, 3); this.y += 10; }
      this.t(label, PW / 2 + 10, this.y + 28, { size: o.size || 27, weight: o.bold ? 800 : 600, color: "#334155" });
      this.t(value, PW - MX, this.y + 28, { size: o.size || 27, weight: 800, color: o.color || "#0f172a", align: "right" });
      this.y += o.gap || 54;
    }
    finish() {
      const n = this.pages.length;
      this.pages.forEach((c, i) => { const x = c.getContext("2d"); x.fillStyle = "#e2e8f0"; x.fillRect(MX, PH - 84, PW - 2 * MX, 2); x.font = "500 22px " + FONT; x.fillStyle = "#64748b"; x.textBaseline = "middle"; x.textAlign = "left"; x.fillText("തയ്യാറാക്കിയത്: " + fmtDate(todayIso()), MX, PH - 50); x.textAlign = "right"; x.fillText("പേജ് " + (i + 1) + " / " + n, PW - MX, PH - 50); });
      return this.pages;
    }
  }
  async function ensureFonts() { try { if (document.fonts && document.fonts.load) { await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(w + ' 26px "Noto Sans Malayalam"', "മലയാളം 1234"))); await document.fonts.ready; } } catch (e) { /* fallback fonts */ } }
  function pdfFromCanvases(canvases) {
    const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
    const push = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
    const obj = (n, fn) => { offs[n] = pos; push(n + " 0 obj\n"); fn(); push("endobj\n"); };
    const n = canvases.length, W = 595.28, H = 841.89;
    push("%PDF-1.4\n");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
    obj(2, () => push("<< /Type /Pages /Kids [" + canvases.map((_, i) => 3 + i * 3 + " 0 R").join(" ") + "] /Count " + n + " >>\n"));
    canvases.forEach((c, i) => {
      const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]); const bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      obj(pg, () => push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>\n"));
      const content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
      obj(ct, () => push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\n"));
      obj(im, () => { push("<< /Type /XObject /Subtype /Image /Width " + c.width + " /Height " + c.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + bytes.length + " >>\nstream\n"); push(bytes); push("\nendstream\n"); });
    });
    const total = 3 + n * 3, xref = pos; let x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    push(x + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    const out = new Uint8Array(pos); let o = 0; chunks.forEach((c) => { out.set(c, o); o += c.length; }); return out;
  }


  async function buildReportPdf(m) {
    await ensureFonts();
    const d = reportData(m), cp = canProfit();
    const doc = new PdfDoc("പ്രതിമാസ റിപ്പോർട്ട്", fmtMonth(m));
    doc.kpis([{ label: "വിൽപ്പന", value: money(d.sales) }, { label: "ലഭിച്ചത്", value: money(d.received), bg: "#eff6ff", color: "#0f766e" }, { label: "പർച്ചേസ്", value: money(d.purchase), bg: "#fffbeb", color: "#b45309" }]);
    const k2 = [{ label: "സപ്ലയർക്ക് നൽകിയത്", value: money(d.paidOut), bg: "#fffbeb", color: "#b45309" }, { label: "കിട്ടാനുള്ളത്", value: money(totalCredit()), bg: "#fff1f2", color: "#be123c" }, { label: "കൊടുക്കാനുള്ളത്", value: money(totalPayable()), bg: "#fff1f2", color: "#be123c" }];
    doc.kpis(k2);
    if (cp) doc.kv("ലാഭം (വിൽപ്പന − പർച്ചേസ്)", money(d.sales - d.purchase), { bold: true, color: d.sales - d.purchase >= 0 ? "#047857" : "#be123c" });
    doc.heading("ഉൽപ്പന്നം തിരിച്ചുള്ള വിൽപ്പന");
    doc.table([{ label: "ഉൽപ്പന്നം", w: 0.56 }, { label: "അളവ്", w: 0.18, align: "right" }, { label: "തുക", w: 0.26, align: "right", bold: true, color: "#047857" }],
      d.sold.length ? d.sold.map((r, i) => ({ hot: i === 0, cells: [r.name, kgFmt(r.qty), money(r.amount)] })) : [{ cells: ["വിൽപ്പന ഇല്ല", "", ""] }]);
    doc.heading("കിട്ടാനുള്ള കടകൾ");
    doc.table([{ label: "കട", w: 0.6 }, { label: "ബാക്കി", w: 0.4, align: "right", bold: true, color: "#be123c" }], d.shopsDue.length ? d.shopsDue.map((x) => ({ cells: [x.s.name, money(x.b)] })) : [{ cells: ["ബാക്കി ഇല്ല", ""] }]);
    doc.heading("കൊടുക്കാനുള്ള സപ്ലയർമാർ");
    doc.table([{ label: "സപ്ലയർ", w: 0.6 }, { label: "ബാക്കി", w: 0.4, align: "right", bold: true, color: "#be123c" }], d.suppliersDue.length ? d.suppliersDue.map((x) => ({ cells: [x.s.name, money(x.b)] })) : [{ cells: ["ബാക്കി ഇല്ല", ""] }]);
    return pdfFromCanvases(doc.finish());
  }
  async function buildBillPdf(inv) {
    await ensureFonts();
    const doc = new PdfDoc("ബിൽ " + inv.billNo, inv.shopName + "  •  " + fmtDate(inv.date) + (inv.shopPhone ? "  •  Ph: " + inv.shopPhone : ""));
    doc.table([{ label: "ഉൽപ്പന്നം", w: 0.42 }, { label: "അളവ്", w: 0.14, align: "center" }, { label: "നിരക്ക്", w: 0.18, align: "right" }, { label: "തുക", w: 0.26, align: "right", bold: true, color: "#047857" }],
      (inv.items || []).map((i) => ({ cells: [i.name, kgFmt(i.qty) + " " + i.unit, num(i.rate).toFixed(2), num(i.amount).toFixed(2)] })));
    doc.kv("ആകെ ബിൽ", money(inv.total), { bold: true, size: 34, line: true, gap: 66 });
    doc.kv("ലഭിച്ചത്", money(inv.paid), { color: "#047857" });
    doc.kv("ഈ ബില്ലിലെ കടം", money(r2(inv.total - inv.paid)), { color: inv.total - inv.paid > 0 ? "#be123c" : "#0f172a" });
    doc.kv("കടയുടെ ആകെ ബാക്കി", money(shopSummary(inv.shopId).balance), { bold: true, color: "#be123c", line: true });
    return pdfFromCanvases(doc.finish());
  }
  async function buildStockPdf() {
    await ensureFonts();
    const items = live("items").sort(byName), loans = activeLoans();
    const doc = new PdfDoc("ഉപകരണ സ്റ്റോക്ക് റിപ്പോർട്ട്", fmtDate(todayIso()));
    const total = sumArr(items, (i) => i.qty), out = sumArr(loans, (l) => l.qty), dmg = sumArr(items, (i) => i.damaged);
    doc.kpis([{ label: "ആകെ ഉപകരണങ്ങൾ", value: String(total) }, { label: "ഉപയോഗത്തിൽ", value: String(out), bg: "#f0fdfa", color: "#0f766e" }, { label: "ലഭ്യം", value: String(Math.max(0, total - out - dmg)), bg: "#fffbeb", color: "#b45309" }]);
    doc.heading("സ്റ്റോക്ക്");
    doc.table([{ label: "ഉപകരണം", w: 0.38 }, { label: "ആകെ", w: 0.14, align: "right" }, { label: "ഉപയോഗത്തിൽ", w: 0.2, align: "right" }, { label: "കേടായത്", w: 0.14, align: "right" }, { label: "ലഭ്യം", w: 0.14, align: "right", bold: true, color: "#0f766e" }],
      items.length ? items.map((i) => ({ cells: [i.name, String(num(i.qty)), String(outQty(i.id)), String(num(i.damaged)), String(availQty(i))] })) : [{ cells: ["ഉപകരണങ്ങൾ ഇല്ല", "", "", "", ""] }]);
    doc.heading("ഇപ്പോൾ ഉപയോഗത്തിലുള്ളവ");
    doc.table([{ label: "പേര്", w: 0.27 }, { label: "ഫോൺ", w: 0.22 }, { label: "ഉപകരണം", w: 0.3 }, { label: "എടുത്തത്", w: 0.21, align: "right" }],
      loans.length ? loans.sort((a, b) => (a.dateOut || "").localeCompare(b.dateOut || "")).map((l) => ({ hot: isOverdue(l), cells: [l.borrower, l.phone || "-", l.itemName + (l.qty > 1 ? " ×" + l.qty : ""), fmtDate(l.dateOut)] })) : [{ cells: ["ആരും ഇല്ല", "", "", ""] }]);
    return pdfFromCanvases(doc.finish());
  }
  const shortDate = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(2, 4) : "-");
  const monthLoans = (m) => live("loans").filter((l) => (l.dateOut || "").startsWith(m)).sort((a, b) => (a.dateOut || "").localeCompare(b.dateOut || "") || (a.createdAt || 0) - (b.createdAt || 0));
  async function buildMonthPdf(m) {
    await ensureFonts();
    const arr = monthLoans(m), still = arr.filter((l) => l.status === "out");
    const returned = live("loans").filter((l) => l.status === "returned" && (l.dateIn || "").startsWith(m));
    const doc = new PdfDoc(INFO().name + " — പ്രതിമാസ റിപ്പോർട്ട്", fmtMonth(m));
    doc.kpis([{ label: "ഈ മാസം നൽകിയത്", value: String(arr.length) + " പേർ" }, { label: "ഉപകരണങ്ങൾ", value: String(sumArr(arr, (l) => l.qty)) + " എണ്ണം", bg: "#f0fdfa", color: "#0f766e" }, { label: "തിരിച്ചെടുത്തത്", value: String(returned.length), bg: "#fffbeb", color: "#b45309" }]);
    doc.heading("ഈ മാസം കൊണ്ടുപോയവർ");
    doc.table([{ label: "#", w: 0.05 }, { label: "തീയതി", w: 0.12 }, { label: "പേര്", w: 0.19 }, { label: "ഫോൺ", w: 0.17 }, { label: "സ്ഥലം", w: 0.13 }, { label: "ഉപകരണം", w: 0.2 }, { label: "തിരിച്ച്", w: 0.14, align: "right" }],
      arr.length ? arr.map((l, i) => ({ hot: l.status === "out" && isOverdue(l), cells: [String(i + 1), shortDate(l.dateOut), l.borrower, l.phone || "-", l.place || "-", l.itemName + (l.qty > 1 ? " ×" + l.qty : ""), l.status === "out" ? "പുറത്ത്" : shortDate(l.dateIn)] })) : [{ cells: ["", "", "ഈ മാസം ആരും എടുത്തിട്ടില്ല", "", "", "", ""] }]);
    const by = {}; arr.forEach((l) => { const o = by[l.itemName] || (by[l.itemName] = { n: l.itemName, times: 0, qty: 0 }); o.times++; o.qty += num(l.qty); });
    const sum = Object.values(by).sort((a, b) => b.qty - a.qty);
    doc.heading("ഉപകരണം തിരിച്ച്");
    doc.table([{ label: "ഉപകരണം", w: 0.56 }, { label: "ആളുകൾ", w: 0.2, align: "right" }, { label: "എണ്ണം", w: 0.24, align: "right", bold: true, color: "#0f766e" }], sum.length ? sum.map((x) => ({ cells: [x.n, String(x.times), String(x.qty)] })) : [{ cells: ["-", "", ""] }]);
    if (still.length) { doc.heading("ഇപ്പോഴും തിരിച്ചെത്താത്തവ"); doc.table([{ label: "പേര്", w: 0.3 }, { label: "ഫോൺ", w: 0.25 }, { label: "ഉപകരണം", w: 0.3 }, { label: "എടുത്തത്", w: 0.15, align: "right" }], still.map((l) => ({ cells: [l.borrower, l.phone || "-", l.itemName + (l.qty > 1 ? " ×" + l.qty : ""), shortDate(l.dateOut)] }))); }
    return pdfFromCanvases(doc.finish());
  }
  const sumArr = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);

  /* =====================================================================
     10. FORMS (modals) & ACTIONS
     ===================================================================== */
  function itemModal(rec) {
    openModal({
      title: rec ? "ഉപകരണം എഡിറ്റ്" : "പുതിയ ഉപകരണം",
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '" placeholder="ഉദാ: വീൽചെയർ (ഫോൾഡിങ്)"></label><label class="f">വിഭാഗം (പുതിയത് ടൈപ്പ് ചെയ്യാം)<input id="mf_cat" class="in" list="catList" value="' + h(rec ? rec.category : CATEGORIES[0]) + '"><datalist id="catList">' + Array.from(new Set(CATEGORIES.concat(live("items").map((i) => i.category).filter(Boolean)))).map((c) => '<option value="' + h(c) + '">').join("") + "</datalist></label>" +
        '<div class="g2"><label class="f">ആകെ എണ്ണം<input id="mf_qty" class="in" type="number" min="1" step="1" inputmode="numeric" value="' + (rec ? num(rec.qty) : 1) + '"></label><label class="f">കേടായത് (ഉപയോഗിക്കാൻ കഴിയാത്തത്)<input id="mf_dmg" class="in" type="number" min="0" step="1" inputmode="numeric" value="' + (rec ? num(rec.damaged) : 0) + '"></label></div>' +
        '<label class="f">ലഭിച്ച വിധം<select id="mf_src" class="sel">' + Object.keys(SOURCES).map((k) => opt(k, SOURCES[k], (rec ? rec.source : "donation") === k)).join("") + '</select></label><div class="g2"><label class="f">ദാതാവ് (ഓപ്ഷണൽ)<input id="mf_donor" class="in" value="' + h(rec ? rec.donor : "") + '"></label><label class="f">വില ₹ (വാങ്ങിയതെങ്കിൽ)<input id="mf_price" class="in" type="number" step="any" inputmode="decimal" value="' + (rec && num(rec.price) ? num(rec.price) : "") + '"></label></div>' +
        '<label class="f">കുറിപ്പ് (പൊതുജനങ്ങൾക്ക് കാണാം)<input id="mf_note" class="in" value="' + h(rec ? rec.note : "") + '" placeholder="ഉദാ: മുതിർന്നവർക്ക്, ഫോൾഡിങ്"></label>',
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        const qty = Math.floor(num(mv("qty"))), dmg = Math.floor(num(mv("dmg")));
        if (qty < 1) return modalErr("എണ്ണം 1-ൽ കുറയരുത്.");
        if (dmg < 0 || dmg > qty) return modalErr("കേടായ എണ്ണം ആകെ എണ്ണത്തിൽ കൂടരുത്.");
        if (rec && qty - dmg < outQty(rec.id)) return modalErr("ഇപ്പോൾ " + outQty(rec.id) + " എണ്ണം ഉപയോഗത്തിലാണ്. അതിൽ കുറയ്ക്കാൻ കഴിയില്ല.");
        const r = Object.assign(rec ? {} : { id: uid("it"), deleted: false, createdAt: Date.now(), addedDate: todayIso() }, rec || {}, { name, category: clean(mv("cat")) || "മറ്റുള്ളവ", qty, damaged: dmg, source: mv("src"), donor: clean(mv("donor")), price: r2(num(mv("price"))), note: clean(mv("note")) });
        r.avail = Math.max(0, qty - dmg - (rec ? outQty(rec.id) : 0));
        save("items", r); toast("✅ സേവ് ചെയ്തു"); render();
      }
    });
  }
  function lendModal(o) {
    o = o || {};
    const loan = o.loan || null, req = o.req || null;
    const cand = live("items").filter((i) => availQty(i) > 0 || (loan && i.id === loan.itemId)).sort(byName);
    if (!cand.length) return toast("ഇപ്പോൾ നൽകാൻ ലഭ്യമായ ഉപകരണങ്ങൾ ഇല്ല", "warn");
    const selId = loan ? loan.itemId : (o.itemId || (req && req.itemId) || "");
    openModal({
      title: loan ? "എഡിറ്റ്: " + loan.itemName : "ഉപകരണം നൽകുക",
      body: '<label class="f">ഉപകരണം<select id="mf_item" class="sel"' + (loan ? " disabled" : "") + ">" + (selId ? "" : '<option value="">— തിരഞ്ഞെടുക്കുക —</option>') + cand.map((i) => opt(i.id, i.name + " (ലഭ്യം " + availQty(i) + ")", i.id === selId)).join("") + "</select></label>" +
        '<div class="g2"><label class="f">എണ്ണം<input id="mf_qty" class="in" type="number" min="1" step="1" inputmode="numeric" value="' + (loan ? num(loan.qty) : (req ? num(req.qty) || 1 : 1)) + '"></label><label class="f">എടുത്ത തീയതി<input id="mf_out" class="in" type="date" value="' + h(loan ? loan.dateOut : todayIso()) + '"></label></div>' +
        '<label class="f">വാങ്ങുന്ന ആളുടെ പേര്<input id="mf_name" class="in" value="' + h(loan ? loan.borrower : (req ? req.name : "")) + '"></label><div class="g2"><label class="f">മൊബൈൽ നമ്പർ<input id="mf_phone" class="in" inputmode="tel" value="' + h(loan ? loan.phone : (req ? req.phone : "")) + '"></label><label class="f">സ്ഥലം / വിലാസം<input id="mf_place" class="in" value="' + h(loan ? loan.place : (req ? req.place : "")) + '"></label></div>' +
        '<label class="f">തിരിച്ചേൽപ്പിക്കേണ്ട തീയതി (ഓപ്ഷണൽ)<input id="mf_due" class="in" type="date" value="' + h(loan ? loan.due : "") + '"></label><label class="f">ആർക്ക് / ആവശ്യം / കുറിപ്പ്<input id="mf_note" class="in" value="' + h(loan ? loan.note : (req ? req.need : "")) + '" placeholder="ഉദാ: ഉപ്പയ്ക്ക് വേണ്ടി"></label>',
      ok: loan ? "സേവ്" : "നൽകുക",
      onOk() {
        const itemId = loan ? loan.itemId : mv("item"), it = byId("items", itemId);
        if (!it) return modalErr("ഉപകരണം തിരഞ്ഞെടുക്കുക.");
        const qty = Math.floor(num(mv("qty"))), name = clean(mv("name")), phone = clean(mv("phone")), date = mv("out");
        if (!name) return modalErr("പേര് നൽകുക."); if (!phone) return modalErr("മൊബൈൽ നമ്പർ നൽകുക.");
        if (phone.replace(/\D/g, "").length < 10) return modalErr("മൊബൈൽ നമ്പർ 10 അക്കം വേണം.");
        if (qty < 1) return modalErr("എണ്ണം നൽകുക."); if (!date) return modalErr("തീയതി നൽകുക.");
        const room = availQty(it) + (loan && loan.status === "out" ? num(loan.qty) : 0);
        if (qty > room) return modalErr("ലഭ്യം " + room + " എണ്ണം മാത്രം.");
        const due = mv("due"); if (due && due < date) return modalErr("തിരിച്ചേൽപ്പിക്കേണ്ട തീയതി എടുത്ത തീയതിക്ക് മുമ്പാകരുത്.");
        const r = Object.assign(loan ? {} : { id: uid("ln"), deleted: false, createdAt: Date.now(), status: "out", token: rndToken(), askedAt: 0, by: session.name }, loan || {}, { itemId: it.id, itemName: it.name, qty, borrower: name, phone, place: clean(mv("place")), dateOut: date, due: due || "", note: clean(mv("note")) });
        if (!loan && req) r.reqId = req.id;
        save("loans", r); updateAvail(it.id);
        let reqSaved = null;
        if (!loan && req) { req.status = "approved"; req.reply = "ലഭ്യമാണ്. ഓഫീസിൽ വന്ന് കൈപ്പറ്റാം."; req.handledBy = session.name; req.itemId = it.id; req.itemName = it.name; save("requests", req); reqSaved = req; }
        toast("✅ " + (loan ? "അപ്ഡേറ്റ് ചെയ്തു" : "നൽകിയതായി രേഖപ്പെടുത്തി")); render();
        if (reqSaved) setTimeout(() => openModal({ title: "അപേക്ഷകന് അറിയിക്കണോ?", text: reqSaved.name + " — WhatsApp വഴി ഒരു സന്ദേശം അയക്കാം.", ok: "WhatsApp അയക്കുക", focus: false, onOk() { openWa(reqSaved.phone, allowText(reqSaved, r)); } }), 60);
      }
    });
  }
  function returnModal(l) {
    openModal({
      title: "തിരിച്ചെടുക്കുക: " + l.itemName,
      text: l.borrower + (l.qty > 1 ? " — " + l.qty + " എണ്ണം" : ""),
      body: '<label class="f">തിരിച്ചെടുത്ത തീയതി<input id="mf_in" class="in" type="date" value="' + todayIso() + '"></label>' + (l.qty > 1 ? '<label class="f">ഇതിൽ കേടായത് (എണ്ണം)<input id="mf_dmg" class="in" type="number" min="0" max="' + l.qty + '" step="1" value="0"></label>' : '<label class="switch" id="mf_dmgsw" data-act="sw-toggle"><span><b style="font-size:.86rem">കേടുപാട് ഉണ്ട് / ഉപയോഗിക്കാൻ കഴിയില്ല</b></span><div class="tr"><i></i></div></label>') + '<label class="f">കുറിപ്പ്<input id="mf_note" class="in" placeholder="ഉദാ: ടയർ കേടുണ്ട്"></label>',
      ok: "തിരിച്ചെടുത്തു",
      onOk() {
        const d = mv("in"); if (!d) return modalErr("തീയതി നൽകുക."); if (d < l.dateOut) return modalErr("തീയതി എടുത്ത തീയതിക്ക് മുമ്പാകരുത്.");
        const dmg = l.qty > 1 ? Math.min(l.qty, Math.max(0, Math.floor(num(mv("dmg"))))) : ($("#mf_dmgsw") && $("#mf_dmgsw").classList.contains("on") ? 1 : 0);
        l.status = "returned"; l.dateIn = d; l.returnNote = clean(mv("note")); l.damagedQty = dmg; save("loans", l);
        const it = byId("items", l.itemId);
        if (it) { if (dmg) { it.damaged = num(it.damaged) + dmg; save("items", it); } updateAvail(it.id); }
        toast("✅ തിരിച്ചെടുത്തതായി രേഖപ്പെടുത്തി"); render();
        const w = it ? waitingFor(it.id).length : 0;
        if (w && !dmg) setTimeout(() => openModal({ title: w + " പേർ ഈ ഉപകരണത്തിനായി കാത്തിരിക്കുന്നു", text: "അപേക്ഷകൾ പരിശോധിച്ച് അനുവദിക്കാം.", ok: "അപേക്ഷകൾ കാണുക", focus: false, onOk() { ui.tab = "s_reqs"; ui.reqF = "new"; render(); } }), 60);
      }
    });
  }
  function reqModal(item, staffAdd) {
    const it = item ? byId("items", item) : null;
    openModal({
      title: staffAdd ? "അപേക്ഷ ചേർക്കുക" : "ഉപകരണത്തിന് അപേക്ഷിക്കുക",
      body: (it ? '<div class="banner green">' + h(it.name) + (shownAvail(it) > 0 ? " — ലഭ്യം" : " — ഇപ്പോൾ ലഭ്യമല്ല (ലഭ്യമാകുമ്പോൾ അറിയിക്കും)") + "</div>" :
        (staffAdd ? '<label class="f">ഉപകരണം<select id="mf_item" class="sel"><option value="">— ലിസ്റ്റിൽ ഇല്ല —</option>' + live("items").sort(byName).map((i) => opt(i.id, i.name, false)).join("") + '</select></label>' : "") + '<label class="f">' + (staffAdd ? "ലിസ്റ്റിൽ ഇല്ലെങ്കിൽ ഉപകരണത്തിന്റെ പേര്" : "ഏത് ഉപകരണം വേണം?") + '<input id="mf_text" class="in" placeholder="ഉദാ: വാട്ടർ ബെഡ്"></label>') +
        '<label class="f">അപേക്ഷകന്റെ പേര്<input id="mf_name" class="in" autocomplete="name" value="' + h(!staffAdd && state.me ? state.me.name : "") + '"></label><div class="g2"><label class="f">മൊബൈൽ നമ്പർ<input id="mf_phone" class="in" inputmode="tel" autocomplete="tel" value="' + h(!staffAdd && state.me ? state.me.phone : "") + '"></label><label class="f">സ്ഥലം<input id="mf_place" class="in" value="' + h(!staffAdd && state.me ? state.me.place : "") + '"></label></div>' +
        '<div class="g2"><label class="f">എണ്ണം<input id="mf_qty" class="in" type="number" min="1" step="1" inputmode="numeric" value="1"></label><label class="f">എപ്പോൾ വേണം<input id="mf_when" class="in" type="date" value="' + todayIso() + '"></label></div><label class="f">ആർക്ക് / എന്തിന് (ഹ്രസ്വമായി)<input id="mf_need" class="in" maxlength="200" placeholder="ഉദാ: ഉമ്മയ്ക്ക് ശസ്ത്രക്രിയ കഴിഞ്ഞു, നടക്കാൻ പ്രയാസം"></label>',
      ok: staffAdd ? "ചേർക്കുക" : "അപേക്ഷ അയക്കുക",
      onOk() {
        const name = clean(mv("name")), phone = clean(mv("phone")), qty = Math.max(1, Math.floor(num(mv("qty"))));
        const itemId = it ? it.id : (staffAdd ? mv("item") : ""), found = itemId ? byId("items", itemId) : null;
        const text = found ? found.name : clean(mv("text"));
        if (!text) return modalErr("ഉപകരണത്തിന്റെ പേര് നൽകുക."); if (!name) return modalErr("പേര് നൽകുക.");
        if (phone.replace(/\D/g, "").length < 10) return modalErr("ശരിയായ മൊബൈൽ നമ്പർ നൽകുക (10 അക്കം).");
        const r = save("requests", { id: uid("rq"), deleted: false, createdAt: Date.now(), itemId: found ? found.id : "", itemName: text, qty, name, phone, place: clean(mv("place")), need: clean(mv("need")), neededOn: mv("when"), status: "new", reply: "", handledBy: "" });
        if (!staffAdd) { state.myReq.push(r.id); persist(); ui.tab = "p_my"; }
        toast(staffAdd ? "✅ ചേർത്തു" : "✅ അപേക്ഷ അയച്ചു. ഓഫീസിൽ നിന്ന് ബന്ധപ്പെടും."); render();
      }
    });
  }
  function noModal(req) {
    const it = req.itemId ? byId("items", req.itemId) : null;
    const def = { declined: "ക്ഷമിക്കണം, ഈ ഉപകരണം ഇപ്പോൾ ലഭ്യമല്ല.", waiting: "ഇപ്പോൾ ലഭ്യമല്ല. ലഭ്യമാകുമ്പോൾ ഞങ്ങൾ അറിയിക്കാം." };
    openModal({
      title: "മറുപടി: " + req.name, text: (it ? it.name : req.itemName) + " — അപേക്ഷകന് ആപ്പിലും WhatsApp-ലും മറുപടി എത്തിക്കാം.",
      body: '<label class="f">അവസ്ഥ<select id="mf_st" class="sel" data-ch="no-st"><option value="waiting">ലഭ്യമാകുമ്പോൾ അറിയിക്കും (കാത്തിരിപ്പ് പട്ടികയിൽ)</option><option value="declined">ഇപ്പോൾ ലഭ്യമല്ല (അവസാനിപ്പിക്കുക)</option></select></label><label class="f">മറുപടി സന്ദേശം<textarea id="mf_reply" class="ta" rows="3" maxlength="300">' + h(def.waiting) + "</textarea></label>", ok: "സേവ്",
      onOk() {
        const st = mv("st"), reply = clean(mv("reply")); req.status = st; req.reply = reply; req.handledBy = session.name; save("requests", req);
        toast("✅ മറുപടി സേവ് ചെയ്തു"); render();
        setTimeout(() => openModal({ title: "അപേക്ഷകന് WhatsApp അയക്കണോ?", text: req.name, ok: "WhatsApp അയക്കുക", focus: false, onOk() { openWa(req.phone, declineText(req)); } }), 60);
      }
    });
    modal.defs = def;
  }
  function askModal(req) {
    const it = byId("items", req.itemId); if (!it) return;
    const ls = activeLoans(it.id);
    openModal({
      title: "ഉപയോഗിക്കുന്നവരോട് ചോദിക്കുക", text: it.name + " — താഴെയുള്ളവർക്ക് WhatsApp-ൽ ഓർമ്മപ്പെടുത്തൽ അയക്കാം. അവർക്ക് ലിങ്ക് വഴി മറുപടി നൽകാം.", focus: false,
      body: '<div class="stack">' + (ls.length ? ls.map((l) => '<div class="li wrapli" style="border:1px solid var(--line);border-radius:13px"><div class="grow"><div class="t">' + h(l.borrower) + '</div><div class="s">' + h(l.phone || "") + " • " + h(fmtDate(l.dateOut)) + (l.askedAt ? " • ചോദിച്ചത്: " + h(fmtDate(isoOf(new Date(l.askedAt)))) : "") + '</div></div><button type="button" class="btn sm" data-act="ask-wa" data-id="' + h(l.id) + '">' + ICON.msg + "അയക്കുക</button></div>").join("") : emptyBox("ആരും ഉപയോഗിക്കുന്നില്ല")) + "</div>",
      footer: '<div class="acts"><button type="button" class="btn ghost" data-act="modal-cancel">അടയ്ക്കുക</button></div>'
    });
  }
  function histModal(it) {
    const ls = live("loans").filter((l) => l.itemId === it.id).sort(newest);
    openModal({ title: it.name + " — ചരിത്രം", wide: true, focus: false,
      body: '<div class="stack">' + (ls.length ? ls.map((l) => '<div class="li wrapli" style="border:1px solid var(--line);border-radius:13px"><div class="grow"><div class="t">' + h(l.borrower) + (l.qty > 1 ? " × " + l.qty : "") + '</div><div class="s">' + h(l.phone || "") + " • " + h(fmtDate(l.dateOut)) + (l.dateIn ? " → " + h(fmtDate(l.dateIn)) : "") + '</div></div><span class="chip ' + (l.status === "out" ? "blue" : "") + '">' + (l.status === "out" ? "ഉപയോഗത്തിൽ" : "തിരിച്ചെടുത്തു") + "</span></div>").join("") : emptyBox("ഇതുവരെ നൽകിയിട്ടില്ല")) + "</div>",
      footer: '<div class="acts"><button type="button" class="btn ghost" data-act="modal-cancel">അടയ്ക്കുക</button></div>' });
  }
  function recReplyModal(l) {
    const r = replyOf(l);
    openModal({
      title: "മറുപടി രേഖപ്പെടുത്തുക: " + l.borrower, text: "ഫോൺ / WhatsApp വഴി ലഭിച്ച മറുപടി ഇവിടെ രേഖപ്പെടുത്താം.",
      body: '<label class="f">മറുപടി<select id="mf_ans" class="sel">' + Object.keys(ANSWERS).map((k) => opt(k, ANSWERS[k], r && r.answer === k)).join("") + '</select></label><label class="f">എപ്പോൾ (ഓപ്ഷണൽ)<input id="mf_when" class="in" type="date" value="' + h(r ? r.when : "") + '"></label><label class="f">സന്ദേശം<input id="mf_msg" class="in" value="' + h(r ? r.msg : "") + '"></label>',
      onOk() { save("replies", { id: l.id, loanId: l.id, token: l.token, answer: mv("ans"), when: mv("when") || "", msg: clean(mv("msg")), at: Date.now(), ack: true, deleted: false, manual: true }); toast("✅ രേഖപ്പെടുത്തി"); render(); }
    });
  }
  function staffModal(rec) {
    const cur = (k, d) => (rec && rec.perms && k in rec.perms ? !!rec.perms[k] : !!d);
    openModal({
      title: rec ? "സ്റ്റാഫ് എഡിറ്റ്" : "പുതിയ സ്റ്റാഫ്",
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '"></label><label class="f">കോഡ് (4–12 അക്ഷരം/അക്കം)' + (rec ? " — മാറ്റാൻ മാത്രം നൽകുക" : "") + '<input id="mf_pin" class="in" autocomplete="off" maxlength="12"></label>' +
        '<div class="permbox"><b>ചെയ്യാൻ അനുവദിക്കുന്നവ</b>' + PERMS.map((p) => '<label class="chk"><input type="checkbox" id="pm_' + p[0] + '"' + (cur(p[0], p[2]) ? " checked" : "") + "><span>" + h(p[1]) + "</span></label>").join("") + "</div>",
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        const p = codeKey(mv("pin")); if (!rec && !validCode(p)) return modalErr("4–12 അക്ഷരം/അക്കമുള്ള കോഡ് നൽകുക."); if (p && !validCode(p)) return modalErr("കോഡ് 4–12 അക്ഷരം/അക്കം (ഇംഗ്ലീഷ് അക്ഷരം, സംഖ്യ) മാത്രം ആകണം.");
        const hs = p ? pinHash(p) : rec.pinHash;
        if (hs === ST().adminHash || (p && p === codeKey(ST().entryCode)) || live("staff").some((x) => x.id !== (rec && rec.id) && x.pinHash === hs)) return modalErr("ഈ കോഡ് ഉപയോഗത്തിലുണ്ട്. മറ്റൊന്ന് നൽകുക.");
        const perms = {}; PERMS.forEach((x) => { perms[x[0]] = !!($("#pm_" + x[0]) && $("#pm_" + x[0]).checked); });
        save("staff", Object.assign(rec ? {} : { id: uid("st"), deleted: false }, rec || {}, { name, pinHash: hs, perms })); toast("✅ സേവ് ചെയ്തു"); render();
      }
    });
  }
  function svcModal(rec) {
    openModal({
      title: rec ? "പ്രവർത്തനം എഡിറ്റ്" : "പുതിയ പ്രവർത്തനം", text: "ഇത് ജോയിൻ ചെയ്ത എല്ലാവർക്കും കാണും.",
      body: '<label class="f">പ്രവർത്തനം<input id="mf_title" class="in" maxlength="80" value="' + h(rec ? rec.title : "") + '" placeholder="ഉദാ: വീൽചെയർ വായ്പ"></label><label class="f">വിവരണം<textarea id="mf_text" class="ta" rows="3" maxlength="400">' + h(rec ? rec.text : "") + "</textarea></label>",
      onOk() {
        const title = clean(mv("title")); if (!title) return modalErr("പ്രവർത്തനത്തിന്റെ പേര് നൽകുക.");
        save("services", Object.assign(rec ? {} : { id: uid("sv"), deleted: false, at: Date.now() }, rec || {}, { title, text: String(mv("text") || "").trim() })); toast("✅ സേവ് ചെയ്തു"); render();
      }
    });
  }
  function annModal(rec) {
    openModal({
      title: rec ? "അറിയിപ്പ് എഡിറ്റ്" : "പുതിയ അറിയിപ്പ്", text: "ഇത് പൊതു പേജിൽ എല്ലാവർക്കും കാണും.",
      body: '<label class="f">തലക്കെട്ട്<input id="mf_title" class="in" maxlength="80" value="' + h(rec ? rec.title : "") + '" placeholder="ഉദാ: പുതിയ ഉപകരണങ്ങൾ എത്തി"></label><label class="f">വിവരണം<textarea id="mf_text" class="ta" rows="4" maxlength="600">' + h(rec ? rec.text : "") + '</textarea></label><label class="switch ' + (rec && rec.pinned ? "on" : "") + '" id="mf_pin" data-act="sw-toggle"><span><b style="font-size:.86rem">📌 മുകളിൽ പിൻ ചെയ്യുക</b></span><div class="tr"><i></i></div></label>',
      onOk() {
        const title = clean(mv("title")), text = String(mv("text") || "").replace(/\r/g, "").trim();
        if (!text) return modalErr("വിവരണം നൽകുക.");
        save("announcements", Object.assign(rec ? {} : { id: uid("an"), deleted: false, at: Date.now() }, rec || {}, { title: title || "അറിയിപ്പ്", text, pinned: $("#mf_pin").classList.contains("on") }));
        toast("✅ അറിയിപ്പ് പ്രസിദ്ധീകരിച്ചു"); render();
      }
    });
  }
  function dbModal() {
    openModal({
      title: "Firebase ഡാറ്റാബേസ് വിലാസം",
      text: "Firebase Console → Realtime Database പേജിന്റെ മുകളിൽ കാണുന്ന https://…firebasedatabase.app വിലാസം. ശ്രദ്ധിക്കുക: ഇത് ഈ ഫോണിൽ മാത്രം സേവ് ആകും; എല്ലാവർക്കും ബാധകമാക്കാൻ കോഡിൽ സ്ഥിരമായി ചേർക്കണം.",
      body: '<label class="f">വിലാസം<input id="mf_url" class="in" inputmode="url" autocapitalize="off" value="' + h(dbBase()) + '"></label>', ok: "സേവ്",
      onOk() {
        const u = clean(mv("url")).replace(/\/+$/, "");
        if (!/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(u)) return modalErr("ശരിയായ Realtime Database വിലാസം നൽകുക.");
        try { localStorage.setItem(CFG.DB_KEY, u); } catch (e) { /* ignore */ }
        syncErr = ""; syncState = "idle"; updateStatus(); toast("വിലാസം സേവ് ചെയ്തു"); sync(true).then(() => { updateStatus(); render(); });
      }
    });
  }
  const delConfirm = (title, text, fn) => confirmBox(title, text, "നീക്കം ചെയ്യുക", () => { fn(); toast("നീക്കം ചെയ്തു", "warn"); render(); });
  function sendAsk(l) { l.askedAt = Date.now(); save("loans", l); openWa(l.phone, askText(l)); }

  const actions = {
    enter, join,
    "to-gate"() { ui.gate = true; render(); },
    "gate-back"() { ui.gate = false; render(); },
    logout,
    theme() { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); persist(); render(); },
    install: async function () { if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) { /* ignore */ } installPrompt = null; } else toast("ബ്രൗസർ മെനുവിലെ 'Install app' / 'Add to Home Screen' ഉപയോഗിക്കുക."); },
    tab(el) { ui.tab = el.dataset.t; render(); window.scrollTo(0, 0); },
    cat(el) { ui.cat = el.dataset.c; render(); },
    loanf(el) { ui.loanF = el.dataset.k; render(); },
    reqf(el) { ui.reqF = el.dataset.k; render(); },
    "sw-toggle"(el) { el.classList.toggle("on"); },
    "db-url": dbModal,

    /* public */
    req(el) { reqModal(el.dataset.id || ""); },
    "cancel-req"(el) { const r = state.data.requests[el.dataset.id]; if (!r) return; confirmBox("അപേക്ഷ റദ്ദാക്കണോ?", r.itemName, "റദ്ദാക്കുക", () => { r.status = "cancelled"; save("requests", r); toast("റദ്ദാക്കി", "warn"); render(); }); },

    /* items */
    "add-item"() { if (need("item_edit")) itemModal(); },
    "edit-item"(el) { const r = byId("items", el.dataset.id); if (r && need("item_edit")) itemModal(r); },
    "del-item"(el) { const r = byId("items", el.dataset.id); if (!r || !need("item_del")) return; if (outQty(r.id)) return toast("ഇത് ഇപ്പോൾ ഉപയോഗത്തിലാണ്; ആദ്യം തിരിച്ചെടുക്കുക", "error"); delConfirm("ഉപകരണം നീക്കം ചെയ്യണോ?", r.name, () => softDelete("items", r.id)); },
    hist(el) { const r = byId("items", el.dataset.id); if (r) histModal(r); },

    /* loans */
    lend(el) { if (need("lend")) lendModal({ itemId: el.dataset.id || "" }); },
    "edit-loan"(el) { const l = byId("loans", el.dataset.id); if (l && need("loan_edit")) lendModal({ loan: l }); },
    return(el) { const l = byId("loans", el.dataset.id); if (l && l.status === "out" && need("lend")) returnModal(l); },
    "del-loan"(el) { const l = byId("loans", el.dataset.id); if (!l || !need("loan_edit")) return; delConfirm("എൻട്രി നീക്കം ചെയ്യണോ?", l.borrower + " — " + l.itemName, () => { softDelete("loans", l.id); updateAvail(l.itemId); }); },
    remind(el) { const l = byId("loans", el.dataset.id); if (l && need("remind")) sendAsk(l); },
    "ask-wa"(el) { const l = byId("loans", el.dataset.id); if (l && need("remind")) sendAsk(l); },
    "rec-reply"(el) { const l = byId("loans", el.dataset.id); if (l && need("remind")) recReplyModal(l); },
    "ack-reply"(el) { const l = byId("loans", el.dataset.id), r = l && replyOf(l); if (r) { r.ack = true; save("replies", r); render(); } },

    /* requests */
    "add-req"() { if (need("reqs")) reqModal("", true); },
    "req-allow"(el) {
      const r = byId("requests", el.dataset.id); if (!r || !need("reqs")) return;
      const it = r.itemId ? byId("items", r.itemId) : null;
      if (!it) return toast("ഈ അപേക്ഷ ലിസ്റ്റിലില്ലാത്ത ഉപകരണത്തിനാണ്. 'നൽകുക' വഴി ഉപകരണം തിരഞ്ഞെടുത്ത് നൽകുക.", "warn");
      if (availQty(it) < 1) return toast("ഇപ്പോൾ ലഭ്യമല്ല. 'ഉപയോഗിക്കുന്നവരോട് ചോദിക്കുക' ഉപയോഗിക്കാം.", "warn");
      lendModal({ req: r, itemId: it.id });
    },
    "req-no"(el) { const r = byId("requests", el.dataset.id); if (r && need("reqs")) noModal(r); },
    "req-ask"(el) { const r = byId("requests", el.dataset.id); if (r && need("reqs")) askModal(r); },
    "del-req"(el) { const r = byId("requests", el.dataset.id); if (r && isAdmin()) delConfirm("അപേക്ഷ നീക്കം ചെയ്യണോ?", r.name, () => softDelete("requests", r.id)); },

    /* admin */
    "add-ann"() { if (need("ann")) annModal(); },
    "edit-ann"(el) { const r = byId("announcements", el.dataset.id); if (r && need("ann")) annModal(r); },
    "del-ann"(el) { const r = byId("announcements", el.dataset.id); if (r && need("ann")) delConfirm("അറിയിപ്പ് നീക്കം ചെയ്യണോ?", r.title, () => softDelete("announcements", r.id)); },
    "add-svc"() { if (need("services")) svcModal(); },
    "edit-svc"(el) { const r = byId("services", el.dataset.id); if (r && need("services")) svcModal(r); },
    "del-svc"(el) { const r = byId("services", el.dataset.id); if (r && need("services")) delConfirm("പ്രവർത്തനം നീക്കം ചെയ്യണോ?", r.title, () => softDelete("services", r.id)); },
    "del-member"(el) { const r = byId("members", el.dataset.id); if (r && isAdmin()) delConfirm("ജോയിൻ ചെയ്തയാളെ നീക്കം ചെയ്യണോ?", r.name, () => softDelete("members", r.id)); },
    "save-entry"() {
      if (!isAdmin()) return; const c = codeKey($("#a_entry").value);
      if (!validCode(c)) return toast("എൻട്രി കോഡ് 4–12 അക്ഷരം/അക്കം ആയിരിക്കണം", "error");
      const hs = pinHash(c); if (hs === ST().adminHash || live("staff").some((x) => x.pinHash === hs)) return toast("ഈ കോഡ് അഡ്മിൻ/സ്റ്റാഫ് കോഡ് ആണ്. മറ്റൊന്ന് നൽകുക", "error");
      const st = ST(); st.entryCode = c; save("settings", st); toast("✅ എൻട്രി കോഡ് മാറ്റി"); render();
    },
    "month-pdf"(el) { if (!need("reports")) return; ui.month = ($("#rp_month") || {}).value || monthNow(); el.disabled = true; buildMonthPdf(ui.month).then((u) => { download(new Blob([u], { type: "application/pdf" }), "Swanthana_" + ui.month + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); }).catch(() => toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error")).then(() => { el.disabled = false; }); },
    "month-wa"() {
      if (!need("reports")) return; ui.month = ($("#rp_month") || {}).value || monthNow();
      const arr = monthLoans(ui.month);
      openWa("", ["*" + INFO().name + ", " + INFO().place + " — " + fmtMonth(ui.month) + "*", "------------------------"].concat(arr.length ? arr.map((l, i) => (i + 1) + ". " + l.borrower + " (" + (l.phone || "-") + ") — " + l.itemName + (l.qty > 1 ? " ×" + l.qty : "") + " • " + shortDate(l.dateOut) + (l.status === "out" ? " • ഉപയോഗത്തിൽ" : " • തിരിച്ചു " + shortDate(l.dateIn))) : ["ഈ മാസം ആരും എടുത്തിട്ടില്ല"]).join("\n"));
    },
    "add-staff"() { if (isAdmin()) staffModal(); },
    "edit-staff"(el) { const r = byId("staff", el.dataset.id); if (r && isAdmin()) staffModal(r); },
    "del-staff"(el) { const r = byId("staff", el.dataset.id); if (r && isAdmin()) delConfirm("സ്റ്റാഫിനെ നീക്കം ചെയ്യണോ?", r.name, () => softDelete("staff", r.id)); },
    "save-info"() {
      if (!isAdmin()) return; const n = clean($("#b_name").value); if (!n) return toast("പേര് നൽകുക", "error");
      const b = INFO(); Object.assign(b, { name: n, tag: clean($("#b_tag").value), place: clean($("#b_place").value), phone: clean($("#b_phone").value), wa: clean($("#b_wa").value), hours: clean($("#b_hours").value), about: String($("#b_about").value || "").trim() });
      save("info", b); toast("✅ സേവ് ചെയ്തു"); render();
    },
    "save-pin"() {
      if (!isAdmin()) return;
      const a = codeKey($("#a_pin").value); if (!validCode(a)) return toast("കോഡ് 4–12 അക്ഷരം/അക്കം (ഇംഗ്ലീഷ്/സംഖ്യ) ആയിരിക്കണം", "error");
      const hs = pinHash(a); if (live("staff").some((x) => x.pinHash === hs) || a === codeKey(ST().entryCode)) return toast("ഈ കോഡ് ഉപയോഗത്തിലുണ്ട്", "error");
      const s2 = ST(); s2.adminHash = hs; save("settings", s2); toast("✅ കോഡ് മാറ്റി"); render();
    },
    async "stock-pdf"(el) { if (!need("reports")) return; el.disabled = true; try { download(new Blob([await buildStockPdf()], { type: "application/pdf" }), "Santhwanam_Stock_" + todayIso() + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); } catch (e) { toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error"); } el.disabled = false; },
    "stock-wa"() {
      if (!need("reports")) return;
      const items = live("items").sort(byName);
      openWa("", ["*" + INFO().name + " — ഉപകരണ സ്റ്റോക്ക്* (" + todayIso() + ")", "------------------------"].concat(items.map((i) => "• " + i.name + ": ലഭ്യം " + availQty(i) + " / " + num(i.qty))).concat(["------------------------", "ഉപയോഗത്തിൽ: " + activeLoans().length + " പേർ"]).join("\n"));
    },
    async "sync-now"(el) { el.disabled = true; const r = await sync(true); el.disabled = false; toast(r === "ok" ? "സിങ്ക് പൂർത്തിയായി" : r === "nodb" ? "ഓൺലൈൻ സിങ്ക് സജ്ജമാക്കിയിട്ടില്ല" : r === "offline" ? "ഓഫ്‌ലൈൻ ആണ്" : "സിങ്ക് പരാജയപ്പെട്ടു: " + syncErr, r === "ok" ? "" : "error"); if (ui.tab === "s_more") render(); },
    async snapshot() { await createSnapshot("Manual Backup (" + todayIso() + ")"); toast("✅ ഫോണിൽ ബാക്കപ്പ് എടുത്തു"); render(); },
    export() { download(new Blob([JSON.stringify({ app: "santhwanam", v: 1, exportedAt: new Date().toISOString(), data: dataSnapshot() }, null, 2)], { type: "application/json" }), "Santhwanam_Backup_" + todayIso() + ".json"); toast("📥 ഡൗൺലോഡ് ചെയ്തു"); },
    "restore-snap"(el) { if (!isAdmin()) return; const b = snapCache.find((x) => x.id === el.dataset.id); if (!b) return; confirmBox("റീസ്റ്റോർ ചെയ്യണോ?", b.label + " — നിലവിലെ ഡാറ്റ മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(b.data); toast("✅ റീസ്റ്റോർ ചെയ്തു"); render(); }); },

    /* borrower reply page */
    "reply-home"() { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ } ui.hash = null; replyCtx = null; render(); },
    async "reply-go"(el) {
      const c = replyCtx; if (!c || !c.loan) return;
      const rec = { id: c.id, loanId: c.id, token: c.token, answer: el.dataset.a, when: ($("#rp_when") && $("#rp_when").value) || "", msg: clean($("#rp_msg") ? $("#rp_msg").value : ""), at: Date.now(), updatedAt: Date.now(), ack: false, deleted: false };
      el.disabled = true;
      try { const r = await fetch(url("replies/" + c.id), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) }); if (!r.ok) throw new Error("HTTP " + r.status); c.done = true; render(); }
      catch (e) { el.disabled = false; toast("അയക്കാൻ കഴിഞ്ഞില്ല — ഇന്റർനെറ്റ് പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക", "error"); }
    },
    "modal-cancel": closeModal,
    "modal-ok"() { if (!modal || !modal.onOk) return; const r = modal.onOk(); if (r !== false) closeModal(); }
  };

  async function openReplyPage(hash) {
    const m = /^#r=([^.]+)\.(.+)$/.exec(hash || ""); if (!m) return false;
    ui.hash = hash; replyCtx = { id: m[1], token: m[2] };
    render();
    if (!hasDb() || !online()) { replyCtx.err = "ഇന്റർനെറ്റ് ഇല്ല / ഓൺലൈൻ സിങ്ക് സജ്ജമല്ല. ഓൺലൈൻ ആയ ശേഷം വീണ്ടും ശ്രമിക്കുക."; render(); return true; }
    try {
      try { mergeRemote({ info: await getJson("info") }); } catch (e) { /* optional */ }
      const loan = await getJson("loans/" + replyCtx.id);
      if (!loan || loan.token !== replyCtx.token) replyCtx.err = "ഈ ലിങ്ക് ശരിയല്ല അല്ലെങ്കിൽ കാലഹരണപ്പെട്ടു.";
      else replyCtx.loan = loan;
    } catch (e) { replyCtx.err = "സെർവറുമായി ബന്ധപ്പെടാൻ കഴിഞ്ഞില്ല (" + ((e && e.message) || e) + ")."; }
    render(); return true;
  }

  /* =====================================================================
     11. EVENTS & BOOT
     ===================================================================== */
  let installPrompt = null, hiddenAt = 0;
  function wire() {
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-act]"); if (!el) return;
      const act = el.dataset.act;
      if (act === "modal-bg") { if (ev.target === el) closeModal(); return; }
      if (actions[act]) { if (el.tagName === "A") return; actions[act](el, ev); }
    });
    document.addEventListener("input", (ev) => {
      const el = ev.target;
      if (el.dataset && (el.dataset.ui === "search" || el.dataset.ui === "loanQ")) {
        ui[el.dataset.ui] = el.value;
        const y = window.scrollY, pos = el.selectionStart; render(); window.scrollTo(0, y);
        const n = $('[data-ui="' + el.dataset.ui + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
      }
    });
    document.addEventListener("change", (ev) => {
      const el = ev.target, ch = el.dataset && el.dataset.ch;
      if (ch === "no-st") { const t = $("#mf_reply"); if (t && modal && modal.defs) t.value = modal.defs[el.value] || ""; }
      else if (ch === "restore-file") {
        const f = el.files && el.files[0]; if (!f || !isAdmin()) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const p = JSON.parse(rd.result), data = p.data || p;
            if (!data.items || !data.loans) throw new Error("bad");
            confirmBox("ഫയലിൽ നിന്ന് റീസ്റ്റോർ ചെയ്യണോ?", f.name + " — നിലവിലെ ഡാറ്റ മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(data); toast("✅ റീസ്റ്റോർ ചെയ്തു"); render(); });
          } catch (e) { toast("അസാധുവായ ബാക്കപ്പ് ഫയൽ!", "error"); }
          el.value = "";
        };
        rd.readAsText(f);
      } else if (el.dataset && el.dataset.ui) { ui[el.dataset.ui] = el.value; render(); }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modal) { closeModal(); return; }
      if (ev.key === "Enter" && !session && !modal && (!state.me || ui.gate) && ev.target.tagName === "INPUT") { ev.preventDefault(); if (ev.target.id === "g_code") enter(); else join(); return; }
      if (ev.key === "Enter" && modal && ev.target.tagName === "INPUT" && modal.onOk) { ev.preventDefault(); actions["modal-ok"](); }
    });
    window.addEventListener("online", () => { updateStatus(); sync(false); });
    window.addEventListener("offline", updateStatus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); persistNow(); }
      else {
        if (session && hiddenAt && Date.now() - hiddenAt > CFG.AUTOLOCK_MS) { logout(); toast("സുരക്ഷയ്ക്കായി ലോക്ക് ചെയ്തു"); }
        if (online()) sync(false);
      }
    });
    window.addEventListener("pagehide", persistNow);
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; const b = $("#btnInstall"); if (b) b.hidden = false; });
    window.addEventListener("appinstalled", () => { installPrompt = null; render(); toast("ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്തു"); });
  }

  async function boot() {
    await loadState();
    applyTheme();
    try { const q = new URLSearchParams(location.search).get("db"); if (q && /^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)\/?$/i.test(q)) { localStorage.setItem(CFG.DB_KEY, q.replace(/\/+$/, "")); history.replaceState(null, "", location.pathname + location.hash); } } catch (e) { /* ignore */ }
    wire();
    if (!(await openReplyPage(location.hash))) render();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (online()) sync(false);
    setInterval(() => { if (online() && document.visibilityState === "visible" && !syncing && !ui.hash) sync(false); }, CFG.POLL_MS);
    if (window.__SNT_TEST) {
      window.__SNT = { state: () => state, session: () => session, ui: () => ui, render, actions, save, mergeRemote, availQty, outQty, shownAvail, updateAvail, askText, allowText, buildStockPdf, pinHash, replyOf, setSession: (r) => { session = r ? { role: r, name: r, id: r } : null; }, live, replyCtx: () => replyCtx, can, enter, join, buildMonthPdf, monthLoans };
    }
  }
  boot();
})();
