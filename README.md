# MiTV webOS

MiTV nativa para TV LG con webOS 3.4.3 (2017), espejo de MiTV Fire TV v1.0.22:
TV en vivo, Películas, Series, Deportes, Guía (EPG), Ajustes y Buscar, con
marquesina, favoritos, historial y "continuar viendo".

**Estado: funciona.** Verificado en la TV el 2026-11-12: 1.448 canales en vivo
con conteo por categoría y guía en pantalla, 10.919 películas, 2.727 series,
servicio Luna corriendo y sobreviviendo al reinicio. El informe de cómo se
resolvió el último problema (el servicio Luna que no arrancaba) está en
`notes/informe-otro-modelo-2026-11-12.md`.

## Requisitos

- TV LG con webOS 3.4.3 **rooteada** (Homebrew Channel; SSH root).
- Chromium 38: el código es ES5 estricto (nada de `=>`, `let`, `fetch` ni
  módulos). Sin eso, la app se queda en negro.
- La app NO guarda credenciales en el código: el usuario las teclea una vez
  en la TV (Ajustes → Listas) y quedan solo en la TV.

## Contenido

- `app/` — la app: `index.html` (limpio, sin depuración), `appinfo.json`
  (`com.mitv.webos`, v1.0.0), `js/app-v14.js` (versión vigente; `app.js` y
  `app-v4.js`…`app-v13.js` son el historial de la iteración), CSS, iconos.
- `service/com.mitv.webos.fetch/` — servicio Luna nativo (Node) que descarga
  las respuestas del panel Xtream con el stack HTTP de Node. Hace falta
  porque Chromium 38 se cuelga con respuestas `Transfer-Encoding: chunked`
  (Cloudflare) y el cuelgue bloquea el bucle de eventos entero. La app lo
  usa solo como respaldo: primero intenta XHR directo y solo si falla pide
  al servicio (las respuestas grandes, EPG ~31 MB, superan el límite de
  tamaño de mensaje de LS2).
- `service/roles-luna/` — los dos roles LS2 (`com.mitv.webos.app.json` y
  `com.mitv.webos.fetch.service.json`) y la activación D-Bus: van en
  `/var/luna-service2/roles.d/` y `/var/luna-service2/services.d/` de la TV,
  NO dentro del `.ipk`. Ver `service/roles-luna/README-ROLES.md`.
- `tools/build_ipk.sh` — empaqueta el `.ipk` a mano (formato `ar`, como
  `ares-package`), porque el CLI de webOS no se pudo instalar en esta máquina.
- `notes/` — especificación del Firestick que la app espeja, informe de
  construcción y el informe del arreglo del servicio Luna.

## Antes de compilar: una línea

En `service/com.mitv.webos.fetch/service.js`, `ALLOWED_HOSTS` trae un
marcador. Pon ahí el host de TU servidor Xtream (y el de tu servidor de
pruebas, si lo usas). El host real no va en este repositorio, igual que las
credenciales nunca van en código.

## Compilar el .ipk

```sh
bash tools/build_ipk.sh
# genera com.mitv.webos_1.0.0_all.ipk
```

## Instalar en la TV (rooteada)

El `ar` del BusyBox de la TV rechaza el `.ipk` ("unrecognized file type"),
así que los archivos se despliegan por SSH con `cat >` (los binarios, en
base64 primero). Resumen:

```sh
# 1. Copiar la app a /media/developer/apps/usr/palm/applications/com.mitv.webos/
#    y el servicio a /media/developer/apps/usr/palm/services/com.mitv.webos.fetch/
# 2. Roles y activación D-Bus según service/roles-luna/README-ROLES.md
# 3. Reiniciar la app: buscar su processid en
#    luna-send com.palm.applicationManager/running, kill <pid> y
#    luna-send com.palm.applicationManager/launch '{"id":"com.mitv.webos"}'
#    (un simple relanzamiento de una app en ejecución NO recarga el código)
```

Regla de la caché: WebAppMgr cachea el JS por nombre de archivo. Cada
arreglo va en un archivo versionado nuevo (`app-v15.js`, …) y se actualiza
`index.html`; verificar por CDP que la página carga el script nuevo antes de
dar el arreglo por aplicado.

## Depuración

WebAppMgr corre con `--remote-debugging-port=9998`. Desde la red local,
`curl http://<IP-TV>:9998/json/list` da el `webSocketDebuggerUrl` (el ID de
página cambia en cada arranque; hay que re-leerlo). El `index.html` del
repositorio es el LIMPIO: la TV puede tener una copia con `#bootlog` para
diagnóstico; no confundirlas.

## Licencia

MIT. Ver `LICENSE`.
