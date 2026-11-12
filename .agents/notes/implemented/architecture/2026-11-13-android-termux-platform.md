# Agent Note: Android Termux platform support

Status: implemented

English | [中文](2026-11-13-android-termux-platform.zh.md)

## Problem

The Harness shipped binaries and platform packages for Linux, macOS, and Windows only. Android through Termux runs Node.js 24 with `process.platform === 'android'`, so every gate keyed on `linux`/`darwin` and every prebuilt artifact keyed on those platform names misses. Session write leases reject with `ERR_FLOCK_UNSUPPORTED_PLATFORM` because `@deepseek-ai/node-addon-system` has no Android platform package; profile resolution aborts at boot because `node-addon-require-builtin` publishes no Android binding and cannot reach Node's internal module loader; `koffi` has no Android prebuild and its source build fails on bionic's `statx`; and Lefthook publishes no Android executable, so its installer failed the whole `pnpm install`.

## Decision

Four platform changes make the source checkout run on Android arm64.

`patches/koffi@3.1.1.patch` declares `statx()` under `__ANDROID__`. bionic guards the declaration behind `__USE_GNU` and API level 30, so the compiler read `statx(...)` as a construction of the `struct statx` that `<linux/stat.h>` defines, and the addon could not build. Android exports the `statx()` function from API 30 on, which is below the floor of any Termux install shipping Node 24.

`internalModules()` in `packages/boot/app-boot/src/profile-resolution/resolver.ts` answers internal module ids through `require()` when the process runs with `--expose-internals`, and falls back to `node-addon-require-builtin` otherwise. Every root launcher passes the flag, and `verify-application-entrypoints` rejects a source launch that omits it; the flag costs nothing where the addon is installed. This is the order the vendored Loader already uses.

`native/system/packages/android-arm64` adds a platform package with one Node-API v8 addon at `bin/system.node` and no libc split, because bionic has none. `native/system/scripts/build.ts` builds it with the host `cc` and the running Node installation's headers, so `pnpm run build:native-system` produces it without a cross toolchain. The platform package carries no Landlock launcher: kernels before 5.13 have no Landlock, so the probe reports unusable and confinement stays off.

`@vscode/ripgrep` publishes no Android platform package either, so `resolveRgPath()` reads the first executable `rg` from `PATH` there and the Termux `ripgrep` package serves `glob`, `grep`, and workspace search. Other platforms keep the packaged executable and still fail loudly when it is missing.

`scripts/install-lefthook.mjs` resolves the executable package that Lefthook's own lookup would load, and skips hook installation with a message when it is absent. A missing binary is a missing capability, not a wrong repository state, so it must not fail dependency installation.

## Alternatives considered

Build `node-addon-require-builtin` for Android from source. Rejected: the published package carries no sources, and the addon binds Node's internal module-loader structures, whose ABI moves between minor releases; a locally compiled copy would need the same chase per Node upgrade that the published addon already carries, on a platform the project builds no artifacts for.

Leave the session write lock unsaturated on Android. Rejected: the lock is the cross-process exclusion for a session directory, and making it optional per platform would admit concurrent writers exactly where several Termux sessions can share one checkout.

Document a sequence of manual Termux commands instead of changing the repository. Rejected: the failures surface inside `pnpm install` and application boot, where a maintainer cannot tell a platform gap from a broken checkout.

Patch `node-pty` for Android. Rejected because no patch is needed: its install script builds from source once the host C compiler is present, which the Android prerequisites require anyway.

## Consequences

A source launch on Android needs `clang`, `make`, and `python` before `pnpm install`, because `koffi` and `node-pty` compile from source; the [development guide](../../../../docs/development.md#android-termux) records that.

Session writes stay exclusive only after `pnpm run build:native-system` has produced `bin/system.node`. An unbuilt checkout starts the Web UI and then rejects session writes with the existing unsupported-platform error. Sandbox confinement, Lefthook Git hooks, and Oxlint's type-aware pass stay unavailable on Android; each reports its own failure instead of degrading silently.

Every source launch now runs Node with `--expose-internals`, so the internals the addon exposes are also reachable through plain `require()`. The addon remains the covered path because test processes run without the flag.
