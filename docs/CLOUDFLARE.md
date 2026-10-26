# Migración de Loop a Cloudflare

## Estado y alcance

La primera etapa prepara Next.js para Workers con OpenNext y Wrangler. Conserva
Supabase para base de datos, autenticación, RLS, funciones SQL e imágenes.
No reduce todavía el abono de Supabase Pro ni reemplaza esos servicios por D1/R2.
La configuración publica `looprepuestos-preview` en workers.dev; no contiene rutas
del dominio de producción ni modifica DNS. Vercel permanece como origen actual.

## Prueba acordada el 26/10/2026

Durante el mes disponible se continúa usando la web actual. La copia de prueba es
https://looprepuestos-preview.loop-repuestos.workers.dev y se publicó con Wrangler.
Se verificó en navegador la carga de 538 productos actuales, búsqueda de A12
(tres resultados), precios y agregado al carrito con total de $18.200.
No se envió ningún pedido de prueba. El ingreso con Google, permisos mayoristas,
historial, notificaciones y panel todavía requieren validación completa.

La copia comparte Supabase con producción: no cargar pedidos ficticios ni cambiar
stock desde ella. R2 todavía no está habilitado en la cuenta (API: 10042); se debe
activar antes de probar la migración de imágenes. El dominio mantiene los DNS de
Vercel. No se cambian DNS, no se cancela Supabase ni se hace el corte durante esta
primera prueba. El corte final depende de verificar los flujos y el presupuesto.

## Preparación

Usar Node 22 o posterior y `npm ci`.

Crear `.env.local` con las variables públicas, que Next incorpora al navegador:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://feuwtvajeqkkfnirhibb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key existente>
NEXT_PUBLIC_WHATSAPP_NUMBER=5493444507226
```

Autorizar la cuenta de Cloudflare con `npx wrangler login --device`.
Configurar la clave pública para el runtime antes de publicar:

```bash
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
```

La clave `anon` es pública por diseño; RLS sigue controlando el acceso. No usar
`service_role` en variables `NEXT_PUBLIC_*`. Mantener `.env.local` y `.dev.vars`
fuera de Git. Para desarrollo local con Wrangler, crear `.dev.vars` con las mismas
variables; el build y el runtime deben usar el mismo proyecto de Supabase.

## Compilación, prueba y publicación

```bash
npm run build:cloudflare
npm run check:cloudflare
npx wrangler dev
npx wrangler deploy
```

`build:cloudflare` mantiene `next build`, adapta el resultado a Workers y sirve
imágenes originales sin requerir Cloudflare Images. El snapshot público de respaldo
queda incluido en el paquete sin lectura del filesystem. Vercel Analytics se
renderiza solamente en Vercel.

## Verificaciones antes de cambiar el dominio

- El catálogo debe tener los mismos SKU, precios y disponibilidad que producción;
  una página que muestra el snapshot de 314 productos no confirma conexión real.
- Probar búsqueda, imágenes, variantes, favoritos y carrito con el número de Loop.
- Autorizar la URL exacta de prueba en los redirect URLs de Supabase antes de
  probar Google OAuth. No agregar comodines amplios. Con el dominio final existente,
  conservar la URL de redirección de producción.
- Verificar acceso mayorista, separación de roles y denegación de APIs admin sin
  sesión. No crear pedidos ficticios en producción para comprobar el formulario.
- Verificar historial, notificaciones, panel y conexión con Sheets.
- `GOOGLE_SHEETS_SPREADSHEET_ID` y las credenciales privadas de Google que necesite
  el panel deben configurarse como secretos de Workers. Vercel no permite recuperar
  valores existentes de tipo Secret; no reemplazarlos por valores inventados.
- La sincronización requiere `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_SECRET` y/o
  `CRON_SECRET`, además de las credenciales de Google. Migrar el cron de
  `vercel.json` (diariamente a las 11:00 UTC) antes de apagar el despliegue anterior;
  evitar habilitar dos cron que apliquen cambios simultáneamente.
- Definir presupuesto/alertas según el uso y comprobar el tamaño del Worker contra
  los límites de la cuenta elegida.

## Cambio a producción y reversión

Cambiar DNS/rutas sólo después de estas comprobaciones. Conservar Vercel y los
registros originales para revertir el tráfico si falla un flujo. No cancelar
Supabase mientras esta versión siga utilizando sus APIs. La segunda etapa
(D1, R2 y reemplazo de Auth/RPC/RLS) requiere una migración de datos y permisos
independiente, con validación y un corte coordinado de escrituras.
