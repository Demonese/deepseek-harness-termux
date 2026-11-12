import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, parse } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { dependency, existsSync } = vi.hoisted(() => ({
  dependency: { rgPath: '/node_modules/@vscode/ripgrep/bin/rg' },
  existsSync: vi.fn(),
}))
const originalPlatform = process.platform
const originalExecPath = process.execPath
const temporaryDirectories: string[] = []

/** Create a PATH entry holding an `rg` file with the given mode. */
function pathEntry(executable: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-rg-path-'))
  temporaryDirectories.push(directory)
  writeFileSync(join(directory, 'rg'), '#!/bin/sh\n', { mode: executable ? 0o755 : 0o644 })
  return directory
}

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync }
})

vi.mock('@vscode/ripgrep', () => ({ get rgPath() { return dependency.rgPath } }))

beforeEach(() => {
  vi.resetModules()
  existsSync.mockReset()
  dependency.rgPath = '/node_modules/@vscode/ripgrep/bin/rg'
  Reflect.deleteProperty(process, 'pkg')
  Reflect.deleteProperty(process.versions, 'electron')
  Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: originalPlatform })
  process.execPath = originalExecPath
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
  Reflect.deleteProperty(process, 'pkg')
  Reflect.deleteProperty(process.versions, 'electron')
  Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: originalPlatform })
  process.execPath = originalExecPath
})

describe('ripgrep resolution', () => {
  it('uses the native sidecar beside the current executable', async () => {
    Reflect.defineProperty(process, 'pkg', { configurable: true, value: {} })
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'linux' })
    process.execPath = '/runtime/dsh'
    existsSync.mockReturnValue(true)
    const sidecar = '/runtime/dsh-rg'
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(sidecar)
    expect(existsSync).toHaveBeenCalledWith(sidecar)
  })

  it('uses a conventional executable name for the Windows ripgrep sidecar', async () => {
    Reflect.defineProperty(process, 'pkg', { configurable: true, value: {} })
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'win32' })
    process.execPath = 'C:\\runtime\\deepseek-harness-sdk-runtime-win-x64.exe'
    existsSync.mockReturnValue(true)
    const sidecar = 'C:\\runtime\\deepseek-harness-sdk-runtime-win-x64-rg.exe'
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(sidecar)
    expect(existsSync).toHaveBeenCalledWith(sidecar)
  })

  it('uses the dependency binary in an ordinary Node process', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'linux' })
    existsSync.mockReturnValue(true)
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(dependency.rgPath)
    expect(existsSync).not.toHaveBeenCalled()
  })

  it('uses the dependency binary when a packaged runtime has no sidecar', async () => {
    Reflect.defineProperty(process, 'pkg', { configurable: true, value: {} })
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'linux' })
    existsSync.mockReturnValue(false)
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(dependency.rgPath)
    const executable = parse(process.execPath)
    const sidecar = process.platform === 'win32'
      ? join(executable.dir, `${executable.name}-rg.exe`)
      : `${process.execPath}-rg`
    expect(existsSync).toHaveBeenCalledWith(sidecar)
  })

  it('uses the unpacked executable path for an Electron ASAR dependency', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'linux' })
    Reflect.defineProperty(process.versions, 'electron', { configurable: true, value: '44.0.0' })
    dependency.rgPath = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@vscode/ripgrep/bin/rg'
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(
      '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/@vscode/ripgrep/bin/rg',
    )
  })

  it('reads the executable from PATH on Android, whose platform package is unpublished', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'android' })
    const directory = pathEntry(true)
    vi.stubEnv('PATH', directory)
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(join(directory, 'rg'))
  })

  it('skips a non-executable rg entry on the Android PATH', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'android' })
    const directory = pathEntry(true)
    vi.stubEnv('PATH', [pathEntry(false), directory, ''].join(delimiter))
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe(join(directory, 'rg'))
  })

  it('reports the missing PATH value when Android has no PATH to scan', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'android' })
    vi.stubEnv('PATH', undefined)
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).rejects.toThrow(/no executable "rg" is on PATH/)
  })

  it('names the Android platform when PATH holds no ripgrep', async () => {
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'android' })
    vi.stubEnv('PATH', pathEntry(false))
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).rejects.toThrow(
      `ripgrep publishes no executable for android-${process.arch}, and no executable "rg" is on PATH; install ripgrep (Termux: pkg install ripgrep)`,
    )
  })

  it('prefers a packaged sidecar to the Android PATH', async () => {
    Reflect.defineProperty(process, 'pkg', { configurable: true, value: {} })
    Reflect.defineProperty(process, 'platform', { configurable: true, enumerable: true, value: 'android' })
    process.execPath = '/runtime/dsh'
    existsSync.mockReturnValue(true)
    vi.stubEnv('PATH', pathEntry(true))
    const { resolveRgPath } = await import('@deepseek-ai/dsh-util-ripgrep')

    await expect(resolveRgPath()).resolves.toBe('/runtime/dsh-rg')
  })
})
