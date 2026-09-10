import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || process.env.WEB_PORT || 8081);
const DIST_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  process.argv[2] || 'dist',
);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(DIST_DIR, relative);
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const pathname = req.url || '/';
    let filePath = safePath(pathname);

    // Serve the requested static file first.
    // This is critical for .wasm files.
    if (!(await isFile(filePath))) {
      // Expo Router uses client-side routing, so unknown HTML routes
      // should fall back to index.html.
      const acceptsHtml = req.headers.accept?.includes('text/html');

      if (acceptsHtml) {
        filePath = join(DIST_DIR, 'index.html');
      } else {
        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end('Not found');
        return;
      }
    }

    const body = await readFile(filePath);

    res.writeHead(200, {
      'Content-Type': contentType(filePath),

      // Required by the app for SharedArrayBuffer/WASM use.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',

      'Cache-Control': 'no-cache',
    });

    res.end(body);
  } catch (error) {
    console.error('Failed to serve request:', error);

    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8',
    });

    res.end('Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`PrepPilot web demo running at http://localhost:${PORT}`);
  console.log(`Serving: ${DIST_DIR}`);
});