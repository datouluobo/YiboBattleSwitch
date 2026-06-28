# Roadmap

## Phase 1

- 整理 battleCache 数据结构
- 整理 Battle.net 相关注册表结构
- 明确 NewBeeBox 切换链路中实际同步的 Battle.net 状态
- 明确本程序自有账号存储的数据模型

## Phase 2

- 建立 Blob 到目标键的稳定映射
- 接管 `Battle.net.config` 的备份与恢复
- 接管 Battle.net / Agent 进程控制
- 设计并实现本程序账号库目录结构
- 支持从 NewBeeBox 缓存导入到本程序存储
- 支持完整备份与恢复
- 支持自动识别当前账号

## Phase 3

- 做成更完整的桌面工具界面
- 支持新增账号、保存当前账号、删除账号、导出账号
- 支持完整账号切换而不是单项实验写回
- 支持日志、诊断和导出
- 去除运行时对 NewBeeBox 缓存目录的依赖
