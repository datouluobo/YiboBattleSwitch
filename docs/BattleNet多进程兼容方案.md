# Battle.net 多进程兼容方案

## 目标

在保留标准切号流程的前提下，提供一个可显式启用的实验模式：用户选择账号后，YiboBattleSwitch 不主动结束已经运行的 Battle.net 进程，只更新新实例启动所需的账号指向并再次启动 Battle.net。

## 官方配置映射

Battle.net 的“允许多个战网进程”设置保存在：

```text
%AppData%\Battle.net\Battle.net.config
Client.SingleInstance
```

- `true`：使用单进程模式。
- `false`：允许多个 Battle.net 进程。

YBS 的“并行启动（实验）”开关会同步写入这个官方配置字段。

## 两条执行路径

### 标准切换

保持现有行为：

1. 备份当前状态。
2. 停止全部 Battle.net、Launcher 和 Agent 相关进程。
3. 按当前正式切换方案恢复目标账号。
4. 重新启动 Battle.net。

### 并行启动

实验模式采用最小写入范围：

1. 在内存中保留当前 `Battle.net.config` 原文，用作本次操作的局部回滚材料。
2. 确保 `Client.SingleInstance=false`。
3. 仅按 D 方案更新 `Client.SavedAccountNames`。
4. 不结束任何已经运行的 Battle.net 相关进程。
5. 再次启动 Battle.net Launcher。

该路径不恢复注册表认证材料、`CachedData.db`、账号数据库或浏览器缓存，避免在已有进程仍持有这些文件时进行破坏性覆盖。

## 安全边界

- 多个 Battle.net 实例仍共享同一 Windows 用户下的配置、缓存和 Agent 服务；官方开关允许多进程，但不提供文件系统级的实例隔离。
- YBS 只保证并行路径不会主动结束已有实例，不能保证 Battle.net 自身不会刷新共享状态。
- 并行路径失败时只尝试恢复操作前的 `Battle.net.config`，不会调用需要终止全部进程的全量备份恢复。
- 并行启动成功后不立即创建自动全量备份，避免把运行中被占用或正在变化的缓存记录成稳定恢复点。
- 该模式默认关闭，标准切换仍是默认行为。

## 验证建议

1. 准备两个已经被 Battle.net 本地缓存且可由 D 方案识别的账号。
2. 启用“并行启动（实验）”，确认 `Client.SingleInstance` 变为 `false`。
3. 启动账号 A，再从 YBS 选择账号 B。
4. 确认账号 A 对应进程未被 YBS 结束，并观察第二个 Battle.net 是否使用账号 B。
5. 完全退出全部 Battle.net 进程后，确认最后一次账号指向和下次标准启动行为。
6. 分别记录国服与国际服环境、Agent 重启、退出顺序和配置回写结果。
