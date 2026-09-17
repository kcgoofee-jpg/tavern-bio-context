# Tavern Bio-Context (TBC)

**An open convention for bringing a reader's measured body signals into AI roleplay prompts, and for letting the story drive the reader's devices — device-, preset- and card-agnostic.**

**一个开放约定：把读者身上测到的生理信号（心率、HRV、睡眠、动作……）以统一格式送进 AI 角色扮演（首个宿主：SillyTavern）的提示词，并让剧情以统一接口驱动读者的设备。与设备、预设、角色卡都无关。**

**出发点**：TBC 要标准化的是两件事——设备**输入**（把设备信号整理成模型读得懂的提示词内容）和设备**输出**（让剧情驱动设备动作），两边都给出宽泛、够用的标准接口。目的是让用户**自己配置的模型**能把设备信息和剧情放在一起读，写出合适的动作；"该怎么理解这些数据""要不要让设备动"这些判断权始终留在用户自己的模型和预设手里，不由某个具体实现替用户决定。协助类角色、卡片脚本、扩展也只能通过这组公开接口读写，不碰任何实现的内部状态。

| 项 | 当前 |
|---|---|
| 规范 | v0.2 定稿候选（[`docs/spec-v0.2-zh.md`](docs/spec-v0.2-zh.md)）；v0.3 草案（[`docs/spec-v0.3-draft-zh.md`](docs/spec-v0.3-draft-zh.md)） |
| 规范用语与一致性 | [`docs/conformance-zh.md`](docs/conformance-zh.md)（必须 / 应该 / 可以；一致性角色；版本策略；登记表） |
| 机器可读定义 | [`schema/`](schema)：注入块 ABNF、聊天变量、卡片声明、诊断、触觉动作、执行器能力 |
| 校验 | `npm install && npm test`；单独校验一个块：`node tools/validate.mjs 块.txt` |
| 参考实现 | [heartlink](https://github.com/kcgoofee-jpg/heartlink-extension)（SillyTavern 扩展，已公开，AGPL-3.0） |
| 许可 | 规范文本 CC BY 4.0（参考实现是独立仓库，许可证见该仓库） |

## 目录

1. [概述](#1-概述)
2. [组成](#2-组成)
3. [指标一览](#3-指标一览)
4. [相位](#4-相位)
5. [示例](#5-示例)
6. [使用模式](#6-使用模式)
7. [输出：让设备动起来](#7-输出让设备动起来)
8. [一致性与校验](#8-一致性与校验)
9. [实现](#9-实现)
10. [运行环境](#10-运行环境)
11. [相关项目](#11-相关项目)
12. [版本与贡献](#12-版本与贡献)

## 1. 概述

穿戴设备能通过标准蓝牙或各自的接口提供生理数据；页面脚本能把这些数据按对话相位（看生成 / 读回复 / 写消息）整理成一份**只记录、不解释**的文本；模型读得懂这份文本。要让任何设备脚本、预设、角色卡都能互相配合，只需要约定四件事：**注入块的格式、聊天变量的结构、页面事件的名字、页面总线的接口**。TBC 就是这份约定；v0.3 起再加一个**输出接口**，让剧情反过来驱动设备。

**范围**：数据格式与接口。**不在范围内**：怎样测量（设备协议）、怎样解读（由世界书 / 预设的思维链决定）、具体界面。

## 2. 组成

| 组成 | 是什么 | 谁产生 | 谁使用 | 定义 |
|---|---|---|---|---|
| 注入块 `<bio_context>` | 每次用户可见生成前注入的一条 system 消息：首行属性 + 固定行 + 扩展行，字段为固定英文键，块内不写解释 | 生产者（设备脚本） | 模型 | v0.2 §2，v0.3 §1–2，`schema/block.abnf` |
| 聊天变量 `bio` | 本轮摘要、最近 20 轮、日级数据、传感器状态 | 生产者 | 角色卡脚本、状态栏、导出 | v0.2 §3，v0.3 §3，`schema/bio-variable.schema.json` |
| 页面事件 `bio:*` | `bio:sample`、`bio:inject`、`bio:state`、`bio:diagnostics`、`bio:actuate`、`bio:actuators`、`bio:output-state`、`bio:reply-acts` | 生产者 | 其他扩展、美化 | v0.2 §4，v0.3 §4–5 |
| 页面总线 `window.tbc` | `push` 样本、`registerContext` 设备状态行、`setDaily`、`diagnostics()`、`setExposure()`、`registerActuator` / `actuate` / `stop`、只读的 `outputState()` / `replyActs()` | 生产者提供，任何脚本调用 | 信号源、执行器、卡片脚本 | v0.2 §5，v0.3 §4–5 |
| 本机桥 | `ws://127.0.0.1:27130/tbc/v0.2`，跨进程镜像总线 | 桌面程序 | 生产者 | v0.2 §6，v0.3 §5.5 |
| 卡片声明 | `data.extensions.tbc = { mode_hint, perceiver, min_spec }` | 角色卡作者 | 生产者 | v0.3 §1.2，`schema/card-declaration.schema.json` |

## 3. 指标一览

**敏感等级**（v0.3 §0）：L0 设备状态与会话内时序；L1 一般健康量；L2 敏感量（默认不注入、不写进变量，需用户逐段开启）。"—" 表示该项在 v0.2 中定义、v0.3 未另行分级。

### 3.1 实时信号（总线 `kind`）

| 指标 | `kind` | 单位 | 典型频率 | 出现在块里的位置 | 等级 | 起始版本 |
|---|---|---|---|---|---|---|
| 心率 | `hr` | bpm | 1 s | 相位行 `gen` / `read` / `write`、`send`、`baseline`、`history`、`series` | L1 | 0.1 |
| RR 间期 | `rr` | s | 每拍 | 不单独成行；用于相位行的 `hrv` 与 `rr-loss` 段 | L1 | 0.1 |
| HRV（RMSSD，由 RR 计算） | —（派生） | ms | 每相位 | 相位行 `hrv` 段、`baseline` 的 `hrv` | L1 | 0.1 |
| 血氧 | `spo2` | % | 设备决定 | `<kind>` 行；日级见 `prior` | — | 0.2 |
| 压力指数 | `stress` | 设备定义 | 设备决定 | `<kind>` 行；日级见 `day` | — | 0.2 |
| 体温 | `temperature` | °C | 设备决定 | `<kind>` 行 | — | 0.2 |
| 压力传感（如边缘控制设备） | `pressure` | kPa 或 `raw` | 100 ms 级 | `<kind>` 行，按相位统计 | — | 0.2 |
| 室温 | `room_temperature` | °C | 10 s 级 | `env` 行 | L0 | 0.2 |
| 湿度 | `humidity` | % rh | 10 s 级 | `env` 行 | L0 | 0.2 |
| 设备电量 | `battery` | % | 事件 | `sensor` 行 | L0 | 0.2 |
| 设备按键 | `button` | 按键编号 | 事件 | `button` 行 | L0 | 0.2 |
| 佩戴 | `wear` | 1 / 0 | 事件 | `wear` 行；相位行 `off-wrist` 段 | L0 | 0.3 |
| 动作 | `motion` | g（\|a\|−1 g） | 1 s 摘要 | `motion` 行（静止占比、均值、峰值） | L0 | 0.3 |
| 皮肤温度 | `skin_temperature` | °C | 非实时（带 `lag`） | `trend` 行 | L1 | 0.3 |
| 呼吸率 | `resp_rate` | 次 / 分 | 非实时（带 `lag`） | `trend` 行 | L1 | 0.3 |
| 姿态 | `posture` | `lying` / `reclined` / `seated` / `upright` | 非实时 | `trend` 行 | L1 | 0.3 |
| 充电 | `charging` | 1 / 0 | 事件 | `sensor` 行 | L0 | 0.3 |
| PPG 原始光强 | `ppg` | 设备原始值 | 高频 | **不进块**，只在总线上流转 | — | 0.3 |

### 3.2 日级数据（总线 `setDaily`，块内扩展行）

| 行 | 字段 | 等级 | 起始版本 |
|---|---|---|---|
| `prior` | recovery、hrv、rhr、sleep、spo2、skin（可增 sleep、strain） | L1 | 0.2 |
| `sleep` | 入睡–起床、in-bed、asleep、need、debt、deep、rem、light、awake、eff、perf、consistency、disturbances、resp | L1 | 0.3 |
| `day` | strain、stress、kcal、steps、avg-hr、max-hr | L1 | 0.3 |
| `workout` | 起止与项目、avg-hr、max-hr、strain、kcal、心率区间时长、距离（最近 ≤ 3 次） | L1 | 0.3 |
| `body` | 身高、体重、最大心率（行尾 `[L2]`） | L2 | 0.3 |
| `cycle` | 周期第几天、阶段（行尾 `[L2]`） | L2 | 0.3 |
| `journal` | 饮酒、咖啡因、睡前屏幕等行为记录（行尾 `[L2]`） | L2 | 0.3 |

### 3.3 会话记录（固定行，非生理量）

| 行 | 记录什么 | 起始版本 |
|---|---|---|
| `sent` | 本次发送时刻 | 0.1 |
| `scope` | 固定文本：gen、read 属于上一条回复，write、send 属于本条消息 | 0.3 |
| `gen` / `read` / `write` | 看生成、读上一条回复、写本条消息三个相位的时长、心率区间、峰值时刻、覆盖率 `cov`、`rr-loss`、`hrv` | 0.1（`cov` 0.2） |
| `read-pos` | 读回复时峰值大约落在哪一段（估计或校准的阅读速度） | 0.2 |
| `away` | 页面切走 / 空闲区间 | 0.1 |
| `history` | 最近几轮的读峰值、阅读时长、HRV | 0.1 |
| `series` | 10 秒一格的心率序列 | 0.1 |
| `device` | 执行器状态行；v0.3 起含最近一次触发 | 0.2 |
| `note` / `warn` | 固定说明 / 数据可能不完整的提示 | 0.1 / 0.3 |

### 3.4 输出（v0.3 §5）

| 输出类型 | 含义 | 来源 |
|---|---|---|
| `Vibrate`、`Rotate`、`Oscillate`、`Constrict`、`Spray`、`Temperature`、`Led`、`Position`、`HwPositionWithDuration` | 与 buttplug 协议 v4 的 OutputType 同名 | buttplug v4 |
| `Estim` | 电刺激 | TBC 补充 |
| `*` | 任意输出（执行器有什么就用什么），`<bio_act/>` 不写 output 时的缺省；有风险的输出（见 §7）不在此列 | TBC v0.3 |

模式：`pulse`、`double`、`triple`、`long`、`heartbeat`、`wave`；强度 0–1；帧形状见参考实现 `tools/bio-act.mjs`。

强度档位（v0.3 §5.8）：`slow-burn` 慢热（缺省）/ `frenzy` 狂暴，由用户选；强度下限、各模式时长、最小间隔、每条回复上限都可自定义。块内用 `haptics(来源): on | cap 60% | profile frenzy` 行告诉卡片当前状态。

## 4. 相位

一轮对话在时间上分成几段，各自对应不同的身体状态记录，不能混为一谈：

| 相位 | 记录的是什么 | 归属 |
|---|---|---|
| `gen`、`read`、`read-pos` | 模型生成、读者阅读**上一条回复**时的身体状态 | 上一条回复 |
| `write`、`send` | 读者写**这一条消息**、按下发送那一刻的身体状态 | 这一条消息 |
| `away` | 上一条回复出完到这次发送之间，读者离开页面或长时间未操作的区间 | 不计入统计 |
| `baseline` | 本场安静时段自动算出的平静心率，作为比较基准 | 全程参照；没有基线时不得做"比平时快/慢"的判断 |

固定行 `scope: gen, read = previous reply; write, send = this message` 会把这份归属写进块里，模型不用读说明也能分清"这段数据说的是上一条回复，还是这一条消息"。

## 5. 示例

v0.3 入戏模式的一轮（数值为编造，见 [`fixtures/blocks/valid/`](fixtures/blocks/valid)）：

```text
<bio_context v="0.3" mode="in-story" source="heartlink" device="whoop-5.0" transport="ble" cadence="1s" rr="yes" trigger="normal" perceiver="小影">
sent: 21:04:40
scope: gen, read = previous reply; write, send = this message
baseline: 72 bpm (quiet-median, n=412; hrv 64 ms)
history: read-peaks 78 84 | read-dur 1:52 2:10 | hrv 60 · 55
gen: 41s (ttft 12s, reasoning 9s, body 20s) | hr 74→75 [73–77] | cov 98%
read: 2:10 | hr 75→81 [73–86] peak 86 @47s | cov 96% | rr-loss 14% | hrv 55 ms
write: 18s, 52 chars, pauses 2, edits 1 | hr 81→78 [77–81] | cov 100% | rr-loss 61%
away: none
send: 78 bpm (+8%)
series(10s from 21:02:00): 74 75 78 81 86 84 80 79 78
note: observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence
</bio_context>
```

## 6. 使用模式

| `mode` | 旧名 | 含义 |
|---|---|---|
| `backstage` | `author` | 数据只给作者（模型）调节写法，角色不知道 |
| `in-story` | `character` | 由首行 `perceiver` 指定的角色能感知读者的身体状态，用身体感受说出来，不说数字 |
| `device-aware` | — | 角色知道读者戴着设备，可以明说 |

模式由用户选择；角色卡可用 `data.extensions.tbc.mode_hint` 给出默认值。块内只记录，解释写在世界书或预设的思维链里。

## 7. 输出：让设备动起来

- 模型在回复里写 `<bio_act pattern="wave" intensity="0.4" ms="3000"/>`，生产者在**用户可见生成正常结束后**解析并调用 `tbc.actuate`；后台生成、中途停止的生成、旧回复都不执行。
- 执行器用 `tbc.registerActuator(id, caps, handler)` 登记；生产者把模式展开成强度帧交给执行器。
- 安全（必须）：默认关闭；用户强度上限；每个执行器的最小间隔；每条回复最多 3 个（可改，最多 5）；一键全停；页面关闭或断线即停；停止不经过模型判断。安全词是可选功能，默认关闭。
- 只读状态给角色助手、卡片脚本、美化用：`tbc.outputState()`（开关、强度上限、当前档位、执行器数）、`tbc.replyActs()`（最近的回复动作执行记录），以及对应事件 `bio:output-state`、`bio:reply-acts`；它们只能读这组公开接口，不得读某个实现的内部状态。
- Intiface Central / buttplug 适配说明见 v0.3 §5.6（v4 协议，服务器不支持时回退 v3）。
- **设备实测征集**：用 [`tools/device-test.html`](tools/device-test.html) 测你自己的设备（浏览器直连或 Intiface），按 [`docs/device-test-reports-zh.md`](docs/device-test-reports-zh.md) 提 PR 补充结果。

### 设备层与实现要求（v0.3 §5.2、§5.9、§5.10）

- **强度 0 = 停止**：驱动必须把 0 映射到设备的停止指令，不得把 0 夹到最低档。
- **保活**：部分设备的自动模式会在几秒后自行停止，执行器在能力里声明 `keepaliveMs`，由实现负责按需重发指令；帧结束或看门狗到期必须停止重发并发停止。
- **互斥组**：同一马达对应的多个输出互相顶掉时，执行器把它们标进同一个 `group`；同组同时只驱动一个，切换前先停另一个。
- **加热类输出**（`Temperature`）必须声明 `maxDurationMs` 并不得超过；多数设备本身没有断电保护。
- **有风险的输出要点名**：`Temperature`、`Estim`、`Spray` 不包含在缺省的 `output="*"` 范围内，模型必须显式写出这个输出类型才会执行，否则返回不支持。
- **强度帧的计时不能依赖页面计时器**：页面切到后台时浏览器会把计时器压到约每秒一次，帧会走样；实现应在 Worker（或同等不受节流的机制）里排帧。
- **MCP 桥**（非规范）：把设备接给 AI 客户端的 MCP 服务，写侧工具按 `actuate` / `stop` / `actuators` 命名，读侧复用生产者已有的数据、不另行轮询设备；全局停止必须能在 AI 会话之外触发；生理数据经 MCP 转发给第三方模型客户端后即离开原有隐私设定，需要在文档里写明。

## 8. 一致性与校验

| 路径 | 内容 |
|---|---|
| [`docs/conformance-zh.md`](docs/conformance-zh.md) | 规范用语、一致性角色（生产者 / 读者 / 执行器 / 解释层）、版本策略、行名与问题代码登记表 |
| [`schema/block.abnf`](schema/block.abnf) | 注入块语法 |
| [`schema/*.schema.json`](schema) | 聊天变量、卡片声明、诊断对象、触觉动作、执行器能力 |
| [`fixtures/`](fixtures) | 合规 / 不合规样例；`<bio_act/>` 解析样例 |
| [`tools/block.mjs`](tools/block.mjs)、[`tools/bio-act.mjs`](tools/bio-act.mjs) | 参考解析器（实现可直接用于一致性测试） |
| [`tools/validate.mjs`](tools/validate.mjs) | `npm test` 的入口 |

## 9. 实现

参考实现 [heartlink](https://github.com/kcgoofee-jpg/heartlink-extension) 已公开：一个 SillyTavern 扩展（AGPL-3.0），装好后是一个可拖动的悬浮窗，分两个标签页——健康设备（心率）与玩具。健康设备通过网页蓝牙标准心率服务直连；玩具支持连接 Intiface Central，或不装 Intiface、由浏览器直接连（测试阶段）。安装与使用步骤见该仓库自己的 README。

规范文本（本仓库）与参考实现是两个独立仓库、两份许可证：规范文本 CC BY 4.0，参考实现 AGPL-3.0。

## 10. 运行环境

| 环境 | 网页蓝牙直连 | 本机桥（WebSocket） |
|---|---|---|
| Windows / macOS / Linux 上的 Chrome、Edge | 支持 | 支持 |
| Android 上的 Chrome、Edge | 支持 | 支持 |
| iOS 浏览器、macOS Safari | 不支持 | 支持 |
| Android WebView 类浏览器 | 不支持 | 支持 |
| 局域网 http 访问的酒馆（非安全上下文） | 不支持 | 支持 |
| localhost 或 https | 支持 | 支持 |

宿主相关的实现约束（SillyTavern 事件、保存顺序、能力探测）见 v0.2 §7 与 [`docs/st-compat-audit-2026-09-zh.md`](docs/st-compat-audit-2026-09-zh.md)；设备对接见 [`docs/device-interface-zh.md`](docs/device-interface-zh.md)。

### 受支持的穿戴设备

信号源要求设备支持标准蓝牙心率服务（Heart Rate Service）。下表按各品牌官方资料整理：

| 支持情况 | 设备 |
|---|---|
| 支持 | WHOOP、华为、荣耀、佳明 Garmin、高驰 COROS、Polar |
| 部分支持 | 小米手环（Band 7 Pro 之前的型号）、部分 Amazfit、部分新款颂拓 Suunto、Fitbit Charge 6 / Pixel Watch 2 及以后 |
| 原生不支持 | Apple Watch、三星 Galaxy Watch、智能戒指（Oura、Galaxy Ring 等） |

目前只在 Chrome 里实测验证过 WHOOP，其余设备欢迎按 §7 的设备实测流程提交结果。

## 11. 相关项目

完整普查见 [`docs/landscape-zh.md`](docs/landscape-zh.md)。与本约定关系最近的：

| 项目 | 关系 |
|---|---|
| [buttplug / Intiface](https://buttplug.io) | 设备控制协议；TBC 的输出词汇与之同名，适配层直接使用 |
| [HZXXXC/sillytavern-heart-rate-hrv](https://github.com/HZXXXC/sillytavern-heart-rate-hrv) | 同样读蓝牙心率进酒馆；注入的是即时标签，TBC 注入的是分相位的原始记录 |
| [phantom-touch-bridge](https://github.com/mfsnlqy/phantom-touch-bridge) | 本机触觉桥，可选心率输入 |
| [dsh-toy](https://github.com/c3ll256/dsh-toy) | 输出侧的安全约束参考 |

截至 2026-09 未发现其他公开的"生理信号 → 提示词"约定。

## 12. 版本与贡献

- 版本策略：`0.x` 期间，新增行与属性必须向后兼容（读者忽略不认识的行）；改动已有行的格式要升次版本号并写进 [`CHANGELOG.md`](CHANGELOG.md)。
- 旧稿保留：[`docs/spec-zh.md`](docs/spec-zh.md)（v0.1）、[`docs/spec-v0.2.md`](docs/spec-v0.2.md)（英文，未完成）。
- 贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。样例中的数值、设备编号一律编造，不得包含真实序列号或个人数据。
</content>
</invoke>
