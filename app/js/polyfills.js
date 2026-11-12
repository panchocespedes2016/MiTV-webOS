/* MiTV webOS v1.0.0 — polyfills para Chromium 38 (webOS 3.x).
   ES5 estricto. Solo se define lo que falta. */

(function () {
  'use strict';

  /* Object.assign (llegó en Chrome 45) */
  if (typeof Object.assign !== 'function') {
    Object.assign = function (target) {
      if (target === null || target === undefined) {
        throw new TypeError('Object.assign: target nulo');
      }
      var to = Object(target);
      var i, key, src;
      for (i = 1; i < arguments.length; i++) {
        src = arguments[i];
        if (src !== null && src !== undefined) {
          for (key in src) {
            if (Object.prototype.hasOwnProperty.call(src, key)) {
              to[key] = src[key];
            }
          }
        }
      }
      return to;
    };
  }

  /* Array.from (llegó en Chrome 45) */
  if (typeof Array.from !== 'function') {
    Array.from = function (arrayLike, mapFn, thisArg) {
      var len = arrayLike.length >>> 0;
      var out = new Array(len);
      var i;
      for (i = 0; i < len; i++) {
        out[i] = mapFn ? mapFn.call(thisArg, arrayLike[i], i) : arrayLike[i];
      }
      return out;
    };
  }

  /* Array.prototype.includes (llegó en Chrome 47) */
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (value) {
      var i;
      for (i = 0; i < this.length; i++) {
        if (this[i] === value) return true;
      }
      return false;
    };
  }

  /* Element.matches (en Chrome 38 es webkitMatchesSelector) */
  if (typeof Element !== 'undefined' && Element.prototype) {
    if (!Element.prototype.matches) {
      Element.prototype.matches = Element.prototype.webkitMatchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        function (sel) {
          var node = this;
          var list = (node.parentNode || document).querySelectorAll(sel);
          var i;
          for (i = 0; i < list.length; i++) {
            if (list[i] === node) return true;
          }
          return false;
        };
    }
  }

  /* fetch mínimo vía XMLHttpRequest (fetch llegó en Chrome 42).
     Devuelve una Promise nativa (Chrome 38 ya tiene Promise).
     Solo lo necesario: GET con headers, .text() y .json(). */
  if (typeof window.fetch !== 'function') {
    window.fetch = function (url, options) {
      options = options || {};
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var method = options.method || 'GET';
        var headers = options.headers || {};
        var key;
        xhr.open(method, url, true);
        xhr.timeout = options.timeout || 120000;
        for (key in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, key)) {
            try { xhr.setRequestHeader(key, headers[key]); } catch (e) { /* cabecera prohibida, se ignora */ }
          }
        }
        xhr.onload = function () {
          var status = xhr.status;
          var body = xhr.responseText;
          var ok = status >= 200 && status < 300;
          resolve({
            ok: ok,
            status: status,
            text: function () { return Promise.resolve(body); },
            json: function () {
              return new Promise(function (res, rej) {
                try { res(JSON.parse(body)); }
                catch (e) { rej(e); }
              });
            }
          });
        };
        xhr.onerror = function () { reject(new Error('Error de red')); };
        xhr.ontimeout = function () { reject(new Error('Tiempo agotado')); };
        if (options.body) { xhr.send(options.body); } else { xhr.send(); }
      });
    };
  }
})();
