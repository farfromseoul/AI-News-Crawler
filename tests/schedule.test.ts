import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectorCrons, scheduledJob, staleHours } from '../packages/domain/schedule';
it('collects daily, twice weekly and weekly sources in separate slots with X disabled', () => {
  const counts: Record<string, number> = {};
  for (let day = 0; day < 7; day++)
    for (let hour = 0; hour < 24; hour++) {
      const job = scheduledJob(Date.UTC(2026, 9, 11 + day, hour));
      if (job) counts[job] = (counts[job] ?? 0) + 1;
    }
  expect(counts).toEqual({
    geeknews: 7,
    hackernews: 7,
    youtube: 7,
    cncf: 7,
    thenewstack: 7,
    infoq: 7,
    aws: 2,
    kubernetes: 2,
    cloudflare: 2,
    martinfowler: 1,
    bytebytego: 1,
    conferences: 2,
  });
  expect(scheduledJob(Date.parse('2026-10-12T06:00:00Z'))).toBeUndefined();
  expect(scheduledJob(Date.parse('2026-10-13T06:00:00Z'))).toBe('aws');
  expect(scheduledJob(Date.parse('2026-10-13T06:01:00Z'))).toBeUndefined();
});
it('keeps deployed crons aligned with the shared schedule and tolerates weekly freshness', () => {
  const config = readFileSync('wrangler.collector.jsonc', 'utf8');
  expect(JSON.parse(config.match(/"crons"\s*:\s*(\[[\s\S]*?\])/)![1])).toEqual(collectorCrons);
  expect(staleHours('martinfowler')).toBe(170);
  expect(staleHours('aws')).toBe(98);
  expect(staleHours('cncf')).toBe(26);
});

it('targets exactly eight RSS feeds on the requested date and never repeats next year', async () => {
  const { bootstrapSource } = await import('../packages/domain/bootstrap');
  const found = Array.from({ length: 8 }, (_, i) =>
    bootstrapSource(Date.UTC(2026, 9, 11, 13, 50 + i)),
  );
  expect(found).toEqual([
    'cncf',
    'thenewstack',
    'infoq',
    'aws',
    'kubernetes',
    'cloudflare',
    'martinfowler',
    'bytebytego',
  ]);
  expect(bootstrapSource(Date.UTC(2026, 9, 11, 13, 49))).toBeUndefined();
  expect(bootstrapSource(Date.UTC(2026, 9, 11, 13, 58))).toBeUndefined();
  expect(bootstrapSource(Date.UTC(2027, 9, 11, 13, 50))).toBeUndefined();
});
