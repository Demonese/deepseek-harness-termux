import { describe, expect, it, vi } from 'vitest'
import { isHardLinkUnavailable, publishNoReplace, type PublishFileSystem } from '../src/publish.ts'

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}

function fakeFileSystem(overrides: Partial<PublishFileSystem> = {}): PublishFileSystem {
  return {
    link: async () => {},
    rename: async () => {},
    lstat: async () => { throw errnoError('ENOENT') },
    ...overrides,
  }
}

describe('publishNoReplace', () => {
  it('publishes through link without renaming', async () => {
    const rename = vi.fn(async () => {})
    await expect(publishNoReplace('tmp', 'target', fakeFileSystem({ rename }))).resolves.toBe(true)
    expect(rename).not.toHaveBeenCalled()
  })

  it('reports a collision when the final path already exists', async () => {
    const fileSystem = fakeFileSystem({ link: async () => { throw errnoError('EEXIST') } })
    await expect(publishNoReplace('tmp', 'target', fileSystem)).resolves.toBe(false)
  })

  it.each(['EACCES', 'EPERM', 'ENOSYS', 'EOPNOTSUPP'])(
    'renames the temporary file when hard links are unavailable (%s)',
    async (code) => {
      const rename = vi.fn(async () => {})
      const fileSystem = fakeFileSystem({ link: async () => { throw errnoError(code) }, rename })
      await expect(publishNoReplace('tmp', 'target', fileSystem)).resolves.toBe(true)
      expect(rename).toHaveBeenCalledWith('tmp', 'target')
    },
  )

  it('reports a collision when hard links are unavailable and the final path exists', async () => {
    const rename = vi.fn(async () => {})
    const fileSystem = fakeFileSystem({
      link: async () => { throw errnoError('EPERM') },
      lstat: async () => ({}),
      rename,
    })
    await expect(publishNoReplace('tmp', 'target', fileSystem)).resolves.toBe(false)
    expect(rename).not.toHaveBeenCalled()
  })

  it('propagates a link failure that is neither a collision nor missing hard-link support', async () => {
    const fileSystem = fakeFileSystem({ link: async () => { throw errnoError('ENOSPC') } })
    await expect(publishNoReplace('tmp', 'target', fileSystem)).rejects.toMatchObject({ code: 'ENOSPC' })
  })

  it('propagates an inspection failure on the hard-link-free path', async () => {
    const fileSystem = fakeFileSystem({
      link: async () => { throw errnoError('EACCES') },
      lstat: async () => { throw errnoError('EIO') },
    })
    await expect(publishNoReplace('tmp', 'target', fileSystem)).rejects.toMatchObject({ code: 'EIO' })
  })
})

describe('isHardLinkUnavailable', () => {
  it('classifies only the errnos that mean hard links are unavailable', () => {
    for (const code of ['EACCES', 'EPERM', 'ENOSYS', 'EOPNOTSUPP']) {
      expect(isHardLinkUnavailable(errnoError(code))).toBe(true)
    }
    for (const code of ['EEXIST', 'ENOENT', 'ENOSPC']) {
      expect(isHardLinkUnavailable(errnoError(code))).toBe(false)
    }
    expect(isHardLinkUnavailable(new Error('no errno'))).toBe(false)
  })
})
