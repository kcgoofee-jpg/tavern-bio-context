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
2. `rest` 的样本还**不得**包含发送后 L 秒内的样本，也**不得**包含有执行器在运行的秒（§5.3）。
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

## 5. 执行器与相位的重叠：`act` 段与 `clean` 行

**问题**：玩具在动的时候，读者的心率同时受设备影响。性活动到高潮时心率相对基线平均约 +26%（Xue-Rui 2008，**有依据**）；身体活动时腕式光电的误差平均高约 30%（Bent 2020，**有依据**）；活动与部分心理应激下，光电脉率变异与 HRV 的一致性常常不可接受（Schäfer & Vagedes 2013，**有依据**）。相位行只给一个 `peak` 或 `mean`，读的人分不出这段升高里有多少来自设备。振动 / 触觉刺激本身对心率的影响幅度**未核实**（没有找到一手来源）。

**做法**：协议**不规定**怎么判断，只把事实标注得更细，判断留给用户自己的模型（v0.3 §0-2、§0-3）：

1. 相位行记录本相位有多少秒在驱动执行器、强度多大（§5.1）；
2. 把没有驱动的那些秒单独统计一份（§5.2）；
3. 基线窗口排除驱动秒（§5.3）；
4. 怎么理解写在读法里，非规范（§5.4）。

### 5.1 相位行的 `act` 段

```
read: 1:00 | hr 72→86 [70–90] peak 90 @44s | cov 96% | act 12s, mean 62%, 3 acts
write: 20s, 31 chars, pauses 1, edits 0 | hr 84→80 [79–85] | cov 100% | act 8s, mean 40%, 1 act (Estim)
```

语法（相位行与 `stream` 行的新段）：

```
act-seg    = %s" | act " dur ", mean " 1*3DIGIT %s"%, " 1*2DIGIT SP (%s"act" / %s"acts")
             [SP "(" risky *("/" risky) ")"]
risky      = %s"Temperature" / %s"Estim" / %s"Spray"
```

| 部分 | 定义 |
|---|---|
| `act Ns` | 本相位里至少有一个执行器在运行的秒数 |
| `mean N%` | 实际驱动时间里发出的强度按时间加权的平均，`强度 × 100` 取整（1–100）；分母是驱动的毫秒数，不是整秒数（见规则 3） |
| `N act` / `N acts` | 与本相位有重叠的动作条数（`bio:actuate` 里的单个动作）；一条写 `act`，多条写 `acts` |
| `(Estim)` | 这些秒里驱动过的**有风险的输出**（v0.3 §5.9-6：`Temperature`、`Estim`、`Spray`），多个按登记顺序用 `/` 连接 |

规则（**必须**）：

1. **算的是生产者发出的东西**。设备有没有真的照做、什么时候真的停下，页面这边拿不到：多数设备不回报执行状态，`stopsOnDisconnect` 为假时连停没停都不知道（v0.3 §5.9-8），停止指令还可能失败（§8.5 的 `stop-failed`）。所以 `act` 覆盖的区间是**生产者已经发出、按帧表与 `deadline` 计算尚未结束**的时间，**不是**设备确认执行的时间。这一条必须写进读法。
2. **逐秒计**：把相位切成秒；某一秒里任何一个执行器有非 0 强度，这一秒就计入。不足一秒的按 1 秒计。
3. **强度**：任一时刻的强度 = 该时刻各执行器发出强度的**最大值**（多台设备不因为取平均而变弱；帧是阶梯函数）。`mean` = 这个最大值在**实际驱动的时间**（最大值 > 0 的那些毫秒）上的时间加权平均：`∫ 强度 dt ÷ 驱动毫秒数`。取的是**发出的值**（抬高档位下限、裁到用户上限之后的值，v0.3 §5.8），不是模型写的原值。
   - 为什么不按整秒平均（2026-09-18 修订，heartlink 实测）：短动作跨秒时首尾两秒只占一部分，按整秒平均会把强度算低——模型写 `intensity="0.8" ms="8000"`，整秒平均得 `mean 71%`，模型会以为设备没按它说的强度跑。秒数（`act Ns`）仍按规则 2 逐秒计，两者口径分开。
4. **条数**：同一个动作跨两个相位时，两个相位各计一次；被拒绝（`refused`）、没有执行的动作不计。
5. 自带模式直通（§9）按包络帧计（§9.5）；`stoppable: false` 的模式计到 `maxDurationMs` 或设备报告已停为止。
6. 没有任何执行器运行时**整段省略**，不写 `act 0s`、不写 `0 acts`；`act` 的秒数**不得**大于相位时长。
7. 有风险的输出与其它输出**一样计数**，但**必须**在括号里点名：这几秒驱动的是加热还是电刺激，模型和读者有权知道。
8. 生产者没有参与驱动的设备（用户用别的软件、玩具自带的遥控）**不计入**，也**不得**估计；这时 `act` 段只反映本实现发出的动作。

`stream` 行（§1）用同一个段，统计范围是 `body` 区间。

### 5.2 `clean` 行：只统计没有驱动的那些秒

```
clean(read): hr 74→78 [72–80] peak 80 @31s | sec 34/60 | cov 91%
```

语法（扩展区，L1）：

```
clean-line = %s"clean(" phase "): " hr-part %s" | sec " 1*DIGIT "/" 1*DIGIT *segment
phase      = %s"gen" / %s"read" / %s"write"
```

**为什么写成一行而不是相位行的一段**：相位行的段以 ` | ` 分隔，而 `clean` 自己还要带 `sec`、`cov`、`hrv` 等段，塞不进一个段里；写成独立行后读者照常按行名取值（v0.3 §2.3），v0.3 读者按未知行忽略。

| 段 | 定义 |
|---|---|
| `hr …` | 只用该相位里**不在 `act` 覆盖内**的秒算出的心率统计；起止值、区间、峰值的规则与相位行相同（v0.3 §1.4、本文件 §2） |
| `sec N/M` | N = 参与统计的秒数（干净秒），M = 相位时长（与相位行开头的时长相同） |
| 其余段 | 同相位行：`cov`、`rr-loss`、`hrv`、`mean`、`above`，都只在干净秒上算（`cov` = 干净秒里有心率样本的比例） |

规则（**必须**）：

1. 只有该相位行有 `act` 段时才可以输出 `clean` 行；一个相位最多一行。
2. 干净秒 = 相位内的秒 − `act` 覆盖的秒。`away` 与摘下的秒本来就不进相位统计，也不算干净秒。
3. **数据不够就整行省略**：干净秒少于 `max(10 s, 2 × lag)`，或少于相位时长的 30% 时，不输出（两个阈值都是**经验值**，与 §2.4 的最短相位同理）。
4. 干净秒可以不连续，统计跨区间合并（中间的驱动秒不计入时长）；`peak` 的“连续 ≥ 3 个样本、跨度 ≥ 3 秒”（v0.3 §1.4-3）**必须**落在同一段连续的干净秒里。`@Ns` 仍是**相对本相位开始**的秒数，位置换算照 §2.4 用 `peakAt − lag`，`carryover` 的写法也照 §2.2。
5. `hrv` 段照 v0.3 §1.4 的全部条件：窗口长度按干净秒算，`rr-loss` 也只算干净秒。
6. `clean` 只是同一段时间的另一种切法，**不是**“真实反应”。生产者**不得**在块里比较 `clean` 与相位行，**不得**写任何结论词（v0.3 §0-2）。

### 5.3 基线卫生（生产者侧，规范性）

1. 从会话内样本算出的基线（`manual`、`rest`、`rolling-low`，§3）的窗口**不得**包含有执行器在运行的秒——和排除 `away` 一样，按 §5.1 的口径判定（生产者发出的动作区间）。`prior-rhr` 来自日级数据，不受影响。
2. 排除之后样本少于该方法的最少样本数时，**必须**按 §3 的优先级降到下一个方法，并**必须**写明，例：

```
warn: baseline degraded to rolling-low (actuated seconds excluded)
```

   降级后基线行照常写实际用的方法名与 `n=`，不写被排除的那些秒。
3. 所有方法都不够时写 `baseline: n/a (原因)`，**不得**用含驱动秒的窗口凑数。
4. 高潮样峰值之后的恢复期照 §3-4 处理（`warn: baseline may be outdated`）；两条规则叠加，不互相替代。

### 5.4 读法（非规范）

本节写给卡片、预设、世界书作者，**不约束生产者**；生产者也**不做**这些判断。

- **事实**：`act` 覆盖的秒里，心率同时反映设备和剧情，块本身分不开。性活动到高潮时心率相对基线平均约 +26%（Xue-Rui 2008，**有依据**）；身体活动时腕式光电误差平均高约 30%（Bent 2020，**有依据**）；活动中光电脉率变异与 HRV 的一致性常常不可接受（Schäfer & Vagedes 2013，**有依据**）；说话与体位同样影响（SPR 2024，**有依据**）。振动 / 触觉刺激本身对心率的影响幅度**未核实**。
- 因此腕式设备在这些秒里的 `hrv` 尤其不可信（v0.3 §1.4 已经用 `rr-loss` 与最短窗口限制了输出）。
- **谁来判断**：生产者只写数，**不写**“这段写得好”，也**不写**“这是设备造成的”。要不要把 `act` 算进去、算多少，由用户自己的模型、预设、卡片决定。
- **一个不具约束力的例子**：想看文字本身有没有引起反应，可以跨轮比较 `clean` 的统计（同一相位、同一基线方法、`sec` 都够长的轮次），而不是比较相位行的 `peak`。比较时仍要记得长会话里反应会因习惯化变小（Bradley 1993、2009，**有依据**）。
- 没有 `clean` 行不等于“没有反应”，只说明干净秒不够（§5.2-3）；没有 `act` 段也不等于“设备没动”，用户可能在用别的软件驱动（§5.1-8）。

### 5.5 变量与总线

聊天变量 `bio` 的每一轮记录（`bio.last`、`bio.turns[]`）增加 `phases`：

```json
"phases": {
  "read": {
    "act":   { "sec": 12, "mean": 62, "n": 3, "outputs": ["Vibrate"] },
    "clean": { "sec": 34, "phaseSec": 60, "first": 74, "last": 78, "min": 72, "max": 80,
               "peak": 80, "peakAt": 31, "cov": 91 }
  },
  "write": {
    "act":   { "sec": 8, "mean": 40, "n": 1, "outputs": ["Estim"] },
    "clean": null
  }
}
```

- 键只能是 `gen` / `read` / `write`；`act.mean` 是 1–100 的整数（与块里一致）；`act.outputs` 是这些秒里驱动过的**全部**输出类型（不只有风险的），按登记顺序。
- `clean` 的字段与块里的 `clean` 行一一对应；不满足 §5.2-3 时省略或写 `null`。
- Schema：`schema/bio-variable.schema.json`（`v` 为 `0.4` 时检查）。
- 总线**不加新方法**：生产者用自己已有的 `bio:actuate` 记录与 `replyActs()`（v0.3 §5.11）算这两组数。不经过 `tbc.actuate` 的驱动生产者看不到，**不得**估计（§5.1-8）。

### 5.6 玩具上的传感器输入

玩具自带的压力传感器、按键按 v0.3 §5.12.1 走已有的 kind（`pressure`、`button`），块里也是已有的 `pressure(...)` / `button(...)` 行。v0.4 把写法定死：

```
pressure(intiface:0, 100ms): read +0→+12 peak +18 @22s | write +2
button(intiface:0, event): read @41s ×1
```

1. 括号里第一项写**设备 id 或执行器 id**（按 v0.3 §4.4 的标识规则，小写、可以含 `:`），第二项照常是 cadence；总线上推样本时 `device` 写同一个 id。
   - **设备 id** 是该设备所有执行器 id 的公共前缀（例：执行器 `intiface:0:0:vibrate` 所在设备写 `intiface:0`）。buttplug 把压力 / 按键放在设备上**独立的特性**里，不属于任何一路输出，这时**应该**写设备 id（2026-09-18 修订，依据：heartlink 实现与 device-lab 模拟器特性表，FEEDBACK F-072）。
   - 传感器确实属于某一路输出时（一路一个传感器的设备），可以写那一路的执行器 id。
2. **单位不统一**：buttplug 的 `InputReading` 明说传感器单位没有标准（`docs/device-interface-zh.md` §4），`unit` 写 `'raw'`，块里**只能写相对变化**——每个数值带 `+` 或 `-`（相对本相位开始或相对上一次读数，一行里保持同一种），也可以写相对百分比 `+35%`。**不得**写绝对读数，**不得**换算成 `kPa`、`°C` 等物理单位。`button` 行的次数 `×N` 不是测量值，照 v0.3 §2.1 原样写。
3. **不得与身体信号源混同**：这些行说的是**设备上发生的事**，不是读者的生理量。`sensor(...)` 行仍然只描述信号源设备（v0.3 §2.1）；这些样本不进相位心率统计，不参与主信号选择（v0.3 §4.5-3）；**不得**与心率合成任何指标（`device-interface-zh.md`：不做跨 kind 的合成指标）。
4. 同一个 id 既是执行器又推传感器时，`actuator(...)` 行写它的电量与连接（§8），`pressure(...)` / `button(...)` 行写它的读数，两者不合并。
5. 读法（非规范）：这些读数说明设备那边发生了什么，可能来自读者，也可能来自设备自己的动作；和 `act` 段一起看，不单独当成唤起程度。

**兼容**：`act` 是相位行与 `stream` 行的新段，`clean` 是新行名，v0.3 读者按未知段、未知行忽略；玩具传感器行用的是已有行名与 kind。

**待实测**：`clean` 的两个阈值（`max(10 s, 2L)`、30%）、多执行器同秒取最大值的取法、玩具传感器读数在真机上的量级。

## 6. away：相对发送时刻的写法与 `unfocused`

```
away: -2:45..-2:15 hidden (read); -0:40..-0:32 unfocused (write)
```

语法：

```
away-line      = %s"away: " ( %s"none" / away-span *("; " away-span) )
away-span      = rel ".." rel SP away-type SP "(" phase ")" [SP range]
               / clock "–" clock SP away-type [SP range]          ; 旧写法，1.0 移除
rel            = "-" 1*DIGIT ":" 2DIGIT                             ; 相对 sent 的偏移，起点早于终点
away-type      = %s"hidden" / %s"idle" / %s"unfocused" / %s"offscreen"
phase          = %s"gen" / %s"read" / %s"write"
```

| 类型 | 含义（生产者怎么判） | 统计 |
|---|---|---|
| `hidden` | 页面不可见：换标签页、最小化、锁屏；浏览器判定整个窗口被别的程序挡住时也算（Chrome 的原生遮挡检测会把页面置为隐藏） | **不计入**相位统计与时长 |
| `unfocused` | 页面仍可见，但窗口失去焦点：切到别的程序、多屏时在另一块屏上操作（`window` 的 `blur` / `focus`，`document.hasFocus()`） | **不计入** |
| `idle` | 一段时间没有任何操作（鼠标、滚动、按键、触摸） | 计入；与之重叠时不输出 `read-pos` / 位置 |
| `offscreen` | 最新一条回复**整条**不在聊天区的可视范围里（读者翻上去看旧消息）；只在 `gen`（流式出字时）与 `read` 里判 | 计入；与之重叠时不输出 `read-pos` / 位置，峰值落在其中时不得换算成最新回复里的位置 |

- 新类型 `unfocused`、`offscreen`（2026-09-18 新增，用户实测追问：窗口切换、翻看旧消息都看不到；依据 `references/research/2026-09-18-browser-attention-signals.md`）。
- **覆盖整轮**：离开检测从上一次发送开始，`gen` 里的离开同样按上表处理（v0.3 实现只从回复写完开始算，是缺陷）。
- **不在就不算**（替换 v0.3 §1.4-6 的“与 away 重叠超过一半不得输出 peak”）：`hidden`、`unfocused` 的秒不属于任何相位的统计。峰值、`cov`、最短相位时长都**只按在场的秒**算；在场秒数够最短相位（§2.4）就照常判峰值，不因为离开得久而整段放弃。例：回复写完时读者不在，10 分钟后回来读了 1 分钟——这 1 分钟照常判峰值。
- **读回复从读者在场时起算**：`read` 的起点仍是回复写完（相位边界是页面事件，不变），但回复写完后读者第一次在场（页面可见且有焦点）之前的秒记作离开；`read-pos` 的阅读时间从这一刻起算。
- **最短时长**：`unfocused`、`offscreen` 短于 5 秒的不记（点一下地址栏、滚动经过旧消息）；`hidden` 不设下限。5 秒是**经验值**。
- 同一时刻满足多种时按 `hidden` > `unfocused` > `offscreen` > `idle` 取一种，区间不重叠。
- **写进 v0.3 的块时**（首行 `v="0.3"`）：v0.3 只有 `hidden`、`idle` 两种，按统计处理方式对应——`unfocused` 写成 `hidden`（都不计入），`offscreen` 写成 `idle`（都计入、都不判位置）。统计本身照上表做，不因为块的版本而变。
- 可选的系统级空闲（浏览器 Idle Detection 接口，要用户授权）判出的空闲仍写 `idle`；锁屏写 `hidden`。
- 每段必须写落在哪个相位。
- 空闲判定阈值应该随预计阅读时长伸缩（长回复的阅读期间不应该很快被判成 `idle`）；具体函数由实现决定。
- 旧的绝对时刻写法在 v0.4 里仍可读，生产者应该改用新写法（校验器给警告）。

## 7. 世界书扫描缺省关闭

v0.3 §2.7 的扫描开关缺省值改为**关闭**。前提：参考实现的读法世界书已改成常驻条目。

- 依赖关键字触发的第三方世界书要改成常驻，或让用户手动打开扫描。
- 诊断 `SCAN_COLLISION` 继续保留，用于用户手动打开扫描的情况。

## 8. 执行器的电量与连接状态

**问题**：玩具没电或断线重连时，动作会被裁掉或根本没执行；模型看不到，只能从 `feedback` 的 `cut` / `refused` 猜。v0.3 的 `sensor` 行只描述信号源设备（§2.1），执行器状态只有自由文本的 `device:` 行。

**做法**：执行器的电量、充电、连接状态作为**设备状态事实**上报，进块时每个执行器一行 `actuator(...)`（L0）。只记录读数，不写结论。

### 8.1 上报

```js
tbc.push({ kind: 'battery', device: 'intiface:0:1', value: 18 });   // 百分比，0–100 的整数
tbc.push({ kind: 'charging', device: 'intiface:0:1', value: 0 });   // 1 充电中 / 0 没有
tbc.actuatorLink('intiface:0:1', 'reconnecting');                   // 'ok' | 'reconnecting' | 'lost'
```

- `battery`（v0.2）、`charging`（v0.3）沿用已登记的 kind。样本的 `device` 等于某个已登记执行器的 id 时，生产者把它归到该执行器，**不**写进 `sensor` 行；否则按原规则处理。
- `tbc.actuatorLink(id, link)` 由登记该执行器的一方调用（驱动最清楚连接状态）。`ok` = 已连接、可以接收指令；`reconnecting` = 断开后正在自动重连；`lost` = 已断开、不再自动重连。执行器登记时视为 `ok`；`unregisterActuator` 之后不再报告。
- 读不到电量的设备不上报，不得编造；只有“满 / 低”两档的设备不上报百分比（**待定**，见 §11）。
- 取值不合法（不是整数、超出 0–100、`link` 不在登记值里）时拒收并返回 `false`（v0.3 §4.4 的 `BAD_INPUT`）。
- 断线期间仍按 v0.3 §5.9-8 处理：`stopsOnDisconnect` 不为 `true` 的执行器显示为“可能仍在动”，重连后先发停止。

### 8.2 只读接口

```js
tbc.actuators()
// → [{ id, ...caps, busy,
//      battery: 18 | null, charging: false | null, batteryAt: 1789600000000 | null,   // 最近一次读数与时刻
//      link: 'ok' | 'reconnecting' | 'lost' }]
tbc.outputState()
// → { …v0.3 §5.11 的字段,
//     actuatorStatus: [{ id, battery, charging, link, low }] }   // low 按 §8.4 计算
```

- 事件：状态变化时照常发 `bio:actuators` 与 `bio:output-state`；电量每变化 1 个百分点最多发一次，间隔不小于 30 秒（**经验值**，避免刷屏）。
- 卡片与助手只读这两个接口，不得读驱动的内部状态（v0.3 §5.11）。

### 8.3 块里的 `actuator` 行（扩展区，L0）

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

### 8.4 低电量

- `low` 是带定义的中性事实：只在 `battery ≤ 15%` 时可以写，生产者**应该**写（15% 是**经验值**，没有找到玩具方面的依据）；块里的门槛固定为 15%，实现界面的提醒门槛可以另设。
- 生产者**不得**写“快没电了”“即将停止”“还能用 N 分钟”之类的推断；电量曲线因设备而异，百分比本身也常常不准（**未核实**）。
- 读法（非规范）：`low` 或 `link reconnecting` / `lost` 时，动作可能被裁掉或不执行，`feedback` 里的 `cut` / `refused` 可能是这个原因，不代表读者的意思；角色是否提及、怎样提及按模式（v0.3 §1.1）决定。

**兼容**：`actuator` 是新行名，v0.3 读者按未知行忽略；v0.3 校验器只给 `LINE_UNKNOWN` 警告。

### 8.5 停止失败与断线后状态未知（2026-09-18 新增）

`feedback` 事件与行的 `reason` 增加两个值（v0.3 §5.12）：

| 值 | 含义 | 何时写 |
|---|---|---|
| `stop-failed` | 停止指令重试后设备仍没有应答（v0.3 §5.9-9，`actuate` 返回 `refused: 'stop-failed'`） | 由实现写，`from: 'device'` |
| `maybe-running` | 设备断线且 `stopsOnDisconnect` 为假，实现不知道它停没停（v0.3 §5.9-8） | 断线时写一次；重连发完停止后不再写 |

两种情况实现都**必须**在界面上继续显示“可能仍在动”，并在 `outputState()` 里如实反映；**不得**据此推断设备实际状态。

诊断问题代码同时登记：`TOY_STOP_FAILED`、`TOY_MAYBE_RUNNING`、`TOY_EXCLUSIVE_BUSY`、`TOY_HANDSHAKE_TIMEOUT`（conformance-zh.md §4.4）。

## 9. 设备自带模式直通：`pattern="native"`

**问题**：很多玩具的卖点是自带模式（波浪、脉冲、随机……），用强度帧模拟不出来；v0.3 §5.9-5 只允许把**抽象模式**映射到自带模式，模型没法点名“用设备的第 3 个模式”。

**做法**：执行器在能力里列出自带模式；生产者把**用户开启了的**模式写进块；模型用 `<bio_act pattern="native" mode="…"/>` 点名。安全规则沿用 v0.3 §5.4、§5.8、§5.9。

### 9.1 能力声明：`nativePatterns` 的列表写法

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

### 9.2 用户开关

- 自带模式直通**逐台设备**开启，缺省关闭。
- `stoppable: false` 的模式另需用户**逐台设备**明确开启（v0.3 §5.9-5），缺省关闭；实现可以做成逐个模式开启。
- 没开启的模式不进块，模型写了也不执行。

### 9.3 块里的 `native` 行（扩展区，L0）

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

### 9.4 模型侧写法

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

### 9.5 档位与频率

- `maxPerReply`、`minIntervalMs`、`floor` 照 v0.3 §5.8 生效；直通动作和普通动作一起计数。
- 同一执行器上正在运行 `stoppable: false` 的模式时，后续动作排队到它结束；结束前排不下的记 `refused`（`feedback` 的 `acts` 段照常计数）。频率间隔从模式**结束**起算。
- 执行时帧只作包络：`[[0, 强度], [时长, 0]]`，给看门狗和 `deadline` 用；驱动收到后发自带模式指令，到点发停止。

### 9.6 停不下来的模式：护栏

v0.3 §5.9-5 的全部条件继续有效，这里写成可检查的形式：

1. **逐台设备明确开启**（§9.2），缺省关闭；没开启时不进块、不执行。
2. **只用于非风险输出**（§9.1）。
3. **已知最长时间**：`maxDurationMs` 必填；块里写出（§9.3-4）。
4. **持续提示**：运行期间界面一直显示“自带模式运行中，软件可能停不住，可拔出或按设备按钮”和预计剩余时间，不能被关掉，直到时间到或设备报告已停。
5. **照常发停止**：全局停止、单台停止、断线、看门狗都照常发停止指令（v0.3 §5.4-6、§5.4-8、§5.9-9），不因为“反正停不住”而省略。
6. **如实反馈**：停止指令发出后模式仍在运行时，`feedback` 事件的备注写 `native-unstoppable`，例：`stop by reader read @61s (native-unstoppable, reply -1, act 2)`；`feedback` 事件对象的 `reason` 写 `'native-unstoppable'`（任何 `from` 都可以用）。`outputState()` 另带 `nativeRunning: [{ id, n, name, stoppable, endsAt }]`。
7. 安全词（v0.3 §5.4-9）触发时照常全停，并按第 6 条记录。

### 9.7 记录

- `bio:actuate` 与 `replyActs()` 的动作带 `mode`（模型写的原值）；结果项带 `native: { n, name, stoppable, endsAt }`。
- `device:` 行可以写 `native 3 失控 until 22:03:10`；这是自由文本，不作为规范。
- `feedback` 的 `replay` 段对直通动作写 `replay native`。

**兼容**：v0.3 的解析器遇到 `pattern="native"` 会报 `BAD_PATTERN` 并退回 `pulse`，所以卡片和预设只应在块里出现 `native` 行时教模型写直通；实现升级到 v0.4 后按本节跳过。`mode` 属性对 v0.3 解析器是未知属性，会被忽略。`native` 行对 v0.3 读者是未知行。

## 10. 兼容与校验

- v0.3 的全部兼容承诺（v0.3 §7）继续有效。
- `<bio_act/>` 的直通写法（§9）在 v0.3 解析器里会退回 `pulse`；参考实现 `tools/bio-act.mjs` 只在调用方传入执行器能力（`opts.actuators`）时接受 `pattern="native"`，没传时跳过并记 `NATIVE_NO_CAPS`。
- 本文件改变数据含义的地方：`read` 在流式时是回看（§1）；相位行的峰值要结合 `carryover` 理解（§2）；基线带年龄与噪声（§3）；执行器重叠与 `clean`（§5）；away 的写法（§6）。旧读者忽略这些新属性、新行、新段时，读到的仍是 v0.3 含义的数据，只是少了新信息。
- 参考校验器在 `v="0.4"` 时检查：`stream` / `lag` 属性；`stream` 行（要求 `stream="yes"`、`lag` 一致、`pos` 需要 `peak` 且字数一致）；`carryover` 与 `lag` 的关系；`tail-max`；相位最短时长 `max(10 s, 2L)`；基线的 `age`、`noise`、`changed`、`manual` 的 `set`；弃用方法名；`read-peak-rel`；away 相对写法与 `unfocused`；`stream="yes"` 时不得有 `read-pos`；`actuator` 行（执行器 id、段顺序、电量范围、`low` 只在 ≤ 15%、每个执行器一行）；`native` 行（序号升序不重复、括号只用于 `unstoppable, 时长, opt-in`、`haptics off` 时不得出现、每个执行器一行）；`feedback` 备注里的 `native-unstoppable`；相位行与 `stream` 行的 `act` 段（秒数不得大于相位时长、`mean` 在 1–100、条数与单复数一致、不得写 0、括号里只能是登记过的风险输出）；`clean` 行（括号里是 `gen` / `read` / `write`、每个相位一行、必须有 `sec N/M`、M 等于相位时长、N 不得大于相位时长减去 `act` 秒数、N ≥ `max(10 s, 2L)` 且 ≥ 30%、峰值时刻不超出相位、`carryover` 与 `lag` 的关系、对应相位行必须有 `act` 段）；来自执行器的 `pressure` 等信号行（数值必须带 `+` / `-`，不得写物理单位）。样例：`fixtures/blocks/valid/13-v04-actuator-native.txt`、`14-v04-act-clean.txt`、`fixtures/blocks/invalid/20-v04-actuator-native.txt`、`21-v03-native-unstoppable.txt`、`22-v04-act-clean.txt`。

## 11. 待定（本草案没有采纳，留待讨论）

- **负向事件** `dip N @Ns`：明显减速也作为中性事实输出。朝向和注意的主要表现就是心率减速（Bradley 2009，**有依据**）。是否进协议未定。
- **低质量 HRV** `hrv N ms (low-quality)`：v0.3 规定 `rr-loss` > 5% 不输出 hrv；腕式上可能几乎永远没有 hrv。是否允许放宽到 ≤ 20% 并加标记，待实测。
- **基线情境字段**（刚喝过咖啡、刚运动过）：SPR 2024 建议记录，影响幅度**未核实**。
- **`hr-high` 的缺省值**（120 bpm、10 分钟）**未核实**，要找到可引用的来源或实测后再定。
- `lag` 缺省值与流式进度的精度，都要真机实测后再定稿。
- **只有两档电量的设备**（满 / 低）怎样上报：可能加 `battery low` 写法，待有设备实测。
- **低电量门槛** 15%：经验值，要按实测的降功率点再定。
- **自带模式的强度**：多数设备的自带模式能否调强度、调了是否生效，待逐台实测（`device-lab` 与真机）。
- **直通的名字冲突**：多个执行器有同名模式时，`target="*"` 是否应全部触发，待真机体验后定。
- **振动 / 触觉刺激本身对心率的影响幅度**：本次没有找到一手来源（**未核实**）。有了可引用的数字或自测数据后，才谈得上给读法更具体的参考；在那之前只写 `act` / `clean` 这类中性事实（§5）。
- **`clean` 的两个阈值**（干净秒 ≥ `max(10 s, 2L)`、≥ 相位时长的 30%）是**经验值**，要按真机数据调；干净秒不连续时统计怎样合并最合适，也待实测。
- **`act` 的强度取法**：多个执行器同一秒时取最大值（§5.1-3），也可以取和或取主执行器，待真机体验后定。
- **`stream` 行的 `clean` 统计**：`stream` 行目前只支持 `act` 段，不支持 `clean`（`body` 区间与相位不一一对应），要不要补待定。
- **设备确认执行的时间**：现在只能记生产者发出的时间（§5.1-1）。将来有设备能回报“已执行 / 已停止”时，是否另加一个更可信的口径，待定。

## 本文件另用到的来源

- Vila et al. 2007, 心脏防御反应综述（摘要） — https://doi.org/10.1016/j.ijpsycho.2007.07.004
- Frontiers in Psychology 2019, 心脏防御反应（全文，转引 Vila） — https://doi.org/10.3389/fpsyg.2019.01213
- Quer et al. 2020, 静息心率的个体内与个体间差异 — https://doi.org/10.1371/journal.pone.0227709
- 其余见 v0.3 附录 B。
