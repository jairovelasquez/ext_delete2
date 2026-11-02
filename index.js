/*
 * Codio Help Button extension (v0.1 - test version)
 *
 * - Floating image button, bottom-left
 * - Tooltip "I can help with Codio" a few seconds after load
 * - Click -> small chat window that says "Hello world!"
 *
 * Primary path: a DOM widget (matches the requested design).
 * Fallback: if the DOM can't be reached from the extension sandbox,
 * use the documented codioIDE.coachBot API (register / showTooltip / open / write).
 */
(function (codioIDE, window) {
  'use strict';

  // ---------- Config ----------
  const IMAGE_URL = 'https://motiffreddie-historyjasmine.codio.io/image.png';
  const TOOLTIP_TEXT = 'I can help with Codio';
  const TOOLTIP_DELAY_MS = 3000;      // "a few seconds after loading"
  const TOOLTIP_VISIBLE_MS = 8000;    // auto-hide the tooltip after this long
  const CHAT_GREETING = 'Hello world!';
  const ROOT_ID = 'codio-help-ext-root';

  // ---------- Fallback: documented coachBot API ----------
  function startWithCoachBotApi() {
    const bot = codioIDE && codioIDE.coachBot;
    if (!bot) {
      console.warn('[help-ext] No DOM access and no codioIDE.coachBot available.');
      return;
    }
    bot.register('help-ext-test', 'I can help with Codio', function () {
      bot.write(CHAT_GREETING);
    });
    setTimeout(function () {
      bot.showTooltip(TOOLTIP_TEXT, function () {
        bot.open();
        bot.write(CHAT_GREETING);
      });
    }, TOOLTIP_DELAY_MS);
  }

  // ---------- Primary: DOM widget ----------
  function getDocument() {
    // Prefer the top-level page if we're inside a same-origin iframe.
    try {
      if (window.top && window.top.document) return window.top.document;
    } catch (e) { /* cross-origin, fall through */ }
    try {
      return window.document || null;
    } catch (e) {
      return null;
    }
  }

  function startWithDom(doc) {
    if (doc.getElementById(ROOT_ID)) return; // don't initialise twice

    const style = doc.createElement('style');
    style.textContent = `
      #${ROOT_ID} { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      #${ROOT_ID} .hx-btn { width: 56px; height: 56px; border-radius: 50%; border: none; padding: 0;
        cursor: pointer; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.3); overflow: hidden;
        display: flex; align-items: center; justify-content: center; font-size: 26px; }
      #${ROOT_ID} .hx-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
      #${ROOT_ID} .hx-tip { position: absolute; left: 66px; bottom: 10px; white-space: nowrap;
        background: #222; color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 13px;
        box-shadow: 0 2px 8px rgba(0,0,0,.3); cursor: pointer; display: none; }
      #${ROOT_ID} .hx-tip::before { content: ""; position: absolute; left: -6px; bottom: 14px;
        border: 6px solid transparent; border-right-color: #222; border-left: 0; }
      #${ROOT_ID} .hx-tip.hx-show { display: block; animation: hx-pop .25s ease-out; }
      #${ROOT_ID} .hx-chat { position: absolute; left: 0; bottom: 70px; width: 320px; height: 400px;
        background: #fff; color: #222; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
        display: none; flex-direction: column; overflow: hidden; }
      #${ROOT_ID} .hx-chat.hx-show { display: flex; animation: hx-pop .2s ease-out; }
      #${ROOT_ID} .hx-head { background: #2d6cdf; color: #fff; padding: 10px 14px; font-weight: 600;
        display: flex; justify-content: space-between; align-items: center; }
      #${ROOT_ID} .hx-close { background: none; border: none; color: #fff; font-size: 20px;
        cursor: pointer; line-height: 1; }
      #${ROOT_ID} .hx-body { flex: 1; padding: 14px; overflow-y: auto; background: #f5f6f8; }
      #${ROOT_ID} .hx-msg { display: inline-block; background: #fff; border-radius: 12px;
        padding: 8px 12px; box-shadow: 0 1px 3px rgba(0,0,0,.15); font-size: 14px; }
      @keyframes hx-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    `;
    doc.head.appendChild(style);

    const root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="hx-chat" role="dialog" aria-label="Codio help chat">
        <div class="hx-head"><span>Codio Help</span>
          <button class="hx-close" aria-label="Close chat">&times;</button></div>
        <div class="hx-body"><div class="hx-msg"></div></div>
      </div>
      <div class="hx-tip" role="status"></div>
      <button class="hx-btn" aria-label="Open Codio help"></button>
    `;
    doc.body.appendChild(root);

    const btn = root.querySelector('.hx-btn');
    const tip = root.querySelector('.hx-tip');
    const chat = root.querySelector('.hx-chat');
    const closeBtn = root.querySelector('.hx-close');
    root.querySelector('.hx-msg').textContent = CHAT_GREETING;
    tip.textContent = TOOLTIP_TEXT;

    // Button image, with an emoji fallback if the image fails to load
    const img = doc.createElement('img');
    img.alt = 'Help';
    img.src = IMAGE_URL;
    img.onerror = function () {
      console.warn('[help-ext] Could not load button image:', IMAGE_URL);
      img.remove();
      btn.textContent = '\uD83D\uDCAC';
    };
    btn.appendChild(img);

    let tipTimer = null;
    function hideTip() {
      tip.classList.remove('hx-show');
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    }
    function openChat() { hideTip(); chat.classList.add('hx-show'); }
    function closeChat() { chat.classList.remove('hx-show'); }

    btn.addEventListener('click', function () {
      chat.classList.contains('hx-show') ? closeChat() : openChat();
    });
    tip.addEventListener('click', openChat);
    closeBtn.addEventListener('click', closeChat);

    // Show the tooltip a few seconds after load
    setTimeout(function () {
      if (chat.classList.contains('hx-show')) return;
      tip.classList.add('hx-show');
      tipTimer = setTimeout(hideTip, TOOLTIP_VISIBLE_MS);
    }, TOOLTIP_DELAY_MS);
  }

  // ---------- Boot ----------
  function init() {
    const doc = getDocument();
    if (doc && doc.body && doc.head) {
      try {
        startWithDom(doc);
        return;
      } catch (e) {
        console.warn('[help-ext] DOM widget failed, using coachBot API fallback:', e);
      }
    }
    startWithCoachBotApi();
  }

  if (window.document && window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.codioIDE, window);
