import { createCanvas, loadImage } from '../../node_modules/@napi-rs/canvas/index.js';
import { readdirSync, writeFileSync, statSync } from 'node:fs';
let antes = 0, depois = 0;
for (const f of readdirSync('shots').filter(n => n.endsWith('.png') && !n.startsWith('_'))) {
  const img = await loadImage('shots/' + f); antes += statSync('shots/' + f).size;
  const max = f.startsWith('m') && /^m\d/.test(f) ? 780 : 1500; const k = Math.min(1, max / img.width);
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k)), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const buf = c.toBuffer('image/jpeg', 88); writeFileSync('img/' + f.replace('.png', '.jpg'), buf); depois += buf.length;
  console.log(f.replace('.png', ''), img.width + 'x' + img.height, '->', c.width + 'x' + c.height, Math.round(buf.length / 1024) + 'KB');
}
console.log('total antes', Math.round(antes / 1048576) + 'MB, depois', Math.round(depois / 1048576) + 'MB');
