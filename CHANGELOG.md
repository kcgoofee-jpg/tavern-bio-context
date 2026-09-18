# Changelog

格式参考 Keep a Changelog；版本见 docs/conformance-zh.md §3。

## [Unreleased] — 0.4 草案

见 `docs/spec-v0.4-draft-zh.md`。只在首行 `v="0.4"` 时由校验器检查；每项落地前需真机实测。

### Added（草案）
- 流式显示：首行 `stream="yes|no"`；扩展行 `stream(lag Ns): wait … | body …, N chars | hr … | pos ~N/N chars, para N/N`；流式时不输出 `read-pos`，阅读速度只用非流式轮次校准。
- 心率滞后：首行 `lag="Ns"`（缺省胸带带 RR 为 4 秒、腕式或未知为 6 秒，经验值）；峰值后缀 `carryover`；相位行段 `tail-max N @+Ns`；位置换算用 `peakAt − lag`；出 peak 的最短相位改为 `max(10 s, 2 × lag)`。
- 基线行段 `age`、`noise ±N`、`changed from <方法> N turns ago`；`manual` 必须带 `set 日期, 设备`；`rest` 排除发送后 lag 秒；基线过时提示；聊天变量 `bio.baselineInfo`。
- 带定义的派生事实：相位行段 `mean N (±N%)`、`above +N% 时长`、`away 时长`；`history` 段 `read-peak-rel`；读法改用 `noise`，分“起伏 / 显著升高”两档。
- away 相对 `sent` 的写法 `-m:ss..-m:ss 类型 (相位)` 与类型 `unfocused`。
- 世界书扫描缺省改为关闭。

### Changed（草案，2026-09-18，heartlink 实现时的发现）
- §5.1-3 `act` 段的 `mean` 改为按**实际驱动的毫秒数**加权（`∫ 强度 dt ÷ 驱动毫秒数`），不再是整秒强度的算术平均：短动作跨秒时首尾两秒会把强度拉低（写 0.8、8 秒，旧口径得 71%）。秒数仍逐秒计。
- §6 “不在就不算”：峰值、`cov`、最短时长只按在场的秒算，取代 v0.3 §1.4-6 的“离开超过一半不出峰值”；`read-pos` 从回复写完后读者第一次在场时起算（用户 2026-09-18：“没在读就是没在读”）。
- §6 离开类型加 `offscreen`（最新回复整条滚出可视范围，读者在翻看旧消息：计入、不判位置）；写明四种类型各自怎么判、统计怎么处理；离开检测覆盖整轮（含 `gen`）；`unfocused` / `offscreen` 短于 5 秒不记；写进 v0.3 块时 `unfocused` → `hidden`、`offscreen` → `idle`。依据：用户追问与 `references/research/2026-09-18-browser-attention-signals.md`（浏览器能力清点）。
- §5.6-1 玩具传感器行括号里可以写**设备 id**（该设备执行器 id 的公共前缀，如 `intiface:0`）：buttplug 的压力 / 按键是设备上独立的特性，不属于某一路输出。校验器按前缀识别来自执行器的传感器行。
- 执行器与相位的重叠（§5）：相位行与 `stream` 行新增 `act N s, mean N%, N act(s)[ (Estim)]`（本相位内执行器运行的秒数、时间加权平均强度、动作条数，有风险的输出必须点名）；算的是**生产者发出的动作**，不是设备确认执行的时间；新增扩展行 `clean(gen|read|write): hr … | sec 干净秒/相位时长 [| cov …]`，只用没有驱动的那些秒统计，干净秒不足 `max(10 s, 2 × lag)` 或不足相位时长 30% 时整行省略；基线卫生：会话内算出的基线窗口必须排除驱动秒，不够就按 §3 优先级降级并写 `warn: baseline degraded to …`；读法（非规范）只陈述事实——驱动秒里的心率同时反映设备与剧情、腕式在动作中不可靠——判断留给用户自己的模型，并给出“跨轮比较 `clean`”这一条不具约束力的例子；聊天变量新增 `phases[gen|read|write].act` / `.clean`（Schema 在 `v` 为 `0.4` 时检查），总线不加新方法。
- 玩具上的传感器输入（§5.6）：`pressure` / `button` 等已有 kind 的 `device` 写**执行器 id**，`unit` 为 `raw`，块里只写带 `+` / `-` 的相对变化、不得换算成物理单位，也不得与 `sensor(…)` 的信号源设备混同、不进相位心率统计。
- 执行器电量与连接（§8）：`tbc.push({ kind: 'battery' | 'charging', device: <执行器 id> })` 归到执行器；`tbc.actuatorLink(id, 'ok' | 'reconnecting' | 'lost')`；`tbc.actuators()` 增加 `battery`、`charging`、`batteryAt`、`link`，`tbc.outputState()` 增加 `actuatorStatus`；扩展行 `actuator(<执行器 id>): battery N%[ low] | charging yes|no | link ok|reconnecting|lost`（L0，只在有执行器报告时出现）；`low` 只在电量 ≤ 15% 时写（经验值），不写推断。
- 设备自带模式直通（§9）：`nativePatterns` 可写成列表（`id`、`name`、`outputs`、`levels`、`stoppable`、`maxDurationMs`、`map`），序号 = 位置；`<bio_act pattern="native" mode="序号|名字"/>`；扩展行 `native(<执行器 id>): 1 波浪 | 3 失控 (unstoppable, 60s, opt-in)`，只列用户开启的模式，`haptics off` 时不出现；档位与频率照常约束；找不到模式时跳过（不退回 `pulse`）；停不下来的模式的护栏写成可检查条目，停止后仍在运行时 `feedback` 备注与事件 `reason` 写 `native-unstoppable`；`outputState()` 增加 `nativeRunning`。
- 参考实现：`tools/bio-act.mjs` 新增 `NATIVE_PATTERN`、`resolveNative()`，`parseBioActs(text, { actuators })` 解析 `mode`，没传执行器列表时直通动作跳过（`NATIVE_NO_CAPS`）；错误代码 `NATIVE_NO_MODE`、`NATIVE_UNAVAILABLE`、`NATIVE_OFF`、`NATIVE_TARGET_AMBIGUOUS`、`MODE_IGNORED`。`tools/block.mjs` 在 `v="0.4"` 时检查 `actuator` / `native` 行与 `native-unstoppable` 备注（`ACTUATOR_*`、`NATIVE_*`），以及 `act` 段、`clean` 行、来自执行器的传感器行（`ACT_*`、`CLEAN_*`、`TOY_SENSOR_*`）。Schema：`actuator` 的 `nativePatterns` 列表写法，`bio-act` 的 `pattern: native` 与 `mode`，`feedback` 的 `reason: native-unstoppable`。样例 `blocks/valid/13`、`14`，`blocks/invalid/20`、`21`、`22`，以及 `bio-act` 与 JSON 样例（`bio-variable.v04-phases`）。

### Added（草案，2026-09-18 晚）
- §12 `gates(…)` 行：本轮用了哪些门槛（`idle` / `too-long` / `pause`）、值与来源（`est` / `cal n=N` / `user`，可加 `frozen`）；登记表写明缺省值与允许范围；自适应只能由行为时长算出；v0.3 块也可输出（读者忽略）。
- §13 `haptics` 行的 `tuned` 段：用户改过档位参数时只列改过的（`floor`、`long` / `heartbeat` / `wave`、`gap`、`per-reply`），模型看到的档位名与实际执行对得上。
- 校验器：`GATES_SYNTAX`、`GATES_RANGE`、`HAPTICS_TUNED`；修正 `haptics` 行整行匹配、主体后多写一段就报错的问题（v0.3 §2.3-2 本来允许任意段，现只给 `SEG_UNKNOWN` 警告）。样例 `blocks/valid/16`、`17`，`blocks/invalid/23`。

### Changed（草案，2026-09-18 晚）
- §6：`idle` 只从有内容可读时开始判（流式从首字、非流式从回复写完）；新内容出现和读者操作一样重新开始计时。等首字时坐着不动不再算离开。

### Docs（2026-09-18 整理）
- 样例与示例里的感知者名字改为中性的“艾拉”（README、v0.3 §2 示例、`fixtures/blocks`、`fixtures/json`、`fixtures/sanitize`）；校验结果不变。
- v0.2 标为历史稿（已被 v0.3 定稿候选取代）；README 的 v0.4 清单补上 §5.6 玩具传感器、§6 离开类型、§7 世界书扫描缺省关。
- `device-interface-zh.md`：本机桥目前没有维护中的实现（参考实现只带客户端）；`st-compat-audit`：去掉对私有文件的引用。
- 样例 `blocks/valid/14` 首行日期更正为 2026-09-18。

### Deprecated（草案）
- `quiet-median`、`p20`：v0.4 起生产者不得输出。
- 以下 1.0 移除：`history` 的 `read-peaks` 绝对值、`MM-DD` 日期、away 绝对时刻写法、feedback 旧备注写法 `(act N, Ns in)`。

### 待定（未采纳）
- 负向事件 `dip`、低质量 HRV 标记、基线情境字段、`hr-high` 缺省值的依据。
- 两档电量设备的写法、低电量门槛的实测依据、自带模式能否调强度、同名模式在 `target="*"` 时的处理。
- 振动 / 触觉刺激本身对心率的影响幅度（**未核实**）；`clean` 的两个阈值、多执行器同秒的强度取法、`stream` 行要不要也支持 `clean`、将来设备能回报执行状态时是否另加口径。

## [Unreleased] — 0.3 定稿候选

依据相位法审查与生理学文献调研并入的定稿项（2026-09-18）。

### Added
- **本机桥安全（必须，任何本机桥发布前实现）**：只听回环并校验 `Host`；`Origin` 白名单；6 位码配对后下发令牌；`read` / `push` / `actuate` 三档权限，`actuate` 缺省拒绝；可吊销；错误事件 `bio:error`（`FORBIDDEN` 等）。Schema `bridge`（§6）。
- **字符串校验与清洗**：标识类字段 `^[a-z0-9][a-z0-9._:-]{0,31}$` 不合法即拒收（`BAD_INPUT`）；自由文本删尖括号与控制字符、换行变空格、截断；首行属性值含 `" < >` 或换行时删掉该属性。参考实现 `tools/sanitize.mjs`（§4.4）。
- **单块保证**：注入前自检恰好一个 `<bio_context` / `</bio_context>` 并通过读者档；不通过时注入最小块（`warn: block-invalid`）；读者只依靠块自身的标签边界（§2.5）。
- **宽松解析**：通用行语法；读者按行名取值，不因顺序、未知行、未知段拒收；已知行主体后可带任意 ` | ` 段；固定区冻结；校验器分生产者档与读者档（`--reader`）（§2.3）。
- 首行属性 `view`（`backstage` / `in-story` / `device-aware`）、`replay`（`continue` / `group`）、`date`、`tz`。
- `scope` 行按 `trigger` 分四句；swipe / regenerate 写 `n/a (no new message)`、不输出 `read-pos`；continue 必须带 `replay="continue"`；impersonate 写 `write: n/a (impersonate)`；同一次发送只生成一次块；附录 A“宿主生成类型 → 是否开新一轮”（§1.3）。
- 生产者身份：`tbc.claimProducer()` / `releaseProducer()` / `producer()`、事件 `bio:producer`；版本逐段按整数比较；没有身份的实现不得注入。Schema `producer`（§4.6）。
- 峰值判定：5 秒居中中位数平滑；门槛 `max(5 bpm, 2 × noise)`，腕式下限 `max(6 bpm, 基线 × 7%)`，持续 ≥ 3 样本且 ≥ 3 秒；相位 < 10 秒、样本 < 10、`cov` < 70%、稀疏、与 away 重叠过半时不出 peak；无 peak 不出 `read-pos`（§1.4）。
- HRV 质量：`rr-loss` > 5% 或相位 < 30 秒（心率低于 60 时 60 秒）不出 `hrv`；`write` 不应出 `hrv`；`rr-loss` 定义写明（§1.4）。
- 有 RR 时应该用 RR 算逐秒心率（§1.4）。
- 基线方法登记 `manual` / `rest` / `rolling-low` / `prior-rhr` 与优先级；手动基线流程（静坐、丢弃前 60 秒、取 120 秒）；`rest` 不是医学静息心率（§1.5）。
- 解释层读法（非规范）：心率跟唤起与注意走、不跟好恶走；混杂因素；心率降低可能是专注；习惯化；高潮后恢复期；不要推断的内容（§1.6）。附录 B 列出依据（DOI）。
- 可选的非诊断提示 `flag: hr-high` 与 `actuate` 拒绝原因 `hr-high`（§5.4-10）。
- 设备名规则：`^[a-z0-9]+(?:[.-][a-z0-9]+)*$`、≤ 32；序列号检查扩展到十六进制段与 `:` `_`；同规则用于 `<kind>(…)`、`sensor(…)` 等括号里的名字和执行器 id；不得用蓝牙广播名原文（§2.6）。
- 稀疏来源不出 `series`、`hrv`、`peak`、`read-pos`（§2.8）；带 `transport` 为 push / bridge / api 或带 `lagMs` 的样本必须带 `t`，按 `t` 归相位，超出 `[现在 − 24h, 现在 + 5s]` 拒收；`hr` 主来源唯一（§4.5）。Sample 新增 `transport`。
- `feedback` 行语法：`acts N sent, N done[, N cut][, N pending][, N refused]`（必须相加相等）；相位 `send`；备注 `reply -N[, act N][, Ns in]`，`stop by device` 可带原因；swipe 时不清空（§5.12.2）。
- `<bio_act/>`：思维链（推理字段、正文 think / thinking 块、宿主推理模板）、代码、HTML 注释里的标签不算动作，上限按剩下的计算；生产者自己隐藏标签，不依赖宿主清理。参考实现 `stripNonActionText()`、`hideBioActs()`（§5.3）。
- 诊断代码 `BAD_INPUT`、`BLOCK_INVALID`、`MULTI_PRODUCER`、`SCAN_COLLISION`；诊断字段 `producer`、`injection.scan_world_info`、`injection.invalid_blocks`。
- `bio.lastSignal` 应该可关闭（§4.3）。
- 样例：块合规 12 个、不合规 19 个（含读者档预期）；清洗用例；`<bio_act/>` 思维链用例；JSON 样例 `bridge`、`producer`、`bio-variable`（view、v0.4 baselineInfo）、`diagnostics`。

### Changed
- 模式：0.x 期间 `mode` 只写 `author` / `character`，新名写在 `view`，读者以 `view` 为准；`bio` 变量与 `bio:inject` 同样处理，不得出现实现内部名（§1.1）。取代草案里“mode 直接写新值”的做法。
- 世界书扫描由“参与”改为“可以参与，用户开关，缺省开”；诊断 `SCAN_COLLISION`（§2.7）。
- 日级行与 `prior` 的日期写 `YYYY-MM-DD`。
- 相位行心率段 `hr n/a`、`hr n/a (原因)` 合法；`read-pos` 速度可带一位小数（生产者应取整）。
- v0.2 §2.2 示例勘误：`hr 75→78 [70–83] peak 83 @32s`；作废 v0.2 §2.3 对 70% 门槛的文献引用。
- 校验器重写：`parseBlock(text, { profile })`，新增导出 `compareVersions`、`effectiveView`、`getLine`；旧导出保留。

### Deprecated
- `quiet-median`（= `rest`）、`p20`（= `rolling-low`）；`MM-DD` 日期；feedback 旧备注写法。读者仍接受，1.0 移除。

## 0.3 草案（此前的条目）


### Added
- 三档模式 `backstage` / `in-story` / `device-aware`（旧名 `author` / `character` 为别名）。
- 卡片声明 `data.extensions.tbc`（`mode_hint`、`perceiver`、`min_spec`）与首行 `perceiver` 属性。
- 相位归属：固定行 `scope:`；解释层不得跨相位归因、无基线不比较。
- 诊断接口 `tbc.diagnostics()`、事件 `bio:diagnostics`、问题代码登记表。
- 注入开关与隐私告知；后台生成不得带注入块。
- 日级行 `sleep` / `day` / `workout` / `trend`，事件与设备行 `wear` / `button` / `motion` / `sensor`，L2 敏感行 `body` / `cycle` / `journal`；尾部 `warn:` 行登记。
- 敏感分级 L0 / L1 / L2；`bio.daily`、`bio.sensor`、`bio.sensitive`；总线 `setDaily` / `getDaily` / `setExposure` 与新 kind。
- 输出接口：`registerActuator(id, caps, handler)` / `actuate` / `stop` / `actuators`、`<bio_act/>`（`intensity`、`ms` 属性）；强度帧 `patternFrames()`；模式 `wave`；执行器 `minIntervalMs`、`levels`、`via`；用户强度上限；Intiface / buttplug v4（回退 v3）适配说明。参考实现 `tools/bio-act.mjs`，Schema `bio-act`、`actuator`。
- `feedback` 的 `reason` 增加 `stop-failed`、`maybe-running`（v0.4 §7.5）；诊断代码增加 `TOY_STOP_FAILED` / `TOY_MAYBE_RUNNING` / `TOY_EXCLUSIVE_BUSY` / `TOY_HANDSHAKE_TIMEOUT`。
- `actuate` / `stop` 结果新增 `refused: 'stop-failed'`（停止重试仍失败，§5.9-9）。
- 设备层（§5.9）：自带模式默认须能被强度 0 立即停下；停不下来的自带模式可在 `stoppable: false` + 已知时长 + 非风险输出 + 用户逐台开启的条件下登记，运行期间持续提示；执行器能力 `exclusive`（独占连接）、`stopsOnDisconnect`（断线是否确定自停，缺省 false，断线期间显示“可能仍在动”、重连先停）；全部停止越过排队、逐输出停止并等应答。
- 设备反馈输入（玩具 → 剧情，§5.12）：`tbc.feedback()` / `bio:feedback` / `feedbackLog()`，块内 `feedback` 行（L0），`bio.feedback`，`replyActs()` 记录可带 `feedback`；Schema `feedback`。
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
