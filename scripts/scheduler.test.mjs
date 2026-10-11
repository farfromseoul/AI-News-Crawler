import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun, isDue } from './scheduler.mjs';
test('schedules the next 09:00 KST across midnight and year boundaries', () => {
  assert.equal(new Date(nextRun(Date.parse('2026-10-10T17:00:00Z'))).toISOString(), '2026-10-11T00:00:00.000Z');
  assert.equal(new Date(nextRun(Date.parse('2026-12-31T00:00:00Z'))).toISOString(), '2027-01-01T00:00:00.000Z');
});
test('runs a missed deadline on wake without overlapping a running collector', () => {
  assert.equal(isDue(99,100,false),false);
  assert.equal(isDue(100,100,false),true);
  assert.equal(isDue(200,100,true),false);
  assert.equal(isDue(200,100,false),true);
});
