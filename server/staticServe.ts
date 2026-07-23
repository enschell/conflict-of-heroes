/**
 * Static file serving for the built client (`dist/`), extracted from
 * `index.ts` so it's independently testable — takes `distDir` as an explicit
 * parameter rather than reading a module-level constant, so tests can point
 * it at a small fixture directory instead of depending on a real `npm run
 * build` having happened first.
 */
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ServerResponse } from 'node:http';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export async function serveStatic(distDir: string, url: string, res: ServerResponse): Promise<void> {
  const clean = url.split('?')[0] ?? '/';
  const rel = clean === '/' ? '/index.html' : clean;
  const path = join(distDir, rel);
  // Never serve outside dist/ (no `..` escapes) — fall back to index.html for
  // anything unresolved, matching a normal SPA static-serve convention.
  if (!path.startsWith(distDir)) {
    res.writeHead(400).end('Bad request');
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    // A missing path with a file extension (e.g. /assets/index-OLDHASH.js) is
    // a real static-asset request, not a client-side route — the common way
    // to hit this is a browser with a stale cached index.html still
    // referencing a hashed bundle filename from before the last deploy.
    // Falling back to index.html there would make the browser try to
    // execute/parse HTML as JS/CSS (a confusing failure) instead of a clean
    // 404 it can react to (e.g. reload and pick up the new index.html).
    // Only extensionless paths (SPA router routes) get the index.html
    // fallback.
    if (extname(path)) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const body = await readFile(join(distDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
}
