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
  c.sivsoArbolClic(c.sivsoArbolFilas.findIndex(r => r.x.nombre === 'CLI 2'), 'f');   // clic en el nombre del cliente
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
console.log('SI vs SO · gráfico de 5 vistas e histórico');
t('las 5 vistas SVG del gráfico se pintan sin NaN; la línea del año actual se corta en su último mes con dato', () => {
  // Inventario (s3_inv.json, carga en JsSO): se inyecta ya preparado a partir de las filas de prueba.
  c.invError = ''; c.invCargar = () => {};
  c.invD = { meses: [], filas: c.sivsoData.filas.filter(f => f.tieneInv).map(f =>
    ({ sap: f.sapId, cliente: f.cliente, ean: 'E' + f.productId, bu: f.buK, mes: f.mes, u: f.invU, a: f.inv })) };
  assert.strictEqual(c.SIVSO_VISTAS_GRAF.map(v => v.t).join(' · '), 'Sell In y Sell Out · Sell In · Sell Out · Inventario · Absorción EAN');
  for (let i = 0; i < 4; i++) {           // 4 = Absorción EAN (HTML, tiene su prueba)
    c.sivsoSetVistaGraf(i);
    const g = E.sivsoGraficoMensual.innerHTML;
    assert.ok(/<svg/.test(g), 'vista ' + i);
    assert.ok(!/NaN|undefined|Infinity/.test(g), 'vista ' + i + ': ' + g.slice(0, 200));
  }
  c.sivsoSetVistaGraf(0);
  const S = c.sivsoSerie;
  assert.ok(S.ult.so >= 1 && S.ult.so <= 12);
  for (let m = S.ult.so + 1; m <= 12; m++) assert.strictEqual(S.acc[m].hSo, 0);   // sin dato después del corte
  assert.strictEqual((E.sivsoGraficoMensual.innerHTML.match(/class="sivso-mescol/g) || []).length, 12);
});
t('vista Inventario: foto por mes del año elegido; la filtran cliente y producto (por su EAN en Products 2026) y trae los días de inventario', () => {
  c.sivsoSetVistaGraf(3);
  const anio = c.sivsoAnioSel(), I = c.sivsoInvSerie;
  assert.ok(/Inventario/.test(E.sivsoGraficoMensual.innerHTML));
  let esperado = 0; const m = I.ult.inv;
  c.sivsoData.filas.forEach(f => { if (f.tieneInv && f.a === anio && f.m === m) esperado += c.sivsoUnidad === '#' ? f.invU : f.inv; });
  assert.ok(m >= 1 && Math.abs(I.acc[m].inv - esperado) < 1e-6, 'inventario de ' + m + ': ' + I.acc[m].inv + ' vs ' + esperado);
  const sap = c.sivsoData.filas.find(f => f.tieneInv).sapId;
  c.sivsoCambiarFiltro('cliente', [sap]); c.sivsoSetVistaGraf(3);
  assert.ok(c.sivsoInvSerie.acc[m].inv < esperado, 'el filtro de cliente reduce el inventario');
  c.sivsoCambiarFiltro('cliente', []);
  // Producto: Product ID → EAN con el catálogo de Products 2026 (aquí EAN = 'E' + Product ID).
  const lanzAntes = c.sivsoLanzD;
  c.sivsoLanzD = c.sivsoLanzPreparar({ productos: [], catalogo: [['P1', 'EP1', 'PROD 1'], ['P2', 'EP2', 'PROD 2'], ['P3', 'EP3', 'PROD 3']] });
  c.sivsoCambiarFiltro('producto', ['P1']); c.sivsoSetVistaGraf(3);
  let soloP1 = 0;
  c.sivsoData.filas.forEach(f => { if (f.tieneInv && f.a === anio && f.m === m && f.productId === 'P1') soloP1 += c.sivsoUnidad === '#' ? f.invU : f.inv; });
  assert.ok(Math.abs(c.sivsoInvSerie.acc[m].inv - soloP1) < 1e-6, 'el filtro de producto cambia el inventario: ' + c.sivsoInvSerie.acc[m].inv + ' vs ' + soloP1);
  assert.strictEqual(c.sivsoInvSerie.na.length, 0);
  // Días de inventario del mes: INV (unidades) ÷ Sell Out promedio de los 3 meses que terminan ahí × 30.
  let invU = 0, so3 = 0; const k1 = anio * 12 + m - 1;
  c.sivsoData.filas.forEach(f => { if (f.productId !== 'P1') return;
    if (f.tieneInv && f.a === anio && f.m === m) invU += f.invU;
    if (f.k >= k1 - 2 && f.k <= k1) so3 += f.soU; });
  if (so3 > 0) assert.ok(Math.abs(c.sivsoInvSerie.acc[m].ddi - invU / (so3 / 3) * 30) < 1e-6, 'DDI del mes');
  assert.ok(/sv-ddi/.test(E.sivsoGraficoMensual.innerHTML) && /Días de inventario/.test(E.sivsoGraficoMensual.innerHTML), 'línea de DDI');
  c.sivsoCambiarFiltro('producto', []); c.sivsoLanzD = lanzAntes; c.sivsoSetVistaGraf(0);
});
t('Zebra Sell In / Sell Out: un grupo por mes con dato y el total compara solo hasta ese mes', () => {
  c.sivsoSetVistaGraf(2);                                                    // Sell Out
  assert.strictEqual((E.sivsoGraficoMensual.innerHTML.match(/class="sivso-mescol/g) || []).length, c.sivsoSerie.ult.so);
  c.sivsoSetVistaGraf(1);                                                    // Sell In
  assert.strictEqual((E.sivsoGraficoMensual.innerHTML.match(/class="sivso-mescol/g) || []).length, c.sivsoSerie.ult.si);
  c.sivsoSetVistaGraf(0);
});
t('histórico: una fila por año con Total; Sell In / Sell Out con los filtros del tablero; el mes elegido se resalta', () => {
  c.renderSIvsSO();
  const filas = c.sivsoFilas('mes');
  const so26 = filas.filter(f => f.a === 2026).reduce((a, f) => a + f.so, 0);
  let h = E.sivsoTablaHist.innerHTML;
  assert.ok(/onclick="sivsoSetAnio\(2026\)"/.test(h) && /onclick="sivsoSetAnio\(2025\)"/.test(h));
  assert.ok(h.indexOf(c.FMT.format(Math.round(so26))) > -1, 'total SO 2026');
  c.sivsoSetHistMed('si');
  const si26 = filas.filter(f => f.a === 2026).reduce((a, f) => a + f.si, 0);
  assert.ok(E.sivsoTablaHist.innerHTML.indexOf(c.FMT.format(Math.round(si26))) > -1, 'total SI 2026');
  c.sivsoAlternar('mes', 8);
  assert.ok(/class="mes clicable sel"/.test(E.sivsoTablaHist.innerHTML));
  c.sivsoLimpiarFiltros(); c.sivsoSetHistMed('so');
});
t('Strategic / Tactic market: vienen en el diccionario de productos (opcional) y filtran como cualquier dimensión', () => {
  const f = c.sivsoExpandir_({ v: 2, clientes: [['1', 'CLI', 'KAM', 'Cadenas']], productos: [['P', 'PROD', 'Foto', 'FP', 'SUN CARE', 'DAILY']],
    filas: [['2026-01', 0, 0, 1, 1, 2, 2, 0, 0, 0]] })[0];
  assert.strictEqual(c.sivsoValor(f, 'smk'), 'SUN CARE');
  assert.strictEqual(c.sivsoValor(f, 'tmk'), 'DAILY');
  const sinCol = c.sivsoExpandir_({ v: 2, clientes: [['1', 'CLI', 'KAM', 'Cadenas']], productos: [['P', 'PROD', 'Foto', 'FP']],
    filas: [['2026-01', 0, 0, 1, 1, 2, 2, 0, 0, 0]] })[0];
  assert.strictEqual(c.sivsoValor(sinCol, 'smk'), '');
  assert.strictEqual(c.sivsoHayDatosDim('smk'), false);                      // la hoja de prueba no trae la columna: no se ofrece
  c.setSivsoFiltro('smk', ['NO EXISTE']); c.renderSIvsSO();
  assert.strictEqual(c.sivsoFilas().length, 0);
  c.sivsoLimpiarFiltros();
  assert.ok(c.sivsoFilas().length > 0);
});
console.log('SI vs SO · lanzamientos, rango por Sell Out, histórico de inventario y total YTD');
t('★ Lanzamientos: todo el tablero queda solo con los productos INNOVACIÓN (por Product ID o nombre)', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.sivsoLanzD = k.sivsoLanzPreparar({ productos: [['P2', '', 'PROD 2', 'Derma'], ['', '', 'prod 3', 'Foto']] });
  k.sivsoLanz = true; k.sivsoCache = null; k.renderSIvsSO();
  const ids = new Set(k.sivsoFilas().map(f => f.productId));
  assert.strictEqual(JSON.stringify([...ids].sort()), '["P2","P3"]');
  k.sivsoAlternarLanz();                                                     // se apaga: vuelven todos
  assert.strictEqual(new Set(k.sivsoFilas().map(f => f.productId)).size, 3);
});
t('KPIs y SO/SI: el rango llega hasta el último mes con Sell Out (oct solo con Sell In no cuenta)', () => {
  const k = cargar();
  k.onSIvsSOCargado({ v: 2, clientes, productos, filas: filas.concat([['2026-10', 0, 0, 999, 9, 0, 0, 0, 0, 0]]), meta: {} });
  k.document.getElementById('sivsoAnioFil').value = '2026'; k.renderSIvsSO();
  assert.strictEqual(k.sivsoCortesSO[2026], 9);
  let si = 0; k.sivsoData.filas.forEach(f => { if (f.a === 2026 && f.m <= 9) si += k.sivsoSi(f); });
  assert.strictEqual(k.document.els.sivsoKpiSi.innerText, k.sivsoFmt(si));   // sin los 999 de octubre
  assert.ok(/Sep 2025/.test(k.document.els.sivsoKpiSiDet.innerHTML), k.document.els.sivsoKpiSiDet.innerHTML);
});
t('Tarjeta de KPIs: barras año actual vs anterior de Sell In y Sell Out, DDI y variación en verde / rojo', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.document.getElementById('sivsoAnioFil').value = '2026'; k.renderSIvsSO();
  const h = k.document.els.sivsoKpiComp.innerHTML;
  assert.ok(/Sell In/.test(h) && /Sell Out/.test(h) && /DDI/.test(h), 'tres filas: Sell In, Sell Out y DDI');
  assert.strictEqual((h.match(/class="kv-b ac"/g) || []).length, 2, 'barra del año actual en Sell In y Sell Out');
  assert.strictEqual((h.match(/class="kv-b py"/g) || []).length, 2, 'barra del año anterior');
  assert.ok(/class="kv-var (pos|neg)"/.test(h), 'variación con color');
  const S = k.sivsoSerieMensual(2026); let si = 0, py = 0;
  k.sivsoMesesKpi(k.sivsoKpiArgs.corte).forEach(m => { si += S.acc[m].si; py += S.acc[m].siPy; });
  if (py > 0) assert.ok(h.indexOf(k.sivsoPctSigno(si / py - 1)) !== -1, 'ΔPY% del rango');
  assert.ok(k.document.els.sivsoKpiInv.innerText !== undefined, 'tarjeta de inventario en lugar de la absorción');
});
t('Año: deja de ser chips sueltos; sin la caja Año = el más reciente, y elegir otro lo muestra como filtro', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  assert.strictEqual(k.sivsoAnioElegido(), false);
  k.sivsoSetAnio(2025);
  assert.strictEqual(k.sivsoAnioElegido(), true);
  k.sivsoQuitarDim(null, 'anio');
  assert.strictEqual(k.sivsoAnioSel(), 2026);
});
t('Histórico mensual · Inventario: foto por año × mes, columna "Último" y sin fila Total', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.invError = ''; k.invCargar = () => {};
  k.invD = { meses: [], filas: [{ sap: '1', cliente: 'CLI 1', ean: 'E1', bu: 'FOTO', mes: '2026-08', u: 40, a: 400 },
                                { sap: '2', cliente: 'CLI 2', ean: 'E2', bu: 'DERMA', mes: '2026-08', u: 60, a: 600 },
                                { sap: '1', cliente: 'CLI 1', ean: 'E1', bu: 'FOTO', mes: '2026-09', u: 30, a: 300 }] };
  k.sivsoSetHistMed('inv');
  const h = k.document.els.sivsoTablaHist.innerHTML;
  assert.ok(/Último/.test(h) && !/tfoot/.test(h), h.slice(0, 200));
  assert.ok(h.indexOf('>' + k.FMT.format(k.sivsoUnidad === '#' ? 100 : 1000) + '<') > -1, 'agosto = 40 + 60');
  k.sivsoSetHistMed('so');
});
t('Total YTD con tooltip en las vistas Sell In / Sell Out', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.document.getElementById('sivsoTip').parentNode = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900 }) };
  [1, 2].forEach(i => {
    k.sivsoSetVistaGraf(i);
    assert.ok(/sivsoTipTotal\(event\)/.test(k.document.els.sivsoGraficoMensual.innerHTML), 'vista ' + i);
    k.sivsoTipTotal({ clientX: 10, clientY: 10 });
    assert.ok(/ΔPY%/.test(k.document.els.sivsoTip.innerHTML) && k.document.els.sivsoTip.hidden === false, 'tooltip ' + i);
  });
  k.sivsoSetVistaGraf(0);
});

t('vista Absorción EAN (antes Lanzamientos): todos los productos, Sell In vs Sell Out y absorción hasta el último mes con Sell Out', () => {
  const k = cargar();
  k.onSIvsSOCargado({ v: 2, clientes, productos, filas: filas.concat([['2026-10', 0, 0, 999, 9, 0, 0, 0, 0, 0]]), meta: {} });
  k.sivsoSetVistaGraf(4);
  assert.strictEqual(k.SIVSO_VISTAS_GRAF[4].k, 'abs');
  let h = k.document.els.sivsoGraficoMensual.innerHTML;
  assert.ok(/class="sivso-lz"/.test(h) && !/NaN|undefined|Infinity/.test(h), h.slice(0, 200));
  assert.ok(/PROD 1/.test(h) && /PROD 2/.test(h), 'todos los productos con venta');
  // Con ★ Lanzamientos encendido, solo los de lanzamiento.
  k.sivsoLanzD = k.sivsoLanzPreparar({ productos: [['P1', '', 'PROD 1', 'Foto']] });
  k.sivsoLanz = true; k.sivsoCache = null; k.renderSIvsSO();
  assert.ok(/PROD 1/.test(k.document.els.sivsoGraficoMensual.innerHTML) && !/PROD 2/.test(k.document.els.sivsoGraficoMensual.innerHTML));
  k.sivsoLanz = false; k.sivsoCache = null; k.renderSIvsSO();
  h = k.document.els.sivsoGraficoMensual.innerHTML;
  // PROD 1 en ene–sep 2026 (sin oct): SI y SO de las filas de prueba
  let si = 0, so = 0; k.sivsoData.filas.forEach(f => { if (f.a === 2026 && f.m <= 9 && f.productId === 'P1') { si += k.sivsoSi(f); so += k.sivsoSo(f); } });
  assert.ok(h.indexOf(k.mtdPctEntero(so / si)) > -1, 'absorción de PROD 1');
  assert.ok(h.indexOf(k.sivsoFmtCorta(si)) > -1 && h.indexOf(k.sivsoFmtCorta(999 * 0 + si)) > -1);
  assert.ok(/sivsoAlternar\('producto','P1'\)/.test(h), 'clic filtra el producto');
});

t('Clientes e inventario: Prom SO (últimos 3 meses hasta el último con Sell Out), DDI, Diferencia INV y Tendencia', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.renderSIvsSO();
  const anio = k.sivsoAnioSel(), cSO = k.sivsoCortesSO[anio], k1 = anio * 12 + cSO - 1;
  assert.ok(k.sivsoVistaClientes.length > 0);
  k.sivsoVistaClientes.forEach(x => {
    let so3 = 0, ult = 0;
    k.sivsoData.filas.forEach(f => { if ((f.sapId || f.cliente) !== x.key || f.k < k1 - 2 || f.k > k1) return;
      so3 += k.sivsoSo(f); if (f.k === k1) ult += k.sivsoSo(f); });
    const prom = so3 / 3;
    assert.ok(Math.abs(x.promSo - prom) < 1e-6, 'Prom SO ' + x.cliente);
    if (prom > 0) {
      assert.ok(Math.abs(x.ddi - x.inv / prom * 30) < 1e-6, 'DDI');
      assert.ok(Math.abs(x.difInv - (2 * prom - x.inv)) < 1e-6, 'Diferencia INV = 2 meses de venta - INV');
      assert.ok(Math.abs(x.tend - (ult / prom - 1)) < 1e-9, 'Tendencia');
    } else assert.strictEqual(x.ddi, null);
  });
});

console.log('SI vs SO · filtro Meses, torta SI / SO y tabla Cliente › BU › Producto');
t('filtro Meses (Desde – Hasta): escribe el filtro de mes con el intervalo y el año completo lo quita', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.renderSIvsSO();
  const d = k.document.getElementById('sivsoMesDesde'), h = k.document.getElementById('sivsoMesHasta');
  d.value = '3'; h.value = '5'; k.sivsoSetRango();
  assert.deepStrictEqual(Array.from(k.sivsoFiltros.mes), [3, 4, 5]);
  let so = 0; k.sivsoData.filas.forEach(f => { if (f.a === 2026 && f.m >= 3 && f.m <= 5) so += k.sivsoSo(f); });
  assert.strictEqual(k.document.els.sivsoKpiSo.innerText, k.sivsoFmt(so));
  assert.ok(/Meses: Mar–May/.test(k.document.els.sivsoChips.innerHTML), 'chip del intervalo');
  assert.ok(/Mar–May 2025/.test(k.document.els.sivsoKpiSiDet.innerHTML), k.document.els.sivsoKpiSiDet.innerHTML);
  d.value = '1'; h.value = String(k.sivsoCortes[2026]); k.sivsoSetRango();
  assert.deepStrictEqual(Array.from(k.sivsoFiltros.mes), []);              // año completo = sin filtro
});
t('torta de participación por BU: Sell In o Sell Out con los botones de la tarjeta', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.renderSIvsSO();
  assert.ok(/Sell Out/.test(k.document.els.sivsoDonutBu.innerHTML) && /sivsoSetDonutMed\('si'\)/.test(k.document.els.sivsoDonutMed.innerHTML));
  k.sivsoSetDonutMed('si');
  assert.strictEqual(k.document.els.sivsoDonutTit.textContent, 'Sell In');
  let si = 0; k.sivsoPeriodo('buK', k.sivsoAnioSel(), k.sivsoCortes[k.sivsoAnioSel()]).filas.forEach(f => { si += k.sivsoSi(f); });
  assert.ok(k.document.els.sivsoDonutBu.innerHTML.indexOf(k.sivsoFmtCorta(si)) > -1, 'total de Sell In en el centro');
  k.sivsoSetDonutMed('so');
});
t('Clientes e inventario: cerrada por cliente; "+" abre BU y luego producto; el encabezado abre o cierra todo el nivel', () => {
  const k = cargar(); k.onSIvsSOCargado({ v: 2, clientes, productos, filas, meta: {} });
  k.renderSIvsSO();
  const n0 = k.sivsoArbolFilas.length;
  assert.ok(n0 === k.sivsoVistaClientes.length && k.sivsoArbolFilas.every(r => r.x.nivel === 0), 'todo cerrado = solo clientes');
  const i1 = k.sivsoArbolFilas.findIndex(r => r.x.nombre === 'CLI 1');
  k.sivsoArbolClic(i1, 'tg');                                               // abre CLI 1 → sus BU
  const bus = k.sivsoArbolFilas.filter(r => r.x.nivel === 1);
  assert.ok(bus.length >= 1 && bus.every(r => r.path[0] === 'CLI 1'));
  const cli = k.sivsoArbolFilas[i1].x;
  assert.ok(Math.abs(bus.reduce((a, r) => a + r.x.so, 0) - cli.so) < 1e-6, 'las BU suman el Sell Out del cliente');
  k.sivsoArbolAbrirNivel(1);                                                // abre todas las BU → productos
  assert.ok(k.sivsoArbolFilas.some(r => r.x.nivel === 2), 'se ven productos');
  assert.ok(/class="arb-tg" aria-expanded="true"/.test(k.document.els.sivsoTablaClientes.innerHTML));
  k.sivsoArbolAbrirNivel(0);                                                // todo abierto: el botón de Cliente cierra todo
  assert.strictEqual(k.sivsoArbolFilas.length, n0);
  k.sivsoArbolAbrirNivel(1);
  const ip = k.sivsoArbolFilas.findIndex(r => r.x.nivel === 2);
  const prod = k.sivsoArbolFilas[ip].x.key;
  k.sivsoArbolClic(ip, 'f');                                                // clic en el nombre de un producto = filtro Producto
  assert.deepStrictEqual(Array.from(k.sivsoFiltros.producto), [prod]);
  k.sivsoOrdenarArbol('cli');                                               // ordena clientes por nombre A→Z
  assert.strictEqual(k.sivsoVistaClientes[0].nombre <= k.sivsoVistaClientes[k.sivsoVistaClientes.length - 1].nombre, true);
  assert.ok(!/NaN|undefined/.test(k.document.els.sivsoTablaClientes.innerHTML));
});

console.log('\n' + ok + ' pruebas OK' + (process.exitCode ? ' · HAY FALLAS' : ''));
