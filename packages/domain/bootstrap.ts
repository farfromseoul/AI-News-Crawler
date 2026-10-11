// Temporary production bootstrap. UTC corresponds to 2026-10-11 22:50–22:57 KST.
export const bootstrapCron = '50-57 13 11 10 *';
export const bootstrapDate = '2026-10-11';
const bootstrapSources = [
  'cncf',
  'thenewstack',
  'infoq',
  'aws',
  'kubernetes',
  'cloudflare',
  'martinfowler',
  'bytebytego',
] as const;
export function bootstrapSource(time: number) {
  const date = new Date(time);
  if (
    !Number.isFinite(time) ||
    date.toISOString().slice(0, 10) !== bootstrapDate ||
    date.getUTCHours() !== 13
  )
    return;
  return bootstrapSources[date.getUTCMinutes() - 50];
}
