// Injected by TizenBrew into https://www.tiktok.com/ on Samsung TV.
// 1) hides sponsored items  2) auto-scrolls to the next video when one ends
// 3) makes the TV remote work: Up/Down = prev/next, OK = play/pause, Left/Right = seek,
//    Red = toggle auto-scroll, Back = go back.
(function () {
  'use strict';

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
  function currentVideo() {
    var vids = document.querySelectorAll('video');
    var best = null, bestArea = 0, vh = window.innerHeight;
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      var visible = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (visible > bestArea) { bestArea = visible; best = vids[i]; }
    }
    return best;
  }

  function fireKey(key, code) {
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

  function nextVideo() {
    var now = Date.now();
    if (now - lastAdvance < 1200) return;
    lastAdvance = now;
    var btn = document.querySelector('[data-e2e="arrow-right"], button[aria-label*="next" i]');
    if (btn) { btn.click(); return; }
    fireKey('ArrowDown', 'ArrowDown');
    var v = currentVideo();
    if (v) {
      var c = closestEl(v, '[data-e2e="recommend-list-item-container"]') || v.parentElement;
      var n = c && c.nextElementSibling;
      if (n && n.scrollIntoView) n.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function prevVideo() {
    var btn = document.querySelector('[data-e2e="arrow-left"], button[aria-label*="previous" i]');
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
    v.currentTime = Math.max(0, Math.min(v.duration - 0.2, v.currentTime + delta));
    toast((delta > 0 ? '+' : '') + delta + 's');
  }

  // ---- auto-scroll: videos loop, so watch the clock instead of the ended event ----
  setInterval(function () {
    if (!autoScroll) return;
    var v = currentVideo();
    if (!v || v.paused || !isFinite(v.duration) || v.duration < 1) return;
    if (v.currentTime >= v.duration - 0.35) nextVideo();
  }, 250);

  document.addEventListener('ended', function (e) {
    if (autoScroll && e.target && e.target.tagName === 'VIDEO') nextVideo();
  }, true);

  // ---- remote control ----
  var KEYMAP = {
    38: prevVideo,                    // Up
    40: nextVideo,                    // Down
    37: function () { seek(-5); },    // Left
    39: function () { seek(5); },     // Right
    13: togglePlay,                   // OK / Enter
    415: togglePlay, 19: togglePlay, 10252: togglePlay, // Play, Pause, Play/Pause
    412: function () { seek(-10); },  // Rewind
    417: function () { seek(10); },   // Fast forward
    403: function () { autoScroll = !autoScroll; toast('Auto-scroll ' + (autoScroll ? 'ON' : 'OFF')); }, // Red
    10009: function () { // Back: history, else leave the app
      if (history.length > 1) { history.back(); return; }
      try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
    }
  };

  document.addEventListener('keydown', function (e) {
    var fn = KEYMAP[e.keyCode];
    if (!fn) return;
    var tag = (e.target && e.target.tagName) || '';
    if (e.keyCode !== 10009) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return; // typing
      if (onLoginPage()) return; // native focus navigation on the QR/login page
      if (e.keyCode === 13 && /^(BUTTON|A)$/.test(tag)) return; // OK activates focused control
    }
    e.preventDefault();
    e.stopPropagation();
    fn();
  }, true);

  try {
    if (window.tizen && tizen.tvinputdevice) {
      ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaRewind', 'MediaFastForward', 'ColorF0Red'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* key not available */ }
      });
    }
  } catch (e) { /* not on a TV */ }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addStyle);
  } else {
    addStyle();
  }

  // ---- easy QR login: go straight to TikTok's QR login page when not signed in ----
  function onLoginPage() { return /\/login/.test(location.pathname); }
  function loggedOut() {
    return !!document.querySelector('[data-e2e="top-login-button"], [data-e2e="nav-login-button"], button[id*="login" i]');
  }
  var qrStyle = document.createElement('style');
  qrStyle.textContent =
    '[data-e2e="qr-code"], [class*="QRCode" i], [class*="qrcode" i] canvas, [class*="qrcode" i] img, canvas[width] ' +
    '{ transform: scale(1.7); transform-origin: center top; margin: 80px auto; background: #fff; padding: 8px; }';
  var qrChecks = 0;
  var qrTimer = setInterval(function () {
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
  }, 1500);

  // ---- popup killer: no mouse on a TV, so dismiss every modal/banner. Never accepts anything. ----
  var POPUP_SEL = '[role="dialog"], [aria-modal="true"], [data-e2e*="modal" i], [data-e2e*="banner" i], ' +
    '[data-e2e*="cookie" i], [class*="Modal" i], [class*="DivModal" i], [class*="Banner" i], ' +
    '[class*="CookieBanner" i], [class*="DownloadApp" i], [class*="AppBanner" i], [class*="Overlay" i]';
  var DECLINE_RE = /^\s*(not now|skip|decline|cancel|close|no thanks|no,? thanks|maybe later|dismiss|later|don'?t allow|deny|reject( all)?|got it|x|×)\s*$/i;
  var NEVER_RE = /(allow|accept|agree|sync|connect contacts|find friends|enable|turn on|yes|continue|log ?in|sign ?up)/i;
  var POPUP_HINT_RE = /(contact|friends|cookie|download|get the app|notification|sync|liked)/i;
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
      var role = el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true';
      var text = (el.textContent || '').slice(0, 400);
      var cls = String(el.className || '') + ' ' + (el.getAttribute('data-e2e') || '');
      // generic class matches (Overlay/Banner/Modal) must also look like a prompt, to spare the feed UI
      if (!role && !POPUP_HINT_RE.test(text + ' ' + cls) && !/modal/i.test(cls)) continue;
      if (inQrArea(el)) continue;
      el.setAttribute('data-tvkilled', '1');
      var btns = el.querySelectorAll('button, [role="button"], a, [aria-label]');
      var clicked = false;
      for (var j = 0; j < btns.length && !clicked; j++) {
        var b = btns[j];
        var label = (b.getAttribute('aria-label') || '') + '';
        var bt = (b.textContent || '').replace(/^\s+|\s+$/g, '');
        if (NEVER_RE.test(bt) || NEVER_RE.test(label)) continue;
        if (DECLINE_RE.test(bt) || DECLINE_RE.test(label) || /close|dismiss/i.test(b.getAttribute('data-e2e') || '')) {
          try { b.click(); clicked = true; } catch (e) { /* try next */ }
        }
      }
      if (!clicked) { el.style.setProperty('display', 'none', 'important'); }
      if (document.body) { document.body.style.setProperty('overflow', 'auto', 'important'); }
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
    }
  }
  setInterval(function () { try { killPopups(); } catch (e) { /* never break the page */ } }, 500);

  // keep sound on and start playing if the TV browser blocks autoplay
  setInterval(function () {
    var v = currentVideo();
    if (v && v.paused && !v.getAttribute('data-user-paused') && v.readyState > 2) { safePlay(v); }
  }, 2000);
})();
