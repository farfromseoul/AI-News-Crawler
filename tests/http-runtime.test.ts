import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

it('uses workerd-compatible requests and blocks redirects without following them', async () => {
  const bundle = await build({
    entryPoints: ['packages/sources/http.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Http',
    platform: 'browser',
  });
  const mf = new Miniflare({
    workers: [
      {
        config: { name: 'http-test', compatibilityDate: '2025-10-01' },
        legacy: {
          serviceWorkerScript: `${bundle.outputFiles[0].text}
      addEventListener('fetch', event => event.respondWith((async () => {
        let calls = 0;
        globalThis.fetch = async (url, init) => {
          calls++;
          new Request(url, init); // Native workerd validates redirect modes.
          return new Response('', {status: 302, headers: {Location: 'https://example.com/next'}});
        };
        try { await Http.request('https://example.com'); return new Response('unexpected success'); }
        catch (error) { return Response.json({code: error.code, calls}); }
      })()));`,
        },
      },
    ],
  });
  try {
    expect(await (await mf.dispatchFetch('http://localhost')).json()).toEqual({
      code: 'redirect_blocked',
      calls: 1,
    });
  } finally {
    await mf.dispose();
  }
});
