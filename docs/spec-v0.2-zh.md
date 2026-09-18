# Tavern Bio-Context（TBC）v0.2 规范

> 状态：**历史稿，已被 v0.3 定稿候选取代**（`spec-v0.3-draft-zh.md`）。原状态：v0.2 定稿候选，2026-09-17。参考实现 heartlink 0.8.2（页面内全部实现；本机桥见 0.9）。v0.1 草稿（`spec-zh.md`）保留作历史；v0.2 只加不改，v0.1 读者忽略不认识的行与属性即可。

## 0. 一句话

接入脚本把读者的生理信号整理成**一个固定格式、不带解释**的文本块注入提示词，同时写聊天变量、广播页面事件；预设与卡片只依赖这三样。别的信号源往总线里 push，执行器往总线里登记一行状态；跨进程走本机桥。

## 1. 分层

同 v0.1 §1，增加两条：
- **总线层**（页面内）：`window.tbc`，见 §5。
- **桥层**（跨进程）：本机 WebSocket，见 §6。

## 2. `<bio_context>` 文本块

每次用户可见生成前注入一次，`system` 角色、聊天内深度 0、参与世界书扫描。所有键固定英文，一行一个，块内不许出现结论性词汇。

### 2.1 首行属性

```
<bio_context v="0.2" mode="author|character" source="<实现名>" [device="whoop-5.0"] [transport="ble|bridge|push|api|bus"] [cadence="1s"] [rr="yes|no"] [trigger="normal|swipe|regenerate|continue|impersonate"]>
```

- `device`：小写、连字符，设备型号或名字前缀；不放序列号。
- `transport`：实时样本怎么来的。`bus` 表示来自页面总线的外部源。
- `cadence`：主信号（心率）的采样间隔，最近 60 个样本的中位间隔；`≥ 30s` 视为稀疏来源（§2.6）。
- `rr`：最近 30 个样本里有没有心跳间期。
- `trigger`：本轮生成的触发类型。`continue` 时块是上一轮的重放，不重算相位。

### 2.2 固定行（顺序固定）

| 行 | 格式 | 说明 |
|---|---|---|
| sent | `sent: HH:MM:SS` | 发送时刻 |
| baseline | `baseline: 73 bpm (quiet-median\|p20\|manual, n=…; hrv 99 ms)` 或 `baseline: n/a (session too short)` | 本场基线 |
| prior（可选） | `prior(<source>, <date>): recovery 67 \| hrv 69.6 ms \| rhr 59 bpm \| sleep 6.5 h \| spo2 95.5% \| skin 33.6°C` | 非实时来源的日级先验，必须带日期；只写拿到的字段 |
| history | `history: read-peaks … \| read-dur … \| hrv …` 或 `history: n/a` | 最近 ≤ 8 轮 |
| gen | `gen: 79s (ttft 56s, reasoning 8s, body 15s) \| hr 80→75 [74–80] \| cov 96%` | 看生成 |
| read | `read: 2:03 \| hr 75→78 [70–83] peak 83 @32s \| cov 94% \| rr-loss 12% \| hrv 95 ms [\| flag: too-long (likely away)]` | 读回复（勘误 2026-09-18：原示例区间写成 `[70–78]`，与峰值矛盾；区间是全部样本的最小值和最大值，峰值不超过最大值） |
| read-pos（可选） | `read-pos: peak ~62% (~870/1400 chars, para 4/7) @6 cps est\|cal` 或 `read-pos: partial (read time covers ~30% of 1000 chars @6 cps est), peak at 68% of read time` | 峰值位置；`partial` = 读时长 × 阅读速度 < 0.8 × 回复字数 |
| write | `write: 10s, 45 chars, pauses 1, edits 0 \| hr 78→75 [75–78] \| cov 100% \| rr-loss 100%` | 写消息 |
| away | `away: HH:MM:SS–HH:MM:SS hidden\|idle [min–max]; …` 或 `away: none` | 离开区间 |
| send | `send: 75 bpm (+3%)` | 发送时心率与相对基线 |
| `<kind>` 行（可选，0+ 行） | `pressure(civet, 100ms): read 7.9→12.3 kPa peak 14.1 @41s \| write 8.0→8.2 kPa` | 非心率生理信号，按相位统计 |
| env（可选） | `env(mijia, 10s): 26.3°C 58% rh` | 房间温湿度最近值（10 分钟内），不进相位 |
| device（可选，0+ 行） | `device: coyote ch-A 35/100 "经典" 12s` | 执行器登记的状态，≤ 120 字符，无尖括号 |
| series | `series(10s from HH:MM:SS): 75 75 · 73 …` | 10 秒桶的原始序列 |
| note | 固定一句 | `observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence` |

### 2.3 覆盖率 `cov`

`cov = 该相位样本数 / (相位时长 / cadence)`，封顶 100%。有 `cadence` 才输出。解释层约定：低于 70% 的相位不可靠（Apple 2026 心率研究的有效性门槛）。

### 2.4 相位边界

同 v0.1：`send / stream_start / reasoning_end / reply_end / type / activity / visible / hidden / swipe`；`continue` 不产生 send 与 reply_end。

### 2.5 判断尺度（写在解释层，不写在块里）

相对基线 10% 以内为噪声；持续高 20% 以上且出现在 read 相位才算明确反应；HRV 明显低于安静值 = 绷着或亢奋，明显高 = 放松；`flag: too-long` 的 read 不作阅读反应；`partial` 的 read-pos 不作段落位置。

### 2.6 稀疏来源

`cadence ≥ 30s`：不输出 `series` 与 `hrv`；相位样本 < 5 时写 `n/a (sparse)`。适用于 iOS 快捷指令推送、导出文件回放等。

## 3. 聊天变量 `bio`

```json
{ "v": "0.2", "source": "heartlink", "updatedAt": 1789560584206, "mode": "author", "baseline": 73,
  "prior": { "source": "whoop-api", "date": "09-15", "fields": { "recovery": 67, "hrv": 69.6, "rhr": 59 } },
  "last": { "t": …, "readStart": …, "readSec": 117, "readPeak": 83, "readMean": 77, "readFirst": 75, "readLast": 78, "peakAtSec": 32, "hrv": 95, "writeSec": 7, "sendBpm": 80, "baseline": 73, "genSec": 40, "replyChars": 1400,
            "readPos": { "pct": 62, "chars": 870, "replyChars": 1400, "para": 4, "paraCount": 7, "cps": 6, "source": "est" } },
  "turns": [ "…最近 20 轮，同 last 结构…" ],
  "lastSignal": { "t": …, "text": "…模型思维链里的 Reader Signal 原文…" } }
```

`readPos` 为 `partial` 时形如 `{ "partial": true, "readPct": 30, "peakPct": 68, "replyChars": 1000, "cps": 6, "source": "est" }`。每条 AI 消息的 `extra.bio` = 对应轮的 `last` 结构 + `signal`；写入必须镜像进 `swipe_info[swipe_id].extra.bio`。

## 4. 页面事件

`bio:sample`（每个样本，detail 同 §5 的 Sample）、`bio:inject`（每次发送一次，detail `{ text, mode, summary }`）、`bio:state`（连接/模式/来源变化，detail 同 `getState()`）。

## 5. 页面总线 `window.tbc`

```js
tbc.version                       // '0.2'
tbc.push(sample)                  // Sample = { t?, source, kind, value, unit?, cadence?, quality?, device?, rr? }
tbc.registerContext(source, fn)   // fn() → string | null；生成 device: 行
tbc.unregisterContext(source)
tbc.setPrior(prior) / tbc.getPrior()   // prior = { source, date, fields }
tbc.on(event, fn) / tbc.off(event, fn)
tbc.sources()                     // { signals: { hr: {…}, pressure: {…} }, contexts: [...] }
```

`kind` 保留值：`hr`（主线，走全部相位统计）、`rr`、`pressure`、`temperature`（体温）、`room_temperature`、`humidity`、`spo2`、`stress`、`button`、`battery`。两个实现并存时以 `version` 高者为总线，低者只 `push`。

## 6. 本机桥（0.9，规范先行）

`ws://127.0.0.1:27130/tbc/v0.2`，JSON 每行一条：

```json
{ "event": "bio:sample", "detail": { "t": 1789600000000, "source": "heartlink-desk", "kind": "hr", "value": 78, "rr": [0.79] } }
{ "event": "bio:inject", "detail": { "text": "<bio_context …>", "mode": "author", "summary": { … } } }
{ "event": "bio:state",  "detail": { "connected": true, "device": "whoop-5.0", "cadence": "1s", "clients": 2 } }
{ "event": "bio:prior",  "detail": { "source": "whoop-api", "date": "09-14", "fields": { "recovery": 67, "hrv": 69.6, "rhr": 59 } } }
{ "cmd": "push",    "sample": { … } }
{ "cmd": "context", "source": "coyote", "line": "coyote ch-A 35/100 \"经典\" 12s" }
{ "cmd": "prior",   "prior": { "source": "whoop-api", "date": "09-15", "fields": { … } } }
{ "cmd": "hello",   "client": "sillytavern-heartlink", "version": "0.9.0" }
```

桥只绑 127.0.0.1；页面侧脚本连上桥后把 `bio:sample` 喂进本地 `tbc.push`、把 `bio:prior` 交给 `tbc.setPrior`，其它逻辑不变；页面自己连着蓝牙时忽略桥的 `hr`。页面用 `cmd: state` 回传基线、当前相位、上一轮摘要，桥的 UI 据此显示相位。浏览器限制：https 页面连 `ws://127.0.0.1` 在 Chrome / Firefox 允许（回环例外），Safari 不允许。参考实现：heartlink 0.9.1 + heartlink Desk（macOS）。

## 7. 实现约束（宿主为 SillyTavern 时）

1. 不主动调用 `saveChat`；消息级数据在 `CHARACTER_MESSAGE_RENDERED` 里同步写，聊天变量走元数据保存接口。
2. 只对用户可见生成注入：`GENERATION_STARTED` 的 type 白名单 + `dryRun` 过滤；有 `setExtensionPrompt` 的 `filter` 参数（1.13.2+）就同时传。
3. 一个聊天同一时刻只在一个窗口跑接入脚本。
4. 能力探测代替版本号；缺 `STREAM_TOKEN_RECEIVED` 就没有 ttft，缺 `STREAM_REASONING_DONE` 就靠 `</thinking>` 正则。

## 8. 安全与隐私

- 接入脚本除声明的本机桥地址外不发起任何网络请求；块内不放设备序列号、令牌、IP。
- 生理数据只在本机流转；随提示词发往用户自己配置的模型服务商，此外不去任何地方。
- 反向层（执行器）必须有时长上限、强度上限、全局停止；页面卸载或桥断线即停。
- 未知设备只读广播，不写特征。

## 9. 与 v0.1 的差异一览

新增：首行 5 个可选属性；`prior`、`env`、`<kind>`、`device` 行；`cov`；`read-pos: partial`；变量里的 `prior` 与 `readPos.partial`；总线 `setPrior/getPrior`；§6 桥消息；§7 实现约束；§8 安全。未改：其余全部行的格式与顺序、三个事件名、变量名。
