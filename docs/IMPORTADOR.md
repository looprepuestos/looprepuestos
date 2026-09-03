# Importador de catálogo — LOOP REPUESTOS (Etapa 2)

Sustituye los mocks por el **catálogo maestro real** de forma controlada. Pensado
para un **piloto de 10–20 SKUs** primero (no cargar los 314 de golpe).

> Los datos reales los provee el usuario/ChatGPT. El importador **no inventa**
> datos faltantes ni copia nada de los mocks. Los fixtures `scripts/fixtures/*`
> con SKUs `DEMO-*` son sólo para probar la herramienta.

## Formato del archivo fuente (CSV)

Un CSV UTF‑8 con **encabezado** y estas columnas exactas (una fila por SKU):

```
sku,nombre,marca,modelo,tipo,calidad,marco,compatibilidad,precio_publico,precio_mayorista,precio_promocional,costo,stock,publicado,novedad,nuevo_ingreso,promocion,fecha_ingreso,orden_destacado
```

| Columna | Tipo | Notas |
|---|---|---|
| `sku` | texto | **Obligatorio, único.** Identificador estable. |
| `nombre` | texto | **Obligatorio.** |
| `marca` `modelo` `tipo` `calidad` | texto | Requeridos para **publicar** (si falta alguno → se importa NO publicado). |
| `marco` `compatibilidad` | texto | Opcionales (ej. `N/A`). No se inventan. |
| `precio_publico` | número | **Obligatorio, ≥ 0.** Sin separador de miles; punto decimal. |
| `precio_mayorista` | número | Opcional. **Privado** (nunca público). |
| `precio_promocional` | número | Opcional. Público sólo si `promocion=true` y es menor que el público. |
| `costo` | número | Opcional. **Privado.** |
| `stock` | entero ≥ 0 | Va a `stock_sheet` (stock físico). |
| `publicado` | bool | `true/false` (también `1/0`, `si/no`). |
| `novedad` `nuevo_ingreso` `promocion` | bool | Flags de secciones de la Home. |
| `fecha_ingreso` | fecha | `YYYY-MM-DD` o vacío. |
| `orden_destacado` | entero ≥ 0 | Menor = primero. Vacío → 999. |

Plantilla vacía: `scripts/fixtures/plantilla-catalogo.csv`.
Números en formato simple (`48900`, `48900.50`) — **sin** puntos de miles, para
evitar ambigüedad. Los precios se guardan tal cual; la web muestra `$ 48.900`.

## Validaciones previas (antes de escribir)

**Errores duros → la fila se RECHAZA** (no se importa):
SKU vacío · SKU duplicado · `precio_publico` inválido/negativo/faltante ·
`precio_mayorista/promocional/costo` inválidos/negativos · `stock` no entero o
negativo · booleanos inválidos · `fecha_ingreso`/`orden_destacado` inválidos ·
`nombre` faltante.

**Advertencias → la fila se importa pero se ajusta** (nunca se inventan datos):
- Incompleto para publicar (falta marca/modelo/tipo/calidad) → `publicado=false`.
- `promocion=true` sin `precio_promocional`, o promo ≥ público → promo desactivada.

## Uso

```bash
# 1) Validar sin escribir (recomendado primero) — reporta rechazos y advertencias
npx tsx scripts/import-catalog.ts --file mi-catalogo.csv --dry-run

# 2) Preview local en la app SIN Supabase (genera snapshot público)
npx tsx scripts/import-catalog.ts --file mi-catalogo.csv --dry-run \
    --emit-snapshot data/catalog.snapshot.json
npm run dev    # la Home lee el snapshot

# 3) Importar a Supabase (idempotente por SKU)
export NEXT_PUBLIC_SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...
npx tsx scripts/import-catalog.ts --file mi-catalogo.csv
```

- **Idempotente por SKU:** `UPSERT (on conflict sku)`. Reimportar el mismo archivo
  no duplica ni rompe nada; actualiza los campos comerciales y `stock_sheet`.
- **No toca** `stock_reservado` ni `stock_efectivo` (ver `supabase/MODELO-STOCK.md`).
- Genera `search_text` normalizado (minúsculas, sin acentos) para la búsqueda.

## Conexión de la app

- Con `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, la Home lee la
  vista `catalogo_publico` (sólo datos públicos).
- Sin esas variables, usa el snapshot local `data/catalog.snapshot.json` (preview).
- El costo, el precio mayorista y el stock numérico **nunca** llegan al cliente.

## Pruebas

- Validador: `npx tsx scripts/tests/mapper.test.mts` (9 casos).
- Idempotencia + no pisar reservas (SQL, esquema real):
  `supabase/tests/40_import_idempotente.sql`.
