import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStatic } from '../staticServe';

/** Minimal fake of the subset of `http.ServerResponse` `serveStatic` uses. */
function fakeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      res.status = status;
      if (headers) res.headers = headers;
      return res;
    },
    end(body?: string | Buffer) {
      if (body != null) res.body = body.toString();
    },
  };
  return res as unknown as import('node:http').ServerResponse & typeof res;
}

describe('serveStatic', () => {
  let distDir: string;

  beforeEach(async () => {
    distDir = await mkdtemp(join(tmpdir(), 'coh-dist-'));
    await writeFile(join(distDir, 'index.html'), '<!doctype html><title>index</title>');
    await mkdir(join(distDir, 'assets'));
    await writeFile(join(distDir, 'assets', 'app-REALHASH.js'), 'console.log(1);');
  });

  afterEach(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  it('serves index.html for /', async () => {
    const res = fakeRes();
    await serveStatic(distDir, '/', res);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.body).toContain('index');
  });

  it('serves a real asset with the right content type', async () => {
    const res = fakeRes();
    await serveStatic(distDir, '/assets/app-REALHASH.js', res);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/javascript');
    expect(res.body).toBe('console.log(1);');
  });

  it('404s a missing asset with a file extension, rather than falling back to index.html', async () => {
    // The common real-world trigger: a browser with a stale cached index.html
    // still referencing a hashed bundle filename from before the last
    // deploy — it must see a clean 404 (so it can reload and pick up the
    // new index.html), not get served HTML in place of the JS it asked for.
    const res = fakeRes();
    await serveStatic(distDir, '/assets/app-OLDHASH.js', res);
    expect(res.status).toBe(404);
    expect(res.headers['Content-Type']).toBeUndefined();
  });

  it('falls back to index.html for an extensionless SPA route', async () => {
    const res = fakeRes();
    await serveStatic(distDir, '/some/client/route', res);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.body).toContain('index');
  });

  it('refuses a path-traversal attempt', async () => {
    // Enough `../` segments to escape `distDir` regardless of how deep the
    // OS's temp directory happens to be nested on the machine running this.
    const res = fakeRes();
    await serveStatic(distDir, '/' + '../'.repeat(20) + 'etc/passwd', res);
    expect(res.status).toBe(400);
  });
});
