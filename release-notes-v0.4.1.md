## 更新内容
- 修复导出账号库依赖 `Compress-Archive` 导致的导出失败问题，改用 .NET `System.IO.Compression.ZipFile`
- 同步更新应用版本到 `v0.4.1`

## 验证
- `npm run dist:win`
