import { unstable_readConfig } from 'wrangler';
const configs = ['wrangler.jsonc', 'wrangler.collector.jsonc'].map((path) =>
  unstable_readConfig({ config: path }),
);
const ids = configs.map((c) => c.d1_databases[0].database_id);
if (ids.some((id) => id.startsWith('00000000-')) || ids[0] !== ids[1])
  throw new Error('Set the same real D1 database_id in both Wrangler configs before deploying.');
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  throw new Error('Cloudflare deployment secrets are missing.');
