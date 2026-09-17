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
| **生产者** | 生成注入块、写 `bio` 变量、发 `bio:*` 事件的实现（如 heartlink） | 生成的块必须通过 `tools/validate.mjs`（生产者档）；注入前必须通过读者档自检（v0.3 §2.5）；`bio` 变量必须符合 `schema/bio-variable.schema.json`；实现 v0.3 时必须提供 `tbc.diagnostics()` 与生产者身份接口（v0.3 §4.6），返回值必须符合对应 Schema |
| **读者** | 解析块的世界书、思维链补丁、卡片脚本 | 必须按行名取值；必须忽略不认识的行、属性和段；不得因为行的顺序而拒收；不得依赖某个生产者的内部名字（条目名、标签名、全局变量）；不得假定块是一条单独的消息 |
| **卡片** | 在 `data.extensions.tbc` 声明用法的角色卡 | 声明必须符合 `schema/card-declaration.schema.json` |
| **信号源 / 执行器** | 往总线推样本、登记状态或接受输出的设备适配 | 见 `device-interface-zh.md`；推送的字符串必须符合 v0.3 §4.4 |
| **本机桥** | 跨进程镜像总线的桌面程序 | 必须实现 v0.3 §6 的全部 5 条安全要求后才能发布；消息必须符合 `schema/bridge.schema.json` |
| **解释层** | 读法世界书、预设里讲怎么理解块的部分 | 不在一致性检查范围内；参考措辞见 v0.3 §1.6 |

一个实现声称“支持 TBC 0.x”时，必须写明支持的角色、版本，以及未实现的可选部分。

## 3. 版本与兼容

- 块首行 `v=` 写生产者实现的协议版本；生产者不得输出高于 `v` 的版本才有的行或属性。
- 版本按 `.` 切分、逐段按整数比较（`0.10` 高于 `0.3`），不得按字符串比较。
- `0.x` 期间：同一小版本只加不改；升小版本可以改名，但旧名字必须作为别名至少保留一个小版本，并在 CHANGELOG 标明。
- 读者遇到比自己新的 `v`：必须仍按已知部分解析，忽略其余。
- 定稿（1.0）后遵循语义化版本：破坏性改动升主版本。
- 所有改动记入 `CHANGELOG.md`，并在对应样例目录加入覆盖新规则的样例。

### 3.1 宽松解析（v0.3 起）

- 通用行语法见 `schema/block.abnf` 第 1 部分：`name [ "(" meta ")" ] [ " [L2]" ] ": " body`，`meta` 不含 `( ) < >`，`body` 不含 `< >` 与换行。
- 读者按行名取值；已知行主体之后的任意 ` | <段>` 里，不认识的段忽略。
- **固定区从 v0.3 起冻结**：`sent`、`scope`、`baseline`、`prior`、`history`、`gen`、`read`、`read-pos`、`write`、`away`、`send` 之外不再增加固定行；新行一律进扩展区。
- 校验器两档：

| 档 | 用法 | 报错 | 只警告 |
|---|---|---|---|
| 生产者（缺省） | `node tools/validate.mjs 块.txt` | 首行、闭合、通用语法、单块完整性；已知行的主体格式、已知段的格式、顺序、重复、缺行；§4 的全部登记规则 | 未知行、未知段、未登记属性、弃用写法、应该类规则 |
| 读者 | `node tools/validate.mjs --reader 块.txt` | 首行语法、必需属性、闭合标签、通用行语法、单块完整性 | 其余全部 |

- 首行 `v="0.4"` 时，校验器另外检查 v0.4 草案的语法；低版本块里的 v0.4 写法按上表处理。

## 4. 登记表

新增取值必须先在本表登记（改本文件 + CHANGELOG + 样例）。自定义扩展用 `x_` 前缀，不需要登记，读者会忽略。

### 4.1 首行属性

| 属性 | 必需 | 取值 | 起始版本 |
|---|---|---|---|
| `v` | 是 | `0.数字` | 0.1 |
| `mode` | 是 | 生产者 0.x 期间只写 `author` / `character`；读者也接受 `backstage` / `in-story` / `device-aware` | 0.1 |
| `view` | 否（v0.3 起应该写） | `backstage` / `in-story` / `device-aware`；与 `mode` 对应：`backstage` ↔ `author`，其余 ↔ `character`；读者以 `view` 为准 | 0.3 |
| `source` | 是 | 生产者名，`^[a-z0-9][a-z0-9._:-]{0,31}$` | 0.1 |
| `device` | 否 | `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`，≤ 32；不得含序列号（v0.3 §2.6） | 0.2 |
| `transport` | 否 | `ble` / `bridge` / `push` / `api` / `bus` | 0.2 |
| `cadence` | 否 | `数字ms` 或 `数字s` | 0.2 |
| `rr` | 否 | `yes` / `no` | 0.2 |
| `trigger` | 否 | `normal` / `swipe` / `regenerate` / `continue` / `impersonate` | 0.2 |
| `perceiver` | 否 | 1–3 个名字，“、”分隔，每个 ≤ 24 字；幕后不得出现 | 0.3 |
| `replay` | 否 | `continue` / `group`；`trigger="continue"` 时必须为 `continue` | 0.3 |
| `date` | 否 | `YYYY-MM-DD`，`sent` 所在的本地日期 | 0.3 |
| `tz` | 否 | `+HH:MM` / `-HH:MM` | 0.3 |
| `stream` | 否 | `yes` / `no` | 0.4 草案 |
| `lag` | 否 | `数字s` | 0.4 草案 |

所有属性值不得含 `"`、`<`、`>` 与换行。

### 4.2 行名

固定区（顺序固定，v0.3 起冻结）：`sent`、`scope`(0.3，可选)、`baseline`、`prior`(可选)、`history`、`gen`、`read`、`read-pos`(可选)、`write`、`away`、`send`。

扩展区（`send` 之后、`series` 之前，顺序不限）：

| 行名 | 敏感等级 | 起始版本 |
|---|---|---|
| `sleep` `day` `workout`(≤3) `trend` | L1 | 0.3 |
| `wear` `button` `motion` `sensor` `env` | L0 | 0.3（`env` 0.2） |
| `body` `cycle` `journal`（必须带 `[L2]`） | L2 | 0.3 |
| `device:` | L0 | 0.2 |
| `haptics`（触觉状态：`off` 或 `on \| cap N% \| profile slow-burn\|steady\|frenzy\|max[ \| actuators N]`，§5.8） | L0 | 0.3 |
| `feedback`（读者对设备的操作与上一条回复动作的执行结果，§5.12） | L0 | 0.3 |
| 与 kind 同名的信号行（如 `pressure(...)`；`ppg` 除外） | 视信号 | 0.2 |
| `stream`（流式显示段） | L1 | 0.4 草案 |
| `actuator`（执行器电量与连接，每个执行器一行，≤ 4 行） | L0 | 0.4 草案 |
| `native`（用户开启的设备自带模式，每个执行器一行） | L0 | 0.4 草案 |

尾部：`series`(可选) → `note`(必须，固定句) → `warn`(可选，可多行，0.3 登记；生产者用它提示数据可能不完整)。

最小块（v0.3 §2.5）：首行、`sent`、`note`、`warn: block-invalid`。

### 4.3 `scope` 固定句（0.3）

| `trigger` | 句子 |
|---|---|
| `normal` | `scope: gen, read = previous reply; write, send = this message` |
| `swipe` / `regenerate` | `scope: gen, read = discarded reply (not in context); no new message` |
| `continue` | `scope: replay of block composed at HH:MM:SS; continuing previous reply` |
| `impersonate` | `scope: gen, read = previous reply; no reader message yet` |

### 4.4 段

| 行 | 已登记段 | 起始版本 |
|---|---|---|
| `gen` / `read` / `write` | `cov`、`rr-loss`、`hrv`、`flag:`（值：`too-long`、`hr-high`）、`off-wrist` | 0.1–0.3 |
| `gen` / `read` / `write` | `mean`、`above`、`away`、`tail-max`；峰值后缀 `carryover` | 0.4 草案 |
| `history` | `read-dur`、`hrv` | 0.1 |
| `history` | `read-peak-rel` | 0.4 草案 |
| `baseline` | `age`、`noise`、`changed` | 0.4 草案 |
| `stream` | `pos`，以及相位行的 `cov`、`rr-loss`、`hrv`、`flag:`、`mean`、`above` | 0.4 草案 |
| `actuator` | `battery`（`N%`、可带 `low`，或 `n/a`）、`charging`、`link` | 0.4 草案 |
| `feedback` | 备注 `native-unstoppable`（只用于 `stop by …`） | 0.4 草案 |

### 4.5 基线方法（`baseline` 括号里）

| 方法 | 状态 | 起始版本 |
|---|---|---|
| `manual` | 登记 | 0.2 |
| `rest`、`rolling-low`、`prior-rhr` | 登记 | 0.3 |
| `quiet-median`（= `rest`）、`p20`（= `rolling-low`） | 已弃用；v0.4 起生产者不得输出；1.0 移除 | 0.2 |

### 4.6 总线 kind

`hr` `rr` `pressure` `temperature` `room_temperature` `humidity` `spo2` `stress` `button` `battery`（0.2）；`wear` `motion` `skin_temperature` `resp_rate` `posture` `charging` `ppg`（0.3）。`ppg` 与未登记且不带 `x_` 的 kind 不进块。

标识类字段（`kind`、`source`、`unit`、`target`、`prior.source`、执行器 id）：`^[a-z0-9][a-z0-9._:-]{0,31}$`（v0.3 §4.4）。

### 4.7 诊断问题代码（`tbc.diagnostics().problems[].code`，0.3）

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
| `BAD_INPUT` | 总线收到不合规的字符串或时间戳，已拒收（v0.3 §4.4–4.5） | 联系发出样本的脚本作者 |
| `BLOCK_INVALID` | 本轮块自检没通过，已改注入最小块（v0.3 §2.5） | 导出诊断并反馈给实现作者 |
| `GUIDE_CONFLICT` | 解释层世界书被另一个（通常更旧的）实现改写 | 更新或停用旧版实现 |
| `MULTI_PRODUCER` | 提示词里已有别的 `<bio_context`，本实现没有再注入（v0.3 §4.6） | 只保留一个生产者 |
| `SCAN_COLLISION` | 启用的世界书里有与块中词相同、未开整词匹配的关键字（v0.3 §2.7） | 给这些条目打开整词匹配，或关闭块参与扫描 |

### 4.8 校验器错误代码（`tools/block.mjs`）

| 代码 | 含义 | 读者档 |
|---|---|---|
| `HEADER_SYNTAX`、`HEADER_MISSING`、`CLOSE_MISSING`、`LINE_GRAMMAR`、`BLOCK_MARKERS` | 首行、必需属性、闭合、通用语法、单块完整性 | 错误 |
| `HEADER_*`（其余）、`PERCEIVER_IN_BACKSTAGE`、`PRIVACY_SERIAL` | 首行取值与隐私 | 警告 |
| `LINE_SYNTAX`、`LINE_ORDER`、`LINE_DUP`、`LINE_MISSING`、`NOTE_MISSING`、`SEG_DUP`、`DATE_FORMAT`、`L2_TAG_*`、`WORKOUT_TOO_MANY`、`DEVICE_LINE`、`KIND_NOT_IN_BLOCK` | 登记语法 | 警告 |
| `SCOPE_TRIGGER`、`REPLAY_MISSING`、`SWIPE_NEW_MESSAGE`、`IMPERSONATE_WRITE`、`READPOS_FORBIDDEN`、`READPOS_WITHOUT_PEAK` | v0.3 §1.3 | 警告 |
| `HR_RANGE`、`PEAK_OUT_OF_RANGE`、`PEAK_LOW_COVERAGE`、`PEAK_SHORT_PHASE`、`HRV_SHORT_WINDOW`、`HRV_QUALITY`、`SPARSE_FIELD` | v0.3 §1.4、§2.8 | 警告 |
| `FEEDBACK_COUNT`、`FEEDBACK_SEND_AT`、`FEEDBACK_TOO_MANY` | v0.3 §5.12 | 警告 |
| `BASELINE_METHOD_DEPRECATED`、`BASELINE_AGE_MISSING`、`BASELINE_MANUAL_INFO`、`CARRYOVER_*`、`TAILMAX_*`、`STREAM_*`、`ACTUATOR_*`、`NATIVE_*` | v0.4 草案 | 警告 |

只给警告的代码：`HEADER_UNKNOWN`、`VIEW_MISSING`、`SCOPE_MISSING`、`LINE_UNKNOWN`、`LINE_IN_FIXED_ZONE`、`LINE_ORDER_UNKNOWN`、`SEG_UNKNOWN`、`FLAG_UNKNOWN`、`DATE_SHORT`、`CPS_NOT_INTEGER`、`FEEDBACK_REF_LEGACY`、`HRV_IN_WRITE`、`AWAY_ABSOLUTE`，以及 v0.3 里的 `BASELINE_METHOD_DEPRECATED`。

### 4.9 本机桥（0.3）

| 项 | 取值 |
|---|---|
| 权限 `scopes` | `read` / `push` / `actuate`（`actuate` 缺省拒绝，须在桥界面单独勾选） |
| 错误 `bio:error` 的 `code` | `FORBIDDEN`（没有该权限）、`PAIRING_REQUIRED`、`ORIGIN_DENIED`、`BAD_TOKEN`、`BAD_INPUT` |

## 5. 检查

```bash
npm install
npm test                                    # 全部样例与 Schema
node tools/validate.mjs 某个块.txt           # 生产者档检查实现生成的块
node tools/validate.mjs --reader 某个块.txt  # 读者档
```

生产者应该在自己的测试里直接 `import { parseBlock } from 'tavern-bio-context/tools/block.mjs'`（或复制该文件并注明版本）做一致性测试；字符串清洗可用 `tools/sanitize.mjs`，`<bio_act/>` 解析可用 `tools/bio-act.mjs`。
