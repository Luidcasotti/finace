import { build } from 'esbuild';
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const assets = {};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else {
      const key = '/' + relative('dist/client', path).replaceAll('\\', '/');
      const extension = name.slice(name.lastIndexOf('.'));
      assets[key] = {
        body: readFileSync(path, 'utf8'),
        type: types[extension] || 'text/plain; charset=utf-8',
      };
    }
  }
}
walk('dist/client');
mkdirSync('.sites-local', { recursive: true });
writeFileSync('.sites-local/assets.js', `export default ${JSON.stringify(assets)};\n`);
await build({
  entryPoints: ['worker/index.js'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  external: ['node:crypto'],
});
mkdirSync('dist/.openai', { recursive: true });
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Worker and embedded frontend assets built.');
