/* MiTV webOS v1.0.0 — lógica de la app.
   ES5 estricto para Chromium 38 (webOS 3.x). NADA de arrow functions,
   const/let, template literals, módulos, clases, fetch nativo ni
   async/await. Solo var, function, concatenación y XMLHttpRequest.
   Réplica de MiTV Fire TV v1.0.22 (ver notes/firestick-spec.md). */

(function () {
  'use strict';

  /* ================= Constantes ================= */
  var KEY_LEFT = 37, KEY_UP = 38, KEY_RIGHT = 39, KEY_DOWN = 40;
  var KEY_OK = 13, KEY_BACK = 461, KEY_RED = 403, KEY_GREEN = 404;
  var KEY_YELLOW = 405, KEY_BLUE = 406, KEY_MENU_ALT = 462;
  var KEY_PLAY = 415, KEY_PAUSE = 19, KEY_FF = 417, KEY_RW = 412, KEY_STOP = 413;

  var UA = 'MiTV/1.0 (webOS)';
  var LS_PLAYLISTS = 'mitv.playlists';
  var LS_CONTENT = 'mitv.content';
  var LS_CREDS = 'mitv.creds'; /* Respaldo local de credenciales (DB8 denegado en esta TV). */
  var LS_FAVORITES = 'mitv.favorites';
  var LS_HISTORY = 'mitv.history';
  var LS_LASTSYNC = 'mitv.lastsync';
  var DB8_KIND = 'com.mitv.webos:1';
  var DB8_OWNER = 'com.mitv.webos';

  var PREVIEW_DWELL_MS = 600;
  var OSD_HIDE_MS = 5000;
  var PROGRESS_SAVE_MS = 5000;
  var RESUME_MIN_MS = 5000;
  var HISTORY_LIMIT = 15;
  var SEARCH_DEBOUNCE_MS = 200;
  var SEARCH_MIN_CHARS = 2;
  var SEARCH_MAX_CHANNELS = 30;
  var SEARCH_MAX_VOD = 40;
  var SEARCH_MAX_SERIES = 40;
  var LIST_WINDOW = 30;      /* filas visibles en listas virtuales */
  var GRID_COLS = 5;
  var GRID_WINDOW_ROWS = 6;  /* filas de parrilla renderizadas */

  var TABS = [
    { key: 'home', label: '\u2302 Inicio' },
    { key: 'live', label: '\uD83D\uDCFA TV en vivo' },
    { key: 'movies', label: '\uD83C\uDFAC Pel\u00edculas' },
    { key: 'series', label: '\uD83D\uDCDA Series' },
    { key: 'sports', label: '\u26BD Deportes' },
    { key: 'guide', label: '\uD83D\uDCC5 Gu\u00eda' },
    { key: 'settings', label: '\u2699\uFE0F Ajustes' },
    { key: 'search', label: '\uD83D\uDD0D Buscar' }
  ];

  var HELP_TEXT = {
    live: '\u2191\u2193 Cambiar de canal   \u00b7   OK Ver en pantalla completa   \u00b7   Rojo \u2605 Favorito   \u00b7   La vista previa arranca sola, en silencio',
    movies: '\u2190\u2192\u2191\u2193 Navegar   \u00b7   OK Ver ficha   \u00b7   Rojo Men\u00fa Opciones',
    series: '\u2190\u2192\u2191\u2193 Navegar   \u00b7   OK Ver ficha   \u00b7   Rojo Men\u00fa Opciones',
    settings: 'OK Seleccionar   \u00b7   \u21A9 Atr\u00e1s Volver',
    home: '\u2190\u2192\u2191\u2193 Navegar   \u00b7   OK Ver / Abrir   \u00b7   Rojo \u2605 Favorito y opciones   \u00b7   \u21A9 Atr\u00e1s Volver',
    guide: '\u2190\u2192\u2191\u2193 Navegar   \u00b7   OK Ver / Abrir   \u00b7   Rojo \u2605 Favorito y opciones   \u00b7   \u21A9 Atr\u00e1s Volver',
    search: '\u2190\u2192\u2191\u2193 Navegar   \u00b7   OK Ver / Abrir   \u00b7   Rojo \u2605 Favorito y opciones   \u00b7   \u21A9 Atr\u00e1s Volver',
    sports: '\u2191\u2193 Cambiar de canal   \u00b7   OK Ver en pantalla completa   \u00b7   Rojo \u2605 Favorito   \u00b7   La vista previa arranca sola, en silencio'
  };

  /* ================= Utilidades ================= */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) {
    s = (s === null || s === undefined) ? '' : String(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function hasClass(node, cls) {
    return node && (' ' + node.className + ' ').indexOf(' ' + cls + ' ') >= 0;
  }
  function addClass(node, cls) {
    if (node && !hasClass(node, cls)) node.className = (node.className ? node.className + ' ' : '') + cls;
  }
  function removeClass(node, cls) {
    if (!node) return;
    node.className = (' ' + node.className + ' ').replace(' ' + cls + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  /* Normalización insensible a acentos (mapa manual; no depende de
     String.normalize, que es ES2015). */
  var ACCENT_MAP = {
    '\u00E1': 'a', '\u00E0': 'a', '\u00E4': 'a', '\u00E2': 'a', '\u00E3': 'a', '\u00E5': 'a',
    '\u00E9': 'e', '\u00E8': 'e', '\u00EB': 'e', '\u00EA': 'e',
    '\u00ED': 'i', '\u00EC': 'i', '\u00EF': 'i', '\u00EE': 'i',
    '\u00F3': 'o', '\u00F2': 'o', '\u00F6': 'o', '\u00F4': 'o', '\u00F5': 'o',
    '\u00FA': 'u', '\u00F9': 'u', '\u00FC': 'u', '\u00FB': 'u',
    '\u00F1': 'n', '\u00E7': 'c',
    '\u00C1': 'a', '\u00C0': 'a', '\u00C4': 'a', '\u00C2': 'a', '\u00C3': 'a', '\u00C5': 'a',
    '\u00C9': 'e', '\u00C8': 'e', '\u00CB': 'e', '\u00CA': 'e',
    '\u00CD': 'i', '\u00CC': 'i', '\u00CF': 'i', '\u00CE': 'i',
    '\u00D3': 'o', '\u00D2': 'o', '\u00D6': 'o', '\u00D4': 'o', '\u00D5': 'o',
    '\u00DA': 'u', '\u00D9': 'u', '\u00DC': 'u', '\u00DB': 'u',
    '\u00D1': 'n', '\u00C7': 'c'
  };
  function norm(s) {
    s = (s === null || s === undefined) ? '' : String(s);
    var out = '';
    var i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      out += ACCENT_MAP[ch] ? ACCENT_MAP[ch] : ch.toLowerCase();
    }
    return out;
  }
  /* Normalización para el mapa de EPG: minúsculas y solo letras/dígitos
     (conserva los acentos, como el Firestick). */
  function normEpgName(s) {
    s = (s === null || s === undefined) ? '' : String(s).toLowerCase();
    var out = '';
    var i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch.charCodeAt(0) > 127) out += ch;
    }
    return out;
  }
  function fmtHMS(ms) {
    if (!ms || ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtClock(ms) {
    var d = new Date(ms);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtDateTime(ms) {
    var d = new Date(ms);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + fmtClock(ms);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================= Almacenamiento local (sin credenciales) ================= */
  function lsGet(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      if (v === null || v === undefined) return fallback;
      return JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin espacio */ }
  }

  /* ================= Toast ================= */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    removeClass(t, 'hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { addClass(t, 'hidden'); }, 2500);
  }

  /* ================= Detección webOS / DB8 (credenciales) ================= */
  function isWebOS() {
    return (typeof window.webOS !== 'undefined' && window.webOS && typeof window.webOS.service === 'object' && window.webOS.service);
  }
  /* Las credenciales Xtream viven SOLO en DB8 (luna://com.palm.db, kind
     privada: sobrevive a actualizaciones, se borra al desinstalar).
     NUNCA van a localStorage, al código ni a ningún archivo.
     Si no hay webOS (p. ej. probando en un navegador de escritorio), se
     guardan solo en memoria para la sesión y se avisa. */
  var CredStore = {
    mem: null,        /* {server, username, password} en memoria */
    persisted: false, /* true si se guardó en DB8 */
    db8ready: false,
    ensureKind: function (cb) {
      var self = this;
      if (!isWebOS()) { if (cb) cb(false); return; }
      if (self.db8ready) { if (cb) cb(true); return; }
      window.webOS.service.request('luna://com.palm.db', {
        method: 'putKind',
        parameters: {
          id: DB8_KIND, owner: DB8_OWNER,
          indexes: [{ name: 'server', props: [{ name: 'server' }] }],
          private: true
        },
        onSuccess: function () { self.db8ready = true; if (cb) cb(true); },
        onFailure: function () { if (cb) cb(false); }
      });
    },
    save: function (server, username, password, cb) {
      var self = this;
      self.mem = { server: server, username: username, password: password };
      self.persisted = false;
      /* Respaldo en localStorage (síncrono): DB8 está denegado en esta TV
         ("permission denied" al crear el kind) y su callback nunca llega,
         así que la clave se guarda aquí para que sobreviva al reinicio. */
      try { lsSet(LS_CREDS, { server: server, username: username, password: password }); self.persisted = true; } catch (e) {}
      if (!isWebOS()) { if (cb) cb(false); return; }
      self.ensureKind(function (ok) {
        if (!ok) { if (cb) cb(false); return; }
        /* Borra credenciales anteriores del mismo servidor y guarda la nueva. */
        window.webOS.service.request('luna://com.palm.db', {
          method: 'find',
          parameters: { from: DB8_KIND, where: [{ prop: 'server', op: '=', val: server }] },
          onSuccess: function (res) {
            var results = (res && res.results) || [];
            var i = 0;
            function delNext() {
              if (i >= results.length) { putNew(); return; }
              window.webOS.service.request('luna://com.palm.db', {
                method: 'del',
                parameters: { from: DB8_KIND, where: [{ prop: '_id', op: '=', val: results[i]._id }] },
                onSuccess: function () { i++; delNext(); },
                onFailure: function () { i++; delNext(); }
              });
            }
            function putNew() {
              window.webOS.service.request('luna://com.palm.db', {
                method: 'put',
                parameters: {
                  objects: [{ _kind: DB8_KIND, server: server, username: username, password: password }]
                },
                onSuccess: function () { self.persisted = true; if (cb) cb(true); },
                onFailure: function () { if (cb) cb(false); }
              });
            }
            delNext();
          },
          onFailure: function () { if (cb) cb(false); }
        });
      });
    },
    load: function (server, cb) {
      var self = this;
      if (self.mem && (!server || self.mem.server === server)) { if (cb) cb(self.mem); return; }
      /* Respaldo en localStorage (DB8 denegado en esta TV). */
      try {
        var stored = lsGet(LS_CREDS, null);
        if (stored && stored.password && (!server || stored.server === server)) {
          self.mem = { server: stored.server, username: stored.username, password: stored.password };
          if (cb) cb(self.mem); return;
        }
      } catch (e) {}
      if (!isWebOS()) { if (cb) cb(null); return; }
      self.ensureKind(function (ok) {
        if (!ok) { if (cb) cb(null); return; }
        var params = { from: DB8_KIND };
        if (server) params.where = [{ prop: 'server', op: '=', val: server }];
        window.webOS.service.request('luna://com.palm.db', {
          method: 'find',
          parameters: params,
          onSuccess: function (res) {
            var results = (res && res.results) || [];
            if (results.length > 0) {
              self.mem = { server: results[0].server, username: results[0].username, password: results[0].password };
              self.persisted = true;
              if (cb) cb(self.mem);
            } else if (cb) cb(null);
          },
          onFailure: function () { if (cb) cb(null); }
        });
      });
    }
  };

  /* Versión Promise de CredStore.load (para encadenar en la sincronización). */
  function loadCredPromise(server) {
    return new Promise(function (resolve) {
      CredStore.load(server, function (cred) { resolve(cred); });
    });
  }

  /* ================= HTTP (XHR; el User-Agent lo pone el sistema) ================= */
  /* Nota: en un navegador/webOS no se puede fijar la cabecera User-Agent
     (es una cabecera prohibida); la TV envía su propio User-Agent webOS.
     El servidor Xtream no exige un UA concreto. */
  /* Descarga nativa por el servicio Luna com.mitv.webos.fetch (codigo
     Node en la TV, sin servidor): baja la URL con el stack nativo
     (maneja chunked) y devuelve el cuerpo. El XHR del Chromium 38 se
     cuelga con chunked, por eso no se usa directo para URLs remotas. */
  var FETCH_SERVICE = 'luna://com.mitv.webos.fetch';
  function fetchViaService(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.webOS || !window.webOS.service || !window.webOS.service.request) {
        reject(new Error('Servicio webOS no disponible'));
        return;
      }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('Tiempo agotado (servicio)'));
      }, timeoutMs || 30000);
      try {
        window.webOS.service.request(FETCH_SERVICE, {
          method: 'fetch',
          parameters: { url: url, timeout: timeoutMs || 30000 },
          onSuccess: function (res) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (res && res.returnValue) resolve(res.body || '');
            else reject(new Error((res && res.errorText) || 'Error del servicio'));
          },
          onFailure: function (err) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new Error((err && (err.errorText || err.message)) || 'Fallo el servicio'));
          }
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }
  function httpGetText(url, timeoutMs) {
    /* XHR directo siempre: las respuestas grandes (EPG ~31 MB, VOD ~11 MB)
       superan el límite de tamaño de mensaje de LS2 y el servicio
       falla con "Message status unknown.". El servicio queda como respaldo. */
    var limit = timeoutMs || 120000;
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      var done = false;
      /* Tiempo límite manual: en webOS el xhr.timeout a veces no dispara
         y la petición se queda colgada para siempre. */
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { xhr.abort(); } catch (e) {}
        reject(new Error('Tiempo agotado'));
      }, limit);
      xhr.open('GET', url, true);
      xhr.timeout = limit;
      xhr.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
        else reject(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('Error de red'));
      };
      xhr.ontimeout = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('Tiempo agotado'));
      };
      xhr.send();
    }).catch(function (err) {
      /* Respaldo por el servicio nativo (solo webOS y URLs remotas). */
      if (isWebOS() && (url.indexOf('http://') === 0 || url.indexOf('https://') === 0)) {
        return fetchViaService(url, limit);
      }
      throw err;
    });
  }
  function httpGetJson(url, timeoutMs) {
    return httpGetText(url, timeoutMs).then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('Respuesta no es JSON'); }
      if (data && typeof data === 'object' && !isArray(data)) {
        var msg = data.message || data.error;
        if (msg) throw new Error('Panel: ' + msg);
      }
      return data;
    });
  }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function qenc(s) {
    /* Codificación de formulario: los espacios son '+'. */
    return encodeURIComponent(String(s)).replace(/%20/g, '+');
  }
  function penc(s) {
    /* Codificación de ruta: los espacios son '%20'. */
    return encodeURIComponent(String(s));
  }

  /* ================= API Xtream ================= */
  function xtreamBase(server) {
    server = String(server || '').replace(/\/+$/, '');
    return server;
  }
  function xtreamUrl(server, params) {
    var url = xtreamBase(server) + '/player_api.php?';
    var parts = [];
    var key;
    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        parts.push(qenc(key) + '=' + qenc(params[key]));
      }
    }
    return url + parts.join('&');
  }
  function xtreamAuth(server, username, password) {
    return httpGetJson(xtreamUrl(server, { username: username, password: password }), 20000)
      .then(function (data) {
        var ui = data && data.user_info;
        var auth = ui && (ui.auth === 1 || ui.auth === '1' || ui.auth === true);
        if (!auth) throw new Error('Panel: acceso denegado');
        return data;
      });
  }
  function xtreamList(server, username, password, action, extra) {
    var params = { username: username, password: password, action: action };
    var key;
    if (extra) {
      for (key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) params[key] = extra[key];
      }
    }
    return httpGetJson(xtreamUrl(server, params)).then(function (data) {
      if (!isArray(data)) return [];
      return data;
    });
  }
  function xtreamInfo(server, username, password, action, idParam, idValue) {
    var params = { username: username, password: password, action: action };
    params[idParam] = idValue;
    return httpGetJson(xtreamUrl(server, params));
  }
  function liveStreamUrl(server, username, password, streamId) {
    return xtreamBase(server) + '/live/' + penc(username) + '/' + penc(password) + '/' + penc(streamId) + '.m3u8';
  }
  function movieStreamUrl(server, username, password, streamId, ext) {
    return xtreamBase(server) + '/movie/' + penc(username) + '/' + penc(password) + '/' + penc(streamId) + '.' + penc(ext || 'mp4');
  }
  function episodeStreamUrl(server, username, password, epId, ext) {
    return xtreamBase(server) + '/series/' + penc(username) + '/' + penc(password) + '/' + penc(epId) + '.' + penc(ext || 'mp4');
  }

  /* ================= M3U ================= */
  function parseM3U(text) {
    var lines = String(text || '').split(/\r?\n/);
    var channels = [], movies = [], series = [];
    var i, line, name, url, group, logo, tvgId, attrs, m, item;
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (!line || line.indexOf('#EXTINF') !== 0) continue;
      attrs = {};
      var re = /([A-Za-z0-9\-_]+)="([^"]*)"/g;
      while ((m = re.exec(line)) !== null) { attrs[m[1]] = m[2]; }
      var comma = -1, inQuote = false, j;
      for (j = 0; j < line.length; j++) {
        if (line.charAt(j) === '"') inQuote = !inQuote;
        if (line.charAt(j) === ',' && !inQuote) { comma = j; break; }
      }
      name = comma >= 0 ? line.substring(comma + 1).replace(/^\s+|\s+$/g, '') : '';
      url = '';
      var k;
      for (k = i + 1; k < lines.length; k++) {
        var l2 = lines[k];
        if (!l2 || l2.charAt(0) === '#') continue;
        url = l2.replace(/^\s+|\s+$/g, '');
        i = k;
        break;
      }
      if (!name || !url) continue;
      if (name.indexOf('###') >= 0) continue;
      group = attrs['group-title'] || '';
      logo = attrs['tvg-logo'] || '';
      tvgId = attrs['tvg-id'] || '';
      var gLow = norm(group);
      var uLow = url.toLowerCase();
      if (gLow.indexOf('series') >= 0) {
        series.push({ name: name, cover: logo, serieId: '', category: group || 'Sin categoría', streamUrl: url, added: 0 });
      } else if (gLow.indexOf('movie') >= 0 || gLow.indexOf('film') >= 0 || gLow.indexOf('vod') >= 0 ||
                 gLow.indexOf('pelicula') >= 0 || gLow.indexOf('cine') >= 0 ||
                 uLow.indexOf('.mp4') === uLow.length - 4 || uLow.indexOf('.mkv') === uLow.length - 4) {
        movies.push({ name: name, logo: logo, streamUrl: url, category: group || 'Sin categoría', added: 0, streamId: '', year: extractYear(name, 0), rating: '', ext: 'mp4' });
      } else {
        channels.push({ name: name, logo: logo, streamUrl: url, group: group || 'Sin categoría', tvgId: tvgId, providerNum: '', hasCatchup: false, streamId: '', archiveDays: 0 });
      }
    }
    return { channels: channels, movies: movies, series: series };
  }
  function extractYear(name, added) {
    var m = String(name || '').match(/(19|20)\d{2}/);
    if (m) return parseInt(m[0], 10);
    if (added) return new Date(added * 1000).getUTCFullYear();
    return 0;
  }

  /* ================= EPG (XMLTV) ================= */
  /* Procesa el XMLTV completo en memoria (v1; no se persiste).
     Mapa: nombre normalizado -> id de canal; si un nombre coincide con
     varios ids, la entrada se marca ambigua y NO se usa. */
  var Epg = {
    channels: {},   /* id -> { programmes: [{start,end,title,desc,icon}], name } */
    nameMap: {},    /* nombre normalizado -> id (o '!AMBIG!') */
    meta: { totalProgrammes: 0, totalChannels: 0, totalAmbiguous: 0, fileSize: 0 },
    loaded: false,
    load: function (xmlText, playlist) {
      /* Parser ligero a prop\u00f3sito: el DOMParser con 31 MB (~90k
         programas) agota la memoria del renderer y mata la app.
         Solo se conservan los programas de los canales de la lista
         activa y dentro de una ventana \u00fatil (-12 h a +72 h). */
      var self = this;
      self.channels = {};
      self.nameMap = {};
      self.meta = { totalProgrammes: 0, totalChannels: 0, totalAmbiguous: 0, fileSize: xmlText ? xmlText.length : 0 };
      if (!xmlText) return;
      var i, id, dName, key, block, gt, closePos, pos;

      function attr(tagText, name) {
        var k = ' ' + name + '="';
        var at = tagText.indexOf(k);
        if (at < 0) return '';
        at += k.length;
        var endq = tagText.indexOf('"', at);
        return endq < 0 ? '' : tagText.substring(at, endq);
      }
      function decodeEntities(t) {
        if (!t || t.indexOf('&') < 0) return t || '';
        return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&#0*39;/g, "'").replace(/&amp;/g, '&');
      }
      function innerText(b, tag) {
        var o = b.indexOf('<' + tag);
        if (o < 0) return '';
        var g = b.indexOf('>', o);
        if (g < 0) return '';
        var c = b.indexOf('</' + tag + '>', g);
        if (c < 0) return '';
        return decodeEntities(b.substring(g + 1, c));
      }
      function innerAttr(b, tag, name) {
        var o = b.indexOf('<' + tag);
        if (o < 0) return '';
        var g = b.indexOf('>', o);
        if (g < 0) return '';
        return attr(b.substring(o, g + 1), name);
      }

      /* 1) Metadatos de canales (id y nombre visible -> id). */
      pos = 0;
      while ((pos = xmlText.indexOf('<channel', pos)) !== -1) {
        gt = xmlText.indexOf('>', pos);
        if (gt < 0) break;
        if (xmlText.charAt(gt - 1) === '/') { pos = gt + 1; continue; }
        closePos = xmlText.indexOf('</channel>', gt);
        if (closePos < 0) break;
        id = attr(xmlText.substring(pos, gt + 1), 'id');
        block = xmlText.substring(pos, closePos + 10);
        pos = closePos + 10;
        if (!id) continue;
        dName = innerText(block, 'display-name') || '';
        if (dName) {
          key = normEpgName(dName);
          if (key) {
            if (self.nameMap[key]) self.nameMap[key] = '!AMBIG!';
            else self.nameMap[key] = id;
          }
        }
        self.channels[id] = { programmes: [], name: dName || id };
        self.meta.totalChannels++;
      }

      /* 2) Ids de EPG que usa la lista activa (por tvgId o por nombre). */
      var allowed = null;
      if (playlist && playlist.length) {
        allowed = {};
        for (i = 0; i < playlist.length; i++) {
          var ch = playlist[i];
          if (!ch) continue;
          if (ch.tvgId && self.channels[ch.tvgId]) { allowed[ch.tvgId] = 1; continue; }
          key = normEpgName(ch.name);
          if (key && self.nameMap[key] && self.nameMap[key] !== '!AMBIG!' && self.channels[self.nameMap[key]]) {
            allowed[self.nameMap[key]] = 1;
          }
        }
      }

      /* 3) Programas: escaneo lineal, sin construir \u00e1rbol DOM. */
      var now = Date.now();
      var winStart = now - 12 * 3600000;
      var winEnd = now + 72 * 3600000;
      var MAX_DESC = 600;
      pos = 0;
      while ((pos = xmlText.indexOf('<programme', pos)) !== -1) {
        gt = xmlText.indexOf('>', pos);
        if (gt < 0) break;
        var tagText = xmlText.substring(pos, gt + 1);
        var chId = attr(tagText, 'channel');
        pos = gt + 1;
        var endTag = xmlText.indexOf('</programme>', pos);
        if (xmlText.charAt(gt - 1) === '/') continue;
        if (endTag < 0) break;
        if (!chId || !self.channels[chId] || (allowed && !allowed[chId])) { pos = endTag + 12; continue; }
        var startMs = parseXmltvTime(attr(tagText, 'start'));
        var stopMs = parseXmltvTime(attr(tagText, 'stop'));
        if (!startMs || !stopMs || stopMs <= winStart || startMs >= winEnd) { pos = endTag + 12; continue; }
        block = xmlText.substring(pos, endTag);
        pos = endTag + 12;
        var desc = innerText(block, 'desc');
        if (desc.length > MAX_DESC) desc = desc.substring(0, MAX_DESC);
        self.channels[chId].programmes.push({
          start: startMs, end: stopMs,
          title: innerText(block, 'title'),
          desc: desc,
          icon: innerAttr(block, 'icon', 'src')
        });
        self.meta.totalProgrammes++;
      }

      /* 4) Orden cronol\u00f3gico por canal (lookup usa b\u00fasqueda binaria). */
      var progs;
      for (key in self.channels) {
        if (!Object.prototype.hasOwnProperty.call(self.channels, key)) continue;
        progs = self.channels[key].programmes;
        if (progs.length > 1) progs.sort(function (a, b) { return a.start - b.start; });
      }

      var ambig = 0;
      var key2;
      for (key2 in self.nameMap) {
        if (Object.prototype.hasOwnProperty.call(self.nameMap, key2) && self.nameMap[key2] === '!AMBIG!') ambig++;
      }
      self.meta.totalAmbiguous = ambig;
      self.loaded = true;
    },
    lookup: function (name, tvgId) {
      /* Devuelve {start,end,title,desc,icon,hasEpg} del programa actual o
         la hora actual como referencia. Sin EPG -> hasEpg false. */
      var id = null;
      var now = Date.now();
      if (tvgId && this.channels[tvgId]) id = tvgId;
      else if (name) {
        var key = normEpgName(name);
        if (key && this.nameMap[key] && this.nameMap[key] !== '!AMBIG!') id = this.nameMap[key];
      }
      if (!id) return null;
      var entry = this.channels[id];
      if (!entry || !entry.programmes || entry.programmes.length === 0) return null;
      var progs = entry.programmes;
      /* Búsqueda binaria: primer programa con end > now. */
      var lo = 0, hi = progs.length - 1, ans = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (progs[mid].end > now) { ans = mid; hi = mid - 1; }
        else lo = mid + 1;
      }
      if (ans < 0) return null;
      var cur = progs[ans];
      var nxt = (ans + 1 < progs.length) ? progs[ans + 1] : null;
      if (cur.start <= now) {
        return {
          hasEpg: true,
          title: cur.title, desc: cur.desc, icon: cur.icon,
          startMs: cur.start, endMs: cur.end,
          nextTitle: nxt ? nxt.title : '', nextStartMs: nxt ? nxt.start : 0, nextEndMs: nxt ? nxt.end : 0
        };
      }
      /* No hay programa actual, pero sí uno futuro: devolverlo como próximo. */
      return {
        hasEpg: true,
        title: '', desc: '', icon: '',
        startMs: 0, endMs: 0,
        nextTitle: cur.title, nextStartMs: cur.start, nextEndMs: cur.end
      };
    }
  };
  function parseXmltvTime(s) {
    if (!s) return 0;
    s = String(s).replace(/^\s+|\s+$/g, '');
    var m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/);
    if (!m) return 0;
    var year = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1, day = parseInt(m[3], 10);
    var hour = parseInt(m[4], 10), min = parseInt(m[5], 10), sec = parseInt(m[6], 10);
    var ms = Date.UTC(year, month, day, hour, min, sec);
    if (m[7]) {
      var offMin = parseInt(m[8], 10) * 60 + parseInt(m[9], 10);
      if (m[7] === '+') offMin = -offMin;
      ms += offMin * 60000;
    }
    return ms;
  }

  /* ================= Estado y datos ================= */
  var State = {
    playlists: [],          /* {name, type, server, username, password, url, epgUrl, active} */
    activePlaylist: null,
    channels: [],           /* canales vivos (filtrados por grupo si aplica) */
    allChannels: [],
    liveCategories: [],
    movies: [],
    vodCategories: [],
    series: [],
    seriesCategories: [],
    favorites: {},          /* clave -> true */
    history: [],            /* WatchEntry[] más recientes primero */
    syncing: false,
    epgLoaded: false,
    isLoaded: false
  };
  function favKey(type, item) {
    if (type === 'live') return 'live|' + (item.streamUrl || '') + '|' + (item.name || '');
    if (type === 'movie') return 'movie|' + (item.streamUrl || '') + '|' + (item.name || '');
    if (type === 'series') return 'series|' + (item.streamUrl || '') + '|' + (item.name || '');
    return '';
  }
  function isFav(type, item) { return !!State.favorites[favKey(type, item)]; }
  function toggleFav(type, item) {
    var key = favKey(type, item);
    if (!key) return false;
    if (State.favorites[key]) delete State.favorites[key];
    else State.favorites[key] = true;
    lsSet(LS_FAVORITES, State.favorites);
    return !!State.favorites[key];
  }
  function saveHistory() { lsSet(LS_HISTORY, State.history); }
  function pushHistory(entry) {
    /* Últimos 15 por sección. */
    var i;
    for (i = State.history.length - 1; i >= 0; i--) {
      if (State.history[i].type === entry.type &&
          State.history[i].streamId === entry.streamId &&
          State.history[i].title === entry.title) {
        State.history.splice(i, 1);
      }
    }
    State.history.unshift(entry);
    /* Recorta a 15 por sección. */
    var counts = {};
    var kept = [];
    for (i = 0; i < State.history.length; i++) {
      var t = State.history[i].type;
      counts[t] = (counts[t] || 0) + 1;
      if (counts[t] <= HISTORY_LIMIT) kept.push(State.history[i]);
    }
    State.history = kept;
    saveHistory();
  }
  function getHistory(type) {
    var out = [], i;
    for (i = 0; i < State.history.length; i++) {
      if (State.history[i].type === type) out.push(State.history[i]);
    }
    return out;
  }
  function fracFor(item, type) {
    var i, e;
    for (i = 0; i < State.history.length; i++) {
      e = State.history[i];
      if (e.type === type && e.streamId === item.streamId && e.title === item.name) {
        return e.frac || 0;
      }
    }
    return 0;
  }
  function saveContent() {
    lsSet(LS_CONTENT, {
      channels: State.allChannels,
      liveCategories: State.liveCategories,
      movies: State.movies,
      vodCategories: State.vodCategories,
      series: State.series,
      seriesCategories: State.seriesCategories
    });
  }
  function loadContent() {
    var data = lsGet(LS_CONTENT, null);
    if (!data) return false;
    State.allChannels = data.channels || [];
    State.liveCategories = data.liveCategories || [];
    State.movies = data.movies || [];
    State.vodCategories = data.vodCategories || [];
    State.series = data.series || [];
    State.seriesCategories = data.seriesCategories || [];
    return true;
  }
  function savePlaylists() {
    /* Solo metadatos: las contraseñas NO se guardan aquí (están en DB8). */
    var copy = [];
    var i;
    for (i = 0; i < State.playlists.length; i++) {
      var p = State.playlists[i];
      copy.push({
        name: p.name, type: p.type, server: p.server, username: p.username,
        url: p.url, epgUrl: p.epgUrl, active: !!p.active
      });
    }
    lsSet(LS_PLAYLISTS, copy);
  }
  function loadPlaylists() {
    var list = lsGet(LS_PLAYLISTS, []);
    if (!isArray(list)) list = [];
    State.playlists = list;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].active) { State.activePlaylist = list[i]; break; }
    }
    if (!State.activePlaylist && list.length > 0) {
      State.activePlaylist = list[0];
      State.activePlaylist.active = true;
    }
    return list;
  }

  /* ================= Sincronización ================= */
  function syncAll(showMsg) {
    if (State.syncing) { if (showMsg) toast('Ya hay una sincronización en curso'); return Promise.resolve(false); }
    var pl = State.activePlaylist;
    if (!pl) { if (showMsg) toast('No hay listas'); return Promise.resolve(false); }
    State.syncing = true;
    if (showMsg) toast('Sincronizando…');
    var done = function (ok) {
      State.syncing = false;
      return ok;
    };
    if (pl.type === 'm3u') {
      return httpGetText(pl.url, 120000).then(function (text) {
        var parsed = parseM3U(text);
        State.allChannels = parsed.channels;
        State.movies = parsed.movies;
        State.series = parsed.series;
        State.liveCategories = [];
        State.vodCategories = [];
        State.seriesCategories = [];
        saveContent();
        State.isLoaded = true;
        if (showMsg) toast('Sincronización completada');
        return syncEpg().then(function () { return done(true); });
      }).catch(function (err) {
        if (showMsg) toast('Sincronización fallida: ' + (err && err.message ? err.message : err));
        return done(false);
      });
    }
    /* Xtream: las credenciales se leen de DB8 en el momento. */
    return loadCredPromise(pl.server).then(function (cred) {
      var username = cred ? cred.username : (pl.username || '');
      var password = cred ? cred.password : '';
      if (!username) {
        if (showMsg) toast('Faltan las credenciales de la lista');
        return done(false);
      }
      var server = pl.server;
      return xtreamAuth(server, username, password).then(function () {
        return Promise.all([
          xtreamList(server, username, password, 'get_live_categories'),
          xtreamList(server, username, password, 'get_live_streams'),
          xtreamList(server, username, password, 'get_vod_categories'),
          xtreamList(server, username, password, 'get_vod_streams'),
          xtreamList(server, username, password, 'get_series_categories'),
          xtreamList(server, username, password, 'get_series')
        ]);
      }).then(function (results) {
        State.liveCategories = results[0];
        State.allChannels = normalizeLive(results[1]);
        State.vodCategories = results[2];
        State.movies = normalizeVod(results[3]);
        State.seriesCategories = results[4];
        State.series = normalizeSeries(results[5]);
        saveContent();
        State.isLoaded = true;
        if (showMsg) toast('Sincronización completada');
        return syncEpg().then(function () { return done(true); });
      }).catch(function (err) {
        if (showMsg) toast('Sincronización fallida: ' + (err && err.message ? err.message : err));
        return done(false);
      });
    });
  }
  function normalizeLive(list) {
    var out = [], i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      var id = c.stream_id ? String(c.stream_id) : '';
      out.push({
        name: c.name || '', streamId: id, streamUrl: '',
        group: c.category_id || '', logo: c.stream_icon || '',
        tvgId: c.epg_channel_id || '', providerNum: c.num ? String(c.num) : '',
        hasCatchup: c.tv_archive === 1 || c.tv_archive === '1',
        archiveDays: c.tv_archive_duration ? parseInt(c.tv_archive_duration, 10) : 0
      });
    }
    return out;
  }
  function normalizeVod(list) {
    var out = [], i, m;
    for (i = 0; i < list.length; i++) {
      m = list[i];
      var id = m.stream_id ? String(m.stream_id) : '';
      var ext = m.container_extension || 'mp4';
      var added = m.added ? parseInt(m.added, 10) : 0;
      out.push({
        name: m.name || '', streamId: id, streamUrl: '',
        logo: m.stream_icon || '', category: m.category_id || '',
        year: m.year ? parseInt(m.year, 10) : extractYear(m.name, added),
        rating: m.rating ? String(m.rating) : '',
        added: added, ext: ext, duration: m.duration || ''
      });
    }
    return out;
  }
  function normalizeSeries(list) {
    var out = [], i, s;
    for (i = 0; i < list.length; i++) {
      s = list[i];
      var id = s.series_id ? String(s.series_id) : '';
      var lastMod = s.last_modified ? parseInt(s.last_modified, 10) : 0;
      out.push({
        name: s.name || '', serieId: id, cover: s.cover || '',
        category: s.category_id || '', added: lastMod,
        year: s.year ? parseInt(s.year, 10) : extractYear(s.name, lastMod),
        rating: s.rating ? String(s.rating) : '',
        episodes: s.episodes || null
      });
    }
    return out;
  }
  function syncEpg() {
    var pl = State.activePlaylist;
    if (!pl) return Promise.resolve(false);
    if (pl.type === 'xtream') {
      /* La contraseña se lee de DB8; el EPG se descarga tras la autenticación. */
      return loadCredPromise(pl.server).then(function (cred) {
        var username = cred ? cred.username : (pl.username || '');
        var password = cred ? cred.password : '';
        var epgUrl = xtreamBase(pl.server) + '/xmltv.php?username=' + qenc(username) + '&password=' + qenc(password);
        return httpGetText(epgUrl, 120000).then(function (text) {
          Epg.load(text, State.allChannels);
          State.epgLoaded = true;
          return true;
        }).catch(function () { return false; });
      });
    }
    var url = pl.epgUrl || '';
    if (!url) return Promise.resolve(false);
    return httpGetText(url, 120000).then(function (text) {
      Epg.load(text, State.allChannels);
      State.epgLoaded = true;
      return true;
    }).catch(function () { return false; });
  }

  /* ================= Marquesina universal ================= */
  /* Solo en el elemento enfocado y solo si el texto no cabe.
     40 dp/s (~80 px/s a 1080p), pausa 2 s al inicio, 5 s al final,
     regreso y repetición infinita. Se aplica a contenedores con
     clase "mq" cuyo hijo directo es un span.mq-in. */
  var Marquee = {
    timer: null, raf: null, el: null, inner: null, startTime: 0,
    phase: 'wait', phaseStart: 0, overflow: 0, x: 0, dir: 1,
    stop: function () {
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      if (this.inner) { this.inner.style.webkitTransform = 'translateX(0px)'; this.inner.style.transform = 'translateX(0px)'; }
      this.el = null; this.inner = null; this.phase = 'wait';
    },
    start: function (container) {
      var self = this;
      self.stop();
      if (!container) return;
      /* Busca el primer texto .mq que realmente no quepa (el propio
         contenedor o uno de sus descendientes). */
      var candidates = [];
      if (hasClass(container, 'mq')) candidates.push(container);
      var desc = container.querySelectorAll ? container.querySelectorAll('.mq') : [];
      var i;
      for (i = 0; i < desc.length; i++) candidates.push(desc[i]);
      var inner = null, overflow = 0, target = null;
      for (i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        var inn = cand.querySelector('.mq-in');
        if (!inn) continue;
        var ov = inn.scrollWidth - cand.clientWidth;
        if (ov > 4) { target = cand; inner = inn; overflow = ov; break; }
      }
      if (!target) return;
      self.el = target; self.inner = inner; self.overflow = overflow;
      self.phase = 'startPause'; self.phaseStart = Date.now(); self.x = 0;
      self.timer = setTimeout(function () { self._run(); }, 2000);
    },
    _run: function () {
      var self = this;
      self.phase = 'scroll'; self.phaseStart = Date.now();
      var last = Date.now();
      function tick() {
        var now = Date.now();
        var dt = now - last; last = now;
        if (self.phase === 'scroll') {
          self.x += (80 * dt) / 1000; /* ~40 dp/s = 80 px/s */
          if (self.x >= self.overflow) {
            self.x = self.overflow; self.phase = 'endPause'; self.phaseStart = now;
          }
          self.inner.style.webkitTransform = 'translateX(' + (-self.x) + 'px)';
          self.inner.style.transform = 'translateX(' + (-self.x) + 'px)';
        } else if (self.phase === 'endPause') {
          if (now - self.phaseStart >= 5000) { self.phase = 'return'; self.phaseStart = now; }
        } else if (self.phase === 'return') {
          self.x -= (80 * dt) / 1000;
          if (self.x <= 0) {
            self.x = 0; self.phase = 'startPause'; self.phaseStart = now;
            self.inner.style.webkitTransform = 'translateX(0px)';
            self.inner.style.transform = 'translateX(0px)';
            self.timer = setTimeout(function () { self._run(); }, 2000);
            self.raf = null;
            return;
          }
          self.inner.style.webkitTransform = 'translateX(' + (-self.x) + 'px)';
          self.inner.style.transform = 'translateX(' + (-self.x) + 'px)';
        }
        self.raf = requestAnimationFrame(tick);
      }
      self.raf = requestAnimationFrame(tick);
    }
  };
  function mqHtml(text) {
    return '<span class="mq-in">' + esc(text) + '</span>';
  }

  /* ================= Motor de foco ================= */
  /* Los elementos enfocables llevan clase "focusable" y atributos
     data-zone (tabs, cats, list, grid, preview, homerow, results,
     episodes, setrows, detailbtn, dialog, editor, playerbtn, searchfield)
     y data-idx (índice en su zona). Las parrillas llevan además
     data-row y data-col. La navegación es explícita por zona (como el
     Firestick): si no hay destino, el foco se queda donde está. */
  /* Visibilidad real: un elemento es visible si ni él ni ninguno de sus
     ancestros lleva la clase "hidden" (display:none) ni display:none
     en línea. (No se usa offsetParent: es null en jsdom y en elementos
     fixed, y no hace falta para detectar lo oculto aquí.) */
  function isVisible(el) {
    var n = el;
    while (n) {
      if (n.className && (' ' + n.className + ' ').indexOf(' hidden ') >= 0) return false;
      if (n.style && n.style.display === 'none') return false;
      n = n.parentNode;
    }
    return true;
  }
  var Focus = {
    current: null,
    set: function (el, noMarquee) {
      /* Si un campo estaba en edición (foco real) y nos movemos a otro
         elemento, se cierra el teclado: el foco real sigue al visual. */
      try {
        var ae = document.activeElement;
        if (ae && ae.tagName === 'INPUT' && ae !== el) ae.blur();
      } catch (e) {}
      if (this.current) removeClass(this.current, 'focused');
      this.current = el || null;
      Marquee.stop();
      if (el) {
        addClass(el, 'focused');
        if (el.scrollIntoView) {
          try { el.scrollIntoView(false); } catch (e) { /* no-op */ }
        }
        if (!noMarquee) {
          /* La marquesina busca dentro del elemento enfocado el primer
             texto que no quepa (o el propio elemento si es .mq). */
          Marquee.start(el);
        }
        /* Aviso a la pantalla activa para que reaccione al foco
           (p. ej. arrancar la vista previa al enfocar un canal). */
        if (typeof App !== 'undefined' && App.screen && App.screen.onFocus) {
          App.screen.onFocus(el);
        }
      }
    },
    clear: function () {
      if (this.current) removeClass(this.current, 'focused');
      this.current = null;
      Marquee.stop();
    },
    byZoneIdx: function (zone, idx) {
      var list = document.querySelectorAll('[data-zone="' + zone + '"][data-idx="' + idx + '"]');
      var i;
      for (i = 0; i < list.length; i++) {
        if (isVisible(list[i])) return list[i];
      }
      return null;
    },
    byZoneRowCol: function (zone, row, col) {
      var list = document.querySelectorAll('[data-zone="' + zone + '"][data-row="' + row + '"][data-col="' + col + '"]');
      var i;
      for (i = 0; i < list.length; i++) {
        if (isVisible(list[i])) return list[i];
      }
      return null;
    },
    firstInZone: function (zone) {
      return this.byZoneIdx(zone, 0);
    },
    countInZone: function (zone) {
      var list = document.querySelectorAll('[data-zone="' + zone + '"]');
      var n = 0, i;
      for (i = 0; i < list.length; i++) {
        if (isVisible(list[i])) n++;
      }
      return n;
    }
  };
  function zoneOf(el) { return el ? el.getAttribute('data-zone') : null; }
  function idxOf(el) { var v = el ? el.getAttribute('data-idx') : null; return v === null ? -1 : parseInt(v, 10); }
  function rowOf(el) { var v = el ? el.getAttribute('data-row') : null; return v === null ? -1 : parseInt(v, 10); }
  function colOf(el) { var v = el ? el.getAttribute('data-col') : null; return v === null ? -1 : parseInt(v, 10); }

  /* ================= Aplicación: pantalla actual y pestañas ================= */
  var App = {
    currentTab: 'home',
    screen: null,         /* pantalla activa (objeto de Screens) */
    dialogOpen: false,
    numBuffer: '', numTimer: null,
    showTab: function (tabKey, keepFocus) {
      var i, t;
      for (i = 0; i < TABS.length; i++) {
        if (TABS[i].key === tabKey) { App.currentTab = tabKey; break; }
      }
      /* Resalta la pestaña activa. */
      var tabs = document.querySelectorAll('#tabs .tab');
      for (i = 0; i < tabs.length; i++) {
        var k = tabs[i].getAttribute('data-tab');
        if (k === App.currentTab) addClass(tabs[i], 'selected');
        else removeClass(tabs[i], 'selected');
      }
      var scr = Screens[App.currentTab];
      App.screen = scr;
      if (scr && scr.render) scr.render();
      var help = HELP_TEXT[App.currentTab] || HELP_TEXT.home;
      var hb = $('helpbar');
      if (hb) hb.textContent = help;
      if (!keepFocus) {
        /* Foco inicial: la primera fila de contenido, o la pestaña si no hay. */
        var first = null;
        if (scr && scr.initialFocus) first = scr.initialFocus();
        if (!first) first = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        Focus.set(first);
      }
    },
    back: function () {
      if (App.dialogOpen) { Dialog.close(); return; }
      if (Player.isOpen) { Player.close(); return; }
      var scr = App.screen;
      if (scr && scr.onBack) { scr.onBack(); return; }
      /* Por defecto: subir de nivel (contenido -> pestaña, pestaña -> Inicio, Inicio -> salir). */
      var cur = Focus.current;
      if (!cur) { App.exit(); return; }
      var zone = zoneOf(cur);
      if (zone === 'tabs') {
        if (App.currentTab === 'home') App.exit();
        else App.showTab('home');
        return;
      }
      var tabEl = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
      Focus.set(tabEl);
    },
    menu: function () {
      /* Tecla menú / Rojo: acción contextual (favorito u opciones). */
      var scr = App.screen;
      if (scr && scr.onMenu) { scr.onMenu(); return; }
      var cur = Focus.current;
      if (!cur) return;
      var zone = zoneOf(cur);
      if (zone === 'list' || zone === 'grid' || zone === 'homerow') {
        if (scr && scr.toggleFavoriteAt) scr.toggleFavoriteAt(cur);
      }
    },
    exit: function () {
      if (isWebOS() && window.webOS && typeof window.webOS.platformBack === 'function') {
        try { window.webOS.platformBack(); return; } catch (e) { /* no-op */ }
      }
      /* Sin webOS (navegador de escritorio): vuelve a Inicio. */
      App.showTab('home');
    }
  };
  function tabIndex(key) {
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (TABS[i].key === key) return i;
    }
    return 0;
  }

  /* ================= Navegación por mando ================= */
  function moveFocus(dir) {
    var cur = Focus.current;
    if (!cur) {
      Focus.set(Focus.byZoneIdx('tabs', tabIndex(App.currentTab)));
      return;
    }
    /* Un campo de texto recibe las flechas para editar; solo Arriba sale
       a la pestaña y Abajo baja al primer resultado. */
    if (zoneOf(cur) === 'searchfield') {
      if (dir === KEY_UP) {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex(App.currentTab)));
      } else if (dir === KEY_DOWN) {
        var first = Focus.byZoneIdx('results', 0);
        if (first) Focus.set(first);
      }
      return;
    }
    var zone = zoneOf(cur);
    var idx = idxOf(cur);
    var row = rowOf(cur), col = colOf(cur);
    var target = null;
    var scr = App.screen;
    if (zone === 'tabs') {
      if (dir === KEY_LEFT && idx > 0) target = Focus.byZoneIdx('tabs', idx - 1);
      else if (dir === KEY_RIGHT && idx < TABS.length - 1) target = Focus.byZoneIdx('tabs', idx + 1);
      else if (dir === KEY_DOWN && scr && scr.initialFocus) target = scr.initialFocus();
    } else if (zone === 'cats') {
      var nCats = Focus.countInZone('cats');
      if (dir === KEY_UP) {
        if (idx === 0) target = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        else target = Focus.byZoneIdx('cats', idx - 1);
      } else if (dir === KEY_DOWN) {
        if (idx < nCats - 1) target = Focus.byZoneIdx('cats', idx + 1);
      } else if (dir === KEY_RIGHT && scr && scr.focusContentFromCat) {
        target = scr.focusContentFromCat(idx);
      }
    } else if (zone === 'list') {
      if (dir === KEY_UP) {
        if (idx === 0) target = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        else { if (scr && scr.ensureIndex) scr.ensureIndex('list', idx - 1); target = Focus.byZoneIdx('list', idx - 1); }
      } else if (dir === KEY_DOWN) {
        var total = (scr && scr.listTotal) ? scr.listTotal() : Focus.countInZone('list');
        if (idx + 1 < total) {
          if (scr && scr.ensureIndex) scr.ensureIndex('list', idx + 1);
          target = Focus.byZoneIdx('list', idx + 1);
        }
      } else if (dir === KEY_LEFT && scr && scr.focusCatFromList) {
        target = scr.focusCatFromList(idx);
      } else if (dir === KEY_RIGHT && scr && scr.focusPreviewFromList) {
        target = scr.focusPreviewFromList(idx);
      }
    } else if (zone === 'grid') {
      var nGrid = Focus.countInZone('grid');
      if (dir === KEY_UP) {
        if (row === 0) target = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        else {
          var upIdx = idx - GRID_COLS;
          if (upIdx >= 0) { if (scr && scr.ensureIndex) scr.ensureIndex('grid', upIdx); target = Focus.byZoneIdx('grid', upIdx); }
        }
      } else if (dir === KEY_DOWN) {
        var downIdx = idx + GRID_COLS;
        var gTotal = (scr && scr.gridTotal) ? scr.gridTotal() : nGrid;
        if (downIdx < gTotal) {
          if (scr && scr.ensureIndex) scr.ensureIndex('grid', downIdx);
          target = Focus.byZoneIdx('grid', downIdx);
        }
      } else if (dir === KEY_LEFT) {
        if (col === 0) { if (scr && scr.focusCatFromGrid) target = scr.focusCatFromGrid(idx); }
        else { if (scr && scr.ensureIndex) scr.ensureIndex('grid', idx - 1); target = Focus.byZoneIdx('grid', idx - 1); }
      } else if (dir === KEY_RIGHT) {
        var gTotalR = (scr && scr.gridTotal) ? scr.gridTotal() : nGrid;
        if (col < GRID_COLS - 1 && idx + 1 < gTotalR) {
          if (scr && scr.ensureIndex) scr.ensureIndex('grid', idx + 1);
          target = Focus.byZoneIdx('grid', idx + 1);
        }
      }
    } else if (zone === 'preview') {
      if (dir === KEY_LEFT && scr && scr.focusListFromPreview) target = scr.focusListFromPreview();
    } else if (zone === 'homerow') {
      var rowCount = Focus.countInZone('homerow');
      if (dir === KEY_LEFT && idx > 0) {
        target = Focus.byZoneRowCol('homerow', row, col - 1);
        if (!target) target = Focus.byZoneIdx('homerow', idx - 1);
      } else if (dir === KEY_RIGHT) {
        target = Focus.byZoneRowCol('homerow', row, col + 1);
        if (!target) target = Focus.byZoneIdx('homerow', idx + 1);
      } else if (dir === KEY_UP) {
        if (row === 0) target = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        else target = Focus.byZoneRowCol('homerow', row - 1, col);
      } else if (dir === KEY_DOWN) {
        target = Focus.byZoneRowCol('homerow', row + 1, col);
      }
    } else if (zone === 'setrows') {
      var nSet = Focus.countInZone('setrows');
      if (dir === KEY_UP) {
        if (idx === 0) target = Focus.byZoneIdx('tabs', tabIndex(App.currentTab));
        else target = Focus.byZoneIdx('setrows', idx - 1);
      } else if (dir === KEY_DOWN) {
        if (idx < nSet - 1) target = Focus.byZoneIdx('setrows', idx + 1);
      }
    } else if (zone === 'results') {
      var nRes = Focus.countInZone('results');
      if (dir === KEY_UP) {
        if (idx === 0) target = Focus.byZoneIdx('searchfield', 0);
        else target = Focus.byZoneIdx('results', idx - 1);
      } else if (dir === KEY_DOWN) {
        if (idx < nRes - 1) target = Focus.byZoneIdx('results', idx + 1);
      }
    } else if (zone === 'episodes') {
      var nEp = Focus.countInZone('episodes');
      if (dir === KEY_UP) {
        if (idx === 0) target = Focus.byZoneIdx('detailbtn', 0);
        else target = Focus.byZoneIdx('episodes', idx - 1);
      } else if (dir === KEY_DOWN) {
        if (idx < nEp - 1) target = Focus.byZoneIdx('episodes', idx + 1);
      }
    } else if (zone === 'detailbtn') {
      var nBtn = Focus.countInZone('detailbtn');
      if (dir === KEY_LEFT && idx > 0) target = Focus.byZoneIdx('detailbtn', idx - 1);
      else if (dir === KEY_RIGHT && idx < nBtn - 1) target = Focus.byZoneIdx('detailbtn', idx + 1);
      else if (dir === KEY_DOWN && scr && scr.focusEpisodesFromDetail) target = scr.focusEpisodesFromDetail();
    } else if (zone === 'dialog') {
      var nDlg = Focus.countInZone('dialog');
      if (dir === KEY_UP && idx > 0) target = Focus.byZoneIdx('dialog', idx - 1);
      else if (dir === KEY_DOWN && idx < nDlg - 1) target = Focus.byZoneIdx('dialog', idx + 1);
    } else if (zone === 'editor') {
      /* Navegación espacial: los botones Xtream/M3U están en fila horizontal
         (Izq/Der entre ellos, Abajo al primer campo); los campos son verticales. */
      var nEd = Focus.countInZone('editor');
      if (dir === KEY_LEFT) {
        if (idx === 1) target = Focus.byZoneIdx('editor', 0);
      } else if (dir === KEY_RIGHT) {
        if (idx === 0) target = Focus.byZoneIdx('editor', 1);
      } else if (dir === KEY_UP) {
        if (idx === 2) {
          /* Nombre -> botón del tipo actual. */
          var edType = 'xtream';
          if (typeof Screens !== 'undefined' && Screens.editor && Screens.editor.editing && Screens.editor.editing.type === 'm3u') edType = 'm3u';
          target = Focus.byZoneIdx('editor', edType === 'm3u' ? 1 : 0);
        } else if (idx > 2) {
          target = Focus.byZoneIdx('editor', idx - 1);
        }
      } else if (dir === KEY_DOWN) {
        if (idx === 0 || idx === 1) {
          target = Focus.byZoneIdx('editor', 2);
        } else if (idx < nEd - 1) {
          target = Focus.byZoneIdx('editor', idx + 1);
        }
      }
    } else if (zone === 'playerbtn') {
      var nPb = Focus.countInZone('playerbtn');
      if (dir === KEY_LEFT && idx > 0) target = Focus.byZoneIdx('playerbtn', idx - 1);
      else if (dir === KEY_RIGHT && idx < nPb - 1) target = Focus.byZoneIdx('playerbtn', idx + 1);
    }
    /* Regla de oro: si no hay destino, el foco se queda donde está. */
    if (target) Focus.set(target);
  }

  /* ================= Activación (OK) ================= */
  function activateFocused() {
    var cur = Focus.current;
    if (!cur) return;
    var zone = zoneOf(cur);
    if (zone === 'tabs') {
      var tabKey = cur.getAttribute('data-tab');
      if (tabKey) App.showTab(tabKey);
      return;
    }
    /* Un campo de texto: OK le da el foco real para abrir el teclado en pantalla. */
    if (cur.tagName === 'INPUT') {
      try { cur.focus(); } catch (e) {}
      return;
    }
    var scr = App.screen;
    if (scr && scr.onActivate) scr.onActivate(cur);
  }

  /* ================= Entrada de número de canal (directo) ================= */
  function numberKey(digit) {
    if (!App.screen || (App.screen.key !== 'live' && App.screen.key !== 'guide')) return;
    if (App.numTimer) clearTimeout(App.numTimer);
    App.numBuffer += String(digit);
    if (App.numBuffer.length > 5) App.numBuffer = App.numBuffer.substring(App.numBuffer.length - 5);
    toast('Canal ' + App.numBuffer);
    App.numTimer = setTimeout(function () {
      var n = parseInt(App.numBuffer, 10);
      App.numBuffer = '';
      if (App.screen && App.screen.jumpToNumber) App.screen.jumpToNumber(n);
    }, 1500);
  }

  /* ================= Manejador global de teclas ================= */
  function onKeyDown(e) {
    var key = e.keyCode || e.which;
    /* Si hay un diálogo abierto, solo él recibe las teclas. */
    if (App.dialogOpen) {
      if (key === KEY_UP || key === KEY_DOWN) { moveFocus(key); e.preventDefault(); return; }
      if (key === KEY_OK) { Dialog.activate(); e.preventDefault(); return; }
      if (key === KEY_BACK) { Dialog.close(); e.preventDefault(); return; }
      return;
    }
    if (Player.isOpen) { Player.onKey(key, e); return; }
    /* Modo edición: un campo de texto tiene el foco real (teclado abierto).
       Atrás sale de edición; Arriba/Abajo salen y se mueven; el resto lo
       escribe el campo/IME. */
    var activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
      if (key === KEY_BACK) {
        try { activeEl.blur(); } catch (e) {}
        e.preventDefault();
        return;
      }
      if (key === KEY_UP || key === KEY_DOWN) {
        try { activeEl.blur(); } catch (e) {}
        moveFocus(key);
        e.preventDefault();
        return;
      }
      if (key === KEY_OK) {
        /* OK en un campo: sale de edición y baja al siguiente campo
           (como Tab). En el último campo, baja a Guardar. */
        try { activeEl.blur(); } catch (e) {}
        moveFocus(KEY_DOWN);
        e.preventDefault();
        return;
      }
      return; /* el resto de teclas las escribe el campo/IME */
    }
    if (key === KEY_LEFT || key === KEY_UP || key === KEY_RIGHT || key === KEY_DOWN) {
      moveFocus(key);
      e.preventDefault();
      return;
    }
    if (key === KEY_OK) { activateFocused(); e.preventDefault(); return; }
    if (key === KEY_BACK) { App.back(); e.preventDefault(); return; }
    if (key === KEY_RED || key === KEY_MENU_ALT) { App.menu(); e.preventDefault(); return; }
    if (key >= 48 && key <= 57) { numberKey(key - 48); e.preventDefault(); return; }
    if (key === KEY_PLAY || key === KEY_PAUSE) {
      /* En una lista con preview: pausa/reanuda la vista previa. */
      if (Player.previewPaused) Player.resumePreview();
      else Player.pausePreview();
      e.preventDefault();
      return;
    }
  }

  /* ================= Reproductor: UN SOLO <video> ================= */
  /* El mismo elemento <video> sirve para la vista previa y para el
     reproductor a pantalla completa: se mueve de un contenedor al otro
     (reparentado) y se cambia su src con load(). La pantalla completa
     es un overlay CSS, no la API Fullscreen. */
  var Player = {
    video: null,
    isOpen: false,
    previewPaused: false,
    currentItem: null, currentType: null,
    previewChannel: null,
    previewTimer: null,
    osdTimer: null,
    progressTimer: null,
    aspectIdx: 1,
    aspectModes: ['Original', 'Ajustar', 'Llenar', 'Zoom', 'Estirar'],
    init: function () {
      this.video = $('video');
      var self = this;
      this.video.addEventListener('waiting', function () { self.showSpinner(true); });
      this.video.addEventListener('playing', function () { self.showSpinner(false); });
      this.video.addEventListener('canplay', function () { self.showSpinner(false); });
      this.video.addEventListener('ended', function () { self.onEnded(); });
      this.video.addEventListener('timeupdate', function () { self.onTimeUpdate(); });
      this.video.addEventListener('error', function () { self.showSpinner(false); });
    },
    showSpinner: function (show) {
      var sp = $('spinner');
      if (sp) { if (show) removeClass(sp, 'hidden'); else addClass(sp, 'hidden'); }
    },
    /* --- Vista previa (silenciada, en la columna de preview) --- */
    requestPreview: function (channel) {
      /* Dwell de 600 ms: solo arranca si el foco sigue en el canal. */
      var self = this;
      if (this.previewTimer) clearTimeout(this.previewTimer);
      this.previewChannel = channel;
      this.previewTimer = setTimeout(function () {
        self.startPreview(channel);
      }, PREVIEW_DWELL_MS);
    },
    startPreview: function (channel) {
      if (!channel) return;
      if (this.isOpen) return;
      var box = $('previewVidBox');
      if (!box) return;
      var self = this;
      var go = function (url) {
        if (!url || self.isOpen) return;
        self.attachTo(box);
        self.video.muted = true;
        self.video.volume = 1;
        self.setSource(url);
        self.previewPaused = false;
      };
      if (channel.streamUrl) go(channel.streamUrl);
      else this.resolveLiveStream(channel, function (url) { if (url) go(url); });
    },
    pausePreview: function () {
      if (this.isOpen || !this.previewChannel) return;
      if (this.video) { this.video.pause(); this.previewPaused = true; }
    },
    resumePreview: function () {
      if (this.isOpen || !this.previewChannel) return;
      if (this.video) { this.video.play(); this.previewPaused = false; }
    },
    stopPreview: function () {
      if (this.previewTimer) clearTimeout(this.previewTimer);
      this.previewChannel = null;
      if (!this.isOpen && this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
    },
    /* --- Pantalla completa --- */
    open: function (item, type) {
      this.currentItem = item;
      this.currentType = type;
      this.isOpen = true;
      if (this.previewTimer) clearTimeout(this.previewTimer);
      var wrap = $('playerVidWrap');
      if (wrap) this.attachTo(wrap);
      removeClass($('player'), 'hidden');
      this.video.muted = false;
      this.video.volume = 1;
      var self0 = this;
      if (type === 'live' && !item.streamUrl) {
        /* La URL de un canal en vivo se construye con las credenciales de
           DB8 en el momento de abrir; normalizeLive no las tiene. */
        this.resolveLiveStream(item, function (url) {
          if (url) { item.streamUrl = url; self0.setSource(url); }
        });
      } else {
        this.setSource(item.streamUrl);
      }
      /* Reanudar si la posición guardada supera 5 s. */
      var frac = fracFor(item, type);
      var resumeMs = 0;
      if (type !== 'live' && frac > 0 && frac < 0.95) {
        var dur = this.video.duration;
        if (dur && isFinite(dur)) resumeMs = frac * dur * 1000;
      }
      var self2 = this;
      var tryResume = function () {
        if (resumeMs > RESUME_MIN_MS && self2.video.duration && isFinite(self2.video.duration)) {
          self2.video.currentTime = resumeMs / 1000;
        }
        self2.video.removeEventListener('loadedmetadata', tryResume);
      };
      this.video.addEventListener('loadedmetadata', tryResume);
      this.renderOsd();
      this.showOsd();
      this.startProgressTimer();
      /* Registrar en el historial. */
      pushHistory({
        type: type,
        title: item.name || '',
        streamId: item.streamId || item.serieId || '',
        logo: item.logo || item.cover || '',
        category: item.group || item.category || '',
        frac: frac || 0,
        posMs: resumeMs,
        durMs: 0,
        watched: false
      });
      this.focusPlayBtn();
    },
    close: function () {
      this.saveProgress(true);
      this.isOpen = false;
      this.stopProgressTimer();
      this.hideOsd();
      addClass($('player'), 'hidden');
      this.video.pause();
      /* Vuelve a la vista previa si hay un canal activo. */
      if (this.previewChannel) this.startPreview(this.previewChannel);
      else { this.video.removeAttribute('src'); this.video.load(); }
      /* Devuelve el foco a la pantalla que estaba activa. */
      var scr = App.screen;
      if (scr && scr.restoreFocus) scr.restoreFocus();
      else if (scr && scr.initialFocus) Focus.set(scr.initialFocus());
    },
    attachTo: function (container) {
      if (!container || !this.video) return;
      if (this.video.parentNode !== container) container.appendChild(this.video);
    },
    setSource: function (url) {
      if (!url) return;
      this.video.src = url;
      this.video.load();
      var p = this.video.play();
      if (p && typeof p.catch === 'function') { p.catch(function () { /* autoplay bloqueado, se reintenta con OK */ }); }
    },
    resolveLiveStream: function (item, cb) {
      var pl = State.activePlaylist;
      if (!pl || !item) { cb(null); return; }
      if (item.streamUrl) { cb(item.streamUrl); return; }
      if (pl.type !== 'xtream') { cb(null); return; }
      loadCredPromise(pl.server).then(function (cred) {
        var username = cred ? cred.username : (pl.username || '');
        var password = cred ? cred.password : '';
        if (!username) { cb(null); return; }
        cb(liveStreamUrl(pl.server, username, password, item.streamId));
      });
    },
    /* --- Progreso (VOD) --- */
    startProgressTimer: function () {
      var self = this;
      this.stopProgressTimer();
      this.progressTimer = setInterval(function () { self.saveProgress(false); }, PROGRESS_SAVE_MS);
    },
    stopProgressTimer: function () {
      if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null; }
    },
    saveProgress: function (final) {
      if (this.currentType === 'live' || !this.currentItem || !this.video) return;
      var dur = this.video.duration;
      var pos = this.video.currentTime;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      var frac = pos / dur;
      var i, e;
      for (i = 0; i < State.history.length; i++) {
        e = State.history[i];
        if (e.type === this.currentType && e.streamId === (this.currentItem.streamId || this.currentItem.serieId || '') &&
            e.title === this.currentItem.name) {
          e.frac = frac;
          e.posMs = Math.round(pos * 1000);
          e.durMs = Math.round(dur * 1000);
          e.watched = frac >= 0.95;
          saveHistory();
          break;
        }
      }
    },
    onEnded: function () {
      if (this.currentType === 'live') return;
      this.saveProgress(true);
      /* Marca como visto (posición 1000/1000). */
      var i, e;
      for (i = 0; i < State.history.length; i++) {
        e = State.history[i];
        if (e.type === this.currentType && e.streamId === (this.currentItem.streamId || this.currentItem.serieId || '') &&
            e.title === this.currentItem.name) {
          e.frac = 1; e.posMs = 1000; e.durMs = 1000; e.watched = true;
          saveHistory();
          break;
        }
      }
      toast('Visto');
    },
    onTimeUpdate: function () {
      if (!this.isOpen) return;
      var bar = $('osdSeekFill');
      var t = $('osdTime');
      var v = this.video;
      if (v.duration && isFinite(v.duration) && v.duration > 0) {
        var pct = (v.currentTime / v.duration) * 100;
        if (bar) bar.style.width = pct + '%';
        if (t) t.textContent = fmtHMS(v.currentTime * 1000) + ' / ' + fmtHMS(v.duration * 1000);
      } else if (t) {
        t.textContent = fmtHMS(v.currentTime * 1000);
      }
    },
    /* --- OSD --- */
    renderOsd: function () {
      var item = this.currentItem || {};
      var type = this.currentType;
      var title = $('osdTitle');
      if (title) title.textContent = item.name || '';
      var sub = $('osdSub');
      if (sub) {
        if (type === 'live') {
          var epg = Epg.lookup(item.name, item.tvgId);
          sub.textContent = epg && epg.title ? epg.title : '';
        } else {
          sub.textContent = item.year ? String(item.year) : '';
        }
      }
      var row = $('osdButtons');
      if (row) {
        var isLive = type === 'live';
        /* Índices contiguos (data-action manda); en vivo no hay ±10 s. */
        var btns = [];
        if (!isLive) btns.push({ action: 'seek-10', label: '-10 s' });
        btns.push({ action: 'play', label: 'Pausa' });
        if (!isLive) btns.push({ action: 'seek+10', label: '+10 s' });
        btns.push({ action: 'aspect', label: 'Aspecto' });
        btns.push({ action: 'audio', label: 'Audio' });
        btns.push({ action: 'subs', label: 'Subt\u00edtulos' });
        btns.push({ action: 'back', label: 'Atr\u00e1s' });
        var html = '';
        var i;
        for (i = 0; i < btns.length; i++) {
          html += '<div class="btn focusable" data-zone="playerbtn" data-idx="' + i + '" data-action="' + btns[i].action + '">' + esc(btns[i].label) + '</div>';
        }
        row.innerHTML = html;
      }
    },
    showOsd: function () {
      var osd = $('osd');
      if (osd) removeClass(osd, 'hidden');
      var self = this;
      if (this.osdTimer) clearTimeout(this.osdTimer);
      this.osdTimer = setTimeout(function () { self.hideOsd(); }, OSD_HIDE_MS);
    },
    hideOsd: function () {
      var osd = $('osd');
      if (osd) addClass(osd, 'hidden');
      if (this.osdTimer) { clearTimeout(this.osdTimer); this.osdTimer = null; }
    },
    osdVisible: function () {
      var osd = $('osd');
      return osd && !hasClass(osd, 'hidden');
    },
    togglePlay: function () {
      if (!this.video) return;
      if (this.video.paused) { this.video.play(); }
      else { this.video.pause(); }
      var btn = this.playBtn();
      if (btn) btn.textContent = this.video.paused ? 'Reproducir' : 'Pausa';
    },
    playBtn: function () {
      var list = document.querySelectorAll('[data-zone="playerbtn"][data-action="play"]');
      var i;
      for (i = 0; i < list.length; i++) {
        if (isVisible(list[i])) return list[i];
      }
      return null;
    },
    focusPlayBtn: function () {
      var btn = this.playBtn();
      if (btn) Focus.set(btn);
    },
    seekBy: function (sec) {
      if (!this.video || this.currentType === 'live') return;
      var t = this.video.currentTime + sec;
      if (t < 0) t = 0;
      if (this.video.duration && isFinite(this.video.duration) && t > this.video.duration) t = this.video.duration;
      this.video.currentTime = t;
      this.showOsd();
    },
    cycleAspect: function () {
      this.aspectIdx = (this.aspectIdx + 1) % this.aspectModes.length;
      var mode = this.aspectModes[this.aspectIdx];
      var v = this.video;
      if (!v) return;
      if (mode === 'Original') { v.style.objectFit = 'none'; v.style.webkitTransform = ''; v.style.transform = ''; }
      else if (mode === 'Ajustar') { v.style.objectFit = 'contain'; v.style.webkitTransform = ''; v.style.transform = ''; }
      else if (mode === 'Llenar') { v.style.objectFit = 'cover'; v.style.webkitTransform = ''; v.style.transform = ''; }
      else if (mode === 'Zoom') { v.style.objectFit = 'contain'; v.style.webkitTransform = 'scale(1.25)'; v.style.transform = 'scale(1.25)'; }
      else if (mode === 'Estirar') { v.style.objectFit = 'fill'; v.style.webkitTransform = ''; v.style.transform = ''; }
      toast('Aspecto: ' + mode);
    },
    showTracksDialog: function (kind) {
      /* Audio/subtítulos: mejor esfuerzo con las pistas del elemento video.
         En HLS nativo de webOS 3.x las pistas pueden no exponerse; en ese
         caso se muestra "Sin pistas disponibles". */
      var v = this.video;
      var items = [];
      var i;
      if (kind === 'audio') {
        var at = v.audioTracks;
        if (at) {
          for (i = 0; i < at.length; i++) items.push({ label: at[i].label || ('Audio ' + (i + 1)), idx: i });
        }
      } else {
        var tt = v.textTracks;
        if (tt) {
          for (i = 0; i < tt.length; i++) items.push({ label: tt[i].label || ('Subt\u00edtulo ' + (i + 1)), idx: i });
        }
      }
      if (items.length === 0) { toast(kind === 'audio' ? 'Sin pistas de audio' : 'Sin subt\u00edtulos'); return; }
      var labels = [];
      for (i = 0; i < items.length; i++) labels.push(items[i].label);
      var self = this;
      Dialog.show(kind === 'audio' ? 'Audio' : 'Subt\u00edtulos', labels, function (idx) {
        if (kind === 'audio') {
          var at2 = v.audioTracks;
          if (at2) {
            for (var j = 0; j < at2.length; j++) at2[j].enabled = (j === idx);
          }
        } else {
          var tt2 = v.textTracks;
          if (tt2) {
            for (var j2 = 0; j2 < tt2.length; j2++) tt2[j2].mode = (j2 === idx) ? 'showing' : 'disabled';
          }
        }
      });
    },
    onKey: function (key, e) {
      var self = this;
      if (key === KEY_BACK) { this.close(); e.preventDefault(); return; }
      if (key === KEY_PLAY || key === KEY_PAUSE) { this.togglePlay(); this.showOsd(); e.preventDefault(); return; }
      if (!this.osdVisible()) {
        /* Cualquier tecla de dirección muestra el OSD y enfoca Pausa. */
        if (key === KEY_LEFT || key === KEY_UP || key === KEY_RIGHT || key === KEY_DOWN || key === KEY_OK) {
          this.showOsd();
          this.focusPlayBtn();
          e.preventDefault();
          return;
        }
        return;
      }
      if (key === KEY_LEFT || key === KEY_UP || key === KEY_RIGHT || key === KEY_DOWN) {
        moveFocus(key);
        this.showOsd();
        e.preventDefault();
        return;
      }
      if (key === KEY_OK) {
        var cur = Focus.current;
        var action = cur ? cur.getAttribute('data-action') : null;
        if (action === 'seek-10') { this.seekBy(-10); }
        else if (action === 'play') { this.togglePlay(); }
        else if (action === 'seek+10') { this.seekBy(10); }
        else if (action === 'aspect') { this.cycleAspect(); }
        else if (action === 'audio') { this.showTracksDialog('audio'); }
        else if (action === 'subs') { this.showTracksDialog('subs'); }
        else if (action === 'back') { this.close(); }
        this.showOsd();
        e.preventDefault();
        return;
      }
    }
  };

  /* ================= Diálogo modal ================= */
  var Dialog = {
    onSelect: null,
    show: function (title, options, onSelect, message) {
      this.onSelect = onSelect || null;
      var ov = $('dialogOverlay');
      var html = '<div class="dialog"><h2>' + esc(title) + '</h2>';
      if (message) html += '<div class="msg">' + esc(message) + '</div>';
      var i;
      for (i = 0; i < options.length; i++) {
        html += '<div class="opt focusable" data-zone="dialog" data-idx="' + i + '">' + esc(options[i]) + '</div>';
      }
      html += '</div>';
      ov.innerHTML = html;
      removeClass(ov, 'hidden');
      App.dialogOpen = true;
      Focus.set(Focus.byZoneIdx('dialog', 0));
    },
    showMessage: function (title, message, buttons, onSelect) {
      this.show(title, buttons || ['Aceptar'], onSelect, message);
    },
    activate: function () {
      var cur = Focus.current;
      if (!cur) return;
      var idx = idxOf(cur);
      var cb = this.onSelect;
      this.close();
      if (cb) cb(idx);
    },
    close: function () {
      var ov = $('dialogOverlay');
      addClass(ov, 'hidden');
      ov.innerHTML = '';
      App.dialogOpen = false;
      this.onSelect = null;
      /* Devuelve el foco a la pantalla activa. */
      var scr = App.screen;
      if (scr && scr.restoreFocus) scr.restoreFocus();
      else if (scr && scr.initialFocus) Focus.set(scr.initialFocus());
    }
  };

  /* ================= Lista virtual (ventana) ================= */
  /* Renderiza solo una ventana de filas para no llenar el DOM/RAM con
     miles de canales o películas. ensure(idx) mueve la ventana si el
     índice queda fuera y vuelve a renderizar. */
  function VList(container, windowSize, rowHtml) {
    return {
      container: container,
      items: [],
      windowSize: windowSize,
      start: 0,
      rowHtml: rowHtml,
      setItems: function (items) {
        this.items = items || [];
        this.start = 0;
        this.render();
      },
      render: function () {
        var end = Math.min(this.start + this.windowSize, this.items.length);
        var html = '';
        var i;
        for (i = this.start; i < end; i++) html += this.rowHtml(this.items[i], i);
        this.container.innerHTML = html;
      },
      ensure: function (idx) {
        if (this.items.length === 0) return;
        if (idx < 0) idx = 0;
        if (idx >= this.items.length) idx = this.items.length - 1;
        if (idx < this.start || idx >= this.start + this.windowSize) {
          var ns = idx - Math.floor(this.windowSize / 3);
          if (ns < 0) ns = 0;
          if (ns > this.items.length - this.windowSize) ns = Math.max(0, this.items.length - this.windowSize);
          this.start = ns;
          this.render();
        }
      },
      total: function () { return this.items.length; }
    };
  }

  /* ================= Pantallas ================= */
  var Screens = {};

  function initials(name) {
    var words = String(name || '').split(/\s+/);
    var out = '';
    var i;
    for (i = 0; i < words.length && out.length < 2; i++) {
      if (words[i].length > 0) out += words[i].charAt(0).toUpperCase();
    }
    return out || '?';
  }
  function logoHtml(url, name) {
    if (url) return '<span>' + esc(initials(name)) + '</span><img src="' + esc(url) + '" alt="" onerror="this.parentNode.removeChild(this)">';
    return '<span>' + esc(initials(name)) + '</span>';
  }
  function posterHtml(url, name) {
    if (url) return '<img src="' + esc(url) + '" alt="" onerror="this.parentNode.removeChild(this)">';
    return '<div style="width:100%;height:380px;background:#19191C;display:flex;align-items:center;justify-content:center;font-size:28px;color:#777;">' + esc(name || '') + '</div>';
  }

  /* ---------- Inicio ---------- */
  Screens.home = {
    key: 'home',
    rows: [], /* [{title, sub, items:[{kind:'live'|'movie'|'series'|'continue', item, frac}]}] */
    render: function () {
      this.buildRows();
      var html = '';
      var r, c, it;
      for (r = 0; r < this.rows.length; r++) {
        var sec = this.rows[r];
        html += '<div class="home-section"><h2>' + esc(sec.title) + '</h2>';
        if (sec.sub) html += '<div class="sub">' + esc(sec.sub) + '</div>';
        html += '<div class="home-row">';
        for (c = 0; c < sec.items.length; c++) {
          it = sec.items[c];
          var idx = r * 100 + c;
          if (it.kind === 'live' || it.kind === 'continue') {
            var ch = it.item;
            var epg = (it.kind === 'live') ? Epg.lookup(ch.name, ch.tvgId) : null;
            var prog = epg && epg.title ? epg.title : '';
            html += '<div class="home-card focusable" data-zone="homerow" data-row="' + r + '" data-col="' + c + '" data-idx="' + idx + '" data-kind="' + it.kind + '" data-ref="' + c + '">';
            html += '<div class="chanlogo">' + logoHtml(ch.logo, ch.name) + '</div>';
            html += '<div class="channame mq">' + mqHtml(ch.name) + '</div>';
            if (prog) html += '<div class="s mq">' + mqHtml(prog) + '</div>';
            if (it.kind === 'continue' && it.frac > 0) {
              html += '<div class="prog"><div style="width:' + Math.round(it.frac * 100) + '%"></div></div>';
            }
            html += '</div>';
          } else {
            var vod = it.item;
            html += '<div class="home-card focusable" data-zone="homerow" data-row="' + r + '" data-col="' + c + '" data-idx="' + idx + '" data-kind="' + it.kind + '" data-ref="' + c + '">';
            html += posterHtml(vod.logo || vod.cover, vod.name);
            html += '<div class="t mq">' + mqHtml(vod.name) + '</div>';
            var meta = [];
            if (vod.year) meta.push(String(vod.year));
            if (vod.rating) meta.push(vod.rating + ' \u2605');
            if (meta.length > 0) html += '<div class="s">' + esc(meta.join(' \u00b7 ')) + '</div>';
            if (it.kind === 'continue' && it.frac > 0) {
              html += '<div class="prog"><div style="width:' + Math.round(it.frac * 100) + '%"></div></div>';
            }
            html += '</div>';
          }
        }
        html += '</div></div>';
      }
      if (this.rows.length === 0) {
        html = '<div class="dim" style="font-size:32px;padding-top:40px;">Sin contenido. Ve a Ajustes y sincroniza tu lista.</div>';
      }
      $('content').innerHTML = '<div class="screen" id="screen-home">' + html + '</div>';
    },
    buildRows: function () {
      var rows = [];
      var i, e, item, frac;
      /* Continuar viendo (fracción 0,03–0,95). */
      var cont = [];
      for (i = 0; i < State.history.length; i++) {
        e = State.history[i];
        frac = e.frac || 0;
        if (frac >= 0.03 && frac < 0.95) {
          item = this.findByHistory(e);
          if (item) cont.push({ kind: 'continue', item: item, frac: frac, htype: e.type });
        }
      }
      if (cont.length > 0) rows.push({ title: 'Continuar viendo', sub: '', items: cont.slice(0, 10) });
      /* Canales destacados. */
      var feat = [];
      var favCh = [];
      for (i = 0; i < State.allChannels.length; i++) {
        if (isFav('live', State.allChannels[i])) favCh.push(State.allChannels[i]);
      }
      if (favCh.length > 0) feat = favCh.slice(0, 10);
      else feat = State.allChannels.slice(0, 10);
      if (feat.length > 0) {
        var fitems = [];
        for (i = 0; i < feat.length; i++) fitems.push({ kind: 'live', item: feat[i], frac: 0 });
        rows.push({ title: 'Canales destacados', sub: '', items: fitems });
      }
      /* Películas populares (por "added" descendente). */
      var mov = State.movies.slice(0);
      mov.sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
      if (mov.length > 0) {
        var mitems = [];
        for (i = 0; i < Math.min(10, mov.length); i++) mitems.push({ kind: 'movie', item: mov[i], frac: 0 });
        rows.push({ title: 'Pel\u00edculas populares', sub: '', items: mitems });
      }
      /* Series populares. */
      var ser = State.series.slice(0);
      ser.sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
      if (ser.length > 0) {
        var sitems = [];
        for (i = 0; i < Math.min(10, ser.length); i++) sitems.push({ kind: 'series', item: ser[i], frac: 0 });
        rows.push({ title: 'Series populares', sub: '', items: sitems });
      }
      this.rows = rows;
    },
    findByHistory: function (e) {
      var i, list;
      if (e.type === 'live') list = State.allChannels;
      else if (e.type === 'movie') list = State.movies;
      else list = State.series;
      for (i = 0; i < list.length; i++) {
        if ((list[i].streamId || list[i].serieId || '') === e.streamId && list[i].name === e.title) return list[i];
      }
      return null;
    },
    initialFocus: function () {
      return Focus.byZoneRowCol('homerow', 0, 0) || Focus.byZoneIdx('tabs', tabIndex('home'));
    },
    onActivate: function (cur) {
      var kind = cur.getAttribute('data-kind');
      var row = rowOf(cur), col = colOf(cur);
      var sec = this.rows[row];
      if (!sec || !sec.items[col]) return;
      var it = sec.items[col];
      if (kind === 'live' || kind === 'continue') {
        var type = (kind === 'continue' && it.htype) ? it.htype : 'live';
        if (type === 'live') Player.open(it.item, 'live');
        else if (type === 'movie') Screens.detail.open(it.item, 'movie');
        else Screens.detail.open(it.item, 'series');
      } else if (kind === 'movie') {
        Screens.detail.open(it.item, 'movie');
      } else if (kind === 'series') {
        Screens.detail.open(it.item, 'series');
      }
    },
    toggleFavoriteAt: function (cur) {
      var row = rowOf(cur), col = colOf(cur);
      var sec = this.rows[row];
      if (!sec || !sec.items[col]) return;
      var it = sec.items[col];
      var type = it.kind === 'live' ? 'live' : (it.kind === 'movie' ? 'movie' : 'series');
      var now = toggleFav(type, it.item);
      toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
    },
    onBack: function () {
      var cur = Focus.current;
      if (cur && zoneOf(cur) === 'homerow') {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('home')));
      } else if (cur && zoneOf(cur) === 'tabs') {
        App.exit();
      } else {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('home')));
      }
    }
  };

  /* ---------- TV en vivo (y Deportes, que reutiliza esta lógica) ---------- */
  function makeLiveScreen(key, filterFn, title) {
    return {
      key: key,
      filterFn: filterFn,
      title: title,
      catIdx: 0,
      chanIdx: 0,
      filtered: [],
      vlist: null,
      categories: [],
      render: function () {
        this.buildCategories();
        this.applyFilter();
        var html = '<div class="live-wrap">';
        /* Barra de categorías. */
        html += '<div class="catbar" id="catbar">';
        var i;
        for (i = 0; i < this.categories.length; i++) {
          var sel = (i === this.catIdx) ? ' selected' : '';
          html += '<div class="cat focusable' + sel + '" data-zone="cats" data-idx="' + i + '">' + esc(this.categories[i].label) + (typeof this.categories[i].count === 'number' ? '    ' + this.categories[i].count : '') + '</div>';
        }
        html += '</div>';
        /* Lista de canales (ventana virtual). */
        html += '<div class="chanlist" id="chanlist"></div>';
        /* Panel de preview. */
        html += '<div class="preview" id="previewPanel">';
        html += '<div class="vidbox" id="previewVidBox"></div>';
        html += '<div class="ptitle mq" id="previewTitle"></div>';
        html += '<div class="pmeta" id="previewMeta"></div>';
        html += '<div class="pdesc" id="previewDesc"></div>';
        html += '<div class="pnext" id="previewNext"></div>';
        html += '</div></div>';
        $('content').innerHTML = '<div class="screen" id="screen-' + key + '">' + html + '</div>';
        var self = this;
        this.vlist = VList($('chanlist'), LIST_WINDOW, function (ch, idx) { return self.chanRowHtml(ch, idx); });
        this.vlist.setItems(this.filtered);
        this.updatePreviewPanel(this.filtered[this.chanIdx]);
      },
      buildCategories: function () {
        var cats = [];
        var src0 = this.filterFn ? State.allChannels.filter(this.filterFn) : State.allChannels;
        var favCount = 0;
        for (var fi = 0; fi < src0.length; fi++) { if (isFav('live', src0[fi])) favCount++; }
        cats.push({ label: 'Historial', id: '__history', count: getHistory('live').length });
        cats.push({ label: 'Favoritos', id: '__favorites', count: favCount });
        cats.push({ label: 'Todo', id: '__all', count: src0.length });
        var seen = {};
        var i, ch, j;
        /* Nombres desde la lista de categorias de la API (no solo de los canales),
           para que aparezcan aunque todavia no haya canales cargados. */
        var catName = {};
        for (j = 0; j < State.liveCategories.length; j++) {
          var lc = State.liveCategories[j];
          var lid = lc.category_id ? String(lc.category_id) : '';
          if (lid) catName[lid] = lc.category_name || lid;
        }
        var src = this.filterFn ? State.allChannels.filter(this.filterFn) : State.allChannels;
        var counts = {};
        for (i = 0; i < src.length; i++) {
          ch = src[i];
          var g = ch.group || 'Sin categoría';
          counts[g] = (counts[g] || 0) + 1;
          if (!seen[g]) { seen[g] = true; cats.push({ label: catName[g] || g, id: g, count: 0 }); }
        }
        for (i = 0; i < cats.length; i++) {
          if (cats[i].id !== '__history' && cats[i].id !== '__favorites' && cats[i].id !== '__all') {
            cats[i].count = counts[cats[i].id] || 0;
          }
        }
        /* Si no hay canales, mostrar igual las categorias de la API. */
        if (src.length === 0) {
          for (j = 0; j < State.liveCategories.length; j++) {
            var lc2 = State.liveCategories[j];
            var lid2 = lc2.category_id ? String(lc2.category_id) : '';
            var lname2 = lc2.category_name || lid2;
            if (lid2 && !seen[lid2]) { seen[lid2] = true; cats.push({ label: lname2, id: lid2, count: 0 }); }
          }
        }
        this.categories = cats;
        if (this.catIdx >= cats.length) this.catIdx = 0;
      },
      applyFilter: function () {
        var cat = this.categories[this.catIdx];
        var base = this.filterFn ? State.allChannels.filter(this.filterFn) : State.allChannels;
        var out = [], i;
        if (!cat || cat.id === '__all') {
          out = base.slice(0);
        } else if (cat.id === '__history') {
          var hist = getHistory('live');
          for (i = 0; i < hist.length; i++) {
            for (var j = 0; j < base.length; j++) {
              if ((base[j].streamId || '') === hist[i].streamId && base[j].name === hist[i].title) { out.push(base[j]); break; }
            }
          }
        } else if (cat.id === '__favorites') {
          for (i = 0; i < base.length; i++) {
            if (isFav('live', base[i])) out.push(base[i]);
          }
        } else {
          for (i = 0; i < base.length; i++) {
            if ((base[i].group || 'Sin categoría') === cat.id) out.push(base[i]);
          }
        }
        this.filtered = out;
        if (this.chanIdx >= out.length) this.chanIdx = 0;
      },
      chanRowHtml: function (ch, idx) {
        var epg = Epg.lookup(ch.name, ch.tvgId);
        var progName = epg && epg.title ? epg.title : 'Sin EPG';
        var hours = '';
        var pct = 0;
        if (epg && epg.hasEpg && epg.startMs) {
          hours = fmtClock(epg.startMs) + ' - ' + fmtClock(epg.endMs);
          pct = clamp(Math.round(((Date.now() - epg.startMs) / (epg.endMs - epg.startMs)) * 100), 0, 100);
        }
        var num = ch.providerNum || String(idx + 1);
        var fav = isFav('live', ch) ? '\u2605' : '\u2606';
        var favCls = isFav('live', ch) ? 'fav' : 'fav off';
        var html = '<div class="chanrow focusable" data-zone="list" data-idx="' + idx + '">';
        html += '<div class="num">' + esc(num) + '</div>';
        html += '<div class="' + favCls + '">' + fav + '</div>';
        html += '<div class="logo">' + logoHtml(ch.logo, ch.name) + '</div>';
        html += '<div class="info">';
        html += '<div class="name mq">' + mqHtml(ch.name) + '</div>';
        html += '<div class="progname mq">' + mqHtml(progName) + '</div>';
        if (epg && epg.hasEpg && epg.startMs) {
          html += '<div class="pbar"><div style="width:' + pct + '%"></div></div>';
          html += '<div class="hours">' + esc(hours) + '</div>';
        }
        html += '</div></div>';
        return html;
      },
      updatePreviewPanel: function (ch) {
        var t = $('previewTitle'), m = $('previewMeta'), d = $('previewDesc'), n = $('previewNext');
        if (!ch) {
          if (t) t.textContent = '';
          if (m) m.textContent = '';
          if (d) d.textContent = '';
          if (n) n.textContent = '';
          return;
        }
        var epg = Epg.lookup(ch.name, ch.tvgId);
        if (t) t.textContent = ch.name;
        if (m) m.textContent = ch.group || '';
        if (d) d.textContent = (epg && epg.desc) ? epg.desc : '';
        if (n) {
          if (epg && epg.nextTitle) n.innerHTML = '<span class="lbl">A continuaci\u00f3n: </span>' + esc(epg.nextTitle) + ' (' + fmtClock(epg.nextStartMs) + ')';
          else n.textContent = '';
        }
      },
      /* Foco inicial: primera fila de canales; si la categoría está vacía,
         la primera categoría (para poder elegir otra); si no, la pestaña. */
      initialFocus: function () {
        var f = Focus.byZoneIdx('list', 0);
        if (f) return f;
        f = Focus.byZoneIdx('cats', this.catIdx);
        if (f) return f;
        return Focus.byZoneIdx('tabs', tabIndex(this.key));
      },
      restoreFocus: function () {
        var f = Focus.byZoneIdx('list', this.chanIdx);
        if (f) Focus.set(f);
        else if (this.initialFocus) Focus.set(this.initialFocus());
      },
      ensureIndex: function (zone, idx) {
        if (zone === 'list' && this.vlist) this.vlist.ensure(idx);
      },
      listTotal: function () { return this.filtered.length; },
      focusContentFromCat: function (catIdx) {
        this.catIdx = catIdx;
        this.applyFilter();
        if (this.vlist) this.vlist.setItems(this.filtered);
        this.chanIdx = 0;
        var f = Focus.byZoneIdx('list', 0);
        if (f) { this.onChannelFocus(f, 0); }
        return f;
      },
      focusCatFromList: function (chanIdx) {
        this.chanIdx = chanIdx;
        return Focus.byZoneIdx('cats', this.catIdx);
      },
      focusPreviewFromList: function (chanIdx) {
        this.chanIdx = chanIdx;
        var panel = $('previewPanel');
        if (!panel) return null;
        /* El panel de preview no es enfocable por sí mismo; se usa como
           destino visual y el foco vuelve a la lista. Se marca con un
           borde para indicar que está activo. */
        return Focus.byZoneIdx('list', chanIdx);
      },
      focusListFromPreview: function () {
        return Focus.byZoneIdx('list', this.chanIdx);
      },
      jumpToNumber: function (n) {
        /* Salta al canal cuya posición (1-based) es n. */
        var idx = n - 1;
        if (idx >= 0 && idx < this.filtered.length) {
          if (this.vlist) this.vlist.ensure(idx);
          this.chanIdx = idx;
          var f = Focus.byZoneIdx('list', idx);
          if (f) { Focus.set(f); this.onChannelFocus(f, idx); }
        }
      },
      onFocus: function (el) {
        var zone = zoneOf(el);
        if (zone === 'list') {
          var idx = idxOf(el);
          this.onChannelFocus(el, idx);
        } else if (zone === 'cats') {
          var ci = idxOf(el);
          if (ci !== this.catIdx) {
            this.catIdx = ci;
            this.applyFilter();
            if (this.vlist) this.vlist.setItems(this.filtered);
            this.chanIdx = 0;
            this.updatePreviewPanel(this.filtered[0]);
          }
        }
      },
      onChannelFocus: function (rowEl, idx) {
        this.chanIdx = idx;
        var ch = this.filtered[idx];
        if (!ch) return;
        this.updatePreviewPanel(ch);
        Player.requestPreview(ch);
      },
      onActivate: function (cur) {
        var zone = zoneOf(cur);
        if (zone === 'cats') {
          var idx = idxOf(cur);
          this.focusContentFromCat(idx);
          return;
        }
        if (zone === 'list') {
          var ci = idxOf(cur);
          var ch = this.filtered[ci];
          if (ch) {
            this.chanIdx = ci;
            Player.open(ch, 'live');
          }
          return;
        }
      },
      toggleFavoriteAt: function (cur) {
        var zone = zoneOf(cur);
        if (zone !== 'list') return;
        var ci = idxOf(cur);
        var ch = this.filtered[ci];
        if (!ch) return;
        var now = toggleFav('live', ch);
        toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
        /* Refresca la fila para actualizar la estrella. */
        if (this.vlist) this.vlist.render();
        Focus.set(Focus.byZoneIdx('list', ci));
      },
      onBack: function () {
        var cur = Focus.current;
        var zone = zoneOf(cur);
        if (zone === 'list') {
          Focus.set(Focus.byZoneIdx('cats', this.catIdx));
        } else if (zone === 'cats') {
          Focus.set(Focus.byZoneIdx('tabs', tabIndex(this.key)));
        } else if (zone === 'tabs') {
          App.showTab('home');
        } else {
          Focus.set(Focus.byZoneIdx('tabs', tabIndex(this.key)));
        }
      }
    };
  }
  Screens.live = makeLiveScreen('live', null, 'TV en vivo');
  Screens.sports = makeLiveScreen('sports', function (ch) {
    var g = norm(ch.group || '') + ' ' + norm(ch.name || '');
    return g.indexOf('sport') >= 0 || g.indexOf('deporte') >= 0 || g.indexOf('futbol') >= 0 || g.indexOf('f\u00fatbol') >= 0;
  }, 'Deportes');

  /* ---------- Películas y Series (parrilla 5 columnas) ---------- */
  function makeVodScreen(key, type) {
    return {
      key: key,
      type: type, /* 'movie' | 'series' */
      catIdx: 0,
      gridIdx: 0,
      filtered: [],
      categories: [],
      gridStartRow: 0,
      render: function () {
        this.buildCategories();
        this.applyFilter();
        var html = '<div class="vod-wrap">';
        html += '<div class="catbar" id="catbar">';
        var i;
        for (i = 0; i < this.categories.length; i++) {
          var sel = (i === this.catIdx) ? ' selected' : '';
          html += '<div class="cat focusable' + sel + '" data-zone="cats" data-idx="' + i + '">' + esc(this.categories[i].label) + (typeof this.categories[i].count === 'number' ? '    ' + this.categories[i].count : '') + '</div>';
        }
        html += '</div>';
        html += '<div class="vodgrid" id="vodgrid"></div>';
        html += '</div>';
        $('content').innerHTML = '<div class="screen" id="screen-' + key + '">' + html + '</div>';
        this.gridStartRow = 0;
        this.renderGrid();
      },
      buildCategories: function () {
        var cats = [];
        var base = this.type === 'movie' ? State.movies : State.series;
        var histCount = getHistory(this.type).length;
        var favCount = 0;
        for (var fi = 0; fi < base.length; fi++) { if (isFav(this.type, base[fi])) favCount++; }
        cats.push({ label: 'Historial', id: '__history', count: histCount });
        cats.push({ label: 'Favoritos', id: '__favorites', count: favCount });
        cats.push({ label: 'Todo', id: '__all', count: base.length });
        var src = this.type === 'movie' ? State.vodCategories : State.seriesCategories;
        var i;
        var counts = {};
        for (i = 0; i < base.length; i++) {
          var cid = String(base[i].category || '');
          counts[cid] = (counts[cid] || 0) + 1;
        }
        for (i = 0; i < src.length; i++) {
          var c = src[i];
          var id = c.category_id ? String(c.category_id) : '';
          var label = c.category_name || id || 'Sin categoría';
          cats.push({ label: label, id: id, count: counts[id] || 0 });
        }
        this.categories = cats;
        if (this.catIdx >= cats.length) this.catIdx = 0;
      },
      applyFilter: function () {
        var cat = this.categories[this.catIdx];
        var base = this.type === 'movie' ? State.movies : State.series;
        var out = [], i;
        if (!cat || cat.id === '__all') {
          out = base.slice(0);
        } else if (cat.id === '__history') {
          var hist = getHistory(this.type);
          for (i = 0; i < hist.length; i++) {
            for (var j = 0; j < base.length; j++) {
              var sid = base[j].streamId || base[j].serieId || '';
              if (sid === hist[i].streamId && base[j].name === hist[i].title) { out.push(base[j]); break; }
            }
          }
        } else if (cat.id === '__favorites') {
          for (i = 0; i < base.length; i++) {
            if (isFav(this.type, base[i])) out.push(base[i]);
          }
        } else {
          for (i = 0; i < base.length; i++) {
            if (String(base[i].category || '') === cat.id) out.push(base[i]);
          }
        }
        this.filtered = out;
        if (this.gridIdx >= out.length) this.gridIdx = 0;
      },
      renderGrid: function () {
        var totalRows = Math.ceil(this.filtered.length / GRID_COLS);
        var endRow = Math.min(this.gridStartRow + GRID_WINDOW_ROWS, totalRows);
        var html = '';
        var r, c, idx, item;
        for (r = this.gridStartRow; r < endRow; r++) {
          html += '<div class="vodrow">';
          for (c = 0; c < GRID_COLS; c++) {
            idx = r * GRID_COLS + c;
            if (idx >= this.filtered.length) break;
            item = this.filtered[idx];
            html += this.cardHtml(item, idx, r, c);
          }
          html += '</div>';
        }
        if (this.filtered.length === 0) {
          html = '<div class="dim" style="font-size:32px;padding-top:40px;">Sin contenido en esta categor\u00eda.</div>';
        }
        $('vodgrid').innerHTML = html;
      },
      cardHtml: function (item, idx, row, col) {
        var fav = isFav(this.type, item) ? ' \u2605' : '';
        var watched = fracFor(item, this.type) >= 0.95;
        var meta = [];
        if (item.year) meta.push(String(item.year));
        if (item.rating) meta.push(item.rating + ' \u2605');
        var html = '<div class="vodcard focusable" data-zone="grid" data-idx="' + idx + '" data-row="' + row + '" data-col="' + col + '">';
        html += posterHtml(item.logo || item.cover, item.name);
        html += '<div class="t mq">' + mqHtml(item.name) + '</div>';
        if (meta.length > 0) html += '<div class="s">' + esc(meta.join(' \u00b7 ')) + '</div>';
        if (fav) html += '<div class="st">' + fav + '</div>';
        if (watched) html += '<div class="st">\u2713 Visto</div>';
        html += '</div>';
        return html;
      },
      initialFocus: function () {
        var f = Focus.byZoneIdx('grid', 0);
        if (f) return f;
        f = Focus.byZoneIdx('cats', this.catIdx);
        if (f) return f;
        return Focus.byZoneIdx('tabs', tabIndex(this.key));
      },
      restoreFocus: function () {
        var f = Focus.byZoneIdx('grid', this.gridIdx);
        if (f) Focus.set(f);
        else if (this.initialFocus) Focus.set(this.initialFocus());
      },
      ensureIndex: function (zone, idx) {
        if (zone !== 'grid') return;
        var row = Math.floor(idx / GRID_COLS);
        var totalRows = Math.ceil(this.filtered.length / GRID_COLS);
        if (row < this.gridStartRow || row >= this.gridStartRow + GRID_WINDOW_ROWS) {
          var ns = row - 2;
          if (ns < 0) ns = 0;
          if (ns > totalRows - GRID_WINDOW_ROWS) ns = Math.max(0, totalRows - GRID_WINDOW_ROWS);
          this.gridStartRow = ns;
          this.renderGrid();
        }
      },
      gridTotal: function () { return this.filtered.length; },
      onFocus: function (el) {
        var zone = zoneOf(el);
        if (zone === 'cats') {
          var ci = idxOf(el);
          if (ci !== this.catIdx) {
            this.catIdx = ci;
            this.applyFilter();
            this.gridStartRow = 0;
            this.gridIdx = 0;
            this.renderGrid();
          }
        } else if (zone === 'grid') {
          this.gridIdx = idxOf(el);
        }
      },
      focusContentFromCat: function (catIdx) {
        this.catIdx = catIdx;
        this.applyFilter();
        this.gridStartRow = 0;
        this.gridIdx = 0;
        this.renderGrid();
        return Focus.byZoneIdx('grid', 0);
      },
      focusCatFromGrid: function (idx) {
        this.gridIdx = idx;
        return Focus.byZoneIdx('cats', this.catIdx);
      },
      onActivate: function (cur) {
        var zone = zoneOf(cur);
        if (zone === 'cats') {
          this.focusContentFromCat(idxOf(cur));
          return;
        }
        if (zone === 'grid') {
          var gi = idxOf(cur);
          var item = this.filtered[gi];
          if (item) {
            this.gridIdx = gi;
            Screens.detail.open(item, this.type);
          }
          return;
        }
      },
      toggleFavoriteAt: function (cur) {
        if (zoneOf(cur) !== 'grid') return;
        var gi = idxOf(cur);
        var item = this.filtered[gi];
        if (!item) return;
        var now = toggleFav(this.type, item);
        toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
        this.renderGrid();
        Focus.set(Focus.byZoneIdx('grid', gi));
      },
      onBack: function () {
        var cur = Focus.current;
        var zone = zoneOf(cur);
        if (zone === 'grid') {
          Focus.set(Focus.byZoneIdx('cats', this.catIdx));
        } else if (zone === 'cats') {
          Focus.set(Focus.byZoneIdx('tabs', tabIndex(this.key)));
        } else if (zone === 'tabs') {
          App.showTab('home');
        } else {
          Focus.set(Focus.byZoneIdx('tabs', tabIndex(this.key)));
        }
      }
    };
  }
  Screens.movies = makeVodScreen('movies', 'movie');
  Screens.series = makeVodScreen('series', 'series');

  /* ---------- Guía (todos los canales, ahora/siguiente) ---------- */
  Screens.guide = {
    key: 'guide',
    catIdx: 0,
    chanIdx: 0,
    filtered: [],
    vlist: null,
    categories: [],
    render: function () {
      this.buildCategories();
      this.applyFilter();
      var html = '<div class="live-wrap">';
      html += '<div class="catbar" id="catbar">';
      var i;
      for (i = 0; i < this.categories.length; i++) {
        var sel = (i === this.catIdx) ? ' selected' : '';
        html += '<div class="cat focusable' + sel + '" data-zone="cats" data-idx="' + i + '">' + esc(this.categories[i].label) + (typeof this.categories[i].count === 'number' ? '    ' + this.categories[i].count : '') + '</div>';
      }
      html += '</div>';
      html += '<div class="chanlist" id="chanlist"></div>';
      html += '<div class="preview" id="previewPanel">';
      html += '<div class="ptitle" id="guideTitle" style="font-size:44px;font-weight:bold;">Gu\u00eda</div>';
      html += '<div class="pmeta" id="guideMeta" style="font-size:30px;color:#AAAAAA;margin-top:12px;"></div>';
      html += '<div class="pdesc" id="guideDesc" style="font-size:30px;color:#AAAAAA;margin-top:16px;"></div>';
      html += '</div></div>';
      $('content').innerHTML = '<div class="screen" id="screen-guide">' + html + '</div>';
      var self = this;
      this.vlist = VList($('chanlist'), LIST_WINDOW, function (ch, idx) { return self.guideRowHtml(ch, idx); });
      this.vlist.setItems(this.filtered);
      this.updatePanel(this.filtered[this.chanIdx]);
    },
    buildCategories: function () {
      var cats = [];
      cats.push({ label: 'Historial', id: '__history' });
      cats.push({ label: 'Favoritos', id: '__favorites' });
      cats.push({ label: 'Todo', id: '__all' });
      var seen = {};
      var i, ch;
      for (i = 0; i < State.allChannels.length; i++) {
        ch = State.allChannels[i];
        var g = ch.group || 'Sin categoría';
        if (!seen[g]) { seen[g] = true; cats.push({ label: g, id: g }); }
      }
      this.categories = cats;
      if (this.catIdx >= cats.length) this.catIdx = 0;
    },
    applyFilter: function () {
      var cat = this.categories[this.catIdx];
      var base = State.allChannels;
      var out = [], i;
      if (!cat || cat.id === '__all') {
        out = base.slice(0);
      } else if (cat.id === '__history') {
        var hist = getHistory('live');
        for (i = 0; i < hist.length; i++) {
          for (var j = 0; j < base.length; j++) {
            if ((base[j].streamId || '') === hist[i].streamId && base[j].name === hist[i].title) { out.push(base[j]); break; }
          }
        }
      } else if (cat.id === '__favorites') {
        for (i = 0; i < base.length; i++) {
          if (isFav('live', base[i])) out.push(base[i]);
        }
      } else {
        for (i = 0; i < base.length; i++) {
          if ((base[i].group || 'Sin categoría') === cat.id) out.push(base[i]);
        }
      }
      this.filtered = out;
      if (this.chanIdx >= out.length) this.chanIdx = 0;
    },
    guideRowHtml: function (ch, idx) {
      var epg = Epg.lookup(ch.name, ch.tvgId);
      var nowTitle = epg && epg.title ? epg.title : 'Sin EPG';
      var nowHours = (epg && epg.hasEpg && epg.startMs) ? fmtClock(epg.startMs) + ' - ' + fmtClock(epg.endMs) : '';
      var nextTitle = epg && epg.nextTitle ? epg.nextTitle : '';
      var nextHours = (epg && epg.nextStartMs) ? fmtClock(epg.nextStartMs) + ' - ' + fmtClock(epg.nextEndMs) : '';
      var num = ch.providerNum || String(idx + 1);
      var fav = isFav('live', ch) ? '\u2605' : '\u2606';
      var favCls = isFav('live', ch) ? 'fav' : 'fav off';
      var pct = 0;
      if (epg && epg.hasEpg && epg.startMs) {
        pct = clamp(Math.round(((Date.now() - epg.startMs) / (epg.endMs - epg.startMs)) * 100), 0, 100);
      }
      var html = '<div class="chanrow focusable" data-zone="list" data-idx="' + idx + '">';
      html += '<div class="num">' + esc(num) + '</div>';
      html += '<div class="' + favCls + '">' + fav + '</div>';
      html += '<div class="logo">' + logoHtml(ch.logo, ch.name) + '</div>';
      html += '<div class="info">';
      html += '<div class="name mq">' + mqHtml(ch.name) + '</div>';
      html += '<div class="progname mq">' + mqHtml(nowTitle) + '</div>';
      if (nowHours) {
        html += '<div class="pbar"><div style="width:' + pct + '%"></div></div>';
        html += '<div class="hours">' + esc(nowHours) + '</div>';
      }
      if (nextTitle) {
        html += '<div class="progname" style="color:#777777;">' + esc(nextHours) + ' ' + esc(nextTitle) + '</div>';
      }
      html += '</div></div>';
      return html;
    },
    updatePanel: function (ch) {
      var t = $('guideTitle'), m = $('guideMeta'), d = $('guideDesc');
      if (!ch) {
        if (t) t.textContent = 'Gu\u00eda';
        if (m) m.textContent = '';
        if (d) d.textContent = '';
        return;
      }
      var epg = Epg.lookup(ch.name, ch.tvgId);
      if (t) t.textContent = ch.name;
      if (m) m.textContent = (epg && epg.title) ? epg.title : 'Sin EPG';
      if (d) d.textContent = (epg && epg.desc) ? epg.desc : '';
    },
    initialFocus: function () {
      var f = Focus.byZoneIdx('list', 0);
      if (f) return f;
      f = Focus.byZoneIdx('cats', this.catIdx);
      if (f) return f;
      return Focus.byZoneIdx('tabs', tabIndex('guide'));
    },
    restoreFocus: function () {
      var f = Focus.byZoneIdx('list', this.chanIdx);
      if (f) Focus.set(f);
      else if (this.initialFocus) Focus.set(this.initialFocus());
    },
    ensureIndex: function (zone, idx) {
      if (zone === 'list' && this.vlist) this.vlist.ensure(idx);
    },
    listTotal: function () { return this.filtered.length; },
    onFocus: function (el) {
      var zone = zoneOf(el);
      if (zone === 'list') {
        var idx = idxOf(el);
        this.chanIdx = idx;
        this.updatePanel(this.filtered[idx]);
      } else if (zone === 'cats') {
        var ci = idxOf(el);
        if (ci !== this.catIdx) {
          this.catIdx = ci;
          this.applyFilter();
          if (this.vlist) this.vlist.setItems(this.filtered);
          this.chanIdx = 0;
          this.updatePanel(this.filtered[0]);
        }
      }
    },
    focusContentFromCat: function (catIdx) {
      this.catIdx = catIdx;
      this.applyFilter();
      if (this.vlist) this.vlist.setItems(this.filtered);
      this.chanIdx = 0;
      var f = Focus.byZoneIdx('list', 0);
      if (f) this.updatePanel(this.filtered[0]);
      return f;
    },
    focusCatFromList: function (chanIdx) {
      this.chanIdx = chanIdx;
      return Focus.byZoneIdx('cats', this.catIdx);
    },
    jumpToNumber: function (n) {
      var idx = n - 1;
      if (idx >= 0 && idx < this.filtered.length) {
        if (this.vlist) this.vlist.ensure(idx);
        this.chanIdx = idx;
        var f = Focus.byZoneIdx('list', idx);
        if (f) { Focus.set(f); this.updatePanel(this.filtered[idx]); }
      }
    },
    onActivate: function (cur) {
      var zone = zoneOf(cur);
      if (zone === 'cats') {
        this.focusContentFromCat(idxOf(cur));
        return;
      }
      if (zone === 'list') {
        var ci = idxOf(cur);
        var ch = this.filtered[ci];
        if (ch) {
          this.chanIdx = ci;
          Player.open(ch, 'live');
        }
        return;
      }
    },
    toggleFavoriteAt: function (cur) {
      if (zoneOf(cur) !== 'list') return;
      var ci = idxOf(cur);
      var ch = this.filtered[ci];
      if (!ch) return;
      var now = toggleFav('live', ch);
      toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
      if (this.vlist) this.vlist.render();
      Focus.set(Focus.byZoneIdx('list', ci));
    },
    onBack: function () {
      var cur = Focus.current;
      var zone = zoneOf(cur);
      if (zone === 'list') {
        Focus.set(Focus.byZoneIdx('cats', this.catIdx));
      } else if (zone === 'cats') {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('guide')));
      } else if (zone === 'tabs') {
        App.showTab('home');
      } else {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('guide')));
      }
    }
  };

  /* ---------- Ajustes ---------- */
  Screens.settings = {
    key: 'settings',
    rows: [],
    render: function () {
      this.buildRows();
      var html = '';
      var i;
      for (i = 0; i < this.rows.length; i++) {
        var r = this.rows[i];
        html += '<div class="setrow focusable" data-zone="setrows" data-idx="' + i + '">';
        html += '<div class="t">' + esc(r.title) + '</div>';
        if (r.sub) html += '<div class="s">' + esc(r.sub) + '</div>';
        html += '</div>';
      }
      $('content').innerHTML = '<div class="screen" id="screen-settings">' + html + '</div>';
    },
    buildRows: function () {
      var rows = [];
      var pl = State.activePlaylist;
      var plName = pl ? pl.name : 'Sin lista';
      var plSub = pl ? (pl.type === 'xtream' ? 'Xtream · ' + pl.server : 'M3U · ' + (pl.url || '')) : 'A\u00f1ade una lista para empezar';
      rows.push({ id: 'lists', title: 'Listas', sub: plName + ' — ' + plSub });
      rows.push({ id: 'add', title: 'A\u00f1adir lista', sub: 'Xtream o M3U' });
      rows.push({ id: 'sync', title: 'Sincronizar ahora', sub: 'Actualiza canales, pel\u00edculas y series' });
      rows.push({ id: 'epg', title: 'Actualizar gu\u00eda (EPG)', sub: 'Descarga la programaci\u00f3n' });
      rows.push({ id: 'cache', title: 'Borrar cach\u00e9 de im\u00e1genes', sub: 'Libera la cach\u00e9 del navegador' });
      rows.push({ id: 'about', title: 'Acerca de', sub: 'MiTV webOS v1.0.0' });
      this.rows = rows;
    },
    initialFocus: function () {
      var f = Focus.byZoneIdx('setrows', 0);
      if (f) return f;
      return Focus.byZoneIdx('tabs', tabIndex('settings'));
    },
    onActivate: function (cur) {
      var idx = idxOf(cur);
      var row = this.rows[idx];
      if (!row) return;
      if (row.id === 'lists' || row.id === 'add') {
        Screens.editor.open(row.id === 'add' ? null : State.activePlaylist);
      } else if (row.id === 'sync') {
        syncAll(true).then(function () {
          Screens.settings.render();
          Focus.set(Focus.byZoneIdx('setrows', 2));
        });
      } else if (row.id === 'epg') {
        syncEpg().then(function (ok) {
          toast(ok ? 'Gu\u00eda actualizada' : 'No se pudo actualizar la gu\u00eda');
        });
      } else if (row.id === 'cache') {
        /* En webOS no hay API para borrar la caché del navegador; se
           limpia la EPG en memoria y se fuerza la recarga de imágenes. */
        Epg.loaded = false;
        Epg.channels = {};
        Epg.nameMap = {};
        State.epgLoaded = false;
        var imgs = document.querySelectorAll('img');
        var i;
        for (i = 0; i < imgs.length; i++) {
          var src = imgs[i].getAttribute('src');
          if (src) imgs[i].setAttribute('src', src);
        }
        toast('Cach\u00e9 borrada');
      } else if (row.id === 'about') {
        Dialog.showMessage('Acerca de MiTV',
          'MiTV webOS v1.0.0\nRéplica de MiTV Fire TV v1.0.22 para el TV LG webOS.\nTV en vivo, pel\u00edculas, series y gu\u00eda.',
          ['Aceptar']);
      }
    },
    onBack: function () {
      var cur = Focus.current;
      if (cur && zoneOf(cur) === 'setrows') {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('settings')));
      } else if (cur && zoneOf(cur) === 'tabs') {
        App.showTab('home');
      } else {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('settings')));
      }
    }
  };

  /* ---------- Buscar ---------- */
  Screens.search = {
    key: 'search',
    results: [], /* [{kind:'live'|'movie'|'series', item}] */
    timer: null,
    render: function () {
      var html = '';
      html += '<input class="search-input focusable" data-zone="searchfield" data-idx="0" id="searchInput" type="text" placeholder="Buscar canales, pel\u00edculas y series…" autocomplete="off">';
      html += '<div class="search-hint">Escribe al menos 2 letras. La b\u00fasqueda ignora los acentos.</div>';
      html += '<div class="search-results" id="searchResults"></div>';
      $('content').innerHTML = '<div class="screen" id="screen-search">' + html + '</div>';
      var self = this;
      var input = $('searchInput');
      input.addEventListener('input', function () {
        if (self.timer) clearTimeout(self.timer);
        self.timer = setTimeout(function () { self.doSearch(input.value); }, SEARCH_DEBOUNCE_MS);
      });
      input.addEventListener('keydown', function (e) {
        /* Enter en el campo: ejecuta la búsqueda y baja al primer resultado. */
        if (e.keyCode === KEY_OK) {
          self.doSearch(input.value);
          var first = Focus.byZoneIdx('results', 0);
          if (first) Focus.set(first);
          e.preventDefault();
          e.stopPropagation();
        }
      });
    },
    initialFocus: function () {
      return Focus.byZoneIdx('searchfield', 0);
    },
    doSearch: function (q) {
      q = norm(String(q || '').replace(/^\s+|\s+$/g, ''));
      this.results = [];
      if (q.length < SEARCH_MIN_CHARS) {
        this.renderResults();
        return;
      }
      var i, item;
      /* Canales. */
      for (i = 0; i < State.allChannels.length && this.results.length < SEARCH_MAX_CHANNELS; i++) {
        item = State.allChannels[i];
        if (norm(item.name).indexOf(q) >= 0) this.results.push({ kind: 'live', item: item });
      }
      /* Películas. */
      var mCount = 0;
      for (i = 0; i < State.movies.length && mCount < SEARCH_MAX_VOD; i++) {
        item = State.movies[i];
        if (norm(item.name).indexOf(q) >= 0) { this.results.push({ kind: 'movie', item: item }); mCount++; }
      }
      /* Series. */
      var sCount = 0;
      for (i = 0; i < State.series.length && sCount < SEARCH_MAX_SERIES; i++) {
        item = State.series[i];
        if (norm(item.name).indexOf(q) >= 0) { this.results.push({ kind: 'series', item: item }); sCount++; }
      }
      this.renderResults();
    },
    renderResults: function () {
      var box = $('searchResults');
      if (!box) return;
      if (this.results.length === 0) {
        box.innerHTML = '<div class="dim" style="font-size:30px;margin-top:20px;">Sin resultados.</div>';
        return;
      }
      var html = '';
      var curKind = '';
      var i, r;
      for (i = 0; i < this.results.length; i++) {
        r = this.results[i];
        if (r.kind !== curKind) {
          curKind = r.kind;
          var h = curKind === 'live' ? 'Canales' : (curKind === 'movie' ? 'Pel\u00edculas' : 'Series');
          html += '<h3>' + h + '</h3>';
        }
        var item = r.item;
        var thumb = '';
        if (r.kind === 'live') {
          thumb = '<img src="' + esc(item.logo || '') + '" alt="" onerror="this.parentNode.removeChild(this)" style="background:#fff;">';
          if (!item.logo) thumb = '<div style="width:108px;height:108px;background:#fff;border-radius:12px;margin-right:24px;display:flex;align-items:center;justify-content:center;color:#222;font-size:24px;font-weight:bold;">' + esc(initials(item.name)) + '</div>';
        } else {
          thumb = '<img class="poster" src="' + esc(item.logo || item.cover || '') + '" alt="" onerror="this.parentNode.removeChild(this)">';
        }
        html += '<div class="search-row focusable" data-zone="results" data-idx="' + i + '" data-kind="' + r.kind + '">';
        html += thumb;
        html += '<div><div class="t">' + esc(item.name) + '</div>';
        var sub = '';
        if (r.kind === 'live') {
          var epg = Epg.lookup(item.name, item.tvgId);
          sub = (epg && epg.title) ? epg.title : (item.group || '');
        } else {
          var parts = [];
          if (item.year) parts.push(String(item.year));
          if (item.rating) parts.push(item.rating + ' \u2605');
          sub = parts.join(' \u00b7 ');
        }
        if (sub) html += '<div class="s">' + esc(sub) + '</div>';
        html += '</div></div>';
      }
      box.innerHTML = html;
    },
    onActivate: function (cur) {
      var zone = zoneOf(cur);
      if (zone === 'searchfield') {
        var input = $('searchInput');
        if (input) this.doSearch(input.value);
        var first = Focus.byZoneIdx('results', 0);
        if (first) Focus.set(first);
        return;
      }
      if (zone === 'results') {
        var idx = idxOf(cur);
        var r = this.results[idx];
        if (!r) return;
        if (r.kind === 'live') Player.open(r.item, 'live');
        else if (r.kind === 'movie') Screens.detail.open(r.item, 'movie');
        else Screens.detail.open(r.item, 'series');
        return;
      }
    },
    toggleFavoriteAt: function (cur) {
      if (zoneOf(cur) !== 'results') return;
      var idx = idxOf(cur);
      var r = this.results[idx];
      if (!r) return;
      var now = toggleFav(r.kind, r.item);
      toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
    },
    onBack: function () {
      var cur = Focus.current;
      var zone = zoneOf(cur);
      if (zone === 'results' || zone === 'searchfield') {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('search')));
      } else if (zone === 'tabs') {
        App.showTab('home');
      } else {
        Focus.set(Focus.byZoneIdx('tabs', tabIndex('search')));
      }
    }
  };

  /* ---------- Ficha de película / serie ---------- */
  Screens.detail = {
    key: 'detail',
    item: null, type: null,
    episodes: [], /* [{season, episodeNum, title, duration, streamId, ext, frac, watched}] */
    loading: false,
    returnTab: 'home',
    open: function (item, type) {
      this.item = item;
      this.type = type;
      this.returnTab = App.currentTab;
      this.episodes = [];
      this.loading = false;
      App.screen = this;
      var tabs = $('tabs');
      if (tabs) addClass(tabs, 'hidden');
      this.renderShell();
      this.loadInfo();
    },
    renderShell: function () {
      var item = this.item;
      var isMovie = this.type === 'movie';
      var frac = fracFor(item, this.type);
      var watched = frac >= 0.95;
      var fav = isFav(this.type, item);
      var meta = [];
      if (item.year) meta.push(String(item.year));
      if (item.rating) meta.push(item.rating + ' \u2605');
      var playLabel = 'Reproducir';
      if (frac > 0 && frac < 0.95) playLabel = 'Continuar';
      if (watched) playLabel = 'Ver de nuevo';
      var html = '<div class="detail">';
      html += '<div class="head">';
      html += '<img class="poster" src="' + esc(item.logo || item.cover || '') + '" alt="" onerror="this.style.display=\'none\'">';
      html += '<div class="dinfo">';
      html += '<div class="dtitle mq">' + mqHtml(item.name) + '</div>';
      if (meta.length > 0) html += '<div class="dmeta">' + esc(meta.join(' \u00b7 ')) + '</div>';
      html += '<div class="dplot" id="detailPlot"></div>';
      html += '<div class="dextra" id="detailExtra"></div>';
      html += '<div class="btnrow" id="detailBtns">';
      html += '<div class="btn focusable" data-zone="detailbtn" data-idx="0">' + esc(playLabel) + '</div>';
      html += '<div class="btn focusable" data-zone="detailbtn" data-idx="1">' + (fav ? '\u2605 Favorito' : '\u2606 Favorito') + '</div>';
      html += '<div class="btn focusable" data-zone="detailbtn" data-idx="2">' + (watched ? '\u2713 Visto' : 'Marcar visto') + '</div>';
      html += '<div class="btn focusable" data-zone="detailbtn" data-idx="3">Atr\u00e1s</div>';
      html += '</div>';
      if (!isMovie) {
        html += '<div class="epstatus" id="detailEpStatus">Cargando episodios…</div>';
      }
      html += '</div></div>';
      if (!isMovie) html += '<div class="eplist" id="detailEpList"></div>';
      html += '</div>';
      $('content').innerHTML = '<div class="screen" id="screen-detail">' + html + '</div>';
      Focus.set(Focus.byZoneIdx('detailbtn', 0));
    },
    loadInfo: function () {
      var self = this;
      var item = this.item;
      var pl = State.activePlaylist;
      if (!pl || pl.type !== 'xtream') {
        /* M3U: sin info extra; para series, sin episodios. */
        var plot = $('detailPlot');
        if (plot) plot.textContent = '';
        var extra = $('detailExtra');
        if (extra) extra.textContent = '';
        if (this.type === 'series') {
          var st = $('detailEpStatus');
          if (st) st.textContent = 'Sin episodios (lista M3U)';
        }
        return;
      }
      this.loading = true;
      loadCredPromise(pl.server).then(function (cred) {
        var username = cred ? cred.username : (pl.username || '');
        var password = cred ? cred.password : '';
        if (self.type === 'movie') {
          return xtreamInfo(pl.server, username, password, 'get_vod_info', 'vod_id', item.streamId)
            .then(function (data) { self.applyVodInfo(data); })
            .catch(function () { self.loading = false; });
        } else {
          return xtreamInfo(pl.server, username, password, 'get_series_info', 'series_id', item.serieId)
            .then(function (data) { self.applySeriesInfo(data); })
            .catch(function () { self.loading = false; });
        }
      });
    },
    applyVodInfo: function (data) {
      this.loading = false;
      var info = (data && data.info) || {};
      var plot = $('detailPlot');
      if (plot) plot.textContent = info.plot || '';
      var extra = $('detailExtra');
      if (extra) {
        var parts = [];
        if (info.genre) parts.push('G\u00e9nero: ' + info.genre);
        if (info.director) parts.push('Director: ' + info.director);
        if (info.cast) parts.push('Reparto: ' + info.cast);
        if (info.duration) parts.push('Duraci\u00f3n: ' + info.duration);
        extra.innerHTML = parts.map(function (p) { return '<div>' + esc(p) + '</div>'; }).join('');
      }
      /* Guarda la URL de streaming si el panel la devuelve. */
      if (data && data.movie_data) {
        var md = data.movie_data;
        if (md.stream_id) this.item.streamId = String(md.stream_id);
      }
    },
    applySeriesInfo: function (data) {
      this.loading = false;
      var info = (data && data.info) || {};
      var plot = $('detailPlot');
      if (plot) plot.textContent = info.plot || '';
      var extra = $('detailExtra');
      if (extra) {
        var parts = [];
        if (info.genre) parts.push('G\u00e9nero: ' + info.genre);
        if (info.director) parts.push('Director: ' + info.director);
        if (info.cast) parts.push('Reparto: ' + info.cast);
        extra.innerHTML = parts.map(function (p) { return '<div>' + esc(p) + '</div>'; }).join('');
      }
      /* Episodios por temporada. */
      var eps = [];
      var seasons = (data && data.seasons) || {};
      var sKeys = Object.keys(seasons).sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
      var si, ei, ep, season;
      for (si = 0; si < sKeys.length; si++) {
        season = parseInt(sKeys[si], 10);
        var list = seasons[sKeys[si]] || [];
        for (ei = 0; ei < list.length; ei++) {
          ep = list[ei];
          var epId = ep.id ? String(ep.id) : '';
          var frac = 0, watched = false;
          var i, e;
          for (i = 0; i < State.history.length; i++) {
            e = State.history[i];
            if (e.type === 'series' && e.streamId === epId) { frac = e.frac || 0; watched = frac >= 0.95; break; }
          }
          eps.push({
            season: season,
            episodeNum: ep.episode_num ? parseInt(ep.episode_num, 10) : (ei + 1),
            title: ep.title || ('Episodio ' + (ei + 1)),
            duration: ep.duration || '',
            streamId: epId,
            ext: ep.container_extension || 'mp4',
            frac: frac, watched: watched
          });
        }
      }
      this.episodes = eps;
      this.renderEpisodes();
    },
    renderEpisodes: function () {
      var st = $('detailEpStatus');
      if (st) st.textContent = this.episodes.length > 0 ? (this.episodes.length + ' episodios') : 'Sin episodios';
      var box = $('detailEpList');
      if (!box) return;
      var html = '';
      var i, ep;
      for (i = 0; i < this.episodes.length; i++) {
        ep = this.episodes[i];
        var state = '';
        if (ep.watched) state = '\u2713 Visto';
        else if (ep.frac > 0) state = 'Continuar ' + Math.round(ep.frac * 100) + '%';
        html += '<div class="eprow focusable" data-zone="episodes" data-idx="' + i + '">';
        html += '<div>T' + ep.season + ' E' + ep.episodeNum + ' · ' + esc(ep.title) + '</div>';
        if (ep.duration) html += '<div class="dim" style="margin-left:16px;">' + esc(ep.duration) + '</div>';
        if (state) html += '<div class="epstate">' + esc(state) + '</div>';
        html += '</div>';
      }
      box.innerHTML = html;
    },
    initialFocus: function () {
      return Focus.byZoneIdx('detailbtn', 0);
    },
    restoreFocus: function () {
      Focus.set(Focus.byZoneIdx('detailbtn', 0));
    },
    focusEpisodesFromDetail: function () {
      return Focus.byZoneIdx('episodes', 0);
    },
    onActivate: function (cur) {
      var zone = zoneOf(cur);
      if (zone === 'detailbtn') {
        var idx = idxOf(cur);
        var pl = State.activePlaylist;
        if (idx === 0) {
          /* Reproducir / Continuar. */
          if (this.type === 'movie') {
            this.resolveStreamUrl(function (url) {
              if (url) {
                var item = Screens.detail.item;
                item.streamUrl = url;
                Player.open(item, 'movie');
              } else toast('No se pudo obtener el enlace');
            });
          } else {
            /* Serie: reproduce el primer episodio sin ver o el primero. */
            var ep = null, i;
            for (i = 0; i < this.episodes.length; i++) {
              if (!this.episodes[i].watched) { ep = this.episodes[i]; break; }
            }
            if (!ep && this.episodes.length > 0) ep = this.episodes[0];
            if (ep) this.playEpisode(ep);
            else toast('Sin episodios');
          }
        } else if (idx === 1) {
          var now = toggleFav(this.type, this.item);
          toast(now ? 'A\u00f1adido a favoritos' : 'Quitado de favoritos');
          this.renderShell();
          this.loadInfo();
          Focus.set(Focus.byZoneIdx('detailbtn', 1));
        } else if (idx === 2) {
          /* Marcar visto / quitar visto. */
          var sid = this.item.streamId || this.item.serieId || '';
          var found = false;
          var i2, e;
          for (i2 = 0; i2 < State.history.length; i2++) {
            e = State.history[i2];
            if (e.type === this.type && e.streamId === sid && e.title === this.item.name) {
              e.frac = (e.frac >= 0.95) ? 0 : 1;
              e.posMs = (e.frac >= 0.95) ? 1000 : 0;
              e.durMs = (e.frac >= 0.95) ? 1000 : 0;
              e.watched = e.frac >= 0.95;
              found = true;
              break;
            }
          }
          if (!found) {
            pushHistory({ type: this.type, title: this.item.name, streamId: sid, logo: this.item.logo || this.item.cover || '', category: this.item.category || '', frac: 1, posMs: 1000, durMs: 1000, watched: true });
          } else saveHistory();
          this.renderShell();
          this.loadInfo();
          Focus.set(Focus.byZoneIdx('detailbtn', 2));
        } else if (idx === 3) {
          this.close();
        }
        return;
      }
      if (zone === 'episodes') {
        var ei = idxOf(cur);
        var ep2 = this.episodes[ei];
        if (ep2) this.playEpisode(ep2);
        return;
      }
    },
    resolveStreamUrl: function (cb) {
      var item = this.item;
      var pl = State.activePlaylist;
      if (item.streamUrl) { cb(item.streamUrl); return; }
      if (!pl || pl.type !== 'xtream') { cb(null); return; }
      loadCredPromise(pl.server).then(function (cred) {
        var username = cred ? cred.username : (pl.username || '');
        var password = cred ? cred.password : '';
        if (!username) { cb(null); return; }
        cb(movieStreamUrl(pl.server, username, password, item.streamId, item.ext || 'mp4'));
      });
    },
    playEpisode: function (ep) {
      var pl = State.activePlaylist;
      var self = this;
      var openWith = function (url) {
        if (!url) { toast('No se pudo obtener el enlace'); return; }
        var item = {
          name: self.item.name + ' - T' + ep.season + ' E' + ep.episodeNum + ' ' + ep.title,
          streamId: ep.streamId,
          streamUrl: url,
          logo: self.item.cover || '',
          category: self.item.category || ''
        };
        Player.open(item, 'series');
      };
      if (pl && pl.type === 'xtream') {
        loadCredPromise(pl.server).then(function (cred) {
          var username = cred ? cred.username : (pl.username || '');
          var password = cred ? cred.password : '';
          if (!username) { openWith(null); return; }
          openWith(episodeStreamUrl(pl.server, username, password, ep.streamId, ep.ext || 'mp4'));
        });
      } else if (ep.streamId) {
        openWith(ep.streamId);
      } else {
        openWith(null);
      }
    },
    onBack: function () {
      var cur = Focus.current;
      if (cur && zoneOf(cur) === 'episodes') {
        Focus.set(Focus.byZoneIdx('detailbtn', 1));
      } else {
        this.close();
      }
    },
    close: function () {
      var tabs = $('tabs');
      if (tabs) removeClass(tabs, 'hidden');
      App.showTab(this.returnTab || 'home', true);
      var scr = Screens[this.returnTab || 'home'];
      if (scr && scr.restoreFocus) scr.restoreFocus();
      else if (scr && scr.initialFocus) Focus.set(scr.initialFocus());
    }
  };

  /* ---------- Editor de listas ---------- */
  Screens.editor = {
    key: 'editor',
    editing: null, /* playlist que se edita, o null para nueva */
    firstRun: false,
    returnTab: 'settings',
    open: function (playlist, firstRun) {
      this.editing = playlist || null;
      this.firstRun = !!firstRun;
      this._skipVerify = false;
      this.returnTab = App.currentTab === 'editor' ? 'settings' : App.currentTab;
      App.screen = this;
      var tabs = $('tabs');
      if (tabs) addClass(tabs, 'hidden');
      this.render();
    },
    render: function () {
      var p = this.editing;
      var isXtream = !p || p.type === 'xtream';
      var title = this.firstRun ? 'Bienvenido a MiTV' : (p ? 'Editar lista' : 'A\u00f1adir lista');
      var sub = this.firstRun ? 'Introduce los datos de tu lista Xtream (o una lista M3U) para empezar.' : '';
      var name = p ? (p.name || '') : '';
      var server = p ? (p.server || '') : '';
      var username = p ? (p.username || '') : '';
      var url = p ? (p.url || '') : '';
      var epgUrl = p ? (p.epgUrl || '') : '';
      var html = '<div class="editor">';
      html += '<h1>' + esc(title) + '</h1>';
      if (sub) html += '<div class="dim" style="font-size:30px;margin-bottom:20px;">' + esc(sub) + '</div>';
      html += '<div class="typerow">';
      html += '<div class="btn focusable' + (isXtream ? '' : ' unselected') + '" data-zone="editor" data-idx="0" data-action="type-xtream">Xtream</div>';
      html += '<div class="btn focusable' + (isXtream ? ' unselected' : '') + '" data-zone="editor" data-idx="1" data-action="type-m3u">M3U</div>';
      html += '</div>';
      html += '<label>Nombre de la lista</label>';
      html += '<input class="focusable" data-zone="editor" data-idx="2" id="edName" type="text" value="' + esc(name) + '" placeholder="Mi lista">';
      if (isXtream) {
        html += '<label>Servidor (URL del panel Xtream)</label>';
        html += '<input class="focusable" data-zone="editor" data-idx="3" id="edServer" type="text" value="' + esc(server) + '" placeholder="https://ejemplo.com">';
        html += '<label>Usuario</label>';
        html += '<input class="focusable" data-zone="editor" data-idx="4" id="edUser" type="text" value="' + esc(username) + '" placeholder="usuario">';
        html += '<label>Contrase\u00f1a</label>';
        /* Visible como texto normal (como en IPTV Smarters): en TV teclear
           a ciegas es insoportable y ninguna app IPTV la oculta. Se rellena
           con la guardada en el TV, si la hay. */
        var storedPass = '';
        try {
          var storedCred = lsGet(LS_CREDS, null);
          if (storedCred && storedCred.password && (!server || storedCred.server === server)) storedPass = storedCred.password;
        } catch (e) {}
        html += '<input class="focusable" data-zone="editor" data-idx="5" id="edPass" type="text" value="' + esc(storedPass) + '" placeholder="contrase\u00f1a">';
        html += '<div class="dim" style="font-size:26px;margin-top:12px;">La contrase\u00f1a se guarda solo en el TV y nunca sale de \u00e9l.</div>';
      } else {
        html += '<label>URL de la lista M3U</label>';
        html += '<input class="focusable" data-zone="editor" data-idx="3" id="edUrl" type="text" value="' + esc(url) + '" placeholder="https://ejemplo.com/lista.m3u">';
        html += '<label>URL de la gu\u00eda EPG (opcional)</label>';
        html += '<input class="focusable" data-zone="editor" data-idx="4" id="edEpg" type="text" value="' + esc(epgUrl) + '" placeholder="https://ejemplo.com/epg.xml">';
      }
      var saveIdx = isXtream ? 6 : 5;
      html += '<div class="btn save focusable" data-zone="editor" data-idx="' + saveIdx + '" data-action="save">Guardar y sincronizar</div>';
      html += '<div class="btn save focusable" data-zone="editor" data-idx="' + (saveIdx + 1) + '" data-action="cancel">Cancelar</div>';
      html += '<div class="err" id="edErr"></div>';
      html += '</div>';
      $('content').innerHTML = '<div class="screen" id="screen-editor">' + html + '</div>';
      Focus.set(Focus.byZoneIdx('editor', 0));
    },
    onActivate: function (cur) {
      var action = cur.getAttribute('data-action');
      if (action === 'type-xtream' || action === 'type-m3u') {
        var p = this.editing || { type: 'xtream' };
        p.type = (action === 'type-xtream') ? 'xtream' : 'm3u';
        this.editing = p;
        this.render();
        Focus.set(Focus.byZoneIdx('editor', action === 'type-xtream' ? 0 : 1));
        return;
      }
      if (action === 'cancel') {
        this.close();
        return;
      }
      if (action === 'save') {
        this.save();
        return;
      }
    },
    save: function () {
      var self = this;
      var errEl = $('edErr');
      function fail(msg) { if (errEl) errEl.textContent = msg; }
      var p = this.editing || { type: 'xtream' };
      var name = $('edName') ? $('edName').value.replace(/^\s+|\s+$/g, '') : '';
      if (!name) { fail('Ponle un nombre a la lista.'); return; }
      p.name = name;
      if (p.type === 'xtream') {
        var server = $('edServer') ? $('edServer').value.replace(/^\s+|\s+$/g, '') : '';
        var username = $('edUser') ? $('edUser').value.replace(/^\s+|\s+$/g, '') : '';
        var password = $('edPass') ? $('edPass').value : '';
        if (!server || server.indexOf('http') !== 0) { fail('El servidor debe ser una URL (https://…).'); return; }
        if (!username) { fail('Falta el usuario.'); return; }
        if (!password && !this.editing) { fail('Falta la contrase\u00f1a.'); return; }
        p.server = server.replace(/\/+$/, '');
        p.username = username;
        p.url = '';
        p.epgUrl = '';
        /* Si se edita y la contraseña quedó vacía, se reutiliza la
           guardada en DB8 (el usuario no la cambió). */
        if (!password && this.editing) {
          loadCredPromise(p.server).then(function (cred) {
            var stored = cred ? cred.password : '';
            if (!stored) { fail('Falta la contrase\u00f1a.'); return; }
            self.saveXtream(p, username, stored);
          });
        } else {
          this.saveXtream(p, username, password);
        }
      } else {
        var url = $('edUrl') ? $('edUrl').value.replace(/^\s+|\s+$/g, '') : '';
        var epg = $('edEpg') ? $('edEpg').value.replace(/^\s+|\s+$/g, '') : '';
        if (!url || url.indexOf('http') !== 0) { fail('La URL de la lista debe empezar por http(s)://'); return; }
        p.url = url;
        p.epgUrl = epg;
        p.server = '';
        p.username = '';
        this.finishSave(p);
      }
    },
    saveXtream: function (p, username, password) {
      var self = this;
      var errEl = $('edErr');
      /* Guardar sin verificar: el navegador de esta TV se cuelga al contactar
         el servidor (la petición bloquea el bucle de eventos y ni el timeout
         dispara), así que la comprobación previa no es fiable aquí. */
      if (errEl) { errEl.style.color = '#AAAAAA'; errEl.textContent = 'Guardando…'; }
      /* CredStore.save pone las credenciales en memoria de inmediato y luego
         intenta persistirlas en DB8 en segundo plano. NO se espera su callback:
         en esta TV el puente webOS (PalmServiceBridge) no devuelve los
         callbacks de luna://com.palm.db (putKind da "permission denied" y el
         callback nunca llega), así que esperar dejaría la app en "Guardando…".
         Las credenciales quedan en memoria para esta sesión; si DB8 no
         persiste, habrá que reescribir la clave al reiniciar la app. */
      CredStore.save(p.server, username, password, function (ok) {
        if (!ok && isWebOS()) toast('Aviso: la clave quedó solo en memoria (DB8 no la guardó)');
      });
      self.finishSave(p);
    },
    finishSave: function (p) {
      var i, found = false;
      for (i = 0; i < State.playlists.length; i++) {
        if (State.playlists[i].name === p.name) { State.playlists[i] = p; found = true; break; }
      }
      if (!found) State.playlists.push(p);
      /* Activa esta lista y desactiva las demás. */
      for (i = 0; i < State.playlists.length; i++) {
        State.playlists[i].active = (State.playlists[i] === p);
      }
      State.activePlaylist = p;
      savePlaylists();
      toast('Lista guardada. Sincronizando…');
      this.close();
      syncAll(true).then(function () {
        App.showTab('home');
      });
    },
    close: function () {
      var tabs = $('tabs');
      if (tabs) removeClass(tabs, 'hidden');
      if (this.firstRun) {
        App.showTab('home');
      } else {
        App.showTab(this.returnTab || 'settings');
      }
    },
    onBack: function () { this.close(); }
  };

  /* ---------- Configuración inicial (primera vez) ---------- */
  Screens.setup = {
    key: 'setup',
    open: function () {
      Screens.editor.open(null, true);
    }
  };

  /* ================= Arranque ================= */
  function buildTabs() {
    var tabs = $('tabs');
    var html = '';
    var i;
    for (i = 0; i < TABS.length; i++) {
      html += '<div class="tab focusable" data-zone="tabs" data-idx="' + i + '" data-tab="' + TABS[i].key + '">' + esc(TABS[i].label) + '</div>';
    }
    html += '<div id="appTitle">Mi<span class="red">TV</span></div>';
    tabs.innerHTML = html;
  }

  function init() {
    buildTabs();
    Player.init();
    /* Carga el estado guardado (sin credenciales: esas están en DB8). */
    State.favorites = lsGet(LS_FAVORITES, {});
    State.history = lsGet(LS_HISTORY, []);
    loadPlaylists();
    var hadContent = loadContent();
    document.addEventListener('keydown', onKeyDown, false);
    /* Oculta la pantalla de carga. */
    var loading = $('loading');
    if (loading) addClass(loading, 'hidden');
    if (!State.activePlaylist) {
      /* Primera vez: configuración inicial. */
      Screens.setup.open();
      return;
    }
    App.showTab('home');
    /* Sincroniza en segundo plano si hay contenido guardado; si no,
       sincroniza de inmediato. */
    if (hadContent && State.allChannels.length > 0) {
      setTimeout(function () { syncAll(false); }, 1500);
    } else {
      syncAll(false).then(function (ok) {
        if (ok) App.showTab('home');
      });
    }
  }

  /* Arranque cuando el DOM está listo. */
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, false);
  }
})();
