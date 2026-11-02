/*
 * Codio Docs Help extension (v0.2)
 *
 * Two ways to talk to the same Codio Coach AI:
 *
 *  1. Custom UI  - floating image button (bottom-left) -> tooltip -> custom chat window.
 *                  Messages are sent with codioIDE.coachBot.ask(); the reply is read back
 *                  with codioIDE.coachBot.getHistory() and shown in the custom window.
 *
 *  2. Native     - a "Codio Docs Help" item registered in the Coach Bot menu. Clicking it
 *                  asks for a question (coachBot.input) and Coach answers in its own panel.
 *
 * For now the bot just answers whatever the user asks. Put your real instructions in
 * SYSTEM_PROMPT later.
 */
(function (codioIDE, window) {
  'use strict';

  // ---------- Config ----------
  const IMAGE_URL = 'https://motiffreddie-historyjasmine.codio.io/image.png';
  const BUTTON_SIZE_PX = 112;
  const BOT_NAME = 'Codio Docs Help';
  const TOOLTIP_TEXT = 'I can help with Codio';
  const TOOLTIP_DELAY_MS = 3000;
  const TOOLTIP_VISIBLE_MS = 8000;
  const GREETING = 'Hi! Ask me anything about Codio.';
  const ROOT_ID = 'codio-help-ext-root';
  const MENU_ID = 'codio-docs-help';

  // Placeholder - replace with your real instructions later.
  const SYSTEM_PROMPT = 'You are Codio Docs Help, a friendly assistant inside the Codio IDE. ' +
    'Answer the user\'s questions helpfully and concisely.';

  // true  = send the whole conversation via `messages` (the bot remembers earlier turns)
  // false = send only the latest question via `userPrompt` (no memory). Flip this if the
  //         first test returns a request error.
  const USE_MESSAGES_FOR_HISTORY = true;

  // After reading the reply back into our window, close Coach's own panel (if it opened).
  const CLOSE_COACH_PANEL_AFTER_REPLY = true;

  const bot = codioIDE && codioIDE.coachBot;
  const ROLES = (bot && bot.MESSAGE_ROLES) || { USER: 'user', ASSISTANT: 'assistant' };

  // ---------- Coach helpers ----------
  async function safeHistory() {
    try {
      const h = await bot.getHistory();
      return Array.isArray(h) ? h : [];
    } catch (e) {
      console.warn('[help-ext] getHistory failed:', e);
      return [];
    }
  }

  function lastAssistantContent(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === ROLES.ASSISTANT) return list[i].content;
    }
    return null;
  }

  /**
   * Send the conversation to Codio Coach and return the assistant's reply text.
   * conversation = [{ role: 'user' | 'assistant', content: string }, ...]
   * Returns { reply: string|null, interrupted: boolean }
   */
  async function askCoach(conversation) {
    if (!bot) throw new Error('codioIDE.coachBot is not available.');

    const before = await safeHistory();
    const lastUser = conversation[conversation.length - 1].content;

    const data = USE_MESSAGES_FOR_HISTORY
      ? {
          systemPrompt: SYSTEM_PROMPT,
          messages: conversation.map(function (m) {
            return { role: m.role === 'user' ? ROLES.USER : ROLES.ASSISTANT, content: m.content };
          })
        }
      : { systemPrompt: SYSTEM_PROMPT, userPrompt: lastUser };

    const result = await bot.ask(data, { stream: false, preventMenu: true });
    if (result && result.error) throw new Error(result.error.message || 'Coach request failed.');
    if (result && result.interrupted) return { reply: null, interrupted: true };

    // Read the reply back from Coach's history.
    const after = await safeHistory();
    let reply = null;
    const fresh = after.slice(before.length).filter(function (m) { return m.role === ROLES.ASSISTANT; });
    if (fresh.length) {
      reply = fresh[fresh.length - 1].content;
    } else {
      const a = lastAssistantContent(after);
      if (a && a !== lastAssistantContent(before)) reply = a;
    }

    if (reply && CLOSE_COACH_PANEL_AFTER_REPLY) {
      try { bot.close(); } catch (e) { /* ignore */ }
    }
    return { reply: reply, interrupted: false };
  }

  // ---------- Native Coach menu item ("Codio Docs Help") ----------
  function registerNativeMenuItem() {
    if (!bot) return;
    try {
      bot.register({
        id: MENU_ID,
        name: BOT_NAME,
        callback: async function () {
          const question = await bot.input('Ask me anything about Codio', '');
          if (!question || !question.trim()) return;
          await bot.ask({ systemPrompt: SYSTEM_PROMPT, userPrompt: question.trim() }, { stream: true });
        }
      });
    } catch (e) {
      console.warn('[help-ext] Could not register Coach menu item:', e);
    }
  }

  // ---------- Fallback when the DOM is unreachable ----------
  function startWithCoachBotApiOnly() {
    if (!bot) {
      console.warn('[help-ext] No DOM access and no codioIDE.coachBot available.');
      return;
    }
    setTimeout(function () {
      bot.showTooltip(TOOLTIP_TEXT, function () { bot.call({ id: MENU_ID }); });
    }, TOOLTIP_DELAY_MS);
  }

  // ---------- Custom DOM widget ----------
  function getDocument() {
    try { if (window.top && window.top.document) return window.top.document; } catch (e) { /* cross-origin */ }
    try { return window.document || null; } catch (e) { return null; }
  }

  function startWithDom(doc) {
    if (doc.getElementById(ROOT_ID)) return;

    const style = doc.createElement('style');
    style.textContent = `
      #${ROOT_ID} { position: fixed; left: 20px; bottom: 20px; z-index: 2147483000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} .hx-btn { width: ${BUTTON_SIZE_PX}px; height: ${BUTTON_SIZE_PX}px; border: none; padding: 0;
        cursor: pointer; background: transparent; box-shadow: none; overflow: visible;
        display: flex; align-items: center; justify-content: center; font-size: ${BUTTON_SIZE_PX / 2}px;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,.35)); transition: transform .15s ease; }
      #${ROOT_ID} .hx-btn:hover { transform: scale(1.05); }
      #${ROOT_ID} .hx-btn:focus { outline: none; }
      #${ROOT_ID} .hx-btn img { width: 100%; height: 100%; object-fit: contain; display: block; }
      #${ROOT_ID} .hx-tip { position: absolute; left: ${BUTTON_SIZE_PX + 10}px; bottom: ${BUTTON_SIZE_PX / 2 - 17}px;
        white-space: nowrap; background: #222; color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 13px;
        box-shadow: 0 2px 8px rgba(0,0,0,.3); cursor: pointer; display: none; }
      #${ROOT_ID} .hx-tip::before { content: ""; position: absolute; left: -6px; bottom: 14px;
        border: 6px solid transparent; border-right-color: #222; border-left: 0; }
      #${ROOT_ID} .hx-tip.hx-show { display: block; animation: hx-pop .25s ease-out; }

      #${ROOT_ID} .hx-chat { position: absolute; left: 0; bottom: ${BUTTON_SIZE_PX + 10}px; width: 340px; height: 460px;
        background: #fff; color: #222; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
        display: none; flex-direction: column; overflow: hidden; }
      #${ROOT_ID} .hx-chat.hx-show { display: flex; animation: hx-pop .2s ease-out; }
      #${ROOT_ID} .hx-head { background: #2d6cdf; color: #fff; padding: 10px 14px; font-weight: 600;
        display: flex; justify-content: space-between; align-items: center; }
      #${ROOT_ID} .hx-close { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
      #${ROOT_ID} .hx-body { flex: 1; padding: 12px; overflow-y: auto; background: #f5f6f8;
        display: flex; flex-direction: column; gap: 8px; }
      #${ROOT_ID} .hx-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4;
        white-space: pre-wrap; word-wrap: break-word; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
      #${ROOT_ID} .hx-msg.hx-bot { align-self: flex-start; background: #fff; color: #222; }
      #${ROOT_ID} .hx-msg.hx-user { align-self: flex-end; background: #2d6cdf; color: #fff; }
      #${ROOT_ID} .hx-msg.hx-err { align-self: flex-start; background: #fdecea; color: #8a1c13; }
      #${ROOT_ID} .hx-msg.hx-wait { align-self: flex-start; background: #fff; color: #777; font-style: italic; }
      #${ROOT_ID} .hx-form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #e3e5e8; background: #fff; }
      #${ROOT_ID} .hx-input { flex: 1; resize: none; height: 38px; padding: 8px; font: inherit; font-size: 14px;
        border: 1px solid #c9ccd1; border-radius: 8px; color: #222; background: #fff; }
      #${ROOT_ID} .hx-send { padding: 0 14px; border: none; border-radius: 8px; background: #2d6cdf; color: #fff;
        font-weight: 600; cursor: pointer; }
      #${ROOT_ID} .hx-send:disabled, #${ROOT_ID} .hx-input:disabled { opacity: .5; cursor: not-allowed; }
      @keyframes hx-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    `;
    doc.head.appendChild(style);

    const root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="hx-chat" role="dialog">
        <div class="hx-head"><span class="hx-title"></span>
          <button class="hx-close" aria-label="Close chat">&times;</button></div>
        <div class="hx-body"></div>
        <div class="hx-form">
          <textarea class="hx-input" placeholder="Ask a question..." rows="1"></textarea>
          <button class="hx-send">Send</button>
        </div>
      </div>
      <div class="hx-tip" role="status"></div>
      <button class="hx-btn" aria-label="Open chat"></button>
    `;
    doc.body.appendChild(root);

    const btn = root.querySelector('.hx-btn');
    const tip = root.querySelector('.hx-tip');
    const chat = root.querySelector('.hx-chat');
    const closeBtn = root.querySelector('.hx-close');
    const body = root.querySelector('.hx-body');
    const input = root.querySelector('.hx-input');
    const sendBtn = root.querySelector('.hx-send');

    root.querySelector('.hx-title').textContent = BOT_NAME;
    tip.textContent = TOOLTIP_TEXT;

    const img = doc.createElement('img');
    img.alt = 'Help';
    img.src = IMAGE_URL;
    img.onerror = function () {
      console.warn('[help-ext] Could not load button image:', IMAGE_URL);
      img.remove();
      btn.textContent = '\uD83D\uDCAC';
    };
    btn.appendChild(img);

    // ----- chat logic -----
    const conversation = []; // what we send to Coach: [{role, content}]
    let busy = false;

    function addMessage(text, kind) {
      const el = doc.createElement('div');
      el.className = 'hx-msg hx-' + kind;
      el.textContent = text;           // textContent: never interpret replies as HTML
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    function setBusy(state) {
      busy = state;
      input.disabled = state;
      sendBtn.disabled = state;
    }

    async function send() {
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = '';
      addMessage(text, 'user');
      conversation.push({ role: 'user', content: text });
      setBusy(true);
      const waiting = addMessage('Thinking...', 'wait');

      try {
        const out = await askCoach(conversation);
        waiting.remove();
        if (out.interrupted) {
          conversation.pop();
          addMessage('Request was interrupted.', 'err');
        } else if (out.reply) {
          conversation.push({ role: 'assistant', content: out.reply });
          addMessage(out.reply, 'bot');
        } else {
          // The request went through but we couldn't read the answer back.
          conversation.pop();
          addMessage('I couldn\'t read the reply back into this window. It may be in the Codio Coach panel.', 'err');
          try { bot.open(); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('[help-ext] ask failed:', e);
        waiting.remove();
        conversation.pop();
        addMessage('Something went wrong: ' + (e && e.message ? e.message : e), 'err');
      } finally {
        setBusy(false);
        input.focus();
      }
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
    });

    addMessage(GREETING, 'bot');

    // ----- open / close / tooltip -----
    let tipTimer = null;
    function hideTip() {
      tip.classList.remove('hx-show');
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    }
    function openChat() { hideTip(); chat.classList.add('hx-show'); input.focus(); }
    function closeChat() { chat.classList.remove('hx-show'); }

    btn.addEventListener('click', function () {
      chat.classList.contains('hx-show') ? closeChat() : openChat();
    });
    tip.addEventListener('click', openChat);
    closeBtn.addEventListener('click', closeChat);

    setTimeout(function () {
      if (chat.classList.contains('hx-show')) return;
      tip.classList.add('hx-show');
      tipTimer = setTimeout(hideTip, TOOLTIP_VISIBLE_MS);
    }, TOOLTIP_DELAY_MS);
  }

  // ---------- Boot ----------
  function init() {
    registerNativeMenuItem();           // always add the native "Codio Docs Help" item

    const doc = getDocument();
    if (doc && doc.body && doc.head) {
      try {
        startWithDom(doc);
        return;
      } catch (e) {
        console.warn('[help-ext] DOM widget failed, using coachBot API fallback:', e);
      }
    }
    startWithCoachBotApiOnly();
  }

  if (window.document && window.document.readyState === 'loading') {
    window.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.codioIDE, window);
