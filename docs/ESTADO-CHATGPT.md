# LOOP REPUESTOS — continuidad ChatGPT (2026-09-03)

## Estado funcional actual

- Etapa 0 visual: aprobada.
- Etapa 1 Supabase/RLS: aprobada; infraestructura avanzada de orders/reservas queda disponible pero NO gobierna el MVP WhatsApp.
- Etapa 2: catálogo real cargado en snapshot local.
- Catálogo público actual: 314 SKUs LISTOS del maestro seguro LOOP. 26 bloqueados quedan fuera; no se inventan datos.
- Búsqueda: modelo/SKU/nombre/compatibilidad + sinónimos básicos (pantalla/display→módulo, pin→placa de carga, sam→Samsung, moto→Motorola, apple→iPhone, redmi/poco→Xiaomi).
- Filtros: marca, tipo, modelo, calidad y marco.
- Carrito: persistente en localStorage, edición de cantidades, resumen y total.
- Flujo MVP: carrito → resumen → WhatsApp. NO crea venta, NO reserva, NO descuenta stock.
- Venta real: Facundo la registra manualmente en Google Sheets. La futura sync actualiza LOOP.

## Fuente de datos usada

- `LOOP_Catalogo_Produccion_Seguro.xlsx`: identidad técnica, estado LISTO/BLOQUEADO, stock.
- `STOCK REPUESTOS (3).xlsx` / `Lista Web`: precio público por la misma secuencia de catálogo.
- Se validó el alineamiento de las 340 filas antes de generar el snapshot.
- Snapshot publicado: sólo 314 LISTOS; no incluye costo, precio mayorista ni stock numérico.

## Pendiente para deploy real

1. Ejecutar build/lint con dependencias completas.
2. `NEXT_PUBLIC_WHATSAPP_NUMBER` configurado localmente para preview: 5493444507226.
3. Conectar Supabase real y ejecutar migraciones.
4. Elegir si Google login/mayorista entra en el primer lanzamiento o en la siguiente iteración.
5. Implementar Google Sheets sync antes de depender de actualización automática de stock/precios.
6. QA mobile/desktop y Preview Deployment en Vercel.

## Continuación ChatGPT — cierre UX MVP previo a preview

Cambios aplicados directamente sobre el proyecto:

- Header: carrito funcional con contador; se eliminó el botón Google inerte del MVP visual.
- Carrito: estado de apertura centralizado; puede abrirse desde header o barra inferior.
- WhatsApp: si falta `NEXT_PUBLIC_WHATSAPP_NUMBER`, el envío queda deshabilitado con aviso claro en lugar de abrir un destino inválido.
- Mensaje WhatsApp: detalle por SKU, cantidad, precio unitario, subtotal y total estimado.
- Se mantiene la regla operativa: carrito/WhatsApp NO descuenta stock y NO registra venta.
- Filtros: Marca/Tipo siempre visibles; Modelo/Calidad/Marco pasan a “Más filtros” para evitar una fila enorme con 314 productos.
- Búsqueda: prioriza SKU exacto/modelo exacto y productos en stock; mantiene sinónimos de taller.
- Secciones comerciales: “Ver todos” dejó de ser un control inerte y filtra la sección correspondiente cuando existan flags reales.
- Seguridad de snapshot: agregado `npm run test:snapshot`; valida 314 SKU únicos y ausencia de costo, mayorista y stock numérico en el payload público.

Verificación disponible en este entorno:

- `npm run test:snapshot`: OK.
- `npm ci`: la descarga/instalación quedó interrumpida por timeout del entorno; por eso lint/build no se marcan como certificados en esta ronda.

Próximo paso: ejecutar build/lint en un entorno con npm operativo y desplegar Preview Vercel. Luego hacer simulación real de compra sin modificar Sheet.
