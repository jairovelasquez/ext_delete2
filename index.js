// Codio extension: Copy Logger
// Detects copy actions (Ctrl/Cmd+C, right-click > Copy, Edit menu > Copy)
// and appends a record of each one to a log file in the workspace.

(async function (codioIDE, window) {
  // ---------------- Configuration ----------------
  const CONFIG = {
    // Tried in order; the first path that can be written is used.
    logPaths: [
      ".guides/secure/copy-log.jsonl", // hidden from students in assignments
      ".guides/copy-log.jsonl",
      "copy-log.jsonl"                 // workspace root fallback
    ],
    includeCopiedText: false, // set true to store the copied text itself
    maxTextLength: 500,       // truncate stored text to this many characters
    dedupeWindowMs: 250,      // ignore duplicate events fired within this window
    writeDebounceMs: 1000,    // batch writes so rapid copies don't spam the API
    includeGuidesPage: true   // try to record which guide page was open
  };

  // ---------------- State ----------------
  let logPath = null;
  let existingContent = "";
  let pending = [];
  let writeTimer = null;
  let writing = Promise.resolve();
  let lastEvent = { time: 0, text: null };
  const watchedDocs = new WeakSet();

  // ---------------- Log file setup ----------------
  async function initLogFile() {
    for (const path of CONFIG.logPaths) {
      try {
        let content = "";
        try {
          content = (await codioIDE.files.getContent(path)) || "";
        } catch (e) {
          content = ""; // file doesn't exist yet
        }
        // Prove we can write here before committing to this path
        await codioIDE.files.add(path, content);
        logPath = path;
        existingContent = content;
        console.log("[copy-logger] logging to", path);
        return;
      } catch (e) {
        console.warn("[copy-logger] cannot write to", path, e);
      }
    }
    console.error("[copy-logger] no writable log path found");
  }

  function scheduleWrite() {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      flush();
    }, CONFIG.writeDebounceMs);
  }

  function flush() {
    // Chain writes so they never overlap
    writing = writing.then(async () => {
      if (!logPath || pending.length === 0) return;
      const batch = pending;
      pending = [];
      const lines = batch.map((r) => JSON.stringify(r)).join("\n") + "\n";
      const newContent = existingContent + lines;
      try {
        await codioIDE.files.add(logPath, newContent);
        existingContent = newContent;
      } catch (e) {
        console.error("[copy-logger] write failed, will retry", e);
        pending = batch.concat(pending);
        scheduleWrite();
      }
    });
    return writing;
  }

  // ---------------- Helpers ----------------
  function getCopiedText(event) {
    const target = event.target;
    // Editors like Ace keep the selection in a hidden textarea
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
      try {
        const { selectionStart, selectionEnd, value } = target;
        if (typeof selectionStart === "number" && selectionEnd > selectionStart) {
          return value.substring(selectionStart, selectionEnd);
        }
      } catch (e) { /* some input types don't support selection */ }
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
    // Walk up to find a recognisable region of the IDE
    const region = el.closest && el.closest(
      "[class*='editor'], [class*='ace'], [class*='monaco'], [class*='terminal'], [class*='xterm'], [class*='guide']"
    );
    if (region && region !== el && typeof region.className === "string") {
      desc += " in ." + region.className.trim().split(/\s+/)[0];
    }
    return desc;
  }

  async function getGuidesPage() {
    if (!CONFIG.includeGuidesPage) return undefined;
    try {
      const ctx = await Promise.race([
        codioIDE.coachBot.getContext(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500))
      ]);
      const page = ctx && ctx.guidesPage;
      return page ? (page.title || page.id || page) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // ---------------- Copy handler ----------------
  async function onCopy(event) {
    const text = getCopiedText(event);
    const now = Date.now();

    // The same copy can bubble through several listeners; record it once
    if (now - lastEvent.time < CONFIG.dedupeWindowMs && text === lastEvent.text) return;
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
    scheduleWrite();
  }

  // ---------------- Attach listeners ----------------
  function watchDocument(doc) {
    if (!doc || watchedDocs.has(doc)) return;
    watchedDocs.add(doc);
    // The "copy" event fires for keyboard shortcuts, context-menu Copy,
    // and browser Edit > Copy alike. Capture phase so editors that
    // stop propagation can't hide it from us.
    doc.addEventListener("copy", onCopy, true);
    watchIframes(doc);
  }

  function tryWatchIframe(iframe) {
    const attach = () => {
      try {
        // Only works for same-origin iframes; cross-origin throws
        if (iframe.contentDocument) watchDocument(iframe.contentDocument);
      } catch (e) { /* cross-origin: cannot observe */ }
    };
    attach();
    iframe.addEventListener("load", attach);
  }

  function watchIframes(doc) {
    doc.querySelectorAll("iframe").forEach(tryWatchIframe);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.tagName === "IFRAME") tryWatchIframe(node);
          else if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(tryWatchIframe);
        });
      }
    });
    observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true });
  }

  // Flush anything pending if the tab is hidden or closed
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", () => flush());

  await initLogFile();
  // Start listening even if the log file failed; records stay buffered
  watchDocument(window.top && window.top !== window ? safeTopDocument() : document);
  watchDocument(document);

  function safeTopDocument() {
    try { return window.top.document; } catch (e) { return document; }
  }
})(window.codioIDE, window);