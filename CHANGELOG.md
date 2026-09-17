# Changelog

格式参考 Keep a Changelog；版本见 docs/conformance-zh.md §3。

## [Unreleased] — 0.3 草案

### Added
- 三档模式 `backstage` / `in-story` / `device-aware`（旧名 `author` / `character` 为别名）。
- 卡片声明 `data.extensions.tbc`（`mode_hint`、`perceiver`、`min_spec`）与首行 `perceiver` 属性。
- 相位归属：固定行 `scope:`；解释层不得跨相位归因、无基线不比较。
- 诊断接口 `tbc.diagnostics()`、事件 `bio:diagnostics`、问题代码登记表。
- 注入开关与隐私告知；后台生成不得带注入块。
- 日级行 `sleep` / `day` / `workout` / `trend`，事件与设备行 `wear` / `button` / `motion` / `sensor`，L2 敏感行 `body` / `cycle` / `journal`；尾部 `warn:` 行登记。
- 敏感分级 L0 / L1 / L2；`bio.daily`、`bio.sensor`、`bio.sensitive`；总线 `setDaily` / `getDaily` / `setExposure` 与新 kind。
- 输出接口：`registerActuator(id, caps, handler)` / `actuate` / `stop` / `actuators`、`<bio_act/>`（`intensity`、`ms` 属性）；强度帧 `patternFrames()`；模式 `wave`；执行器 `minIntervalMs`、`levels`、`via`；用户强度上限；Intiface / buttplug v4（回退 v3）适配说明。参考实现 `tools/bio-act.mjs`，Schema `bio-act`、`actuator`。
- 强度档位 `slow-burn`（慢热）/ `steady`（持久）/ `frenzy`（狂暴）/ `max`（极限）与可自定义参数（强度下限、各模式缺省时长、最小间隔、每条回复上限 ≤ 5）；参考实现 `resolveSettings` / `liftIntensity`，`patternFrames` / `parseBioActs` 增加可选设置参数（§5.8）。
- 扩展行 `haptics(来源): off | on | cap N% | profile …`（L0，§5.8）。
- 设备层要求：强度 0 即停止、保活 `keepaliveMs`、互斥组 `group`、加热类必须有时长上限、有风险的输出（`Temperature` / `Estim` / `Spray`）不属于 `output="*"`、`nativePatterns`；`via` 增加 `mcp`（§5.9）；MCP 桥说明（§5.10）。
- 安全：停止不经过模型；安全词为可选且缺省关闭（§5.4）。
- 实现要求：强度帧的计时不能依赖页面计时器（后台标签页会被节流），应放进 Worker（§5.2）。
- 只读接口 `tbc.outputState()`、`tbc.replyActs()` 与事件 `bio:output-state`、`bio:reply-acts`，供角色助手 / 卡片读取输出状态（§5.11）。
- 社区设备实测页 `tools/device-test.html` 与报告说明。
- 可检查的规范：`docs/conformance-zh.md`、`schema/block.abnf`、三份 JSON Schema、`fixtures/`、`tools/block.mjs`、`tools/validate.mjs`。

### Changed
- 用户强度上限改为“实现可选，缺省 1”。
- `write` / `send` 行允许 `n/a (原因)`，与 `gen` / `read` 一致（参考实现一直这样写，校验器此前误报）。
- `prior` 行位置维持 v0.2（`baseline` 之后），修正草案示例里的冲突。

## [0.2] — 2026-09-17（定稿候选）

首行属性 device / transport / cadence / rr / trigger；`prior`、`env`、`<kind>`、`device` 行；`cov`；`read-pos: partial`；总线 `setPrior` / `getPrior`；本机桥消息；实现约束；安全与隐私。

## [0.1] — 2026-09-16

首个草稿：`<bio_context>` 块、聊天变量 `bio`、事件 `bio:sample` / `bio:inject` / `bio:state`。
