/* MiTV fetch service: Node.js Luna service that fetches a URL with the
   native HTTP stack (handles Transfer-Encoding: chunked, which the
   Chromium 38 browser XHR on this TV cannot) and returns the body.
   Called from the web app via webOS.service.request('luna://com.mitv.webos.fetch/fetch', {url}).
   Only allows the user's Xtream server host (and the pi3 test server). */
var Service = require('webos-service');
var http = require('http');
var https = require('https');
var urlLib = require('url');
/* El temporizador de inactividad debe caber en un entero de 32 bits de
   setTimeout (max ~2147483 s ~ 24,8 dias). Un valor mayor desborda y
   setTimeout dispara casi de inmediato, matando el servicio antes de que
   responda la primera peticion. 604800 s = 7 dias. */
var service = new Service('com.mitv.webos.fetch', null, { idleTimer: 604800 });

/* Hosts permitidos: pon aquí el host de TU servidor Xtream y, si lo usas,
   el de tu servidor local de pruebas. Sin esto el servicio rechaza la URL
   con "Host no permitido". El host real NO va en este repositorio. */
var ALLOWED_HOSTS = {
  'TU-SERVIDOR-XTREAM': true,
  'IP-DE-TU-SERVIDOR-DE-PRUEBAS': true
};

function isAllowed(u) {
  if (!u || !u.hostname) return false;
  return !!ALLOWED_HOSTS[u.hostname];
}

service.register('fetch', function (message) {
  var target = (message.payload && message.payload.url) || '';
  var timeoutMs = (message.payload && message.payload.timeout) || 30000;
  var parsed;
  try {
    parsed = urlLib.parse(target);
  } catch (e) {
    message.respond({ returnValue: false, errorText: 'URL invalida' });
    return;
  }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !isAllowed(parsed)) {
    message.respond({ returnValue: false, errorText: 'Host no permitido' });
    return;
  }
  var lib = parsed.protocol === 'https:' ? https : http;
  var req = lib.get({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.path || '/',
    headers: { 'User-Agent': 'MiTV-webOS/1.0', 'Accept': 'application/json, text/plain, */*' }
  }, function (res) {
    var chunks = [];
    var len = 0;
    res.on('data', function (c) { chunks.push(c); len += c.length; });
    res.on('end', function () {
      var body = Buffer.concat(chunks, len).toString('utf8');
      message.respond({ returnValue: true, status: res.statusCode, body: body });
    });
  });
  req.setTimeout(timeoutMs, function () {
    try { req.abort(); } catch (e) {}
    message.respond({ returnValue: false, errorText: 'Tiempo agotado' });
  });
  req.on('error', function (err) {
    message.respond({ returnValue: false, errorText: String(err && err.message || err) });
  });
});

service.register('ping', function (message) {
  message.respond({ returnValue: true, service: 'com.mitv.webos.fetch' });
});
