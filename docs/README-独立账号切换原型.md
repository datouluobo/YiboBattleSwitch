# NewBeeBox 独立账号切换原型

这个原型的定位：

- 它是通向“完全独立工具”的研究型过渡版本
- 当前会读取 `NewBeeBox` 缓存，是因为它提供了现成样本
- 最终版本会把登录数据复制到本程序自有存储中，不再依赖 `NewBeeBox` 目录或其内部页面

运行方式：

```powershell
python "C:\Users\Administrator\Documents\Codex\2026-06-24\c-program-files-newbeebox-newbeebox-exe\outputs\newbeebox_account_switcher_prototype.pyw"
```

这个原型目前能做的事：

- 管理本程序自有账号库 `prototype\battle_switch_library\accounts`
- 从 `C:\Users\Administrator\AppData\Roaming\NewBeeBox\battleCache` 导入账号到本程序账号库
- 将当前 Battle.net 登录态保存到本程序账号库
- 展示每个已保存账号的邮箱、备注、备份时间、Blob 数量
- 备份当前 Battle.net 相关状态到同目录下的 `battle_net_state_backups`
- 对 Battle.net 当前状态做诊断快照，并比较最近两次差异
- 可将选中账号保存下来的 `Battle.net.config` 单独恢复到当前 Battle.net
- 可将选中账号保存下来的 `UnifiedAuth` 单独恢复到当前 Battle.net
- 可选写入 `GAME_ACCOUNT`
- 删除本程序账号库中的账号
- 一键启动 `C:\Program Files (x86)\Battle.net\Battle.net Launcher.exe`
- 一键恢复最近一次备份

当前限制：

- 还没有完全复刻新手盒子的全部切换逻辑
- `battleCache\<邮箱>\registry.json` 中保存的是 `UnifiedAuth` 注册表值快照，但每个账号保存的键集合并不固定
- 当前已确认：单独写回 `WEB_TOKEN` 或单独同步 `UnifiedAuth` 都不足以完成账号切换，反而可能导致 Battle.net 退出登录或认证失效
- 当前还没有补齐 `Battle.net.config`、`SavedAccountNames`、进程退出确认、重启后状态校验这些链路
- “恢复账号配置”当前只恢复 `Battle.net.config`，还不会自动恢复 `UnifiedAuth` 并完成整套账号切换
- “恢复账号认证”当前只恢复 `UnifiedAuth`，还不会自动恢复 `Battle.net.config` 并完成整套账号切换
- 所以现在最稳妥的用法是：
  1. 先备份当前状态
  2. 如果登录态被实验写坏，优先恢复最近一次备份
  3. 如果账号还在 NewBeeBox 里，先导入到本程序账号库
  4. 使用诊断快照记录“手动切号前后”的真实差异
  5. 暂时不要继续盲试 Blob 写回

已经确认到的关键事实：

- 新手盒子的账号切换不是独立 EXE，而是 `NewBeeBox.exe` 内部页面
- 前端页面本身不直接改 Battle.net；真正的切换逻辑在 `nbb-core.win32-x64-msvc.node`
- `BattleNetAccount` 的构造参数是 `battleCache` 目录和 `Battle.net Launcher.exe` 路径
- `BattleNetAccount` 暴露的方法包括 `backup`、`login`、`list`、`switch`、`isLoggedIn`、`edit`、`delete`
- Native 层字符串已明确出现 `Stop Battle.net`、`Restore config file`、`Restore registry`、`Start Battle.net`
- Native 层字符串已明确出现 `Battle.net.config`、`SavedAccountNames`、`Software\\Blizzard Entertainment\\Battle.net\\UnifiedAuth`
- 这说明 NewBeeBox 的切换至少会同步三类东西：
  1. Battle.net 进程状态
  2. `Battle.net.config` 中的账号相关配置
  3. `UnifiedAuth` 注册表中的认证 Blob
- `battleCache\<邮箱>\registry.json` 里保存的是按注册表值名分组的二进制 Blob，而不是简单的单一 `WEB_TOKEN`
- 实测当前登录态与缓存比对时，某些 `UnifiedAuth` Blob 可以完全匹配，某些则会在运行过程中变化，说明“静态缓存直接覆盖”不是完整链路

如果要继续做成更完整的独立工具，下一阶段建议：

1. 把 `Battle.net.config` 的备份/恢复也纳入本程序自有账号库
2. 把每个 `UnifiedAuth` Blob 精确映射到本程序内部存储结构
3. 把“配置恢复 + 认证恢复 + 进程控制”合并成一条完整切换事务
4. 明确进程控制链路：关闭 Battle.net、等待退出、必要时清理 Agent、再启动
5. 设计本程序自己的账号存储格式，完全脱离 `NewBeeBox\battleCache`
6. 先实现“从 NewBeeBox 导入到本程序存储”
7. 再补“保存当前登录账号”“新增账号”“删除账号”“自动识别当前账号”“导出账号”这些功能
8. 最后移除运行时对 `NewBeeBox` 缓存目录的依赖

## 当前推荐的验证流程

当“可关闭并重启 Battle.net，但仍无法切换账号”时，优先不要继续盲试 Blob 组合，而是做一次真实链路对比：

1. 在本程序里点击“诊断快照”，保存一份 `before` 快照
2. 打开 NewBeeBox，在里面手动切换到目标账号
3. 回到本程序，再点击一次“诊断快照”，保存一份 `after` 快照
4. 点击“比较最近两次诊断”
5. 查看生成的 Markdown 报告，确认 Battle.net 注册表树和 `AppData\\Roaming\\Battle.net` 下究竟变了哪些项

这样拿到的是“真实有效的切换差异”，后续再把这些变化映射回本程序，成功率会比继续盲写单个 Blob 高很多。
