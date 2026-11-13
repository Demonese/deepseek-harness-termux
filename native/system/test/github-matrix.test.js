import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deviceBuiltPlatforms, hostedPlatformDirs, platformDirs } from '../scripts/repo.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Every platform package name in this checkout, hosted or device-built. */
const allPlatforms = new Set(platformDirs().map((dir) => dir.split('/').pop()));

function matrix(target) {
  const result = spawnSync(process.execPath, ['./scripts/github-matrix.mjs', target], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).include;
}

test('device-built platforms partition the platform packages', () => {
  const hosted = new Set(hostedPlatformDirs().map((dir) => dir.split('/').pop()));
  for (const name of deviceBuiltPlatforms) assert.equal(allPlatforms.has(name), true, `${name} has no platform package`);
  assert.deepEqual(new Set([...hosted, ...deviceBuiltPlatforms]), allPlatforms);
  for (const name of deviceBuiltPlatforms) assert.equal(hosted.has(name), false, `${name} would run on a GitHub runner`);
});

test('CI and release matrices carry one leg per hosted platform and no device-built one', () => {
  const hosted = new Set(hostedPlatformDirs().map((dir) => dir.split('/').pop()));
  for (const target of ['ci', 'release-prebuild']) {
    const legs = matrix(target);
    assert.deepEqual(new Set(legs.map((leg) => leg.platform)), hosted, target);
    for (const leg of legs) assert.equal(typeof leg.runner, 'string', `${target}: ${leg.platform} has no runner`);
  }
});
