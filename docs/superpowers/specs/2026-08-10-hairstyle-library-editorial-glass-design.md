# “咋剪发”发型库与暖调编辑玻璃设计规格

## 1. 已确认目标

本阶段采用路线 A：建设产品精选发型库、用户私人参考库、私人收藏与收藏夹，并让这些内容能够加入理发计划、长期复用和给理发师查看。

本阶段明确不增加投稿、公开发帖、评论、公开点赞、关注、私信、作者主页、排行榜、社区审核后台、账号同步或任何陌生人互动。

现有好友投票、公开投票链接、站内短评和投票管理页退出产品：移除所有前端入口、创建能力和可达路由，前端不得再发起投票上传、创建、读取、投票、结果或撤销请求。历史远端数据与 Blob 的清理由独立的服务端迁移/清理任务处理，本阶段不把删除远端数据伪装成前端视觉重构的一部分。

首批精选库只使用仓库已有的 6 张项目内 AI 合成成年人物造型图。界面必须诚实标注“首批精选 6 款”“AI 合成成年人物示例”“侧面和后脑细节需理发师现场确认”，不得用重复图片伪装内容规模。网络截图和用户上传图只能保存在私人参考库，不能进入公共精选库。

## 2. 产品信息架构

底部主导航保持四项：

```text
首页 / 找发型 / 档案 / 我的
```

“找发型”内部包含：

- 精选：浏览、搜索和按真实需求筛选 6 款精选发型。
- 收藏：查看收藏、创建收藏夹、移动或取消收藏。
- 我的参考：上传、命名、备注、打标签、查看和删除私人参考图。

路由：

```text
/styles                              精选发型
/styles/favorites                    私人收藏
/styles/references                   私人参考库
/styles/references/new               上传私人参考
/styles/references/:id               私人参考详情
/styles/references/:id/edit          编辑私人参考信息
/styles/references/:id/show          给理发师看私人参考
/styles/catalog/:id                  精选发型详情
/styles/catalog/:id/show             给理发师看精选发型
/try                                 保留原有“示例试剪”，退出主导航
```

旧 `/try` 不承担内容发现入口。主导航固定进入 `/styles`；首页继续由建档、活动计划、候选数量、理发日期和剪后补录状态决定唯一主行动，仅“尚无计划”或“需要添加候选”的状态进入 `/styles`。精选详情可把用户带到与该款对应的示例试剪。

## 3. 数据与服务边界

### 3.1 精选目录

精选目录由静态 TypeScript 数据和同源静态图片组成，不写入 IndexedDB、不调用 API、没有热链。条目 ID 和图片路径一旦发布就不复用；未来下架只从浏览入口隐藏，已存收藏和计划仍能解析原条目。

```ts
type StyleGoal =
  | 'low_maintenance'
  | 'no_perm_or_dye'
  | 'soften_hairline'
  | 'keep_sides_longer'
  | 'glasses_friendly'
  | 'commute_ready'
  | 'grow_out_gracefully'

interface CuratedHairstyle {
  readonly id: string
  readonly status: 'active' | 'retired'
  readonly name: string
  readonly aliases: readonly string[]
  readonly coverImage: string
  readonly imageAlt: string
  readonly assetSource: 'project_generated_ai'
  readonly disclosure: string
  readonly genderPresentation: 'feminine' | 'masculine' | 'androgynous'
  readonly length: 'very_short' | 'short' | 'jaw_length'
  readonly hairTextures: readonly HairTexture[]
  readonly strandThicknesses: readonly StrandThickness[]
  readonly densities: readonly HairDensity[]
  readonly goals: readonly StyleGoal[]
  readonly maintenanceLevel: 'low' | 'medium' | 'high'
  readonly stylingMinutes: number
  readonly trimIntervalWeeks: readonly [number, number]
  readonly requiresPerm: boolean
  readonly reason: string
  readonly feasibility: string
  readonly tradeoffs: readonly string[]
  readonly barberGuide: {
    readonly overall: string
    readonly top: string
    readonly fringe: string
    readonly sides: string
    readonly sideburns: string
    readonly back: string
    readonly topPriorities: readonly string[]
    readonly absoluteAvoids: readonly string[]
  }
}
```

筛选优先使用普通用户能理解的目标：少打理、不烫不染、遮发际线、两侧不要太短、戴眼镜、通勤、留长过渡。发质、发量等专业条件作为详情和次级筛选，不能给出绝对脸型结论。

### 3.2 私人参考与收藏

私人库是当前设备级数据，不依赖发质档案。新用户在没有建立档案时也可以收藏和上传；只有“加入理发计划”需要先建立档案。

```ts
interface PrivateHairstyleReference {
  readonly id: string
  readonly fingerprint: string
  readonly name: string
  readonly notes: string
  readonly tags: readonly string[]
  readonly image: Blob
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly processedAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface FavoriteFolder {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface HairstyleFavorite {
  readonly id: string
  readonly itemType: 'curated_style' | 'private_reference'
  readonly itemId: string
  readonly itemKey: string
  readonly folderId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}
```

`itemKey` 固定为 `${itemType}:${itemId}`，并由唯一索引保证幂等收藏。一个收藏首版只属于一个收藏夹；未分组时 `folderId` 为 `null`。

Dexie 从 v2 升到 v3，只新增表，不自动复制历史候选 Blob：

```text
privateReferences: id, &fingerprint, updatedAt
favoriteFolders: id, &name, updatedAt
favorites: id, folderId, &itemKey, updatedAt
```

迁移必须保留全部 v1/v2 档案、照片、候选和沟通卡字节。旧候选不自动进入私人参考库，避免升级时复制图片导致配额失败。

`HairstyleLibraryRepository` 是私人参考、收藏和收藏夹的唯一写入边界，并提供 `list/get/save/replace/delete` 参考、`list/toggle/move` 收藏及 `list/save/delete` 收藏夹。写入类型不接受调用者自报 `fingerprint`；仓储必须从处理后 Blob 计算 SHA-256，读模型才返回该指纹。以下操作必须在单个 Dexie 事务中完成：

- `deletePrivateReference`：删除私人参考及指向它的收藏，已保存到计划中的候选快照不变。
- `deleteFolder`：先把文件夹内收藏原子移到 `folderId = null`，再删除文件夹。
- `replaceReferenceImage`：先完成新图全部校验和指纹冲突检查，再原子替换图片、尺寸、字节和处理时间；失败时旧图完全不变。

写入规范：名称去首尾空白后 1～40 字；备注最多 300 字；标签最多 8 个，每个去首尾空白后 1～12 字并按规范化文本去重；收藏夹名称去首尾空白后 1～24 字且唯一。迁移测试除记录数量外，还必须逐字节/哈希验证旧 Blob，并深比较旧候选与沟通卡字段不变。

### 3.3 图片处理

所有私人上传继续使用现有 `prepareLocalImage`：纠正方向、长边不超过 1920px、WebP/JPEG、不超过 1.5MB、Canvas 重绘清除 EXIF。数据库不保存原始文件名、原始字节或 EXIF。图片不通过网络上传。

同一处理结果以处理后 Blob 的 SHA-256 指纹去重。首次保存和替换图片都必须由仓储重新计算指纹，并在写事务前验证 MIME、尺寸、字节数、处理时间和指纹冲突；任何失败不得留下部分更新。

### 3.4 理发计划兼容

精选目录的 6 款继续写入现有 `Candidate.source = 'demo_ai'`，并沿用当前 `demoImagePath`、来源字段白名单、验证器和图片解析逻辑。精选目录只给同一稳定 ID/路径补充筛选、维护、现实限制和理发说明元数据；不得增加第四种 Candidate 来源或复制第二套图片指针。

`HaircutPlan` 新增必填 `mode: 'exploration' | 'repeat'`。v3 读取旧计划时规范化为 `exploration`，不重写其旧候选或 Blob；新建探索计划写 `exploration`，只有从已启用标准发型发起“照上次再剪”才写 `repeat`。

私人参考加入计划时继续写成 `user_reference`，复制处理后的 Blob、宽高、字节数和处理时间。这个复制是有意的计划快照：之后删除或改名私人参考，不得破坏旧计划或沟通卡。

从详情加入计划使用本地查询指针：

```text
/archive/plans/new?add=catalog:<id>
/archive/plans/new?add=private_reference:<id>
```

计划表单必须重新从静态目录或 IndexedDB 解析并验证指针，不能信任 URL 直接构造候选。

缺少档案时，应用把通过白名单验证的待处理指针编码进同源 `next`：只允许返回 `/archive/plans/new?add=catalog:<id>` 或 `/archive/plans/new?add=private_reference:<id>`。建档成功后替换导航回该地址并只消费一次；外部 URL、其他路由、重复参数和无效 ID 一律丢弃，不能开放通用重定向。

## 4. 核心用户流程

### 4.1 找发型

用户打开精选库即可浏览，不要求建档。搜索覆盖名称、别名、目标与维护特征；筛选状态必须可清空，空结果提供明确恢复操作。

发型图片是主要信息，不显示虚假浏览量、热度或公开点赞。条目只显示名称、维护级别和一条关键现实提示。

精选 ID 的存在、启用状态与路径匹配由目录指针解析器在构造 Candidate 前验证；转换完成后的 `savePlanWithCandidates` 只验证既有 `demo_ai` 字段白名单、路径格式和混合字段，不承担已丢失 catalog ID 的状态判断。

### 4.2 收藏与收藏夹

详情页收藏按钮使用 `aria-pressed`，重复点击幂等。首次收藏进入“未分类”；收藏页可以创建收藏夹、移动收藏、删除收藏夹。删除收藏夹只把其中收藏移回“未分类”，不删除收藏本身。

### 4.3 私人参考

用户上传后必须先看到处理后的预览，再保存名称、备注和最多 8 个短标签。替换图片、离开页面或处理失败时正确回收 Object URL。保存中锁定文件输入和表单，防止最后一次选择被路由跳转丢弃。

私人参考详情提供“收藏”“加入计划”“给理发师看”“编辑”“删除”。给理发师看只展示处理后的大图、名称和用户备注；没有加入计划前，不根据一张图片伪造顶部、刘海或两侧剪法。

### 4.4 给理发师看

精选发型查看模式展示大图、合成素材披露、现实限制、顶部/刘海/两侧/鬓角/后脑要求，以及“绝对不要”。私人参考查看模式只展示图片与用户自己填写的备注。

完整可导出的沟通卡仍通过创建理发计划获得：`exploration` 使用 2～4 个候选；`repeat` 必须且只能有 1 个候选。创建 repeat、替换其候选或把 exploration 转成 repeat 时，该候选必须是 `past_record`，且 `pastRecordId` 指向同档案仍启用的 `StandardStyle`；任意精选、普通上传或非标准历史记录都不能借此绕过 2～4 个规则。repeat 一旦合法保存，计划和候选快照就是查看、沟通卡和导出的事实来源：之后原记录删除或 StandardStyle 停用，不得破坏旧计划，只在再次编辑来源时重新校验。查看模式隐藏全局底栏，使用高对比度、至少 16px 正文和大触控目标。

## 5. 视觉系统

### 5.1 视觉论点

> 像一本带有真实照片温度的私人发型编辑册：暖象牙纸面承载内容，石墨黑建立秩序，焦糖棕只提示关键决策；玻璃只悬浮在导航和操作层，绝不覆盖发型信息本身。

当前页面不作为视觉基线。此次不是给旧界面叠毛玻璃，而是重建外壳、首页、找发型、详情和“我的”的信息层级；现有档案和表单保留真实逻辑，并通过新的颜色、字号、间距和导航系统获得一致外观。

### 5.2 内容计划

- 首页：品牌与当前状态、单张主视觉、唯一主行动、上次理发或收藏摘要。
- 找发型：紧凑标题、搜索、需求筛选、照片流。
- 发型详情：照片、适用条件、维护成本、风险、理发要点、操作坞。
- 收藏/私人参考：分段导航与真实本地内容，不做空洞仪表盘。
- 我的：发质档案、理发档案、隐私工具和本机数据说明。

首页使用独立纯函数解析唯一主状态。活动计划指 `status = 'draft' | 'ready'`。优先级和可计算条件固定为：

1. 最近记录距本地今天 1～6 天且缺 `after_wash`，或距今天 7～14 天且缺 `day_7`：`补一张真实状态` → `/archive/records/<id>/edit`。
2. 同一档案存在多个活动计划：`选择继续哪个计划` → `/archive`；不静默挑一个或关闭其他计划。
3. 唯一活动计划为 `ready`，且计划本地日期不晚于今天后第 3 个日历日（含逾期）：`打开理发沟通卡` → `/archive/plans/<id>/brief`。
4. 唯一活动计划按 `updatedAt` 继续：探索型少于 2 个候选时 `添加候选` → `/styles`；复刻型没有候选时 `选择标准发型` → `/archive/plans/<id>/edit`，若已无启用标准发型则在表单明确提供“转为探索计划”，不能静默跳去精选库；候选足够但没有沟通卡时 `确定主方案` → `/archive/plans/<id>/brief`；已有沟通卡时 `打开沟通卡` → 同一地址。
5. 没有活动计划但存在启用的 `StandardStyle`：`照上次再剪` → `/archive/plans/new`，表单展示真实标准发型入口。
6. 已建档无上述状态：`准备下次理发` → `/styles`。
7. 未建档：`建立我的头发档案` → `/archive/profile`。

这些标签与路由由纯函数返回并以本地日历日测试。视觉重做不能把它退化成固定两个按钮。

移动端精选使用两列照片流；桌面使用粘性筛选区和至少三列照片流，不再把整个产品锁在 520px 手机条中。首页桌面采用左右编辑版面；详情桌面采用粘性大图与内容双栏。

### 5.3 玻璃边界

允许使用玻璃：移动底部导航、桌面主导航、滚动后的筛选工具条、图片上的返回/收藏按钮、详情底部操作坞、弹层。

禁止使用玻璃：照片卡主体、沟通卡、表单、档案列表、隐私遮罩画布、长文本背景。禁止玻璃嵌套玻璃。`backdrop-filter` 不可用或用户减少透明度时，回退为高不透明度暖白/炭黑表面。

### 5.4 交互论点

- 路由进入使用 160～200ms 透明度与 6px 位移；截图与减少动态模式关闭位移。
- 搜索筛选栏滚动后才成为玻璃工具条，静止时融入纸面。
- 收藏只做轻微 0.96→1 回弹和可读状态提示，不做飞心、彩带或虚假社交反馈。

## 6. Logo

Logo 使用本轮生成的原创 Q 版剪刀：石墨黑主体、暖焦糖强调、圆润钝尖、清楚手柄孔、无文字和美容院装饰。生成母版先在纯色键控背景上完成，再转为真实透明 PNG。

固定输出：`public/brand/zajianfa-scissors-master.png`（1024px 透明母版）、`zajianfa-scissors-512.png`（透明）、`zajianfa-scissors-touch-180.png`（暖象牙不透明底色与安全区）、`zajianfa-scissors-32.png` 和 `zajianfa-scissors-16.png`（经过光学校正的简化剪刀）。透明母版的四角和手柄孔必须真实透明，在暖米白与炭黑背景上无绿边或白边；小图标单独检查浏览器标签辨识，180px 单独检查手机主屏幕效果。`index.html` 接入 favicon 与 Apple touch icon；首页以 56～64px Logo 配合可见“咋剪发”文字，读屏避免重复朗读。

## 7. 错误与删除语义

- IndexedDB 不可用或配额不足：显示现有本地存储错误，不丢失旧内存状态。
- 图片处理失败：不保存、不收藏、不创建候选，允许重新选择。
- 删除私人参考：先明确说明会删除本地原项和对应收藏，但已存计划快照保留。
- 删除收藏夹：收藏回到未分类。
- 精选 ID 无效或已退休：旧收藏可进入诚实的不可新增状态，不能静默换成另一款。
- 加入计划时没有档案：跳转建立档案，不能创建半成品计划。

## 8. 验收标准

功能：

- 精选 6 款 ID、图片、别名唯一，全部同源且有 AI 标识、维护成本、现实限制和理发师字段。
- 搜索、筛选、收藏、收藏夹、私人上传、编辑、删除在刷新后保持。
- 精选与私人参考能共同组成探索型 2～4 个候选；复刻型 1 个候选仍可生成沟通卡。
- 删除私人参考后，已存计划仍能展示和导出。
- 全流程没有私人图片上传、第三方图片请求或新增 API。
- 前端没有投票文案、入口、可达路由或投票创建请求；原公开投票 URL 返回产品内的不可用状态，不渲染历史互动内容。

视觉与无障碍：

- 360×800、390×844、430×932、1280×900、1440×900 无横向溢出。
- 第一视觉检查点覆盖外壳、首页、精选、详情、收藏和私人参考；这些页面在 390×844 与 1440×900 的真实截图通过评审后，才扩展其余页面。
- 截图同时覆盖空状态、已有数据、处理中与错误状态；390px 首页主行动首屏可见，精选首屏显示 2 个完整候选并露出下一行继续浏览信号，详情收藏与主操作始终可达。
- 桌面精选真实显示至少三列，不再是窄手机框。
- 全局普通文本达到 4.5:1；控件边界、非文本图形和可见键盘焦点达到 3:1；正文至少 15px，对应触控目标至少 44×44px。
- 收藏和筛选不只依赖颜色；200% 字体不裁切；键盘可完成浏览、收藏、上传和加入计划。
- 固定操作坞与底部导航考虑安全区且不遮挡最后一项内容；`prefers-reduced-motion`、减少透明度与无 `backdrop-filter` 回退可用。
- 视觉截图必须等待图片解码、字体完成和路由过渡结束，不能把过渡中间态当验收结果。

工程：

- Node 24.19.0、npm 11.17.0。
- lint、类型检查、单元测试、生产构建、Playwright 全部通过。
- Dexie v1/v2 → v3 非破坏迁移测试通过。
- Git diff 检查通过，工作树只包含本阶段文件。

## 9. 明确不做

- 不新增账号、同步、云备份或服务端个人图库。
- 不新增投稿、审核、评论、点赞、关注、公开主页或内容排行。
- 不抓取或热链小红书、抖音、Pinterest、明星或理发店作品。
- 不生成或伪造侧面、后脑参考图。
- 不把收藏命名为“点赞”，不显示社交计数。
- 不保留任何前端好友投票、公开投票链接、站内短评或投票管理入口；历史远端清理由独立服务端任务完成。
