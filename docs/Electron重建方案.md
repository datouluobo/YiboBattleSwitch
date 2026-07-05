# YiboBattleSwitch Electron 架构方案

## 1. 文档目的

本方案用于说明 `YiboBattleSwitch` 当前桌面应用的正式工程方向：保持独立、本地优先、可维护、可发布。

它解决的问题不是“如何在历史原型上继续堆补丁”，而是：

- 保留当前产品方向与前端 UI 形态
- 维持干净的 Electron 桌面壳
- 把账号切换、备份恢复、诊断、托盘、自启、安装发布纳入统一工程
- 保持默认普通权限运行

## 2. 最终目标

最终产品应满足以下目标：

- 是一个独立的本地 Battle.net 多账号切换工具
- 不依赖任何第三方桌面工具运行时
- 使用 Electron 作为正式桌面壳
- 支持系统托盘、开机自启、标准安装包、后续 `MSIX / Microsoft Store`

## 3. 重建原则

### 3.1 完全独立原则

正式产品只依赖本程序自有代码、自有存储和本地系统环境。

明确禁止以下设计：

- 运行时绑定历史工具页面或内部流程
- 运行时依赖历史缓存目录作为主账号库
- 通过旧下载器、旧插件平台或旧协议补齐产品能力
- 沿用任何历史打包壳、旧下载器或带远程依赖的遗留主程序作为主程序基础

### 3.2 主进程最小化原则

Electron 主进程只负责：

- 应用生命周期
- 主窗口与托盘
- 开机自启
- IPC 注册
- 本地能力编排入口
- 日志与配置初始化

### 3.3 业务事务化原则

账号切换是一条正式事务：

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

### 3.5 默认普通权限原则

主程序默认以普通权限运行。

当前正式目标不是“强制高权限覆盖一切”，而是：

- 在普通权限下尽可能完整、自动、稳定地关闭可控 Battle.net 相关进程
- 若仍无法关闭，则明确终止切换，不在残留进程存在时继续写配置
- 为未来受控提权 helper 预留架构扩展点，但首版不依赖它

## 4. 目标产品边界

`YiboBattleSwitch` 的核心职责是：

- 管理本程序自有账号库
- 保存当前 Battle.net 登录态为账号
- 切换到目标账号
- 导出与导入本程序账号库
- 自动备份当前状态
- 恢复最近一次健康备份
- 比较诊断快照
- 启动 Battle.net
- 管理 Battle.net 安装路径

不属于当前核心范围的内容：

- 在线订阅
- 远程下载中心
- 插件生态
- 社区/账号体系
- 云同步

## 5. 技术路线结论

本项目正式桌面壳采用 Electron。

原因：

- 适合长期桌面产品化
- 系统托盘、自启、窗口管理更成熟
- 更适合标准安装包与后续 `MSIX`
- 适合统一前端 UI 与桌面能力工程

## 6. 总体架构

建议拆分为六层：

1. `renderer`
2. `main`
3. `ipc`
4. `domain`
5. `infra`
6. `shared`

### 6.1 `renderer`

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

### 6.2 `main`

负责：

- 应用启动
- 单实例管理
- 主窗口
- 托盘
- 自启
- IPC 注册
- 崩溃与错误日志基础设施

### 6.3 `ipc`

负责：

- 对前端暴露受控能力
- 把前端意图映射到业务用例

### 6.4 `domain`

负责：

- 账号切换事务
- 保存当前账号
- 备份恢复
- 诊断快照与对比

### 6.5 `infra`

负责：

- Battle.net 配置读写
- Battle.net 注册表读写
- Battle.net 进程治理
- 账号库存储
- 日志、时间、文件系统、Windows shell

### 6.6 `shared`

负责：

- 类型
- 常量
- DTO

## 7. 推荐目录结构

```text
app/
  main/
    bootstrap/
    window/
    ipc/
    shell/
  renderer/
    bridge/
    styles/
  domain/
    account-switch/
    backup/
    diagnostics/
  infra/
    battlenet/
    storage/
    system/
  shared/
    types/
    constants/
assets/
  icons/
  plugins/
  store/
docs/
scripts/
```

## 8. IPC 设计

IPC 只暴露意图级接口。

建议首批接口：

- `getAppState`
- `listAccounts`
- `switchAccount`
- `saveCurrentAccount`
- `deleteAccount`
- `backupLibrary`
- `importLibrary`
- `backupCurrentState`
- `restoreLatestBackup`
- `openDirectory`
- `selectDirectory`
- `getSettings`
- `updateSettings`
- `takeDiagnosticSnapshot`
- `compareLatestDiagnostics`

明确禁止前端直接调用的底层危险能力：

- `killProcessByPid`
- `taskkillRaw`
- `writeRegistryBlob`
- `overwriteBattleNetConfig`

## 9. Battle.net 切换正式事务

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

## 10. 自有账号库与本地存储设计

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

## 11. 构建与发布策略

正式发布方向：

- 标准安装包
- 后续 `MSIX`
- 后续 `Microsoft Store`

建议：

- 安装目录与用户数据目录分离
- 标准安装版将配置与账号库落到用户数据目录
- 签名、版本号、安装包升级策略从一开始纳入构建链

## 12. 成功判定标准

完成当前架构目标后，应满足以下判定：

- 运行时不依赖任何第三方桌面工具
- 主进程不再是上帝文件
- 前端 UI 保持当前产品化方向
- 普通权限下可自动完成大多数 Battle.net / Agent 关闭流程
- 无法关闭时能明确终止并解释原因
- 切换事务具备备份、恢复、回滚
- 标准安装包可正常分发
- 后续具备进入 `MSIX / Store` 的工程基础
