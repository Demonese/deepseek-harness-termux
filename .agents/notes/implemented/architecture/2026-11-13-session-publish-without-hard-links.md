# Agent Note: Session publication without hard links

Status: implemented

English | [中文](2026-11-13-session-publish-without-hard-links.zh.md)

## Problem

The JSONL session backend published a session's first generation and every later immutable generation with `link(2)`: the second name appears atomically and an existing target fails with `EEXIST`, which arbitrates concurrent publishers without a lock. Some file systems and security domains deny hard-link creation outright — the Android Termux app domain returns `EACCES` for every `link`, including links between two files it just created in the same directory. Session creation therefore failed before the first model request, so no session could be opened on such a host.

## Decision

`publishNoReplace()` in `packages/session/session-persistence-jsonl/src/publish.ts` owns publication. It links the completed, synced temporary file; `EEXIST` reports a collision instead of replacing the target; the errnos that mean this host cannot create hard links (`EACCES`, `EPERM`, `ENOSYS`, `EOPNOTSUPP`) confirm the target is still absent and rename the same temporary file instead. Every other failure propagates unchanged. A rename publishes the same complete bytes and never exposes a partially written target; only the absence check before it is not atomic with the rename.

Both publication sites use it: `materializePosix()` for a session's first generation, and `publishCurrentExclusive()` for immutable generation publication through the injected generation file system. Each runs while the session's write lease is held — open-for-write acquires it before publishing a historical generation, and a created session acquires it before its first materializing write.

## Alternatives considered

Require hard-link support and refuse to run without it. Rejected: sessions are the product's storage, so a host that cannot publish them has no usable product, and the failure surfaced as an unexplained `EACCES` rather than a capability statement.

`renameat2(RENAME_NOREPLACE)` through the native system addon or koffi. Rejected for now: it restores atomic no-clobber publication, and the call succeeds on the reporting host, but it needs a new symbol in every published platform addon plus the native release that ships it. The rename beside an absence check keeps the protocol working with no new native surface; this stays the stronger option if a publisher ever has to run outside the writer lease.

Exclusive creation plus streaming copy (`open(O_EXCL)` and copy). Rejected: a crash mid-copy leaves a partially written generation at the final name, which is the state publication promises never to expose.

Always rename, without the capability check. Rejected: it discards the `EEXIST` arbitration on file systems that can provide it.

## Consequences

Where hard links are unavailable the absence check and the rename are not one atomic step, so concurrent publishers of one session rely on the writer lease, which is held across publication; each caller keeps its pre-publication existence check as the backstop. A publisher acting outside the lease could replace a just-published generation, whose bytes in practice come from the same source.

Coverage stays per-file 100%: `publish.ts` owns every branch, and generation tests drive the fallback by making the injected `link` report `EACCES`.

Two generation tests simulated a racing winner by creating a real hard link; they now publish the winner's bytes with `copyFile` because their subject is the byte arbitration, not the inode. The one case that requires a shared inode skips where the file system denies hard links.
