/*! control-center pixel. Usage:
 * <script defer src="https://YOUR-CONTROL-CENTER/px.js" data-site="project-slug"></script>
 * Optional: data-endpoint="https://.../api/collect", data-dev (track localhost too)
 */
(function () {
  var sc = document.currentScript;
  if (!sc) return;
  var site = sc.getAttribute("data-site");
  if (!site) return;
  var endpoint =
    sc.getAttribute("data-endpoint") || sc.src.replace(/\/px\.js.*$/, "/api/collect");
  if (
    sc.getAttribute("data-dev") === null &&
    /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)
  )
    return;

  var lastPath = null;
  function hit() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    var payload = JSON.stringify({
      s: site,
      h: location.hostname,
      p: location.pathname,
      r: document.referrer || null,
    });
    // A plain string body keeps this a "simple" CORS request (no preflight).
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, payload);
    else
      fetch(endpoint, { method: "POST", body: payload, keepalive: true }).catch(function () {});
  }

  var push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    hit();
  };
  var replace = history.replaceState;
  history.replaceState = function () {
    replace.apply(this, arguments);
    hit();
  };
  addEventListener("popstate", hit);
  hit();
})();
