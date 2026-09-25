import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Dev-only endpoint used by art.html to save pre-rendered illustrations into public/art. */
function artStudio(): Plugin {
  return {
    name: 'void-rush-art-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__art/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[a-z0-9_-]+\.(webp|png)$/.test(name)) {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = path.join(here, 'public/art');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), artStudio()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  preview: { host: true, port: 4173, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: path.join(here, 'index.html') },
    },
  },
});

