import { getPlatformProxy } from 'wrangler';
import { engineeringFeeds, type Source } from '../packages/domain';
import { collectSource, type CollectorEnv } from '../workers/collector';
const proxy = await getPlatformProxy<CollectorEnv>({
  configPath: 'wrangler.collector.jsonc',
  persist: { path: '.wrangler/state/v3' },
});
try {
  for (const source of Object.keys(engineeringFeeds) as Source[]) {
    const result = await collectSource(proxy.env, source);
    console.log(JSON.stringify(result));
    if (result.status === 'error') process.exitCode = 1;
  }
} finally {
  await proxy.dispose();
}
