# MiTV Fire TV v1.0.22 — Especificación para réplica webOS

Especificación de comportamiento de la app Android Fire TV **MiTV v1.0.22**
(paquete `com.mitv.player`, versionCode 23, versionName `1.0.22`), extraída del
código fuente en `~/workspace/mitv-firestick/` (Kotlin, Media3/ExoPlayer 1.4.1,
OkHttp 4.12.0, Glide 4.16.0, RecyclerView 1.3.2; sin librería Leanback — Views y
Fragments planos). APK ~6,05 MB. Última versión instalada y verificada en el
Fire TV Stick el 2026-11-05. La lista de referencia ("mejortv") tenía
**1.565 canales** en el momento de la v1.0.22.

Propósito de este documento: servir de referencia única para construir la app
nativa webOS con el mismo comportamiento, aspecto y navegación. **No contiene
código webOS.** Donde el código no deja claro un detalle, se marca
explícitamente como `SIN CONFIRMAR EN EL CÓDIGO` en vez de inventarlo.

Nota general: la app es **solo lectura y reproducción** — no hay descargas de
vídeo. Tampoco hay parrilla de EPG por horas: la "Guía" es una lista de
ahora/siguiente por canal (ver §1.6).

---

## 1. Pestañas y su orden exacto

Barra de pestañas superior, en un `HorizontalScrollView` con `TextView`s de
16sp, padding 11dp vertical / 8dp horizontal. El orden es fijo y **Buscar es
la última pestaña**:

| # | Clave | Etiqueta | Contenido |
|---|-------|----------|-----------|
| 1 | `home` | ⌂ Inicio | Continuar viendo, canales destacados, películas y series recientes |
| 2 | `live` | 📺 TV en vivo | Lista de canales en directo con preview |
| 3 | `movies` | 🎬 Películas | Parrilla de películas |
| 4 | `series` | 📚 Series | Parrilla de series |
| 5 | `sports` | ⚽ Deportes | Igual que TV en vivo, solo canales de deportes |
| 6 | `guide` | 📅 Guía | TODOS los canales con ahora/siguiente |
| 7 | `settings` | ⚙️ Ajustes | Listas, sincronizar, EPG, caché, acerca de |
| 8 | `search` | 🔍 Buscar | Búsqueda en canales, películas y series |

La barra de pestañas solo se ve en la parte superior de la pantalla principal.
El reproductor a pantalla completa es otra pantalla (no hay pestañas).

### 1.1 Inicio (`home`)

`ScrollView` vertical. Secciones, cada una con título 20sp en negrita y
subtítulo 15sp tenue al 75% del tamaño, margen superior 16dp entre secciones.
Cada sección es una fila horizontal (`HorizontalScrollView` sin barra de
desplazamiento). Si una sección no tiene datos, no se muestra (estado vacío).

1. **"Continuar viendo"** — subtítulo *"lo retomas donde lo dejaste"*.
   Películas y episodios en progreso (fracción vista entre 3% y 95%, ver §3.5),
   ordenados por última apertura descendente. Tarjeta de 250dp de ancho:
   imagen 140dp de alto (`CENTER_CROP`), título 15sp negrita, subtítulo 13sp
   tenue, barra de progreso 4dp en `accent2` si la fracción > 0. Clic:
   reanuda en el punto guardado. (Ver §3.5 para el límite exacto de elementos;
   en el código **no hay `take(N)`** en esta sección — se muestran todos los
   que estén en progreso.)
2. **"Canales destacados"** — subtítulo *"los que más ves"*.
   Los 10 canales más reproducidos (por número de reproducciones, solo los que
   tienen al menos 1). Baldosa de logo 170×96dp, nombre 14sp negrita centrado.
   Clic: reproduce el canal.
3. **"Películas populares"** — subtítulo *"lo más reciente de tu lista"*.
   A pesar del título, **no es por reproducciones: son las 12 películas más
   recientes por fecha de alta (`added` descendente)**. Tarjeta de póster
   150dp de ancho, imagen 210dp de alto, título 14sp negrita, subtítulo 12sp
   tenue. Clic: abre la ficha.
4. **"Series"** — subtítulo *"lo más reciente de tu lista"*.
   Las 12 series más recientes por `added` descendente. Mismas tarjetas que
   películas. Clic: abre la ficha.

### 1.2 TV en vivo (`live`)

Tres columnas horizontales:

- **Barra lateral de categorías**: 215dp de ancho, fondo `panel`, padding 8dp,
  margen derecho 14dp. Ver §1.2.1.
- **Lista de canales**: peso 1 (ocupa el resto). Una sola columna vertical.
  Ver §1.2.2.
- **Panel de preview**: 390dp de ancho, fondo `panel`, padding 16dp, margen
  izquierdo 14dp. Ver §1.2.3.

#### 1.2.1 Categorías (barra lateral)

Orden fijo, luego los grupos del proveedor en orden alfabético:

1. `🕘 Historial` (con conteo)
2. `★ Favoritos` (con conteo)
3. `Todo` (con conteo)
4. Grupos del proveedor, ordenados alfabéticamente, cada uno con su conteo.

Los conteos son el número de canales de esa categoría en la lista actual.
Si un canal no tiene grupo, cae en **"Sin categoría"**. Fila de categoría:
`TextView` 16sp, padding 12dp horizontal / 11dp vertical, fondo `card_bg`.
La seleccionada se muestra en color de texto normal y **negrita**; las demás
en `text_dim` y peso normal. La etiqueta y el conteo van separados por
espacios (`"Todo    1543"` — el formato exacto es `"$label    $count"`).

Al enfocar una categoría se aplica el filtro **de forma síncrona**: la lista
filtrada se calcula y se muestra en la misma llamada (la lista entera es
conocida al instante; no se arma "al vuelo"). El filtro cambia el contenido
de la lista de canales y la categoría queda seleccionada.

#### 1.2.2 Fila de canal

Fila horizontal, padding 14dp horizontal / 10dp vertical, margen inferior
9dp, fondo `focus_bg` (ver §7.3). Contenido, de izquierda a derecha:

1. **Número**: 56dp de ancho, 15sp, color `text_faint`. Es la **posición
   1-based dentro de la lista filtrada actual** (no el `num` del proveedor;
   el campo `providerNum` se guarda pero no se muestra). El ancho 56dp está
   dimensionado para 5 dígitos (v1.0.19).
2. **Estrella de favorito**: 30dp de ancho, 20sp. `☆` si no es favorito,
   `★` (dorada, color `star`) si lo es.
3. **Logo**: baldosa blanca 48×48dp (`logo_tile`: fondo blanco, borde
   `#444444` de 1dp, radio 8dp), imagen con `FIT_CENTER` y padding 4–5dp,
   margen derecho 10dp. Si no hay logo, se muestran las **primeras 5 letras
   del nombre** en 11sp negrita, color `#222222`, sobre el fondo blanco.
4. **Columna de información** (peso 1):
   - **Nombre**: 17sp negrita, una línea, con elipsis al final. Si el canal
     tiene catchup (`tv_archive == "1"`), se añade `"  ↺"` al final del nombre.
   - **Programa actual**: 14sp `text_dim`, una línea. Es el título del
     programa en curso según la EPG, o `"Sin información de guía"` si no hay
     EPG para ese canal.
   - **Barra de progreso del programa**: 4dp de alto, margen superior 6dp.
     Fondo `border`, relleno azul `progress_blue` con la fracción del
     programa ya transcurrida. Solo visible si hay programa en curso.
   - **Horas**: 12sp `text_faint`, margen superior 3dp, formato
     `"HH:mm – HH:mm"` (inicio – fin del programa actual).

#### 1.2.3 Panel de preview

Muestra el canal enfocado. Contenido (de arriba a abajo):

- **Vídeo en vivo**: `PlayerView` de 390dp de ancho × 201dp de alto, fondo
  negro, sin controles (`useController=false`), `keepScreenOn=true`.
  Reproduce **silenciado** (volumen 0), en bucle (`REPEAT_MODE_ONE`), y
  arranca **600 ms después de enfocar el canal** (tiempo de espera, "dwell").
  Ver §5.1.
- **Título**: 20sp negrita, `"N · nombre"` (N = posición 1-based en la lista
  filtrada).
- **Meta**: 14sp tenue: `"HH:mm – HH:mm · Termina en X min"` si hay programa
  en curso (X = minutos que faltan), o el nombre del grupo si no hay EPG.
- **Descripción**: 14sp tenue: título del programa + descripción del programa
  (si la EPG la trae).
- **Siguiente**: 14sp, dos líneas: `"A CONTINUACIÓN"` y
  `"título · HH:mm – HH:mm"` del siguiente programa. Si no hay siguiente,
  esta parte queda vacía.

### 1.3 Películas (`movies`) y Series (`series`)

Misma estructura para ambas (un solo fragmento con un modo por pestaña):

- **Barra lateral**: 250dp de ancho (más ancha que la de TV), fondo `panel`,
  padding 8dp, margen derecho 14dp. Categorías: `🕘 Historial`, `★ Favoritos`,
  `Todo`, luego los grupos ordenados alfabéticamente, con conteo cada uno.
  Mismo estilo de fila que en TV (16sp, `card_bg`).
- **Parrilla**: 5 columnas (`GridLayoutManager` con span 5), padding 4dp.
  Tarjetas con margen derecho 12dp y margen inferior 16dp.

**Tarjeta de película**: póster de 190dp de alto (`CENTER_CROP`, fondo
`card_bg` + borde `card_fg`), título 14sp negrita en una línea, subtítulo
12sp tenue `"año · categoría"`, línea de estado 12sp color estrella:
`"✓ Visto"` si está vista (≥95%) o `"⏵ Continuar"` si está en progreso.
Si no está ni vista ni en progreso, no hay línea de estado.

**Tarjeta de serie**: mismo póster y título; subtítulo 12sp tenue = solo la
categoría (sin línea de visto ni de continuar).

OK/Enter sobre una tarjeta abre su **ficha** (§1.3.1). La tecla menú (☰)
abre el menú de opciones de la tarjeta (§2.4).

#### 1.3.1 Ficha de película / serie

Pantalla aparte (`VodDetailActivity`), padding 40dp horizontal / 26dp
vertical, con `ScrollView`.

**Ficha de película:**

- Encabezado horizontal: póster 190×265dp + columna de información (margen
  izquierdo 22dp):
  - Título 30sp negrita.
  - Meta 16sp tenue: `"año · categoría · ★ rating · EXT"` (EXT = extensión
    del contenedor en mayúsculas, p. ej. `MP4`). Se omiten los campos vacíos.
  - Sinopsis 16sp tenue, margen superior 12dp.
  - Datos extra 14sp tenue, margen superior 8dp, una línea por campo
    (solo los que existan): `Duración: …`, `Género: …`, `Director: …`,
    `Reparto: …`, `Fecha: …`, `País: …`.
  - Mientras carga la información (petición `get_vod_info`, ver §4.4), se
    muestra `"Cargando información…"`.
- Fila de botones (margen superior 22dp), botones 17sp, padding 20dp
  horizontal / 11dp vertical, fondo `btn_bg`, margen derecho 12dp:
  - Si está en progreso: `"⏵ Continuar (H:MM:SS)"` + `"↺ Desde el inicio"`.
  - Si no: `"▶ Reproducir"`.
  - `"☆ Favorito"` / `"★ Favorito"` (según el estado).
  - `"✓ Marcar como visto"` / `"✓ Visto (quitar)"`.
  - Al abrir la ficha, el primer botón queda enfocado.

**Ficha de serie:**

- Mismo encabezado (póster 190×265, título 30sp, meta 16sp = solo categoría,
  sinopsis).
- Botón `"☆/★ Favorito"` (margen superior 16dp). Al abrir, este botón queda
  enfocado.
- Estado de episodios: `"Cargando episodios…"` mientras carga
  (`get_series_info`), luego `"N episodios"` o `"Sin episodios disponibles."`.
- **Lista de episodios**: 520dp de alto, margen superior 12dp. Fila 16sp,
  padding 14dp horizontal / 12dp vertical, margen inferior 8dp, fondo
  `focus_bg`. Texto: `"T{n} E{n} · {título}   ·   {duración}   ·   {estado}"`
  (p. ej. `"T1 E2 · Piloto   ·   42 min   ·   ✓ Visto"`). El estado es
  `"✓ Visto"` si el episodio está visto (≥95%), `"⏵ pos / dur"` si está en
  progreso (p. ej. `"⏵ 12:34 / 42:10"`), o vacío si no se ha empezado. Si el
  episodio no tiene título, se usa `"Episodio {n}"`.
- Clic en un episodio: lo reproduce (con reanudación si estaba en progreso).
- Serie M3U (sin `serieId`, es decir, una URL directa): en lugar de la lista
  de episodios hay un solo botón `"▶ Reproducir"` que reproduce la URL
  directa, con reanudación.

### 1.4 Deportes (`sports`)

Es el **mismo fragmento que TV en vivo** (`LiveFragment` con `sportsOnly=true`).
Filtra los canales cuyo grupo, normalizado (insensible a acentos y
mayúsculas), contiene `"sport"` o `"deporte"`. Todo lo demás es idéntico a
§1.2: misma barra lateral (categorías calculadas solo sobre los canales de
deportes), mismas filas, mismo preview, mismo menú. Importante: el historial
de un canal deportivo pertenece a la sección `"sports"` sin importar desde
qué pantalla se abrió (ver §3.5).

### 1.5 Guía (`guide`)

**No es una parrilla por horas**: es una lista vertical de canales con el
programa actual y el siguiente (ahora/siguiente). Desde la v1.0.21 muestra
**TODOS los canales** (1.565 en la lista de referencia), con o sin EPG.

Disposición en dos columnas, igual que TV en vivo:

- **Barra lateral de categorías**: exactamente las mismas dimensiones que en
  TV (215dp de ancho, fondo `panel`, padding 8dp, margen derecho 14dp, filas
  16sp con `card_bg`). Categorías: `🕘 Historial`, `★ Favoritos`, `Todo`,
  grupos ordenados. Los conteos son los mismos que en TV (sobre todos los
  canales). El historial de la Guía es el de la sección `"tv"` (el mismo que
  en TV en vivo).
- **Lista de canales**: peso 1. Fila horizontal, padding 14dp horizontal /
  10dp vertical, margen inferior 8dp, fondo `focus_bg`:
  1. Número 56dp, 15sp, `text_faint` (posición 1-based en la lista filtrada).
  2. Estrella 30dp, 20sp (`☆` / `★`).
  3. Logo 54×54dp en baldosa blanca (margen derecho 14dp; sin logo, primeras
     5 letras del nombre en 11sp negrita `#222222`).
  4. Columna de información (peso 1):
     - Nombre 17sp negrita, una línea.
     - Línea "ahora" 14sp `text_dim`, una línea:
       `"AHORA · HH:mm–HH:mm · título  (NN%)"` (NN% = porcentaje del programa
       ya transcurrido). Si el canal no tiene EPG: `"sin EPG"`.
     - Línea "después" 13sp `text_faint`, una línea:
       `"DESPUÉS · HH:mm–HH:mm · título"`. Si no hay EPG: línea vacía.

OK/Enter sobre una fila **reproduce el canal** a pantalla completa. La tecla
menú (☰) alterna el favorito exactamente igual que en TV en vivo.

### 1.6 Búsqueda (`search`)

- **Campo de texto**: a todo lo ancho, hint
  `"Escribe para buscar en canales, películas y series…"`, 19sp, fondo
  `panel2`, padding 16dp horizontal / 12dp vertical. Al entrar en la pestaña,
  el campo recibe el foco y se abre el teclado en pantalla.
- **Búsqueda**: insensible a acentos y mayúsculas (normalización NFD: se
  quitan las marcas diacríticas y se pasa a minúsculas). Mínimo **2
  caracteres**; con menos se muestra (15sp `text_faint`):
  `"Escribe al menos 2 letras. La búsqueda ignora acentos y mayúsculas."`.
  Hay un **debounce de 200 ms** tras dejar de escribir. El índice de nombres
  normalizados se reconstruye cuando cambia el contenido.
- **Resultados**: agrupados, en un `ScrollView` bajo el campo (margen
  superior 14dp), con encabezado `"Canales (N)"` etc. (17sp negrita,
  margen superior 12dp):
  - Canales: máximo **30** resultados.
  - Películas: máximo **40** resultados.
  - Series: máximo **40** resultados.
- **Fila de resultado**: horizontal, padding 12dp / 9dp, margen inferior 8dp,
  fondo `focus_bg`. Canales: baldosa de logo 54×54dp. Películas/series:
  póster 44×62dp. Título 17sp negrita, subtítulo 13sp tenue:
  - Canal: subtítulo = nombre del grupo.
  - Película: subtítulo = `"año · categoría"`.
  - Serie: subtítulo = categoría.
- Clic en un canal: lo reproduce. Clic en película/serie: abre su ficha.
- Sin resultados: `"Sin resultados para «{texto}»."` (16sp `text_dim`).

### 1.7 Ajustes (`settings`)

Lista vertical de filas de ajuste. Cada fila: vertical, padding 16dp / 12dp,
margen inferior 9dp, fondo `focus_bg`; título 17sp negrita, subtítulo 13sp
`text_dim` (margen superior 3dp). Secciones (título 20sp negrita + subtítulo
15sp tenue al 75%, margen superior 18dp entre secciones):

1. **"Listas IPTV"** — subtítulo *"la activa se usa en toda la app"*.
   Una fila por lista guardada:
   - Título: `"● ACTIVA  {nombre}"` si es la activa, o `"{nombre}"` si no.
   - Subtítulo: `"XTREAM · {servidor}"` o `"M3U · {url}"`.
   - Clic: abre un diálogo con las opciones `"Marcar como activa"` (solo si
     no lo es), `"Editar"` y `"Eliminar"`. Eliminar pide confirmación:
     `"¿Eliminar «{nombre}»? Esta acción no se puede deshacer."` con botones
     Eliminar / Cancelar. **Marcar una lista como activa borra el contenido
     en caché y la EPG guardada, y luego sincroniza.** Eliminar la lista
     activa también borra contenido y EPG.
   - Última fila de la sección: `"＋ Agregar lista"` (subtítulo
     `"Xtream Codes o M3U"`), que abre el editor de listas (§1.7.1).
2. **"Contenido"**.
   - `"Sincronizar ahora"` — subtítulo:
     `"{N} canales · {N} películas · {N} series · Última: {fecha/hora}"`
     o `"… · Última: nunca"` si nunca se sincronizó. Al pulsar: sincroniza
     la lista activa (ver §9.3). Si no hay lista activa, toast
     `"No hay lista activa"`.
3. **"Guía (EPG)"**.
   - `"Actualizar guía ahora"` — subtítulo:
     `"Última actualización: {fecha/hora}"` o `"Última actualización: nunca"`.
     Al pulsar: descarga la EPG. Toast `"Descargando guía…"` y luego
     `"Guía actualizada"` o `"No se pudo actualizar la guía"`.
4. **"Caché de imágenes"** — subtítulo *"límite 500 MB"*.
   - `"Borrar caché de imágenes"` — subtítulo:
     `"En uso: {N} MB — las imágenes se vuelven a descargar al verlas"`
     (al abrir, primero muestra `"Calculando…"` mientras mide el tamaño en
     segundo plano). Al pulsar: borra la caché de imágenes (disco + memoria).
5. **"Acerca de"**.
   - Texto fijo: `"MiTV para Fire TV · Versión 1.0.22 (23)\nPaquete: com.mitv.player"`.

#### 1.7.1 Editor de listas (Agregar / Editar lista)

Pantalla aparte, padding 44dp horizontal / 28dp vertical.

- Título 26sp negrita: `"Agregar lista"` o `"Editar lista"`.
- Selector de tipo: dos botones 17sp, padding 20dp / 11dp, fondo `btn_bg`,
  margen derecho 12dp: `"Xtream Codes"` y `"M3U (URL)"`. El tipo no
  seleccionado se muestra con alfa 0,55. (Al editar una lista existente el
  tipo no se puede cambiar.)
- Campos: etiqueta 14sp `text_dim` (margen superior 12dp, inferior 4dp),
  entrada 17sp, fondo `panel2`, padding 14dp / 11dp, una sola línea.
  - **Xtream Codes**: Nombre (`"Nombre de la lista (ej: Mi proveedor)"`),
    Servidor (`"Servidor (ej: http://servidor.com:8080)"`), Usuario
    (`"Usuario"`), Contraseña (`"Contraseña"`, campo de contraseña).
  - **M3U (URL)**: URL de la lista (`"URL de la lista M3U"`), URL de EPG
    (opcional) (`"URL de la guía EPG (opcional)"`).
- Botón `"💾 Guardar lista"` 18sp, padding 22dp / 12dp, fondo `btn_bg`,
  margen superior 22dp.
- Validación al guardar (con estos mensajes de error exactos):
  - Nombre vacío → `"Falta el nombre de la lista"`.
  - Xtream, servidor no válido → `"Servidor no válido"`.
  - Xtream, falta servidor o usuario → `"Falta servidor o usuario"`.
  - M3U, URL no válida → `"URL de la lista no válida"`.
  - EPG no válida (si se escribió) → `"URL de EPG no válida"`.
  - Normalización del servidor: si falta el esquema se añade `http://`; el
    host se pasa a minúsculas; se quita la barra final. Una URL es válida
    solo si tiene esquema `http`/`https` y host.
- La **primera lista creada queda activa automáticamente**. Toast al guardar:
  `"Lista guardada y activa. Sincroniza desde Ajustes."` (si es nueva y quedó
  activa) o `"Lista guardada"`.
- Al abrir, el campo Nombre recibe el foco.

---

## 2. Modelo de navegación por mando

La app se maneja **solo con mando** (D-pad + OK + Atrás + Menú ☰). No hay
puntero. Todo el sistema de foco está construido sobre Views enfocables de
Android; en webOS habrá que reproducir su comportamiento equivalente.

### 2.1 Principios generales

- **El foco es el cursor.** Siempre hay exactamente un elemento enfocado
  (salvo transitorios). El elemento enfocado se distingue por su fondo
  (ver §7.3: borde blanco + acento rojo).
- **Movimiento geométrico estándar**: Arriba/Abajo/Izquierda/Derecha mueven
  el foco al elemento enfocable más cercano en esa dirección, con las
  excepciones y trampas descritas abajo.
- **La barra de pestañas es la raíz de la navegación**: desde cualquier
  contenido, Atrás o Arriba en la primera fila llevan a la pestaña.
- **El foco nunca se pierde**: hay varias capas de recuperación (ver §2.3).

### 2.2 Barra de pestañas

- **Izquierda/Derecha sobre una pestaña enfocada** mueve **explícitamente**
  a la pestaña vecina (no por geometría: el código lo hace por índice).
  Al cambiar de pestaña por Izquierda/Derecha, la nueva pestaña queda
  enfocada y se cambia la pantalla.
- **Abajo desde una pestaña** entra al contenido de esa pestaña (primer
  elemento enfocable).
- **Atrás en la pestaña Inicio**: sale de la app (comportamiento por defecto
  de Android). No hay botón de salida propio.
- **Regla clave (v1.0.15)**: una pestaña cambia de pantalla **solo cuando
  su ganancia de foco es explícita**. Antes de cada petición explícita de
  foco a una pestaña (cambiar de pestaña, Izquierda/Derecha, clic, foco
  inicial en Inicio, restauración tras pérdida de foco) se marca una bandera
  (`tabFocusExpected`) que el listener de foco de la pestaña consume. Si una
  pestaña gana el foco **sin** esa bandera (ganancia "de rebote", por ejemplo
  porque el sistema perdió el foco y buscó un sustituto), la pantalla **no
  cambia** y el foco vuelve al contenido que lo perdió (última vista de
  contenido enfocada si sigue visible, si no el mecanismo de restauración
  por posición del fragmento, si no la pestaña actual se queda con el foco).
  Las ganancias de foco mientras hay un diálogo abierto se dejan como están
  (no se aplica esta regla).
- Al tocar una pestaña con el puntero (clic), se selecciona sin enfocarla.

### 2.3 Pérdida de foco y restauración

El problema histórico de la app (v1.0.9–v1.0.18): al bajar rápido por una
lista, la fila enfocada se desmontaba (reciclaje) entre dos pulsaciones y el
foco se perdía o saltaba a otra lista/pestaña. La solución final tiene varias
capas; en webOS hay que reproducir el **efecto**, no el mecanismo:

1. **Trampa vertical en las listas** (`FocusTrapRecyclerView`): en una lista,
   una búsqueda de foco Arriba/Abajo cuyo resultado caiga **fuera de la
   lista** no mueve el foco: **el foco se queda donde está**. Izquierda/
   Derecha sí pueden salir de la lista (lista ↔ barra lateral). La lista de
   episodios de la ficha de serie es la excepción: Arriba **sí** puede salir
   hacia los botones del encabezado (`containVerticalFocus=false`).
2. **Gestor que no devuelve la misma fila** (`KeepFocusLinearLayoutManager` /
   `KeepFocusGridLayoutManager`): al buscar el siguiente elemento, primero se
   aplica el comportamiento estándar; solo en el borde real de la lista se
   devuelve la fila del borde.
3. **Regla del usuario (v1.0.18)**: *si la siguiente fila no se puede
   enfocar — porque es el final de la lista o porque la fila aún no está
   lista — el foco se queda donde está.*
4. **Restauración por posición** (`FocusRestorable`): cada fragmento
   recuerda la última posición enfocada (canal preferido sobre categoría en
   TV; parrilla preferida sobre categoría en Películas/Series; fila en Guía).
   Cuando la actividad detecta que no hay foco (o que el foco quedó
   "aparcado" en una pestaña por una ganancia de rebote) y se pulsa una
   tecla de dirección, restaura el foco a esa posición (desplaza la lista
   hasta ella y pide el foco), con hasta **3 intentos** reprogramados por si
   la fila aún no está dispuesta. Si no hay posición guardada, usa la última
   vista de contenido enfocada; si tampoco existe, la pestaña actual.
5. **La actividad recuerda la última vista de contenido enfocada**
   (`lastContentFocus`) y la restaura ante cualquier tecla de dirección
   cuando el foco es nulo. Nunca mientras hay un diálogo abierto.
6. **Los contenedores de lista no son enfocables** (`isFocusable=false`):
   solo las filas toman el foco, así que un rebote nunca puede "aparcarse"
   en un contenedor.
7. **El cambio de categoría no desmonta la fila enfocada**: al aplicar una
   categoría solo se refrescan la fila anterior y la nueva
   (`notifyItemChanged`), nunca toda la lista; la lista filtrada se aplica
   de forma síncrona (`setItems` + `notifyDataSetChanged` en la misma
   llamada), así que al enfocar una categoría la lista entera ya es conocida.
   Las ganancias de foco de categoría que llegan por restauración se consumen
   sin cambiar la selección (bandera `suppressCategoryApply`).

### 2.4 Atrás (↩) — subir de nivel

Cada fragmento implementa `BackToParentHandler`. La regla general: **Atrás
sube un nivel** (contenido → categorías → barra de pestañas → Inicio).

- **TV en vivo / Deportes**: canales → categorías → pestaña.
- **Guía**: filas → pestaña (no tiene barra de categorías propia; su barra
  lateral es de categorías, igual que TV: filas → categorías → pestaña).
- **Películas/Series**: parrilla → categorías → pestaña.
- **Inicio**: cualquier tarjeta → pestaña Inicio.
- **Búsqueda**: resultados/campo → pestaña Buscar. (Decisión documentada:
  Atrás desde los resultados va a la pestaña, no vuelve al campo de texto.)
- **Ficha de serie**: lista de episodios → botón de favorito del encabezado;
  desde el encabezado → sale de la ficha.
- **Reproductor**: guarda el progreso y sale a la pantalla anterior.
- **Diálogo abierto**: Atrás cierra el diálogo (lo gestiona el propio
  diálogo).
- Si el fragmento no consume el Atrás y la pestaña actual no es Inicio, se
  vuelve a la pestaña **Inicio** (con foco en ella). Si ya se está en Inicio,
  Atrás sale de la app.

### 2.5 Arriba en la primera fila → pestaña

En todas las listas, **Arriba estando en la primera fila (posición 0)**
lleva a su pestaña (listener explícito por tecla en la fila 0):

- TV/Deportes: primera fila de categorías → pestaña TV/Deportes; primera
  fila de canales → pestaña TV/Deportes.
- Películas/Series: primera fila de categorías → su pestaña; primera tarjeta
  de la parrilla (posición 0) → su pestaña.
- Guía: primera fila → pestaña Guía.
- Búsqueda: Arriba desde el campo de texto → pestaña Buscar.
- Ficha de serie: Arriba desde la lista de episodios llega a los botones del
  encabezado (no a una pestaña, porque es otra pantalla).

### 2.6 Tecla Menú (☰)

- **Fila de canal (TV, Deportes, Guía)**: alterna el favorito del canal.
  Toast `"★ Agregado a Favoritos"` o `"Quitado de Favoritos"`. La estrella
  cambia al instante y los conteos de la barra lateral se actualizan. Si se
  quita un favorito **estando dentro de la categoría Favoritos**, la fila
  desaparece al instante y el foco se pone en la fila que queda en esa
  posición.
- **Tarjeta de película**: abre un diálogo de opciones con:
  - `"⏵ Continuar (H:MM:SS)"` (solo si está en progreso) o
    `"▶ Reproducir"`.
  - `"★ Favorito"` / `"☆ Quitar de Favoritos"`.
  - `"✓ Marcar como visto"` / `"✓ Visto (quitar)"`.
- **Tarjeta de serie**: abre un diálogo de opciones con:
  - `"▶ Ver episodios"` (abre la ficha).
  - `"★ Favorito"` / `"☆ Quitar de Favoritos"`.
- **Ficha (película o serie)**: abre el menú de opciones de la ficha.
- **Diálogos de opciones**: panel oscuro de 460dp de ancho, título 19sp
  negrita, opciones 17sp con fondo `focus_bg`, primera opción enfocada al
  abrir. Mientras un diálogo está abierto, una bandera (`dialogShowing`)
  bloquea la restauración de foco de la actividad y el manejo de Atrás
  (el diálogo lo gestiona).

### 2.7 OK / Enter (clic)

- Canal (TV, Deportes, Guía, Búsqueda, Inicio): reproduce a pantalla
  completa.
- Tarjeta de película/serie: abre su ficha.
- Episodio: lo reproduce.
- Tarjeta de Inicio "Continuar viendo": reanuda en el punto guardado.
- Canal destacado de Inicio: reproduce el canal.
- Fila de ajuste: ejecuta su acción.
- Fila de lista IPTV: abre el diálogo de opciones de la lista.

### 2.8 Barra de ayuda (hint bar)

Texto inferior de la pantalla principal, 14sp, color `text_faint`, que cambia
según la pestaña activa:

- TV en vivo / Deportes:
  `"↑↓ Cambiar de canal   ·   OK Ver en pantalla completa   ·   ☰ Menú ★ Favorito   ·   La vista previa arranca sola, en silencio"`
- Películas / Series:
  `"←→↑↓ Navegar   ·   OK Ver ficha   ·   ☰ Menú Opciones"`
- Ajustes:
  `"OK Seleccionar   ·   ↩ Atrás Volver"`
- Inicio / Guía / Búsqueda (por defecto):
  `"←→↑↓ Navegar   ·   OK Ver / Abrir   ·   ☰ Menú ★ Favorito y opciones   ·   ↩ Atrás Volver"`

### 2.9 Casos especiales de navegación

- **Búsqueda**: Izquierda estando al inicio del texto (cursor en posición 0)
  mueve el foco a la pestaña Ajustes. Derecha mueve el cursor dentro del
  texto. El campo tiene como "arriba" explícito la pestaña Buscar.
- **Inicio**: las secciones son filas horizontales dentro de un `ScrollView`
  vertical. Izquierda/Derecha se mueve dentro de la fila; Arriba/Abajo
  cambia de fila. Atrás desde cualquier tarjeta va a la pestaña Inicio.
- **Reproductor**: cualquier tecla de D-pad con el OSD oculto lo muestra y
  enfoca el botón de pausa (ver §5.2). Atrás sale (guardando el progreso).
- **Ficha de película**: los botones del encabezado son el único contenido
  enfocable además de la lista de episodios (en series).

---

## 3. Modelo de datos

Todos los modelos están en `Models.kt`. Los identificadores de favorito e
historial son **claves de texto** (ver §3.4 y §3.5).

### 3.1 Playlist (lista IPTV)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `kind` | `"m3u"` \| `"xtream"` | Tipo de lista |
| `name` | texto | Nombre dado por el usuario |
| `url` | texto | URL de la lista M3U (solo `kind=m3u`) |
| `epgUrl` | texto | URL de la EPG (solo `kind=m3u`; opcional) |
| `server` | texto | Servidor Xtream, normalizado (solo `kind=xtream`) |
| `username` | texto | Usuario Xtream |
| `password` | texto | Contraseña Xtream |
| `isActive` | booleano | Si es la lista activa |

Solo puede haber **una lista activa**. La activa es la primera con
`isActive=true`; si ninguna lo tiene, es la primera de la lista.

### 3.2 Canal en vivo (`LiveChannel`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | texto | Nombre del canal |
| `logo` | texto (URL) | URL del logo (`stream_icon` en Xtream, `tvg-logo` en M3U) |
| `streamUrl` | texto | URL de reproducción |
| `group` | texto | Grupo/categoría (`category_name` o `group-title`; `"Sin categoría"` si vacío) |
| `tvgId` | texto | ID de EPG (`epg_channel_id` o `tvg-id`) |
| `providerNum` | texto | Número `num` del proveedor. **Se guarda pero NO se muestra en ningún sitio** |
| `hasCatchup` | booleano | `tv_archive == "1"` en Xtream (se muestra como `↺` tras el nombre) |
| `streamId` | texto | `stream_id` de Xtream |
| `archiveDays` | entero | `tv_archive_duration / 24`. **Se guarda pero NO se muestra; las unidades de `tv_archive_duration` no están confirmadas en el código (ver §10)** |

Clave de favorito/historial: `"live|{streamUrl}|{name}"`.

**Origen Xtream** (`get_live_streams`): se descartan los canales cuyo nombre
contiene `"###"` (entradas basura del panel). URL de reproducción:
`{server}/live/{usuario}/{contraseña}/{stream_id}.m3u8`.

**Origen M3U**: un canal es cualquier entrada `#EXTINF` que no se clasifique
como película o serie (ver §4.5). También se descartan nombres con `"###"`.

### 3.3 Películas y series

**Película (`VodMovie`)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | texto | Nombre |
| `logo` | texto (URL) | Póster (`stream_icon`) |
| `streamUrl` | texto | URL de reproducción |
| `category` | texto | Categoría (`category_name` o `group-title`) |
| `added` | entero (epoch, segundos) | Fecha de alta en el panel; se usa para ordenar "lo más reciente" |
| `streamId` | texto | `stream_id` de Xtream |
| `year` | entero | Año. Xtream: primer año (19xx/20xx) encontrado por regex en el nombre; si no hay, el año de `added` en UTC |
| `rating` | texto | `rating` del panel (puede venir vacío) |
| `ext` | texto | Extensión del contenedor (`container_extension`, por defecto `"mp4"`) |

Clave de favorito/historial: `"movie|{streamUrl}|{name}"`.

URL de reproducción Xtream: `{server}/movie/{usuario}/{contraseña}/{stream_id}.{ext}`.

**Serie (`SerieItem`)**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | texto | Nombre |
| `cover` | texto (URL) | Carátula (`cover`) |
| `serieId` | texto | `series_id` de Xtream (vacío en series M3U) |
| `category` | texto | Categoría |
| `streamUrl` | texto | URL directa (solo series M3U; en Xtream queda vacío) |
| `added` | entero (epoch, segundos) | Fecha de alta |

Clave de favorito/historial: `"series|{serieId o streamUrl}|{name}"`.

**Episodio (`Episode`)** — solo existe tras cargar `get_series_info`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `season` | entero | Temporada |
| `num` | entero | Número de episodio |
| `title` | texto | Título (`"Episodio {n}"` si no hay) |
| `url` | texto | URL de reproducción |
| `plot` | texto | Sinopsis del episodio |
| `duration` | texto | Duración (texto tal cual viene del panel, p. ej. `"42 min"`) |
| `image` | texto (URL) | Imagen del episodio (`movie_image`) |
| `id` | texto | `id` del episodio en el panel |

Nombre para mostrar en el reproductor: `"{Nombre serie} T{temporada}E{episodio}"`
(sin espacio entre T y E, p. ej. `"Breaking Bad T1E2"`). En la fila de la lista
de episodios se muestra `"T1 E2 · título"` (con espacio).

Clave de favorito/historial de un episodio: `"ep|{url}|{título}"`.

**Información de ficha (cargada perezosamente por API, no guardada en caché):**

- Película (`get_vod_info`): `plot` (sinopsis), `cast` (reparto), `rating`,
  `genre` (género), `duration` (o `episode_run_time`), `director`,
  `releaseDate` (o `releasedate`), `country` (país).
- Serie (`get_series_info`): `plot`, `cast`, `rating` (o `rating_5based`),
  `genre`, `releaseDate`, `director`, más la lista de episodios.

### 3.4 Favoritos

Conjunto de claves de texto (las de §3.2/§3.3). Guardado en
`mitv-favorites.json` (ver §9.1). Alternar (`toggle`) devuelve el nuevo estado
y persiste de inmediato. La estrella `★`/`☆` se actualiza al instante en la
fila y los conteos de la barra lateral se recalculan.

### 3.5 Historial y progreso (`WatchEntry`)

Una entrada por cada elemento reproducido alguna vez:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `key` | texto | Clave de favorito (§3.2/§3.3) |
| `title` | texto | Título mostrado |
| `sub` | texto | Subtítulo mostrado |
| `logo` | texto (URL) | Logo/póster |
| `kind` | `"live"` \| `"movie"` \| `"series"` \| `"episode"` | Tipo |
| `section` | `"tv"` \| `"movies"` \| `"series"` \| `"sports"` | Sección del historial |
| `category` | texto | Categoría |
| `streamUrl` | texto | URL de reproducción (para reanudar episodios sin recargar la serie) |
| `positionMs` | entero | Posición guardada (ms) |
| `durationMs` | entero | Duración total (ms) |
| `plays` | entero | Número de reproducciones |
| `updatedUtc` | entero (epoch, ms) | Última apertura |

Reglas:

- **Al reproducir** (`recordPlay`): `plays + 1`, se conserva la
  posición/duración anteriores, se actualiza `updatedUtc` y la entrada se
  mueve al final (la más reciente). Esto es lo que ordena el Historial y
  "Continuar viendo".
- **Durante la reproducción** (`updateProgress`): solo se actualizan
  `positionMs` y `durationMs`. **No** cambia `updatedUtc` ni el orden.
- **`recent(sección)`**: los **últimos 15** elementos abiertos de esa
  sección, más reciente primero. Es lo que muestra la categoría
  `🕘 Historial` de cada pestaña.
- **"Continuar viendo"**: películas y episodios (`kind` movie|episode) cuyo
  progreso está **en curso**: duración > 0 y fracción
  (`positionMs / durationMs`) entre **0,03 y 0,95**, ordenados por
  `updatedUtc` descendente. En el código **no hay límite de cantidad** en
  esta sección.
- **"Canales destacados"**: canales (`kind` live) con `plays > 0`, ordenados
  por `plays` descendente, top 10.
- **Visto** (`isWatched`): duración > 0 y fracción **≥ 0,95**.
- **Marcar como visto**: pone `positionMs = 1000` y `durationMs = 1000`
  (fracción 1,0); si no existía entrada, primero crea una con `recordPlay`.
  **Quitar visto**: pone `positionMs = 0` (conserva la duración).
- **Sección de un canal**: `"sports"` si su grupo es de deportes (ver §1.4),
  si no `"tv"`. Esto se aplica sin importar desde qué pantalla se abrió el
  canal (TV, Deportes, Guía, Inicio o Búsqueda).
- **Escritura a disco**: en un solo hilo en segundo plano, con escrituras
  coalescadas (varias actualizaciones seguidas se juntan en una sola
  escritura) y escritura atómica (temporal + renombrar).

### 3.6 EPG (ahora/siguiente)

Modelo interno tras procesar el XMLTV (ver §4.6):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `channelId` | texto | ID del canal en la EPG |
| `startUtc` | entero (epoch, ms) | Inicio del programa |
| `stopUtc` | entero (epoch, ms) | Fin del programa |
| `title` | texto | Título del programa |
| `desc` | texto | Descripción (puede venir vacía) |

Búsqueda de programa (`nowNext`): por búsqueda binaria sobre la lista de
programas del canal ordenada por inicio. Devuelve el programa que contiene
el instante actual ("ahora") y el siguiente ("después"). Si no hay programa
actual, no hay "ahora" (la fila muestra "Sin información de guía" / "sin EPG").

---

## 4. API Xtream y M3U

Base: el servidor tal cual lo escribió el usuario en el editor de listas
(normalizado: esquema `http://` añadido si falta, host en minúsculas, sin
barra final). Todas las llamadas van con `User-Agent: MiTV/1.0 (FireTV)`,
timeout de conexión 20 s y de lectura 120 s, y siguen redirecciones.
Cliente: OkHttp 4.12.0.

**Codificación (importante):**
- Parámetros de query: codificación de formulario (`URLEncoder`): los
  espacios son `+`.
- Segmentos de ruta de las URLs de stream: codificación de ruta: los espacios
  son `%20`, nunca `+`.

### 4.1 Autenticación

Llamada al API raíz (sin `action`):

```
GET {server}/player_api.php?username={usuario}&password={contraseña}
```

La respuesta es un objeto JSON. Se exige `user_info.auth` igual a `1`, `"1"`
o `true`; en caso contrario se lanza el error
`"Panel: acceso denegado ({status})"` (el `{status}` es el código HTTP).
Esta comprobación se hace **antes** de sincronizar (y también al validar una
lista nueva). Si el panel devuelve un objeto con `user_info` denegado o con
campo `message`/`error` no vacío en cualquier llamada que espera un array,
se lanza `"Panel: {mensaje}"` en vez de devolver una lista vacía.

El parseo JSON es tolerante: los campos se leen como texto, número o
booleano indistintamente (los números del panel a veces vienen como texto).

### 4.2 Categorías

```
GET {server}/player_api.php?username={u}&password={p}&action=get_live_categories
GET {server}/player_api.php?username={u}&password={p}&action=get_vod_categories
GET {server}/player_api.php?username={u}&password={p}&action=get_series_categories
```

Respuesta: array JSON de objetos con:

| Campo | Descripción |
|-------|-------------|
| `category_id` | ID de la categoría (texto) |
| `category_name` | Nombre visible |

Si una llamada de categorías falla, se tolera (mapa vacío) y la
sincronización continúa. Si el mismo `category_id` aparece dos veces, gana
la primera aparición.

### 4.3 Listas de contenido

**Canales en vivo:**

```
GET {server}/player_api.php?username={u}&password={p}&action=get_live_streams
```

Cada elemento:

| Campo | Descripción |
|-------|-------------|
| `stream_id` | ID del stream |
| `name` | Nombre del canal |
| `stream_icon` | URL del logo |
| `category_id` | ID de categoría (se resuelve a nombre con §4.2) |
| `epg_channel_id` | ID de EPG (`tvgId`) |
| `num` | Número del proveedor (se guarda, no se muestra) |
| `tv_archive` | `"1"` = tiene catchup |
| `tv_archive_duration` | Duración de archivo; en el código se calcula `archiveDays = valor / 24` (unidades sin confirmar, ver §10) |

URL de reproducción: `{server}/live/{usuario}/{contraseña}/{stream_id}.m3u8`
(HLS). Se descartan los elementos cuyo nombre contiene `"###"`.

**Películas:**

```
GET {server}/player_api.php?username={u}&password={p}&action=get_vod_streams
```

Cada elemento:

| Campo | Descripción |
|-------|-------------|
| `stream_id` | ID del stream |
| `name` | Nombre |
| `stream_icon` | URL del póster |
| `category_id` | ID de categoría |
| `container_extension` | Extensión del contenedor (por defecto `"mp4"`) |
| `added` | Fecha de alta (epoch, segundos) |
| `rating` | Valoración |

URL de reproducción: `{server}/movie/{usuario}/{contraseña}/{stream_id}.{ext}`.

**Series:**

```
GET {server}/player_api.php?username={u}&password={p}&action=get_series
```

Cada elemento:

| Campo | Descripción |
|-------|-------------|
| `series_id` | ID de la serie |
| `name` | Nombre |
| `cover` | URL de la carátula |
| `category_id` | ID de categoría |
| `added` | Fecha de alta (epoch, segundos) |

### 4.4 Fichas (información perezosa)

Solo se llaman al abrir una ficha, en hilo de fondo. No se guardan en caché.

**Película:**

```
GET {server}/player_api.php?username={u}&password={p}&action=get_vod_info&vod_id={stream_id}
```

Respuesta: objeto JSON; los datos están en `info`:
`plot`, `cast`, `rating`, `genre`, `duration` (o `episode_run_time`),
`director`, `releaseDate` (o `releasedate`), `country`.

**Serie:**

```
GET {server}/player_api.php?username={u}&password={p}&action=get_series_info&series_id={series_id}
```

Respuesta: objeto JSON con `info` (`plot`, `cast`, `rating` o
`rating_5based`, `genre`, `releaseDate`, `director`) y `episodes`: un objeto
cuyas claves son los números de temporada (ordenadas numéricamente), cada una
con un array de episodios:

| Campo | Descripción |
|-------|-------------|
| `id` | ID del episodio |
| `episode_num` | Número de episodio |
| `title` | Título |
| `container_extension` | Extensión (por defecto `"mp4"`) |
| `info.plot` | Sinopsis |
| `info.duration` | Duración (texto) |
| `info.movie_image` | Imagen del episodio |

URL de reproducción del episodio:
`{server}/series/{usuario}/{contraseña}/{id}.{ext}`.

### 4.5 M3U

Una lista M3U es una URL de texto. Se descarga y se parsea línea a línea:

- Una línea `#EXTINF:...` define una entrada. Atributos que se leen (formato
  `clave="valor"`): `tvg-logo`, `group-title`, `tvg-id`. El nombre es el texto
  tras la **primera coma que esté fuera de comillas**.
- La siguiente línea que no empieza por `#` y no está vacía es la URL de
  reproducción (tal cual, sin transformar).
- **Clasificación** por el grupo en minúsculas (y por la URL):
  - Contiene `"series"` → serie (`SerieItem`, con `streamUrl` = URL directa,
    sin `serieId`).
  - Contiene `"movie"`, `"film"`, `"vod"`, `"pelicula"`, `"película"` o
    `"cine"`, **o** la URL termina en `.mp4` o `.mkv` → película.
  - Si no, es un canal en vivo.
  - También se descartan nombres con `"###"`.
- El campo `added` de películas/series M3U queda en 0 (no hay fecha de alta),
  así que en Inicio aparecen al final de "lo más reciente".
- La EPG de una lista M3U viene de la URL de EPG que el usuario escribió en
  el editor (campo `epgUrl`), en formato XMLTV (ver §4.6).

### 4.6 EPG (XMLTV)

**Fuente Xtream:**

```
GET {server}/xmltv.php?username={usuario}&password={contraseña}
```

**Fuente M3U:** la URL `epgUrl` de la lista.

La descarga se hace como bytes; si empieza con los bytes mágicos `1F 8B`
(gzip), se descomprime. Si el resultado tiene menos de 100 bytes, se ignora.

**Parseo** (con `XmlPullParser`, sin namespaces):

- `<channel id="...">` + su `<display-name>` → mapa nombre → id.
  Normalización del nombre para el mapa: minúsculas y solo letras y dígitos
  (se quitan espacios y signos). **Ojo**: esta normalización **conserva los
  acentos** (no es la misma que la de búsqueda, §1.6, que sí los quita).
  Si un nombre normalizado corresponde a **más de un id** de canal, se marca
  como **ambiguo** y no se usa para buscar por nombre.
- `<programme channel="..." start="..." stop="...">` con `<title>` (solo el
  primero) y `<desc>` (solo el primero). Fechas en formato
  `yyyyMMddHHmmss Z` (UTC, parseo tolerante). Se descartan los programas que
  terminaron hace más de **6 horas**.
- Los programas de cada canal quedan ordenados por inicio para la búsqueda
  binaria de ahora/siguiente.

**Resolución de la EPG de un canal**: primero por `tvgId` (si ese id no es
ambiguo); si no, por nombre normalizado. Si el `tvgId` es ambiguo, no se usa.

**Almacenamiento procesado** (ver §9.1): no se guarda el XML original. Se
guarda un TSV compacto `epg-processed.tsv` con líneas
`channelId \t startMs \t stopMs \t title \t desc` (los tabuladores y saltos
de línea de los textos se sustituyen por espacios) y un `epg-meta.txt` con:
línea 1 = `updatedUtc` (ms); líneas siguientes `nombreNormalizado \t channelId`;
y una línea final `!AMBIG! \t id1,id2,...` si hay ids ambiguos.

**Ciclo de vida**: la EPG se borra al cambiar o eliminar la lista activa
(nunca sobrevive la EPG de otra lista). La descarga es "best-effort": si
falla, la sincronización de contenido sigue adelante.

### 4.7 Sincronización (flujo completo)

1. Comprobar autenticación (§4.1).
2. Descargar categorías (live, VOD, series) y listas (live, VOD, series) en
   paralelo (tres llamadas concurrentes).
3. Guardar el contenido en caché y actualizar `sourceName` (nombre de la
   lista) y `updatedUtc` (ahora).
4. Descargar y procesar la EPG (best-effort; los errores se tragan).
5. **Una sola sincronización a la vez**: si ya hay una en curso, la nueva
   devuelve el mensaje `"Ya hay una sincronización en curso"` sin hacer nada.

---

## 5. Reproducción

Reproductor: **ExoPlayer (Media3 1.4.1)** con los módulos `exoplayer`,
`exoplayer-hls` y `ui`. No hay otro motor de vídeo.

**URLs que reproduce:**

| Origen | URL | Formato |
|--------|-----|---------|
| Canal Xtream | `{server}/live/{u}/{p}/{id}.m3u8` | HLS (`.m3u8`) |
| Película Xtream | `{server}/movie/{u}/{p}/{id}.{ext}` | El del contenedor del panel (mp4, mkv, …) |
| Episodio Xtream | `{server}/series/{u}/{p}/{id}.{ext}` | El del contenedor del panel |
| M3U (cualquier tipo) | URL tal cual viene en la lista | El que indique la URL (HLS, MPEG-TS, mp4, …) |

No hay detección de formato propia en el código: la URL se entrega tal cual a
ExoPlayer. La app permite tráfico en claro (`usesCleartextTraffic=true`, es
decir, URLs `http://` funcionan), porque los servidores de los usuarios
pueden ser `http`.

### 5.1 Preview (TV en vivo / Deportes)

- Al enfocar un canal, se programa el arranque del preview con un retraso de
  **600 ms** (si el foco cambia antes, se cancela y se reprograma).
- El preview es un ExoPlayer propio de la pantalla: volumen **0**
  (silenciado), repetición `REPEAT_MODE_ONE` (bucle), sin controles.
- Si el canal enfocado cambia, se cambia el elemento multimedia y se
  prepara de nuevo; si es el mismo, no se toca.
- Se libera en `onPause` y en `onDestroyView` de la pantalla; al volver
  (`onResume`) se reprograma el arranque para el canal enfocado.
- El `PlayerView` del preview tiene `keepScreenOn=true` (la pantalla no se
  apaga mientras hay preview).

### 5.2 Reproductor a pantalla completa (`PlayerActivity`)

Se abre con OK/Enter sobre un canal, un resultado de búsqueda, una tarjeta de
Inicio o un episodio. Antes de abrirlo, la reproducción queda registrada en
el historial (`recordPlay`, ver §3.5).

- **Arranque**: `MediaItem` con la URL, `prepare()`, `playWhenReady=true`.
  En VOD, si hay una posición guardada **mayor de 5.000 ms**, se busca esa
  posición antes de reproducir (reanudar). En vivo no hay búsqueda.
- **Pantalla encendida**: `FLAG_KEEP_SCREEN_ON` mientras reproduce; se quita
  al pausar o destruir. (Nota: la verificación larga de inactividad —que el
  salvapantallas no aparezca tras 5+ minutos— **nunca se confirmó en
  pantalla** según el BUILD-REPORT de la v1.0.10.)
- **Al ir a Inicio** (botón Home del sistema): pausa y guarda el progreso;
  al volver, reanuda si estaba reproduciendo (esto está verificado solo por
  código, no en pantalla, según el BUILD-REPORT de la v1.0.17).
- **Desconexión de auriculares/Bluetooth**: `setHandleAudioBecomingNoisy(true)`
  (pausa al desconectarse el audio).

**OSD (controles en pantalla):**

- Panel inferior, fondo `#CC101012`, padding 40dp laterales / 12dp arriba /
  16dp abajo.
- **Título** 22sp negrita (nombre del canal/película/episodio).
- **Subtítulo** 15sp tenue, margen superior 2dp (programa actual o
  `"año · categoría"`).
- **Barra de búsqueda** (`SeekBar`, máximo 1000), margen superior 8dp.
  **Oculta en vivo**, junto con los botones de ±10 s.
- **Fila de botones** (margen superior 6dp), cada botón 17sp, padding
  20dp/11dp, fondo `btn_bg`:
  - `"⏸ Pausa"` / `"▶ Reproducir"` (alterna).
  - `"⏪ −10s"` y `"⏩ +10s"` (solo VOD).
  - Texto de tiempo centrado (15sp `text_dim`, peso 1): en VOD
    `"pos / dur"` (formato `H:MM:SS`); en vivo `"● EN VIVO"`.
  - `"🔊 Audio"` (diálogo de pistas de audio).
  - `"💬 Subtítulos"` (diálogo de pistas de subtítulos).
  - `"🖥 Aspecto"` (cicla el modo de aspecto).
- **Auto-ocultado**: el OSD se oculta a los **5 s** de mostrarse o de la
  última acción. Cualquier tecla de D-pad con el OSD oculto lo muestra y
  enfoca el botón de pausa. Cualquier acción en el OSD reprograma el
  ocultado a 5 s.
- **Indicador de carga**: un spinner centrado, visible mientras el
  reproductor está en estado `BUFFERING`.
- **Teclas multimedia**: reproducir/pausa alterna; rebobinar/avanzar
  ±10 s (VOD).
- **Barra de búsqueda**: Izquierda/Derecha/Centro sobre ella busca (solo
  VOD); al arrastrar, la etiqueta muestra `"pos / dur"` y al soltar busca
  a esa posición.
- **Atrás**: guarda el progreso y sale del reproductor.
- **Fin de la reproducción (VOD)**: guarda el progreso final (queda como
  visto, fracción 1,0).

**Modos de aspecto** (botón `🖥 Aspecto`, cicla en este orden, con toast
`"Aspecto: {nombre}"`):

1. Ajustar (`FIT`)
2. Zoom
3. Rellenar (`FILL`)
4. Ancho fijo (`FIXED_WIDTH`)
5. Alto fijo (`FIXED_HEIGHT`)

**Diálogos de pistas:**

- **Audio** (`"Audio"`): lista las pistas de audio del contenido. Cada
  opción muestra etiqueta, idioma (si no es `"und"` ni vacío), número de
  canales (`"{n}ch"`, solo audio) y códec, unidos por `" · "`. Si no hay
  etiqueta, `"Audio N"`. Si no hay pistas alternativas, toast
  `"Sin pistas de audio alternativas"`.
- **Subtítulos** (`"💬 Subtítulos"`): igual, con una primera opción
  `"Desactivados"`. Si no hay subtítulos, toast
  `"Sin subtítulos en este contenido"`.
- Al elegir una pista, se reemplaza la selección de ese tipo (se limpian
  primero las selecciones anteriores de ese tipo). Al cerrar el diálogo, el
  foco vuelve al botón de pausa y se reprograma el auto-ocultado del OSD.

**Guardado de progreso (VOD):** la posición se guarda como mucho cada
**5 s** durante la reproducción (con limitación de frecuencia), y siempre al
pausar, parar, destruir o terminar. El progreso guardado es lo que permite
"Continuar viendo" y la reanudación.

### 5.3 Qué NO reproduce ni hace la app

- No hay descarga de vídeo ni modo offline.
- No hay "picture-in-picture" ni mini-reproductor (la v1.0.x no lo trae;
  Deportes no tiene mini player: solo TV en vivo tiene preview).
- No hay velocidad de reproducción ni salto por capítulos.

---

## 6. Marquesina universal (v1.0.22)

Regla del usuario: *todo texto que no cabe debe desplazarse de derecha a
izquierda, parar 5 s al final, regresar y repetirse en infinito*. Es un
animador propio (`Marquee.kt`), no la marquesina de la plataforma (que vuelve
de golpe y tiene una pausa fija corta).

### 6.1 Cuándo se desplaza

- **Solo si el texto no cabe**: se mide con la fuente (`paint.measureText`)
  contra el ancho disponible. Si el texto cabe, nunca se mueve.
- **Solo en el elemento enfocado**: las filas/tarjetas sin foco muestran el
  texto truncado con `"…"` (elipsis al final) y no se mueven.
- Al ganar el foco, la marquesina arranca (si el texto no cabe). Al perder
  el foco, se detiene y se restaura el estado en reposo.

### 6.2 El ciclo exacto

1. **Pausa inicial de 2 s** en el inicio (para que el principio se lea).
2. **Desplazamiento hacia la izquierda** (el texto se mueve de derecha a
   izquierda, es decir, `scrollX` aumenta) a **40 dp/s**, hasta que la
   última letra queda visible.
3. **Pausa de 5 s** al final.
4. **Regreso desplazándose** hasta el inicio (a la misma velocidad).
5. **Pausa de 2 s** al inicio.
6. **Repetir en infinito** mientras el elemento siga enfocado.

La duración de cada desplazamiento está limitada a **[800 ms, 15.000 ms]**
(mínimo 0,8 s, máximo 15 s): un texto muy largo no tarda más de 15 s en
cruzar, y uno apenas más largo que el hueco tarda al menos 0,8 s.

### 6.3 Detalles de implementación que afectan al aspecto

- En reposo: una línea, elipsis al final (`"…"`) y sin desplazamiento.
- Mientras se desplaza: se quita la elipsis y se activa el desplazamiento
  horizontal del texto. (Si no se hiciera, el texto truncado solo se
  deslizaría en blanco: hay que maquetar el texto completo para poder
  desplazarlo.)
- Los títulos centrados (p. ej. el nombre en las tarjetas de canales
  destacados) cambian su gravedad a inicio mientras se desplazan, y se
  restaura la gravedad original al parar.
- Al parar (pérdida de foco o reciclaje de la fila): se restauran la elipsis,
  la posición de desplazamiento (0) y la gravedad original.

### 6.4 Dónde se aplica

En **todos** los textos que pueden truncarse, solo cuando su fila/tarjeta
tiene el foco:

- Filas de TV/Deportes: nombre del canal, línea del programa, título del
  preview.
- Filas de la Guía: nombre, línea AHORA, línea DESPUÉS.
- Tarjetas de películas y series: título y subtítulo.
- Tarjetas de Inicio: título y subtítulo.
- Filas de resultados de búsqueda: título y subtítulo.

Al reciclar una fila (reutilizarla para otro elemento), la marquesina se
detiene antes de asignar el nuevo texto y se reinicia si la fila sigue
teniendo el foco.

---

## 7. Diseño visual

### 7.1 Colores (`colors.xml`)

| Nombre | Valor | Uso |
|--------|-------|-----|
| `bg` | `#0D0D0F` | Fondo de la ventana / pantalla |
| `panel` | `#131315` | Fondo de paneles (barra lateral, preview, diálogo) |
| `panel2` | `#19191C` | Fondo de tarjetas y campos de texto |
| `border` | `#2A2A2F` | Bordes y fondo de la barra de progreso |
| `accent` | `#C1111B` | Rojo principal (pestaña seleccionada, botón enfocado) |
| `accent2` | `#D21F2B` | Rojo de foco (borde exterior de tarjeta enfocada) |
| `text` | `#EEEEEE` | Texto principal |
| `text_dim` | `#AAAAAA` | Texto secundario |
| `text_faint` | `#777777` | Texto tenue (ayuda, horas, números) |
| `star` | `#FFD500` | Dorado de favoritos y "visto" |
| `progress_blue` | `#3B82F6` | Azul de la barra de progreso del programa |

Tema: `Theme.AppCompat.NoActionBar`, fondo de ventana `bg`, color de acento
`accent`, fuente sans del sistema. Barras de navegación y de estado en `bg`.
Los diálogos del sistema se fuerzan oscuros por el tema.

### 7.2 Disposición general

- Orientación **horizontal forzada** (landscape).
- Padding de la pantalla principal: **40dp laterales, 20dp arriba**.
- Barra de pestañas arriba; contenido en un `FrameLayout` con peso 1 y margen
  superior 10dp; barra de ayuda abajo (padding superior 8dp, inferior 12dp,
  14sp, `text_faint`).
- **Una sola columna** en todas las listas verticales (canales, guía,
  resultados, episodios). La única parrilla multi-columna es la de
  películas/series: **5 columnas**.
- Barra lateral de categorías a la izquierda del contenido en TV, Deportes,
  Guía (215dp) y Películas/Series (250dp).

### 7.3 Estados de foco (drawables)

El foco se ve por el fondo del elemento; hay un patrón común en dos capas
(borde exterior de color + interior con borde blanco de 3dp):

| Drawable | Sin foco | Con foco |
|----------|----------|----------|
| `card_bg` (tarjetas, filas de categoría) | Relleno `panel2`, borde 1dp `border`, radio 10dp | Exterior `accent2` radio 10dp + interior `panel2` con borde blanco 3dp radio 7dp (inset 3dp) |
| `focus_bg` (filas de lista, filas de ajuste) | Relleno `panel2`, borde 1dp `border`, radio 12dp | Exterior `accent2` radio 12dp + interior `#1E1E22` con borde blanco 3dp radio 9dp |
| `btn_bg` (botones) | Relleno `#26262B`, borde 1dp `border`, radio 9dp | Relleno `accent`, borde blanco 3dp, radio 9dp |
| `tab_bg` (pestañas) | Transparente | Exterior blanco radio 9dp + interior `accent` radio 6dp (inset 3dp) |
| `tab_bg` seleccionada (sin foco) | Relleno `accent`, radio 9dp | — |
| `logo_tile` (baldosa de logo) | Blanco, borde `#444444` 1dp, radio 8dp | (igual; el logo no cambia con el foco) |
| `card_fg` (borde de póster) | Transparente, borde 1dp `border`, radio 10dp | Borde `accent2` 4dp radio 10dp + borde blanco 3dp radio 7dp (inset 4dp) |
| `dialog_bg` (diálogo) | Relleno `panel`, borde 1dp `border`, radio 12dp | — |

### 7.4 Tamaños de texto (resumen)

| Elemento | Tamaño |
|----------|--------|
| Pestañas | 16sp |
| Título de sección (Inicio/Ajustes) | 20sp negrita |
| Subtítulo de sección | 15sp tenue |
| Título de ficha | 30sp negrita |
| Título de preview | 20sp negrita |
| Nombre de canal (fila) | 17sp negrita |
| Título de resultado de búsqueda | 17sp negrita |
| Título de ajuste | 17sp negrita |
| Fila de categoría | 16sp |
| Fila de episodio | 16sp |
| Título del reproductor (OSD) | 22sp negrita |
| Botones del reproductor | 17sp |
| Título de tarjeta (película/serie) | 14sp negrita |
| Programa actual (fila) | 14sp |
| Horas de programa | 12sp tenue |
| Número de canal | 15sp tenue |
| Barra de ayuda | 14sp tenue |
| Título de diálogo | 19sp negrita |
| Opciones de diálogo | 17sp |
| Campo de búsqueda | 19sp |

### 7.5 Insignias y marcas

- **ACTIVA** (lista IPTV): el título de la fila es `"● ACTIVA  {nombre}"`
  (punto + "ACTIVA" en mayúsculas). No hay insignia de color separada.
- **Favorito**: estrella `★` dorada (`star`) frente a `☆` gris en la fila;
  en los botones de ficha y menús, `"★ Favorito"` / `"☆ Favorito"`.
- **Visto**: `"✓ Visto"` en color `star` (12sp) en la tarjeta de película y
  en la fila de episodio; botón `"✓ Marcar como visto"` / `"✓ Visto (quitar)"`.
- **En progreso**: `"⏵ Continuar"` (12sp, `star`) en la tarjeta de película;
  `"⏵ pos / dur"` en la fila de episodio; botón `"⏵ Continuar (H:MM:SS)"`.
- **Catchup**: `"  ↺"` añadido al final del nombre del canal.
- **En vivo** (reproductor): `"● EN VIVO"` como texto de tiempo.
- **Sin EPG**: `"Sin información de guía"` (fila de TV) o `"sin EPG"` (fila
  de Guía, en minúsculas).

---

## 8. Ajustes — resumen

El detalle completo está en §1.7 y §1.7.1. Resumen de qué hace cada opción:

| Opción | Qué hace |
|--------|----------|
| Lista IPTV (clic) | Diálogo: marcar como activa / editar / eliminar |
| ＋ Agregar lista | Abre el editor de listas (Xtream o M3U) |
| Sincronizar ahora | Descarga categorías + contenido + EPG de la lista activa (ver §4.7) |
| Actualizar guía ahora | Descarga y procesa solo la EPG |
| Borrar caché de imágenes | Borra la caché de imágenes de Glide (disco + memoria); las imágenes se vuelven a descargar al verlas |
| Acerca de | Muestra versión y paquete (solo informativo) |

Notas de comportamiento:

- **Cambiar la lista activa borra el contenido en caché y la EPG** (nunca
  sobrevive la EPG de otra lista) y luego sincroniza.
- **Eliminar la lista activa** también borra contenido y EPG.
- La **primera lista creada queda activa automáticamente**.
- La sincronización tiene guardia de una sola en curso: si ya hay una,
  muestra `"Ya hay una sincronización en curso"`.
- **Al arrancar la app**: si hay lista activa Y hay contenido en caché, se
  hace un refresco en segundo plano. Si no hay lista activa, toast
  `"Agrega tu primera lista en Ajustes"`.
- El foco se conserva al reconstruir la vista de Ajustes (se recuerda el
  índice enfocado).

---

## 9. Almacenamiento local

### 9.1 Archivos (en el directorio interno de archivos de la app)

**No se usa `SharedPreferences`**: todo son archivos JSON (y TSV) en el
`filesDir` interno, con escritura atómica (se escribe a un archivo temporal
y se renombra; si falla, la app no se rompe). `allowBackup=false` en el
manifiesto (los datos no se respaldan).

| Archivo | Contenido |
|---------|-----------|
| `playlists.json` | Array de `Playlist` (§3.1): `kind`, `name`, `url`, `epgUrl`, `server`, `username`, `password`, `isActive` |
| `content-cache.json` | `{channels: [...], movies: [...], series: [...], sourceName, updatedUtc}` — el contenido sincronizado de la lista activa |
| `mitv-favorites.json` | Array de claves de favorito (texto, ver §3.4) |
| `watch-history.json` | Array de `WatchEntry` (§3.5) |
| `epg-processed.tsv` | Programas procesados: `channelId \t startMs \t stopMs \t title \t desc` (ver §4.6) |
| `epg-meta.txt` | Línea 1: `updatedUtc` (ms). Líneas siguientes: `nombreNormalizado \t channelId`. Línea final si hay ambigüedad: `!AMBIG! \t id1,id2,...` |

**Las credenciales Xtream (usuario y contraseña) se guardan en texto plano
en `playlists.json`, en el almacenamiento interno privado de la app.**
No hay cifrado (decisión documentada del proyecto: riesgo aceptado para uso
personal; grupo C, ítem 29 del BUILD-REPORT). En webOS, el equivalente es
guardarlas solo en el dispositivo, nunca en el código ni en un repositorio.

### 9.2 Caché de imágenes

- Glide, en `cacheDir/glide_images`, con **tope duro de 500 MB**.
- Estrategia de caché `AUTOMATIC` (Glide decide por tipo de recurso).
- La pantalla de Ajustes muestra el tamaño en uso (medido en segundo plano;
  `"Calculando…"` mientras tanto) y permite borrarla.
- Los logos y pósters se cargan con Glide (`CENTER_CROP` en pósters,
  `FIT_CENTER` en logos dentro de la baldosa blanca).

### 9.3 Sincronización y actualización de datos

- **Sincronización de contenido**: descarga categorías + listas (§4.2–§4.3),
  guarda `content-cache.json` con `sourceName` y `updatedUtc`, y luego
  descarga la EPG (best-effort). Una sola a la vez (ver §4.7).
- **EPG**: se descarga al sincronizar y al pulsar "Actualizar guía ahora".
  Si la descarga falla, no se rompe nada (se conserva la anterior o se queda
  sin EPG).
- **Arranque**: si hay lista activa y contenido en caché, refresco en
  segundo plano al arrancar.
- **Al cambiar de lista activa o eliminar la activa**: se borran
  `content-cache.json` y la EPG procesada antes de sincronizar.
- **Historial y favoritos**: se escriben en segundo plano con escrituras
  coalescadas (ver §3.5).

---

## 10. Puntos que NO están claros en el código (no inventar)

1. **`tv_archive_duration` y `archiveDays`**: el código calcula
   `archiveDays = tv_archive_duration / 24`, pero el BUILD-REPORT (grupo C,
   ítem 17) deja las unidades de `tv_archive_duration` como no resueltas.
   Además, `archiveDays` **no se muestra en ningún sitio** de la UI (solo
   `hasCatchup` se usa, como `↺`). En la réplica, guardar el campo y no
   mostrarlo es fiel al original.
2. **`providerNum`**: se guarda pero **no se muestra**; el número visible en
   las filas es la posición 1-based en la lista filtrada actual.
3. **Verificación de la v1.0.10 (pantalla encendida)**: el arreglo
   (`FLAG_KEEP_SCREEN_ON` + `keepScreenOn` en el preview) está instalado,
   pero la prueba larga de inactividad (salvapantallas sin aparecer tras 5+
   minutos de reproducción) **nunca se confirmó en pantalla** según el
   BUILD-REPORT.
4. **Pausa al ir a Inicio y reanudación al volver (v1.0.17)**: verificado
   solo por código, no en pantalla.
5. **Verificación en pantalla de la v1.0.21** (Guía con todos los canales):
   según el BUILD-REPORT, la corrida de verificación no se hizo porque el
   usuario estaba viendo la TV en ese momento; la confirmación en pantalla
   quedó pendiente de su propia comprobación con el mando.
6. **Marquesina en VOD / Inicio / Búsqueda**: el ayudante es el mismo y el
   cableado es el mismo que en TV/Guía, pero la verificación en pantalla de
   la v1.0.22 solo capturó TV y Guía; VOD, Inicio y Búsqueda no se
   capturaron individualmente.
7. **Formato exacto de `duration` de episodio**: es texto tal cual lo
   devuelve el panel (p. ej. `"42 min"`); no hay conversión a milisegundos
   en el código. El progreso de un episodio se guarda en milisegundos por
   el reproductor, no por este campo.
8. **El `added` de M3U es 0**: las películas/series de una lista M3U no
   tienen fecha de alta, así que en "lo más reciente" de Inicio quedan al
   final.
9. **Grupo C (aplazado en v1.0.17, sin implementar en v1.0.22)**: retención
   de fragmentos al cambiar de pestaña, cifrado de credenciales, tests/CI,
   `strings.xml`, y detalles de clasificación M3U. Son huecos conocidos del
   original, no funciones que haya que replicar.

---

## 11. Alcance v1 (qué SÍ y qué NO trae la v1.0.22)

**Sí trae:**
- 8 pestañas (Buscar última), una sola columna en listas, parrilla de 5
  columnas en Películas/Series.
- Listas Xtream y M3U, con editor de listas y una sola lista activa.
- EPG XMLTV (Xtream o URL), con ahora/siguiente y % de programa.
- Preview silenciado en TV/Deportes, reproductor a pantalla completa con
  OSD, pistas de audio/subtítulos, 5 modos de aspecto, reanudación y
  "Continuar viendo".
- Favoritos, historial (últimos 15 por sección), vistos (≥95%).
- Búsqueda con debounce 200 ms, mínimo 2 caracteres, insensible a acentos.
- Marquesina universal solo en el elemento enfocado.
- Ajustes: listas, sincronizar, EPG, borrar caché de imágenes, acerca de.

**No trae (y no debe replicarse como si lo trajera):**
- Parrilla de EPG por horas (la Guía es lista de ahora/siguiente).
- Descargas de vídeo ni modo offline.
- Mini-reproductor / picture-in-picture.
- Velocidad de reproducción, capítulos, o salto por capítulos.
- Múltiples listas activas a la vez.
- Cifrado de credenciales (se guardan en texto plano en el almacenamiento
  interno de la app).
- Sincronización en la nube ni cuentas de usuario.

---

## Fuentes leídas

- `app/src/main/java/com/mitv/player/`: `MainActivity.kt`,
  `LiveFragment.kt`, `HomeFragment.kt`, `VodFragment.kt`,
  `VodDetailActivity.kt`, `GuideFragment.kt`, `SearchFragment.kt`,
  `SettingsFragment.kt`, `PlayerActivity.kt`, `Playback.kt`, `Models.kt`,
  `Net.kt`, `PlaylistLoader.kt`, `EpgStore.kt`, `Stores.kt`, `Marquee.kt`,
  `Ui.kt`, `Util.kt`, `PlaylistEditActivity.kt`, `MiTVApp.kt` (20 archivos).
- `app/src/main/res/layout/`: `activity_main.xml`, `activity_player.xml`.
- `app/src/main/res/values/`: `colors.xml`, `styles.xml`.
- `app/src/main/res/drawable/`: `card_bg.xml`, `card_fg.xml`, `focus_bg.xml`,
  `btn_bg.xml`, `tab_bg.xml`, `logo_tile.xml`, `dialog_bg.xml`.
- `app/src/main/AndroidManifest.xml`, `app/src/main/res/xml/network_security.xml`.
- `README.md`, `BUILD-REPORT.md` (secciones v1.0.9–v1.0.22), `app/build.gradle.kts`.
