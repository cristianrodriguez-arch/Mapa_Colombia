/* Comprueba que el JavaScript de cada Js*.html de Apps Script es sintácticamente válido
 * (un error de sintaxis en UNO rompe toda la web app, y Apps Script no avisa al hacer push).
 *   node tests/chequeo_sintaxis_html.js
 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'Apps Script');
let fallos = 0;
fs.readdirSync(dir).filter(f => /^Js.*\.html$/.test(f) || f === 'Index.html').forEach(f => {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const bloques = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  bloques.forEach((b, i) => {
    try { new Function(b); }
    catch (e) { fallos++; console.log('✗ ' + f + ' (script ' + (i + 1) + '): ' + e.message); }
  });
  if (!fallos) console.log('✓ ' + f + ' (' + bloques.length + ' bloque(s))');
});
process.exitCode = fallos ? 1 : 0;
