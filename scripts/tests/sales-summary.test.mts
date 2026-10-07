import assert from 'node:assert/strict';
import { salesFromRows, summarizeSales } from '../../lib/sales/summary';
const rows=salesFromRows([
 {'Fecha':'06/10/2026','Producto':'Samsung A12','Cant.':'2','Precio\nCobrado (editable)':'17.200'},
 {'Fecha':'06/09/2026','Producto':'Samsung A12','Cant.':'1','Precio Cobrado':'17.200'},
 {'Fecha':'08/09/2026','Producto':'Samsung A12','Cant.':'9','Precio Cobrado':'17.200'},
 {'Fecha':'31/02/2026','Producto':'Invalid','Cant.':'1','Precio Cobrado':'10'},
]);
const summary=summarizeSales(rows,new Date('2026-10-07T02:00:00Z'));
assert.equal(summary.today,'2026-10-06');
assert.equal(summary.totals.revenue,34400);
assert.equal(summary.previousTotals.revenue,17200);
assert.equal(summary.top[0]?.units,2);
assert.equal(summary.daily.at(-1)?.current,34400);
assert.equal(summarizeSales([],new Date('2026-01-01T12:00:00Z')).previous,'2025-12');
const march=summarizeSales([],new Date('2026-03-31T12:00:00Z'));
assert.equal(march.cutoff,28);
assert.equal(march.daily.at(-1)?.previous,null);
console.log('Sales summary: OK');
