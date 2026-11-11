// Codio extension: Copy Logger (debug build)
// Detects copy actions (Ctrl/Cmd+C, right-click > Copy, Edit menu > Copy)
// and appends a record of each one to a log file in the workspace.
// All console output is prefixed with [copy-logger] so you can filter on it.

(async function (codioIDE, window) {
  const TAG = "[copy-logger]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const error = (...a) => console.error(TAG, ...a);

  log("script loaded at", new Date().toISOString());

  // ---------------- Configuration ----------------
  const CONFIG = {
    logPaths: [
      ".guides/secure/copy-log.jsonl",
      ".guides/copy-log.jsonl",
      "copy-log.jsonl"
    ],
    includeCopiedText: false,
    maxTextLength: 500,
    dedupeWindowMs: 250,
    writeDebounceMs: 1000,
    includeGuidesPage: true,
    apiTimeoutMs: 5000 // any API call slower than this is treated as failed
  };

  // ---------------- Environment checks ----------------
  log("environment:", {
    codioIDEPresent: !!codioIDE,
    filesApi: !!(codioIDE && codioIDE.files),
    filesAdd: typeof (codioIDE && codioIDE.files && codioIDE.files.add),
    filesGetContent: typeof (codioIDE && codioIDE.files && codioIDE.files.getContent),
    coachBotApi: !!(codioIDE && codioIDE.coachBot),
    location: window.location && window.location.href,
    inIframe: window.top !== window,
    iframesInDocument: document.querySelectorAll("iframe").length
  });

  if (!codioIDE || !codioIDE.files) {
    error("codioIDE.files is not available; cannot write a log file. Stopping.");
    return;
  }

  // Wrap an API call so a hang shows up in the console instead of stalling silently
  function withTimeout(promise, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label + " timed out after " + CONFIG.apiTimeoutMs + "ms")), CONFIG.apiTimeoutMs)
      )
    ]);
  }

  // ---------------- State ----------------
  let logPath = null;
  let existingContent = "";
  let pending = [];
  let writeTimer = null;
  let writing = Promise.resolve();
  let lastEvent = { time: 0, text: null };
  let copyCount = 0;
  const watchedDocs = new WeakSet();

  // ---------------- Log file setup ----------------
  async function initLogFile() {
    for (const path of CONFIG.logPaths) {
      log("trying log path:", path);
      try {
        let content = "";
        try {
          content = (await withTimeout(codioIDE.files.getContent(path), "getContent(" + path + ")")) || "";
          log("  existing file found,", content.length, "chars");
        } catch (e) {
          log("  no existing file (or read failed):", e && e.message ? e.message : e);
          content = "";
        }
        await withTimeout(codioIDE.files.add(path, content), "add(" + path + ")");
        logPath = path;
        existingContent = content;
        log("  ✓ write test passed, logging to", path);
        return;
      } catch (e) {
        warn("  ✗ cannot write to", path, "-", e && e.message ? e.message : e);
      }
    }
    error("no writable log path found; copies will be buffered in memory only");
  }

  function scheduleWrite() {
    if (writeTimer) return;
    log("write scheduled in", CONFIG.writeDebounceMs, "ms");
    writeTimer = setTimeout(() => {
      writeTimer = null;
      flush();
    }, CONFIG.writeDebounceMs);
  }

  function flush() {
    writing = writing.then(async () => {
      if (pending.length === 0) return;
      if (!logPath) {
        warn("flush skipped: no log path yet,", pending.length, "record(s) buffered");
        return;
      }
      const batch = pending;
      pending = [];
      const lines = batch.map((r) => JSON.stringify(r)).join("\n") + "\n";
      const newContent = existingContent + lines;
      log("writing", batch.length, "record(s) to", logPath);
      try {
        await withTimeout(codioIDE.files.add(logPath, newContent), "add(" + logPath + ")");
        existingContent = newContent;
        log("  ✓ write succeeded, file is now", newContent.length, "chars");
      } catch (e) {
        error("  ✗ write failed, will retry:", e && e.message ? e.message : e);
        pending = batch.concat(pending);
        scheduleWrite();
      }
    });
    return writing;
  }

  // ---------------- Helpers ----------------
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
      warn("could not read guides page:", e && e.message ? e.message : e);
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
      textLength: text.length,
      inIframe: !!(event.target && event.target.ownerDocument && event.target.ownerDocument !== document)
    });

    if (now - lastEvent.time < CONFIG.dedupeWindowMs && text === lastEvent.text) {
      log("  duplicate within", CONFIG.dedupeWindowMs, "ms, ignored");
      return;
    }
    lastEvent = { time: now, text };

    const record = {
      event: "copy",
      timestamp: new Date(now).toISOString(),
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
    if (!doc) { warn("watchDocument: no document for", label); return; }
    if (watchedDocs.has(doc)) return;
    watchedDocs.add(doc);
    doc.addEventListener("copy", onCopy, true);
    log("✓ listening for copy in", label, "-", (doc.location && doc.location.href) || "(no href)");
    watchIframes(doc, label);
  }

  function tryWatchIframe(iframe, parentLabel) {
    const name = parentLabel + " > iframe" + (iframe.id ? "#" + iframe.id : "") + (iframe.src ? " [" + iframe.src.slice(0, 80) + "]" : "");
    const attach = () => {
      try {
        if (iframe.contentDocument) watchDocument(iframe.contentDocument, name);
        else warn("no contentDocument (likely cross-origin):", name);
      } catch (e) {
        warn("cannot watch cross-origin iframe:", name);
      }
    };
    attach();
    iframe.addEventListener("load", attach);
  }

  function watchIframes(doc, label) {
    const frames = doc.querySelectorAll("iframe");
    if (frames.length) log("found", frames.length, "iframe(s) in", label);
    frames.forEach((f) => tryWatchIframe(f, label));
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

  function safeTopDocument() {
    try {
      return window.top.document;
    } catch (e) {
      warn("window.top is cross-origin; can only watch this frame. Copies elsewhere in the IDE will be missed.");
      return null;
    }
  }

  // Attach listeners FIRST so a slow/failed file API doesn't stop detection
  watchDocument(document, "extension document");
  if (window.top !== window) {
    const topDoc = safeTopDocument();
    if (topDoc) watchDocument(topDoc, "top document");
  }

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", () => flush());

  // Manual test hooks: run these in the console
  window.__copyLogger = {
    status: () => ({ logPath, pending: pending.length, copyCount, existingChars: existingContent.length }),
    flush: () => flush(),
    testWrite: () => {
      pending.push({ event: "manual-test", timestamp: new Date().toISOString() });
      return flush();
    }
  };
  log("debug helpers available: window.__copyLogger.status(), .testWrite(), .flush()");

  await initLogFile();
  log("init complete:", window.__copyLogger.status());
  if (pending.length) flush();
})(window.codioIDE, window);