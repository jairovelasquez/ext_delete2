// Prevent paste and right click in Codio IDE
// Blocks Ctrl+V, Cmd+V, Shift+Insert, paste events, and right-click context menu.

(async function (codioIDE, window) {
  const BLOCK_MESSAGE = "Pasting and right click are disabled for this assignment.";

  function isPasteHotkey(event) {
    const key = (event.key || "").toLowerCase();

    return (
      // Windows/Linux: Ctrl+V
      ((event.ctrlKey || event.metaKey) && key === "v") ||

      // Some Linux/Windows environments: Shift+Insert
      (event.shiftKey && key === "insert")
    );
  }

  function isRightClick(event) {
    return event.button === 2;
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
    const now = Date.now();

    if (!notify.lastShown || now - notify.lastShown > 2000) {
      notify.lastShown = now;
      console.warn(BLOCK_MESSAGE);

      if (
        codioIDE &&
        codioIDE.coachBot &&
        typeof codioIDE.coachBot.write === "function"
      ) {
        codioIDE.coachBot.write(BLOCK_MESSAGE);
      }
    }
  }

  function installBlockers(targetWindow) {
    const targetDocument = targetWindow.document;

    // Paste hotkeys
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

    // Paste through menus/browser input events
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

    // Right click / context menu
    targetDocument.addEventListener(
      "contextmenu",
      function (event) {
        notify();
        return blockEvent(event);
      },
      true
    );

    targetDocument.addEventListener(
      "mousedown",
      function (event) {
        if (isRightClick(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    targetDocument.addEventListener(
      "mouseup",
      function (event) {
        if (isRightClick(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );
  }

  installBlockers(window);

  // Best-effort: also install inside same-origin iframes.
  for (const frame of window.frames) {
    try {
      installBlockers(frame);
    } catch (e) {
      // Ignore cross-origin frames.
    }
  }

  console.log("Paste and right-click blocker extension loaded.");
})(window.codioIDE, window);
