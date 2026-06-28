# Notes

项目名：

- English: `BattleSwitchLab`
- 中文: `战网切换实验室`

项目定位：

- 不是简单启动器
- 不是挂在 NewBeeBox 上的附属工具
- 而是对其账号切换能力的独立复刻、迁移与增强
- 最终要把登录数据复制到本程序自有存储，做到完全独立运行
- 当前对 NewBeeBox 的使用仅限于：
  - 借它的缓存样本理解账号数据结构
  - 借它的现有实现反推 Battle.net 切换链路

当前已确认的切换链路要点：

- NewBeeBox 前端只是壳，实际切换逻辑在 `nbb-core.win32-x64-msvc.node`
- 至少涉及三块 Battle.net 状态：
  - `Battle.net.config`
  - `HKCU\Software\Blizzard Entertainment\Battle.net\UnifiedAuth`
  - Battle.net / Agent 进程启停
- 所以最终独立版不能再按“单个 Blob 写回器”设计，而要按“完整状态切换器”设计

当前工作起点：

- 原型脚本位于：
  - `C:\Users\Administrator\Documents\Codex\2026-06-24\c-program-files-newbeebox-newbeebox-exe\outputs\newbeebox_account_switcher_prototype.pyw`
