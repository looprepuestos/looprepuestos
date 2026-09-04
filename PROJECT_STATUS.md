# LOOP REPUESTOS — PROJECT STATUS

> Documento de continuidad. Permite que otra sesión (o ChatGPT) siga sin depender de este chat.
> Última actualización: 2026-09-04.

## 1. Estado actual (resumen)

- **UX MVP deployado** en Vercel (`looprepuestos.vercel.app`), sirviendo **314 productos desde un snapshot local** (`data/catalog.snapshot.json`). Supabase todavía NO está conectado a la web.
- **Bloque de sincronización Sheets→Supabase→LOOP**: código + tests completos, **pusheado a `main`**, Vercel compila verde. Aún no ejecutado contra datos reales.
- **Fase 1 (puesta en marcha controlada) en curso**: mapeo de los 340 productos a la estructura del sync **aprobado por ChatGPT**. Único bloqueo abierto: **reconciliación de precios** (la resuelve ChatGPT; ver §9).
- **Supabase real: NO creado todavía.** **Hoja `Catalogo` en Sheets: NO creada todavía** (espera precios validados).

## 2. Arquitectura

- **Frontend/deploy**: Next.js 16 (App Router) + React 19 + TypeScript estricto + Tailwind v4, en **Vercel** con auto-deploy desde GitHub `main` (repo `looprepuestos/looprepuestos`).
- **Fuente de verdad (futura)**: **Supabase/PostgreSQL** con RLS. La web pública leerá la vista `catalogo_publico` (sólo datos públicos). Hoy, sin env de Supabase, la web cae al snapshot local.
- **Admin operativo**: **Google Sheets** (archivo `STOCK REPUESTOS` en el Drive de Facundo). Un job de sync copia una hoja del Sheet a Supabase. La web **nunca** consulta Sheets.
- **Modelo de stock**: `stock_sheet` (físico, privado) / `stock_reservado` (app, dormido) / `stock_efectivo` (generado). En el MVP, **EN/SIN STOCK público = `stock_sheet > 0`** (desacoplado de reservas).

## 3. Qué está deployado

- Sitio: `https://looprepuestos.vercel.app` — protegido por gate de preview (`LOOP_PREVIEW_PASSWORD`, cookie `loop_preview_access`).
- Repo: `github.com/looprepuestos/looprepuestos`, rama `main`. `origin/main` = commit `a5dcb3f1` (bloque de sync). Deploys automáticos vía integración GitHub↔Vercel (proyecto bajo la cuenta personal de Facundo, no el team `looprepuestos`).
- Contenido: catálogo (314), buscador con sinónimos de taller, filtros (marca/tipo/modelo/calidad/marco), secciones comerciales (Novedades/Nuevos ingresos/Promociones por flags), carrito localStorage, envío por WhatsApp.

## 4. Migraciones (supabase/migrations/)

Orden obligatorio 0001 → 0006:
- **0001_init.sql** — enums, `profiles`, `products` (identidad + precios público/mayorista/costo + modelo de stock + flags comerciales + search_text), `settings`, `account_requests`, `orders`, `order_items`, triggers.
- **0002_functions.sql** — `place_order` (server-side), precios mayoristas, resolver solicitud mayorista, etc. (infra V1 dormida en MVP).
- **0003_views.sql** — vista `catalogo_publico` (sin datos privados).
- **0004_rls.sql** — Row Level Security (anon no lee `products` directo; sí la vista).
- **0005_product_images.sql** — columna `imagen_url` + recrea la vista (drop+create).
- **0006_sync.sql** — tabla `sync_logs` (`sync_id`, `duracion_ms`, RLS admin-read), columnas de control en `products` (`en_planilla`, `synced_at`, `source_row_hash`), vista `catalogo_publico` corregida (`en_stock = stock_sheet > 0`, owner-privileged), y la **RPC `apply_sheet_sync`** (SECURITY DEFINER; `execute` sólo `service_role`).

Artefactos Fase 1 (para aplicar en Supabase real):
- **supabase/_fase1_bundle_0001_0006.sql** — bundle para pegar en el SQL Editor (sin el stub de tests).
- **supabase/_fase1_verificacion.sql** — chequeos read-only post-migración (RLS, vista sin datos privados, RPC, sync_logs).
- Tests locales: `supabase/tests/run.sh` (Postgres local en `127.0.0.1:5433`, user `loop`; usa `00_bootstrap.sql` para stub de `auth`/roles). Suites: `20_tests` (RLS/precios), `40_import_idempotente`, `50_sync` (10 escenarios obligatorios).

## 5. Cómo funciona el sync

Pipeline: **Google Sheets → `scripts/sync-sheets.ts` (lee+valida) → RPC `apply_sheet_sync` (UPSERT + reconciliación + log, en UNA transacción) → `products` → vista `catalogo_publico` → LOOP.**

Archivos:
- **scripts/lib/sheets-client.ts** — `SheetReader` (interfaz inyectable), `GoogleSheetsReader` (service-account JWT vía `google-auth-library`, scope **read-only** `spreadsheets.readonly`, REST a Sheets API), `InMemorySheetReader`/`rowsFromValues` para tests. Config por env; si falta, no adivina.
- **scripts/sync-sheets.ts** — `buildSyncPayload` (puro: separa `sheet_seen_skus` de filas válidas, calcula `source_row_hash`), `runSync` (deps inyectables), CLI: `--dry-run`, `--force`, `--fuente cron|admin|manual`, `--min-ratio`, `--file <csv>`.
- **scripts/lib/catalog-mapper.ts** — validación por fila, mapeo `foto → imagen_url` (vacío→null / http(s)→url / inválida→advertencia sin rechazar), `computeRowHash()`.

Reglas clave de la RPC: idempotente por SKU; **guardia anti-desastre** `min_ratio` default **0.70** (aborta si se ven menos SKU que ese ratio de los activos, salvo `force`); **el cron nunca fuerza**; reconciliación de borrados contra `sheet_seen_skus` (fila inválida ≠ SKU ausente → no despublica); **nunca toca `stock_reservado`, `orders`, `order_items`**.

Scripts npm: `sync:sheets`, `import:catalog`, `test:mapper`, `test:snapshot`, `test:sql`.

## 6. Variables de entorno (SIN secretos aquí)

Server-only (job de sync / import):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_RANGE` (default `Catalogo!A:Z`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Web pública:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (si se setean, la web lee la vista; si no, usa snapshot)
- `NEXT_PUBLIC_WHATSAPP_NUMBER` = `5493444507226`
- `LOOP_PREVIEW_PASSWORD` (gate de preview)

Hoy en prod están sólo WhatsApp + preview password. **Ninguna de Supabase/Google todavía.** Los secretos los maneja Facundo (crear proyecto/SA y setear env); nunca se pegan en el chat ni se guardan en el repo.

## 7. Decisiones del MVP

- Carrito→WhatsApp **NO es una venta**: no reserva, no descuenta stock, no crea orders. `place_order`/reservas/mayoristas/login quedan **DORMIDOS**.
- La venta real la registra Facundo **manual en el Sheet**; el sync actualiza LOOP.
- Público **nunca** ve costo, precio mayorista ni stock numérico.
- Catálogo: **340 SKU** = **314 `publicado=true`** + **26 `publicado=false`**. Los bloqueados existen en Sheet/Supabase pero jamás se publican hasta corregir sus datos y aprobarlos.
- Los **26 bloqueados** = **25 módulos sin `calidad`** + **`BAT-MOT-ORIGINAL`** (sin `modelo`). **NO completar calidad/modelo por inferencia.**
- `precio_mayorista`, `costo`, `foto` quedan **vacíos** inicialmente. `novedad`, `nuevo_ingreso`, `promocion` quedan **false** inicialmente.
- No inventar/corregir datos automáticamente: toda diferencia se reporta; decide Facundo.

## 8. Flujo carrito → WhatsApp

Catálogo → “Agregar al pedido” (estado en `localStorage`) → “Ver pedido” (editar cantidades, total estimado) → “Enviar consulta por WhatsApp” (abre `wa.me/<NEXT_PUBLIC_WHATSAPP_NUMBER>` con detalle por SKU, cantidades, precios y total) → Facundo confirma disponibilidad y entrega por WhatsApp → registra la venta manualmente en el Sheet. **No mueve inventario.** Disclaimer visible: “Tu pedido se enviará por WhatsApp para confirmar disponibilidad y coordinar entrega.”

## 9. Estado Supabase / Sheets

- **Supabase**: proyecto real **NO creado**. Pasos 1–3 listos (bundle + verificación). Cuando exista: pegar bundle en SQL Editor, correr verificación, confirmar `products` vacío.
- **Sheets**: fuente = **`STOCK REPUESTOS`** (Drive). Su hoja "Lista Web" tiene el catálogo con **precio público pero SIN columna `sku`** y con **341 filas (1 de más) vs 340** del maestro **`LOOP_Catalogo_Final`** (que sí tiene SKU/identidad/stock/calidad). Ambos están en la **misma secuencia**.
- **Hoja `Catalogo` (estructura del sync, 20 columnas)**: **NO creada**. Estructura exacta y decisiones en el doc de proyecto `claude/fase1-puesta-en-marcha.md`. Columnas (orden exacto): `sku, nombre, marca, modelo, tipo, calidad, marco, compatibilidad, foto, precio_publico, precio_mayorista, precio_promocional, costo, stock, publicado, novedad, nuevo_ingreso, promocion, fecha_ingreso, orden_destacado`. Plantilla: `scripts/fixtures/plantilla-catalogo.csv`.
- **Reconciliación de precios (BLOQUEO ABIERTO — la resuelve ChatGPT):** hallazgos hasta ahora (NO finales): join maestro↔precios sólo posible por secuencia (no hay SKU en la lista de precios); la lista tiene **1 fila extra** en la zona de baterías JCID/Xiaomi (candidatas: "Bateria BN5X Xiaomi Redmi 14C/POCO C75" o una "Bateria JCID iPhone 14 Pro", según criterio de alineación); tras realinear quedan **~319 pares fuertes**, **~20 casos multi-modelo a revisar** (ej. "Bateria BA156 Sam A15/A15 5G" → 1 SKU del maestro) y **1 ambiguo**. Artefactos entregados: `preview-catalogo-340.csv`, `reconciliacion-precios-340.csv` (parcial). **No se decidió nada por inferencia; falta cierre de ChatGPT/Facundo para tener 340/340 sin ambigüedad.**

## 10. Próximos pasos

1. **ChatGPT** cierra la reconciliación de precios → 340 SKU con precio, sin ambigüedad (idealmente agregando `sku` a la lista de precios para no depender de posición).
2. Facundo **aprueba** → crear la hoja **`Catalogo`** (20 columnas, 340 filas) en el Sheet, sin tocar sus otras hojas.
3. Facundo **crea el proyecto Supabase** → aplicar `_fase1_bundle_0001_0006.sql` → correr `_fase1_verificacion.sql`.
4. Facundo **crea la Service Account** (read-only), habilita Google Sheets API, comparte `Catalogo` con la SA, setea env.
5. `npm run sync:sheets -- --dry-run` → revisar → `npm run sync:sheets -- --fuente manual` (primer sync real).
6. **Auditoría Supabase vs snapshot** SKU por SKU (reporte de diferencias).
7. **Sólo con aprobación**: conectar LOOP a Supabase (cambiar fuente snapshot → vista).

Gates permanentes hasta nueva orden: **no** cron, **no** orders/reservas/`place_order`, **no** login/mayoristas, **no** inferir/corregir datos.

## 11. Detalles para continuar (entorno)

- Repo local de trabajo: `/home/claude/looprepuestos-live` (rama `main`). `origin/main` = `a5dcb3f1`. Commits locales por delante y **NO pusheados**: `6afe919e` (artefactos Fase 1). Este `PROJECT_STATUS.md` también será commit local.
- **Push**: `git push` directo está **bloqueado por el proxy** (el repo no está autorizado como source de la sesión). El push se hace **por Chrome (GitHub web upload)** con aprobación de Facundo, subiendo por carpeta con URLs `/upload/main/<dir>`.
- Postgres local de tests: `127.0.0.1:5433`, user `loop` (para `supabase/tests/run.sh`).
- **Google Drive** conectado (conector) — así se leyeron `LOOP_Catalogo_Final` y `STOCK REPUESTOS`.
- **Vercel MCP**: el team `looprepuestos` (hobby) no lista el proyecto; el deploy vive bajo la cuenta personal. Estado de deploy se verifica por el check de Vercel en el commit de GitHub.
- Docs del proyecto Claude (persisten entre sesiones): `claude/fase1-puesta-en-marcha.md`, `claude/fase1-reporte-mapeo-340.md`, `claude/entrega-sync-sheets-supabase.md`, `claude/arquitectura-tecnica.md`, `claude/estado-etapa-*.md`, `claude/auditoria-deploy-looprepuestos.md`, `claude/deploy-ux-confirmado.md`, `claude/ux-mvp-integracion-y-bloqueo-push.md`.
