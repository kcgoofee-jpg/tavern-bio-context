# TBC 设备对接标准（草案 v0.2-draft，2026-09-17）

给两类人看：**有信号源的**（心率带、边缘控制气压传感器、手表推送、健康桥）和**有执行器的**（玩具控制器、电刺激、飞机杯、边缘控制机、MCP 服务器）。目标只有一个：谁想把"读者此刻的身体"送进对话、或者想让设备跟着读者的身体走，都走同一组接口，不必再各自发明格式。

## 0. 一句话

- 信号进来：往总线 `push` 样本；上下文块由参考实现（heartlink）统一生成。
- 设备状态进来：`registerContext`，块里多一行 `device:`。
- 设备跟着走：订阅 `bio:inject` / `bio:sample`。
- 跨进程：本机桥把同样的事件变成 WebSocket JSON。
- 词汇：执行器用 buttplug v4 的 OutputType/InputType 名，加两个我们自己的（`estim`、`hr`）。

## 1. 总线：`window.tbc`

同一页面内（酒馆助手脚本、UI 扩展、油猴脚本）共享一个对象；不存在时由第一个加载的实现创建。

```js
window.tbc = {
  version: '0.2',
  push(sample),                     // 信号源写入，见 §2
  registerContext(source, fn),      // 执行器/其它来源登记"我这一行怎么写"，fn() 返回字符串或 null，见 §3
  unregisterContext(source),
  on(event, handler), off(event, handler),   // 等价于 window.addEventListener('bio:…')
  sources(),                        // 当前登记的信号源与上下文源
};
```

事件仍是 v0.1 的三个，不改名：`bio:sample`、`bio:inject`、`bio:state`。

## 2. 信号源：`tbc.push(sample)`

```ts
type Sample = {
  t: number;              // ms epoch
  source: string;         // 'heartlink' | 'civet' | 'eom' | 'buttplug' | 'shortcuts' | …
  kind: 'hr' | 'rr' | 'pressure' | 'temperature' | 'spo2' | 'stress' | 'button' | 'battery' | string;
  value: number;          // hr: bpm；rr: 秒；pressure: kPa（DG-LAB 灵猫）或设备原始单位（buttplug 不统一，见下）
  unit?: string;          // 'bpm' | 's' | 'kPa' | 'raw'
  cadence?: string;       // '1s' | '100ms' | '30s' | '300s'
  quality?: number;       // 0–1，来源自己的置信度（腕动、丢包）
  device?: string;        // 'whoop-5.0' | 'civet-47L124000' | 'edge-o-matic-3000'
};
```

规则：
- 心率仍是 best practice：`kind: 'hr'` 的样本进入 v0.1 全部相位统计；`rr` 进 HRV。
- 其它 kind 按来源分组，块里各自一行（§4），**不做跨 kind 的合成指标**（不把气压和心率算成一个"兴奋度"）。
- 稀疏来源（cadence ≥ 30 s）：不进 `series`，相位行样本 < 5 写 `n/a (sparse)`。
- buttplug v4 的 `InputReading.Pressure` 单位不统一（规范原话"Sensor Units Are Not Standardized"），写 `unit: 'raw'`，块里只给相对变化。

已知可以直接对上的信号源：

| 来源 | 接法 | kind |
|---|---|---|
| 标准 BLE 心率设备（WHOOP / Polar / 华为 / Garmin…） | heartlink（Web Bluetooth 0x2A37） | hr, rr |
| DG-LAB 灵猫边缘控制传感器 | 开源 BLE 协议：0x180C/0x150B 通知，`0x50…D0` 开启 100 ms 气压上报，int16 LE /100 = kPa | pressure |
| Edge-o-Matic 3000 | 固件开源，本机 WebSocket/REST 有压力与 arousal 值 | pressure |
| buttplug v4 `InputCmd Subscribe` | Battery / Rssi / Pressure / Button | 同名小写 |
| Apple Watch（iOS 快捷指令 POST，always-here 路线） | 本机桥 HTTP 入口 | hr, hrv（稀疏） |
| 健康桥（Akari Pulse 类，MCP/HTTP） | 本机桥 | 日级 `prior`（另立提案） |

## 3. 执行器把自己的状态送进上下文：`tbc.registerContext(source, fn)`

执行器项目最常见的两个诉求：**让模型知道设备正在做什么**，**让设备跟着读者走**。第一个用这一节，第二个用 §5。

```js
tbc.registerContext('coyote', () => `coyote ch-A 35/100 "经典" 12s | ch-B 0`);
tbc.registerContext('handy', () => `handy stroke 40% 1.2 Hz since 00:41:10`);
```

生成器在每次注入前调用所有 fn，按登记顺序写成：

```
device: coyote ch-A 35/100 "经典" 12s | ch-B 0
device: handy stroke 40% 1.2 Hz since 00:41:10
```

约束：一行 ≤ 120 字符；只写事实（强度、模式、持续时间），不写"用户很爽"；不写设备序列号、令牌、IP。`mode="author"` 时这些行同样是幕后信息，角色不知道；`mode="character"` 时允许角色察觉设备带来的可观察反应，仍不点名设备。

## 4. 块格式增量（相对 v0.1）

```
<bio_context v="0.2" mode="author" source="heartlink" device="whoop-5.0" transport="ble" cadence="1s" rr="yes" trigger="normal">
sent: …
baseline: …
history: …
gen: … | cov 96%
read: … | cov 94% | rr-loss 6% | hrv 26 ms
read-pos: …            （或 read-pos: partial …）
write: …
away: …
send: …
pressure(civet, 100ms): read 7.9→12.3 kPa peak 14.1 @41s | write 8.0→8.2      （有该 kind 时才出现）
device: coyote ch-A 35/100 "经典" 12s                                            （有登记时才出现）
series(10s from …): …
note: …
</bio_context>
```

新增键：头部 5 个属性、`cov`、`partial`、`<kind>(<source>, <cadence>):` 行、`device:` 行。其余不变；v0.1 的读者（世界书）遇到不认识的行应忽略。

## 5. 设备跟着读者走：订阅

```js
window.addEventListener('bio:inject', (e) => {
  const { summary, mode } = e.detail;   // summary: { baseline, readPeak, readMean, readFirst, hrv, readPos, sendBpm, … }
});
window.addEventListener('bio:sample', (e) => { /* e.detail: Sample，实时 */ });
```

推荐用法：把 `summary.readPeak / summary.baseline` 作为强度上限的缩放系数，而不是直接映射；`hrv` 明显低于 `summary.baseline.hrv` 时降档。协议不规定映射曲线。

跨进程（Intiface 插件、MCP 服务器、Windows 桥、MultiFunPlayer 插件）：本机桥（heartlink 0.9）在 `ws://127.0.0.1:27130/tbc/v0.2` 推送同样的消息：

```json
{ "event": "bio:inject", "detail": { "text": "<bio_context …>", "mode": "author", "summary": { … } } }
{ "event": "bio:sample", "detail": { "t": 1789600000000, "source": "heartlink", "kind": "hr", "value": 78 } }
```

反方向（执行器往桥里 `push` 样本或 `registerContext`）同一条连接：

```json
{ "cmd": "push", "sample": { … } }
{ "cmd": "context", "source": "coyote", "line": "coyote ch-A 35/100 \"经典\" 12s" }
```

## 6. 词汇表

执行器状态行与将来的意图通道都用 buttplug v4 的名字，避免再造：

| 类型 | 词 | 备注 |
|---|---|---|
| 输出 | Vibrate, Rotate, Oscillate, Constrict, Spray, Temperature, Led, Position, HwPositionWithDuration | buttplug v4 OutputType 原文 |
| 输出（补） | Estim | 电刺激（DG-LAB 郊狼 A/B 通道 0–100、restim、PiShock），buttplug 没有 |
| 输入 | Battery, Rssi, Pressure, Button | buttplug v4 InputType 原文 |
| 输入（补） | hr, rr, hrv, temperature, spo2, stress | 生理量，小写 |
| 轴 | TCode L0/L1/L2/R0/R1/R2/V0/V1/A0… | OSR2/SR6/OSSM/coyote-socket 用 TCode；`Position` 对应 L0 |

## 7. 安全（对执行器方的要求，借鉴 dsh-toy）

1. 任何由 `bio:*` 驱动的输出必须有时长上限（默认 30 s 无新指令即停）与强度上限。
2. 必须有全局停止，且页面卸载 / 桥断线 = 停止。
3. 分享令牌、API key、设备 ID 不得出现在模型可见文本（块、世界书、消息）里。
4. 只读发现优先：不认识的设备只扫描广播，不写特征。
5. 生理数据只在本机流转；桥默认只绑 127.0.0.1。

## 8. 生态里现成能接的东西（男性向设备为主，2026-09 核对）

| 项目 | 类型 | 接口 | 可对接点 |
|---|---|---|---|
| buttplug / Intiface Central（v4 协议） | 设备中枢，750+ 设备含飞机杯、电刺激、机器 | WebSocket 12345，OutputCmd/InputCmd | 执行器 + 传感器（Pressure）双向 |
| The Handy | 飞机杯 | REST v3（Swagger）、固件 v4 走 buttplug、浏览器蓝牙 | 执行器；MagicHandy 已是 LLM 聊天控制 Handy 的实现 |
| Kiiroo Keon、Lovense Solace/Max | 飞机杯 | buttplug | 执行器 |
| OSR2 / SR6 / SSR1、OSSM（556★） | 开源机器 | TCode 串口/WebSocket，MultiFunPlayer（260★）做中枢 | 执行器（Position） |
| DG-LAB 郊狼 2.0/3.0（dungeonlab-open/dglab-bluetooth-protocol，654★） | 电刺激 | 官方开源 BLE 协议；open-DGLAB-controller WS `ws://127.0.0.1:60536/1` `set_pattern`；buttplug-dg-lab、coyote-socket（TCode） | 执行器（Estim） |
| DG-LAB 灵猫边缘控制传感器 | **气压传感器** | 官方开源 BLE 协议，100 ms 上报 | 传感器（pressure） |
| Edge-o-Matic 3000（154★） | 边缘控制机（压力传感 + 输出） | 固件开源，插件系统 eom-plugins，Web 远控 | 传感器 + 执行器 |
| restim（87★）/ Stereostim / FOC-Stim、PiShock | 电刺激 | 以 TCode 设备身份注册进 Intiface；funscript | 执行器（Estim） |
| XToys.app | 浏览器 Web Bluetooth 控制台 | webhook / WebSocket 脚本 | 执行器 |
| F8Studio（feel8-fun） | 节点式信号路由：视频/游戏/音频/**传感器** → 玩具 | NATS/OpenAPI（骨架阶段） | 未来的桥对桥 |
| Heartrate-Buttplug、phantom-touch-bridge | 已有的"心率 → 震动"实现 | OBS WebSocket / HTTP | 直接换成订阅 `bio:inject` |
| Buttplug MCP（133★）、Tactus、Signal Bridge、ButtplugLLM、LLM Roleplay Intiface、Nomi-Lovense | 模型 → 设备 | MCP / 本地 LLM | 加一个 `bio:*` 订阅就闭环 |

## 9. 与 v0.1 的兼容

- v0.1 的块、变量、事件全部保留；v0.2 只加不改。
- 生成器看到 `window.tbc` 不存在时自己创建；两个实现同时存在时以 `version` 高者为准，低者只 `push` 不生成块。
- 世界书文案：`device:` 与 `<kind>(…)` 行各加一句读法即可。
