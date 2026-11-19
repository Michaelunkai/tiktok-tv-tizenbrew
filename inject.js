// Injected by TizenBrew into https://www.tiktok.com/ : hides sponsored/ad items in the feed.
(function () {
  var css = '[data-e2e*="ad" i], [class*="Sponsored" i], [class*="AdBadge" i] { display: none !important; }';
  function addStyle() {
    var s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addStyle);
  } else {
    addStyle();
  }
})();
