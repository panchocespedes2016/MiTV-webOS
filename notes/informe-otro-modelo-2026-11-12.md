# Informe: cómo el otro modelo resolvió MiTV webOS

Fecha: 2026-11-12 (mañana). Verificado en vivo en la TV por Mia entre las 06:22 y las 06:40 EST.
Evidencia guardada en: `~/workspace/mitv-webos/otro-modelo-tv-20261112/om/`
(app, servicio, roles y `services.d` copiados tal cual están en la TV).

## Veredicto en una línea

Sí, lo resolvió. Y no con un truco: encontró y corrigió errores concretos míos
que yo había diagnosticado mal, y completó dos piezas que a mí me faltaban.
Lo verifiqué en vivo, no me lo contó nadie: **la app ahora muestra 1.448 canales
en vivo con sus conteos por categoría y con guía (EPG) en pantalla**.

## Lo verificado en vivo ahora mismo (números medidos)

- **Canales en vivo: 1.448** (ayer: 0). Categorías con conteo real, por ejemplo:
  BOLIVIA 92, 24/7 61, DEPORTES 66, EVENTOS DIARIOS 83, USA SPORTS 65,
  ESP DEPORTES 71, CINE 88, TODO 1448. Historial 12, Favoritos 0.
- **Películas 10.919, series 2.727** en la caché de la app.
- **EPG renderizando**: en la lista se ve p. ej. `Bo: Unitel — Programación Local
  06:00–07:00`, `24/7 Acapulco Shore — Programación Local`, con numeración y ☆.
- **Bucle de eventos vivo**: prueba de temporizador por CDP responde TIMER-OK en 2 s.
- **Servicio Luna `com.mitv.webos.fetch` corriendo**: PID 5547, responde `ping`
  con `returnValue: true` y al pedirle el JSON chunked de pruebas devuelve
  `{"status": "ok", "channels": 1565}`, status 200. Es el mismo JSON que al
  navegador le colgaba el bucle 12 segundos.
- **Sobrevive al reinicio**: la TV se reinició esta mañana ~06:14 EST y el
  servicio estaba corriendo a las 06:22 sin que nadie lo arrancara a mano.
- **Disco raíz sigue al 100% (0 KB libres)**: lo resolvió SIN liberar espacio.
- Caché en la TV: `mitv.content` = 3.769.111 caracteres con los 1.448 canales.

Trabajó directo en la TV, no por la pi3: en `/home/eph/` no hay ningún archivo
nuevo después de las 13:13 de ayer (todo lo mío). Sus huellas en la TV tienen
fecha 11-nov 14:26 (renombró mi archivo de rol) y 21:47–22:52 (el arreglo).

## Problema por problema: mi bloqueo → su solución

### 1. El servicio Luna no arrancaba — yo lo atribuí a permisos y a falta de espacio

Mi diagnóstico era: "Not permitted to send", la cárcel (jail) no se puede crear,
cgroup EACCES, raíz llena. Lo dejé como bloqueado.

**Su solución, en tres piezas:**

**(a) Mi `idleTimer` mataba el servicio al arrancar — error mío, mal diagnosticado.**
Yo puse `idleTimer: 31536000` (1 año) "para que no saliera por inactividad".
El valor pasa por un `setTimeout` de 32 bits (máximo ~2.147.483 s ≈ 24,8 días);
31.536.000 s desborda el entero y el temporizador dispara casi de inmediato,
matando el servicio antes de la primera petición. Eso explica el "no active
activities, exiting" a los 5 s que yo atribuí al ActivityManager: el servicio
nunca tuvo oportunidad de responder. Él lo dejó en `604800` (7 días), con el
porqué escrito en el comentario. Verificado por diff: es el ÚNICO cambio en
`service.js` respecto a mi versión.

**(b) Los roles: nombre, esquema y el rol de la app que me faltaba.**
Yo puse `com.mitv.webos.fetch.json` (esquema de servicio) en
`/var/luna-service2/roles.d/` y no funcionó. Él puso DOS archivos siguiendo la
convención de nombres de los demás servicios en ese directorio (que yo no
había mirado con cuidado):

- `com.mitv.webos.app.json` — rol de la APP: `com.mitv.webos` puede llamar
  en salida a `com.mitv.webos-*`. Esto es lo que permite a la app hablar con
  el servicio, y es justo la hipótesis que yo dejé anotada como "sin explorar".
- `com.mitv.webos.fetch.service.json` — rol del SERVICIO, con inbound y
  outbound `*` sobre sí mismo.
- Mi archivo lo renombró a `com.mitv.webos.fetch.json.bak` (14:26).

**(c) Arrancar sin jailer, como root.**
Creó `run-root.sh` y cambió el `Exec` del archivo D-Bus
(`/var/luna-service2/services.d/com.mitv.webos.fetch.service`) para que
apunte a él. El script ejecuta `bootstrap-node.js` directamente como root,
con un lanzador sin cgroup (`/tmp/run-js-service-no-cgroup`) y el directorio
de desarrollo `/var/palm/ls2-dev`. La clave, escrita en su propio comentario:
`bootstrap-node.js` solo puede registrar su rol LS2 (`pushRole`) si corre
con uid 0 — lo comprobé leyendo el código fuente: si `process.getuid() === 0`,
empuja los roles `pub`/`prv` del servicio al bus. Al correr como root se
salta dos muros de golpe: la cárcel que no se podía crear en raíz llena y el
cgroup sin permiso. El servicio queda registrado en
`/var/palm/ls2-dev/services/pub/com.mitv.webos.fetch.service`.
Detalle que me delató el proceso: su `argv[0]` es el nombre del servicio, por
eso `ps | grep node` no lo encontraba; hay que buscarlo por PID (5547) o por
su cmdline.

### 2. Yo mandaba TODO por el servicio; él lo dejó solo como respaldo

Mi v14 enrutaba todas las URLs remotas por `fetchViaService`. Él invirtió el
orden en `httpGetText`: **XHR directo primero, servicio solo si el XHR falla**.
El motivo está en su comentario: las respuestas grandes (EPG ~31 MB, VOD
~11 MB) superan el límite de tamaño de mensaje de LS2 y el servicio falla con
"Message status unknown". Mi diseño habría fallado con las respuestas grandes
aunque el servicio hubiera arrancado. Ahora el servicio solo carga lo pequeño
y chunked (los JSON del panel Xtream), y lo grande va por XHR directo.
Consecuencia a vigilar: cada endpoint chunked paga primero el cuelgue del XHR
antes de caer al respaldo, así que el sync puede tardar minutos y la app verse
quieta mientras tanto; una vez termina, el bucle responde normal (verificado).

### 3. El parser de EPG con DOMParser habría matado la app

Mi `Epg.load` construía el árbol DOM de un XMLTV de ~31 MB (~90.000 programas).
Él lo reescribió como escáner lineal por texto, sin construir árbol: solo
conserva los programas de los canales de la lista activa y dentro de una
ventana de −12 h a +72 h, y capa la descripción a 600 caracteres. Su comentario
dice el porqué: el DOMParser agota la memoria del renderer y mata la app.
Las dos llamadas a `Epg.load` ahora pasan `State.allChannels` como filtro.

### 4. La URL de stream en vivo no existía — los canales habrían cargado sin sonar

En la caché los canales traen `"streamUrl": ""`: mi `normalizeLive` no la
incluye. Yo nunca llegué a tener canales que reproducir, así que no lo había
detectado. Él añadió `resolveLiveStream`: al abrir el preview o el reproductor,
si el canal no trae URL, la construye en ese momento con las credenciales
guardadas (`loadCredPromise` + `liveStreamUrl(servidor, usuario, clave,
streamId)`). Sin esto, los 1.448 canales se verían pero no sonaría ninguno.

### 5. Los conteos por categoría (tu recordatorio de ayer)

Mi v14 ya calculaba los conteos, pero con 0 canales todos daban 0. Ahora se ven
reales en pantalla (ver números arriba). Tu recordatorio —"aún no aparece el
número de canales por categoría"— queda cerrado y verificado.

### 6. La anomalía de v13: en vivo 0 incluso por el servidor local

Quedó resuelta de facto (ahora 1.448), pero **sin causa única demostrada**.
El otro modelo no tocó el parseo de la lista en vivo; lo único que cambió en
esa ruta es el `httpGetText` (XHR primero + respaldo). No puedo afirmar con
certeza si en v13 el problema era el orden del sync, el endpoint concreto o
el servidor local: lo probado es que con la ruta actual la lista llega
completa. Lo dejo así, sin inventar la causa.

## Lo que NO quedó resuelto (pendiente, verificado)

- **Reparto/director de películas**: NO está en la caché (0 de 10.919 películas
  tienen director o reparto guardados). No es un fallo: esa información solo se
  pide al abrir la ficha de cada película (`get_vod_info` bajo demanda), no
  durante el sync. La vía que la trae es la misma ya reparada (XHR + respaldo),
  pero **nadie la ha verificado en pantalla todavía**: hay que abrir una
  película y mirar si aparecen "Director:" y "Reparto:". Eso lo verificas tú
  con un toque, o lo verifico yo si me lo pides.
- **El index.html de debug sigue en la TV**: hay que restaurar el limpio cuando
  todo esté verificado (quedó pendiente desde el 9-nov).
- **El servicio vive SOLO en la TV**: no está en el `.ipk` ni en mi workspace.
  Mi `build_ipk.sh` empaquetaba el servicio con MI `service.js` (el del bug) y
  MIS roles: reinstalar desde mi `.ipk` lo rompería. Antes de cualquier
  reinstalación hay que sincronizar el paquete con los archivos de la TV
  (ya copiados a `otro-modelo-tv-20261112/om/`).
- **El HLS nativo con "mejortv"**: el go/no-go final sigue siendo que un canal
  en vivo suene en la TV. Los canales están, las URLs se construyen al abrir,
  pero yo no puedo pulsar play desde aquí. Esa prueba es tuya, en el sillón.

## Mi evaluación honesta del nivel

Lo que demuestra: conocimiento de webOS por dentro, no solo de JavaScript.
Leyó `bootstrap-node.js` (pushRole solo con uid 0), conocía el límite de
`setTimeout` de 32 bits, el límite de tamaño de mensaje de LS2, la convención
de nombres de `roles.d`, y el límite de memoria del renderer de Chromium 38.
Y —esto es lo que más vale— cada arreglo lleva el PORQUÉ escrito en el
comentario, con números: 604800 s, 24,8 días, 31 MB, ventana −12 h/+72 h.

Mis errores, dichos en claro:

1. El `idleTimer` de 1 año era un bug mío y lo diagnostiqué como problema de
   permisos/actividad. No probé nunca el servicio con un valor cuerdo.
2. No leí la convención de nombres de `roles.d` ni probé el rol de la app,
   aunque lo tenía anotado como hipótesis.
3. Asumí que el jailer era el único camino para arrancar un servicio, y no
   miré `bootstrap-node.js` ni `run-js-service` por dentro.
4. Diseñé "todo por el servicio" sin considerar el límite de tamaño de LS2.
5. No detecté que `streamUrl` venía vacío ni que el DOMParser de 31 MB era un
   riesgo, porque nunca llegué a tener canales ni EPG real que procesar.
6. Hoy mismo: mis scripts CDP tenían el ID de página viejo fijo y devolvían
   HTTP 500; el fallo era mi script, no la TV. Hay que re-leer `/json/list`
   en cada uso.

Nada de esto quita que el grueso del trabajo previo (la app espejo del
Firestick, el Guardar, la causa raíz del chunked, el DownloadManager probado
y descartado con pruebas, el servicio en sí y su `fetchViaService`) era mío y
sigue siendo la base sobre la que él construyó: su cambio en `service.js` es
de una línea sobre mi archivo, y su `httpGetText` conserva mi función
`fetchViaService` como respaldo. Fue un relevo, no un empezar de cero.

## Archivos de evidencia (copiados de la TV el 12-nov ~06:27 EST)

- `otro-modelo-tv-20261112/om/app/app-v14.js` — versión actual en la TV
  (146.028 bytes, md5 `0f5e5b1c…`; la mía era de 141.604).
- `otro-modelo-tv-20261112/om/app/app-v14.js.prelive.bak` (144.892) — tras el
  arreglo 1 (XHR + EPG), antes del arreglo 2 (stream en vivo).
- `otro-modelo-tv-20261112/om/app/app-v14.js.prexhr.bak` (141.604) — mi v14,
  antes de sus dos ediciones.
- `otro-modelo-tv-20261112/om/service/service.js` (2.725) — con idleTimer 604800.
- `otro-modelo-tv-20261112/om/service/run-root.sh` — arranque sin jailer.
- `otro-modelo-tv-20261112/om/roles/com.mitv.webos.app.json`,
  `com.mitv.webos.fetch.service.json` — los dos roles que funcionan.
- `otro-modelo-tv-20261112/om/servicesd/com.mitv.webos.fetch.service` —
  D-Bus Exec apuntando a run-root.sh.
- `otro-modelo-tv-20261112/om/app/index-tv.html` — index con debug, tal cual.
