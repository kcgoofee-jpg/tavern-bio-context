# 提案草稿：酒馆生物信号上下文（Tavern Bio-Context, TBC）v0.1

> 状态：v0.1 草稿（历史）。**当前规范见 [spec-v0.2-zh.md](spec-v0.2-zh.md)**（2026-09-17）。原文：目的是让**任何**心率/穿戴设备接入脚本、**任何**预设作者、**任何**卡片作者用同一套约定协作，而不是各写各的。heartlink 是第一个实现。

## 0. 一句话

设备侧脚本负责把读者的生理信号整理成一个固定格式的文本块注入提示词、写进聊天变量、广播页面事件；预设和卡片只依赖这三样，不关心设备是 WHOOP 还是小米手环，也不关心连接方式是 Web Bluetooth 还是本机桥。

## 1. 分层

| 层 | 谁做 | 产出 | 约定 |
|---|---|---|---|
| 设备层 | 接入脚本 | 每秒样本 `{t, bpm, rr[]}`，可选电量/设备信息 | 标准蓝牙心率协议（0x180D）优先；私有协议自行适配，但样本形状一致 |
| 相位层 | 接入脚本 | 页面事件 `send / stream_start / reasoning_end / reply_end / type / activity / visible / hidden / swipe` | 事件名固定；来源是酒馆核心事件与 DOM，不依赖具体卡片 |
| 上下文层 | 接入脚本 | `<bio_context>` 文本块（本文第 2 节）；聊天变量 `bio`（第 3 节）；页面事件 `bio:*`（第 4 节） | **这一层是标准的核心** |
| 解释层 | 世界书 / 预设 | 常驻条讲读法；模式条讲用法；思维链一行裁决 | 只消费上下文层，不读设备 |
| 反向层（可选） | 另一个扩展 | 模型输出 → 设备动作（buttplug 等） | 只订阅 `bio:*` 与聊天变量，不与上下文层耦合 |

## 2. `<bio_context>` 文本块

注入方式：每次用户可见的生成前，一条 `system` 消息，聊天内深度 0，参与世界书扫描。后台生成不注入。

```
<bio_context v="0.1" mode="author|character" source="heartlink">
sent: 20:15:22
baseline: 73 bpm (quiet-median, n=1800; hrv 99 ms)
history: read-peaks 78 84 92 83 | read-dur 2:03 1:40 3:10 1:57 | hrv 95 · 88 ·
gen: 40s (ttft 8s, reasoning 8s, body 25s) | hr 82→75 [73–82]
read: 1:57 | hr 75→78 [72–83] peak 83 @32s | rr-loss 68%
write: 7s, 27 chars, pauses 0, edits 0 | hr 78→80 [78–80] | rr-loss 100%
away: 20:13:17–20:15:15 idle [72–83]
send: 80 bpm (+10%)
series(10s from 20:10:20): 75 75 75 75 73 74 73 73 72 70 71 75 77 76
note: observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence
</bio_context>
```

字段规则：
- 每行一个字段，`key: value`，键固定为英文小写；值里的时长用 `m:ss` 或 `Ns`；区间用 `[min–max]`；缺失写 `n/a`，不省略行。
- `mode` 只有两个值：`author`（作者反馈，剧情内无人知晓）、`character`（角色感知，允许映射到 `{{user}}` 的可观察身体线索）。
- `history` 最多 8 轮，按时间顺序，最右是上一轮。
- 允许扩展字段（如 `skin-temp`、`spo2`、`breath`），但必须是新行，不改已有行的语义。
- 可选字段 `read-pos`（v0.1.1 提案，heartlink 0.7 实现）：把 read 相位的峰值时刻换算成“大约读到回复的哪里”。格式：
  `read-pos: peak ~62% (~870/1400 chars, para 4/7) @6 cps est`
  - 百分比 = 峰值时刻 × 阅读速度 ÷ 回复正文字数，封顶 100%；`para i/n` 是按空行切分的段落序号；`@N cps` 是采用的阅读速度（字/秒）；`est` 表示估计，`cal` 表示由本场历史自校准（用最近几轮 回复字数 ÷ 读时长 的中位数，只取读时长 20–600 秒且无 too-long 标记的轮次）。
  - 回复正文字数按去掉 HTML 标签、`<thinking>`/`<style>` 块后的可见字符计，中文默认 6 cps，英文默认 20 cps（按正文中 CJK 字符占比选）。
  - 峰值不明显（峰值 ≤ 起点 +3 bpm）或 read 相位带 too-long 标记时不输出本行。
  - 它仍然是记录不是解释：只说“峰值大约对应哪一段”，不说“读者对那段兴奋”。
- 块内**不得**出现解释性结论（“读者很兴奋”这类），解释权属于解释层。

## 3. 聊天变量 `bio`

```json
{
  "v": "0.1",
  "source": "heartlink",
  "updatedAt": 1789560584206,
  "mode": "author",
  "baseline": 73,
  "last": { "t": 1789560584206, "readSec": 117, "readPeak": 83, "readMean": 77, "peakAtSec": 32, "hrv": null, "writeSec": 7, "sendBpm": 80, "baseline": 73, "genSec": 40 },
  "turns": [ "...最近 20 轮，同上结构..." ]
}
```

`last` / `turns[]` 自 v0.1.1 提案起可带 `readPos`：`{ pct, chars, replyChars, para, paraCount, cps, source }`，与块里的 `read-pos` 行同源；该轮没有输出 read-pos 时为 `null`（heartlink 0.7.1 起写入）。

用途：带 MVU 等系统的卡片读取；导出聊天时随 JSONL 一起带走，可做统计。

## 4. 页面事件（主窗口 `dispatchEvent`）

| 事件 | detail | 频率 |
|---|---|---|
| `bio:sample` | `{t, bpm, rr}` | 每个样本 |
| `bio:inject` | `{text, mode, summary}` | 每次注入 |
| `bio:state` | 连接/模式/基线快照 | 状态变化 |

反向扩展（震动、玩具）只订阅这些事件，不直接连设备侧。

## 5. 解释层最小约定

- 世界书：一条常驻条说明 `<bio_context>` 的读法；两条按 `mode="author"` / `mode="character"` 触发的用法条。
- 预设思维链（可选）：在“读输入、定剧情走向”的那一步加一行 `Reader Signal`，只产出“节奏 / 张力 / 尺度”三项调节，不写入正文。
- 不得让模型复述数值、提到设备，除非卡片明确设定角色拥有监测能力。

## 6. 通用适配声明（接入脚本必须写明）

| 环境 | 直连（Web Bluetooth） | 本机桥（WebSocket） |
|---|---|---|
| Windows / macOS / Linux 的 Chrome、Edge | 支持 | 支持 |
| Android Chrome、Edge | 支持 | 支持 |
| iOS 任何浏览器、macOS Safari | 不支持 | 支持 |
| Android WebView 类浏览器（Via 等） | 不支持（WebView 无 Web Bluetooth） | 支持 |
| 局域网 http 地址访问酒馆 | 不支持（非安全上下文） | 支持 |
| localhost / https | 支持 | 支持 |

## 7. 与现有轮子的关系

- buttplug.io / Intiface：设备**控制**协议，不做信号→提示词；反向层直接复用它。
- SillyTavern 角色卡 v3、STScript、酒馆助手 API：本提案不改它们，只在其上约定文本块、变量名和事件名。
- 目前（2026-09-16 检索）没有找到任何“生理信号进提示词”的公开约定，本草稿是第一份。

## 8. 待定

- 命名：`bio_context` 还是沿用 `heartlink_timeline`；变量名 `bio` 还是 `heartlink`。
- 多设备并存时的 `source` 优先级。
- `read-pos` 已作为 v0.1.1 可选字段提案（见第 2 节）。真机（2026-09-16，回复 3809 字、读 2:17、峰值 @133s）暴露的问题：读时长 × cps 远小于回复字数时（读者只读了一部分或在跳读），峰值落在读相位末尾却被换算成 21%，位置含义不可靠。待定：是否加 `partial` 标记（readSec × cps < 0.8 × replyChars 时），或改用“峰值在读相位中的相对位置”作为兜底表述。

### v0.2 修改提案（2026-09-17，依据 docs/st-compat-audit-2026-09-zh.md）

- P-1 头部属性：`device`、`transport`（ble|bridge|push|api）、`cadence`、`rr`、`trigger`（normal|swipe|regenerate|continue|impersonate）。
- P-2 相位行加样本覆盖率 `cov`（Apple 2026 研究门槛：时段覆盖 ≥70% 才算有效）。
- P-3 稀疏来源模式：cadence ≥ 30 s 不输出 `series`/`hrv`，样本 < 5 的相位写 `n/a (sparse)`。
- P-4 `read-pos` 加 `partial`：读时长 × cps < 0.8 × 回复字数时不给百分比。
- P-5 持久化规则：设备脚本不主动调用宿主整聊天保存；消息级数据在宿主自己保存前写入并镜像进 swipe 数据；聊天变量走元数据保存接口。
- P-6 生成门控：优先用宿主的注入过滤能力（ST 1.13.2+ `filter`），type 白名单作回退；`continue` 只更新 `trigger`。
- P-7 解释层投递：全局世界书之外，允许在 `WORLDINFO_SCAN_DONE`（ST 1.15+）里程序化加入同样三条。
- P-8 单窗口：一个聊天同一时刻只能有一个窗口跑设备脚本（ST #5864）。
- P-9 安全与隐私：除声明的本机桥地址不得发起网络请求；块内不放设备 ID / 令牌；反向层必须有时长上限与全局停止。
- P-10 反向层契约：消费者只读 `bio:inject.detail.summary` 与 `bio:sample`，协议不定义设备控制。

### v0.1.2 增量行（2026-09-17，heartlink 0.8 已实现）

块内在 `send:` 之后、`series` 之前允许出现两种可选行，v0.1 读者忽略即可：
- `<kind>(<source>[, <cadence>]): read a→b unit peak p @Ns | write a→b unit`——非心率信号（如 pressure）按同一相位切分；本轮没数据写 `n/a (no data in this turn)`，只有最近 10 秒有值写 `now v`。
- `device: <一行设备状态>`——执行器通过 `window.tbc.registerContext(source, fn)` 登记，≤120 字符，去尖括号。
页面内总线 `window.tbc`（`push` / `registerContext` / `unregisterContext` / `on` / `off` / `sources`）见 `device-interface-zh.md` §1–§3。
