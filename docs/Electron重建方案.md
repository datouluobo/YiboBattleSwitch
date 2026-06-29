# YiboBattleSwitch Electron 重建方案

## 1. 文档目的

本方案用于指导 `YiboBattleSwitch` 从当前研究型原型，重建为一个可长期维护、可正式发布、完全独立运行的 Electron 桌面应用。

本方案解决的不是“如何在现有历史代码上继续修补”，而是：

- 保留当前产品方向与前端 UI 形态
- 重建干净的 Electron 桌面壳
- 把账号切换、备份恢复、诊断、托盘、自启、安装发布纳入统一工程
- 把“默认普通权限运行、普通权限下尽量完整关闭 Battle.net 相关进程”纳入正式架构
- 彻底抛弃 `NewBeeBox` 运行时历史包袱

## 2. 最终目标

最终产品应满足以下目标：

- 是一个独立的本地 Battle.net / WoW 多账号切换工具
- 不依赖 `NewBeeBox.exe`
- 不依赖 `NewBeeBox` 内部页面
- 不依赖 `NewBeeBox` 在线接口
- 不依赖 `NewBeeBox` 运行时目录结构
- 不依赖 `NewBeeBox\battleCache` 作为运行时主数据源
- 保留从 `NewBeeBox` 导入历史账号数据的能力，但导入后即转为本程序自有存储
- 使用 Electron 作为正式桌面壳
- 支持系统托盘、开机自启、标准安装包、后续 `MSIX / Microsoft Store`

## 3. 重建原则

### 3.1 完全独立原则

`NewBeeBox` 只作为研究来源和一次性导入来源存在，不再作为运行时依赖。

明确禁止以下设计：

- 运行时直接读取 `NewBeeBox` 当前页面状态
- 运行时把 `NewBeeBox\battleCache` 当作主账号库
- 通过复用 `NewBeeBox.exe` 内部页面完成切换
- 通过调用 `NewBeeBox` 在线接口补齐产品能力
- 沿用现有打包后的 `[electron-main.js](E:/Program/YiboBattleSwitch/electron-main.js)` 作为主程序基础

### 3.2 主进程最小化原则

Electron 主进程只负责：

- 应用生命周期
- 主窗口与托盘
- 开机自启
- IPC 注册
- 本地能力编排入口
- 日志与配置初始化

明确不允许主进程继续演变成上帝文件。

### 3.3 业务事务化原则

账号切换不是“若干零散按钮动作”，而是一条正式事务：

1. 读取目标账号
2. 备份当前健康状态
3. 关闭 Battle.net / Agent
4. 校验完全退出
5. 恢复目标配置与认证
6. 启动 Battle.net
7. 失败自动回滚
8. 输出清晰诊断结果

### 3.4 本地优先原则

核心切换链路必须离线可用：

- 账号库读取
- 备份与恢复
- 注册表与文件操作
- 进程管理
- 日志与诊断

任何未来在线能力都必须是可选附加能力，且不能阻塞核心功能。

### 3.5 默认普通权限原则

主程序默认以普通权限运行。

首版重建目标不是“强制高权限覆盖一切”，而是：

- 在普通权限下尽可能完整、自动、稳定地关闭可控 Battle.net 相关进程
- 若仍无法关闭，则明确终止切换，不在残留进程存在时继续写配置
- 为未来受控提权 helper 预留架构扩展点，但首版不依赖它

## 4. 明确抛弃的 NewBeeBox 历史包袱

本节是重建方案中的硬约束。

### 4.1 抛弃的运行时依赖

以下内容必须在新架构中彻底移除：

- `NewBeeBox.exe` 内部页面
- `nbb-core` 作为运行时黑盒依赖
- `GamePod` 相关运行时逻辑
- `NewBeeBox` 在线 API、下载器、插件安装器
- `NewBeeBox` 的自启动、更新、外部协议、订阅、授权等无关能力
- 当前打包产物中混入的各类远程地址、资源域名、工具接口

### 4.2 保留但降级的研究价值

以下内容可以保留为研究参考，但不能进入正式运行时：

- `NewBeeBox` 切换行为的逆向结论
- `battleCache` 样本结构
- `Battle.net.config` / `UnifiedAuth` / `SavedAccountNames` 的差异分析
- “手动在 NewBeeBox 中切号，再回本程序做对比”的诊断方法

### 4.3 允许保留的唯一产品级关系

`NewBeeBox` 仅保留一个产品级能力：

- 从 `NewBeeBox` 历史数据导入到 `YiboBattleSwitch` 自有账号库

导入完成后：

- 后续切换、备份、恢复、删除、导出、诊断全部只依赖本程序自有数据
- 不再要求用户机器上存在 `NewBeeBox`

## 5. 目标产品边界

`YiboBattleSwitch` 的核心职责是：

- 管理本程序自有账号库
- 保存当前 Battle.net 登录态为账号
- 导入历史账号数据
- 切换到目标账号
- 自动备份当前状态
- 恢复最近一次健康备份
- 比较诊断快照
- 启动 Battle.net
- 管理 Battle.net / WoW 安装路径

不属于首版核心范围的内容：

- 在线订阅
- 远程下载中心
- 插件生态
- 社区/账号体系
- 云同步
- 与 `NewBeeBox` 共存运行时联动

## 6. 技术路线结论

本项目正式桌面壳采用 Electron。

原因：

- 适合长期桌面产品化
- 系统托盘、自启、窗口管理更成熟
- 更适合标准安装包与后续 `MSIX`
- 适合统一前端 UI 与桌面能力工程
- 后续接 Store、签名、自动更新链更自然

但需明确：

- 选择 Electron，不等于继承当前 `electron-main.js`
- 新应用应当是“保留 UI 与业务结论，重写壳与主流程”

## 7. 总体架构

建议拆分为六层：

1. `renderer`
2. `main`
3. `ipc`
4. `domain`
5. `infra`
6. `shared`

### 7.1 `renderer`

负责：

- 现有 UI 页面
- 页面状态
- 用户交互
- 日志展示
- 设置页

禁止：

- 直接访问文件系统
- 直接操作注册表
- 直接调用进程命令
- 直接拼切换事务

### 7.2 `main`

负责：

- 应用启动
- 单实例管理
- 主窗口
- 托盘
- 自启
- IPC 注册
- 崩溃与错误日志基础设施

### 7.3 `ipc`

负责：

- 对前端暴露受控能力
- 把前端意图映射到业务用例

原则：

- 只暴露高层动作
- 不暴露底层危险能力

### 7.4 `domain`

负责：

- 账号切换事务
- 保存当前账号
- 备份恢复
- 诊断快照与对比
- 导入历史账号

### 7.5 `infra`

负责：

- Battle.net 配置读写
- Battle.net 注册表读写
- Battle.net 进程治理
- 账号库存储
- 日志、时间、文件系统、Windows shell

### 7.6 `shared`

负责：

- 类型
- 常量
- DTO

## 8. 推荐目录结构

```text
app/
  main/
    bootstrap/
      app.ts
      single-instance.ts
      protocol.ts
    window/
      main-window.ts
      tray.ts
      autostart.ts
    ipc/
      register-ipc.ts
      channels.ts
    shell/
      dialogs.ts
      menu.ts

  renderer/
    index.html
    main.ts
    bridge/
      api.ts
    state/
    components/
    pages/
    styles/

  domain/
    account-switch/
      switch-account.ts
      save-current-account.ts
      import-newbeebox.ts
    backup/
      create-backup.ts
      restore-latest-backup.ts
      select-recommended-backup.ts
    diagnostics/
      take-snapshot.ts
      compare-snapshots.ts

  infra/
    battlenet/
      battlenet-paths.ts
      battlenet-config.ts
      battlenet-registry.ts
      battlenet-launcher.ts
      battlenet-process.ts
      battlenet-snapshot.ts
    storage/
      account-library.ts
      app-config.ts
      migration.ts
    system/
      fs.ts
      logger.ts
      time.ts
      windows-shell.ts

  shared/
    types/
    constants/

assets/
  icons/
  fonts/
  ui/
```

## 9. 前端保留与迁移策略

前端 UI 可以尽量保留现有形态，但迁移规则必须统一：

### 9.1 保留的内容

- 页面布局
- 交互结构
- 主流程按钮与文案
- 账号列表、详情区、日志区、调试工具区

### 9.2 必改的内容

- 所有 CDN 资源改为本地资源
- 所有字体改为本地打包
- 所有 `fetch('/action')` 风格调用改为 Electron `preload + IPC bridge`
- 所有原型里的本地 HTTP 桥接从正式运行时移除

### 9.3 首屏原则

- 主窗口不依赖自定义 `renderer-ready` 才显示
- 首屏只加载本地资源
- 业务数据异步加载
- 即使账号加载失败，也要先显示可交互壳与错误提示

## 10. IPC 设计

IPC 只暴露意图级接口。

建议首批接口：

- `getAppState`
- `listAccounts`
- `getAccountDetail`
- `switchAccount`
- `saveCurrentAccount`
- `deleteAccount`
- `backupLibrary`
- `backupCurrentState`
- `restoreLatestBackup`
- `importFromNewBeeBox`
- `openDirectory`
- `selectDirectory`
- `getSettings`
- `updateSettings`
- `takeDiagnosticSnapshot`
- `compareLatestDiagnostics`
- `subscribeLogs`

明确禁止前端直接调用的底层危险能力：

- `killProcessByPid`
- `taskkillRaw`
- `writeRegistryBlob`
- `overwriteBattleNetConfig`

这些必须封装在 `domain + infra` 内部。

## 11. Battle.net 切换正式事务

账号切换应实现为单一业务用例：

- `switchAccount(accountId)`

完整事务建议如下：

1. 读取目标账号资料
2. 校验目标账号快照完整性
3. 备份当前健康状态
4. 发现 Battle.net 相关进程
5. 进行普通权限关闭流程
6. 校验相关进程已完全退出
7. 恢复目标 `Battle.net.config`
8. 恢复目标注册表认证信息
9. 必要时恢复附加本地状态
10. 启动 Battle.net Launcher
11. 写入切换日志与诊断摘要
12. 若任一步失败，自动回滚到切换前备份

事务底线：

- 进程未退净时，不允许继续覆盖配置或注册表
- 写入失败时，不允许静默忽略
- 启动失败时，必须保留清晰失败原因

## 12. 普通权限下关闭 Battle.net / Agent 的完整流程

本节是重建重点之一。

目标不是承诺“普通权限可关闭一切进程”，而是：

- 在普通权限条件下，把可控 Battle.net 相关进程尽量稳定、自动、完整地关闭
- 无法关闭时，给出清晰且可诊断的失败状态
- 切换事务在残留进程存在时中止，不做危险写入

### 12.1 进程发现

至少识别以下目标：

- `Battle.net.exe`
- `Battle.net Launcher.exe`
- `Agent.exe`

根据实测可扩展的辅助信息：

- 进程路径
- PID
- 父子关系
- 启动时间
- 当前用户归属

### 12.2 第一阶段：优雅关闭

优先尝试温和退出：

1. 查找可见窗口或关联主进程
2. 发送关闭信号
3. 等待短超时，例如 `1500ms - 3000ms`
4. 轮询确认是否退出

目标：

- 尽量避免直接强杀造成 Battle.net 状态损坏

### 12.3 第二阶段：普通权限强制结束

对仍存活的目标进程执行强制结束：

1. 按镜像名结束
2. 再按 PID 精确补刀
3. 每轮后短等待
4. 最多 2 到 3 轮

### 12.4 第三阶段：退出确认

结束动作后必须做退出确认：

- 轮询相关 PID 是否消失
- 若有新进程被拉起，标记为 `Respawned`
- 若出现访问拒绝，标记为 `AccessDenied`
- 若长时间仍未退出，标记为 `StillClosing`

### 12.5 第四阶段：事务决策

普通权限关闭流程只允许两种结论：

- `全部退出，可继续切换`
- `存在残留，中止切换`

明确禁止：

- 残留进程存在但继续写配置
- 把“未成功关闭”当作非阻断警告

### 12.6 结果建模

建议输出统一结构：

- `matched`
- `terminated`
- `remaining`
- `failureReason`
- `elapsedMs`

失败原因建议枚举：

- `AccessDenied`
- `Respawned`
- `StillClosing`
- `UnknownOwner`
- `UnknownError`

## 13. 未来提权能力的处理原则

虽然本次重建要求把“不需提权直接杀进程”正式纳入方案，但仍需为未来保留扩展口。

原则如下：

- 主程序默认不提权
- 首版不依赖高权限常驻
- 未来若实测少量机器存在权限不足问题，可新增受控 helper
- helper 必须独立模块化，不能污染主进程结构

这意味着首版架构中要预留接口，但不实现强制提权路径。

## 14. 自有账号库与本地存储设计

正式运行时只使用本程序自有存储。

建议目录：

```text
%AppData%/YiboBattleSwitch/
  config/
    settings.json
  library/
    accounts/
      <account-id>/
        account.json
        Battle.net.config.raw
        Battle.net.config.pretty.json
        registry.json
        files/
  backups/
    *.json
  diagnostics/
    snapshots/
    reports/
  logs/
    main.log
    switch.log
```

其中：

- `settings.json` 保存窗口、路径、托盘、自启等设置
- `accounts` 保存正式账号资产
- `backups` 保存切换前健康快照
- `diagnostics` 保存诊断快照与对比报告
- `logs` 保存运行日志

## 15. NewBeeBox 导入能力的正式定位

`NewBeeBox` 在新产品中仅保留导入功能。

### 15.1 导入目标

从 `NewBeeBox` 历史缓存中读取：

- 账号标识
- `Battle.net.config` 相关资料
- 注册表认证快照
- 可识别的附加状态材料

### 15.2 导入后行为

导入完成后：

- 转写到本程序 `accounts` 目录
- 记录导入来源
- 以后全部从本程序数据读取

### 15.3 明确禁止

禁止以下做法：

- 切换时回头读取 `NewBeeBox\battleCache`
- 把导入能力写成运行时实时绑定
- 要求用户必须安装 `NewBeeBox` 才能使用正式产品

## 16. 托盘、自启、窗口策略

建议策略：

- 主窗口关闭时默认最小化到托盘
- 托盘菜单提供：
  - 显示主窗口
  - 切换最近账号
  - 打开账号库目录
  - 打开日志目录
  - 退出
- 开机自启默认关闭，由用户显式开启
- 自启优先使用当前用户级方案，不写系统级自启

## 17. 启动稳定性要求

为解决历史白屏与脆弱启动问题，重建时应满足：

- 主窗口尽快显示
- 不依赖额外握手才 `show`
- 所有首屏资源本地打包
- 捕获 `did-fail-load`
- 捕获 `render-process-gone`
- 捕获前端全局错误
- 主进程日志必须落盘

原则：

- 宁可先显示一个可交互骨架
- 也不要因为数据或资源失败而直接白屏

## 18. 构建与发布策略

本项目不再追求单 `exe`。

正式发布方向：

- 标准安装包
- 后续 `MSIX`
- 后续 `Microsoft Store`

建议：

- 安装目录与用户数据目录分离
- 标准安装版将配置与账号库落到用户数据目录
- 签名、版本号、安装包升级策略从一开始纳入构建链

## 19. 实施阶段建议

### 阶段 1：搭建全新 Electron 壳

- 新建 Electron 工程
- 只加载现有 UI
- 不接任何 Battle.net 逻辑

### 阶段 2：前端资源本地化

- 移除 CDN
- 本地化字体、图标、样式
- 接入 `preload + bridge`

### 阶段 3：建立主进程与 IPC 基础设施

- 单实例
- 主窗口
- 托盘
- 设置与日志

### 阶段 4：建立自有存储层

- 应用配置
- 账号库
- 备份目录
- 诊断目录

### 阶段 5：接入 Battle.net 基础能力

- 路径检测
- 配置文件读写
- 注册表读写
- 启动器启动

### 阶段 6：实现普通权限进程治理

- 进程发现
- 优雅关闭
- 强制结束
- 退出确认
- 错误分型

### 阶段 7：实现正式切换事务

- 切换
- 回滚
- 日志
- 用户提示

### 阶段 8：迁移导入与诊断能力

- 从 `NewBeeBox` 导入
- 快照
- 对比报告

### 阶段 9：安装包与发布

- 安装器
- 版本管理
- 后续 `MSIX` 准备

## 20. 成功判定标准

完成重建后，应满足以下判定：

- 运行时不依赖 `NewBeeBox`
- 主进程不再是上帝文件
- 前端 UI 保持当前产品化方向
- 普通权限下可自动完成大多数 Battle.net / Agent 关闭流程
- 无法关闭时能明确终止并解释原因
- 切换事务具备备份、恢复、回滚
- 标准安装包可正常分发
- 后续具备进入 `MSIX / Store` 的工程基础

## 21. 一句话总结

这次重建不是“把当前原型继续堆大”，也不是“把 NewBeeBox 换个壳接着用”。

它的正式目标是：

**保留当前产品 UI 与业务方向，彻底剥离 NewBeeBox 运行时包袱，重建一个默认普通权限、本地优先、事务化切换、可正式发布维护的独立 Electron 桌面应用。**
