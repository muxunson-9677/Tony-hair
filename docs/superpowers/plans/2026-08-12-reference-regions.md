# Private Reference Regions Implementation Plan

**Goal:** 让用户用四个部位和短句明确参考图中要保留或不要照搬的部分，并把结果带入计划快照。

### Task 1: 数据契约与仓储边界

- [ ] 先写旧数据默认、合法写入、非法/重复/超长原子拒绝测试。
- [ ] 扩展类型与 repository 归一化，不升级 Dexie schema。
- [ ] 让私人参考转候选时附加局部意图。

### Task 2: 单部位编辑组件

- [ ] 先写一次一部位、保存、重开编辑、删除和事件测试。
- [ ] 实现四部位按钮、意图选择、80 字说明和摘要。
- [ ] 使用现有 tactile 反馈并支持 reduced motion。

### Task 3: 表单与详情接入

- [ ] 先写新增、编辑刷新、失败不写和详情展示测试。
- [ ] 表单保存/恢复 focusAreas，详情显示用户明确意图。
- [ ] 验证换图不静默清除局部意图。

### Task 4: 手机闭环与全量验证

- [ ] Playwright 完成导入、局部说明、加入计划、沟通卡和刷新。
- [ ] 验证 390px、触控、键盘、无上传和 IndexedDB 持久化。
- [ ] 运行 lint、typecheck、unit、build、Playwright、audit、diff-check。
