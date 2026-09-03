# LOOP REPUESTOS

Web catálogo de repuestos para técnicos. Mobile-first, búsqueda rápida, filtros técnicos, carrito compacto y cierre por WhatsApp.

## Estado actual

Base visual y arquitectura listas. El snapshot local contiene **314 SKUs reales publicables** del maestro seguro de LOOP; los **26 bloqueados** quedan excluidos hasta confirmar sus datos técnicos.

El flujo MVP es deliberadamente simple, estilo lista mayorista:

**catálogo → carrito → WhatsApp → confirmación humana → venta manual en Google Sheets.**

Armar/enviar un pedido por WhatsApp **no reserva ni descuenta stock** y no se considera una venta.

## Stack

- Next.js 16 + React 19 + TypeScript estricto
- Tailwind CSS v4
- Supabase/Postgres preparado para catálogo, perfiles, mayoristas y evolución futura
- Vercel como hosting previsto
- Google Sheets como panel operativo/fuente de verdad del stock físico en el MVP

## Ejecutar

```bash
npm install
cp .env.example .env.local
npm run dev
```

Para que "Enviar consulta por WhatsApp" abra directamente el chat de LOOP:

```env
NEXT_PUBLIC_WHATSAPP_NUMBER="549..."
```

Sin número configurado, WhatsApp se abre con el mensaje preparado para compartir.

## Catálogo real

- `scripts/fixtures/catalogo-loop-real-314.csv`: 314 SKUs LISTOS.
- `scripts/fixtures/piloto-loop-real-15.csv`: muestra pequeña de verificación.
- `data/catalog.snapshot.json`: proyección pública usada cuando Supabase no está configurado.
- `scripts/import-catalog.ts`: validación + UPSERT idempotente por SKU.

El payload público **nunca** incluye costo, precio mayorista ni stock numérico. Sólo expone precio público/promocional y `EN STOCK / SIN STOCK`.

## UX actual

- búsqueda por nombre, SKU, modelo y compatibilidad;
- sinónimos básicos de taller (`pantalla/display`, `pin`, `sam`, `moto`, etc.);
- filtros combinables por marca, tipo, modelo, calidad y marco;
- agregar/quitar cantidades sin abrir ficha de producto;
- carrito persistente en el navegador;
- resumen del pedido y total;
- mensaje WhatsApp con cantidades, SKU, detalle y total estimado.

## Roadmap

| Etapa | Contenido | Estado |
|---|---|---|
| 0 | UI / identidad LOOP | ✅ |
| 1 | Supabase + esquema + RLS | ✅ |
| 2 | catálogo real | ✅ snapshot 314 |
| 3 | búsqueda + filtros + sinónimos | ✅ base funcional |
| 4 | carrito → WhatsApp | ✅ base funcional |
| 5 | Google Auth | pendiente |
| 6 | mayoristas/admin | pendiente |
| 7 | sync Google Sheets | pendiente |
| 8 | QA + Vercel + lanzamiento | pendiente |

Ver `docs/ESTADO-CHATGPT.md` para el handoff actualizado.
