# TBC 规范用语、一致性与登记表

适用于 v0.2 及以后的所有版本。本文件与 `schema/`、`fixtures/`、`tools/validate.mjs` 一起构成可检查的规范。

## 1. 规范用语

| 本规范写法 | 含义 | 对应 RFC 2119 |
|---|---|---|
| **必须** | 不这样做就不符合规范 | MUST |
| **不得** | 这样做就不符合规范 | MUST NOT |
| **应该** | 除非有充分理由，否则要这样做；不这样做须在文档里说明 | SHOULD |
| **不应** | 除非有充分理由，否则不要这样做 | SHOULD NOT |
| **可以** | 可选 | MAY |

规范正文里的“建议”“一般”等词不构成要求。

## 2. 一致性角色

| 角色 | 是什么 | 一致性要求 |
|---|---|---|
| **生产者** | 生成注入块、写 `bio` 变量、发 `bio:*` 事件的实现（如 heartlink） | 生成的块必须通过 `tools/validate.mjs`；`bio` 变量必须符合 `schema/bio-variable.schema.json`；实现 v0.3 时必须提供 `tbc.diagnostics()`，返回值必须符合 `schema/diagnostics.schema.json` |
| **读者** | 解析块的世界书、思维链补丁、卡片脚本 | 必须忽略不认识的行和属性；不得依赖某个生产者的内部名字（条目名、标签名、全局变量） |
| **卡片** | 在 `data.extensions.tbc` 声明用法的角色卡 | 声明必须符合 `schema/card-declaration.schema.json` |
| **信号源 / 执行器** | 往总线推样本、登记状态或接受输出的设备适配 | 见 `device-interface-zh.md` |

一个实现声称“支持 TBC 0.x”时，必须写明支持的角色、版本，以及未实现的可选部分。

## 3. 版本与兼容

- 块首行 `v=` 写生产者实现的协议版本；生产者不得输出高于 `v` 的版本才有的行或属性。
- `0.x` 期间：同一小版本只加不改；升小版本可以改名，但旧名字必须作为别名至少保留一个小版本，并在 CHANGELOG 标明。
- 读者遇到比自己新的 `v`：必须仍按已知部分解析，忽略其余。
- 定稿（1.0）后遵循语义化版本：破坏性改动升主版本。
- 所有改动记入 `CHANGELOG.md`，并在对应样例目录加入覆盖新规则的样例。

## 4. 登记表

新增取值必须先在本表登记（改本文件 + CHANGELOG + 样例）。自定义扩展用 `x_` 前缀，不需要登记，读者会忽略。

### 4.1 首行属性

| 属性 | 必需 | 取值 | 起始版本 |
|---|---|---|---|
| `v` | 是 | `0.数字` | 0.1 |
| `mode` | 是 | `backstage` / `in-story` / `device-aware`；别名 `author` = `backstage`，`character` = `in-story` | 0.1（三档名 0.3） |
| `source` | 是 | 生产者名，小写字母、数字、`.` `_` `-` | 0.1 |
| `device` | 否 | 设备型号或名字前缀，小写；不得含序列号（连续 6 位以上数字） | 0.2 |
| `transport` | 否 | `ble` / `bridge` / `push` / `api` / `bus` | 0.2 |
| `cadence` | 否 | `数字ms` 或 `数字s` | 0.2 |
| `rr` | 否 | `yes` / `no` | 0.2 |
| `trigger` | 否 | `normal` / `swipe` / `regenerate` / `continue` / `impersonate` | 0.2 |
| `perceiver` | 否 | 1–3 个名字，“、”分隔；幕后模式不得出现 | 0.3 |

### 4.2 行名

固定区（顺序固定）：`sent`、`scope`(0.3，可选)、`baseline`、`prior`(可选)、`history`、`gen`、`read`、`read-pos`(可选)、`write`、`away`、`send`。

扩展区（`send` 之后、`series` 之前，顺序不限）：

| 行名 | 敏感等级 | 起始版本 |
|---|---|---|
| `sleep` `day` `workout`(≤3) `trend` | L1 | 0.3 |
| `wear` `button` `motion` `sensor` `env` | L0 | 0.3（`env` 0.2） |
| `body` `cycle` `journal`（必须带 `[L2]`） | L2 | 0.3 |
| `device:` | L0 | 0.2 |
| `haptics`（触觉状态：`off` 或 `on \| cap N% \| profile slow-burn\|frenzy[ \| actuators N]`，§5.8） | L0 | 0.3 |
| 与 kind 同名的信号行（如 `pressure(...)`） | 视信号 | 0.2 |

尾部：`series`(可选) → `note`(必须，固定句) → `warn`(可选，可多行，0.3 登记；生产者用它提示数据可能不完整)。

### 4.3 总线 kind

`hr` `rr` `pressure` `temperature` `room_temperature` `humidity` `spo2` `stress` `button` `battery`（0.2）；`wear` `motion` `skin_temperature` `resp_rate` `posture` `charging` `ppg`（0.3）。

### 4.4 诊断问题代码（`tbc.diagnostics().problems[].code`，0.3）

| 代码 | 含义 | 给用户的下一步（示例） |
|---|---|---|
| `NO_BLUETOOTH` | 浏览器不支持 Web Bluetooth | 用桌面版 Chrome / Edge |
| `INSECURE_CONTEXT` | 页面不是安全上下文，蓝牙不可用 | 用 https 或 localhost 打开酒馆 |
| `NO_DEVICE` | 没连设备 | 点徽章连接；设备需开启心率广播 |
| `DEVICE_SILENT` | 连着但超过 10 秒没数据 | 检查佩戴、距离、设备是否还在广播 |
| `NO_RR` | 设备不提供心跳间隔，没有 HRV | 正常；需要 HRV 请换胸带或 WHOOP 等 |
| `SPARSE_SOURCE` | 采样间隔 ≥ 30 秒 | 正常；部分行会写 n/a |
| `MODE_BACKSTAGE` | 当前是幕后模式，角色不会提及身体状态 | 需要角色感知时点徽章切到入戏 |
| `INJECTION_DISABLED` | 用户关闭了注入 | 在徽章菜单打开 |
| `GUIDE_INACTIVE` | 解释层（读法世界书等）没有启用 | 启用读法世界书 |
| `MULTI_WINDOW` | 同一聊天在多个窗口打开 | 只保留一个窗口 |
| `HOST_UNSUPPORTED` | 宿主缺少必需能力（事件、注入接口） | 升级酒馆 / 酒馆助手 |

## 5. 检查

```bash
npm install
npm test                                  # 全部样例与 Schema
node tools/validate.mjs 某个块.txt         # 检查实现生成的块
```

生产者应该在自己的测试里直接 `import { parseBlock } from 'tavern-bio-context/tools/block.mjs'`（或复制该文件并注明版本）做一致性测试。
