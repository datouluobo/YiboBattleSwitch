# BattleNet 切换方案与 A/B 实验设计

## 1. 背景

当前项目已经具备 Battle.net 账号保存、切换、备份、回滚能力，但现有实现偏重，恢复材料覆盖范围较大。  
为了判断哪些材料真正决定切换稳定性、哪些材料反而会引入重新登录或额外验证，需要建立一套可复现、可对照、可回滚的实验框架。

本文档只定义方案，不实施代码改动。

## 2. 术语与命名

- `N方案`
当前新手盒子方案，重恢复方案。

- `D方案`
网易 DD 风格方案，轻量配置切换方案。

- `W方案`
Watt Toolkit 风格方案，账号槽位切换方案。

## 3. 方案定义

### 3.1 N方案

特征：

- 恢复完整 `Battle.net.config`
- 恢复 `%AppData%\Battle.net` 大部分或全部文件
- 恢复 `%LocalAppData%\Battle.net\Account\**`
- 恢复 `%LocalAppData%\Battle.net\CachedData.db`
- 恢复 `Launch Options\WoW`
- 恢复 `Launch Options\WTCG`
- 恢复 `UnifiedAuth`
- 恢复 `EncryptionKey`
- 切换前停止 Battle.net 相关进程
- 恢复后重新启动 Battle.net

优点：

- 覆盖材料最多
- 理论上最接近“整环境恢复”

风险：

- 容易把账号状态与运行时状态一起带回
- 更容易出现状态不一致
- 可能触发 Battle.net 自我纠偏或额外验证

### 3.2 D方案

特征：

- 只改 `Battle.net.config` 中账号相关字段
- 停止 `Battle.net.exe`
- 重启 `Battle.net.exe`
- 依赖 Battle.net 自己已有的账号缓存

优点：

- 实现最轻
- 对运行时污染最小

风险：

- 强依赖 Battle.net 本地已缓存目标账号
- 对自建账号库支持较弱

### 3.3 W方案

特征：

- 为每个账号维护账号槽位
- 恢复 `SavedAccountNames`
- 恢复 `LastLoginRegion`
- 恢复 `LastLoginAddress`
- 恢复 `LastLoginTassadar`
- 停止并重启 Battle.net
- 仍依赖 Battle.net 自带缓存

优点：

- 比 D 方案多一层账号槽位管理
- 比 N 方案轻

风险：

- 仍然不接管完整 Battle.net 本地认证材料
- 自身账号槽位与 Battle.net 本地缓存如果失配，仍可能失败

## 4. 切换材料分级表

### 4.1 A 级：核心必需项

这些材料最值得优先纳入稳定切换集合。

| 项目 | 位置 | 作用 | 建议 |
| --- | --- | --- | --- |
| `SavedAccountNames` | `%AppData%\Battle.net\Battle.net.config` | 当前默认账号指向 | 必测，优先保留 |
| `LastLoginRegion` | `%AppData%\Battle.net\Battle.net.config` | 当前登录区域 | 建议纳入轻方案 |
| `LastLoginAddress` | `%AppData%\Battle.net\Battle.net.config` | 当前登录地址 | 建议纳入轻方案 |
| `LastLoginTassadar` | `%AppData%\Battle.net\Battle.net.config` | 当前登录服务入口 | 建议纳入轻方案 |
| `account.db` | `%LocalAppData%\Battle.net\Account\<account_id>\account.db` | 已登录账号本地缓存 | 自有账号库强相关 |
| `CachedData.db` | `%LocalAppData%\Battle.net\CachedData.db` | 本地登录索引和账号映射 | 自有账号库强相关 |

### 4.2 B 级：强相关扩展项

这些材料不是最小必需项，但和游戏启动或会话稳定性关系较强。

| 项目 | 位置 | 作用 | 建议 |
| --- | --- | --- | --- |
| `Launch Options\WoW` | 注册表 | WoW 启动参数、账号、区域、token | 作为扩展项测试 |
| `Launch Options\WTCG` | 注册表 | 炉石等启动参数 | 作为扩展项测试 |
| `UnifiedAuth` | 注册表 | 统一认证材料 | 作为扩展项测试 |
| `EncryptionKey` | 注册表 | 本地加密辅助材料 | 作为扩展项测试 |

### 4.3 C 级：高风险可疑项

这些材料可能有帮助，但也可能是额外验证的根源。

| 项目 | 位置 | 作用 | 建议 |
| --- | --- | --- | --- |
| `Identity` | 注册表 | Battle.net 当前身份上下文 | 只做实验项，不建议默认恢复 |

说明：

- 从“Battle.net 全状态覆盖度”角度看，`Identity` 是当前 N 方案未覆盖项。
- 从“稳定切换最小必要集”角度看，`Identity` 是高风险项，不应直接视为默认必需项。

### 4.4 D 级：环境项

这些项目更像客户端环境参数，而不是账号切换核心材料。

| 项目 | 位置 | 作用 | 建议 |
| --- | --- | --- | --- |
| `Launch Options\BNA` | 注册表 | Battle.net App 自身区域连接参数 | 可采集，可观察，不建议优先恢复 |

### 4.5 E 级：高冗余/高污染项

这些项最容易把运行时垃圾状态带回去。

| 项目 | 位置 | 作用 | 建议 |
| --- | --- | --- | --- |
| `%AppData%\Battle.net` 整目录镜像 | Roaming | 混合 config、运行时状态、缓存、杂项文件 | 不建议继续作为默认全集恢复 |

## 5. 调试模式目标

调试模式需要回答三个问题：

1. 稳定切号的最小必要材料是什么
2. `Identity` 是否应该进入正式方案
3. `%AppData%\Battle.net` 整目录恢复是否是稳定性问题根源

## 6. 调试模式总原则

- 每次实验前必须自动备份当前 Battle.net 状态
- 每次实验只改变一个变量或一组明确变量
- 每次实验必须生成实验记录
- 每次实验失败后必须支持一键回滚
- 普通模式不显示实验开关
- 调试模式必须显示当前预设与完整开关快照

## 7. 调试开关设计

## 7.1 Config 组

| 开关 | 含义 |
| --- | --- |
| `cfg_saved_account` | 是否恢复 `Client.SavedAccountNames` |
| `cfg_last_login_region` | 是否恢复 `Services.LastLoginRegion` |
| `cfg_last_login_address` | 是否恢复 `Services.LastLoginAddress` |
| `cfg_last_login_tassadar` | 是否恢复 `Services.LastLoginTassadar` |
| `cfg_full_write` | 是否整文件写回 `Battle.net.config` |

说明：

- `cfg_full_write=off` 时，建议改为字段级 patch
- `cfg_full_write=on` 时，表示整文件覆盖

## 7.2 Local 缓存组

| 开关 | 含义 |
| --- | --- |
| `local_account_db` | 是否恢复 `%LocalAppData%\Battle.net\Account\**` |
| `local_cached_data` | 是否恢复 `%LocalAppData%\Battle.net\CachedData.db` |
| `local_prefs` | 是否恢复 `%LocalAppData%\Battle.net\LocalPrefs.json` |

## 7.3 Registry 组

| 开关 | 含义 |
| --- | --- |
| `reg_wow` | 是否恢复 `Launch Options\WoW` |
| `reg_wtcg` | 是否恢复 `Launch Options\WTCG` |
| `reg_unified_auth` | 是否恢复 `UnifiedAuth` |
| `reg_encryption` | 是否恢复 `EncryptionKey` |
| `reg_identity` | 是否恢复 `Identity` |
| `reg_bna` | 是否恢复 `Launch Options\BNA` |

## 7.4 Roaming 组

| 开关 | 含义 |
| --- | --- |
| `roaming_full_mirror` | 是否整目录恢复 `%AppData%\Battle.net` |
| `roaming_whitelist_config_only` | 是否只恢复 `Battle.net.config` |
| `roaming_whitelist_selected` | 是否白名单恢复一组指定 roaming 文件 |

约束：

- `roaming_full_mirror` 与 `roaming_whitelist_*` 应互斥

## 7.5 Flow 组

| 开关 | 含义 |
| --- | --- |
| `flow_stop_processes` | 切换前是否停止 Battle.net 相关进程 |
| `flow_wait_after_stop_ms` | 停进程后的等待时间 |
| `flow_restore_order` | 恢复顺序策略 |
| `flow_wait_before_launch_ms` | 恢复后启动前等待时间 |
| `flow_launch_battlenet` | 是否自动启动 Battle.net |
| `flow_verify_after_launch` | 启动后是否自动采样验证 |

## 8. 调试预设清单

### 8.1 `D-Min`

目的：
模拟网易 DD 式最轻切换。

建议配置：

- `cfg_saved_account=on`
- `cfg_last_login_region=off`
- `cfg_last_login_address=off`
- `cfg_last_login_tassadar=off`
- `cfg_full_write=off`
- `local_account_db=off`
- `local_cached_data=off`
- `local_prefs=off`
- `reg_wow=off`
- `reg_wtcg=off`
- `reg_unified_auth=off`
- `reg_encryption=off`
- `reg_identity=off`
- `reg_bna=off`
- `roaming_whitelist_config_only=on`
- `roaming_full_mirror=off`

### 8.2 `D-Plus`

目的：
在 D 基线下补足 W 方案的 triplet 字段。

建议配置：

- `cfg_saved_account=on`
- `cfg_last_login_region=on`
- `cfg_last_login_address=on`
- `cfg_last_login_tassadar=on`
- 其余同 `D-Min`

### 8.3 `W-Lite`

目的：
模拟 Watt Toolkit 风格轻量账号槽位方案。

建议配置：

- `cfg_saved_account=on`
- `cfg_last_login_region=on`
- `cfg_last_login_address=on`
- `cfg_last_login_tassadar=on`
- `cfg_full_write=off`
- `local_* = off`
- `reg_* = off`
- `roaming_whitelist_config_only=on`
- `roaming_full_mirror=off`

### 8.4 `N-Full`

目的：
作为当前新手盒子方案的基线参考。

建议配置：

- `cfg_full_write=on`
- `local_account_db=on`
- `local_cached_data=on`
- `local_prefs=on`
- `reg_wow=on`
- `reg_wtcg=on`
- `reg_unified_auth=on`
- `reg_encryption=on`
- `reg_identity=off`
- `reg_bna=off`
- `roaming_full_mirror=on`

### 8.5 `N-Trimmed-A`

目的：
去掉明显高污染项，只保留高相关切换材料。

建议配置：

- `cfg_saved_account=on`
- `cfg_last_login_region=on`
- `cfg_last_login_address=on`
- `cfg_last_login_tassadar=on`
- `cfg_full_write=off`
- `local_account_db=on`
- `local_cached_data=on`
- `local_prefs=off`
- `reg_wow=on`
- `reg_wtcg=off`
- `reg_unified_auth=on`
- `reg_encryption=on`
- `reg_identity=off`
- `reg_bna=off`
- `roaming_whitelist_config_only=on`
- `roaming_full_mirror=off`

说明：

- 这是最值得优先验证的候选正式方案

### 8.6 `N-Trimmed-B`

目的：
在 `N-Trimmed-A` 基础上单独测试 `Identity`。

建议配置：

- 与 `N-Trimmed-A` 相同
- 唯一变化：`reg_identity=on`

### 8.7 `Lab-Custom`

目的：
给研发和调试人员做自定义实验。

要求：

- 必须显示完整开关快照
- 必须填写实验备注
- 必须自动做切换前备份

## 9. 实验记录字段

每次实验都需要生成一条结构化记录。

### 9.1 基础字段

- `experimentId`
- `timestamp`
- `presetName`
- `accountId`
- `accountLabel`
- `notes`

### 9.2 开关快照字段

- `switchOptions`
- `flowOptions`

### 9.3 运行结果字段

- `switchStartedAt`
- `switchEndedAt`
- `durationMs`
- `processStopResult`
- `launchResult`
- `rollbackTriggered`

### 9.4 用户观察字段

- `observedLoginTarget`
- `observedSavedAccountName`
- `observedGameAccount`
- `needPasswordRelogin`
- `needSecondaryVerification`
- `autoRevertedToOtherAccount`
- `launchSucceeded`
- `wowLaunchSucceeded`
- `notes`

### 9.5 系统采样字段

- 切换前 `Battle.net.config` 摘要
- 恢复后启动前 `Battle.net.config` 摘要
- 启动后 N 秒 `Battle.net.config` 摘要
- 切换前后注册表摘要
- `CachedData.db` 文件 hash
- `Account\**` 文件 hash 摘要

## 10. 判定矩阵

### 10.1 成功

满足全部条件：

- Battle.net 启动成功
- 目标账号正确
- 不要求重新登录
- 不触发额外验证
- 不自动切回其他账号

### 10.2 弱成功

满足主要目标，但存在轻微异常：

- 目标账号正确
- Battle.net 出现状态自修正
- 或 WoW 启动参数不完全一致
- 或切换耗时明显偏长

### 10.3 失败

任一满足即视为失败：

- 目标账号错误
- 需要重新输入密码
- 触发额外验证
- 自动切回其他账号
- Battle.net 启动失败
- 发生回滚

### 10.4 高风险失败

属于重点阻断类型：

- 连续多次触发验证
- 某开关组合会破坏可用登录态
- 某开关组合会明显提高重新验证概率

## 11. A/B 实验计划表

### 11.1 阶段一：建立三种基线

| 顺序 | 实验 | 目的 |
| --- | --- | --- |
| 1 | `D-Min` | 观察最轻切换能否稳定命中目标账号 |
| 2 | `D-Plus` | 判断 triplet 是否比纯 `SavedAccountNames` 更稳 |
| 3 | `W-Lite` | 建立轻量账号槽位方案基线 |
| 4 | `N-Full` | 建立当前重恢复方案基线 |

要求：

- 每个预设至少重复 3 次
- 使用同一批账号进行对照

### 11.2 阶段二：从轻到底逐项加材料

基于 `W-Lite` 做增量实验。

| 顺序 | 实验 | 目的 |
| --- | --- | --- |
| 1 | `W-Lite + local_account_db` | 判断 `account.db` 的贡献 |
| 2 | `W-Lite + local_cached_data` | 判断 `CachedData.db` 的贡献 |
| 3 | `W-Lite + local_account_db + local_cached_data` | 判断本地账号缓存双件套是否构成关键闭环 |
| 4 | `+ reg_unified_auth` | 观察统一认证材料是否增强稳定性 |
| 5 | `+ reg_encryption` | 观察加密辅助项是否有贡献 |
| 6 | `+ reg_wow` | 观察 WoW 启动参数是否改善命中率 |
| 7 | `+ reg_identity` | 验证 `Identity` 是增强项还是污染项 |
| 8 | `+ reg_bna` | 验证环境项是否几乎无影响 |
| 9 | `+ roaming_full_mirror` | 验证整目录恢复是否引入污染 |

### 11.3 阶段三：从重到底逐项减材料

基于 `N-Full` 做缩减实验。

| 顺序 | 实验 | 目的 |
| --- | --- | --- |
| 1 | 去掉 `roaming_full_mirror` | 判断整目录镜像是否是主要风险源 |
| 2 | 去掉 `local_prefs` | 判断偏好文件是否无关 |
| 3 | 去掉 `reg_wtcg` | 判断炉石参数对 Battle.net 切号是否无关 |
| 4 | 去掉 `reg_encryption` | 判断加密项是否可以移除 |
| 5 | 去掉 `reg_identity` | 若后来纳入，验证其必要性 |
| 6 | 去掉 `reg_bna` | 若后来纳入，验证其必要性 |

## 12. 推荐实施顺序

### 第一优先级

- 建立调试预设机制
- 建立实验记录机制
- 建立切换前自动备份与失败回滚

### 第二优先级

- 先跑 `D-Min`
- 再跑 `D-Plus`
- 再跑 `W-Lite`

目的：

- 先确认轻量方案在当前 Battle.net 环境中的自然上限

### 第三优先级

- 依次验证：
  - `local_account_db`
  - `local_cached_data`
  - `reg_unified_auth`
  - `reg_encryption`
  - `reg_wow`

目的：

- 找到最小必要增强集

### 第四优先级

- 单独验证 `reg_identity`
- 单独验证 `roaming_full_mirror`

目的：

- 验证当前最可疑的污染源

## 13. 当前结论与预判

当前最值得优先验证的判断如下：

1. `SavedAccountNames + LastLogin* + account.db + CachedData.db` 很可能构成稳定切号的核心闭环
2. `Identity` 更像高风险实验项，而不是默认必需项
3. `%AppData%\Battle.net` 整目录恢复很可能是 N 方案稳定性问题的重要来源
4. `Launch Options\BNA` 更像环境项，对账号切换成功率影响可能较小

## 14. 最终目标

实验结束后，需要从三类方案中收敛出一个正式方案：

- 比 D/W 方案更适合自有账号库
- 比 N 方案更轻、更稳
- 避免把 Battle.net 运行时污染状态带入切换

当前最有希望成为正式方案候选的是：

- `N-Trimmed-A`

它的定位是：

- 保留 `config + account.db + CachedData.db + 必要注册表`
- 去掉 `Identity`
- 去掉 `%AppData%\Battle.net` 整目录镜像

