// Codio extension loader
// Injects a no-copy/no-selection script into Codio Guides pages.

(async function (codioIDE, window) {
  const GUIDE_SCRIPT_URL = "https://raw.githubusercontent.com/codio-extensions/guides-block-pasting/refs/heads/main/no-copy-guides.js";

  if (
    codioIDE &&
    codioIDE.guides &&
    typeof codioIDE.guides.addScript === "function"
  ) {
    codioIDE.guides.addScript(GUIDE_SCRIPT_URL);
    // console.log("No-copy guide blocker script registered:", GUIDE_SCRIPT_URL);
  } else {
    console.warn("codioIDE.guides.addScript is not available.");
  }
})(window.codioIDE, window);
