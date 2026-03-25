(function () {
  'use strict';

  const cfg = window.Arc6BotConfig || {};
  const API_URL    = cfg.apiUrl      || 'https://bot.arc6ai.com/chat';
  const CLIENT_ID  = cfg.clientId    || null;
  const ACCENT     = cfg.accentColor || '#6366F1';
  const GREETING   = cfg.greeting    || "Hi! I'm Arc6Bot — Arc6AI's AI assistant. Ask me anything about our products, RAG technology, or how we can help your business.";
  const PLACEHOLDER = cfg.placeholder || 'Ask about Arc6Bot, pricing, RAG…';
  const BOT_NAME   = cfg.botName     || 'Arc6Bot';
  const POWERED_BY = cfg.poweredBy   || 'Powered by Arc6AI';

  /* ── Inject CSS ─────────────────────────────────────────────────── */
  const style = document.createElement('style');
  style.textContent = `
    #a6b-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      display: flex; align-items: center; gap: 10px;
      padding: 14px 20px; border-radius: 9999px; border: none; cursor: pointer;
      background: linear-gradient(135deg, ${ACCENT}, #8B5CF6);
      color: #fff; font-size: 15px; font-weight: 600; font-family: system-ui, sans-serif;
      box-shadow: 0 4px 24px rgba(99,102,241,0.45);
      transition: opacity .2s, transform .2s;
    }
    #a6b-btn:hover { transform: scale(1.04); }
    #a6b-btn.a6b-hidden { opacity: 0; pointer-events: none; }

    #a6b-backdrop {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
      opacity: 0; pointer-events: none; transition: opacity .25s;
    }
    #a6b-backdrop.a6b-open { opacity: 1; pointer-events: auto; }

    #a6b-panel {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 9999;
      width: 100%; max-width: 360px;
      background: #0D0D14; border-left: 1px solid rgba(99,102,241,0.3);
      display: flex; flex-direction: column;
      transform: translateX(100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
      font-family: system-ui, sans-serif;
    }
    #a6b-panel.a6b-open { transform: translateX(0); }

    #a6b-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    #a6b-header-icon {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      background: linear-gradient(135deg, ${ACCENT}, #8B5CF6);
      display: flex; align-items: center; justify-content: center;
    }
    #a6b-header-text { flex: 1; min-width: 0; }
    #a6b-header-name { color: #fff; font-weight: 700; font-size: 14px; }
    #a6b-header-sub  { color: #6B7280; font-size: 11px; display: flex; align-items: center; gap: 4px; margin-top: 1px; }
    #a6b-header-sub::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #34d399; display: inline-block; }
    .a6b-hbtn {
      background: none; border: none; cursor: pointer; padding: 6px;
      color: #6B7280; border-radius: 8px; transition: color .15s, background .15s;
      display: flex; align-items: center; justify-content: center;
    }
    .a6b-hbtn:hover { color: #fff; background: rgba(255,255,255,0.07); }

    #a6b-msgs {
      flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      scroll-behavior: smooth;
    }
    #a6b-msgs::-webkit-scrollbar { width: 4px; }
    #a6b-msgs::-webkit-scrollbar-track { background: transparent; }
    #a6b-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

    .a6b-msg { display: flex; gap: 8px; max-width: 88%; }
    .a6b-msg.a6b-user { align-self: flex-end; flex-direction: row-reverse; }
    .a6b-msg.a6b-bot  { align-self: flex-start; }
    .a6b-avatar {
      width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
      background: linear-gradient(135deg, ${ACCENT}, #8B5CF6);
      display: flex; align-items: center; justify-content: center; margin-top: 2px;
    }
    .a6b-bubble {
      padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.55;
      word-break: break-word; white-space: pre-wrap;
    }
    .a6b-msg.a6b-user .a6b-bubble {
      background: linear-gradient(135deg, ${ACCENT}, #8B5CF6); color: #fff;
      border-bottom-right-radius: 4px;
    }
    .a6b-msg.a6b-bot .a6b-bubble {
      background: rgba(255,255,255,0.05); color: #E5E7EB;
      border: 1px solid rgba(255,255,255,0.08); border-bottom-left-radius: 4px;
    }
    .a6b-msg.a6b-error .a6b-bubble {
      background: rgba(239,68,68,0.1); color: #FCA5A5;
      border: 1px solid rgba(239,68,68,0.2); border-radius: 14px;
    }

    .a6b-dots { display: flex; gap: 4px; align-items: center; padding: 4px 0; }
    .a6b-dots span {
      width: 6px; height: 6px; border-radius: 50%; background: #6B7280;
      animation: a6b-bounce .9s infinite;
    }
    .a6b-dots span:nth-child(2) { animation-delay: .15s; }
    .a6b-dots span:nth-child(3) { animation-delay: .30s; }
    @keyframes a6b-bounce {
      0%,80%,100% { transform: translateY(0); }
      40%          { transform: translateY(-5px); }
    }

    #a6b-footer {
      padding: 12px; border-top: 1px solid rgba(255,255,255,0.08);
      display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0;
    }
    #a6b-input {
      flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 10px 13px; color: #E5E7EB; font-size: 13.5px;
      font-family: inherit; resize: none; outline: none; max-height: 96px;
      transition: border-color .15s; line-height: 1.45;
    }
    #a6b-input::placeholder { color: #4B5563; }
    #a6b-input:focus { border-color: ${ACCENT}88; }
    #a6b-send {
      width: 38px; height: 38px; border-radius: 10px; border: none; cursor: pointer;
      background: ${ACCENT}; color: #fff; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: opacity .15s, transform .15s;
    }
    #a6b-send:hover { opacity: .88; transform: scale(1.05); }
    #a6b-send:disabled { opacity: .4; cursor: not-allowed; transform: none; }
    #a6b-footer-note {
      text-align: center; font-size: 10.5px; color: #374151;
      padding: 0 12px 8px; flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);

  /* ── SVG icons ──────────────────────────────────────────────────── */
  const SVG = {
    bot:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    reset: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    send:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  };

  /* ── Build DOM ──────────────────────────────────────────────────── */
  // Floating button
  const btn = document.createElement('button');
  btn.id = 'a6b-btn';
  btn.innerHTML = `${SVG.bot} Talk to Us`;
  document.body.appendChild(btn);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'a6b-backdrop';
  document.body.appendChild(backdrop);

  // Panel
  const panel = document.createElement('div');
  panel.id = 'a6b-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', BOT_NAME);
  panel.innerHTML = `
    <div id="a6b-header">
      <div id="a6b-header-icon">${SVG.bot}</div>
      <div id="a6b-header-text">
        <div id="a6b-header-name">${BOT_NAME}</div>
        <div id="a6b-header-sub">${POWERED_BY}</div>
      </div>
      <button class="a6b-hbtn" id="a6b-reset" title="Reset chat">${SVG.reset}</button>
      <button class="a6b-hbtn" id="a6b-close" title="Close">${SVG.close}</button>
    </div>
    <div id="a6b-msgs"></div>
    <div id="a6b-footer">
      <textarea id="a6b-input" rows="1" placeholder="${PLACEHOLDER}"></textarea>
      <button id="a6b-send" title="Send">${SVG.send}</button>
    </div>
    <div id="a6b-footer-note">${BOT_NAME} · ${POWERED_BY} · Responses may not be perfectly accurate</div>
  `;
  document.body.appendChild(panel);

  /* ── State ──────────────────────────────────────────────────────── */
  let messages  = [];   // { role: 'user'|'assistant', content: string }[]
  let streaming = false;
  let abortCtrl = null;

  /* ── Helpers ────────────────────────────────────────────────────── */
  const msgsEl  = panel.querySelector('#a6b-msgs');
  const inputEl = panel.querySelector('#a6b-input');
  const sendBtn = panel.querySelector('#a6b-send');

  function scrollBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function renderMessages() {
    msgsEl.innerHTML = '';
    messages.forEach((m) => {
      const wrap = document.createElement('div');
      wrap.className = `a6b-msg ${m.role === 'user' ? 'a6b-user' : 'a6b-bot'}${m.error ? ' a6b-error' : ''}`;
      if (m.role === 'assistant') {
        wrap.innerHTML = `<div class="a6b-avatar">${SVG.bot}</div><div class="a6b-bubble">${escHtml(m.content)}</div>`;
      } else {
        wrap.innerHTML = `<div class="a6b-bubble">${escHtml(m.content)}</div>`;
      }
      msgsEl.appendChild(wrap);
    });
    scrollBottom();
  }

  function appendChunk(chunk) {
    if (messages.length === 0) return;
    messages[messages.length - 1].content += chunk;
    const bubbles = msgsEl.querySelectorAll('.a6b-bubble');
    if (bubbles.length > 0) {
      bubbles[bubbles.length - 1].textContent = messages[messages.length - 1].content;
      scrollBottom();
    }
  }

  function showTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'a6b-msg a6b-bot';
    wrap.id = 'a6b-typing';
    wrap.innerHTML = `<div class="a6b-avatar">${SVG.bot}</div><div class="a6b-bubble"><div class="a6b-dots"><span></span><span></span><span></span></div></div>`;
    msgsEl.appendChild(wrap);
    scrollBottom();
  }

  function hideTyping() {
    const t = panel.querySelector('#a6b-typing');
    if (t) t.remove();
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function setStreaming(val) {
    streaming = val;
    sendBtn.disabled = val;
    inputEl.disabled = val;
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
  }

  /* ── Open / Close ───────────────────────────────────────────────── */
  function openPanel() {
    panel.classList.add('a6b-open');
    backdrop.classList.add('a6b-open');
    btn.classList.add('a6b-hidden');
    if (messages.length === 0) addGreeting();
    setTimeout(() => inputEl.focus(), 200);
  }

  function closePanel() {
    panel.classList.remove('a6b-open');
    backdrop.classList.remove('a6b-open');
    btn.classList.remove('a6b-hidden');
  }

  function addGreeting() {
    messages = [{ role: 'assistant', content: GREETING }];
    renderMessages();
  }

  function resetChat() {
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
    setStreaming(false);
    messages = [];
    addGreeting();
    inputEl.value = '';
    autoResize();
    inputEl.focus();
  }

  /* ── Send message ───────────────────────────────────────────────── */
  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || streaming) return;

    messages.push({ role: 'user', content: text });
    messages.push({ role: 'assistant', content: '' });
    inputEl.value = '';
    autoResize();
    renderMessages();
    showTyping();
    setStreaming(true);

    abortCtrl = new AbortController();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(0, -1), ...(CLIENT_ID && { clientId: CLIENT_ID }) }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      hideTyping();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        appendChunk(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      hideTyping();
      if (err.name !== 'AbortError') {
        messages[messages.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', error: true };
        renderMessages();
      }
    } finally {
      setStreaming(false);
      abortCtrl = null;
    }
  }

  /* ── Event listeners ────────────────────────────────────────────── */
  btn.addEventListener('click', openPanel);
  backdrop.addEventListener('click', closePanel);
  panel.querySelector('#a6b-close').addEventListener('click', closePanel);
  panel.querySelector('#a6b-reset').addEventListener('click', resetChat);
  sendBtn.addEventListener('click', sendMessage);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  inputEl.addEventListener('input', autoResize);
})();
