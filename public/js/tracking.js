const META_PIXEL_ID = '2310514779326152';

(function loadMetaPixel(w, d, s, u, n, t, e) {
  if (w.fbq) return;
  n = w.fbq = function() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  t = d.createElement(s);
  t.async = true;
  t.src = u;
  e = d.getElementsByTagName(s)[0];
  e.parentNode.insertBefore(t, e);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js'));

fbq('init', META_PIXEL_ID);
fbq('track', 'PageView');

function metaTrack(eventName, params = {}, options = {}) {
  if (!window.fbq) return;
  window.fbq('track', eventName, params, options);
}

function metaGetCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function metaGetTrackingData() {
  return {
    fbp: metaGetCookie('_fbp'),
    fbc: metaGetCookie('_fbc'),
    eventSourceUrl: window.location.href
  };
}

function metaGenerateEventId(prefix = 'meta') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

window.metaTrack = metaTrack;
window.metaGetTrackingData = metaGetTrackingData;
window.metaGenerateEventId = metaGenerateEventId;
