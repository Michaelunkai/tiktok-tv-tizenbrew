// Injected by TizenBrew into https://www.tiktok.com/ on Samsung TV.
// 1) hides sponsored items  2) auto-scrolls to the next video when one ends
// 3) makes the TV remote work: Up/Down = prev/next, OK = play/pause, Left/Right = seek,
//    Red = toggle auto-scroll, Back = go back.
(function () {
  'use strict';

  // TizenBrew evaluates this on every execution context (iframes, reloads): run once, top frame only
  try { if (window.top && window.top !== window) return; } catch (eTop) { return; }
  if (window.__tvInject) return;
  window.__tvInject = true;

  var autoScroll = true;
  var lastAdvance = 0;

  // ---- sponsored items ----
  var css = '[data-e2e="ad"], [data-e2e^="ad-"], [data-e2e*="-ad-"], [data-e2e*="sponsor" i], [class*="Sponsored" i], [class*="AdBadge" i] { display: none !important; }' +
            '#tvtoast{position:fixed;top:24px;right:24px;z-index:2147483647;background:rgba(0,0,0,.8);color:#fff;' +
            'font:600 26px sans-serif;padding:12px 20px;border-radius:12px;display:none}' +
            'a:focus,button:focus,[role="button"]:focus,[tabindex]:focus,input:focus{outline:4px solid #25f4ee !important;outline-offset:2px}';
  function addStyle() {
    var s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function toast(msg) {
    var t = document.getElementById('tvtoast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'tvtoast';
      (document.body || document.documentElement).appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toast._h);
    toast._h = setTimeout(function () { t.style.display = 'none'; }, 1800);
  }

  // ---- helpers ----
  var AS = { v: null, src: '', lastT: 0, lastWall: 0, wall: 0,
             adv: false, advAt: 0, tries: 0, lastUserSeek: 0, mutedByUs: null };
  var AS_FALLBACK_SEC = 20, AS_GRACE_SEC = 4, AS_RETRY_MS = 2500, AS_MAX_TRIES = 6;

  function currentVideo() {
    var vids = document.querySelectorAll('video');
    var best = null, bestArea = 0, vh = window.innerHeight || 1080, vw = window.innerWidth || 1920;
    var playing = null;
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      var h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      var w = (typeof r.right === 'number' && typeof r.left === 'number') ? Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) : vw;
      var area = h * w;
      if (area > bestArea) { bestArea = area; best = vids[i]; }
      if (!playing && !vids[i].paused) { playing = vids[i]; }
    }
    return best || playing || vids[0] || null; // zero-size rects (odd layouts): still act on the first video
  }

  var firing = false;
  function fireKey(key, code) {
    firing = true;
    try { fireKeyInner(key, code); } finally { firing = false; }
  }
  function fireKeyInner(key, code) {
    var kc = code === 'ArrowDown' ? 40 : 38;
    var types = ['keydown', 'keyup'];
    for (var i = 0; i < types.length; i++) {
      var ev;
      try { ev = new KeyboardEvent(types[i], { key: key, code: code, bubbles: true, cancelable: true }); }
      catch (e) { ev = document.createEvent('Event'); ev.initEvent(types[i], true, true); }
      try {
        Object.defineProperty(ev, 'keyCode', { get: function () { return kc; } });
        Object.defineProperty(ev, 'which', { get: function () { return kc; } });
      } catch (e2) { /* read-only */ }
      document.dispatchEvent(ev);
    }
  }

  function closestEl(el, sel) {
    var m = el.matches || el.webkitMatchesSelector || el.msMatchesSelector;
    while (el && el.nodeType === 1) {
      if (m && m.call(el, sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function safePlay(v) {
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* blocked */ }
  }

  function scrollFeed(v) {
    var el = v && v.parentElement, h = window.innerHeight || 1080;
    while (el && el !== document.body && el !== document.documentElement) {
      var oy = '';
      try { oy = window.getComputedStyle(el).overflowY; } catch (e) { /* ignore */ }
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 10) {
        el.scrollTop = el.scrollTop + h;
        return;
      }
      el = el.parentElement;
    }
    window.scrollBy(0, h);
  }

  function nextVideo(method) {
    var m = (typeof method === 'number') ? method % 4 : 0;
    var now = Date.now();
    if (now - lastAdvance < 1200) return;
    lastAdvance = now;
    var v = currentVideo();
    if (m === 0) {
      var btn = null; try { btn = document.querySelector('[data-e2e="arrow-right"], button[aria-label*="next" i]'); } catch (eSel) { /* old Chromium: no [attr i] */ }
      if (btn) { btn.click(); return; }
      m = 1;
    }
    if (m === 1) { fireKey('ArrowDown', 'ArrowDown'); return; } // one mechanism per attempt: key AND scroll together double-advance
    if (m === 2) {
      var c = v && (closestEl(v, '[data-e2e="recommend-list-item-container"]') || v.parentElement);
      var n = c && c.nextElementSibling;
      if (n && n.scrollIntoView) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    }
    scrollFeed(v);
  }

  function prevVideo() {
    var btn = null; try { btn = document.querySelector('[data-e2e="arrow-left"], button[aria-label*="previous" i]'); } catch (eSel) { /* old Chromium */ }
    if (btn) { btn.click(); return; }
    fireKey('ArrowUp', 'ArrowUp');
  }

  function togglePlay() {
    var v = currentVideo();
    if (!v) return;
    if (v.paused) { v.removeAttribute('data-user-paused'); safePlay(v); toast('Play'); } else { v.setAttribute('data-user-paused', '1'); v.pause(); toast('Pause'); }
  }

  function seek(delta) {
    var v = currentVideo();
    if (!v || !isFinite(v.duration)) return;
    AS.lastUserSeek = Date.now();
    v.currentTime = Math.max(0, Math.min(v.duration - 0.2, v.currentTime + delta));
    toast((delta > 0 ? '+' : '') + delta + 's');
  }

  // ---- auto-scroll: videos loop, so watch the clock instead of the ended event ----
  function asReset(v, now) {
    AS.v = v; AS.src = v ? (v.currentSrc || v.src || '') : '';
    AS.lastT = v ? (v.currentTime || 0) : 0;
    AS.lastWall = now; AS.wall = 0;
    AS.adv = false; AS.tries = 0;
  }

  function asAdvance(now) {
    AS.adv = true; AS.advAt = now;
    nextVideo(AS.tries);
  }

  function asTick() {
    var now = Date.now();
    if (!autoScroll) { AS.v = null; return; }
    var v = currentVideo();
    var src = v ? (v.currentSrc || v.src || '') : '';
    if (v !== AS.v || src !== AS.src) { asReset(v, now); }
    var dtw = Math.min(now - AS.lastWall, 2000) / 1000;
    AS.lastWall = now;
    if (!v) return;
    try { if (v.loop) v.loop = false; } catch (e) { /* ignore */ }
    var t = v.currentTime;
    if (typeof t !== 'number' || t !== t) t = 0;
    var d = v.duration;
    if (typeof d !== 'number' || !isFinite(d) || d < 1) d = 0;
    var dt = t - AS.lastT;
    AS.lastT = t;
    if (v.getAttribute('data-user-paused')) return;
    AS.wall += dtw;

    if (AS.adv) {
      if (now - AS.advAt > AS_RETRY_MS) {
        AS.tries++;
        if (AS.tries > AS_MAX_TRIES) { asReset(v, now); return; }
        asAdvance(now);
      }
      return;
    }
    var wrapped = d && dt < -d * 0.5 && (now - AS.lastUserSeek) > 1500;
    var atEnd = d && !v.paused && t >= d - 0.35; // paused (user or blocked autoplay): only the wall timer may advance
    var timeout = AS.wall >= (d ? d * 1.25 : AS_FALLBACK_SEC) + AS_GRACE_SEC;
    if (wrapped || atEnd || timeout) asAdvance(now);
  }
  setInterval(function () { try { asTick(); } catch (e) { /* never break the page */ } }, 250);

  document.addEventListener('ended', function (e) {
    if (!autoScroll || AS.adv || !e.target || e.target.tagName !== 'VIDEO') return;
    if (e.target === currentVideo()) { asAdvance(Date.now()); }
  }, true);

  // ---- remote control ----
  // ---- always-visible diagnostic HUD (passive: never touches keys) ----
  var hudLast = { code: null, n: 0 };
  var hudBox = null;
  function hudRender() {
    try {
      var p = document.body || document.documentElement;
      if (!p) return;
      if (!hudBox || !hudBox.parentNode) {
        hudBox = document.getElementById('tvhud');
        if (!hudBox) {
          hudBox = document.createElement('div');
          hudBox.id = 'tvhud';
          hudBox.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:rgba(0,0,0,.85);color:#fff;' +
            'font:600 20px/1.3 monospace;white-space:pre;padding:8px 14px;border-radius:10px;pointer-events:none';
          p.appendChild(hudBox);
        }
      }
      var v = null, lo = false;
      try { v = currentVideo(); } catch (e1) { v = null; }
      try { lo = loggedOut(); } catch (e2) { lo = false; }
      hudBox.textContent = 'TV v1.3.3 | key ' + (hudLast.code === null ? '-' : hudLast.code + ' x' + hudLast.n) +
        ' | scroll ' + (autoScroll ? 'ON' : 'OFF') + ' | video ' + (v ? 'yes' : 'no') + ' | ' + (lo ? 'logged out' : 'in') + ' | ' + location.pathname;
    } catch (eHud) { /* never break the page */ }
  }
  try {
    window.addEventListener('keydown', function (e) { hudLast.code = e.keyCode; hudLast.n++; hudRender(); }, true);
    setInterval(hudRender, 700);
  } catch (eHud2) { /* ignore */ }

  var KEYMAP = {
    38: prevVideo,                    // Up
    40: nextVideo,                    // Down
    37: function () { seek(-5); },    // Left
    39: function () { seek(5); },     // Right
    13: togglePlay,                   // OK / Enter
    415: togglePlay, 19: togglePlay, 10252: togglePlay, // Play, Pause, Play/Pause
    412: function () { seek(-10); },  // Rewind
    417: function () { seek(10); },   // Fast forward
    404: function () { toast('Opening QR login...'); location.href = 'https://www.tiktok.com/login/qrcode'; }, // Green: QR login on demand
    405: function () { location.reload(); }, // Yellow: reload
    403: function () { autoScroll = !autoScroll; toast('Auto-scroll ' + (autoScroll ? 'ON' : 'OFF')); }, // Red
    10009: function () { // Back: ALWAYS straight to the TizenBrew screen (first history entry), no step-by-step walking
      var before = location.href;
      var leave = function () {
        try { tizen.application.getCurrentApplication().exit(); } catch (e) { try { window.close(); } catch (e2) { /* nothing left to do */ } }
      };
      if (history.length > 1) {
        history.go(1 - history.length);
        setTimeout(function () { if (location.href === before) leave(); }, 700); // still here: leave the app
        return;
      }
      leave();
    }
  };

  document.addEventListener('keydown', function (e) {
    if (firing) return; // our own synthetic ArrowUp/Down: never re-enter
    var fn = KEYMAP[e.keyCode];
    if (!fn) return;
    var tag = (e.target && e.target.tagName) || '';
    if (e.keyCode !== 10009) {
      if (e.keyCode >= 37 && e.keyCode <= 40 && !currentVideo()) return; // no feed on this page: leave native focus navigation alone
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return; // typing
      if (onLoginPage() && document.querySelector('a[href], button, input, [tabindex]')) return; // native focus navigation, only when something is focusable
      if (e.keyCode === 13 && (/^(BUTTON|A)$/.test(tag) || (e.target.getAttribute && (e.target.getAttribute('role') === 'button' || e.target.getAttribute('tabindex') !== null)))) return; // OK activates focused control
    }
    try { fn(); } catch (eKey) { return; } // never swallow a key we failed to act on
    e.preventDefault();
    e.stopPropagation();
  }, true);

  try {
    if (window.tizen && tizen.tvinputdevice) {
      ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaRewind', 'MediaFastForward', 'ColorF0Red'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* key not available */ }
      });
    }
  } catch (e) { /* not on a TV */ }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { toast('TikTok TV v1.3.3 ready'); }); } else { toast('TikTok TV v1.3.1 ready'); }

  if (document.documentElement) {
    addStyle();
  } else {
    document.addEventListener('DOMContentLoaded', addStyle);
  }

  // ---- easy QR login: go straight to TikTok's QR login page when not signed in ----
  function onLoginPage() { return /\/login/.test(location.pathname); }
  function loggedOut() {
    if (document.querySelector('[data-e2e="top-login-button"], [data-e2e="nav-login-button"], button[id*="login" i]')) return true;
    var bs = document.querySelectorAll('button, a[role="button"]');
    for (var i = 0; i < bs.length; i++) {
      if (/^\s*log ?in\s*$/i.test(bs[i].textContent || '')) return true;
    }
    return false;
  }
  var qrStyle = document.createElement('style');
  qrStyle.textContent =
    '[data-e2e="qr-code"], [class*="QRCode" i], [class*="qrcode" i] canvas, [class*="qrcode" i] img, canvas[width] ' +
    '{ transform: scale(1.7); transform-origin: center top; margin: 80px auto; background: #fff; padding: 8px; }';
  var qrChecks = 0;
  var qrTimer = setInterval(function () { try {
    qrChecks++;
    if (qrChecks > 40) { clearInterval(qrTimer); return; }
    if (onLoginPage()) {
      if (!qrStyle.parentNode) (document.head || document.documentElement).appendChild(qrStyle);
      var qrOpt = document.querySelector('[data-e2e="channel-item"][href*="qrcode"], a[href*="/login/qrcode"], [data-e2e="login-qr"]');
      if (qrOpt && !/qrcode/.test(location.pathname)) { qrOpt.click(); }
      if (!window.__qrToast) { window.__qrToast = true; toast('Scan the QR with the TikTok app on your phone: Profile, then the scan icon'); }
      return;
    }
    var done = false;
    try { done = !!sessionStorage.getItem('qrRedirected'); } catch (e) { done = !!window.__qrRedirected; }
    if (loggedOut() && !done) {
      window.__qrRedirected = true;
      try { sessionStorage.setItem('qrRedirected', '1'); } catch (e) { /* storage blocked */ }
      location.href = 'https://www.tiktok.com/login/qrcode';
    }
  } catch (eQr) { /* never break the page */ } }, 1500);

  // ---- popup killer: no mouse on a TV, so dismiss every modal/banner. Never accepts anything. ----
  var POPUP_SEL = '[role="dialog"], [aria-modal="true"], [data-e2e*="modal" i], [data-e2e*="banner" i], ' +
    '[data-e2e*="cookie" i], [class*="Modal" i], [class*="DivModal" i], [class*="Banner" i], ' +
    '[class*="CookieBanner" i], [class*="DownloadApp" i], [class*="AppBanner" i], [class*="Overlay" i]';
  var DECLINE_RE = /^\s*(not now|skip|decline|cancel|close|no thanks|no,? thanks|maybe later|dismiss|later|don'?t allow|deny|reject( all)?|got it|x|×|continue without log ?in|(decline|reject).*)\s*$/i;
  var NEVER_RE = /(allow|accept|agree|sync|connect contacts|find friends|enable|turn on|yes|continue|log ?in|sign ?up)/i;
  var POPUP_HINT_RE = /(contact|friends|cookie|download|get the app|notification|sync|liked|get more of what you love|without log ?in)/i;
  function inQrArea(el) {
    if (onLoginPage()) return true;
    return !!(el.querySelector && el.querySelector('[data-e2e="qr-code"], canvas, [class*="qrcode" i], [class*="QRCode" i]'));
  }
  function visibleEl(el) {
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
  }
  function killPopups() {
    if (onLoginPage()) return;
    var list = document.querySelectorAll(POPUP_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.getAttribute('data-tvkilled') || el.id === 'tvtoast' || !visibleEl(el)) continue;
      var text = (el.textContent || '').slice(0, 400);
      var cls = String(el.className || '') + ' ' + (el.getAttribute('data-e2e') || '');
      // generic class matches (Overlay/Banner/Modal) must also look like a prompt, to spare the feed UI
      if (!POPUP_HINT_RE.test(text + ' ' + cls)) continue;
      if (el.querySelector('[data-e2e*="recommend-list"]')) continue;
      if (el.querySelector('video, [data-e2e*="comment" i], [data-e2e*="search" i], input, textarea')) continue;
      if (inQrArea(el)) continue;
      el.setAttribute('data-tvkilled', '1');
      var btns = el.querySelectorAll('button, [role="button"], a, [aria-label]');
      var clicked = false;
      for (var j = 0; j < btns.length && !clicked; j++) {
        var b = btns[j];
        var label = (b.getAttribute('aria-label') || '') + '';
        var bt = (b.textContent || '').replace(/^\s+|\s+$/g, '');
        if ((NEVER_RE.test(bt) || NEVER_RE.test(label)) && !DECLINE_RE.test(bt) && !DECLINE_RE.test(label)) continue;
        if (DECLINE_RE.test(bt) || DECLINE_RE.test(label) || /close|dismiss/i.test(b.getAttribute('data-e2e') || '')) {
          try { b.click(); clicked = true; } catch (e) { /* try next */ }
        }
      }
      if (!clicked) { el.style.setProperty('display', 'none', 'important'); }
      if (document.body) { document.body.style.setProperty('overflow', 'auto', 'important'); }
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
    }
  }
  setInterval(function () { try { killPopups(); } catch (e) { /* never break the page */ } }, 1000);

  function mutedPlay(v) {
    try {
      v.muted = true; AS.mutedByUs = v;
      var q = v.play(); if (q && q.catch) q.catch(function () {});
    } catch (e) { /* blocked */ }
  }

  function forcePlay(v) {
    var p = null;
    try { p = v.play(); } catch (e) { mutedPlay(v); return; }
    if (p && p.catch) p.catch(function () { mutedPlay(v); });
  }

  function tryUnmute() {
    var v = AS.mutedByUs;
    if (!v || !v.muted) return;
    try { v.muted = false; } catch (e) { return; }
    setTimeout(function () {
      if (v.paused && !v.getAttribute('data-user-paused')) { mutedPlay(v); }
    }, 400);
  }
  document.addEventListener('keydown', tryUnmute, true);

  setInterval(function () {
    try {
      var v = currentVideo();
      if (v && v.paused && !v.getAttribute('data-user-paused')) { forcePlay(v); }
    } catch (e) { /* never break the page */ }
  }, 1500);

})();
