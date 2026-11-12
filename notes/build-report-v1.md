# MiTV webOS v1.0.0 — Reporte de construcción

**Fecha:** 2026-11-09
**Destino:** TV LG webOS 3.4.3 (Chromium 38)
**Base:** MiTV Fire TV v1.0.22 (spec `notes/firestick-spec.md`) + `notes/webos-spec.md`
**Estado:** Construida y verificada por sintaxis y por pruebas automatizadas en jsdom. **Sin probar en el TV real.**

## Qué se construyó

Carpeta `~/workspace/mitv-webos/app/`:

| Archivo | Descripción |
|---|---|
| `appinfo.json` | id `com.mitv.webos`, title MiTV, type web, main index.html, icon 80×80, largeIcon 130×130, version 1.0.0, resolution 1920×1080, `disableBackHistoryAPI: true`, vendor MiTV. JSON válido. |
| `index.html` | Punto de entrada. Carga `css/app.css`, `js/polyfills.js`, `js/webos.js`, `js/app.js`. Contiene el único `<video>` (compartido entre preview y reproductor), el overlay del reproductor, el OSD, el diálogo modal, el toast y la pantalla de carga. |
| `icon.png` (80×80), `largeIcon.png` (130×130), `splash.png` (1920×1080) | Generados con PIL (`notes/gen_icons.py`): fondo oscuro `#0D0D0F`, triángulo de play rojo y texto «MiTV» (blanco + rojo). PNG válidos, dimensiones exactas. |
| `css/app.css` | Tema oscuro espejo del Firestick (colores §7.1 del firestick-spec). Medidas dp→px con factor 2 (xhdpi). Foco de dos capas (borde exterior rojo `#D21F2B` + interior blanco). Sin variables CSS ni grid (Chromium 38). |
| `js/polyfills.js` | `fetch` vía XHR, `Object.assign`, `Array.from`, `Array.prototype.includes`, `Element.matches`. Solo define lo que falta. (Promise es nativo en Chromium 38, no se polifila.) |
| `js/webos.js` | **Librería real webOSTV.js v1.2.11 de LG** (15.229 bytes), descargada del repositorio de Jellyfin (`jellyfin-webos`, rama master). Expone `window.webOS` con `service.request`, `platformBack`, `deviceInfo`, etc. Sin arrow functions ni const/let (ES5). La URL del portal de LG devolvió 404; la copia de Jellyfin es la misma librería publicada por LG. |
| `js/app.js` | Toda la lógica (~3.200 líneas, ES5 estricto). Verificado con `node --check`. |

## Funcionalidad implementada (app.js)

- **8 pestañas en orden exacto:** Inicio, TV en vivo, Películas, Series, Deportes, Guía, Ajustes, Buscar (última).
- **TV en vivo / Deportes / Guía:** 3 columnas (categorías: Historial, Favoritos, Todo, grupos; lista en una sola columna; panel de preview). Preview silenciada que arranca 600 ms después de enfocar el canal. OK abre la pantalla completa. Números de canal (teclas 0–9) saltan al canal por posición.
- **Un solo `<video>`:** se mueve (reparentado) entre la caja de preview y el overlay del reproductor; se cambia `src` + `load()` al cambiar de canal. HLS nativo (URL `.m3u8`). Pantalla completa por overlay CSS, sin API Fullscreen.
- **Reproductor (OSD):** auto-oculta a los 5 s; cualquier tecla lo muestra y enfoca Pausa. Botones: −10 s / Pausa / +10 s (solo VOD), Aspecto (5 modos: Original, Ajustar, Llenar, Zoom, Estirar), Audio, Subtítulos, Atrás. Progreso guardado cada 5 s y al salir; reanuda si > 5 s. Al terminar, marca Visto.
- **Películas / Series:** parrilla de 5 columnas con ventana de filas (no renderiza miles de tarjetas a la vez). Ficha con póster, título, año, valoración, sinopsis, género/director/reparto (vía `get_vod_info` / `get_series_info`), botones Reproducir/Continuar, Favorito, Marcar visto, Atrás. Series: lista de episodios por temporada con estado (Visto / Continuar %).
- **Inicio:** Continuar viendo (fracción 0,03–0,95), Canales destacados, Películas populares, Series populares.
- **Guía:** TODOS los canales con programa actual y siguiente (ahora/siguiente por canal).
- **Buscar:** insensible a acentos (mapa manual, sin `String.normalize`), mínimo 2 caracteres, debounce 200 ms, resultados agrupados (Canales / Películas / Series, topes 30/40/40).
- **Ajustes:** Listas, Añadir lista, Sincronizar ahora, Actualizar guía (EPG), Borrar caché de imágenes, Acerca de.
- **Favoritos (★/☆), Historial (últimos 15 por sección), Continuar viendo, Visto (≥0,95)** en `localStorage`. Las credenciales **NO** van en `localStorage`.
- **Credenciales Xtream:** pantalla de configuración inicial (primera vez) que pide servidor, usuario y contraseña una sola vez. Se guardan en **DB8** (`luna://com.palm.db`, kind `com.mitv.webos:1`, `private: true`) para sobrevivir a actualizaciones. Si no hay webOS (navegador de escritorio), quedan solo en memoria para la sesión y se avisa. Al editar una lista y dejar la contraseña vacía, se reutiliza la guardada en DB8. **Ninguna credencial real en el código, en archivos ni en este reporte** (solo placeholders como `https://ejemplo.com` / `usuario` / `****`).
- **API Xtream (§4 del firestick-spec):** `player_api.php` (auth `user_info.auth`, `get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_series_categories`, `get_series`, `get_vod_info`, `get_series_info`), `xmltv.php` para EPG. URLs de stream `{server}/live/{u}/{p}/{id}.m3u8`, `/movie/…`, `/series/…`. Codificación de consulta con `+` y de ruta con `%20`. M3U también (clasificación por `group-title` y extensión, separadores `###` ignorados, año extraído del nombre).
- **EPG (XMLTV):** parseo con `DOMParser` en memoria (v1; no se persiste). Mapa nombre normalizado → id de canal; nombres ambiguos se descartan (`!AMBIG!`). Búsqueda binaria del programa actual. `xmltv.php` con usuario/contraseña de DB8.
- **Navegación por mando:** flechas 37–40, OK 13, Atrás 461 (gestionado a mano; en Inicio sale con `platformBack()`), Rojo 403 como tecla menú/favorito (el mando webOS no tiene una tecla ☰ estándar documentada; ver pendientes). Foco siempre visible. Regla de oro: si la siguiente fila no se puede enfocar, el foco se queda donde está.
- **Marquesina universal:** solo en el elemento enfocado y solo si el texto no cabe; ~40 dp/s (80 px/s), pausa 2 s al inicio, 5 s al final, regreso, repetición infinita.
- **Listas virtuales:** canales y parrillas renderizan solo una ventana (30 filas / 6 filas de parrilla) para no llenar el DOM/RAM del TV con 1.500+ canales o 10.000+ películas.

## Verificación realizada (en este VM, sin TV)

- `node --check` en los 3 JS: **OK**. Sin `=>`, `const`/`let`, `async`/`await`, `class`, `import`/`export` en `app.js` ni `polyfills.js`.
- `appinfo.json`: JSON válido, los 10 campos obligatorios presentes.
- Imágenes: PNG válidos con las dimensiones exactas.
- **jsdom (DOM real):** 21/21 en la suite principal (arranque, 8 pestañas, Inicio, TV en vivo, Películas, ficha, Buscar, Ajustes, Guía) + 7/7 en cambio de categoría (Todo muestra 30 filas en vivo, 8 deportes, 8 series, 12 películas; navegación de parrilla) + 22/22 en parsers (norm sin acentos, M3U, `parseXmltvTime`, EPG con ambiguo) + 17/17 en editor/setup (primera vez, añadir lista, cambio Xtream↔M3U, cancelar). Total **67 comprobaciones, 0 fallos reales** (2 "fallos" iniciales en la suite principal eran artefactos del test: Historial vacío por defecto en Deportes/Series; confirmado correcto al cambiar a Todo).
- Búsqueda de credenciales reales en todos los archivos: **sin coincidencias** (solo un comentario que explica que las credenciales viven en DB8).

## Qué quedó pendiente o sin verificar (NO probado en el TV)

1. **Developer Mode en el TV 2017:** sin confirmar que la instalación por `ares-install` funcione en webOS 3.4.3 (una guía externa afirma que hace falta webOS 4.0+; la documentación oficial dice 3.0+). Es el primer paso antes de instalar.
2. **HLS nativo con los streams reales:** sin confirmar que el `<video>` de webOS 3.4.3 reproduzca los `.m3u8` del proveedor (el spec advierte: sin EXT-X-MEDIA, sin discontinuidades en 3.x, segmentos de audio/vídeo de igual duración). Si falla, la alternativa es hls.js (sin verificar en Chromium 38; las versiones actuales piden Chrome 47+).
3. **Reparentado del `<video>`:** el cambio de preview a pantalla completa mueve el mismo elemento entre contenedores; en Chromium debería mantener la reproducción, pero no está probado en el TV.
4. **DB8:** sin probar que el kind privado sobreviva a `ares-install` (actualización) ni que `putKind`/`put`/`find` funcionen en 3.4.3. El código tiene fallback a memoria de sesión si DB8 no responde.
5. **Tecla menú (☰):** el mando webOS no tiene una tecla menú con keyCode estándar documentado; se mapeó el botón **Rojo (403)** como menú/favorito. Hay que probar en el mando real si alguna otra tecla (p. ej. el botón de ajustes del Magic Remote) envía un código distinto y, si es así, mapearlo.
6. **Audio/subtítulos:** el diálogo de pistas depende de `video.audioTracks` / `video.textTracks`, que en el HLS nativo de webOS 3.x pueden no exponerse; en ese caso muestra «Sin pistas disponibles».
7. **Borrar caché de imágenes:** webOS no expone una API para borrar la caché del navegador; la opción limpia la EPG en memoria y fuerza la recarga de imágenes. No es un borrado real de caché de disco.
8. **User-Agent:** en webOS no se puede fijar la cabecera `User-Agent` (prohibida); la TV envía su propio UA webOS. El servidor Xtream no exige un UA concreto, pero si el proveedor lo exigiera, habría que revisarlo.
9. **EPG en memoria:** el XMLTV completo (~30 MB) se procesa en memoria y no se persiste (v1). En un TV con 1–1,5 GB de RAM puede ser pesado; si la app se cierra por memoria al sincronizar la guía, habrá que paginar o persistir el EPG procesado.
10. **Pantalla de carga / splash:** el splash (`splash.png`) se referencia en `appinfo.json` como `splashBackground`; no está confirmado que webOS 3.4.3 lo use (algunas versiones lo ignoran).
11. **Números de canal:** el salto por número usa la posición en la lista filtrada (1-based), no el número del proveedor (`num` del panel) cuando difiere. En el Firestick v1.0.19 el número es el del proveedor; aquí se usa la posición por simplicidad de v1.

## Próximos pasos

1. **Verificar en el TV:** (a) que Developer Mode se instale en el LG 2017, (b) que el HLS nativo reproduzca un stream real del proveedor.
2. **Empaquetar:** con el SDK de webOS instalado (`ares-package`): `ares-package app/` genera `com.mitv.webos_1.0.0_all.ipk`. (El empaquetado no se hizo aquí: no hay SDK de webOS en este VM.)
3. **Instalar en el TV:** conectar el TV con `ares-setup-device` (puerto 9922, usuario `prisoner`, llave vía `ares-novacom --getkey`), luego `ares-install --device <nombre> com.mitv.webos_1.0.0_all.ipk` y `ares-launch --device <nombre> com.mitv.webos`.
4. **Primera ejecución:** la app pedirá servidor, usuario y contraseña (una sola vez, en el TV). Después sincroniza y muestra Inicio.
5. **Probar en el TV con el mando:** navegación por las 8 pestañas, preview (600 ms), pantalla completa, OSD, ficha de película/serie, búsqueda, favoritos, y la tecla menú (Rojo).
6. **No publicar en GitHub** (indicado en la tarea).

## Archivos de trabajo (no forman parte de la app)

- `notes/gen_icons.py` — script que generó los 3 PNG.
- `notes/firestick-spec.md`, `notes/webos-spec.md` — especificaciones fuente.
- Pruebas (en `/tmp`, efímeras): `mitv-webos-smoke.js`, `mitv-webos-jsdom.js`, `mitv-webos-jsdom2.js`, `mitv-webos-jsdom3.js`, `mitv-webos-parsers.js`, `mitv-webos-editor.js`.
