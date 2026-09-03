# Supabase — LOOP REPUESTOS (Etapa 1)

Esquema, funciones y políticas RLS de la base. **Todavía no** hay integración con
Google Sheets ni con la app (eso es Etapa 2+). Esto es sólo el modelo de datos.

## Contenido

```
supabase/
├── migrations/
│   ├── 0001_init.sql       # enums, tablas, índices, triggers de stock/updated_at
│   ├── 0002_functions.sql  # helpers de rol, anti-escalada, place_order, RPCs
│   ├── 0003_views.sql      # vista pública catalogo_publico (payload público)
│   └── 0004_rls.sql        # RLS + grants + exposición controlada
├── tests/                  # pruebas SQL (Postgres local con stub de auth)
├── MODELO-STOCK.md         # diseño del stock anti-sync (leer)
└── README.md
```

## Puesta en marcha en Supabase

1. Crear un proyecto en https://supabase.com (región cercana, ej. São Paulo).
2. Habilitar el proveedor **Google** en Authentication → Providers (se usa en
   Etapa 5; el esquema ya lo contempla vía `auth.users`).
3. Ejecutar las migraciones **en orden** (0001 → 0004). Dos opciones:
   - **SQL Editor:** pegar y correr cada archivo en orden.
   - **CLI:** `supabase link --project-ref <ref>` y `supabase db push`
     (los archivos ya están en `supabase/migrations/`).
4. **Crear el primer ADMIN** (una sola vez, desde el SQL Editor, que corre como
   servicio y por eso puede setear el rol):
   ```sql
   update public.profiles set role = 'ADMIN'
     where email = 'TU_EMAIL@gmail.com';
   ```
   (El perfil se crea solo al primer login con Google; si aún no iniciaste sesión,
   hacelo una vez y luego corré el update.)
5. Configurar settings del negocio:
   ```sql
   update public.settings set value = to_jsonb('549351XXXXXXX'::text) where key='whatsapp';
   update public.settings set value = '0.15'::jsonb where key='descuento_mayorista_general';
   ```

## Variables de entorno

En `.env.local` (ver `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=...            # Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...       # anon/public key (cliente)
SUPABASE_SERVICE_ROLE_KEY=...           # SOLO servidor (sync, tareas admin). Nunca al cliente.
```

## Regenerar tipos TypeScript

```
npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
```
(El archivo `types/database.ts` incluido es una versión escrita a mano, compatible.)

## Correr las pruebas localmente (sin Supabase)

Validan sintaxis, RLS, roles y el modelo de stock contra un Postgres local usando
un stub del esquema `auth`:

```
export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=<tu_user_pg>
bash supabase/tests/run.sh
```

Cubren: separación del payload público, bloqueo de precios mayoristas a PUBLICO,
anti-escalada de rol, aprobación mayorista, **stock anti-sync**, precios resueltos
server-side y bloqueo de sobreventa.

## Contrato de seguridad (resumen)

- El público sólo lee la vista `catalogo_publico` (nunca la tabla `products`).
- `precio_mayorista`, `precio_costo` y el stock numérico **nunca** salen en el
  payload público. Los precios mayoristas se piden por RPC `get_wholesale_prices`
  (sólo MAYORISTA/ADMIN).
- Los pedidos se crean sólo por `place_order` (resolución server-side). Un
  MAYORISTA nunca paga más que la promo pública vigente (regla `MIN`), aplicada
  tanto en `place_order` como en `get_wholesale_prices`.
- El rol sólo lo cambia un ADMIN vía `resolver_solicitud_mayorista`; ningún cliente
  puede auto-promoverse (trigger `prevent_role_escalation`).
- El perfil se edita sólo por columnas permitidas (`nombre`) o vía la RPC
  `update_profile`; nunca `id`, `email` o `role` desde el cliente.
- Una entrega libera stock sólo al final de una máquina de estados idempotente y
  tolerante a fallos (`pending → sheet_applied → reconciled`, con `error` para
  reintentos). Sheets y Postgres no comparten transacción; un retry nunca descuenta
  dos veces. RPCs: `marcar_sheet_aplicado`, `reconciliar_pedido`, `marcar_stock_error`
  (Etapa 7). Ver `MODELO-STOCK.md`.
- `EXECUTE` revocado de `PUBLIC` en todas las funciones; helpers/triggers internos
  no son invocables por roles de cliente.
