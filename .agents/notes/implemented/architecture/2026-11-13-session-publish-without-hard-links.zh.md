# Agent Note: 无硬链接的会话发布

Status: implemented

[English](2026-11-13-session-publish-without-hard-links.md) | 中文

## Problem

JSONL 会话后端用 `link(2)` 发布会话的第一个 generation 以及此后每一个不可变 generation：第二个名字原子出现，目标已存在时以 `EEXIST` 失败，从而无需锁即可仲裁并发发布者。部分文件系统与安全域完全拒绝创建硬链接——Android Termux 应用域对它自己刚在同一目录创建的两个文件执行 `link` 也返回 `EACCES`。因此会话创建在第一次模型请求之前就失败，这类主机上无法打开任何会话。

## Decision

发布由 `packages/session/session-persistence-jsonl/src/publish.ts` 中的 `publishNoReplace()` 负责。它为已完成并同步的临时文件建立链接；`EEXIST` 报告冲突而不替换目标；表示本主机无法创建硬链接的 errno（`EACCES`、`EPERM`、`ENOSYS`、`EOPNOTSUPP`）则先确认目标仍不存在，再重命名同一个临时文件。其余失败原样向上传播。重命名发布的仍是完整字节，且从不暴露部分写入的目标；只有它之前的存在性检查与重命名不是同一个原子步骤。

两处发布都使用它：会话第一个 generation 的 `materializePosix()`，以及经由注入的 generation 文件系统实现不可变 generation 发布的 `publishCurrentExclusive()`。两者都在持有该会话写租约时运行——以写方式打开会在发布历史 generation 之前获取租约，新建会话则在首次实体化写入之前获取。

## Alternatives considered

要求硬链接支持，不支持就拒绝运行。已否决：会话是产品的存储，无法发布会话的主机没有可用产品，而且故障表现为无从解释的 `EACCES`，而不是能力声明。

通过原生系统 addon 或 koffi 调用 `renameat2(RENAME_NOREPLACE)`。暂时否决：它能恢复原子的无替换发布，且该调用在报告主机上成功，但需要每个已发布平台 addon 新增符号并随原生版本发布。存在性检查加重命名无需新的原生接口即可维持协议；若将来必须让发布者在写租约之外运行，这仍是更强的选择。

独占创建加流式复制（`open(O_EXCL)` 后复制）。已否决：复制中途崩溃会在最终名字下留下部分写入的 generation，而这正是发布协议承诺永不暴露的状态。

一律重命名，不做能力检查。已否决：在能提供 `EEXIST` 仲裁的文件系统上丢弃该仲裁。

## Consequences

在硬链接不可用时，存在性检查与重命名不是一个原子步骤，因此同一会话的并发发布者依赖贯穿发布过程的写租约；每个调用方保留发布前存在性检查作为兜底。若某发布者绕过租约，可能替换刚发布的 generation，而其实践中的字节来自同一来源。

覆盖仍保持逐文件 100%：`publish.ts` 的每个分支都有归属，generation 测试通过让注入的 `link` 报告 `EACCES` 驱动回落路径。

两个 generation 测试原先用真实硬链接模拟竞争获胜者；现在改用 `copyFile` 发布获胜者的字节，因为它们考查的是字节仲裁而非 inode。唯一需要共享 inode 的用例在文件系统拒绝硬链接时跳过。
