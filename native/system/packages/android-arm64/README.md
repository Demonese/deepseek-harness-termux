---
description: "Prebuilt POSIX flock addon for Android arm64."
kind: "package-library"
---
# @deepseek-ai/node-addon-system-android-arm64

English | [中文](README.zh.md)

This platform package contains the Node-API v8 addon `bin/system.node`, built from the same source as the Linux addons. Android's bionic C library has no separate glibc and musl variants, so the entry loads `bin/system.node` directly instead of a libc subdirectory. The package ships no Landlock launcher: Android kernels before 5.13 do not implement Landlock, so confinement probes unusable there.

The package contains no JavaScript or installation build script. `pnpm run build:native-system` compiles the addon with the host C compiler and the Node headers of the running Node installation. GitHub-hosted runners do not build this platform: every GitHub matrix, assembly, and packing step skips it, and `node scripts/pack-release.mjs <destination> --current-platform-only` packs it on the device. See the workspace [support matrix](../../docs/support-matrix.md).
