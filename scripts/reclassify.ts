import { getPlatformProxy } from 'wrangler';
import { NewsRepository } from '../packages/storage';
import { normalize } from '../packages/domain';
import type { CollectorEnv } from '../workers/collector';
// Local only: reclassify persisted rows without fetching external sources or changing IDs.
const proxy = await getPlatformProxy<CollectorEnv>({
  configPath: 'wrangler.collector.jsonc',
  persist: { path: '.wrangler/state/v3' },
});
try {
  const repo = new NewsRepository(proxy.env.DB);
  let cursor = '';
  let updated = 0;
  while (true) {
    const rows = await proxy.env.DB.prepare(
      'SELECT id FROM items WHERE id > ? ORDER BY id LIMIT 50',
    )
      .bind(cursor)
      .all<{ id: string }>();
    if (!rows.results.length) break;
    for (const row of rows.results) {
      const item = await repo.get(row.id);
      if (!item) continue;
      const next = normalize(
        {
          ...item,
          publishedAt: item.publishedAt ?? undefined,
          thumbnailUrl: item.thumbnailUrl ?? undefined,
        },
        item.collectedAt,
      );
      if (next) updated += await repo.upsert([next]);
      cursor = row.id;
    }
  }
  console.log({ updated });
} finally {
  await proxy.dispose();
}
