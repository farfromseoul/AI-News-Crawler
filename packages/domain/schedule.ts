import schedule from './schedule.json';
export function scheduledJob(time: number) {
  const date = new Date(time);
  if (date.getUTCMinutes() !== 0) return undefined;
  return schedule.jobs.find(
    (j) =>
      j.hourUTC === date.getUTCHours() && (!j.days.length || j.days.includes(date.getUTCDay())),
  )?.source;
}
export function staleHours(source: string) {
  return schedule.jobs.find((j) => j.source === source)?.staleHours ?? 26;
}
export const collectorCrons = schedule.crons;
