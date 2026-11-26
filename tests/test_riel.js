/* Pruebas del riel de vidrio (JsNucleo.html), sin navegador.
 *   node tests/test_riel.js
 * Filtros activos (lee los contadores de cada vista), buscador y rótulo de la franja.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const dir = path.join(__dirname, '..', 'Apps Script');
let ok = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { console.log('  ✗ ' + n + '\n    ' + e.message); process.exitCode = 1; } }

function cargar(expandido) {
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, style: {}, value: '',
    classList: { _c: {}, toggle(c, v) { this._c[c] = v === undefined ? !this._c[c] : !!v; }, contains(c) { return !!this._c[c]; }, add(c) { this._c[c] = true; }, remove(c) { delete this._c[c]; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, getBoundingClientRect: () => ({ left: 10, bottom: 40, width: 200, right: 210, top: 0, height: 40 }) });
  el('shell').classList._c['rail-expandido'] = expandido;
  const ctx = { document: { getElementById: el, querySelectorAll: () => [], addEventListener() {}, documentElement: { getAttribute() {}, setAttribute() {}, removeAttribute() {} } },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} },
    navigator: { platform: 'Win32' }, console, setTimeout: f => f(), clearTimeout() {}, String, Object, Array, JSON, Math, parseInt,
    mtdVistaActiva: 'dig', VENTAS_SUB: ['so', 'sivso', 'ventasmtd', 'dig'], VISTA_SUFIJO: { dig: 'Digital' } };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(dir, 'JsNucleo.html'), 'utf8');
  const ini = src.indexOf('/* ══════════════ Riel de vidrio'), fin = src.indexOf('\nfunction iniciarInfo(){');
  vm.runInContext(src.slice(ini, fin), ctx);
  return { ctx, el };
}

t('Filtros activos: lista los informes cuyo contador tiene filtros, con el número', () => {
  const { ctx, el } = cargar(true);
  el('soContador').textContent = '3'; el('dgContador').textContent = '1'; el('mtdContador').hidden = true; el('mtdContador').textContent = '2';
  ctx.railPintarFiltros();
  const h = el('railFiltros').innerHTML;
  assert.ok(/Sell Out PDV/.test(h) && /Digital/.test(h), 'muestra Sell Out PDV y Digital');
  assert.ok(!/Ventas MTD/.test(h), 'un contador oculto no cuenta');
  assert.ok(/rail-filtro actual/.test(h), 'el informe abierto va marcado');
});
t('Filtros activos colapsado: solo puntos con tooltip; sin filtros, nada', () => {
  const { ctx, el } = cargar(false);
  ctx.railPintarFiltros();
  assert.strictEqual(el('railFiltros').innerHTML, '');
  el('ybContador').textContent = '2'; ctx.railPintarFiltros();
  assert.ok(/data-tip="Perfect Store · 2 filtros"/.test(el('railFiltros').innerHTML));
});
t('Buscador: ignora tildes y mayúsculas', () => {
  const { ctx, el } = cargar(true);
  ctx.railBuscar('PERFECT');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.railLista.map(d => d[0]))), ['yoobic']);
  ctx.railBuscar('digítal');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.railLista.map(d => d[0]))), ['dig']);
  ctx.railBuscar('zzz');
  assert.ok(/Sin resultados/.test(el('railRes').innerHTML));
});

console.log('\n' + ok + ' pruebas OK');
