# Tavern Bio-Context（TBC）v0.3 草案

2026-09-17。相对 [v0.2](spec-v0.2-zh.md) 的增量，v0.2 未提到的规则全部照旧。规范用语、一致性角色、版本策略与登记表见 [conformance-zh.md](conformance-zh.md)；语法见 `schema/block.abnf`，样例与校验见 `fixtures/`、`tools/validate.mjs`。能力来源见 [extension-candidates-zh.md](extension-candidates-zh.md)。

## 0. 原则（v0.3 新增）

1. **TBC 是底层**：凡是设备、服务、导出能提供的量，都给出规范格式。用不用、注入不注入，由上层（生成器配置、角色卡、世界书、扩展、用户开关）决定。协议不因为"眼下没人用"而不定义。
2. **块里只放可观测记录**，不放结论（沿用 v0.2）。
3. **敏感分级**：每个段落带一个等级，实现必须按等级给默认值，用户可以逐段改。

| 等级 | 含义 | 默认 |
|---|---|---|
| L0 | 设备状态、会话内时序 | 注入 |
| L1 | 一般健康量（心率、睡眠、恢复、运动） | 注入 |
| L2 | 敏感量（身体测量、生理周期、行为日记） | **不注入、不写进聊天变量**，用户逐段显式开启 |

4. **缺什么就不写什么**：来源没有的字段整项省略，不写 `0`、不猜。
5. **每个非实时段落必须带来源和日期**（沿用 v0.2 `prior` 的规则）。

## 1. 数据分层

| 层 | 更新频率 | 块里的位置 | 例子 |
|---|---|---|---|
| 实时 | 秒级 | 相位行、`<kind>` 行 | 心率、RR、动作、戴上 / 摘下、双击 |
| 准实时 | 分钟级、有延迟 | `trend` 行 | 皮温、呼吸频率、姿势（来自手环历史记录） |
| 日级 | 每天 / 每晚 / 每次运动 | `prior`、`sleep`、`day`、`workout` 行 | 恢复、睡眠分期、负荷、最近运动 |
| 静态 / 敏感 | 很少变 | `body`、`cycle`、`journal` 行（L2） | 身高体重、周期、日记 |
| 设备状态 | 分钟级 | `sensor` 行、`device` 行 | 电量、佩戴、执行器状态 |

## 1.1 使用模式 `mode`（v0.3 改名 + 新增一档）

v0.2 的 `author` / `character` 容易被读成"谁在说话"，实际含义是"这份数据在故事里谁看得见"。v0.3 改成三档：

| 值 | 大白话 | 角色知道什么 | 允许的呈现 |
|---|---|---|---|
| `backstage`（旧 `author`） | 幕后 | 什么都不知道 | 只影响写法（详略、张力、钩子）；正文不提心率、设备、读者 |
| `in-story`（旧 `character`） | 入戏 | 能看见 {{user}} 的身体表现 | read / send 映射为可观察线索（呼吸、面色、手、声音、姿态）；不说数字、不提设备 |
| `device-aware`（新） | 角色知道设备 | 知道 {{user}} 戴着这台设备，能看到它的数据 | 可以引用数字和日级数据（"昨晚才睡 6.9 小时？"），可以用 §5 的 `<bio_act/>`；仍不替读者下结论、不臆断原因 |

读者必须把旧值当别名：`author` = `backstage`，`character` = `in-story`。实现写新值。

## 1.2 卡片声明 `data.extensions.tbc`（v0.3 新增）

卡（角色卡 / 场景卡）可以声明自己希望怎么使用 bio 数据。实现只读、不改卡。

```json
"extensions": {
  "tbc": {
    "mode_hint": "in-story",
    "perceiver": ["斯琪娅"]
  }
}
```

| 字段 | 取值 | 含义 |
|---|---|---|
| `mode_hint` | `backstage` / `in-story` / `device-aware`（旧值 `author` / `character` 也认） | 这张卡建议的默认模式。**只是默认值**：用户在该聊天里手动选过模式，一律以用户为准 |
| `min_spec` | `0.数字`（可选） | 这张卡需要的最低协议版本；实现低于它时应该在诊断里提示 |
| `perceiver` | 字符串或字符串数组，≤ 3 个，每个 ≤ 24 字 | `in-story` / `device-aware` 时，由谁在故事里察觉读者的身体状态。缺省 = 在场角色都可以 |

实现要求：

1. 换聊天时读取当前角色卡的声明；群聊不读。
2. 默认模式 = 用户在该聊天的选择 → 卡的 `mode_hint` → 实现默认（`backstage`）。实现的界面应能看出当前模式来自卡的建议。
3. 有 `perceiver` 且当前模式不是 `backstage` 时，首行加属性 `perceiver="斯琪娅"`（多个用 `、` 连接，去掉引号与尖括号）。它是元数据，不是结论。
4. 解释层（世界书等）看到 `perceiver` 时，只让这些角色表达察觉，其他在场角色照常行动、不评论读者身体。
5. 卡不应依赖某个实现的解释层条目名或标签名；需要读法时写“按注入块的读法”。

## 1.3 相位归属（v0.3 新增）

相位描述的是**不同时间段**，不是同一件事：

| 相位 | 对应的内容 |
|---|---|
| `gen`、`read`、`read-pos` | 读者等待和阅读**上一条回复**时的身体 |
| `write`、`send` | 读者写**这一条消息**时和发送那一刻的身体 |
| `away` | 上一条回复出完到这次发送之间的离开区间 |

规则：

1. 生产者**应该**在 `sent` 后输出固定行 `scope: gen, read = previous reply; write, send = this message`，让模型不用读说明也知道归属。
2. 解释层**不得**把 `read` 的峰值归到本轮新消息里发生的事件上；`read-pos` 是唯一可以把峰值对应到上一条回复具体位置的依据。
3. 与 `away` 重叠、带 `flag` 或 `cov` < 70% 的相位，解释层**不应**据此判断读者反应。
4. 没有基线（`baseline: n/a`）时，解释层**不得**做“比刚才 / 比平时快慢”的比较。

## 2. 块格式增量

新增行放在 v0.2 的 `send` 之后、`series` 之前（扩展区，顺序不限；`prior` 仍在 `baseline` 之后，见 v0.2）；`note` 之后可以有 `warn:` 行（生产者提示数据可能不完整）：

```
sleep(whoop-api, night of 09-16): 23:40–07:05 | in-bed 7.4 h | asleep 6.9 h | need 7.8 h | debt 0.9 h | deep 1.2 h | rem 1.6 h | light 4.1 h | awake 0.5 h | eff 91% | perf 84% | consistency 77% | disturbances 3 | resp 14.8 rpm
day(whoop-api, 09-16): strain 14.2 | stress 1.3/3 | kcal 2310 | steps 8120 | avg-hr 72 | max-hr 171
workout(whoop-api): 18:40–19:25 running 45m | avg-hr 152 | max-hr 178 | strain 12.1 | kcal 480 | zones 0:02 0:08 0:20 0:12 0:03 | dist 7.2 km
trend(whoop-strap, lag 15m): skin 33.6°C (+0.2 vs 1h) | resp 14.2 rpm | posture seated
wear(whoop-5.0, event): off 21:10:03–21:10:15 (read) | on
button(whoop-5.0, event): read @41s ×1 | write @3s ×2
motion(whoop-5.0, 1s): gen still 97% | read still 92% mean 0.03 g peak 0.41 g @55s | write still 71% peak 0.62 g
sensor(whoop-5.0): battery 78% | charging no | worn yes | signal ok
body(whoop-api, 09-01) [L2]: height 178 cm | weight 72.5 kg | hrmax 190
cycle(<source>, 09-17) [L2]: day 12 | phase follicular
journal(whoop-export, 09-16) [L2]: alcohol yes | caffeine-after-2pm no | screens-in-bed yes
```

### 2.1 各行规则

| 行 | 等级 | 规则 |
|---|---|---|
| `prior` | L1 | v0.2 原样保留；字段可增加 `sleep`、`strain`（兼容旧读者） |
| `sleep` | L1 | 最近一次主睡眠；`night of` 写入睡那天的日期。字段顺序固定，缺的省略。时间用本地时区 `HH:MM`。午睡另起一行 `sleep(…, nap 09-17 14:10)` |
| `day` | L1 | 上一个完整生理日（WHOOP 的 cycle）；进行中的当天写 `day(…, 09-17 so far)` |
| `workout` | L1 | 最近 ≤ 3 次，新的在前，每次一行；`zones` 为 1–5 区时长 `m:ss` |
| `trend` | L1 | 非实时量，必须写 `lag`；只给最近值和相对 1 小时前的变化 |
| `wear` | L0 | 本轮窗口内的摘下区间，标注落在哪个相位；摘下期间的心率不进相位统计，相位行的 `cov` 相应降低 |
| `button` | L0 | 读者在设备上的主动输入（手环双击、遥控按键）。`@41s` = 该相位开始后的秒数；只记录，不解释含义 |
| `motion` | L0 | 只给相位摘要：静止占比（\|a\|−1g < 0.05 g 的秒数占比）、均值、峰值及时刻；不给原始流 |
| `sensor` | L0 | 信号源设备自身状态；执行器状态仍走 `device:` |
| `body` / `cycle` / `journal` | L2 | 默认不出现；行尾必须带 `[L2]`，方便世界书和审查识别 |

### 2.2 相位行的小增量

相位行（`gen` / `read` / `write`）可追加 `| off-wrist 0:12`（该相位内摘下的时长）。

## 3. 聊天变量 `bio` 增量

```json
{
  "daily": {
    "prior":    { "source": "whoop-api", "date": "09-17", "fields": { … } },
    "sleep":    { "source": "whoop-api", "date": "09-16", "start": "23:40", "end": "07:05",
                  "fields": { "inBedH": 7.4, "asleepH": 6.9, "needH": 7.8, "debtH": 0.9, "deepH": 1.2, "remH": 1.6,
                              "lightH": 4.1, "awakeH": 0.5, "eff": 91, "perf": 84, "consistency": 77,
                              "disturbances": 3, "resp": 14.8 } },
    "day":      { "source": "whoop-api", "date": "09-16", "fields": { "strain": 14.2, "stress": 1.3, "kcal": 2310 } },
    "workouts": [ { "source": "whoop-api", "start": 1789560000000, "end": 1789562700000, "sport": "running",
                    "fields": { "avgHr": 152, "maxHr": 178, "strain": 12.1, "kcal": 480, "distKm": 7.2,
                                "zonesSec": [120, 480, 1200, 720, 180] } } ],
    "trend":    { "source": "whoop-strap", "lagMin": 15, "fields": { "skin": 33.6, "resp": 14.2, "posture": "seated" } }
  },
  "sensor": { "device": "whoop-5.0", "battery": 78, "charging": false, "worn": true },
  "sensitive": { "body": null, "cycle": null, "journal": null }
}
```

- `bio.prior` 保留（= `bio.daily.prior`），兼容 v0.2 的卡。
- `sensitive.*` 只有用户开启对应段落后才写入，否则为 `null`。
- 用途举例：人机恋卡的脚本读 `bio.daily.sleep.fields.asleepH`，让角色早上问"昨晚才睡了 6.9 小时？"。

## 4. 总线增量

```js
tbc.version                               // '0.3'
tbc.push(sample)                          // 新增 kind 见下
tbc.setDaily(section, data)               // section: 'prior' | 'sleep' | 'day' | 'workout' | 'trend' | 'body' | 'cycle' | 'journal'
tbc.getDaily(section?)
tbc.setPrior(p)                           // = setDaily('prior', p)，保留
tbc.getExposure() / tbc.setExposure({ sleep: true, body: false, … })   // 按段落开关；L2 默认 false
```

新增保留 kind：

| kind | value | 进块 | 说明 |
|---|---|---|---|
| `wear` | 1 戴上 / 0 摘下 | `wear` 行 | 事件型 |
| `button` | 按键编号，双击 = `1` | `button` 行 | 事件型，`cadence: 'event'` |
| `motion` | \|a\| − 1 g（g） | `motion` 行 | 秒级摘要值；可带 `axes: [x, y, z]` |
| `skin_temperature` | °C | `trend` 行 | 非实时时带 `lagMs` |
| `resp_rate` | 次/分 | `trend` 行 | 同上 |
| `posture` | `'lying' \| 'reclined' \| 'seated' \| 'upright'` | `trend` 行 | 字符串值 |
| `charging` | 1 / 0 | `sensor` 行 | |
| `ppg` | 原始光强 | **不进块** | 只在总线上流转，给想自己算指标的扩展 |

Sample 增加两个可选字段：`lagMs`（数据产生到到达的延迟）、`axes`。

### 4.2 诊断接口（v0.3 新增）

```js
tbc.diagnostics()        // → 对象，符合 schema/diagnostics.schema.json
tbc.on('bio:diagnostics', fn)   // problems 有变化时发出，detail 同上
```

- 生产者**必须**实现 `diagnostics()`；返回值**不得**含心率序列与设备序列号。
- `problems` 用登记过的代码（conformance-zh.md §4.4），每条带给用户的 `message` 与下一步 `hint`。
- 卡片、开场页、世界书脚本**应该**用它解释“为什么没联动”，而不是自己猜。

### 4.3 注入开关与隐私告知（v0.3 新增）

- 生产者**必须**提供关闭注入的开关（`tbc.setExposure({ inject: false })` 或自己的界面），关闭时 `diagnostics()` 报 `INJECTION_DISABLED`。
- 生产者**应该**在首次连接设备时告知：心率会随提示词发给用户配置的模型服务商。
- 只在用户可见生成时注入：后台生成（安静生成、变量更新、摘要等）**不得**带注入块；`diagnostics().injection.background_skipped` 记录跳过次数。

## 5. 输出接口（新增）：触觉 / 振动反馈

v0.2 只规定了执行器怎样**报告状态**（`registerContext`）和怎样**跟随读者**（订阅）。v0.3 增加一个统一的**触发接口**，让角色、卡片脚本、扩展能让设备动起来：手环振动、玩具（经 Intiface / buttplug）、其他执行器用同一套调用。参考实现：`tools/bio-act.mjs`；Schema：`schema/bio-act.schema.json`（动作）、`schema/actuator.schema.json`（能力）。

### 5.1 登记与触发

```js
tbc.registerActuator('whoop-5.0', {
  outputs: ['Vibrate'],                     // buttplug v4 OutputType（device-interface-zh.md §6）
  patterns: ['pulse', 'double', 'triple', 'long', 'heartbeat'],
  levels: false,                            // 能否按强度连续调节；手环为 false
  maxIntensity: 1,
  maxDurationMs: 3000,
  minIntervalMs: 10000,                     // 同一执行器两次触发的最小间隔；缺省 10000
  device: 'whoop-5.0',
  via: 'page',                              // page | bridge | intiface | other
}, handler);                                // handler(job) → Promise；job 见 5.2

const r = await tbc.actuate('*', { output: 'Vibrate', pattern: 'wave', intensity: 0.4, durationMs: 3000, reason: 'char-touch' }, { source: 'card-script' });
// r = { ok: true, results: [{ id, ok: true, clipped?: {...}, fallback?: 'pulse' }] }
//   | { ok: false, refused: 'disabled' | 'rate-limit' | 'quiet-hours' | 'not-worn' | 'sleeping' | 'unknown-target' | 'unsupported' }

tbc.stop();                                 // 全局停止；tbc.stop('whoop-5.0') 只停一个
tbc.actuators();                            // [{ id, ...caps, busy }]
tbc.unregisterActuator(id);
```

- `target` 可用 `'*'`：发给所有支持该 `output` 的执行器；每个执行器单独判断安全规则，结果逐个列出。
- `intensity` 0–1，缺省 0.5；超过执行器 `maxIntensity` 或用户上限时裁到上限，并在结果里写 `clipped`。
- `durationMs` 只对 `long` / `heartbeat` / `wave` 有意义；超过 `maxDurationMs` 时裁剪。
- `pattern` 是抽象名：`pulse`（轻点一下）、`double`、`triple`、`long`（持续）、`heartbeat`（像心跳，约 900 ms 一拍）、`wave`（由弱到强再回落）。执行器没有的模式退回 `pulse`，结果里写 `fallback`。
- 每次触发产生事件 `bio:actuate`，detail `{ t, target, action, results, source }`；实现把最近一次触发写进块：`device: whoop-5.0 vibrate double @read 41s (char-tap)`。

### 5.2 执行：强度帧

实现把模式展开成**帧** `[[毫秒偏移, 强度], …]`（最后一帧强度为 0），交给 `handler`：

```js
handler({ action, frames, deadline })   // deadline = 开始时间 + 帧长 + 余量；到点必须回到 0
```

- 能调强度的执行器（`levels: true`）按帧依次设定强度；只有开关或固定模式的执行器（手环）可以忽略帧，直接用 `action.pattern` 映射到设备自带模式。
- 帧的形状由参考实现 `patternFrames()` 规定，实现应与之一致（同样输入同样输出）。
- 实现自己也要有看门狗：`deadline` 过了执行器还没回 0，就发停止。

### 5.3 模型侧写法（可选约定）

回复里出现下面的标签时，由接入脚本在**用户可见生成结束后**解析并调用 `tbc.actuate`，显示前用正则隐藏标签：

```
<bio_act target="*" output="Vibrate" pattern="wave" intensity="0.4" ms="3000"/>
```

- 属性都可省略：`target` 缺省 `*`，`output` 缺省 `Vibrate`，`pattern` 缺省 `pulse`，`intensity` 缺省 0.5，`ms` 只对持续类模式有效。
- 每条回复最多 3 个，多出的丢弃；按出现顺序排队，同一执行器之间至少隔 `minIntervalMs`。
- 后台生成、被中途停止的生成、滑动到旧页，都不执行。
- `backstage` 时这是作者手段，角色不点破；`in-story` 时写成角色的动作（"轻轻点了点你的手腕"）；`device-aware` 时角色可以明说是自己让设备动的。是否在预设 / 世界书里教模型使用，由上层决定。

### 5.4 安全（在 device-interface-zh.md §7 之上）

1. **默认关闭**：用户显式开启"允许触发振动"后，`actuate` 才生效；否则返回 `refused: 'disabled'`。
2. **用户上限**：用户可设强度上限（建议缺省 0.6），实现不得超过。
3. **频率上限**：同一执行器两次触发间隔 ≥ 它的 `minIntervalMs`（手环缺省 10 秒）；单条回复 ≤ 3 次。
4. **勿扰**：尊重用户设置的勿扰时段；读者处于睡眠时拒绝（`sleeping`），除非用户单独允许。
5. **没戴不振**：可穿戴执行器在 `wear` 为摘下时返回 `not-worn`。
6. **全局停止**必须可一键触发；页面卸载、桥断线、Intiface 断线即停。
7. 模型可见文本里不出现设备序列号、令牌、Intiface 地址。

### 5.5 本机桥消息

```json
{ "cmd": "actuate", "target": "whoop-5.0", "action": { "output": "Vibrate", "pattern": "double" }, "frames": [[0, 1], [180, 0], [320, 1], [500, 0]], "source": "card-script" }
{ "cmd": "stop" }
{ "event": "bio:actuate", "detail": { "t": 1789600000000, "target": "whoop-5.0", "action": { … }, "results": [ { "id": "whoop-5.0", "ok": true } ] } }
{ "event": "bio:actuators", "detail": [ { "id": "whoop-5.0", "outputs": ["Vibrate"], "patterns": [ … ] } ] }
```

### 5.6 Intiface / buttplug 适配（非规范）

- 连接 Intiface Central 的 WebSocket（缺省 `ws://127.0.0.1:12345`），握手 `RequestServerInfo`（`ProtocolVersionMajor: 4`）；服务器不支持时退回 v3（`MessageVersion: 3`）。
- v4：每个带 `Output` 的设备特性登记为一个执行器，id 为 `intiface:<设备序号>:<特性序号>`；强度 × `Value` 上界取整后发 `OutputCmd`；停止用 `StopCmd`。收到新的 `DeviceList` 时对比增删。
- v3：`DeviceMessages.ScalarCmd` 的每一项登记为执行器；强度直接作 `Scalar` 发 `ScalarCmd`；停止用 `StopDeviceCmd` / `StopAllDevices`；监听 `DeviceAdded` / `DeviceRemoved`。
- `MaxPingTime` 大于 0 时按一半间隔发 `Ping`。
- Intiface 同一时间通常只接受一个客户端：用户已用别的酒馆 Intiface 插件时，二者只能开一个。

### 5.7 WHOOP 实现备注（非规范）

WHOOP 4.0：`RUN_HAPTICS_PATTERN`（0x4F）`[patternId, loops, 0, 0, 0]`。WHOOP 5.0 / MG：独立的 0x13 命令，体 `[0x01, 47, 152, 0×8, loops]`（来源：MIT 许可的 OpenStrap/protocol `cmdBuzzGen5Maverick`，本机未实测）。`pattern` 映射由实现决定。

## 6. 兼容

- v0.2 读者遇到不认识的行应忽略（v0.2 已要求）。
- `prior` 行与 `bio.prior` 保留；`setPrior` 保留。
- 首行 `v="0.3"`；用到本文件任一新增内容的生产者必须写 `v="0.3"`。
- `mode` 旧值 `author` / `character` 作为别名继续有效（§1.1）；卡片声明与首行 `perceiver` 属性是可选新增，旧读者忽略即可（§1.2）；世界书按 `mode="…"` 触发的条目要同时认新旧两个关键字。

## 7. 待定

- `trend` 的数据能否实时拿到，取决于 whoopdesk 的"只读不删"实测。
- 振动 pattern 的抽象名单：v0.3 已加 `wave`（第二类执行器：Intiface 玩具）；`sos` 等再有需要时定。
- `cycle` 的来源：WHOOP API 当前没有周期数据端点，先留格式。
