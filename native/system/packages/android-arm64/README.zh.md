---
description: "Android arm64 的预编译 POSIX flock 插件。"
kind: "package-library"
---
# @deepseek-ai/node-addon-system-android-arm64

[English](README.md) | 中文

本平台包包含 Node-API v8 插件 `bin/system.node`，与 Linux 插件由同一份源码构建。Android 的 bionic C 库没有 glibc 与 musl 之分，因此入口直接加载 `bin/system.node`，不使用 libc 子目录。本包不含 Landlock 启动器：5.13 之前的 Android 内核没有实现 Landlock，沙箱探测在那里报不可用。

本包不含 JavaScript 或安装期构建脚本。`pnpm run build:native-system` 使用宿主机 C 编译器与当前 Node 安装自带的头文件构建该插件。GitHub 托管 runner 不构建该平台：GitHub 的矩阵、组装与打包步骤都会跳过本包，改由设备上用 `node scripts/pack-release.mjs <目标目录> --current-platform-only` 打包。另见工作区[支持矩阵](../../docs/support-matrix.md)。
