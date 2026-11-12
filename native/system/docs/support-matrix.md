# Support matrix

| Platform package suffix | Builder | Payload |
|---|---|---|
| linux-x64 | ubuntu-24.04 | static Landlock executable; glibc and musl system.node |
| linux-arm64 | ubuntu-24.04-arm | static Landlock executable; glibc and musl system.node |
| darwin-x64 | macos-15-intel | system.node |
| darwin-arm64 | macos-latest | system.node |
| android-arm64 | Termux aarch64 toolchain, local build | system.node |

The stable Node-API v8 addon is built once per platform/libc and exercised by CI under Node 20, 22, 24, and 26. macOS builds target 11.0 or later. Linux binding selection uses the running Node process's libc; the static launcher serves both libc variants. Android's bionic C library has no libc split, so `android-arm64` carries one addon at `bin/system.node`; it has no CI builder, and `pnpm run build:native-system` compiles it with the host C compiler.

Landlock additionally requires an enforcing Linux kernel. The functional probe determines full, partial, or unusable enforcement; kernel version alone is not an availability guarantee.

Windows has neither a Landlock launcher nor this POSIX addon, and Android has no Landlock launcher because Android kernels before 5.13 do not implement Landlock. The Harness retains its existing Windows semaphore implementation. Other CPU/OS combinations have no published platform package: Landlock probes unusable, and flock acquisition rejects. New platform support requires a native builder and installed-artifact verification.
