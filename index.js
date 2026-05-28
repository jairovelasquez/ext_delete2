// Prevent copy and text selection in Codio Guides
// Single-file Codio extension.
// Blocks Ctrl+C, Cmd+C, Ctrl+Insert, copy events, selectstart, dragstart,
// and clears accidental guide text selections.

(async function (codioIDE, window) {
  const GUIDE_BLOCKER_SCRIPT = `
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
          const selection =
            targetWindow.getSelection && targetWindow.getSelection();

          if (selection && selection.rangeCount > 0) {
            selection.removeAllRanges();
          }
        } catch (e) {
          // Ignore selection errors.
        }
      }

      function installNoSelectStyles(targetDocument) {
        if (targetDocument.getElementById(STYLE_ID)) {
          return;
        }

        const style = targetDocument.createElement("style");
        style.id = STYLE_ID;
        style.textContent = [
          "html,",
          "body,",
          "body * {",
          "  -webkit-user-select: none !important;",
          "  -moz-user-select: none !important;",
          "  -ms-user-select: none !important;",
          "  user-select: none !important;",
          "}",
          "",
          "::selection {",
          "  background: transparent !important;",
          "}",
          "",
          "::-moz-selection {",
          "  background: transparent !important;",
          "}"
        ].join("\\n");

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

        // Prevent dragging selected content/images out of guides
        targetDocument.addEventListener(
          "dragstart",
          function (event) {
            notify();
            return blockEvent(event);
          },
          true
        );

        // Best-effort: also install inside same-origin iframes in the guide page.
        for (const frame of targetWindow.frames) {
          try {
            installBlockers(frame);
          } catch (e) {
            // Ignore cross-origin frames.
          }
        }

        clearSelection(targetWindow);
      }

      installBlockers(window);

      console.log("Copy and guide text-selection blocker loaded.");
    })(window);
  `;

  function makeScriptUrl(source) {
    try {
      const blob = new Blob([source], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    } catch (e) {
      return "data:text/javascript;charset=utf-8," + encodeURIComponent(source);
    }
  }

  if (
    codioIDE &&
    codioIDE.guides &&
    typeof codioIDE.guides.addScript === "function"
  ) {
    const scriptUrl = makeScriptUrl(GUIDE_BLOCKER_SCRIPT);
    codioIDE.guides.addScript(scriptUrl);

    console.log("No-copy/no-selection guide blocker registered.");
  } else {
    console.warn("codioIDE.guides.addScript is not available.");
  }
})(window.codioIDE, window);
