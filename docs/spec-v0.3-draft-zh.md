# Tavern Bio-Context（TBC）v0.3 定稿候选

2026-09-17 起草，2026-09-18 并入相位法审查的定稿项。相对 [v0.2](spec-v0.2-zh.md) 的增量；v0.2 未提到的规则全部照旧。规范用语、一致性角色、版本策略与登记表见 [conformance-zh.md](conformance-zh.md)；语法见 `schema/block.abnf`，样例与校验见 `fixtures/`、`tools/validate.mjs`。能力来源见 [extension-candidates-zh.md](extension-candidates-zh.md)。会改变数据含义的改动（流式、滞后、基线年龄、派生事实等）放在 [v0.4 草案](spec-v0.4-draft-zh.md)。

生理学依据见附录 B。标注：**有依据** = 一手研究或学会指南直接支持；**经验值** = 方向有依据，具体数字是本规范选的，要实测校准；**未核实** = 没有找到依据。

## 0. 原则（v0.3 新增）

1. **TBC 是底层**：凡是设备、服务、导出能提供的量，都给出规范格式。用不用、注入不注入，由上层（生成器配置、角色卡、世界书、扩展、用户开关）决定。协议不因为"眼下没人用"而不定义。
2. **生产者只记录，不下结论**（沿用 v0.2）。块里只放可观测记录。模型算不出来的量可以由生产者算好写进块，但只能是**带自身定义的中性事实**（阈值写在段里），不能是"紧张""兴奋"这类结论。
3. **解释归用户自己的模型**：怎么理解这些数、要不要让设备动，由用户配置的模型、预设、世界书决定。本规范给的读法（§1.6）只是参考。
4. **敏感分级**：每个段落带一个等级，实现必须按等级给默认值，用户可以逐段改。

| 等级 | 含义 | 默认 |
|---|---|---|
| L0 | 设备状态、会话内时序 | 注入 |
| L1 | 一般健康量（心率、睡眠、恢复、运动） | 注入 |
| L2 | 敏感量（身体测量、生理周期、行为日记） | **不注入、不写进聊天变量**，用户逐段显式开启 |

5. **缺什么就不写什么**：来源没有的字段整项省略，不写 `0`、不猜。
6. **每个非实时段落必须带来源和日期**（沿用 v0.2 `prior` 的规则）。

## 1. 数据分层

| 层 | 更新频率 | 块里的位置 | 例子 |
|---|---|---|---|
| 实时 | 秒级 | 相位行、`<kind>` 行 | 心率、RR、动作、戴上 / 摘下、双击 |
| 准实时 | 分钟级、有延迟 | `trend` 行 | 皮温、呼吸频率、姿势（来自手环历史记录） |
| 日级 | 每天 / 每晚 / 每次运动 | `prior`、`sleep`、`day`、`workout` 行 | 恢复、睡眠分期、负荷、最近运动 |
| 静态 / 敏感 | 很少变 | `body`、`cycle`、`journal` 行（L2） | 身高体重、周期、日记 |
| 设备状态 | 分钟级 | `sensor` 行、`device` 行 | 电量、佩戴、执行器状态 |

## 1.1 使用模式：`mode` 与 `view`

v0.2 的 `author` / `character` 容易被读成"谁在说话"，实际含义是"这份数据在故事里谁看得见"。v0.3 给出三档新名，写在新属性 `view` 里；`mode` 在 0.x 期间继续写旧值，已发布的 v0.2 世界书不会失效。

| `view` | 同时写的 `mode` | 大白话 | 角色知道什么 | 允许的呈现 |
|---|---|---|---|---|
| `backstage` | `author` | 幕后 | 什么都不知道 | 只影响写法（详略、张力、钩子）；正文不提心率、设备、读者 |
| `in-story` | `character` | 入戏 | 能看见 {{user}} 的身体表现 | read / send 映射为可观察线索（呼吸、面色、手、声音、姿态）；不说数字、不提设备 |
| `device-aware` | `character` | 角色知道设备 | 知道 {{user}} 戴着这台设备，能看到它的数据 | 可以引用数字和日级数据（"昨晚才睡 6.9 小时？"），可以用 §5 的 `<bio_act/>`；仍不替读者下结论、不臆断原因 |

```
<bio_context v="0.3" mode="author" view="backstage" …>
<bio_context v="0.3" mode="character" view="in-story" …>
<bio_context v="0.3" mode="character" view="device-aware" …>
```

规则：

1. 0.x 期间，生产者的 `mode` **只能**写 `author` 或 `character`；`view` **应该**同时写。两者都有时必须按上表对应。
2. 读者两者都有时**必须**以 `view` 为准；只有 `mode` 时按 `author` = `backstage`、`character` = `in-story` 理解。读者**应该**也接受 `mode` 里出现新名（v0.3 草案期间有生产者这样写过）。
3. `device-aware` 的 `mode` 写 `character`：只认 `mode` 的旧读者会按"入戏"处理，只会少用数字，不会越界。
4. 聊天变量 `bio`、事件 `bio:inject` 的 `mode` 字段同样处理：`mode` 写旧值，另加 `view`。任何对外字段里**不得**出现实现内部的名字（例如 `aware`）。卡片声明 `mode_hint` 仍接受新旧两种值。
5. 1.0 时 `mode` 改用新值，`view` 作为别名保留一个小版本。

## 1.2 卡片声明 `data.extensions.tbc`（v0.3 新增）

卡（角色卡 / 场景卡）可以声明自己希望怎么使用 bio 数据。实现只读、不改卡。

```json
"extensions": {
  "tbc": {
    "mode_hint": "in-story",
    "perceiver": ["艾拉"]
  }
}
```

| 字段 | 取值 | 含义 |
|---|---|---|
| `mode_hint` | `backstage` / `in-story` / `device-aware`（旧值 `author` / `character` 也认） | 这张卡建议的默认模式。**只是默认值**：用户在该聊天里手动选过模式，一律以用户为准 |
| `min_spec` | `0.数字`（可选） | 这张卡需要的最低协议版本；实现低于它时应该在诊断里提示。版本按 §4.6 的规则比较 |
| `perceiver` | 字符串或字符串数组，≤ 3 个，每个 ≤ 24 字 | `in-story` / `device-aware` 时，由谁在故事里察觉读者的身体状态。缺省 = 在场角色都可以 |

实现要求：

1. 换聊天时读取当前角色卡的声明；群聊不读。
2. 默认模式 = 用户在该聊天的选择 → 卡的 `mode_hint` → 实现默认（`backstage`）。实现的界面应能看出当前模式来自卡的建议。
3. 有 `perceiver` 且当前模式不是 `backstage` 时，首行加属性 `perceiver="艾拉"`（多个用 `、` 连接）。每个名字按 §4.4 的自由文本规则清洗，并去掉 `"` 与 `、`。它是元数据，不是结论。
4. 解释层（世界书等）看到 `perceiver` 时，只让这些角色表达察觉，其他在场角色照常行动、不评论读者身体。
5. 卡不应依赖某个实现的解释层条目名或标签名；需要读法时写“按注入块的读法”。

## 1.3 相位归属与 `scope` 行

相位描述的是**不同时间段**，不是同一件事：

| 相位 | 对应的内容 |
|---|---|
| `gen`、`read`、`read-pos` | 读者等待和阅读**上一条回复**时的身体 |
| `write`、`send` | 读者写**这一条消息**时和发送那一刻的身体 |
| `away` | 上一条回复出完到这次发送之间的离开区间 |

生产者**应该**在 `sent` 后输出 `scope` 行，按首行 `trigger` 从下表选一句，让模型不用读说明也知道这份数据说的是哪条回复：

| 情况 | `scope` 行 | 其他规则 |
|---|---|---|
| `trigger="normal"` | `scope: gen, read = previous reply; write, send = this message` | — |
| `trigger="swipe"` / `"regenerate"` | `scope: gen, read = discarded reply (not in context); no new message` | 必须写 `write: n/a (no new message)`、`send: n/a (no new message)`；不得输出 `read-pos`。swipe 时 `read` = 旧回复出完到换页的时间 |
| `trigger="continue"` | `scope: replay of block composed at HH:MM:SS; continuing previous reply` | 首行必须加 `replay="continue"`；其余行原样重放，不重算 |
| `trigger="impersonate"` | `scope: gen, read = previous reply; no reader message yet` | 必须写 `write: n/a (impersonate)`；生产者忽略冒名生成期间的输入框事件 |
| 群聊第 2 个及之后的成员 | 与第 1 个成员相同的块 | 首行加 `replay="group"`；生产者**不得**为同一次用户发送重新计算相位 |

规则：

1. 首行新增属性 `replay="continue|group"`，表示这个块是重放。
2. 生产者**必须**保证同一次用户发送（同一个 `sent`）只生成一次块；宿主的多个注入入口拿到的是同一份文本。
3. 哪些宿主生成算"开新一轮"，见附录 A。
4. 解释层**不得**把 `read` 的峰值归到本轮新消息里发生的事件上；`read-pos` 是唯一可以把峰值对应到上一条回复具体位置的依据。
5. 与 `away` 重叠、带 `flag` 或 `cov` 低于门槛（缺省 70%，是设置项，**未核实**）的相位，解释层**不应**据此判断读者反应。
6. 没有基线（`baseline: n/a`）时，解释层**不得**做“比刚才 / 比平时快慢”的比较。
7. 打字打到一半又全部删掉的段落不算 `write` 的起点：发送框删空（长度回到 0）之前的打字作废，`write` 从最后一段没被删空的打字开始；删空之后到再次打字之间仍算 `read`；发送时输入框是空的则没有 `write` 相位（写 `write: n/a`，`read` 算到发送）。

## 1.4 只减少输出的生产者规则（峰值、HRV）

以下规则不改语法，只让 `peak`、`hrv`、`read-pos` 在数据不够时不出现。

**峰值 `peak`**（**必须**）：

1. 参考值 `ref` = 本相位前 10 秒样本的中位数（相位不足 10 秒时取全部）。
2. 平滑：峰值用 5 秒**居中**中位数平滑后的值。块是事后生成的，可以用居中窗口；只看过去的窗口会额外多出约 2.5 秒延迟（**经验值**）。
3. 门槛 = `max(5 bpm, 2 × noise)`；设备是腕式光电时，绝对下限取 `max(6 bpm, 基线 × 7%)`。只有平滑后的最大值 ≥ `ref + 门槛`，并且连续 ≥ 3 个样本、跨度 ≥ 3 秒都达到这个值时，**才可以**输出 `peak`。方向**有依据**（个体噪声差异大，腕式日常误差约 5–7%，认知负荷本身带来约 3–7% 的变化）；5 bpm、2 倍、6 bpm、7% 都是**经验值**，做成有缺省值的设置。
4. `noise` = 基线窗口的稳健标准差（1.4826 × MAD）；基线不可用时取本相位前 10 秒的稳健标准差；两者都没有时不输出 peak。v0.3 里 `noise` 只在生产者内部使用，v0.4 起写进基线行。
5. `peak` 是平滑值，**必须**落在区间 `[min–max]` 内（区间是本相位全部样本的最小值和最大值）。v0.2 §2.2 示例 `[70–78] peak 83` 是笔误，应为 `hr 75→78 [70–83] peak 83 @32s`。
6. 以下情况**不得**输出 peak：相位短于 10 秒（v0.4 起为 `max(10 s, 2 × lag)`；潜伏期加设备延迟就有 3–6 秒，**经验值**）；相位样本 < 10；`cov` < 70%；稀疏来源（§2.8）；相位与 `away` 或摘下重叠超过一半。
7. 不输出 peak 时，**不得**输出 `read-pos`。
8. 峰值只说明“最高值出现的时刻”，不说明正负或喜好（见 §1.6）。

**HRV `hrv` 段**（**必须**，**有依据**）：

1. `rr-loss` 定义为：该相位应有的心拍间期里，缺失、被剔除或被插值的比例。`rr-loss` > 5% 时不得输出 `hrv`（依据：Munoz 2015 的 5% 门槛；单个错误心拍就能明显改变 HRV，Shaffer 2020）。
2. 相位短于 30 秒时不得输出 `hrv`；平均心率低于 60 bpm（心拍间期 > 1000 ms）时，下限是 60 秒（依据：SPR 2024 的高频段最短时长；Munoz 2015 的 30 秒一致性 r = 0.93）。
3. `write` 相位在打字，**不应**输出 `hrv`；腕式光电只在 `rr-loss` 低、手不动的相位输出 `hrv`（依据：SPR 2024 关于说话、体位、默念的要求；Schäfer & Vagedes 2013 关于光电脉率变异在活动中失效）。
4. 基线的 `hrv` 与相位的 `hrv` 窗口长度不同，不能直接比大小（依据：Shaffer & Ginsberg 2017）。读法里要写明这一点。

**心率来源**（**应该**）：设备同时给出逐拍 RR 时，生产者应该用 RR 自己算逐秒心率（按 SPR 2024 的逐秒加权法），不用设备给的 bpm；设备自带的滤波会带来 1–3 秒延迟并削平峰值（依据：Physiol Meas 2025 台架测试）。v0.3 里这只影响数值精度，不改任何行的含义。

## 1.5 基线方法登记

`baseline` 行括号里的方法名从 v0.3 起按下表登记。缺省优先级：`manual`（24 小时内、同一设备）→ `rest` → `rolling-low` → `prior-rhr`，用户可以改顺序。

| 方法 | 含义 | 规则 |
|---|---|---|
| `manual` | 用户主动做的基线测量 | 生产者**应该**先提示“坐好，不说话，不打字，自然呼吸”，丢弃前 60 秒，再取 120 秒（**有依据**：Laborde 2017 要求先在该体位稳定下来；Munoz 2015 说明 120 秒对 RMSSD 足够）。完整 5 分钟可以作为选项。超过 24 小时或换了设备，生产者**应该**降到下一优先级，并在 `warn:` 行说明 |
| `rest` | 会话里的安静段中位数 | 样本**不得**包含 `gen`、`read`、`away` 区间和打字时段。它**不是**医学意义上的静息心率（SPR 2024 的静息要求静坐、不说话、不动），读法里不得这样称呼 |
| `rolling-low` | 较长窗口（例如 2 小时）内每分钟中位数的低分位 | 总有值，但会随全天状态漂移；用分位数做基线**没有找到文献依据**（**未核实**） |
| `prior-rhr` | 日级数据里的静息心率（`prior` 行的 `rhr`） | 来自设备或服务的夜间 / 全天统计；可能过期 |
| `quiet-median` | 已弃用，等同 `rest` | 读者按“自动”理解；v0.3 生产者**应该**改写新名，v0.4 起**不得**输出 |
| `p20` | 已弃用，等同 `rolling-low` | 同上 |

- 最近几轮换过方法时，生产者**应该**在 `warn:` 行说明（v0.4 起写进基线行的 `changed` 段）。
- 聊天变量 `bio.baseline` 保持数字。

## 1.6 解释层读法（非规范，给世界书 / 预设作者）

本节是参考措辞，不约束生产者。依据见附录 B。

1. **心率跟着唤起和注意走，不跟着好恶走**（**有依据**：Bradley 2001；Siegel 2018 的 202 项研究 meta 分析）。读法只说“快 / 慢 / 升 / 降 / 起伏大小 / 时刻”，不说情绪类别和喜恶；`peak` 写成“最高值出现的时刻”，不写成“最激动的地方”。
2. **心率升高可能来自很多原因**：打字、换姿势、说话、咖啡，也可能来自紧张、兴奋或性唤起，块本身不能区分（**有依据**：SPR 2024）。有 `rr-loss` 升高、`away`、长时间打字时，不据此判断。
3. **心率降低也可能是专注**：读到新奇内容时，朝向反应的主要表现是心率减速，不能直接读成“平静 / 无感”（**有依据**：Bradley 2009）。
4. **长会话里反应变小**，可能是习惯化，不能直接说明“不投入”（**有依据**：Bradley, Lang & Cuthbert 1993；Bradley 2009）。
5. **高潮样峰值之后 10–20 分钟**，心率偏高是正常恢复，这段时间的比较不可靠（**有依据**：Xue-Rui 2008）。
6. **不要只凭心率推断**：情绪类别、喜欢或厌恶、是否“真的”被打动、性唤起程度、是否达到高潮、健康状况或疾病。
7. 门槛都是设置：v0.2 §2.5 的“10% 以内是噪声”“持续高 20% 以上”、`cov` 70% 都是有缺省值的设置，不是文献结论。v0.2 §2.3 对 70% 的出处引用有误，作废（没有找到文献依据，**未核实**）。只算测量误差，腕式在日常条件下就有约 5–7%，所以 10% 作为腕式的粗略下限大致说得通，对胸带偏宽（**经验值**）。v0.4 起改用基线行的 `noise`。

## 2. 块格式增量

新增行放在 v0.2 的 `send` 之后、`series` 之前（扩展区，顺序不限；`prior` 仍在 `baseline` 之后，见 v0.2）；`note` 之后可以有 `warn:` 行（生产者提示数据可能不完整）：

```
sleep(whoop-api, night of 2026-09-16): 23:40–07:05 | in-bed 7.4 h | asleep 6.9 h | need 7.8 h | debt 0.9 h | deep 1.2 h | rem 1.6 h | light 4.1 h | awake 0.5 h | eff 91% | perf 84% | consistency 77% | disturbances 3 | resp 14.8 rpm
day(whoop-api, 2026-09-16): strain 14.2 | stress 1.3/3 | kcal 2310 | steps 8120 | avg-hr 72 | max-hr 171
workout(whoop-api): 18:40–19:25 running 45m | avg-hr 152 | max-hr 178 | strain 12.1 | kcal 480 | zones 0:02 0:08 0:20 0:12 0:03 | dist 7.2 km
trend(whoop-strap, lag 15m): skin 33.6°C (+0.2 vs 1h) | resp 14.2 rpm | posture seated
wear(whoop-5.0, event): off 21:10:03–21:10:15 (read) | on
button(whoop-5.0, event): read @41s ×1 | write @3s ×2
motion(whoop-5.0, 1s): gen still 97% | read still 92% mean 0.03 g peak 0.41 g @55s | write still 71% peak 0.62 g
sensor(whoop-5.0): battery 78% | charging no | worn yes | signal ok
body(whoop-api, 2026-09-01) [L2]: height 178 cm | weight 72.5 kg | hrmax 190
cycle(manual, 2026-09-17) [L2]: day 12 | phase follicular
journal(whoop-export, 2026-09-16) [L2]: alcohol yes | caffeine-after-2pm no | screens-in-bed yes
```

### 2.1 各行规则

| 行 | 等级 | 规则 |
|---|---|---|
| `prior` | L1 | v0.2 原样保留；字段可增加 `sleep`、`strain`（兼容旧读者）；日期写 `YYYY-MM-DD` |
| `sleep` | L1 | 最近一次主睡眠；`night of` 写入睡那天的日期。字段顺序固定，缺的省略。时间用本地时区 `HH:MM`。午睡另起一行 `sleep(…, nap 2026-09-17 14:10)` |
| `day` | L1 | 上一个完整生理日（WHOOP 的 cycle）；进行中的当天写 `day(…, 2026-09-17 so far)` |
| `workout` | L1 | 最近 ≤ 3 次，新的在前，每次一行；`zones` 为 1–5 区时长 `m:ss` |
| `trend` | L1 | 非实时量，必须写 `lag`；只给最近值和相对 1 小时前的变化 |
| `wear` | L0 | 本轮窗口内的摘下区间，标注落在哪个相位；摘下期间的心率不进相位统计，相位行的 `cov` 相应降低 |
| `button` | L0 | 读者在设备上的主动输入（手环双击、遥控按键）。`@41s` = 该相位开始后的秒数；只记录，不解释含义 |
| `motion` | L0 | 只给相位摘要：静止占比（\|a\|−1g < 0.05 g 的秒数占比）、均值、峰值及时刻；不给原始流 |
| `sensor` | L0 | 信号源设备自身状态；执行器状态仍走 `device:` |
| `body` / `cycle` / `journal` | L2 | 默认不出现；行尾必须带 `[L2]`，方便世界书和审查识别 |

日级行（`prior`、`sleep`、`day`、`body`、`cycle`、`journal`）括号里的日期写 `YYYY-MM-DD`。v0.2 的 `MM-DD` 是已弃用写法，读者仍接受，生产者不应再写。

### 2.2 相位行的小增量

- 相位行（`gen` / `read` / `write`）可追加 `| off-wrist 0:12`（该相位内摘下的时长）。
- 心率段没有样本时，`hr n/a`、`hr n/a (原因)`、`n/a (原因)` 三种写法都合法（修正 v0.2 语法与参考实现不一致的问题）。
- `flag:` 段登记值：`too-long`（v0.2）、`hr-high`（§5.4-10）。读者忽略不认识的 flag 值。

### 2.3 宽松解析与固定区冻结

通用行语法（`schema/block.abnf` 第 1 部分）：

```
block      = header LF *( line LF ) "</bio_context>"
line       = name [ "(" meta ")" ] [ " [L2]" ] ": " body
name       = LCALPHA *( LCALPHA / DIGIT / "-" / "_" )
meta       = 1*( %x20-27 / %x2A-3B / %x3D / %x3F-7E / UTF8-NONASCII )   ; 不含 ( ) < >
body       = 1*( %x20-3B / %x3D / %x3F-7E / UTF8-NONASCII )             ; 不含 < > 与换行
```

1. 读者**必须**按行名取值，**不得**因为行的顺序、未知行、已知行里的未知 ` | ` 段而拒收整块。
2. 已知行的主体之后可以有任意个 ` | <段>`；读者忽略不认识的段。这条对所有已知行都适用，包括 `baseline`、`history`、`send`。
3. 生产者**应该**按登记顺序输出。**固定区从 v0.3 起冻结**：以后新增的行一律进扩展区。
4. `read-pos` 的阅读速度可以带一位小数（`@6.5 cps`），生产者**应该**取整。
5. 参考校验器 `tools/validate.mjs` 分两档：
   - 生产者档（缺省）：已知行按登记语法和顺序检查，不符合就报错；未知行、未知段、未登记属性只给警告。
   - 读者档（`--reader`）：只把首行、闭合标签、通用行语法、单块完整性（§2.5）当错误，其余全部是警告。
6. 已知段写错（例如 `cov high`）在生产者档是错误；不认识的段（例如 `x_lux 120`）只是警告。

### 2.4 首行新增属性

| 属性 | 取值 | 含义 |
|---|---|---|
| `view` | `backstage` / `in-story` / `device-aware` | 见 §1.1 |
| `replay` | `continue` / `group` | 见 §1.3 |
| `date` | `YYYY-MM-DD` | `sent` 所在的本地日期 |
| `tz` | `+HH:MM` / `-HH:MM` | `sent` 所在时区的 UTC 偏移 |

- 首行属性值**不得**含 `"`、`<`、`>` 与换行；不合法时生产者删掉该属性（不是转义）。
- 自定义属性用 `x_` 前缀；读者忽略未登记的属性。
- 跨午夜时，块里的 `HH:MM:SS`（`away`、`series` 等）一律按“不晚于 `sent`”理解。

### 2.5 单块保证与最小块

- 注入前，生产者**必须**检查自己生成的文本恰好含一个 `<bio_context` 和一个 `</bio_context>`，并且能通过读者档校验。
- 不通过时**不得**注入原文，改为注入下面的最小块，并在诊断里记 `BLOCK_INVALID`：

```
<bio_context v="0.3" mode="author" view="backstage" source="heartlink" date="2026-09-17" tz="+08:00">
sent: 21:30:00
note: observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence
warn: block-invalid
</bio_context>
```

- 一次提示词里最多一个 `<bio_context>`（与 §4.6 配合）。
- 所有来自总线的字符串先按 §4.4 校验或清洗，再写进块。
- 块在提示词里的位置由宿主和预设决定：深度 0 是相对聊天记录而言的，预设在聊天记录后面追加的提示词会把块推到离末尾十几条的位置；宿主把 system 消息改成 user 或合并消息时，块会并进别的消息里（2026-09-18 实测，标签边界都保持完整）。所以读者**必须**只依靠块自身的 `<bio_context …>` / `</bio_context>` 边界，**不得**假定它是一条单独的 system 消息。

### 2.6 设备名与序列号

- `device` 属性取值 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`，长度 ≤ 32。
- 来源顺序：生产者自己的型号表 → 蓝牙 Device Information Service 的 Model Number（0x2A24，清洗后仍须满足上一条）→ 不输出 `device`。**不得**直接用蓝牙广播名。
- 校验器报 `PRIVACY_SERIAL` 的情况：出现连续 ≥ 6 位数字；按 `.` `-` 切分后，有长度 ≥ 6、至少含一个数字的纯十六进制段；原值里有 `:` 或 `_`（像蓝牙地址或原始广播名）。
- 同一套数字和十六进制规则适用于 `sensor(...)`、`wear(...)`、`button(...)`、`motion(...)`、`<kind>(...)` 括号里的名字，以及执行器 id（执行器 id 可以含 `:`，如 `intiface:0:1`）。
- 已有的合规值（`whoop-5.0`、`polar-h10`）不受影响。

### 2.7 世界书扫描

v0.2 §2 的“参与世界书扫描”改为：块**可以**参与世界书扫描，由用户开关，缺省仍开。关闭时，解释层必须不依赖关键字触发（改用常驻条目）。

块里的 `read`、`write`、`history`、`device` 等常见英文词会误触发卡里没开整词匹配的条目。生产者**应该**检查当前启用的世界书里有没有与块中词相同、没开整词匹配的关键字，有就在诊断里报 `SCAN_COLLISION`。v0.4 计划把缺省改为关闭。

### 2.8 稀疏来源

`cadence ≥ 30s` 的来源（v0.2 §2.6）：

- 不输出 `series`、`hrv`、`peak`、`read-pos`；
- 相位样本 < 5 时写 `n/a (sparse)`；
- `cov` 照常输出。

## 3. 聊天变量 `bio` 增量

```json
{
  "mode": "character",
  "view": "device-aware",
  "daily": {
    "prior":    { "source": "whoop-api", "date": "2026-09-17", "fields": { … } },
    "sleep":    { "source": "whoop-api", "date": "2026-09-16", "start": "23:40", "end": "07:05",
                  "fields": { "inBedH": 7.4, "asleepH": 6.9, "needH": 7.8, "debtH": 0.9, "deepH": 1.2, "remH": 1.6,
                              "lightH": 4.1, "awakeH": 0.5, "eff": 91, "perf": 84, "consistency": 77,
                              "disturbances": 3, "resp": 14.8 } },
    "day":      { "source": "whoop-api", "date": "2026-09-16", "fields": { "strain": 14.2, "stress": 1.3, "kcal": 2310 } },
    "workouts": [ { "source": "whoop-api", "start": 1789560000000, "end": 1789562700000, "sport": "running",
                    "fields": { "avgHr": 152, "maxHr": 178, "strain": 12.1, "kcal": 480, "distKm": 7.2,
                                "zonesSec": [120, 480, 1200, 720, 180] } } ],
    "trend":    { "source": "whoop-strap", "lagMin": 15, "fields": { "skin": 33.6, "resp": 14.2, "posture": "seated" } }
  },
  "sensor": { "device": "whoop-5.0", "battery": 78, "charging": false, "worn": true },
  "sensitive": { "body": null, "cycle": null, "journal": null }
}
```

- `mode` 只写 `author` / `character`，`view` 写新名（§1.1）。
- `bio.prior` 保留（= `bio.daily.prior`），兼容 v0.2 的卡。
- `sensitive.*` 只有用户开启对应段落后才写入，否则为 `null`。
- 用途举例：人机恋卡的脚本读 `bio.daily.sleep.fields.asleepH`，让角色早上问"昨晚才睡了 6.9 小时？"。

## 4. 总线增量

```js
tbc.version                               // '0.3'
tbc.push(sample)                          // 新增 kind 见下；不合法时返回 false（§4.4）
tbc.setDaily(section, data)               // section: 'prior' | 'sleep' | 'day' | 'workout' | 'trend' | 'body' | 'cycle' | 'journal'；不合法时返回 false
tbc.getDaily(section?)
tbc.setPrior(p)                           // = setDaily('prior', p)，保留
tbc.getExposure() / tbc.setExposure({ sleep: true, body: false, … })   // 按段落开关；L2 默认 false
tbc.claimProducer(info) / tbc.releaseProducer(id) / tbc.producer()      // §4.6
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

Sample 增加三个可选字段：`lagMs`（数据产生到到达的延迟）、`axes`、`transport`（`ble` / `bridge` / `push` / `api` / `bus`，同首行属性）。

不进块的 kind：`ppg`，以及所有未登记且不带 `x_` 前缀的 kind（它们可以在总线上流转）。

### 4.2 诊断接口（v0.3 新增）

```js
tbc.diagnostics()        // → 对象，符合 schema/diagnostics.schema.json
tbc.on('bio:diagnostics', fn)   // problems 有变化时发出，detail 同上
```

- 生产者**必须**实现 `diagnostics()`；返回值**不得**含心率序列、设备序列号与令牌。
- `problems` 用登记过的代码（conformance-zh.md §4.4），每条带给用户的 `message` 与下一步 `hint`。
- 卡片、开场页、世界书脚本**应该**用它解释“为什么没联动”，而不是自己猜。

### 4.3 注入开关与隐私告知（v0.3 新增）

- 生产者**必须**提供关闭注入的开关（`tbc.setExposure({ inject: false })` 或自己的界面），关闭时 `diagnostics()` 报 `INJECTION_DISABLED`。
- 生产者**应该**在首次连接设备时告知：心率会随提示词发给用户配置的模型服务商。
- 只在用户可见生成时注入：后台生成（安静生成、变量更新、摘要等）**不得**带注入块；`diagnostics().injection.background_skipped` 记录跳过次数。
- `bio.lastSignal` 含模型思维链原文，会随聊天导出；生产者**应该**提供关闭这项记录的开关（补 v0.2 §8）。

### 4.4 字符串校验与清洗

总线上来的字符串分两类处理：标识类不合法就拒收（调用方立刻知道错了），自由文本清洗后写入。参考实现：`tools/sanitize.mjs`。

| 字段 | 规则 | 不合法时 |
|---|---|---|
| `kind`、`source`、`unit`、`target`、`prior.source`、执行器 id | `^[a-z0-9][a-z0-9._:-]{0,31}$` | `push` / `setDaily` 返回 `false`，诊断记 `BAD_INPUT` |
| `device` | §2.6 | 同上 |
| 日期 | `YYYY-MM-DD`（`MM-DD` 为已弃用写法，读者仍接受） | 拒收 |
| `value` | 有限数；字符串值只能取该 kind 登记的枚举（如 `posture`） | 拒收 |
| 自由文本（`registerContext` 返回值、`feedback` 备注、`perceiver`） | 删除 `<` `>` 与控制字符；换行替换为空格；按长度上限截断（`device` 行 120 字符、备注 40、`perceiver` 每个 24） | 清洗后写入 |
| 首行属性值 | 不得含 `"` `<` `>` 与换行 | 生产者删掉该属性 |

- `unit` 按标识规则写小写（例如 `kpa`、`bpm`、`raw`）。
- 这张表只影响往总线里塞非法字符串的调用方；`MM-DD` 日期继续可读。

### 4.5 时间戳与主信号

1. `transport` 为 `push`、`bridge`、`api`，或样本带 `lagMs` 时，`t` **必须**提供；生产者**必须**使用 `sample.t` 归入相位，不得用到达时间。
2. `t` 超出 `[现在 − 24 小时, 现在 + 5 秒]` 时拒收（`BAD_INPUT`）。已经生成过块的轮次不回填。
3. **主信号唯一**：同一时刻只有一个 `hr` 主来源。缺省顺序为页面蓝牙 → 本机桥 → 总线上的其他来源，用户可以改。非主来源的 `hr` 样本不进相位统计；`tbc.sources()` 里主来源标 `primary: true`。

### 4.6 生产者身份

```js
tbc.claimProducer({ id: 'heartlink', version: '0.3', impl: '0.9.1' })
  // → { granted: true } | { granted: false, holder: { id, version } }
tbc.releaseProducer('heartlink')
tbc.producer()               // → { id, version, impl } | null
tbc.on('bio:producer', fn)   // 身份变化时发出，detail 同 producer()
```

Schema：`schema/producer.schema.json`。

1. **版本比较**：按 `.` 切分，逐段按整数比较（`0.10` 高于 `0.3`）。不得按字符串比较。
2. 版本高者得；版本相同，先到者保留。高版本 claim 时，原持有者收到 `bio:producer`，**必须**在下一次生成前撤掉自己的注入。
3. 没有拿到身份的实现**不得**注入块、**不得**写 `bio` 变量、**不得**发 `bio:inject`；**可以** `push` 样本、`registerContext`、登记执行器。页面卸载时**必须** release。
4. 谁创建总线对象不等于谁生成块：第一个加载的实现创建 `window.tbc`；后来的更高版本可以替换方法，但**必须**保留已登记的信号源、上下文源、执行器。
5. 宿主能提供提示词内容时，生产者**应该**在注入前检查里面是否已有 `<bio_context`；有就报诊断 `MULTI_PRODUCER`，并且不再注入。
6. 兼容：v0.2 实现不认识 claim，仍按旧规则“低版本只 push”，与本节一致。

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
//   | { ok: false, refused: 'disabled' | 'rate-limit' | 'quiet-hours' | 'not-worn' | 'sleeping' | 'unknown-target' | 'unsupported' | 'hr-high' | 'stop-failed' }

tbc.stop();                                 // 全局停止；tbc.stop('whoop-5.0') 只停一个
tbc.actuators();                            // [{ id, ...caps, busy }]
tbc.unregisterActuator(id);
```

- 执行器 id 按 §4.4 的标识规则写，并且不得含序列号（§2.6）。
- `target` 可用 `'*'`：发给所有支持该 `output` 的执行器；`output` 也可用 `'*'`：不限输出类型。每个执行器单独判断安全规则，结果逐个列出。
- 强度到设备值的换算：振动、往复、收缩、温度等取 `强度 × 值域上界` 向下取整；旋转只用正方向；按位置控制的抽动类（`HwPositionWithDuration`、`Position`）把强度换算成往返速度（强度 1 约 0.4 秒一个来回，强度接近 0 约 1.5 秒），强度 0 回到起点并停。
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
- **计时不能靠页面计时器**：页面切到后台（或被别的窗口挡住）时，浏览器会把页面计时器压到约每秒一次，帧会走样。实现应在 Worker（或同等不受节流的机制）里排帧。2026-09-17 实测：后台标签页里 10 个 100 ms 的页面计时器挤在约 1.2 秒才触发，而 Worker 排的 600 ms 帧间隔保持在 557–654 ms。

### 5.3 模型侧写法（可选约定）

回复里出现下面的标签时，由接入脚本在**用户可见生成结束后**解析并调用 `tbc.actuate`：

```
<bio_act target="*" output="Vibrate" pattern="wave" intensity="0.4" ms="3000"/>
```

- 属性都可省略：`target` 缺省 `*`，`output` 缺省 `*`（任意输出：振动、往复、旋转、收缩、抽动都按同一个强度动），`pattern` 缺省 `pulse`，`intensity` 缺省 0.5，`ms` 只对持续类模式有效。
- **不算动作的标签**（**必须**）：以下位置里的 `<bio_act/>` 不是动作，生产者**必须**先去掉这些内容再解析：
  1. 思维链：宿主单独给出的推理字段（不解析）；正文里的 `<think>…</think>`、`<thinking>…</thinking>`（包括只有结束标签的开头部分、没有闭合的结尾部分）；宿主推理模板的前后缀包住的内容；
  2. 代码：代码块（```` ``` ```` 或 `~~~`）、行内代码（`` ` ``）；
  3. HTML 注释 `<!-- … -->`。

  卡片和预设常让模型在思维链里规划动作，这些都不执行（2026-09-18 实测：三个把思维链写在正文里的第三方预设，6 次发送里有 5 次把思维链里的标签当成了动作）。参考实现：`tools/bio-act.mjs` 的 `stripNonActionText()`，`parseBioActs()` 已内置。
- 每条回复的动作数不设实质上限（参考实现取 50 只防失控，用户可改，见 §5.8；2026-09-19 起），**按去掉上述内容后剩下的标签计算**，多出的丢弃；按出现顺序排队，同一执行器之间至少隔 `minIntervalMs`。
- **隐藏**：生产者**必须**自己在显示时隐藏全部 `<bio_act/>` 标签（执行了的和没执行的都隐藏），只影响显示，不改消息原文；**不得**依赖宿主的 HTML 清理（参考实现 `hideBioActs()`）。
- 后台生成、被中途停止的生成、滑动到旧页，都不执行。
- `backstage` 时这是作者手段，角色不点破；`in-story` 时写成角色的动作（"轻轻点了点你的手腕"）；`device-aware` 时角色可以明说是自己让设备动的。是否在预设 / 世界书里教模型使用，由上层决定。

### 5.4 安全（在 device-interface-zh.md §7 之上）

1. **默认关闭**：用户显式开启"允许触发振动"后，`actuate` 才生效；否则返回 `refused: 'disabled'`。
2. **用户上限**：实现可以提供强度上限设置，提供时不得超过；不提供时视为 1。
3. **频率上限**：同一执行器两次触发间隔 ≥ 它的 `minIntervalMs`（手环缺省 10 秒）与档位缺省值中的较大者；单条回复次数按 §5.8（缺省 50，即实际上不限）。
4. **勿扰**：尊重用户设置的勿扰时段；读者处于睡眠时拒绝（`sleeping`），除非用户单独允许。
5. **没戴不振**：可穿戴执行器在 `wear` 为摘下时返回 `not-worn`。
6. **全局停止**必须可一键触发；页面卸载、桥断线、Intiface 断线即停。
7. 模型可见文本里不出现设备序列号、令牌、Intiface 地址。
8. **停止不经过模型**：全局停止、断线即停、看门狗都由实现直接执行，不能依赖模型“决定停下”。
9. **安全词（可选，缺省关闭）**：实现可以提供安全词——用户消息里出现用户设定的词时，全停并不执行本轮回复里的动作。词表由用户自定义；兴奋时常说的话（如“受不了”）会被误拦，所以缺省关闭（2026-09-17 实测：模型写了 0.9 / 1 / 0.8 三个动作，被“受不了”拦下）。
10. **心率偏高提示（可选，非诊断）**：生产者**可以**在相位行输出中性事实 `flag: hr-high`，条件是：
    - 非活动状态下心率持续高于用户设定值（缺省 120 bpm、10 分钟；这是常见的消费级缺省，**未核实**）；或
    - 用户提供了年龄时，任一时刻高于 `0.9 × (208 − 0.7 × 年龄)`（公式**有依据**：Tanaka 2001；系数 0.9 是**经验值**）。年龄只在本机使用，不进块。

    出现 `hr-high` 时，执行器缺省降档或暂停，`actuate` 可以返回 `refused: 'hr-high'`（**经验值**）。界面只说“设备读数高于你设定的值”，不说“心动过速”或“心脏异常”，并附一句：“本工具不能诊断，也不能发现心脏病发作；如有胸痛、胸闷等不适，请停止并联系急救。”（措辞依据：Apple 心脏健康通知说明；诊断标准见 HRS 2015，远不是一个读数能判断的。）

### 5.5 本机桥消息

以下消息只在 §6 的握手与授权完成后才可用；`actuate` 需要 `actuate` 权限。

```json
{ "cmd": "actuate", "target": "whoop-5.0", "action": { "output": "Vibrate", "pattern": "double" }, "frames": [[0, 1], [180, 0], [320, 1], [500, 0]], "source": "card-script" }
{ "cmd": "stop" }
{ "event": "bio:actuate", "detail": { "t": 1789600000000, "target": "whoop-5.0", "action": { … }, "results": [ { "id": "whoop-5.0", "ok": true } ] } }
{ "event": "bio:actuators", "detail": [ { "id": "whoop-5.0", "outputs": ["Vibrate"], "patterns": [ … ] } ] }
```

`stop` 不需要任何权限：任何已连接的客户端都可以让设备停下。

### 5.6 Intiface / buttplug 适配（非规范）

- 连接 Intiface Central 的 WebSocket（缺省 `ws://127.0.0.1:12345`），握手 `RequestServerInfo`（`ProtocolVersionMajor: 4`）；服务器不支持时退回 v3（`MessageVersion: 3`）。
- v4：每个带 `Output` 的设备特性登记为一个执行器，id 为 `intiface:<设备序号>:<特性序号>`；强度 × `Value` 上界取整后发 `OutputCmd`；停止用 `StopCmd`。收到新的 `DeviceList` 时对比增删。
- v3：`DeviceMessages.ScalarCmd` 的每一项登记为执行器；强度直接作 `Scalar` 发 `ScalarCmd`；停止用 `StopDeviceCmd` / `StopAllDevices`；监听 `DeviceAdded` / `DeviceRemoved`。
- `MaxPingTime` 大于 0 时按一半间隔发 `Ping`。
- Intiface 同一时间通常只接受一个客户端：用户已用别的酒馆 Intiface 插件时，二者只能开一个。

### 5.7 WHOOP 实现备注（非规范）

WHOOP 4.0：`RUN_HAPTICS_PATTERN`（0x4F）`[patternId, loops, 0, 0, 0]`。WHOOP 5.0 / MG：独立的 0x13 命令，体 `[0x01, 47, 152, 0×8, loops]`（来源：MIT 许可的 OpenStrap/protocol `cmdBuzzGen5Maverick`，本机未实测）。`pattern` 映射由实现决定。

### 5.8 强度档位与自定义参数（2026-09-17 新增）

用到玩具的用户通常想要高触发、高功率；也有人想慢慢来。所以协议不设“亲密闸门”，而是给**档位**，让用户第一次使用时选，之后随时改（v0.3 定义四档：慢热、持久、狂暴、极限）；每个参数也都能单独改。难以统一测准的数值（时长、间隔、下限）一律做成**有缺省值的用户设置**。

| 参数 | 慢热 `slow-burn`（缺省） | 持久 `steady` | 狂暴 `frenzy` | 极限 `max` | 说明 |
|---|---|---|---|---|---|
| `floor` 强度下限 | 0 | 0.25 | 0.4 | 0.8 | 非 0 强度按 `floor + (1 − floor) × 强度` 抬高；0 仍是停止 |
| `defaultMs.long` | 1500 | 8000 | 5000 | 10000 | 持续类模式没写 `ms` 时的时长 |
| `defaultMs.heartbeat` | 2700 | 8100 | 5400 | 9000 | 同上 |
| `defaultMs.wave` | 3000 | 9000 | 6000 | 10000 | 同上 |
| `minIntervalMs` | 1500 | 1200 | 800 | 500 | 缺省最小间隔；执行器声明的更大时取更大者 |
| `maxPerReply` | 50 | 50 | 50 | 50 | 每条回复最多执行几个（2026-09-19 起不设实质上限，50 只防失控） |
| 用户强度上限 | 由实现决定 | 同左 | 同左 | 同左 | 抬高之后再裁到上限（§5.4-2）；实现可以不提供这个设置，缺省为 1 |

- 参考实现：`resolveSettings(profile, overrides)`、`liftIntensity()`、`patternFrames(pattern, intensity, ms, settings)`、`parseBioActs(text, { maxPerReply })`；不传设置时结果与 v0.3 初版相同。
- 实现应在注入块扩展区写一行触觉状态，让卡片和预设知道能不能写 `<bio_act/>`、用户选了哪个档位（L0）：

```
haptics(heartlink): on | cap 60% | profile frenzy | actuators 3
haptics(heartlink): off
```

- 没有任何生理数据、但触觉开着或连着设备时，生产者应照常注入块（相位行写 `n/a (原因)`，省略 `series`），让模型知道触觉状态。
- 档位只描述**执行方式**与**给模型的倾向**：选狂暴时，解释层（世界书 / 卡片）可以让模型更常写动作、写更高的强度；选慢热时逐步升温。具体措辞由上层决定。
- 注入侧同理：阈值类参数（手动基线、覆盖率门槛 70%、“噪声”范围 10%、“明确反应” 20%、峰值门槛等）应作为有缺省值的设置暴露给用户，块内照常只记录数值。

### 5.9 设备层要求（2026-09-17 新增，依据社区逆向与 buttplug 配置）

1. **强度 0 就是停止**（必须）。驱动把 0 映射到设备的停止指令；不得把 0 夹到最低档（社区实现踩过：先判 0 再夹取值范围）。
2. **保活**：有的设备要求定时重发指令，否则几秒后自己停（例：司沃康 SL278 系列的自动模式约 2 秒自停）。执行器在能力里写 `keepaliveMs`，实现负责重发；帧结束或 `deadline` 到了必须停止重发并发停止。
3. **互斥组**：多个输出共用同一个马达时（例：同一马达的“振动”与“自动模式”会互相顶掉），能力里填同一个 `group`；同组同时只驱动一个，切换前先停另一个。
4. **加热类**（`Temperature`）必须有 `maxDurationMs`，实现不得超过；设备本身往往没有断电保护。
5. **设备自带模式**：执行器可在 `nativePatterns` 里把抽象模式映射到设备自带模式编号；没有映射的模式按强度帧执行。自带模式默认要求**强度 0 能立即停下**。停不下来的自带模式（例：有产品的“失控模式”启动后要等计时结束才停）只有同时满足下列条件才能登记（2026-09-18 用户定：读者可以自己拔出或按设备按钮停止）：
   - 在 `nativePatterns` 里标 `stoppable: false`，并写明 `maxDurationMs`（设备自身的最长运行时间，未知时不得登记）；
   - 只用于非风险输出：`Temperature`、`Estim`、`Spray` 的自带模式必须能被 0 停下；
   - 用户**逐台设备**明确开启后，实现才接受模型或脚本触发它；缺省关闭；
   - 运行期间实现仍照常发停止指令，并在界面上持续提示“自带模式运行中，软件可能停不住，可拔出或按设备按钮”与预计剩余时间；`outputState()` 与 `feedback` 行如实反映（停止失败记 `stop by reader … (native-unstoppable)`）。
   - 列表写法的 `nativePatterns`、模型点名自带模式（`pattern="native"`）与这些条件的可检查形式见 [v0.4 草案 §9](spec-v0.4-draft-zh.md)。
6. **有风险的输出要点名**：`Temperature`、`Estim`、`Spray` 不属于 `output="*"`（包括不写 `output`）的范围；只有写明这个输出类型才会驱动，否则返回 `unsupported`（参考实现 `RISKY_OUTPUTS`）。
7. **独占连接**：设备同时只接受一个连接时（常见于只配官方 App 的设备），能力里写 `exclusive: true`；连接失败时实现应提示“先断开官方 App”，不要反复重试抢占。
8. **断线后状态未知**：设备断线时是否自动停下没有核实的，能力里写 `stopsOnDisconnect: false`（缺省视为 `false`）；实现在断线期间要把该执行器显示为“可能仍在动”，重连后第一件事是对全部输出发停止，再恢复排队。
9. **全部停止先于排队**：`tbc.stop()` 必须越过执行器里已排队的指令，按输出逐个发停止；需要逐输出应答的设备，停止指令也要等应答，失败要重试（至少 2 次）并返回 `refused: 'stop-failed'`，界面继续显示“可能仍在动”，并记一条 `feedback`（`from: 'device'`、`reason: 'other'`，备注写明）。
10. 字节格式、档位数、握手、双芯片（一个型号对应两个蓝牙模块）等属于驱动实现，不进协议（同一系列不同型号就不一样；社区经验是先抓包，不要盲发网上的指令）。

### 5.10 MCP 桥（非规范）

社区已有把玩具 / 可穿戴接给 AI 客户端的 MCP 服务。实现要做 TBC ↔ MCP 桥时：

- 写侧工具按动作命名（`actuate` / `stop` / `actuators`），参数与 §5.1 相同，强度 0–1；`via` 写 `mcp`。
- 读侧复用生产者已有的数据（聊天变量 `bio`、总线样本），不另行轮询设备。
- 停止必须能在 AI 会话之外触发（§5.4-8）。
- 文档要写明：生理数据经 MCP 发给第三方模型客户端后，就离开了酒馆侧的隐私设定。

### 5.11 给助手与卡片的只读接口（2026-09-17 新增）

角色助手（例如陪伴角色）、卡片脚本、美化都可能需要知道“现在能不能动、用户选了什么、上一条回复的动作执行了没有”。它们只能通过下面的公开接口读取，不得读取某个实现的内部数据。

```js
tbc.outputState()
// → { enabled: true, maxIntensity: 0.6, profile: 'frenzy', profileChosen: true,
//     settings: { floor, defaultMs, minIntervalMs, maxPerReply },   // §5.8 生效值
//     fromReplies: true, actuators: 3 }                             // 用户没关掉的执行器数
tbc.replyActs()
// → 当前聊天最近的回复动作记录（新的在后，最多 60 条）：
//   [{ key, index, t, acts: [...], errors: ['BAD_PATTERN'], skipped: null | 'disabled' | 'replies-off' | 'no-device' | 'safeword',
//      results: [{ t, pattern, results: [{ id, ok, refused?, clipped? }] }] }]
```

- 事件：`bio:output-state`（设置或执行器变化时，detail 同 `outputState()`）；`bio:reply-acts`（某条回复的记录新增或更新时，detail 为那一条）。
- `index` 是该回复在聊天里的位置；`key` 由实现决定，只保证同一条回复（同一滑动页、同一内容）不变。

### 5.12 设备反馈输入：玩具 → 剧情（2026-09-17 新增）

§5.1–5.11 让剧情驱动设备。本节规定反方向：读者对设备做了什么、设备自己报了什么，怎样作为**下一轮的输入**交给模型。心率是被动信号；这里的读者操作是**主动表态**，是块里最直接的主观信号。

#### 5.12.1 反馈事件

```js
tbc.feedback({
  t: Date.now(),
  from: 'reader',            // reader 读者操作 | safeword 安全词 | device 设备或实现自己停下
  type: 'stop',              // stop | stronger | weaker | pace | replay | skip
  value: null,               // stronger / weaker：强度变化百分点（整数，正数）；pace：档位名；replay：模式名
  target: 'intiface:0',      // 可选：执行器 id；缺省 = 全部
  act: { key: 'r12', i: 2, afterMs: 2400 },   // 可选：对应 replyActs() 里哪条回复的第几个动作、开始后多久
  reason: null,              // from=device 时必填：disconnected | deadline | heat-limit | rate-limit | other
});
tbc.on('bio:feedback', fn);  // detail 同上
tbc.feedbackLog();           // 上次发送之后的反馈（新的在后，最多 20 条）
```

- 生产者：输出实现（记录自己界面上的“全部停止”、调强调弱、换档、再来一次、跳过）；遥控器、玩具 App 桥等第三方也可以调用 `tbc.feedback()`。
- 事件只记录，不解释；实现**不得**因为反馈自动触发新的动作——新的动作只能来自模型的下一条回复或用户操作。
- `stop` 必须先停再记录：停止不等模型、不等本事件被处理（§5.4）。
- 玩具自带的传感器和按键不走本接口，按 §4 用 `tbc.push({ kind: 'pressure' | 'button', device, … })`，进块时是已有的 `pressure(…)` / `button(…)` 行，`device` 写执行器的 id。单位不统一（`unit: 'raw'`）、只写相对变化、不得与信号源设备混同的写法见 [v0.4 草案 §5.6](spec-v0.4-draft-zh.md)。

#### 5.12.2 块里的 `feedback` 行（L0）

只在上次正常发送之后有反馈或有执行过的动作时出现，放在扩展区：

```
feedback(heartlink): acts 3 sent, 1 done, 1 cut, 1 pending | stronger +20% read @41s | stop by reader read @61s (reply -1, act 3, 2.4s in) | stop by device write @4s (disconnected) | stop by safeword send @0s
```

语法（完整版见 `schema/block.abnf`）：

```
acts-seg   = "acts " n " sent, " n " done" [", " n " cut"] [", " n " pending"] [", " n " refused"]
event-seg  = action " " phase " @" n "s" [" (" note ")"]
action     = "stop by " ("reader" / "safeword" / "device") / "stronger +" n "%" / "weaker -" n "%"
           / "pace " profile / "replay " pattern / "skip"
phase      = "gen" / "read" / "write" / "send"
note       = stop-reason [", " ref] / ref
stop-reason = "disconnected" / "deadline" / "heat-limit" / "rate-limit" / "other"     ; 只用于 stop by device
ref        = "reply -" n [", act " n] [", " n ["." DIGIT] "s in"]
```

| 段 / 字段 | 含义 |
|---|---|
| `acts N sent, …` | 上一条回复里的动作的结局。`done` = 帧完整走完；`cut` = 被停止或被新动作打断；`pending` = 发送时仍在执行或排队；`refused` = `actuate` 返回拒绝。**必须**满足 `sent = done + cut + pending + refused`；被裁剪强度的仍算 `done`。没有动作时省略；有时放在最前 |
| `stop by reader\|safeword\|device` | 谁让设备停的；`device` 时备注里写原因 |
| `stronger +N%` / `weaker -N%` | 读者手动调强 / 调弱 |
| `pace <档位>` | 读者换了节奏（§5.8） |
| `replay <模式>` / `skip` | 读者要求再来一次 / 跳过当前动作 |
| `<相位> @Ns` | 事件落在哪个相位、相位开始后几秒。发送那一刻发生的事件（例如安全词）写 `send @0s` |
| `reply -1` / `reply -2` | 动作来自哪条回复：`reply -1` = gen / read 所指的那条，`reply -2` = 再早一条。跨轮延续的动作**必须**写 `reply -2` |

- 段按时间顺序；事件段最多 8 个，多的丢弃最早的并在末尾加 `| +N more`。
- 备注 ≤ 40 字符，不含 `|`、括号与尖括号。v0.3 草案的旧备注写法 `(act 3, 2.4s in)` 读者仍接受，生产者不应再写。
- swipe / regenerate：反馈照常输出，**不清空**；只有下一次 `trigger="normal"` 的发送才清空。
- 读法（写给世界书 / 预设，非规范）：
  - `stop by reader` / `skip`：这一下不对。下一条不要加码，不要重复同一模式，除非读者要求。
  - `stronger` / `replay`：这一下对了，可以顺着来。`weaker`：方向对，力度过了。
  - `stop by device` / `stop by safeword`：`device` 是技术原因，不代表喜好；`safeword` 按用户设定处理，下一条不写动作。
  - `cut` / `pending` 只是执行结局，不代表读者的意思。
  - 呈现仍按模式（§1.1）：`backstage` 只影响写法；`in-story` 写成角色察觉到的反应；`device-aware` 角色可以直接说“你刚才按停了”。

#### 5.12.3 变量与只读接口

- `bio.feedback`：`{ turn: [事件…] }`，每次正常发送时换成本轮的事件，给卡片脚本读。
- `tbc.replyActs()` 的每条记录可带 `feedback: [事件…]`（`act.key` 对得上的那些）。
- Schema：`schema/feedback.schema.json`。

## 6. 本机桥安全（必须；任何本机桥发布之前必须实现）

v0.2 §6 的桥只要求绑定 127.0.0.1。但主流浏览器允许 https 页面连接回环地址，WebSocket 也不受跨域限制，所以任何网站都可能连上桥，读实时心率和块全文、推送假样本、驱动玩具。浏览器的本地网络访问提示能不能拦住，目前**未核实**，规范不把它当成安全边界。

本节是**规范性要求**。在下面 5 条全部实现之前，任何实现**不得**发布或启用本机桥（包括 v0.2 §6 与 v0.3 §5.5 的全部消息）。Schema：`schema/bridge.schema.json`。

```json
{ "cmd": "hello", "client": "sillytavern-heartlink", "version": "0.9.1", "token": "<配对后下发>", "scopes": ["read", "push", "actuate"] }
{ "event": "bio:hello", "detail": { "granted": ["read", "push"], "denied": ["actuate"], "pairing": false } }
{ "event": "bio:error", "detail": { "code": "FORBIDDEN", "cmd": "actuate" } }
```

1. **只听本机**：桥**必须**只监听回环地址，并拒绝 `Host` 头不是 `127.0.0.1`、`localhost`、`[::1]`（可带端口）的连接，防 DNS 重绑定。
2. **校验来源**：桥**必须**校验 `Origin`，只放行用户在桥界面确认过的地址，其余回 `ORIGIN_DENIED` 并断开。没有 `Origin` 的连接视为本机程序，必须带令牌。
3. **配对**：首次连接时桥回 `pairing: true`，桥界面显示 6 位配对码，页面让用户输入（`pairingCode`）；成功后桥按 Origin 下发令牌（只下发这一次）。之后的连接必须带令牌，令牌不对回 `BAD_TOKEN`。令牌**不得**出现在块、世界书、聊天消息、聊天变量、诊断里；页面侧只存在本机存储里。
4. **分权限**：
   - `read`：接收事件（`bio:sample`、`bio:inject` 等）；
   - `push`：推样本、上下文、先验；
   - `actuate`：驱动执行器。

   `actuate` **必须**在桥界面单独勾选，缺省拒绝。没有权限的命令回 `FORBIDDEN`，不执行。`stop` 不需要权限。
5. **可吊销**：用户可以随时在桥界面吊销某个 Origin 的令牌和权限；吊销后立即断开该 Origin 的连接。

- 页面**应该**处理浏览器的本地网络访问权限提示，但不能依赖它。
- 兼容：v0.2 §6 的桥还没有正式发布，没有存量客户端。

## 7. 兼容

对 v0.2 的承诺（0.x 期间保持）：

1. v0.2 的块、变量、事件、总线方法全部保留，含义不变；v0.2 读者遇到不认识的行和属性应忽略（v0.2 已要求）。
2. 首行 `mode` 在 0.x 期间只写 `author` / `character`，按 `mode="character"` 触发的 v0.2 世界书继续生效（§1.1）。
3. 固定区的行与顺序不变，只增加了可选的 `scope`；v0.3 之后固定区不再增加任何行（§2.3）。
4. `prior` 行与 `bio.prior`、`setPrior` 保留；`MM-DD` 日期、`quiet-median` / `p20` 方法名、feedback 旧备注写法仍可读（弃用项 1.0 移除）。
5. 新增的首行属性（`view`、`replay`、`date`、`tz`、`perceiver`）和新增行对 v0.2 读者都是“不认识的”，可以忽略。

已知的不兼容：

- 按 v0.2 语法严格解析、遇到固定区顺序变化就整块拒收的机器读者，会拒收带 `scope` 行的块。这无法由规范补救；已知的机器读者只有 `tools/block.mjs`，已随本版换成宽松解析。
- v0.3 草案期间按 `mode="in-story"` 等新值写的世界书，要改成认 `view="…"`（参考实现的读法世界书是目前唯一已知的这类读者）。

版本：首行 `v="0.3"`；用到本文件任一新增内容的生产者必须写 `v="0.3"`，不得输出更高版本才有的行或属性。

## 8. 待定

- `trend` 的数据能否实时拿到，取决于上游设备项目的“只读不删”实测。
- 玩具反馈：由读者反馈触发“角色问一句现在感觉怎样”的交互格式（与“模型问你”合并考虑）。
- 振动 pattern 的抽象名单：v0.3 已加 `wave`（第二类执行器：Intiface 玩具）；`sos` 等再有需要时定。
- `cycle` 的来源：WHOOP API 当前没有周期数据端点，先留格式。
- 流式显示、心率滞后、基线年龄与噪声、派生事实段、执行器与相位重叠（`act` 段、`clean` 行、基线卫生）、away 相对写法、世界书扫描缺省关闭、执行器电量与连接、设备自带模式直通：见 [v0.4 草案](spec-v0.4-draft-zh.md)。

## 附录 A：宿主生成类型 → 是否开新一轮

| 宿主生成 | 是否开新一轮 | 块 |
|---|---|---|
| 普通发送（`normal`；不是群聊内层、不是工具调用递归、不是斜杠命令） | 开 | 新块，`trigger="normal"` |
| `swipe`、`regenerate` | 开，但没有新消息 | 新块，按 §1.3 |
| `continue` | 不开 | 重放上一块，`replay="continue"` |
| 群聊里第 2 个及之后的成员 | 不开 | 重放本次发送的块，`replay="group"` |
| 工具调用后的递归生成（深度 > 0） | 不开 | 重放本次发送的块，内容不变 |
| `impersonate` | 开，但读者还没写消息 | 新块，按 §1.3 |
| `quiet`、摘要、变量更新等后台生成 | — | 不注入（§4.3） |
| 只执行了斜杠命令、没有真正进入生成 | 不算发送 | 不注入，也不结束 write 相位 |

## 附录 B：依据

本版的生理学规则依据以下来源（均为一手研究或学会指南；打开范围与置信度由维护者另行记录）：

- Quigley et al. 2024, SPR 心率与 HRV 指南 Part 1 — https://doi.org/10.1111/psyp.14604
- Laborde, Mosley & Thayer 2017, HRV 研究方法 — https://doi.org/10.3389/fpsyg.2017.00213
- Shaffer & Ginsberg 2017, HRV 指标与常模 — https://doi.org/10.3389/fpubh.2017.00258
- Shaffer, Meehan & Zerr 2020, 超短时 HRV — https://doi.org/10.3389/fnins.2020.594880
- Munoz et al. 2015, 超短时 RMSSD 的有效性 — https://doi.org/10.1371/journal.pone.0138921
- Schäfer & Vagedes 2013, 脉率变异能否替代 HRV — https://doi.org/10.1016/j.ijcard.2012.03.119
- Physiol Meas 2025, BLE 胸带的动态响应 — https://doi.org/10.1088/1361-6579/adece4
- Bent et al. 2020, 可穿戴光电心率的误差来源 — https://doi.org/10.1038/s41746-020-0226-6
- JMIR Cardio 2025, 上臂与腕式光电对比 — https://doi.org/10.2196/67110
- Sci Rep 2024, 认知负荷与心率 — https://doi.org/10.1038/s41598-024-79728-x
- Bradley et al. 2001, 情绪与动机 — https://doi.org/10.1037/1528-3542.1.3.276
- Bradley 2009, 自然选择性注意 — https://doi.org/10.1111/j.1469-8986.2008.00702.x
- Bradley, Lang & Cuthbert 1993, 情绪反应的习惯化 — https://doi.org/10.1037//0735-7044.107.6.970
- Siegel et al. 2018, 情绪的自主神经指标 meta 分析 — https://doi.org/10.1037/bul0000128
- Xue-Rui et al. 2008, 性活动期间的动态血压与心率 — https://doi.org/10.1097/mbp.0b013e3283057a71
- Tanaka et al. 2001, 最大心率预测公式 — https://doi.org/10.1016/s0735-1097(00)01054-8
- HRS 2015 专家共识（POTS、IST 等） — https://doi.org/10.1016/j.hrthm.2015.03.029
- Apple 心脏健康通知说明 — https://support.apple.com/en-us/120276
- Bluetooth SIG, Heart Rate Service v1.0 — https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html
