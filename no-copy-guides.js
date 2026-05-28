// Prevent copy and text selection inside Codio Guides.
// Blocks Ctrl+C, Cmd+C, Ctrl+Insert, copy events, selectstart, dragstart,
// and continuously clears accidental selections.

(function (window) {
  const BLOCK_MESSAGE = "Copying and text selection are disabled for this assignment.";
  const STYLE_ID = "codio-no-copy-no-select-style";

  function isCopyHotkey(event) {
    const key = (event.key || "").toLowerCase();

    return (
      // Windows/Linux: Ctrl+C
      ((event.ctrlKey || event.metaKey) && key === "c") ||

      // Some Windows/Linux environments: Ctrl+Insert
      (event.ctrlKey && key === "insert")
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
    const now = Date.now();

    if (!notify.lastShown || now - notify.lastShown > 2000) {
      notify.lastShown = now;
      console.warn(BLOCK_MESSAGE);
    }
  }

  function clearSelection(targetWindow) {
    try {
      const selection = targetWindow.getSelection && targetWindow.getSelection();

      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges();
      }
    } catch (e) {

    }
  }

  function installNoSelectStyles(targetDocument) {
    if (targetDocument.getElementById(STYLE_ID)) {
      return;
    }

    const style = targetDocument.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html,
      body,
      body * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }

      ::selection {
        background: transparent !important;
      }

      ::-moz-selection {
        background: transparent !important;
      }
    `;

    const head = targetDocument.head || targetDocument.documentElement;
    head.appendChild(style);
  }

  function installBlockers(targetWindow) {
    const targetDocument = targetWindow.document;

    installNoSelectStyles(targetDocument);

    // Copy hotkeys
    targetWindow.addEventListener(
      "keydown",
      function (event) {
        if (isCopyHotkey(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    targetDocument.addEventListener(
      "keydown",
      function (event) {
        if (isCopyHotkey(event)) {
          notify();
          return blockEvent(event);
        }
      },
      true
    );

    // Copy through browser/menu APIs
    targetDocument.addEventListener(
      "copy",
      function (event) {
        notify();

        if (event.clipboardData) {
          event.clipboardData.setData("text/plain", "");
          event.clipboardData.setData("text/html", "");
        }

        return blockEvent(event);
      },
      true
    );

    // Prevent text selection
    targetDocument.addEventListener(
      "selectstart",
      function (event) {
        notify();
        clearSelection(targetWindow);
        return blockEvent(event);
      },
      true
    );

    targetDocument.addEventListener(
      "selectionchange",
      function () {
        clearSelection(targetWindow);
      },
      true
    );

    targetDocument.addEventListener(
      "mousedown",
      function () {
        clearSelection(targetWindow);
      },
      true
    );

    targetDocument.addEventListener(
      "mouseup",
      function () {
        clearSelection(targetWindow);
      },
      true
    );

    targetDocument.addEventListener(
      "mousemove",
      function () {
        clearSelection(targetWindow);
      },
      true
    );

    targetDocument.addEventListener(
      "dragstart",
      function (event) {
        notify();
        return blockEvent(event);
      },
      true
    );

    if (targetWindow.frames && targetWindow.frames.length) {
      for (let i = 0; i < targetWindow.frames.length; i += 1) {
        try {
          installBlockers(targetWindow.frames[i]);
        } catch (e) {
          
        }
      }
    }

    clearSelection(targetWindow);
  }

  installBlockers(window);

  console.log("Copy and guide text-selection blocker loaded.");
})(window);
