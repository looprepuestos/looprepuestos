export interface Sale { date: string; product: string; units: number; revenue: number; }
export function salesFromRows(rows: Record<string, string>[]): Sale[] {
 return rows.flatMap(row => {
  const values = Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/\s+/g,' ').trim(),value]));
  const match = values.Fecha?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const number = (v: string = '') => Number(v.replace(/[$\s.]/g,'').replace(',','.'));
  const units = number(values['Cant.']); const price = number(values['Precio Cobrado (editable)'] ?? values['Precio Cobrado']);
  if (!match || !values.Producto?.trim() || !(units > 0) || !Number.isFinite(price) || price <= 0) return [];
  const d=match[1]!,m=match[2]!,y=match[3]!; const date = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return [];
  return [{date,product:values.Producto.trim().replace(/\s+/g,' '),units,revenue:units*price}];
 });
}
export function summarizeSales(sales: Sale[], now = new Date()) {
 const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Cordoba',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const year=Number(today.slice(0,4)),month=Number(today.slice(5,7)),day=Number(today.slice(8));
 const current = today.slice(0,7);
 const previous = new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
 const previousDays = new Date(Date.UTC(year,month-1,0)).getUTCDate();
 const cutoff = Math.min(day, previousDays);
 const currentSales = sales.filter(s=>s.date.startsWith(current) && s.date<=today);
 const previousSales = sales.filter(s=>s.date.startsWith(previous) && Number(s.date.slice(8))<=cutoff);
 const total = (rows: Sale[]) => ({revenue:rows.reduce((n,s)=>n+s.revenue,0),units:rows.reduce((n,s)=>n+s.units,0)});
 const products = new Map<string,{name:string;units:number;revenue:number}>();
 for(const sale of currentSales){const key=sale.product.toLocaleLowerCase('es');const item=products.get(key) ?? {name:sale.product,units:0,revenue:0};item.units+=sale.units;item.revenue+=sale.revenue;products.set(key,item);}
 let a=0,b=0;
 const daily=Array.from({length:day},(_,index)=>{const d=index+1;a+=currentSales.filter(s=>Number(s.date.slice(8))===d).reduce((n,s)=>n+s.revenue,0);b+=previousSales.filter(s=>Number(s.date.slice(8))===d).reduce((n,s)=>n+s.revenue,0);return {day:d,current:a,previous:d<=previousDays?b:null};});
 return {today,current,previous,cutoff,totals:total(currentSales),previousTotals:total(previousSales),daily,top:[...products.values()].sort((a,b)=>b.units-a.units||b.revenue-a.revenue).slice(0,10)};
}
export type SalesSummary = ReturnType<typeof summarizeSales>;
