import { getPlatformProxy } from 'wrangler';
import {
  collectAll,
  collectScheduled,
  collectSource,
  type CollectorEnv,
} from '../workers/collector';
import { parseGeekNews } from '../packages/sources';
import { readFile } from 'node:fs/promises';
import { sources, type Source } from '../packages/domain';
const scheduledIndex = process.argv.indexOf('--scheduled-at');
const scheduledAt = scheduledIndex >= 0 ? Number(process.argv[scheduledIndex + 1]) : undefined;
if (scheduledIndex >= 0 && !Number.isFinite(scheduledAt)) throw new Error('Invalid scheduled time');
const sourceIndex = process.argv.indexOf('--source');
const selected = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : undefined;
if (sourceIndex >= 0 && !sources.includes(selected as Source)) throw new Error('Invalid --source');

// getPlatformProxy expects the versioned path; Wrangler CLI appends /v3 itself.
const proxy = await getPlatformProxy<CollectorEnv>({
  configPath: 'wrangler.collector.jsonc',
  persist: { path: '.wrangler/state/v3' },
});
try {
  const fileIndex = process.argv.indexOf('--geeknews-file');
  const result =
    scheduledAt !== undefined
      ? await collectScheduled(proxy.env, scheduledAt)
      : fileIndex >= 0
        ? await collectSource(proxy.env, 'geeknews', {
            source: 'geeknews',
            async fetch() {
              return {
                items: parseGeekNews(await readFile(process.argv[fileIndex + 1], 'utf8')),
                complete: true,
              };
            },
          })
        : selected
          ? await collectSource(proxy.env, selected as Source)
          : await collectAll(proxy.env);
  console.log(JSON.stringify(result, null, 2));
  if ((Array.isArray(result) ? result : [result]).some((r) => r?.status === 'error'))
    process.exitCode = 1;
} finally {
  await proxy.dispose();
}
