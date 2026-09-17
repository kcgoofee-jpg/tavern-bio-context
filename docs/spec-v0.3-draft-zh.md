# Tavern Bio-Context（TBC）v0.3 草案

2026-09-17。相对 [v0.2](spec-v0.2-zh.md) 的增量，v0.2 未提到的规则全部照旧。能力来源见 [extension-candidates-zh.md](extension-candidates-zh.md)。

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

## 2. 块格式增量

新增行的顺序（放在 v0.2 的 `send` 之后、`series` 之前）：

```
prior(whoop-api, 09-17): recovery 67 | hrv 69.6 ms | rhr 59 bpm | spo2 95.5% | skin 33.6°C
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

## 5. 输出接口（新增）：触觉 / 振动反馈

v0.2 只规定了执行器怎样**报告状态**（`registerContext`）和怎样**跟随读者**（订阅）。v0.3 增加一个统一的**触发接口**，让角色、卡片脚本、扩展能让设备动起来，第一个落地对象是手环振动。

### 5.1 登记与触发

```js
tbc.registerActuator('whoop-5.0', {
  outputs: ['Vibrate'],                     // buttplug v4 词汇（device-interface-zh.md §6）
  patterns: ['pulse', 'double', 'triple', 'long', 'heartbeat'],
  maxIntensity: 1,                          // 手环无强度调节时固定为 1
  maxDurationMs: 3000,
  device: 'whoop-5.0',
});

const r = await tbc.actuate('whoop-5.0', { output: 'Vibrate', pattern: 'double', reason: 'char-tap' });
// r = { ok: true } | { ok: false, refused: 'disabled' | 'rate-limit' | 'quiet-hours' | 'not-worn' | 'unknown-target' }
//   | { ok: true, clipped: { durationMs: 3000 } }

tbc.stop();                                 // 全局停止；tbc.stop('whoop-5.0') 只停一个
tbc.actuators();                            // 已登记的执行器及能力
```

- `target` 可用 `'*'`：发给所有支持该 `output` 的执行器。
- `pattern` 是抽象名，由实现映射到设备自己的振动模式；设备没有的 pattern 退回 `pulse` 并在结果里写 `fallback`。
- 每次触发产生事件 `bio:actuate`，detail `{ t, target, action, result, source }`；实现把最近一次触发写进块：`device: whoop-5.0 vibrate double @read 41s (char-tap)`。

### 5.2 模型侧写法（可选约定）

回复里出现下面的标签时，由接入脚本解析并调用 `tbc.actuate`，显示前用正则隐藏标签：

```
<bio_act target="whoop-5.0" output="Vibrate" pattern="double"/>
```

规则：每条回复最多 3 个；只在正文生成完成后执行；`backstage` 时这是作者手段，角色不点破；`in-story` 时写成角色的动作（"轻轻点了点你的手腕"）；`device-aware` 时角色可以明说是自己让手环震的。是否在预设 / 世界书里教模型使用，由上层决定。

### 5.3 安全（在 device-interface-zh.md §7 之上）

1. **默认关闭**：用户显式开启"允许触发振动"后，`actuate` 才生效；否则返回 `refused: 'disabled'`。
2. **频率上限**：同一目标两次触发间隔 ≥ 10 秒；单轮回复 ≤ 3 次。
3. **勿扰**：尊重用户设置的勿扰时段；读者处于睡眠（`sleep` 进行中）时拒绝，除非用户单独允许。
4. **没戴不振**：`wear` 为摘下时返回 `refused: 'not-worn'`。
5. **全局停止**必须可一键触发；页面卸载 / 桥断线即停。
6. 模型可见文本里不出现设备序列号、令牌。

### 5.4 本机桥消息

```json
{ "cmd": "actuate", "target": "whoop-5.0", "action": { "output": "Vibrate", "pattern": "double" }, "source": "card-script" }
{ "cmd": "stop" }
{ "event": "bio:actuate", "detail": { "t": 1789600000000, "target": "whoop-5.0", "action": { … }, "result": { "ok": true } } }
{ "event": "bio:actuators", "detail": [ { "id": "whoop-5.0", "outputs": ["Vibrate"], "patterns": [ … ] } ] }
```

### 5.5 WHOOP 实现备注（非规范）

WHOOP 4.0：`RUN_HAPTICS_PATTERN`（0x4F）`[patternId, loops, 0, 0, 0]`。WHOOP 5.0 / MG：独立的 0x13 命令，体 `[0x01, 47, 152, 0×8, loops]`（来源：MIT 许可的 OpenStrap/protocol `cmdBuzzGen5Maverick`，本机未实测）。`pattern` 映射由实现决定。

## 6. 兼容

- v0.2 读者遇到不认识的行应忽略（v0.2 已要求）。
- `prior` 行与 `bio.prior` 保留；`setPrior` 保留。
- 首行 `v="0.3"`。
- `mode` 旧值 `author` / `character` 作为别名继续有效（§1.1）；世界书按 `mode="…"` 触发的条目要同时认新旧两个关键字。

## 7. 待定

- `trend` 的数据能否实时拿到，取决于 whoopdesk 的"只读不删"实测。
- 振动 pattern 的抽象名单是否再扩（如 `ramp`、`sos`），等第二个执行器接入时定。
- `cycle` 的来源：WHOOP API 当前没有周期数据端点，先留格式。
