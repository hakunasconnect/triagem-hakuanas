import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const out = await build({ entryPoints: ['src/admin/admin.js'], bundle: true, minify: true, write: false, target: ['es2020'], format: 'iife' });
const js = out.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = (await readFile('src/admin/admin.html', 'utf8')).replace('/*__ADMIN_BUNDLE__*/', () => js);
await writeFile('dist/admin.html', html);
