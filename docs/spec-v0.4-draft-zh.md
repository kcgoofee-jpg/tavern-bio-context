# Tavern Bio-Context（TBC）v0.4 草案

> 状态：**草案**，2026-09-18。只列相对 [v0.3](spec-v0.3-draft-zh.md) 的改动；没提到的规则全部照 v0.3。本文件的改动会**改变数据的含义或格式**，所以不进 v0.3 定稿；每一项落地前都要先在真实酒馆里实测（见各节“待实测”）。
>
> 参考校验器只在首行 `v="0.4"` 时检查本文件的语法；`v="0.3"` 的块里出现这些写法时，按 v0.3 规则处理（未知属性、未知行、未知段只警告；已知段写错报错）。样例：`fixtures/blocks/valid/12-v04-stream.txt`、`fixtures/blocks/invalid/17-v04-rules.txt`、`18-v03-with-v04-syntax.txt`。

标注沿用 v0.3：**有依据** / **经验值** / **未核实**。依据来源见 v0.3 附录 B，本文件用到的另列在末尾。

用到本文件任一内容的生产者必须写 `v="0.4"`。

## 1. 流式显示：`stream` 属性与 `stream(...)` 行

**问题**：流式显示时，读者边出字边读，`reply_end` 之后的 `read` 多半是回看。v0.3 的 `read-pos` 假设读者从 `reply_end` 起从第一个字开始读，阅读速度校准也会因为 `read` 很短而偏高，峰值系统性地对错段落。

**做法**：`gen` / `read` 行的含义不变（`gen` = 发送到出完，`read` = 出完到开始写）；首行声明是否流式，另加一条扩展行记录流式段，位置用**实测的已显示字数**，不用估计。

### 1.1 首行属性

| 属性 | 取值 | 含义 |
|---|---|---|
| `stream` | `yes` / `no` | 本轮被读的那条回复是否流式显示。缺省视为未知 |

### 1.2 `stream(...)` 行（扩展区，L1）

```
stream(lag 6s): wait 12s (ttft 10s, reasoning 2s) | body 48s, 1500 chars | hr 72→88 [70–100] peak 100 @40s | pos ~1050/1500 chars, para 3/5 | cov 95%
```

语法：

```
stream-line  = %s"stream(lag " 1*DIGIT %s"s): wait " dur [" (" text ")"]
               %s" | body " dur ", " 1*DIGIT %s" chars"
               " | " hr-part
               [%s" | pos ~" 1*DIGIT "/" 1*DIGIT %s" chars, para " 1*DIGIT "/" 1*DIGIT]
               *segment
```

| 段 | 定义 |
|---|---|
| `lag Ns` | 与首行 `lag` 相同（§2） |
| `wait` | 发送到第一个**正文**可见字的时长（含思维链时间）；括号里可以写 `ttft`、`reasoning` |
| `body` | 第一个正文字到 `reply_end` 的时长，以及正文总字数 |
| `hr` | 只统计 `body` 区间；`peak` 按 v0.3 §1.4 判定 |
| `pos` | 时刻 `peakAt − lag` 屏幕上已显示的正文字数 / 总字数，以及所在段落 / 总段落数。生产者在每次收到流式片段时记录“时刻 → 已显示字数” |
| 其余段 | 同相位行：`cov`、`rr-loss`、`hrv`、`mean`、`above` |

规则：

1. 流式时生产者**应该**输出 `stream` 行；只有首行 `stream="yes"` 时才能输出。
2. `pos` 的总字数**必须**等于 `body` 的字数；没有 `peak` 时**不得**输出 `pos`；`peakAt − lag` 落在 `wait` 内时不输出 `pos`；稀疏来源不输出 `pos` 与 `peak`。
3. `stream="yes"` 时：`read` 行照常输出，含义是“回复出完之后到开始写”；**不得**输出 `read-pos`（位置看 `stream` 行）；`read` 行开头 `lag` 秒内的峰值按 §2 标 `carryover`。
4. 阅读速度校准只用 `stream="no"`、没有 `away` 重叠、没有 `flag` 的轮次。`read-pos` 的 `cal` 速度取整输出。
5. `stream` 行与 `gen` 行的时间有重叠，这是有意的：`gen` 记录等待，`stream` 记录边出边读。

**兼容**：`stream` 属性和 `stream(...)` 行对 v0.2 / v0.3 读者是不认识的属性和行，可以忽略。读法世界书应该加一句：“有 stream 行时，峰值位置看 stream 行，read 是回看。”

**待实测**：流式片段到达时刻与屏幕显示时刻的差距（宿主的平滑输出会让两者不同）。

## 2. 心率滞后：`lag`、`carryover`、`tail-max`

**问题**：心率对刺激的反应要过几秒才出现，设备输出的 bpm 本身又是平滑过的。`write` 常常只有 5–20 秒，它的统计大部分是 `read` 的余波。v0.3 只有 note 行一句 `hr lags seconds`。

**做法**：相位窗口仍然是页面事件，不后移；首行声明滞后值 L；开头 L 秒内的峰值标 `carryover`；位置换算用 `peakAt − L`。

### 2.1 首行属性 `lag`

`lag="Ns"`：生产者做归属计算时用的滞后值。它是**可配置设置**，缺省按设备类型：

| 设备 | 缺省 `lag` | 说明 |
|---|---|---|
| 胸带，带逐拍 RR | `4s` | 交感作用延迟约 1.7 秒（SPR 2024）；防御性加速在第 2–3 秒到峰（Vila 等，经 Frontiers 2019 转引）；胸带 BLE 心率输出延迟 1.0–3.3 秒（Physiol Meas 2025） |
| 腕式光电、未知设备 | `6s` | 腕式的设备内延迟没有公开数字（**未核实**），取更保守的值 |

组成部分**有依据**，总和没有直接研究，两个缺省值都是**经验值**，要实测校准。生产者用 RR 自己算逐秒心率时（v0.3 §1.4），设备滤波带来的延迟可以扣掉，`lag` 可以相应调小。

### 2.2 `carryover`

- 相位行的峰值段扩展为 `peak N @Ns[ carryover]`。
- 当 `@Ns < L` 时**必须**写 `carryover`；`@Ns ≥ L` 时**不得**写。含义固定为“峰值出现在本相位开始后 L 秒内”，这是时间事实，不是结论。
- `carryover` 窗口不得小于 L。
- 读法应该说明：持续性的心率加速可以延续几十秒（防御反应最长约 80 秒，**有依据**），所以短相位（`write`、`send`）的统计主要是上一相位的余波。

### 2.3 `tail-max`

- 前一相位结束后 L 秒内出现更高值时，生产者**应该**在前一相位行追加 `| tail-max N @+Ns`，表示“相位结束后 N 秒时的值”。
- 只在它高于该相位 `peak` 时输出；`@+Ns` 不得大于 L。

### 2.4 位置换算与最短相位

- 所有位置换算（`read-pos`、`stream` 的 `pos`）使用 `peakAt − L`；结果早于该相位开始时，不输出位置。
- 相位短于 `max(10 s, 2 × L)` 时不输出 `peak`（替换 v0.3 §1.4 的 10 秒；**经验值**）。

**兼容**：`carryover` 和 `tail-max` 都在已有行里。v0.3 的校验器把 `carryover` 当成心率段写错（报错），所以只能在 `v="0.4"` 的块里写。LLM 读者多一个词，不影响原意。

**待实测**：各类设备从文字出现到 BLE 输出变化的实际延迟；腕式设备的内部平滑窗口。

## 3. 基线：来源、年龄与噪声

v0.3 §1.5 已登记方法名。v0.4 在基线行加三段，并收紧旧方法名。

```
baseline: 68 bpm (rest, n=120; hrv 62 ms) | age 25m | noise ±3
baseline: 71 bpm (rolling-low, n=18) | age 0m | noise ±4 | changed from rest 3 turns ago
baseline: 60 bpm (manual, set 2026-09-16, polar-h10) | age 20h
```

语法：

```
baseline-line  = %s"baseline: " ( bpm " (" method [", n=" 1*DIGIT] [manual-info] ["; hrv " 1*DIGIT " ms"] ")" / na-reason )
                 [%s" | age " 1*DIGIT ("s" / "m" / "h" / "d")]
                 [%s" | noise ±" 1*DIGIT]
                 [%s" | changed from " method " " 1*DIGIT %s" turn" ["s"] %s" ago"]
                 *segment
manual-info    = %s", set " 4DIGIT "-" 2DIGIT "-" 2DIGIT ", " device-name     ; 只用于 manual
method         = %s"manual" / %s"rest" / %s"rolling-low" / %s"prior-rhr"
```

| 段 | 定义 | 规则 |
|---|---|---|
| `age` | 基线所用样本中最新一个到发送时刻的时长 | 有数值的基线**必须**带 |
| `noise ±N` | 基线窗口的稳健标准差（1.4826 × MAD，取整，bpm） | 给模型一个“多大算起伏”的尺子，替代固定的 10% |
| `changed from <旧方法> N turns ago` | 最近 3 轮内换过方法 | 换过时**必须**写 |
| `set 日期, 设备` | 手动基线的设定日期与设备（设备名按 v0.3 §2.6） | `manual` **必须**带 |

其他规则：

1. `quiet-median`、`p20` 不得再输出（v0.3 里是已弃用别名）。
2. `rest` 的样本还**不得**包含发送后 L 秒内的样本。
3. `manual` 超过 24 小时或设备不同，生产者**应该**降到下一优先级，并在 `warn:` 行说明。
4. **时效**：`age` 超过 60 分钟，或者基线窗口落在一次显著升高（§4 的 `above` 持续 ≥ 30 秒）之后 20 分钟内，生产者**应该**加一行 `warn: baseline may be outdated`。依据：性活动高潮后心率要 10–20 分钟才回到基线（Xue-Rui 2008，**有依据**）；个人静息心率跨周波动（Quer 2020，**有依据**）；60 分钟是**经验值**。
5. 聊天变量：`bio.baseline` 保持数字；新增 `bio.baselineInfo = { method, n, ageSec, noise, setAt?, device?, changedFrom?, changedTurnsAgo? }`（Schema 在 `v` 为 `0.4` 时检查）。

**兼容**：新段都在行尾，v0.3 读者按未知段忽略。

## 4. 带定义的派生事实

**问题**：读法里有些规则，模型光看块算不出来：“持续高 20% 以上”“与 away 重叠”“10% 以内是噪声”“history 看投入度趋势”。

**做法**：生产者把计算结果写成**带定义的中性事实**，阈值写在段里。

| 读法需要的量 | 块里的段 | 定义 |
|---|---|---|
| 平均水平 | 相位行 `\| mean 84 (+15%)` | 相位均值，括号里是相对基线的百分比；没有基线时不输出 |
| 持续升高 | 相位行 `\| above +20% 34s` | 相位内高于 `基线 × (1 + 阈值)` 的累计时长；阈值是设置（缺省 20%），写在段里；没有基线时不输出 |
| 离开 | 相位行 `\| away 2:00` | 本相位被剔除的 away 时长；相位统计本身已不含 away |
| 噪声 | 基线行 `\| noise ±3`（§3） | — |
| 趋势 | `history: … \| read-peak-rel +12% +30% +5%` | 最近几轮 read 峰值相对当时基线的百分比；没有值写 `·` |

语法（相位行与 `stream` 行的新段）：

```
mean-seg       = %s" | mean " 1*DIGIT " (" ("+" / "-") 1*DIGIT "%)"
above-seg      = %s" | above +" 1*DIGIT "% " dur
away-seg       = %s" | away " dur
tail-max-seg   = %s" | tail-max " 1*DIGIT %s" @+" 1*DIGIT "s"
history-rel    = %s" | read-peak-rel " rel-value *(SP rel-value)
rel-value      = ("+" / "-") 1*DIGIT "%" / "·"
peak-part      = %s" peak " 1*DIGIT " @" 1*DIGIT "s" [%s" carryover"]
```

写法约束（**必须**）：新增段只能是“名字 + 数值 + 单位 / 阈值”，不得出现形容词。

`history` 的绝对值 `read-peaks` 在 v0.4 期间保留，1.0 移除。

### 4.1 读法更新（非规范）

- 噪声：小于 `max(5 bpm, 2 × noise)` 的起伏视为噪声，不再写死 10%（**经验值**）。暂时保留百分比时，腕式约 7–10%、胸带约 5% 更合适（腕式误差数字**有依据**：Bent 2020；JMIR Cardio 2025）。
- 两档：大于门槛算“有起伏”；`above +20%` 持续 ≥ 30 秒算“显著升高”。+20% 是很高的门槛——女性性活动到高潮时平均约 +26%（Xue-Rui 2008）——只适合“强烈”这一档，不适合“有反应”（**经验值**）。
- 显著升高时先看有没有动作：`rr-loss` 升高、`away`、长时间打字时，不据此判断（**有依据**：Bent 2020 活动时误差高约 30%；SPR 2024）。
- 其余措辞沿用 v0.3 §1.6。

**兼容**：新段以 ` | ` 追加在行尾，v0.3 读者按未知段忽略。读法世界书要同步改措辞。

## 5. away：相对发送时刻的写法与 `unfocused`

```
away: -2:45..-2:15 hidden (read); -0:40..-0:32 unfocused (write)
```

语法：

```
away-line      = %s"away: " ( %s"none" / away-span *("; " away-span) )
away-span      = rel ".." rel SP away-type SP "(" phase ")" [SP range]
               / clock "–" clock SP away-type [SP range]          ; 旧写法，1.0 移除
rel            = "-" 1*DIGIT ":" 2DIGIT                             ; 相对 sent 的偏移，起点早于终点
away-type      = %s"hidden" / %s"idle" / %s"unfocused"
phase          = %s"gen" / %s"read" / %s"write"
```

- 新类型 `unfocused`：窗口失去焦点但页面仍可见。
- 每段必须写落在哪个相位。
- 空闲判定阈值应该随预计阅读时长伸缩（长回复的阅读期间不应该很快被判成 `idle`）；具体函数由实现决定。
- 旧的绝对时刻写法在 v0.4 里仍可读，生产者应该改用新写法（校验器给警告）。

## 6. 世界书扫描缺省关闭

v0.3 §2.7 的扫描开关缺省值改为**关闭**。前提：参考实现的读法世界书已改成常驻条目。

- 依赖关键字触发的第三方世界书要改成常驻，或让用户手动打开扫描。
- 诊断 `SCAN_COLLISION` 继续保留，用于用户手动打开扫描的情况。

## 7. 执行器的电量与连接状态

**问题**：玩具没电或断线重连时，动作会被裁掉或根本没执行；模型看不到，只能从 `feedback` 的 `cut` / `refused` 猜。v0.3 的 `sensor` 行只描述信号源设备（§2.1），执行器状态只有自由文本的 `device:` 行。

**做法**：执行器的电量、充电、连接状态作为**设备状态事实**上报，进块时每个执行器一行 `actuator(...)`（L0）。只记录读数，不写结论。

### 7.1 上报

```js
tbc.push({ kind: 'battery', device: 'intiface:0:1', value: 18 });   // 百分比，0–100 的整数
tbc.push({ kind: 'charging', device: 'intiface:0:1', value: 0 });   // 1 充电中 / 0 没有
tbc.actuatorLink('intiface:0:1', 'reconnecting');                   // 'ok' | 'reconnecting' | 'lost'
```

- `battery`（v0.2）、`charging`（v0.3）沿用已登记的 kind。样本的 `device` 等于某个已登记执行器的 id 时，生产者把它归到该执行器，**不**写进 `sensor` 行；否则按原规则处理。
- `tbc.actuatorLink(id, link)` 由登记该执行器的一方调用（驱动最清楚连接状态）。`ok` = 已连接、可以接收指令；`reconnecting` = 断开后正在自动重连；`lost` = 已断开、不再自动重连。执行器登记时视为 `ok`；`unregisterActuator` 之后不再报告。
- 读不到电量的设备不上报，不得编造；只有“满 / 低”两档的设备不上报百分比（**待定**，见 §10）。
- 取值不合法（不是整数、超出 0–100、`link` 不在登记值里）时拒收并返回 `false`（v0.3 §4.4 的 `BAD_INPUT`）。
- 断线期间仍按 v0.3 §5.9-8 处理：`stopsOnDisconnect` 不为 `true` 的执行器显示为“可能仍在动”，重连后先发停止。

### 7.2 只读接口

```js
tbc.actuators()
// → [{ id, ...caps, busy,
//      battery: 18 | null, charging: false | null, batteryAt: 1789600000000 | null,   // 最近一次读数与时刻
//      link: 'ok' | 'reconnecting' | 'lost' }]
tbc.outputState()
// → { …v0.3 §5.11 的字段,
//     actuatorStatus: [{ id, battery, charging, link, low }] }   // low 按 §7.4 计算
```

- 事件：状态变化时照常发 `bio:actuators` 与 `bio:output-state`；电量每变化 1 个百分点最多发一次，间隔不小于 30 秒（**经验值**，避免刷屏）。
- 卡片与助手只读这两个接口，不得读驱动的内部状态（v0.3 §5.11）。

### 7.3 块里的 `actuator` 行（扩展区，L0）

```
actuator(intiface:0:1): battery 12% low | charging no | link ok
actuator(page:toy-a): battery n/a (stale) | link reconnecting
```

语法：

```
actuator-line  = %s"actuator(" actuator-id "): " act-seg *(" | " act-seg)
actuator-id    = 1*32( LCALPHA / DIGIT / "." / "_" / ":" / "-" )        ; 执行器 id，v0.3 §4.4 的标识规则
act-seg        = battery-seg / charging-seg / link-seg / segment
battery-seg    = %s"battery " 1*3DIGIT "%" [%s" low"] / %s"battery n/a" [" (" text ")"]
charging-seg   = %s"charging " ( %s"yes" / %s"no" )
link-seg       = %s"link " ( %s"ok" / %s"reconnecting" / %s"lost" )
```

规则：

1. 只有**至少一个执行器**报告过电量或充电，或者连接不是 `ok` 时才输出；每个执行器最多一行，行名括号里写执行器 id（就是 `<bio_act target="…"/>` 能用的值），不得含序列号（v0.3 §2.6）。
2. 段顺序：`battery` → `charging` → `link`；三段都可省略，但一行至少有一个登记段。没读到的段省略，不写猜测值。
3. `battery` 取 0–100 的整数。最近读数超过 10 分钟没更新时写 `battery n/a (stale)`（**经验值**）。
4. `link ok` 可以省略；`reconnecting` / `lost` **必须**写。
5. 执行器行最多 4 行（按最近触发的先后），多的省略。
6. `actuator` 行和 `device:` 行可以同时出现：`device:` 仍是自由文本的最近动作记录，`actuator` 是结构化状态。

### 7.4 低电量

- `low` 是带定义的中性事实：只在 `battery ≤ 15%` 时可以写，生产者**应该**写（15% 是**经验值**，没有找到玩具方面的依据）；块里的门槛固定为 15%，实现界面的提醒门槛可以另设。
- 生产者**不得**写“快没电了”“即将停止”“还能用 N 分钟”之类的推断；电量曲线因设备而异，百分比本身也常常不准（**未核实**）。
- 读法（非规范）：`low` 或 `link reconnecting` / `lost` 时，动作可能被裁掉或不执行，`feedback` 里的 `cut` / `refused` 可能是这个原因，不代表读者的意思；角色是否提及、怎样提及按模式（v0.3 §1.1）决定。

**兼容**：`actuator` 是新行名，v0.3 读者按未知行忽略；v0.3 校验器只给 `LINE_UNKNOWN` 警告。

### 7.5 停止失败与断线后状态未知（2026-09-19 新增）

`feedback` 事件与行的 `reason` 增加两个值（§5.12）：

| 值 | 含义 | 何时写 |
|---|---|---|
| `stop-failed` | 停止指令重试后设备仍没有应答（v0.3 §5.9-9，`actuate` 返回 `refused: 'stop-failed'`） | 由实现写，`from: 'device'` |
| `maybe-running` | 设备断线且 `stopsOnDisconnect` 为假，实现不知道它停没停（v0.3 §5.9-8） | 断线时写一次；重连发完停止后不再写 |

两种情况实现都**必须**在界面上继续显示“可能仍在动”，并在 `outputState()` 里如实反映；**不得**据此推断设备实际状态。

诊断问题代码同时登记：`TOY_STOP_FAILED`、`TOY_MAYBE_RUNNING`、`TOY_EXCLUSIVE_BUSY`、`TOY_HANDSHAKE_TIMEOUT`（conformance-zh.md §4.4）。

## 8. 设备自带模式直通：`pattern="native"`

**问题**：很多玩具的卖点是自带模式（波浪、脉冲、随机……），用强度帧模拟不出来；v0.3 §5.9-5 只允许把**抽象模式**映射到自带模式，模型没法点名“用设备的第 3 个模式”。

**做法**：执行器在能力里列出自带模式；生产者把**用户开启了的**模式写进块；模型用 `<bio_act pattern="native" mode="…"/>` 点名。安全规则沿用 v0.3 §5.4、§5.8、§5.9。

### 8.1 能力声明：`nativePatterns` 的列表写法

v0.3 的 `nativePatterns` 是“抽象模式 → 自带模式编号”的对象，继续有效。v0.4 允许写成**列表**，每项描述一个自带模式：

```js
tbc.registerActuator('intiface:0:1', {
  outputs: ['Vibrate'],
  levels: true,
  maxDurationMs: 60000,
  nativePatterns: [
    { id: 4, name: '波浪', outputs: ['Vibrate'], levels: true, map: 'wave' },
    { id: 7, name: '脉冲', outputs: ['Vibrate'] },
    { id: 9, name: '失控', outputs: ['Vibrate'], stoppable: false, maxDurationMs: 60000 },
  ],
}, handler);
```

| 字段 | 必须 | 含义 |
|---|---|---|
| `id` | 是 | 设备自己的模式编号或名字，只给驱动用，**不进块**、不给模型看 |
| `name` | 是 | 给模型看的短名，1–8 个字符，不含空格、`\|`、括号、尖括号；按 v0.3 §4.4 清洗 |
| `outputs` | 否 | 这个模式驱动哪些输出；缺省 = 执行器的 `outputs` |
| `levels` | 否 | 这个模式能否按强度调节；缺省 `false`（强度只决定开还是停） |
| `stoppable` | 否 | 强度 0 或停止指令能否立即停下；缺省 `true` |
| `maxDurationMs` | `stoppable: false` 时必须 | 设备自身的最长运行时间；未知时不得登记该模式（v0.3 §5.9-5） |
| `map` | 否 | 这个模式同时充当哪个抽象模式（等同 v0.3 的对象写法）；`stoppable: false` 的模式不得写 `map` |

- **序号**：模型看到的编号是这个模式在列表里的位置（从 1 起）。列表顺序在一次登记期间不得改变；重新登记时序号可以变，块里照实写。
- `stoppable: false` 的模式，`outputs` 不得含有风险的输出（`Temperature`、`Estim`、`Spray`，v0.3 §5.9-5）。
- `tbc.actuators()` 的每项另带 `native: [{ n, name, outputs, levels, stoppable, maxDurationMs, enabled }]`（`n` 是序号，`enabled` 是用户设置）；不含 `id`。

### 8.2 用户开关

- 自带模式直通**逐台设备**开启，缺省关闭。
- `stoppable: false` 的模式另需用户**逐台设备**明确开启（v0.3 §5.9-5），缺省关闭；实现可以做成逐个模式开启。
- 没开启的模式不进块，模型写了也不执行。

### 8.3 块里的 `native` 行（扩展区，L0）

```
native(intiface:0:1): 1 波浪 | 2 脉冲 | 3 失控 (unstoppable, 60s, opt-in)
```

语法：

```
native-line    = %s"native(" actuator-id "): " native-seg *(" | " native-seg)
native-seg     = 1*2DIGIT SP mode-name [%s" (unstoppable, " dur %s", opt-in)"]
mode-name      = 1*8( %x21-27 / %x2A-3B / %x3D / %x3F-7B / %x7D-7E / UTF8-NONASCII )   ; 不含空格 | ( ) < >
dur            = 1*DIGIT "s" / 1*DIGIT ":" 2DIGIT
```

规则：

1. 只列用户开启了的模式；一个都没有时不输出。每个执行器最多一行，每行最多 8 个模式。
2. 只在触觉开着时输出：同一块里的 `haptics` 行是 `off` 时**不得**出现 `native` 行。
3. 序号按升序、不重复；没开启的模式跳过，序号不重排（例：`1 波浪 | 3 失控`）。
4. `stoppable: false` 的模式**必须**带 `(unstoppable, 时长, opt-in)`，时长 = `maxDurationMs`；其余模式**不得**带括号。
5. 模式名是设备或用户给的名字，生产者不改写、不加形容词。

### 8.4 模型侧写法

```
<bio_act target="intiface:0:1" pattern="native" mode="1" intensity="0.6" ms="8000"/>
<bio_act pattern="native" mode="波浪"/>
```

| 属性 | 规则 |
|---|---|
| `pattern="native"` | **必须**同时写 `mode` |
| `mode` | 序号（`1`–`99`）或模式名（与 `name` 完全相同）。`pattern` 不是 `native` 时 `mode` 被忽略，记 `MODE_IGNORED`，动作按原模式执行 |
| `target` | 缺省 `*`。写序号时，`*` 只在恰好一个执行器开启了直通时有效，否则跳过（`NATIVE_TARGET_AMBIGUOUS`）；写模式名时，`*` 发给所有有同名已开启模式的执行器 |
| `output` | 缺省 `*`，这时模式的 `outputs` 里有风险的输出不驱动（v0.3 §5.9-6），整个模式都是有风险的输出时跳过；写明输出类型时，模式的 `outputs` 必须含它 |
| `intensity` | 模式 `levels: true` 时按 v0.3 §5.8 抬高下限后使用；否则只区分 0 与非 0。**0 永远是停止**，不会启动模式 |
| `ms` | 缺省用档位的 `defaultMs.long`；裁到模式与执行器的 `maxDurationMs`。`stoppable: false` 的模式忽略 `ms`，按 `maxDurationMs` 计 |

**找不到时跳过，不退回 `pulse`**（这一点与 v0.3 §5.1 的抽象模式不同）：目标执行器没有列表写法的 `nativePatterns`、没有这个序号或名字、模式没开启、输出不匹配时，这个动作不执行，解析记 `NATIVE_UNAVAILABLE`（或上表的代码），`actuate` 返回 `refused: 'unsupported'`（没开启时为 `'native-off'`）。理由：模型点名的是具体模式，换成轻点一下会让“执行了什么”和块里的记录对不上。

解析错误代码（参考实现 `tools/bio-act.mjs` 的 `parseBioActs()` / `resolveNative()`；除 `MODE_IGNORED` 外，动作都不执行、不计入每条回复的上限）：

| 代码 | 情况 |
|---|---|
| `NATIVE_NO_CAPS` | 调用方没有传入执行器列表，无法判断（v0.3 调用方式） |
| `NATIVE_NO_MODE` | `pattern="native"` 没写 `mode` |
| `NATIVE_UNAVAILABLE` | 目标没有列表写法的自带模式、没有这个序号或名字，或输出不匹配 |
| `NATIVE_OFF` | 模式存在但用户没开启 |
| `NATIVE_TARGET_AMBIGUOUS` | 用序号写、`target="*"`，而开启了直通的执行器不止一个 |
| `MODE_IGNORED` | `pattern` 不是 `native` 却写了 `mode`；动作照常执行，`mode` 被忽略 |

### 8.5 档位与频率

- `maxPerReply`、`minIntervalMs`、`floor` 照 v0.3 §5.8 生效；直通动作和普通动作一起计数。
- 同一执行器上正在运行 `stoppable: false` 的模式时，后续动作排队到它结束；结束前排不下的记 `refused`（`feedback` 的 `acts` 段照常计数）。频率间隔从模式**结束**起算。
- 执行时帧只作包络：`[[0, 强度], [时长, 0]]`，给看门狗和 `deadline` 用；驱动收到后发自带模式指令，到点发停止。

### 8.6 停不下来的模式：护栏

v0.3 §5.9-5 的全部条件继续有效，这里写成可检查的形式：

1. **逐台设备明确开启**（§8.2），缺省关闭；没开启时不进块、不执行。
2. **只用于非风险输出**（§8.1）。
3. **已知最长时间**：`maxDurationMs` 必填；块里写出（§8.3-4）。
4. **持续提示**：运行期间界面一直显示“自带模式运行中，软件可能停不住，可拔出或按设备按钮”和预计剩余时间，不能被关掉，直到时间到或设备报告已停。
5. **照常发停止**：全局停止、单台停止、断线、看门狗都照常发停止指令（v0.3 §5.4-6、§5.4-8、§5.9-9），不因为“反正停不住”而省略。
6. **如实反馈**：停止指令发出后模式仍在运行时，`feedback` 事件的备注写 `native-unstoppable`，例：`stop by reader read @61s (native-unstoppable, reply -1, act 2)`；`feedback` 事件对象的 `reason` 写 `'native-unstoppable'`（任何 `from` 都可以用）。`outputState()` 另带 `nativeRunning: [{ id, n, name, stoppable, endsAt }]`。
7. 安全词（v0.3 §5.4-9）触发时照常全停，并按第 6 条记录。

### 8.7 记录

- `bio:actuate` 与 `replyActs()` 的动作带 `mode`（模型写的原值）；结果项带 `native: { n, name, stoppable, endsAt }`。
- `device:` 行可以写 `native 3 失控 until 22:03:10`；这是自由文本，不作为规范。
- `feedback` 的 `replay` 段对直通动作写 `replay native`。

**兼容**：v0.3 的解析器遇到 `pattern="native"` 会报 `BAD_PATTERN` 并退回 `pulse`，所以卡片和预设只应在块里出现 `native` 行时教模型写直通；实现升级到 v0.4 后按本节跳过。`mode` 属性对 v0.3 解析器是未知属性，会被忽略。`native` 行对 v0.3 读者是未知行。

## 9. 兼容与校验

- v0.3 的全部兼容承诺（v0.3 §7）继续有效。
- `<bio_act/>` 的直通写法（§8）在 v0.3 解析器里会退回 `pulse`；参考实现 `tools/bio-act.mjs` 只在调用方传入执行器能力（`opts.actuators`）时接受 `pattern="native"`，没传时跳过并记 `NATIVE_NO_CAPS`。
- 本文件改变数据含义的地方：`read` 在流式时是回看（§1）；相位行的峰值要结合 `carryover` 理解（§2）；基线带年龄与噪声（§3）；away 的写法（§5）。旧读者忽略这些新属性、新行、新段时，读到的仍是 v0.3 含义的数据，只是少了新信息。
- 参考校验器在 `v="0.4"` 时检查：`stream` / `lag` 属性；`stream` 行（要求 `stream="yes"`、`lag` 一致、`pos` 需要 `peak` 且字数一致）；`carryover` 与 `lag` 的关系；`tail-max`；相位最短时长 `max(10 s, 2L)`；基线的 `age`、`noise`、`changed`、`manual` 的 `set`；弃用方法名；`read-peak-rel`；away 相对写法与 `unfocused`；`stream="yes"` 时不得有 `read-pos`；`actuator` 行（执行器 id、段顺序、电量范围、`low` 只在 ≤ 15%、每个执行器一行）；`native` 行（序号升序不重复、括号只用于 `unstoppable, 时长, opt-in`、`haptics off` 时不得出现、每个执行器一行）；`feedback` 备注里的 `native-unstoppable`。样例：`fixtures/blocks/valid/13-v04-actuator-native.txt`、`fixtures/blocks/invalid/20-v04-actuator-native.txt`、`21-v03-native-unstoppable.txt`。

## 10. 待定（本草案没有采纳，留待讨论）

- **负向事件** `dip N @Ns`：明显减速也作为中性事实输出。朝向和注意的主要表现就是心率减速（Bradley 2009，**有依据**）。是否进协议未定。
- **低质量 HRV** `hrv N ms (low-quality)`：v0.3 规定 `rr-loss` > 5% 不输出 hrv；腕式上可能几乎永远没有 hrv。是否允许放宽到 ≤ 20% 并加标记，待实测。
- **基线情境字段**（刚喝过咖啡、刚运动过）：SPR 2024 建议记录，影响幅度**未核实**。
- **`hr-high` 的缺省值**（120 bpm、10 分钟）**未核实**，要找到可引用的来源或实测后再定。
- `lag` 缺省值与流式进度的精度，都要真机实测后再定稿。
- **只有两档电量的设备**（满 / 低）怎样上报：可能加 `battery low` 写法，待有设备实测。
- **低电量门槛** 15%：经验值，要按实测的降功率点再定。
- **自带模式的强度**：多数设备的自带模式能否调强度、调了是否生效，待逐台实测（`device-lab` 与真机）。
- **直通的名字冲突**：多个执行器有同名模式时，`target="*"` 是否应全部触发，待真机体验后定。

## 本文件另用到的来源

- Vila et al. 2007, 心脏防御反应综述（摘要） — https://doi.org/10.1016/j.ijpsycho.2007.07.004
- Frontiers in Psychology 2019, 心脏防御反应（全文，转引 Vila） — https://doi.org/10.3389/fpsyg.2019.01213
- Quer et al. 2020, 静息心率的个体内与个体间差异 — https://doi.org/10.1371/journal.pone.0227709
- 其余见 v0.3 附录 B。
