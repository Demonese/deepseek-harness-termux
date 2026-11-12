# Agent Note: Android Termux 平台支持

Status: implemented

[English](2026-11-13-android-termux-platform.md) | 中文

## Problem

Harness 只为 Linux、macOS 与 Windows 提供二进制与平台包。通过 Termux 运行的 Android 使用 Node.js 24，其 `process.platform` 为 `'android'`，因此所有以 `linux`/`darwin` 为条件的判断和按这些平台名发布的预编译产物都会落空。会话写租约以 `ERR_FLOCK_UNSUPPORTED_PLATFORM` 拒绝，因为 `@deepseek-ai/node-addon-system` 没有 Android 平台包；profile 解析在启动阶段中止，因为 `node-addon-require-builtin` 未发布 Android 绑定，无法触及 Node 内部模块加载器；`koffi` 没有 Android 预编译产物，其源码构建又因 bionic 的 `statx` 失败；Lefthook 未发布 Android 可执行文件，导致其安装脚本使整个 `pnpm install` 失败。

## Decision

四项平台改动使源码检出能在 Android arm64 上运行。

`patches/koffi@3.1.1.patch` 在 `__ANDROID__` 下声明 `statx()`。bionic 把该声明限制在 `__USE_GNU` 且 API 级别 30 以上，于是编译器把 `statx(...)` 读作对 `<linux/stat.h>` 所定义 `struct statx` 的构造，插件无法构建。Android 自 API 30 起导出 `statx()` 函数，这低于任何随 Node 24 提供的 Termux 安装的下限。

`packages/boot/app-boot/src/profile-resolution/resolver.ts` 中的 `internalModules()` 在进程带 `--expose-internals` 运行时用 `require()` 应答内部模块 id，否则回落到 `node-addon-require-builtin`。根目录 `dsh` 脚本始终传入该选项，在已安装插件的平台上不产生额外代价。这正是 vendored Loader 已经采用的顺序。

`native/system/packages/android-arm64` 新增平台包，只含一个位于 `bin/system.node` 的 Node-API v8 插件，且不区分 libc，因为 bionic 没有这种区分。`native/system/scripts/build.ts` 用宿主 `cc` 与当前 Node 安装自带的头文件构建它，因此 `pnpm run build:native-system` 无需交叉工具链即可产出。该平台包不含 Landlock 启动器：5.13 之前的内核没有 Landlock，探测结果为不可用，隔离保持关闭。

`scripts/install-lefthook.mjs` 解析 Lefthook 自身查找逻辑会加载的可执行包，在缺失时打印提示并跳过钩子安装。缺少二进制是缺少能力，而非仓库状态错误，因此不应使依赖安装失败。

## Alternatives considered

为 Android 从源码构建 `node-addon-require-builtin`。否决：已发布包不含源码，且该插件绑定 Node 内部模块加载器结构，其 ABI 会随次版本变化；本地编译的副本要在项目并不为其产物构建的平台上，承担与已发布插件相同的每次 Node 升级追赶成本。

在 Android 上让会话写锁缺失也放行。否决：该锁是会话目录的跨进程排他机制，按平台使其可选，恰好会在多个 Termux 会话可共享同一检出之处允许并发写入者。

用一份 Termux 手工命令清单替代仓库改动。否决：故障出现在 `pnpm install` 与应用启动过程中，维护者在那里无法区分平台缺失与检出损坏。

为 Android 打 `node-pty` 补丁。否决，因为不需要补丁：只要存在宿主 C 编译器，其安装脚本就会从源码构建，而这本就是 Android 前置条件要求的。

## Consequences

在 Android 上从源码启动需要在 `pnpm install` 之前准备 `clang`、`make` 与 `python`，因为 `koffi` 与 `node-pty` 要从源码编译；[开发指南](../../../../docs/development.zh.md#android-termux) 记录了这一点。

只有在 `pnpm run build:native-system` 产出 `bin/system.node` 之后，会话写入才是排他的。未构建的检出能启动 Web UI，随后以既有的不支持平台错误拒绝会话写入。沙箱隔离、Lefthook Git 钩子与 Oxlint 的类型感知检查在 Android 上仍不可用；它们各自报出自身失败，而不是静默降级。

此后每次从源码启动都以 `--expose-internals` 运行 Node，因此插件暴露的内部模块也可通过普通 `require()` 触及。插件仍是被测试覆盖的路径，因为测试进程不带该选项运行。
