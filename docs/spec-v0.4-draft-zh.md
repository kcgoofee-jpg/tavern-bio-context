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

## 7. 兼容与校验

- v0.3 的全部兼容承诺（v0.3 §7）继续有效。
- 本文件改变数据含义的地方：`read` 在流式时是回看（§1）；相位行的峰值要结合 `carryover` 理解（§2）；基线带年龄与噪声（§3）；away 的写法（§5）。旧读者忽略这些新属性、新行、新段时，读到的仍是 v0.3 含义的数据，只是少了新信息。
- 参考校验器在 `v="0.4"` 时检查：`stream` / `lag` 属性；`stream` 行（要求 `stream="yes"`、`lag` 一致、`pos` 需要 `peak` 且字数一致）；`carryover` 与 `lag` 的关系；`tail-max`；相位最短时长 `max(10 s, 2L)`；基线的 `age`、`noise`、`changed`、`manual` 的 `set`；弃用方法名；`read-peak-rel`；away 相对写法与 `unfocused`；`stream="yes"` 时不得有 `read-pos`。

## 8. 待定（本草案没有采纳，留待讨论）

- **负向事件** `dip N @Ns`：明显减速也作为中性事实输出。朝向和注意的主要表现就是心率减速（Bradley 2009，**有依据**）。是否进协议未定。
- **低质量 HRV** `hrv N ms (low-quality)`：v0.3 规定 `rr-loss` > 5% 不输出 hrv；腕式上可能几乎永远没有 hrv。是否允许放宽到 ≤ 20% 并加标记，待实测。
- **基线情境字段**（刚喝过咖啡、刚运动过）：SPR 2024 建议记录，影响幅度**未核实**。
- **`hr-high` 的缺省值**（120 bpm、10 分钟）**未核实**，要找到可引用的来源或实测后再定。
- `lag` 缺省值与流式进度的精度，都要真机实测后再定稿。

## 本文件另用到的来源

- Vila et al. 2007, 心脏防御反应综述（摘要） — https://doi.org/10.1016/j.ijpsycho.2007.07.004
- Frontiers in Psychology 2019, 心脏防御反应（全文，转引 Vila） — https://doi.org/10.3389/fpsyg.2019.01213
- Quer et al. 2020, 静息心率的个体内与个体间差异 — https://doi.org/10.1371/journal.pone.0227709
- 其余见 v0.3 附录 B。
