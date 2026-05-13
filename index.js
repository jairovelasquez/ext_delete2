// Codio extension entrypoint.
// Loads the guide tooltip script into Codio Guide pages.
//
// Suggested project path:
//   index.js
//   .guides/tooltips/guide-tooltips.js
//   .guides/tooltips/guide-tooltips.css
//   .guides/tooltips/definitions.json

(async function (codioIDE, window) {
  const TOOLTIP_DIR = "/.guides/tooltips";

  if (!codioIDE || !codioIDE.guides || typeof codioIDE.guides.addScript !== "function") {
    console.warn("[guide-tooltips] codioIDE.guides.addScript is not available.");
    return;
  }

  const boxUrl =
    codioIDE && typeof codioIDE.getBoxUrl === "function"
      ? codioIDE.getBoxUrl().replace(/\/$/, "")
      : "";

  // cacheBust helps authors see changes immediately while iterating.
  const cacheBust = Date.now();
  const scriptUrl = `${boxUrl}${TOOLTIP_DIR}/guide-tooltips.js?v=${cacheBust}`;

  codioIDE.guides.addScript(scriptUrl);
  console.log("[guide-tooltips] Loaded:", scriptUrl);
})(window.codioIDE, window);
