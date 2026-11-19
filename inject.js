// Injected by TizenBrew into https://www.tiktok.com/ on Samsung TV.
// 1) hides sponsored items  2) auto-scrolls to the next video when one ends
// 3) makes the TV remote work: Up/Down = prev/next, OK = play/pause, Left/Right = seek,
//    Red = toggle auto-scroll, Back = go back.
(function () {
  'use strict';

  var autoScroll = true;
  var lastAdvance = 0;

  // ---- sponsored items ----
  var css = '[data-e2e*="ad" i], [class*="Sponsored" i], [class*="AdBadge" i] { display: none !important; }' +
            '#tvtoast{position:fixed;top:24px;right:24px;z-index:2147483647;background:rgba(0,0,0,.8);color:#fff;' +
            'font:600 26px sans-serif;padding:12px 20px;border-radius:12px;display:none}';
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
    var opts = { key: key, code: code, keyCode: code === 'ArrowDown' ? 40 : 38, which: code === 'ArrowDown' ? 40 : 38, bubbles: true, cancelable: true };
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
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
      var c = v.closest('[data-e2e="recommend-list-item-container"]') || v.parentElement;
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
    if (v.paused) { delete v.dataset.userPaused; v.play(); toast('Play'); } else { v.dataset.userPaused = '1'; v.pause(); toast('Pause'); }
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
    10009: function () { history.back(); } // Back
  };

  document.addEventListener('keydown', function (e) {
    var fn = KEYMAP[e.keyCode];
    if (!fn) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA)$/.test(tag) && e.keyCode !== 10009) return; // let typing work (search / login)
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

  // keep sound on and start playing if the TV browser blocks autoplay
  setInterval(function () {
    var v = currentVideo();
    if (v && v.paused && !v.dataset.userPaused && v.readyState > 2) { v.play().catch(function () {}); }
  }, 2000);
})();
