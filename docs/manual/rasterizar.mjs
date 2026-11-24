import { createCanvas } from '../../node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const [,, arq, esc = '0.55'] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arq)), useSystemFonts: true, verbosity: 0 }).promise;
const k = parseFloat(esc);
for (let p = 1; p <= doc.numPages; p++) {
  const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: k });
  const c = createCanvas(Math.round(vp.width), Math.round(vp.height)); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
  writeFileSync(`pg/p${String(p).padStart(2, '0')}.png`, c.toBuffer('image/png'));
}
console.log('páginas', doc.numPages);
