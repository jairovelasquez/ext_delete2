// Prevent paste in Codio IDE
// Blocks Ctrl+V, Cmd+V, Shift+Insert, beforeinput insertFromPaste, and paste events.

(async function (codioIDE, window) {
  const BLOCK_MESSAGE = "Pasting is disabled for this assignment.";

  function isPasteHotkey(event) {
    const key = (event.key || "").toLowerCase();

    return (
      // Windows/Linux: Ctrl+V
      ((event.ctrlKey || event.metaKey) && key === "v") ||

      // Some Linux/Windows environments: Shift+Insert
      (event.shiftKey && key === "insert")
    );
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    return false;
  }

  function notify() {
    // Avoid spamming the console/UI too much.
    const now = Date.now();

    if (!notify.lastShown || now - notify.lastShown > 2000) {
      notify.lastShown = now;
      console.warn(BLOCK_MESSAGE);

      // Optional: show a CoachBot message if available.
      // Comment this out if you do not want any UI message.
      if (
        codioIDE &&
        codioIDE.coachBot &&
        typeof codioIDE.coachBot.write === "function"
      ) {
        codioIDE.coachBot.write(BLOCK_MESSAGE);
      }
    }
  }

  function installPasteBlocker(targetWindow) {
    const targetDocument = targetWindow.document;

    targetWindow.addEventListener(
      "keydown",
      function (event) {
        if (isPasteHotkey(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    targetDocument.addEventListener(
      "keydown",
      function (event) {
        if (isPasteHotkey(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    targetDocument.addEventListener(
      "beforeinput",
      function (event) {
        if (
          event.inputType === "insertFromPaste" ||
          event.inputType === "insertFromPasteAsQuotation"
        ) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    targetDocument.addEventListener(
      "paste",
      function (event) {
        notify();
        return blockEvent(event);
      },
      true
    );
  }

  // Install on the current window.
  installPasteBlocker(window);

  // Best-effort: also install inside same-origin iframes.
  // This may help if an editor surface is embedded in a frame.
  for (const frame of window.frames) {
    try {
      installPasteBlocker(frame);
    } catch (e) {
      // Ignore cross-origin frames.
    }
  }

  console.log("Paste blocker extension loaded.");
})(window.codioIDE, window);