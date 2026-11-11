// Codio extension: Copy Logger (debug build)
// Detects copy actions (Ctrl/Cmd+C, right-click > Copy, Edit menu > Copy)
// and writes each batch of records to a NEW file, because codioIDE.files.add
// can only create files, not overwrite them.
// All console output is prefixed with [copy-logger] so you can filter on it.

(async function (codioIDE, window) {
  const TAG = "[copy-logger]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const error = (...a) => console.error(TAG, ...a);

  log("script loaded at", new Date().toISOString());

  // ---------------- Configuration ----------------
  const CONFIG = {
    // Tried in order; the first folder that accepts a file is used from then on.
    logDirs: [
      ".guides/secure/copy-logs",
      ".guides/copy-logs",
      "copy-logs"
    ],
    includeCopiedText: false,
    maxTextLength: 500,
    dedupeWindowMs: 250,
    // Copies within this window share one file. Set to 0 for one file per copy.
    writeDebounceMs: 1000,
    includeGuidesPage: true,
    apiTimeoutMs: 5000,
    maxNameRetries: 3 // new names to try if a file name is somehow taken
  };

  // One ID per page load, so files from the same session sort together
  const SESSION_ID = new Date().toISOString().replace(/[:.]/g, "-") + "_" + randomId(4);

  log("environment:", {
    codioIDEPresent: !!codioIDE,
    filesAdd: typeof (codioIDE && codioIDE.files && codioIDE.files.add),
    coachBotApi: !!(codioIDE && codioIDE.coachBot),
    location: window.location && window.location.href,
    inIframe: window.top !== window,
    sessionId: SESSION_ID
  });

  if (!codioIDE || !codioIDE.files || typeof codioIDE.files.add !== "function") {
    error("codioIDE.files.add is not available; cannot write log files. Stopping.");
    return;
  }

  // ---------------- State ----------------
  let dirIndex = 0;          // which entry of CONFIG.logDirs we're currently using
  let dirConfirmed = false;  // true once a write has succeeded in that folder
  let fileCounter = 0;
  let pending = [];
  let writeTimer = null;
  let writing = Promise.resolve();
  let lastEvent = { time: 0, text: null };
  let copyCount = 0;
  let filesWritten = 0;
  const watchedDocs = new WeakSet();

  // ---------------- Helpers ----------------
  function randomId(len) {
    return Math.random().toString(36).slice(2, 2 + len).padEnd(len, "0");
  }

  function withTimeout(promise, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label + " timed out after " + CONFIG.apiTimeoutMs + "ms")), CONFIG.apiTimeoutMs)
      )
    ]);
  }

  function errMsg(e) {
    return e && e.message ? e.message : String(e);
  }

  function isAlreadyExists(e) {
    return /already exists/i.test(errMsg(e));
  }

  function nextFileName() {
    fileCounter++;
    return "copy_" + SESSION_ID + "_" + String(fileCounter).padStart(4, "0") + "_" + randomId(4) + ".jsonl";
  }

  // Write content to a brand-new file, falling back to the next folder
  // if the current one can't be written to.
  async function writeNewFile(content) {
    while (dirIndex < CONFIG.logDirs.length) {
      const dir = CONFIG.logDirs[dirIndex];
      for (let attempt = 0; attempt <= CONFIG.maxNameRetries; attempt++) {
        const path = dir + "/" + nextFileName();
        try {
          await withTimeout(codioIDE.files.add(path, content), "add(" + path + ")");
          if (!dirConfirmed) log("✓ folder is writable, using", dir);
          dirConfirmed = true;
          return path;
        } catch (e) {
          if (isAlreadyExists(e)) {
            warn("  name already taken, trying another:", path);
            continue; // same folder, new name
          }
          if (dirConfirmed) {
            // This folder worked before, so treat it as a temporary problem
            throw e;
          }
          warn("  ✗ cannot write in", dir, "-", errMsg(e));
          break; // try the next folder
        }
      }
      if (dirConfirmed) throw new Error("could not find a free file name in " + dir);
      dirIndex++;
      if (dirIndex < CONFIG.logDirs.length) log("falling back to", CONFIG.logDirs[dirIndex]);
    }
    throw new Error("no writable folder found in " + JSON.stringify(CONFIG.logDirs));
  }

  function scheduleWrite() {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      flush();
    }, CONFIG.writeDebounceMs);
  }

  function flush() {
    writing = writing.then(async () => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      const content = batch.map((r) => JSON.stringify(r)).join("\n") + "\n";
      log("writing", batch.length, "record(s) to a new file");
      try {
        const path = await writeNewFile(content);
        filesWritten++;
        log("  ✓ wrote", path);
      } catch (e) {
        error("  ✗ write failed:", errMsg(e));
        if (dirIndex < CONFIG.logDirs.length) {
          pending = batch.concat(pending);
          scheduleWrite();
        } else {
          error("  giving up; records kept in memory only. See window.__copyLogger.pendingRecords()");
          pending = batch.concat(pending);
        }
      }
    });
    return writing;
  }

  function getCopiedText(event) {
    const target = event.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
      try {
        const { selectionStart, selectionEnd, value } = target;
        if (typeof selectionStart === "number" && selectionEnd > selectionStart) {
          return value.substring(selectionStart, selectionEnd);
        }
      } catch (e) { /* ignore */ }
    }
    try {
      const doc = (target && target.ownerDocument) || document;
      const sel = doc.getSelection ? doc.getSelection().toString() : "";
      if (sel) return sel;
    } catch (e) { /* ignore */ }
    return "";
  }

  function describeTarget(el) {
    if (!el || !el.tagName) return "unknown";
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim()) {
      desc += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    }
    const region = el.closest && el.closest(
      "[class*='editor'], [class*='ace'], [class*='monaco'], [class*='terminal'], [class*='xterm'], [class*='guide']"
    );
    if (region && region !== el && typeof region.className === "string") {
      desc += " in ." + region.className.trim().split(/\s+/)[0];
    }
    return desc;
  }

  async function getGuidesPage() {
    if (!CONFIG.includeGuidesPage || !codioIDE.coachBot) return undefined;
    try {
      const ctx = await withTimeout(codioIDE.coachBot.getContext(), "coachBot.getContext()");
      const page = ctx && ctx.guidesPage;
      return page ? (page.title || page.id || page) : undefined;
    } catch (e) {
      warn("could not read guides page:", errMsg(e));
      return undefined;
    }
  }

  // ---------------- Copy handler ----------------
  async function onCopy(event) {
    copyCount++;
    const text = getCopiedText(event);
    const now = Date.now();
    log("copy event #" + copyCount, {
      target: describeTarget(event.target),
      textLength: text.length
    });

    if (now - lastEvent.time < CONFIG.dedupeWindowMs && text === lastEvent.text) {
      log("  duplicate within", CONFIG.dedupeWindowMs, "ms, ignored");
      return;
    }
    lastEvent = { time: now, text };

    const record = {
      event: "copy",
      timestamp: new Date(now).toISOString(),
      session: SESSION_ID,
      length: text.length,
      lines: text ? text.split("\n").length : 0,
      source: describeTarget(event.target),
      frame: event.target && event.target.ownerDocument !== document ? "iframe" : "main"
    };
    if (CONFIG.includeCopiedText) {
      record.text = text.length > CONFIG.maxTextLength
        ? text.slice(0, CONFIG.maxTextLength) + "…[truncated]"
        : text;
    }
    const page = await getGuidesPage();
    if (page !== undefined) record.guidesPage = page;

    pending.push(record);
    log("  record queued, pending:", pending.length);
    scheduleWrite();
  }

  // ---------------- Attach listeners ----------------
  function watchDocument(doc, label) {
    if (!doc || watchedDocs.has(doc)) return;
    watchedDocs.add(doc);
    doc.addEventListener("copy", onCopy, true);
    log("✓ listening for copy in", label);
    watchIframes(doc, label);
  }

  function tryWatchIframe(iframe, parentLabel) {
    const name = parentLabel + " > iframe" + (iframe.id ? "#" + iframe.id : "");
    const attach = () => {
      try {
        if (iframe.contentDocument) watchDocument(iframe.contentDocument, name);
      } catch (e) {
        warn("cannot watch cross-origin iframe:", name);
      }
    };
    attach();
    iframe.addEventListener("load", attach);
  }

  function watchIframes(doc, label) {
    doc.querySelectorAll("iframe").forEach((f) => tryWatchIframe(f, label));
    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach((node) => {
            if (node.tagName === "IFRAME") tryWatchIframe(node, label);
            else if (node.querySelectorAll) node.querySelectorAll("iframe").forEach((f) => tryWatchIframe(f, label));
          });
        }
      });
      observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true });
    } catch (e) {
      warn("could not observe new iframes in", label, e);
    }
  }

  watchDocument(document, "extension document");
  if (window.top !== window) {
    try {
      watchDocument(window.top.document, "top document");
    } catch (e) {
      warn("window.top is cross-origin; copies outside this frame will be missed.");
    }
  }

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", () => flush());

  // Manual test hooks: run these in the console
  window.__copyLogger = {
    status: () => ({
      folder: CONFIG.logDirs[dirIndex] || "(none writable)",
      folderConfirmed: dirConfirmed,
      session: SESSION_ID,
      copyCount,
      filesWritten,
      pending: pending.length
    }),
    pendingRecords: () => pending.slice(),
    flush: () => flush(),
    testWrite: () => {
      pending.push({ event: "manual-test", timestamp: new Date().toISOString(), session: SESSION_ID });
      return flush();
    }
  };
  log("ready. Debug helpers: window.__copyLogger.status(), .testWrite(), .flush()");
})(window.codioIDE, window);
