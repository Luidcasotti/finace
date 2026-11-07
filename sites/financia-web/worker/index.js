import assets from '../.sites-local/assets.js';
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/healthz' || path.startsWith('/api/')) return handleApi(request, env);
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Método não permitido.', { status: 405 });
    const asset =
      assets[path === '/' ? '/index.html' : path] ||
      (!path.includes('.') ? assets['/index.html'] : null);
    if (!asset) return new Response('Não encontrado.', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      headers: {
        'Content-Type': asset.type,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'",
        'Cache-Control': path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    });
  },
};
