import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  INTERNALS_FLAG,
  INTERNALS_REEXEC_MARKER,
  internalsReexecArgv,
  needsInternalsReexec,
} from '../src/internals-reexec.ts'

describe('internals restart decision', () => {
  const state = (platform: NodeJS.Platform, execArgv: string[] = [], marker?: string) =>
    ({ platform, execArgv, marker })

  it('restarts Android, which publishes no internals addon', () => {
    expect(needsInternalsReexec(state('android'))).toBe(true)
  })

  it('keeps a process that already has the flag, another platform, or the restart marker', () => {
    expect(needsInternalsReexec(state('android', [INTERNALS_FLAG]))).toBe(false)
    expect(needsInternalsReexec(state('linux'))).toBe(false)
    expect(needsInternalsReexec(state('android', [], '1'))).toBe(false)
  })
})

describe('internals restart command line', () => {
  it('keeps the running Node options and appends the flag before the entry', () => {
    expect(internalsReexecArgv(['--no-warnings'], '/install/lib/bin.js', ['--profile', 'web']))
      .toEqual(['--no-warnings', INTERNALS_FLAG, '/install/lib/bin.js', '--profile', 'web'])
  })
})

describe('internals restart execution', () => {
  it('runs the entry with the flag, the original arguments, and the restart marker', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-internals-reexec-'))
    const entry = join(home, 'report.mjs')
    const runner = join(home, 'runner.mjs')
    writeFileSync(entry, [
      'process.stdout.write(JSON.stringify({',
      '  execArgv: process.execArgv,',
      '  argv: process.argv.slice(2),',
      `  marker: process.env.${INTERNALS_REEXEC_MARKER},`,
      '}))',
      '',
    ].join('\n'))
    writeFileSync(runner, [
      `const { reexecWithInternals } = await import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('../src/internals-reexec.ts', import.meta.url))).href)})`,
      `await reexecWithInternals(${JSON.stringify(entry)}, ['--profile', 'headless'])`,
      '',
    ].join('\n'))
    try {
      const result = spawnSync(process.execPath, ['--import', 'tsx/esm', runner], { encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const reported = JSON.parse(result.stdout) as { execArgv: string[]; argv: string[]; marker: string }
      expect(reported.execArgv).toContain(INTERNALS_FLAG)
      expect(reported.argv).toEqual(['--profile', 'headless'])
      expect(reported.marker).toBe('1')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
