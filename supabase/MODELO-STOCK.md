# Modelo de stock — LOOP REPUESTOS

> ## ⚠️ Flujo MVP (IMPORTANTE): el carrito NO mueve inventario
>
> En el MVP la operatoria copia a BH Tech:
> **catálogo → carrito → WhatsApp → confirmación humana → venta manual en Google Sheets.**
> Armar o enviar un carrito **NO** es una venta confirmada. Por lo tanto, en el MVP:
> - el carrito/WhatsApp **no** descuentan stock, **no** reservan, **no** tocan `stock_sheet`;
> - **no** se crean `orders` ni se llama a `place_order` desde el flujo del carrito;
> - si el cliente no concreta, **no** hay ningún movimiento de inventario;
> - Facundo registra las ventas concretadas **manualmente en Google Sheets**, que
>   sigue siendo la **fuente de verdad del stock físico**;
> - luego la sync actualiza LOOP con el `stock_sheet` resultante.
>
> El stock público (`EN/SIN STOCK`) sale de `stock_efectivo`, que en el MVP es
> simplemente `stock_sheet` (sin reservas activas).
>
> **La maquinaria de reservas/reconciliación descrita más abajo queda implementada
> pero DESACOPLADA e INACTIVA**: es infraestructura lista para un futuro checkout
> automático. Como el carrito nunca inserta `orders`/`order_items`, los triggers de
> reserva nunca se disparan y `stock_reservado` permanece en 0. No se borra para no
> perder ese trabajo; simplemente no participa del inventario del MVP.

Lo que sigue describe esa maquinaria (checkout automático futuro). Resuelve el
problema: *"Sheet dice 10 → LOOP vende 2 → DB queda 8 → el próximo sync del Sheet
vuelve a escribir 10 y restaura lo vendido"*.

## Idea central: separar el stock físico del stock comprometido

Se guardan **dos números independientes** y uno **derivado**:

| Columna (`products`) | Qué es | Quién la escribe |
| --- | --- | --- |
| `stock_sheet` | Stock **físico** declarado por el admin | **Sólo la sincronización** desde Google Sheets |
| `stock_reservado` | Unidades **comprometidas** por pedidos LOOP abiertos | **Sólo la app** (trigger sobre `orders`/`order_items`) |
| `stock_efectivo` | Disponible real = `max(stock_sheet − stock_reservado, 0)` | Derivado (columna generada) |

La web pública muestra únicamente el booleano **`en_stock = stock_efectivo > 0`**
(nunca el número).

## Por qué la sincronización nunca restaura lo vendido

La sync escribe **exclusivamente `stock_sheet`**. `stock_reservado` es de la app y
la sync no lo toca. Como `stock_efectivo` se recalcula solo, la reserva sobrevive
a cualquier re-sync:

```
Sheet=10, reservado=0  → efectivo 10
LOOP vende 2           → reservado=2, efectivo 8
RE-SYNC (Sheet=10)     → efectivo = 10 − 2 = 8   ✅ venta preservada
```

(Verificado en `supabase/tests/20_tests.sql`, Test 5.)

## Fuente de verdad

- **Stock físico:** Google Sheets → `stock_sheet`. El admin sigue administrando el
  stock desde el Sheet, como pidió el negocio.
- **Compromisos de venta:** la base de datos LOOP → `stock_reservado`
  (derivado de pedidos en estado `pendiente`/`confirmado`).
- **Disponible que decide EN/SIN STOCK:** `stock_efectivo` (derivado).

## Ciclo de vida de la reserva

Una entrega deja de reservar stock **sólo** al llegar a `reconciled`. Cada pedido
`entregado` lleva una máquina de estados de baja de inventario
(`orders.stock_sync_status`):

```
ESTADO PEDIDO        stock_sync_status     ¿RESERVA?
pendiente            —                     sí
confirmado           —                     sí
entregado            pending               sí   (baja aún no aplicada al Sheet)
entregado            error                 sí   (intento falló; reintentable)
entregado            sheet_applied         sí   (baja confirmada en Sheet; aún no libera)
entregado            reconciled            NO   (paso final: libera)
cancelado            —                     NO
```

`stock_reservado` se recalcula por trigger: `SUM(cantidad)` de ítems cuyo pedido
está en `pendiente`/`confirmado`, o `entregado` con `stock_sync_status <> 'reconciled'`.

## Por qué NO hay transacción atómica Sheets↔Postgres (y cómo se resuelve)

Google Sheets y Postgres son **sistemas externos independientes**: no pueden
compartir una transacción. Por eso la baja de inventario es una **máquina de
estados idempotente y tolerante a fallos**, orquestada por el worker de sync
(Etapa 7). Cada paso es reintentable y **un retry nunca descuenta dos veces**:

```
1. pedido 'entregado'  → stock_sync_status = pending → SIGUE reservando.
2. el worker aplica la baja física en el Sheet con una operación IDEMPOTENTE
   keyed por order_id (p. ej. una fila de "ledger" con el id del pedido:
   reintentarla no vuelve a descontar).
3. Sheets confirma        → marcar_sheet_aplicado(order_id) ⇒ 'sheet_applied'.
4. reconciliar_pedido(order_id)                            ⇒ 'reconciled' (libera).
*. si algo falla          → marcar_stock_error(order_id)   ⇒ 'error' (sigue reservando),
   y el worker reintenta desde el paso 2.
```

Claves de seguridad:

- La **idempotencia contra Sheets** vive en el paso 2 (operación keyed por
  `order_id`) + el flag `sheet_applied`: una vez aplicada, el worker no vuelve a
  escribir la baja. Así un crash/retry entre pasos no produce doble descuento.
- `reconciliar_pedido` **exige** que el pedido esté en `sheet_applied` (si no,
  error controlado) y es **idempotente**: reconciliar dos veces no libera dos veces.
- En todos los estados salvo `reconciled`, el pedido **sigue reservando** →
  nunca hay ventana de sobreventa, ni siquiera ante fallos parciales.

```
Sheet=10 → pedido 2 → efectivo 8
→ entregado (pending)         → efectivo 8      (reserva)
→ [error de sync] (error)     → efectivo 8      (reserva; reintentable)
→ Sheet=8 + sheet_applied     → efectivo 6      (reserva; conservador, seguro)
→ reconciled                  → efectivo 8      (libera; reservado 0)
→ retry reconciliar/aplicar   → efectivo 8      (idempotente; sin 2da liberación)
```

(Verificado en Tests 5, 8 y 9 de `supabase/tests/20_tests.sql`.)

## RPCs de inventario (Etapa 7, sólo ADMIN)

- `marcar_sheet_aplicado(order_id)` — tras confirmar la baja en el Sheet. Idempotente.
- `reconciliar_pedido(order_id)` — libera la reserva. Requiere `sheet_applied`; idempotente.
- `marcar_stock_error(order_id)` — marca un intento fallido para reintento (sigue reservando).

El esquema queda listo para Etapa 7 sin implementar Sheets todavía.

## Contrato operativo (para el admin)

- Mientras un pedido está **abierto** (pendiente/confirmado) o **entregado sin
  reconciliar**, sus unidades siguen contadas en `stock_reservado`. El admin puede
  administrar el Sheet con normalidad; nada que haga restaura stock vendido.
- La baja física se refleja cuando el worker de sync aplica la baja al Sheet y
  reconcilia (pasos independientes, reintentables). No hay que hacer nada manual
  fuera del Sheet.

## Alternativa considerada (y por qué no)

Un **libro de movimientos** (`stock_movements`, efectivo = sheet + Σ movimientos)
es más flexible para auditar cada venta/devolución, pero agrega una tabla y lógica
de "rebase" del baseline en cada sync. Para el tamaño de LOOP, el contador
`stock_reservado` es **más simple e igual de robusto** ante el problema del sync,
así que se elige ese. Si más adelante se necesita trazabilidad fina de cada
movimiento, se puede migrar sin cambiar el contrato público.

## Resolución server-side al crear el pedido

`place_order(items)` (SECURITY DEFINER) es el **único** camino para crear un pedido.
El cliente envía sólo `[{ sku, cantidad }]`; el servidor resuelve
`SKU → precio según rol → disponibilidad (stock_efectivo) → total`, bloqueando la
fila del producto (`FOR UPDATE`) para evitar sobreventa concurrente. Nunca confía
en precio ni total del navegador. (Verificado en Tests 6 y 7.)
