/* Pruebas de la lógica de JsSIvsSO.html (corte, INV, Prom SO, donut) sin navegador.
 *   node tests/test_cliente_sivso.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');

function crearDom() {
  const els = {};
  const get = id => els[id] || (els[id] = { id, innerHTML: '', innerText: '', value: '', style: {}, hidden: false,
    classList: { toggle() {}, remove() {}, add() {} }, children: [], dataset: {} });
  return { getElementById: get, querySelectorAll: () => [], els };
}
function cargar() {
  const document = crearDom();
  const ctx = {
    document, console, Intl, Math, JSON, Date, Number, String, Object, Array, isFinite, isNaN, parseInt, parseFloat,
    window: {}, localStorage: { getItem: () => null, setItem() {} }, setTimeout: f => f(), alert() {},
    FMT: new Intl.NumberFormat('es-CO'),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    normTxt: s => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''),
    esGas: () => false, me: e => String(e), cargarLib: () => {}, Selector: function () {}, mapaAlEntrar() {}
  };
  vm.createContext(ctx);
  const leer = f => fs.readFileSync(path.join(dir, f), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
  vm.runInContext(leer('JsVentasMtd.html').replace(/^let ventasMtdData/m, 'var ventasMtdData'), ctx);
  vm.runInContext(leer('JsSIvsSO.html'), ctx);
  ['sivsoAnioFil', 'sivsoChannel', 'sivsoKam', 'sivsoBu', 'sivsoBrand', 'sivsoCliente'].forEach(id => {
    document.getElementById(id).value = id === 'sivsoCliente' ? '' : (id === 'sivsoAnioFil' ? '2026' : 'TODOS');
  });
  document.getElementById('sivsoPromNInput').value = '3';
  return ctx;
}
let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }

/* Payload v2: clientes [sap, nombre, kam, canal]; productos [id, nombre, bu, marca];
 * filas [mes, idxCli, idxProd, si, siU, so, soU, inv, invU, tieneInv] */
const clientes = [['1', 'CLI 1', 'K1', 'Cadenas'], ['2', 'CLI 2', 'K2', 'Cadenas']];
const productos = [['P1', 'PROD 1', 'Foto', 'FP'], ['P2', 'PROD 2', 'Derma', 'DM'], ['P3', 'PROD 3', 'FOTO', 'FP']];
const filas = [];
// 2025 completo: cada mes SO=100 en (CLI1,P1)
for (let m = 1; m <= 12; m++) filas.push(['2025-' + String(m).padStart(2, '0'), 0, 0, 200, 2, 100, 1, 0, 0, 0]);
// 2026 ene-sep: SO=110 en (CLI1,P1); jul sin movimiento (hueco)
for (let m = 1; m <= 9; m++) if (m !== 7) filas.push(['2026-' + String(m).padStart(2, '0'), 0, 0, 220, 2, 110, 1, 0, 0, 0]);
// CLI2/P2: devoluciones netas (SO negativo) en ago
filas.push(['2026-08', 1, 1, 50, 1, -30, -1, 0, 0, 0]);
// INV: foto en ago (CLI1/P1=40, CLI2/P2=60) y NADA en sep (sep tiene SI/SO pero no fila INV)
filas.push(['2026-08', 0, 0, 0, 0, 0, 0, 40, 4, 1]);
filas.push(['2026-08', 1, 1, 0, 0, 0, 0, 60, 6, 1]);
// P3 = BU "FOTO" en mayúsculas (misma que "Foto"): se agrupa
filas.push(['2026-09', 0, 2, 10, 1, 10, 1, 0, 0, 0]);

console.log('SI vs SO · expansión del payload v2');
const c = cargar();
c.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
const F = c.sivsoData.filas;
t('expande a objetos con los campos de siempre y marca tieneInv', () => {
  const inv = F.filter(f => f.tieneInv);
  assert.strictEqual(inv.length, 2);
  assert.strictEqual(F[0].cliente, 'CLI 1'); assert.strictEqual(F[0].producto, 'PROD 1'); assert.strictEqual(F[0].a, 2025);
});
t('corte 2026 = septiembre; 2025 = diciembre', () => {
  assert.strictEqual(c.sivsoCortes[2026], 9); assert.strictEqual(c.sivsoCortes[2025], 12);
});

console.log('SI vs SO · Δ contra el MISMO corte (año parcial vs año completo)');
t('SO 2026 ene–sep vs SO 2025 ene–sep, no vs 2025 completo', () => {
  c.renderSIvsSO();
  const det = c.document.els.sivsoKpiSoDet.innerHTML;
  // 2026: 8 meses×110 (sin jul) − 30 + 10 = 860 ;  2025 ene–sep = 900  →  −4,4 %   (con año completo daría −28,3 %)
  assert.ok(/-4,4|−4,4/.test(det.replace('−', '-')), det);
  assert.ok(/Ene–Sep 2025/.test(det), det);
});
t('año cerrado: compara contra el año completo anterior (sin sufijo de corte)', () => {
  c.document.getElementById('sivsoAnioFil').value = '2025';
  c.renderSIvsSO();
  assert.ok(/Sin base en 2024/.test(c.document.els.sivsoKpiSoDet.innerHTML));
  c.document.getElementById('sivsoAnioFil').value = '2026';
});

console.log('SI vs SO · INV como foto sumada');
t('INV = suma de cliente×producto del último mes con foto (ago), no el valor de una sola fila', () => {
  c.renderSIvsSO();
  const filasAnio = c.sivsoFilasFiltradasSinAnio().filter(f => f.a === 2026);
  const inv = c.sivsoInventario(filasAnio);
  assert.strictEqual(inv.mes, '2026-08');
  assert.strictEqual(inv.total, 100);                  // 40 + 60
  assert.strictEqual(inv.porProducto.P1, 40); assert.strictEqual(inv.porProducto.P2, 60);
  assert.strictEqual(inv.porCliente['1'], 40); assert.strictEqual(inv.porCliente['2'], 60);
});
t('un mes con SI/SO pero SIN fila INV (sep) no pisa la foto de ago con 0', () => {
  const lista = c.sivsoVistaProductos;
  assert.strictEqual(lista.find(x => x.producto === 'PROD 1').inv, 40);
  assert.strictEqual(lista.find(x => x.producto === 'PROD 2').inv, 60);
  assert.ok(/INV al cierre de Ago 2026/.test(c.document.els.sivsoHintProductos.innerText));
});
t('modo unidades usa invU', () => {
  c.sivsoSetUnidad('#'); c.renderSIvsSO();
  assert.strictEqual(c.sivsoVistaProductos.find(x => x.producto === 'PROD 1').inv, 4);
  c.sivsoSetUnidad('$');
});

console.log('SI vs SO · Prom SO calendario');
t('últimos 3 meses hasta el corte (jul, ago, sep): jul sin dato cuenta como 0', () => {
  c.renderSIvsSO();
  const p1 = c.sivsoVistaProductos.find(x => x.producto === 'PROD 1');
  assert.strictEqual(p1.promSo, (0 + 110 + 110) / 3);  // antes: dividía por los meses "con datos"
});
t('la ventana puede cruzar el año (N=12 en 2026 toma oct–dic 2025 también) y sigue dividiendo por N', () => {
  c.document.getElementById('sivsoPromNInput').value = '12'; c.renderSIvsSO();
  const p1 = c.sivsoVistaProductos.find(x => x.producto === 'PROD 1');
  // oct25-dic25 (3×100) + ene-sep26 sin jul (8×110) = 300+880 = 1180 → /12
  assert.ok(Math.abs(p1.promSo - 1180 / 12) < 1e-9, p1.promSo);
  c.document.getElementById('sivsoPromNInput').value = '3';
});
t('el TOTAL de Prom SO incluye a todos los productos de la ventana', () => {
  c.renderSIvsSO();
  const suma = c.sivsoVistaProductos.reduce((s, x) => s + x.promSo, 0);
  assert.ok(c.document.els.sivsoTablaProductos.innerHTML.indexOf('class="total"') > -1);
  assert.ok(suma > 0);
});

console.log('SI vs SO · donut y BU');
t('BU "Foto" y "FOTO" se agrupan; BU con SO neto negativo se excluye y se avisa', () => {
  c.renderSIvsSO();
  const html = c.document.els.sivsoDonutBu.innerHTML;
  assert.ok(/Foto/.test(html) || /FOTO/.test(html));
  assert.ok(/neto negativo/.test(html), 'avisa de la BU con devoluciones netas');
  assert.ok(!/NaN/.test(html));
});

console.log('SI vs SO · orden por encabezado y filtros');
t('clic en "Sell In" ordena de mayor a menor y deja la fila TOTAL al final', () => {
  c.mtdOrdenar('sivsoTablaProductos', 'si');
  const v = c.sivsoVistaProductos.map(x => x.si);
  assert.deepStrictEqual(v, v.slice().sort((a, b) => b - a));
  const h = c.document.els.sivsoTablaProductos.innerHTML;
  assert.ok(h.lastIndexOf('class="total"') > h.lastIndexOf('PROD 3'));
});
t('el filtro por KAM recorta Productos, Clientes y KPI', () => {
  c.setSivsoFiltro('kam', ['K2']); c.renderSIvsSO();
  assert.strictEqual(c.sivsoVistaClientes.length, 1);
  assert.strictEqual(c.sivsoVistaClientes[0].cliente, 'CLI 2');
  c.sivsoLimpiarFiltros();
});

console.log('SI vs SO · filtrado cruzado (clic en tablas y gráficos, estilo Looker)');
const E = c.document.els, soKpi = () => E.sivsoKpiSo.innerText.replace(/\s/g, ' ');
const filaDe = (id, pred) => Array.from(c.MTD_TABLAS[id].vista).findIndex(pred);
t('estado: setSivsoFiltro mantiene el espejo; OR dentro de una dimensión, AND entre dimensiones', () => {
  c.setSivsoFiltro('kam', ['K1', 'K2']); c.setSivsoFiltro('brand', ['DM']);
  assert.deepStrictEqual(Object.keys(c.sivsoFset.kam), ['K1', 'K2']);
  assert.deepStrictEqual(Array.from(c.sivsoFilas().map(f => f.productId)), ['P2', 'P2']);   // solo DM: CLI2/P2 (SI/SO ago + foto INV)
  c.sivsoLimpiarFiltros();
  assert.strictEqual(c.sivsoFset.kam, null);
});
t('cascada: las opciones de cada selector salen de los DEMÁS filtros, no del suyo', () => {
  c.setSivsoFiltro('kam', ['K2']);
  assert.deepStrictEqual(Array.from(c.sivsoOpciones('brand').map(o => o.valor)), ['DM']);      // K2 solo compra P2/DM
  assert.deepStrictEqual(Array.from(c.sivsoOpciones('kam').map(o => o.valor)), ['K1', 'K2']);  // el KAM no se filtra a sí mismo
  c.sivsoLimpiarFiltros();
});
t('clic en un producto: KPI y Clientes se filtran, la tabla Productos NO se encoge y marca la fila', () => {
  c.renderSIvsSO();
  c.mtdClicTabla('sivsoTablaProductos', filaDe('sivsoTablaProductos', x => x.producto === 'PROD 1'));
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.producto), ['P1']);
  assert.ok(/880/.test(soKpi()), soKpi());                                   // 8 meses × 110 (jul sin dato)
  assert.strictEqual(c.sivsoVistaProductos.length, 3);                       // P1, P2 y P3 siguen en la tabla
  const h = E.sivsoTablaProductos.innerHTML;
  assert.strictEqual((h.match(/class="clicable sel"/g) || []).length, 1);
  assert.strictEqual((h.match(/class="clicable atenuada"/g) || []).length, 2);
  assert.ok(/TOTAL SELECCIÓN/.test(h));
  assert.strictEqual(c.sivsoVistaClientes.length, 1);                        // solo quien compró P1
  c.mtdClicTabla('sivsoTablaProductos', filaDe('sivsoTablaProductos', x => x.producto === 'PROD 1'));   // 2.º clic lo quita
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.producto), []);
});
t('clic en un cliente: la tabla Clientes conserva a todos y los % Part no cambian', () => {
  c.renderSIvsSO();
  const antes = c.sivsoVistaClientes.map(x => x.partSo).join();
  c.mtdClicTabla('sivsoTablaClientes', filaDe('sivsoTablaClientes', x => x.cliente === 'CLI 2'));
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.cliente), ['2']);        // clave = SAP ID
  assert.strictEqual(c.sivsoVistaClientes.length, 2);
  assert.strictEqual(c.sivsoVistaClientes.map(x => x.partSo).join(), antes);
  assert.ok(/-\$\s?30/.test(soKpi().replace('−', '-')), soKpi());          // CLI 2: SO −30 en ago
  assert.strictEqual(c.sivsoVistaProductos.length, 1);                      // Productos sí se filtra: solo PROD 2
  c.sivsoLimpiarFiltros();
});
t('clic en un mes: KPI, Δ e INV se limitan a ese mes; el gráfico sigue con 12 meses y marca el elegido', () => {
  c.renderSIvsSO();
  c.sivsoAlternar('mes', 8);                                                 // ago: CLI1/P1 110 + CLI2/P2 −30 = 80
  assert.ok(/80/.test(soKpi()), soKpi());
  assert.ok(/Ago 2025/.test(E.sivsoKpiSoDet.innerHTML), E.sivsoKpiSoDet.innerHTML);   // contra el mismo mes del año anterior
  const g = E.sivsoGraficoMensual.innerHTML;
  assert.strictEqual((g.match(/class="sivso-mescol/g) || []).length, 12);
  assert.strictEqual((g.match(/sivso-mescol clicable sel/g) || []).length, 1);
  assert.strictEqual((g.match(/sivso-mescol clicable atenuada/g) || []).length, 11);
  assert.strictEqual(c.sivsoVistaProductos.find(x => x.producto === 'PROD 1').inv, 40);   // foto de ago, dentro del mes elegido
  assert.strictEqual(c.sivsoVistaProductos.find(x => x.producto === 'PROD 1').promSo, (0 + 110 + 110) / 3);  // Prom SO no depende del mes
  c.sivsoAlternar('mes', 8); c.sivsoAlternar('mes', 9);                       // varios meses se acumulan y se pueden quitar
  c.sivsoAlternar('mes', 7);
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.mes), [9, 7]);
  c.sivsoLimpiarFiltros();
});
t('clic en una BU de la leyenda del donut filtra por esa BU y marca la leyenda', () => {
  c.renderSIvsSO();
  assert.strictEqual(c.sivsoDonutItems[0].k, 'FOTO');                        // "Foto" y "FOTO" agrupadas
  c.sivsoClicDonut(0);
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.buK), ['FOTO']);
  assert.ok(/sivso-donut-it clicable sel/.test(E.sivsoDonutBu.innerHTML));
  assert.ok(/890/.test(soKpi()), soKpi());                                   // P1 880 + P3 10
  assert.ok(/conic-gradient/.test(E.sivsoDonutBu.innerHTML));
  c.sivsoClicDonut(0);
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.buK), []);
});
t('chips: un chip por filtro con nombres legibles, el texto de búsqueda también, y × quita uno', () => {
  c.sivsoLimpiarFiltros();
  assert.strictEqual(E.sivsoChips.hidden, true);
  c.sivsoAlternar('cliente', '1'); c.sivsoAlternar('mes', 8); c.sivsoAlternar('producto', 'P1');
  c.document.getElementById('sivsoCliente').value = 'cli'; c.renderSIvsSO();
  const h = E.sivsoChips.innerHTML;
  assert.ok(/Cliente: CLI 1/.test(h) && /Mes: Ago/.test(h) && /Producto: PROD 1/.test(h) && /Cliente contiene: cli/.test(h) && /Quitar todos/.test(h), h);
  c.sivsoActualizarContador(); assert.strictEqual(E.sivsoContador.innerText, 4);
  c.mtdQuitarChip('sivsoChips', 2);                                          // chip de Mes (orden: cliente, producto, mes, texto)
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.mes), []);
  c.mtdQuitarChip('sivsoChips', 2);                                          // ahora el chip del texto de búsqueda es el 3.º → índice 2 tras quitar Mes
  assert.strictEqual(c.document.getElementById('sivsoCliente').value, '');
  c.mtdLimpiarChips('sivsoChips');
  assert.ok(c.SIVSO_DIMS.every(d => c.sivsoFiltros[d].length === 0));
  assert.strictEqual(E.sivsoChips.hidden, true);
});
t('el buscador de texto filtra clientes por subcadena sin acentos y se combina con los clics', () => {
  c.document.getElementById('sivsoCliente').value = 'cli 1'; c.renderSIvsSO();
  assert.strictEqual(c.sivsoVistaClientes.length, 1);
  c.sivsoLimpiarFiltros();
  assert.strictEqual(c.document.getElementById('sivsoCliente').value, '');
  assert.strictEqual(c.sivsoVistaClientes.length, 2);
});
t('al recargar datos se descartan filtros que ya no existen', () => {
  c.setSivsoFiltro('producto', ['P1', 'FANTASMA']); c.setSivsoFiltro('mes', [8, 3]);
  c.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.producto), ['P1']);
  assert.deepStrictEqual(Array.from(c.sivsoFiltros.mes), [8, 3]);           // 3 (mar) sí existe
  c.sivsoLimpiarFiltros();
});
console.log('\n' + ok + ' pruebas OK' + (process.exitCode ? ' · HAY FALLAS' : ''));
