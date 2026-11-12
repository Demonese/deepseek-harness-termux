/**
 * Exclusive publication of a completed temporary file for file systems that
 * may deny hard-link creation.
 * @module @deepseek-ai/dsh-session-persistence-jsonl/publish
 */

import { link as fsLink, lstat as fsLstat, rename as fsRename } from 'node:fs/promises'

/** Filesystem calls used to publish; failing peers drive the fallback tests. */
export interface PublishFileSystem {
  link(existingPath: string, newPath: string): Promise<void>
  rename(existingPath: string, newPath: string): Promise<void>
  lstat(path: string): Promise<unknown>
}

const defaultFileSystem: PublishFileSystem = { link: fsLink, rename: fsRename, lstat: fsLstat }

/** Errnos a file system returns when it refuses every hard-link creation. */
const HARDLINK_UNAVAILABLE = new Set(['EACCES', 'EPERM', 'ENOSYS', 'EOPNOTSUPP'])

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

/**
 * Whether `error` reports that this file system or security domain denies
 * hard-link creation, rather than that one call raced another publisher.
 * @param error - rejection from a link request.
 * @returns true for the errnos that indicate hard links are unavailable.
 */
export function isHardLinkUnavailable(error: unknown): boolean {
  const code = errorCode(error)
  return code !== undefined && HARDLINK_UNAVAILABLE.has(code)
}

async function targetExists(target: string, fileSystem: PublishFileSystem): Promise<boolean> {
  try {
    await fileSystem.lstat(target)
    return true
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false
    throw error
  }
}

/**
 * Publish a completed, synced temporary file at a final path that must stay
 * absent, reporting a collision instead of replacing the existing file.
 *
 * `link(2)` is the primary call: it adds the final name while keeping the
 * temporary name, and fails with EEXIST, so two publishers arbitrate without a
 * lock. Some file systems and security domains deny hard-link creation
 * outright; there the temporary file is renamed instead, which publishes the
 * same complete bytes and still never exposes a partially written target, after
 * confirming that the final path is absent. That confirmation is not atomic
 * with the rename, so it relies on the writer lease serializing publishers of
 * one session; callers keep their own pre-publication existence check as the
 * backstop.
 * @param source - completed, synced temporary file beside the target.
 * @param target - final path that must not already exist.
 * @param fileSystem - filesystem calls; tests inject failing peers.
 * @returns true when `source` was published at `target`, false when `target` already existed.
 */
export async function publishNoReplace(
  source: string,
  target: string,
  fileSystem: PublishFileSystem = defaultFileSystem,
): Promise<boolean> {
  try {
    await fileSystem.link(source, target)
    return true
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false
    if (!isHardLinkUnavailable(error)) throw error
  }
  if (await targetExists(target, fileSystem)) return false
  await fileSystem.rename(source, target)
  return true
}
