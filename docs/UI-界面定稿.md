# YiboBattleSwitch 界面定稿

更新时间：2026-06-28

本文档用于确认 YiboBattleSwitch 下一阶段的主界面方向，作为后续 UI 实现、重构和生成式设计的统一依据。

## 目标

把当前偏诊断原型的界面，收敛成一个面向普通 WoW 多账号玩家的简洁工具界面。

界面应满足以下目标：

- 用户打开后能马上看懂这是“账号切换工具”
- 主界面只保留和主任务直接相关的内容
- 不要求用户理解注册表、Blob、认证项等底层术语
- 复杂信息、调试能力、排障入口统一收进 `调试` 面板
- 整体视觉保持简洁、现代、克制，同时具备轻微高级感和细腻动效

## 主界面保留项

主界面只保留以下元素。

### 1. 顶部说明区

- 标题：`YiboBattleSwitch 独立账号切换器`
- 一段简短说明文字
- `关于`

说明文案建议：

`为多个 Battle.net / WoW 账号准备的本地切换工具。选择账号，保存当前登录，或直接切换到目标账号。`

关于功能说明：

- `关于` 按钮位于标题区右侧
- 视觉上保持低调，不抢主操作
- 点击后打开轻量小弹窗

关于弹窗建议内容：

- 程序名：`YiboBattleSwitch`
- 一句话简介
- 当前版本号
- 账号库目录或数据目录
- 简短使用提示
- `关闭` 按钮

### 2. 游戏目录区域

主界面保留一个独立但简洁的游戏目录区域，用于后续账号库备份、定位环境和快速打开目录。

保留内容：

- 游戏目录输入框
- `自动搜索`
- `打开目录`

用途说明：

- 输入框用于显示当前已识别或已设置的游戏目录
- `自动搜索` 用于自动定位游戏目录
- `打开目录` 用于快速打开当前游戏目录

### 3. 账号库主区域

账号库是主界面的核心区域。

保留内容：

- 账号列表
- 调整顺序
- 删除选中账号
- 修改备注
- 切换到此账号
- 保存当前登录为账号
- 导入库
- 刷新
- 备份账号库
- 调试

账号列表建议保留字段：

- `账号`
- `备注`
- `最近保存`

账号列表明确隐藏字段：

- `认证项`

说明：

- `认证项` 不再占用主界面列表列位
- `认证项` 仍然保留在程序内部数据中
- 如需查看，统一放到 `调试` 面板中显示
- 账号列表支持手动调序，排序结果应持久保存

## 调试面板保留项

所有与主功能无关、但仍有诊断价值的内容，统一收纳进 `调试` 面板。

调试面板建议以以下顺序分组：

### 1. 调试信息

- 当前选中账号的信息
- 日志
- 认证项

### 2. 恢复与排障

- 恢复最近一次备份

### 3. 导入与兼容

- 导入 NewBeeBox

## 主界面移除项

以下元素不再直接显示在主界面中。

- 当前状态整块
- 当前选中账号右侧详情整块
- 主界面日志区
- 启动战网
- 打开账号库目录
- 仅恢复配置
- 仅恢复认证
- 备份当前状态
- 诊断快照
- 比较最近两次诊断
- 打开备份目录
- 以管理员重启本程序
- 各种技术性状态统计字段

## 关于“认证项”的定义

`认证项` 不是面向普通用户的业务概念，而是账号保存时附带的认证状态条目数量，底层对应 UnifiedAuth 中保存的若干项认证数据。

它的实际意义偏向技术排查：

- 用于判断某个账号保存了多少认证状态
- 用于排查“仅恢复认证”或异常切换后的登录问题
- 对普通用户来说可读性弱，不适合作为主界面列表字段

因此本次定稿为：

- 主界面隐藏 `认证项` 列
- `认证项` 信息保留到 `调试` 面板

## 关于“恢复最近一次备份”的定位

`恢复最近一次备份` 的作用是，当切换后 Battle.net / WoW 登录状态异常、配置被写坏或当前状态不可用时，允许用户快速回退到程序此前保存的最近一份健康状态。

本次定稿为：

- 保留能力
- 主界面不直接显示
- 移入 `调试` 面板

这样既保留兜底手段，也不让主界面显得像维修工具。

## 新主界面结构

```text
+--------------------------------------------------------------------------------------+
| YiboBattleSwitch 独立账号切换器                                               [关于] |
| 为多个 Battle.net / WoW 账号准备的本地切换工具。选择账号，保存当前登录，或直接切换。 |
+--------------------------------------------------------------------------------------+
| 游戏目录                                                                             |
| [ E:\Games\World of Warcraft\__________________________________________ ]            |
| [自动搜索] [打开目录]                                                                |
+--------------------------------------------------------------------------------------+
| 账号库                                                                               |
|                                                                                      |
| 账号列表                                                                             |
| > dat******@gm****.com     暴风12        2026-06-28 12:46:18                         |
|   fen******@16****.com     冯岩          2025-12-20 19:35:16                         |
|   sev********@16****.com   老韩4         2026-06-28 12:42:24                         |
|                                                                                      |
| [上移] [下移] [删除选中账号] [修改备注] [保存当前登录为账号] [导入库]                |
| [切换到此账号]                                                                       |
| [刷新] [备份账号库] [调试]                                                           |
+--------------------------------------------------------------------------------------+
```

## 布局要求

### 总体布局

- 单窗口
- 不分左右双栏大面板
- 主界面优先垂直结构，自上而下三段
- 信息密度适中，不空，也不拥挤

推荐顺序：

1. 标题与说明
2. 游戏目录区域
3. 账号库主区域

### 账号库区域

- 账号列表占主要面积
- 列表支持手动调整顺序，建议使用 `上移` / `下移` 或拖拽排序
- 主按钮与次按钮放在列表下方
- `切换到此账号` 是视觉最强按钮
- `调试` 保持低调，不抢主按钮权重

### 游戏目录区域

- 风格与账号区一致
- 输入框横向占主要宽度
- 两个按钮放在右侧或下一行

## 视觉风格要求

### 核心方向

- 简洁
- 现代
- 可靠
- 精致
- 克制

不要做成：

- 企业后台
- 调试器
- 注册表编辑器
- 黑客工具
- 满屏技术面板

### 视觉关键词

- Windows 原生感与现代工具感结合
- 更像“好用的桌面工具”，而不是“测试台”
- 低噪音界面
- 轻微高级感
- 用少量强调色建立重点

### 色彩建议

- 整体以浅色主题为主
- 背景使用干净的冷白或极浅灰蓝
- 面板使用纯净浅色表面层
- 强调色使用与暴雪战网品牌一致的蓝色系，不要紫色
- 主按钮强调色清晰，但不要饱和过头
- 辅助按钮使用中性样式

建议视觉分层：

- 背景层：极浅灰白
- 卡片层：纯白或略带冷调
- 边框层：很轻的中性边框
- 主强调色：战网品牌蓝
- 文字：深灰，不要发飘

### 圆角与阴影

- 圆角适中，建议 10-14px
- 阴影很轻，只用于区分层次
- 不要厚重投影
- 不要玻璃拟态

### 字体与排版

- 使用清晰、现代、偏系统风格的无衬线字体
- 标题明确但不过度放大
- 列表、按钮、输入框字号统一
- 说明文案短，不要堆成长段

## 动效与特效要求

动效应服务于反馈，而不是炫技。

### 可以使用的动效

- 按钮 hover 时轻微提亮或轻微上浮
- 主按钮点击时有短暂按压反馈
- 列表项选中时有平滑高亮过渡
- 调试面板展开时使用短促的淡入 + 高度展开动画
- 输入框获得焦点时边框和光晕平滑变化

### 可以使用的细节特效

- 主按钮可带极轻微光泽渐变
- 选中账号行可带很轻的色块高亮
- 面板切换时可加入 150-220ms 的透明度与位移动画

### 不要使用的效果

- 花哨粒子
- 大面积玻璃模糊
- 夸张弹跳
- 慢吞吞页面载入动画
- 为了“高级感”而添加无意义装饰

### 动效节奏

- 普通状态反馈：150-180ms
- 面板展开收起：180-220ms
- 动效曲线：ease-out 风格
- 需要兼容 reduced motion 思路

## 文案原则

- 尽量说人话
- 避免底层术语
- 按钮文案短、直白、明确

建议主界面文案：

- `上移`
- `下移`
- `删除选中账号`
- `修改备注`
- `保存当前登录为账号`
- `导入库`
- `切换到此账号`
- `刷新`
- `备份账号库`
- `调试`
- `关于`
- `自动搜索`
- `打开目录`

## 交互说明

### 备份账号库

新增功能，定义如下：

- 将本程序账号库相关数据整体打包
- 生成压缩包
- 输出到当前游戏目录

建议命名示例：

- `YiboBattleSwitch-account-library-backup-20260628-124618.zip`

### 修改备注

新增功能，定义如下：

- 仅针对当前选中账号
- 弹出轻量编辑方式即可
- 不需要复杂表单

### 导入库

新增功能，定义如下：

- 用于导入外部账号库或指定格式的账号数据
- 入口保留在主界面，便于初次迁移和集中管理
- 导入完成后应明确提示新增数量、更新数量或失败项目

### 列表调序

新增功能，定义如下：

- 支持用户手动调整账号列表顺序
- 优先建议使用 `上移` / `下移` 按钮，降低误操作
- 如果后续桌面交互体验允许，也可补充拖拽排序
- 调整后的顺序需要持久保存
- 主界面显示顺序应与保存顺序一致

### 调试面板

建议交互方式：

- 点击 `调试` 后展开折叠面板
- 或弹出一个轻量二级窗口

优先建议：

- 如果当前界面追求简洁，使用折叠面板
- 如果调试内容较多，使用独立小窗口

### 关于弹窗

建议交互方式：

- 点击顶部 `关于` 按钮后弹出轻量模态小窗
- 尺寸不宜过大，信息简洁清晰
- 支持右上角关闭和底部 `关闭` 按钮

建议展示内容：

- `YiboBattleSwitch`
- 版本号
- 一句话产品说明
- 账号库目录或数据目录
- 简短提示，如“请先确认游戏目录，再执行备份或切换”

## 用于生成 UI 的详细提示词

下面这份提示词可直接用于让模型生成 YiboBattleSwitch 的桌面应用 UI 设计稿、前端界面草图或高保真视觉方案。

### 中文版提示词

```text
请为一个 Windows 桌面工具设计一个现代、简洁、美观的应用界面，产品名是 YiboBattleSwitch，定位是“Battle.net / 魔兽世界多账号本地切换工具”。

这个工具服务于拥有多个 Battle.net / WoW 账号的普通玩家，不是技术人员，所以界面不要像调试器、注册表编辑器、企业后台或内部测试面板。整体要让人感觉可靠、克制、清晰、易懂、能放心操作。

界面目标是：用户打开后，能立刻明白这是一个账号切换工具，并且能快速完成几个核心动作：查看账号库、调整顺序、删除账号、修改备注、保存当前登录为账号、导入库、切换到此账号、刷新、备份账号库、查看游戏目录、打开调试面板、查看关于信息。

请只设计主界面，不要展示复杂调试内容。所有与主功能无关的信息都隐藏到“调试”入口里。主界面必须非常克制，不要堆很多说明、不要堆很多小按钮、不要出现技术术语。

主界面结构采用纵向三段布局：

第一段：顶部标题与简短说明
- 标题：YiboBattleSwitch 独立账号切换器
- 说明：为多个 Battle.net / WoW 账号准备的本地切换工具。选择账号，保存当前登录，或直接切换到目标账号。
- 右侧新增一个低调的“关于”按钮
- 点击“关于”后弹出一个简洁的小弹窗，显示程序名、版本号、一句话简介、账号库目录或数据目录、关闭按钮

第二段：游戏目录区域
- 一个游戏目录输入框
- 两个按钮：自动搜索、打开目录
- 该区域位于账号库区域上方
- 用于显示和管理当前游戏目录

第三段：账号库主区域
- 一个简洁的账号列表，字段只保留：账号、备注、最近保存
- 不要显示“认证项”等技术列
- 列表支持调序，优先使用“上移”“下移”按钮，也可以接受轻量拖拽排序
- 列表下方放操作按钮
- 按钮包括：上移、下移、删除选中账号、修改备注、保存当前登录为账号、导入库、切换到此账号、刷新、备份账号库、调试
- 其中“切换到此账号”必须是最强主按钮，视觉上最突出
- “调试”按钮必须低调，不抢主操作

风格要求：
- 现代桌面工具风格
- 简洁、精致、轻微高级感
- 浅色主题
- 不要紫色
- 使用冷白、浅灰、淡蓝灰作为背景层次
- 主强调色使用与暴雪战网品牌一致的蓝色
- 文字颜色清晰，不能发灰发飘
- 圆角适中，10 到 14px
- 阴影很轻
- 不要玻璃拟态，不要霓虹，不要赛博朋克，不要花哨装饰
- 不要大面积渐变背景，但可以在主按钮上做非常轻微、克制的高级感渐变

动效要求：
- 界面要有现代感，但动效必须服务于反馈，不要炫技
- 按钮 hover 有轻微提亮或轻微上浮
- 主按钮点击有短暂按压反馈
- 列表选中状态有平滑高亮过渡
- 调试面板入口可以有轻微展开暗示
- 面板或区域出现时使用 150 到 220ms 的短动效
- 整体感觉顺滑、克制、专业

排版要求：
- 使用清晰的无衬线字体
- 信息层级明确
- 不要把界面做成双栏调试台
- 不要出现复杂图标墙
- 留白要合理，不能空，也不能拥挤
- 更像一个成熟、可信的桌面工具，而不是原型图

请输出高保真 UI 设计描述，强调桌面应用质感、可实现性、现代化细节、按钮层级、列表样式、输入框样式、轻量动效与整体视觉统一性。
```

### 英文版提示词

```text
Design a modern, minimal, polished Windows desktop application UI for a product called YiboBattleSwitch. It is a local Battle.net / World of Warcraft multi-account switcher for regular players, not a technical debug tool.

The interface should feel reliable, clear, calm, and easy to trust. Do not make it look like a debugger, registry editor, enterprise admin dashboard, hacker tool, or internal engineering panel. Avoid technical jargon in the visible interface.

The main goal of the UI is to let users instantly understand that this is an account switching tool and quickly complete the core actions: browse the account library, reorder accounts, delete an account, edit notes, save the current login as an account, import a library, switch to the selected account, refresh, back up the account library, manage the game directory, open a debug panel, and open an about dialog.

Only design the main screen. All secondary, diagnostic, and technical information must be hidden behind a low-priority "Debug" entry. The main screen should stay clean and focused.

Use a vertical three-section layout:

1. Header section
- Title: YiboBattleSwitch Account Switcher
- Short helper text explaining that this tool is used to manage and switch Battle.net / WoW accounts locally
- Add a subtle low-priority About button on the right side
- Clicking About opens a lightweight modal with the app name, version, one-line description, data folder or account library location, and a close action

2. Game directory section
- A game directory input field
- Two buttons: Auto Detect, Open Folder
- This section should appear above the account library section
- This section should look integrated with the main design

3. Account library section
- A clean account list with only three visible columns: Account, Notes, Last Saved
- Do not show technical columns such as authentication item count
- The list must support manual reordering, preferably through Move Up and Move Down controls, with optional light drag-and-drop behavior
- Below the list, place the main action buttons
- Buttons: Move Up, Move Down, Delete Selected Account, Edit Notes, Save Current Login as Account, Import Library, Switch to This Account, Refresh, Back Up Account Library, Debug
- "Switch to This Account" must be the strongest primary action
- "Debug" must be visually low priority

Visual direction:
- modern desktop utility
- minimal, elegant, slightly premium
- light theme
- no purple
- use cool white, pale gray, and subtle blue-gray surfaces
- primary accent should match the Blizzard Battle.net brand blue
- text must be high-contrast and crisp
- medium corner radius, around 10px to 14px
- very soft shadows
- no glassmorphism, no neon, no cyberpunk, no noisy decoration
- avoid large decorative gradients, but allow a very subtle premium gradient on the primary button

Motion direction:
- modern but restrained
- hover states with slight brighten or subtle lift
- a short press feedback on the primary button
- smooth highlight transition on selected list rows
- subtle reveal hint for the Debug area
- use short 150ms to 220ms transitions
- motion should communicate state and quality, never decoration for its own sake

Typography and layout:
- use a clean sans-serif UI font
- strong visual hierarchy
- avoid a split-screen debug layout
- avoid dense technical panels
- balanced whitespace
- should feel like a mature, shippable Windows productivity tool, not a prototype

Produce a high-fidelity UI concept with clear component hierarchy, refined spacing, realistic desktop affordances, subtle animations, and a cohesive modern visual system.
```

## 用于生成 Logo 的详细提示词

Logo 需要和主界面风格一致，避免游戏公会徽章感、电竞风、赛博朋克感或黑客工具感。

### Logo 设计方向

- 产品名：`YiboBattleSwitch`
- 核心语义：`Battle.net / WoW 多账号切换`
- 关键词：`切换`、`双状态`、`账号切换`、`稳定`、`本地工具`
- 气质：`简洁`、`现代`、`可靠`、`轻微科技感`、`不张扬`

Logo 不应表现为：

- 魔兽题材插画
- 剑、盾、龙、头盔、火焰等游戏图腾
- 复杂徽章
- 夸张电竞图形
- 黑客、破解、外挂联想

更适合的图形方向：

- 两个切换中的状态块
- 抽象的双账号切换结构
- 轻量箭头或路径切换关系
- 简洁的字母 `B` / `S` 组合
- 带有同步、切换、连接意味的几何图形

### 中文版 Logo 提示词

```text
请为 YiboBattleSwitch 设计一个简洁、现代、可靠的桌面工具 Logo。

这是一个 Battle.net / 魔兽世界多账号本地切换工具，服务于普通玩家，不是技术调试器，也不是游戏战队品牌。Logo 要表达“账号切换、双状态切换、本地工具、稳定可靠”的感觉，而不是表达战斗、魔兽世界题材插画或黑客感。

设计方向：
- 极简几何图形
- 可以基于字母 B / S 做抽象组合
- 也可以用两个状态块、双卡片、切换箭头、连接路径等方式表达“切换”
- 整体要像成熟软件产品的图标，而不是电竞徽章

风格要求：
- 简洁、现代、克制
- 轻微科技感
- 高辨识度
- 适合 Windows 桌面应用图标、标题栏、小尺寸显示
- 小尺寸下也清晰
- 不要复杂细节
- 不要插画感
- 不要 3D
- 不要紫色
- 不要霓虹
- 不要火焰、武器、盾牌、龙、头盔、魔法纹章

配色要求：
- 以暴雪战网品牌同系蓝、深灰为主
- 可以使用低调的浅蓝高光
- 整体偏浅冷、现代工具软件风格
- 背景透明，适配浅色界面

构图要求：
- 优先设计 App Icon 风格图形
- 可额外给出带文字的横版组合
- 图形重心稳定
- 线条和块面简洁
- 视觉感觉像“切换”“双账号”“同步”“本地工具”

请输出一个适合现代桌面应用的高质量 Logo 方案，强调可实现性、识别度、缩略图清晰度和与简洁主界面的统一性。
```

### 英文版 Logo 提示词

```text
Design a clean, modern, reliable logo for a desktop utility called YiboBattleSwitch.

YiboBattleSwitch is a local Battle.net / World of Warcraft multi-account switching tool for regular players. It is not a debugger, hacker tool, esports brand, or fantasy game emblem. The logo should communicate account switching, dual-state transition, local utility, and trustworthiness.

Preferred visual directions:
- minimal geometric icon
- abstract combination of the letters B and S
- two states, two panels, or two account blocks transitioning between each other
- subtle arrows, path switching, or connection logic
- software-product icon energy, not gaming badge energy

Avoid:
- fantasy illustration
- swords, shields, dragons, helmets, flames, magic symbols
- esports logo style
- hacker aesthetics
- noisy details
- 3D rendering
- purple
- neon effects

Style:
- minimal
- modern
- restrained
- slightly technical
- highly legible at small sizes
- suitable for a Windows desktop app icon and title bar
- crisp silhouette
- simple geometry

Color direction:
- Blizzard Battle.net brand blue, deep gray
- optional subtle light-blue highlight
- transparent background
- should fit a clean light-themed desktop UI

Composition:
- prioritize an app-icon-ready mark
- optionally also provide a horizontal lockup with the wordmark
- stable visual balance
- clear symbol for switching, dual accounts, sync, or local tool behavior

Create a high-quality logo concept that feels like a mature desktop product identity, with strong recognizability, clean small-size rendering, and clear visual alignment with a minimal modern application UI.
```

## 实施原则

后续实际改 UI 时，优先遵循以下原则：

1. 先收敛信息架构，再动视觉细节
2. 先确保主路径顺，再补调试路径
3. 主界面宁可少一点，也不要重新变回调试台
4. 所有技术信息默认降级，不主动推到第一层
