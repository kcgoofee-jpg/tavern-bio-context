# SillyTavern 近两年更新审计（2024-09 → 2026-09）与 TBC 协议修订提案

日期：2026-09-17。目的：找出 TBC 协议的不足、heartlink 可能撞上的破坏性更新，并据此提出协议 v0.2 修改。

## 0. 读了什么（原始材料，不是摘要）

| 材料 | 范围 |
|---|---|
| SillyTavern GitHub Releases 正文 | 1.12.0（2024-05）→ 1.19.0（2026-09-14），22 个版本全文 |
| SillyTavern 源码 | `release` 分支 1.18.0 与 1.19.0 的 `public/script.js`、`public/scripts/{events,st-context,world-info,openai,reasoning}.js`、`src/endpoints/chats.js`；`staging` 与 1.19.0 逐文件 diff（2026-09-14 刚合并 release，无差异） |
| Issue / PR | 全部标签体系；按 High/Medium Priority、Approved、In Progress、Under Consideration、Extension、Breaking、Architectural 标签的在办 issue；全部 40 个在办 PR；#5864、#5389、#5928、#5943、#5980、#5983 正文；pinned issues |
| 官方文档 | SillyTavern-Docs `For_Contributors/Writing-Extensions.md`（main） |
| Apple《Apple Watch 心率准确性研究》2026-09 | 9 页全文 + 表 1、图 1–3 渲染成图阅读 |
| 社区项目 | awesome-ai-companion README 全文；dsh-toy、phantom-touch-bridge、always-here、Akari Pulse、Toy-Relay-AI-mcp-SOSEXY 的 README |

## 1. ST 近两年与我们有关的变化（时间线）

| 版本（日期） | 变化 | 对 heartlink / TBC 的意义 |
|---|---|---|
| 1.12.6（2024-09-24） | 新增事件 `STREAM_TOKEN_RECEIVED`、`GENERATION_AFTER_COMMANDS`；流式中止也发 `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED` | 我们的 stream_start / reply_end 边沿依赖的事件从这个版本起存在。低于 1.12.6 的酒馆没有首字事件 |
| 1.12.12（2025-02-16） | 思维链（reasoning）成为一等公民：`extra.reasoning`、自动解析、正则可作用于思维链、`/reasoning-*` 命令；大部分 localStorage 数据迁进 settings.json | `Reader Signal` 抽取所依赖的 `extra.reasoning` 从这里开始；"预设把思维链留在正文里"是它之前的旧习惯，两条路都要支持（已做） |
| 1.12.13（2025-03-15） | 思维链流式解析；`parseReasoningFromString` 导出；消息事件加 `type` 参数 | `STREAM_REASONING_DONE` 事件在这一带出现（`reasoning.js` 里 emit 参数：reasoning, duration, messageId, state） |
| 1.12.14（2025-04-21） | **聊天保存加完整性检查**（`chat_metadata.integrity` UUID，服务端只比对 slug 是否相等）；保存中离开页面会弹 beforeunload | 见第 4 节"今天那个弹窗的真相" |
| 1.13.0（2025-05-25） | Chat Completion 里同深度注入可设优先级；世界书可按角色卡字段匹配 | 扩展注入（`setExtensionPrompt`）没有优先级参数，深度 0 处与预设条目的先后由 ST 决定，我们控制不了 |
| 1.13.2（2025-07-26） | `setExtensionPrompt` 增加第 7 个参数 `filter`（async 函数，返回 false 则本次不注入）；世界书条目可按生成类型触发；事件类型移到独立文件 `events.js`；扩展可在扫描后增删世界书条目（#4304） | 可以用 `filter` 让 ST 自己跳过后台生成，替代我们靠 `GENERATION_STARTED` 的 type 白名单 |
| 1.13.3（2025-08-25） | context 里加 `saveMetadataDebounced`；修复第三方扩展克隆 chat metadata 的兼容问题；扩展 manifest 可声明最低 ST 版本 | 聊天变量应走 `saveMetadata(Debounced)`，不该为它调 `saveChat` |
| 1.13.4（2025-09-13） | **继续生成（continue + prefill）时深度 0 的注入被挪位** | 我们的块在 depth 0；`continue` 时它的位置会变，但内容仍在 |
| 1.13.5（2025-10-16） | 修复流式时 `CHARACTER_MESSAGE_RENDERED` 重复触发；`/genraw` 也发 prompt-ready 事件 | reply_end 不会再重复记；抓请求的 `CHAT_COMPLETION_PROMPT_READY` 监听要忽略 `dryRun` |
| 1.14.0（2025-11-22） | **破坏性**：消息附件（media）在 `extra` 里的结构变了，老版本打不开新聊天文件；第三方扩展要跟着改 | 证明 `message.extra` 的子结构不是稳定契约；我们只往自己的 `extra.bio` 写，不碰 ST 的键，风险可控 |
| 1.15.0（2025-12-28） | **破坏性**：群聊元数据格式统一并自动迁移；新增 `WORLDINFO_SCAN_DONE`（扩展可在扫描后改结果）；Macros 2.0 预览，旧宏引擎将来移除 | 群聊场景我们没测；`WORLDINFO_SCAN_DONE` 给了"不用导入世界书也能送解释层"的官方入口 |
| 1.16.0（2026-02-14） | `APP_INIT` 事件；宏引擎新语法（`if`、作用域） | 无直接影响；世界书里的 `{{user}}` 两套引擎都支持 |
| 1.17.0（2026-03-28） | 扩展 manifest 生命周期钩子；新宏引擎对新安装默认开启；新增 `PERSONA_CHANGED`、TTS 事件 | 无直接影响 |
| 1.18.0（2026-05-03） | 第三方扩展"Bot Browser"安全事件 → 安装第三方扩展多一道确认；**用户消息先保存再发事件**（#5389）；persona 生命周期事件；`clean` 钩子 | 社区对"能跑任意 JS 的扩展/脚本"警惕度上升，协议要有隐私与网络访问声明；`MESSAGE_SENT` 时聊天已落盘 |
| 1.19.0（2026-09-14） | 完整性检查：文件头解析失败也算失败（#5928）；分支/检查点用新 slug（#5943）；`MessageFormatter` 钩子；`/addswipe` 不再整页重绘 | 完整性检查越来越严，扩展自己调 `saveChat` 的代价越来越大 |
| staging（2026-09-16） | 与 1.19.0 无差异 | — |
| 在办 PR | #5983 保存锁卡死时释放（完整性弹窗没人点，`isChatSaving` 永远 true，之后所有保存静默失败）；#5980 覆盖前先快照；#5925 后台工具调用；#5985 `OAI_PRESET_SAVED` 事件；#5994 纯函数拆文件 + 客户端测试 | #5983 描述的正是我们今天差点撞上的情况 |
| 在办 issue | #5864 同账号开两个窗口静默丢数据（settings 互相覆盖、聊天丢消息），标"Under Consideration / Low Priority"，作者附了可选的多窗口 PR | 官方短期不会解决多窗口；协议要写"一个聊天只在一个窗口里跑设备脚本" |

## 2. 官方"路线图 / 优先级"的实际情况

- 仓库没有 roadmap 文件、没有 roadmap 标签、没有 Projects 看板，Discussions 里搜 roadmap 也没有。优先级只体现在标签：`⚠️ High Priority`（当前 0 个在办）、`❕ Medium Priority`（12 个）、`💤 Low Priority`、`🤔 Under Consideration`、`🧑‍💻 In Progress`、`👍 Approved`。
- 在办的中优先级里没有任何一条和扩展 API、注入、事件有关；都是具体 bug 与接口新增。开发者关心的扩展 API 变化只出现在发布说明的"For developers / Extensions"小节，事前没有预告渠道。
- 官方文档对扩展作者的唯一承诺（Writing-Extensions.md 第 30 行）："扩展必须兼容最新 release，核心变了请准备更新"；并明确说"从 ST 源码 import 不可靠，随时会断，`getContext` 才是相对稳定的 API"。
- 结论：**不存在可以对齐的官方路线图**。我们能做的是（a）只用 `getContext()` 暴露的东西，（b）每个 release 出来跑一遍真机清单，（c）把依赖面写进协议并给出退路。

## 3. heartlink 用到的每个接口，两年内的稳定性

| 接口 | 出现版本 | 两年内变化 | 风险 | 对策 |
|---|---|---|---|---|
| `getContext().setExtensionPrompt(key, value, position, depth, scan, role, filter)` | 很早（filter 1.13.2 加） | 只增参数，签名向后兼容 | 低 | 0.7.2 起传 `filter`，双保险 |
| `extension_prompt_types.IN_CHAT` = 1、`extension_prompt_roles.SYSTEM` = 0 | 很早 | 值没变 | 低 | 用 `context.extensionPromptTypes` 而不是写死数字（待改） |
| `GENERATION_STARTED (type, params, dryRun)` | 很早 | 参数列表稳定；dryRun 频繁（算 token） | 低；我们已过滤 dryRun | — |
| `STREAM_TOKEN_RECEIVED (text)` | 1.12.6 | 无 | 低 | 低版本退化：没有 ttft，只有 gen 总时长 |
| `STREAM_REASONING_DONE (reasoning, duration, messageId, state)` | 1.12.13 前后 | 无 | 中：只在 ST 自己解析思维链时触发；预设把思维链留在正文里时不触发（我们用 `</…thinking>` 正则兜底） | 保留双路径 |
| `CHARACTER_MESSAGE_RENDERED (messageId, type)` | 很早 | 1.13.5 修了流式重复触发 | 低 | — |
| `GENERATION_ENDED (chat.length)` | 很早 | 无 | 低 | — |
| `MESSAGE_SWIPED (mesId)` | 很早 | 无 | 低 | — |
| `CHAT_CHANGED (chatId)` | 很早 | 无 | 低 | — |
| `CHAT_COMPLETION_PROMPT_READY ({chat, dryRun})` | 很早 | 1.13.5 起 `/genraw` 也发 | 低（只用于取证） | 取证脚本忽略 dryRun |
| `context.chat[i].extra.*`（`reasoning`、我们的 `bio`） | reasoning 1.12.12 | 1.14.0 改过 media 子结构 | 中：`extra` 会随 swipe 同步（`syncMesToSwipe` / `syncSwipeToMes`），我们在生成结束后写入的 `extra.bio` 只有在 ST 下次 `syncMesToSwipe` 时才进 `swipe_info` | 写 `extra.bio` 时同步写 `swipe_info[swipe_id].extra.bio`（0.7.2） |
| `context.saveChat`（= `saveChatConditional`，带锁 + 完整性检查） | 很早 | 1.12.14 加完整性检查，1.19 更严 | **高**：我们每轮额外调两次；完整性失败弹窗没人点会把 `isChatSaving` 卡死（#5983 未合并） | **0.7.2 起不再主动调 `saveChat`**：`extra.bio` 在生成结束、ST 自己保存之前写好（ST 每条 AI 消息后必保存）；Reader Signal 也在同一时机抽 |
| `context.chatMetadata.variables`（聊天变量 `bio`） | 很早 | 无 | 低 | 用 `saveMetadataDebounced`（1.13.3+）或酒馆助手的变量接口 |
| 世界书扫描含 `scan: true` 的扩展注入 | 很早 | 无（`world-info.js` 4720 行仍在） | 低 | — |
| 酒馆助手 `injectPrompts` / `eventOn` / `insertOrAssignVariables` | TH 3.4.15 / 3.4.13 | 已在 docs/DEVELOPMENT.md 记录 | 中 | 核心 API 回退已实现 |
| Web Bluetooth `getDevices()` | Chrome 旗标 | 用户的 Chrome 上 `navigator.bluetooth.getDevices is not a function` | 中：免弹窗重连不可用 | 依赖 `device.gatt.connect()`（不需要手势）+ 点徽章弹选择框 |

## 4. 已发现的 heartlink 问题

1. **主动调 `saveChat` 是最大的兼容风险**（见上表）。今天弹的"聊天完整性检查失败"：服务端只比 `chat_metadata.integrity` 是否相等，所以"两个标签页开同一个聊天"本身**不会**触发这个错误（同一个 slug），而是会静默互相覆盖（#5864）。触发条件只有一个：服务器文件上的 slug 和我这边的不一样。最可能的路径：这个 `test` 聊天当初由我用"新建聊天 + 重命名"创建，文件里可能没有 slug；两个标签页各自在加载时补了一个不同的 UUID（`script.js` 7665 行），谁后保存谁失败。**之前我说"两边抢着保存"的解释不准确，以此为准。**
2. `extra.bio` 没有镜像进 `swipe_info`：用户 swipe 走再 swipe 回来，`syncSwipeToMes` 用 `swipe_info` 里的旧 `extra` 覆盖，`bio` 可能丢。
3. `continue` 类型也被当作用户可见生成注入，但 1.13.4 起 continue+prefill 时深度 0 的注入会被挪位；而且 continue 没有新的"读回复"相位，块内容是上一轮的重复。
4. 没有用 `filter` 参数；后台生成的判断只靠我们自己的 type 白名单。
5. 位置/角色的枚举值写死成 `'in_chat'` / `'system'`（酒馆助手参数）与数字（核心回退）；核心回退应从 `context.extensionPromptTypes` / `extensionPromptRoles` 取。
6. 没有声明最低 ST 版本（1.12.6 才有首字事件，1.12.12 才有 `extra.reasoning`）。

## 5. TBC 协议的不足与 v0.2 修改提案

编号 P-1 … P-10，全部是对 v0.1 的增量；已在协议仓库 `docs/spec-zh.md` §8 登记，待定稿。

- **P-1 头部加来源属性**：`<bio_context v="0.2" mode="…" source="heartlink" device="whoop-5.0" transport="ble" cadence="1s" rr="yes" trigger="normal|swipe|regenerate|continue|impersonate">`。理由：Apple 研究表 1 显示同为"心率流"，Garmin 0.25–0.5 s、华为/WHOOP/Polar 1 s、Pixel 2 s、Apple Watch 5 s（HealthKit 后台 30 s）、三星后台 60 s、Oura 约 300 s；模型和世界书必须知道这条记录的时间分辨率；`trigger` 让模型知道这一轮是重roll还是新消息。
- **P-2 相位行加覆盖率 `cov`**：`read: 2:17 | … | cov 94% | rr-loss 6%`。Apple 研究以"时段内读数覆盖 ≥70%"作为数据有效的门槛；我们只有 rr-loss（间期缺失）没有样本覆盖率，断连/掉包时相位统计会用很少的点得出结论。
- **P-3 稀疏来源模式**：cadence ≥ 30 s 的来源（Apple Watch 经快捷指令、三星导出、Oura）不输出 `series` 与 `hrv`，相位行样本数 < 5 时写 `n/a (sparse)`。理由：always-here 这类 iOS 快捷指令路线和 Akari Pulse 这类日级桥都是现实存在的来源，协议现在默认 1 Hz。
- **P-4 `read-pos` 加 `partial` 标记**：`readSec × cps < 0.8 × replyChars` 时写 `read-pos: partial, peak at 97% of read time`，不再给字数百分比。真机证据见 NEXT.md（3809 字回复读 137 秒，峰值被算成 21%）。
- **P-5 持久化规则（实现约束章节）**：设备脚本不得主动调用宿主的整聊天保存；消息级数据在宿主自己保存之前写入（ST：生成结束到 `saveChatConditional` 之间），并同步写 `swipe_info[swipe_id].extra`；聊天变量走元数据保存接口。理由：1.12.14 → 1.19 完整性检查逐步收紧，#5983 的锁死路径。
- **P-6 生成门控**：只对宿主认定的用户可见生成注入；优先使用宿主提供的过滤能力（ST 1.13.2+ `filter`），type 白名单只作回退；`continue` 只更新 `trigger`，不重算相位。
- **P-7 解释层的两种投递方式**：(a) 全局世界书（现状）；(b) 设备脚本在 `WORLDINFO_SCAN_DONE`（ST 1.15+）里把同样的三条内容作为条目加进扫描结果，用户不必导入世界书。协议文本两种都写，内容以世界书文案为准。
- **P-8 单窗口约束**：一个聊天同一时刻只能有一个窗口跑设备脚本；ST 明确不支持多窗口（#5864 低优先级）。徽章应显示"本窗口持有设备"，第二个窗口拒绝连接。
- **P-9 安全与隐私声明**（借鉴 dsh-toy 的 guardrails 与 1.18 安全事件后的社区氛围）：设备脚本除声明的本机桥地址外不得发起任何网络请求；心率数据不写入任何模型可见文本以外的地方；不在块里放设备 ID、令牌；反向层必须有时长上限与全局停止。
- **P-10 反向层消费者契约**：phantom-touch-bridge 已经"按心率调强度"，Toy-Relay / dsh-toy 是"模型意图 → 设备"。协议只定义它们读什么：`bio:inject.detail.summary`（含 baseline、readPeak、hrv、readPos）与 `bio:sample`；不定义它们怎么控设备。

## 6. 参考项目给协议的启示

| 项目 | 是什么 | 对 TBC 的意义 |
|---|---|---|
| awesome-ai-companion（DasterProkio） | 人机陪伴生态清单，把"生理/环境感知"和"物理设备"分成独立小节 | 我们此前的普查漏掉了下面五个；清单里 SillyTavern 只是众多宿主之一，协议不该绑死 ST 的术语（世界书、酒馆助手），核心块格式要能在 MCP 客户端里同样用 |
| dsh-toy（c3ll256） | DeepSeek Harness 插件：Buttplug/Intiface + 私有分享链接，未知设备只做只读 BLE 广播发现，有强度/时长上限、令牌不进模型可见文本 | P-9 的模板；"只读发现、不写特征"与我们对 WHOOP 私有服务的态度一致 |
| phantom-touch-bridge（mfsnlqy） | Windows 本机 HTTP 桥，Intiface 或自定义路径，**可选心率输入**（小米手环实测）决定强度 | 已有人在做"心率 → 触觉"闭环；P-10 让它能直接消费 `bio:inject` |
| always-here（Cheiineeey） | Apple Watch + iOS 快捷指令定时 POST 心率/HRV/睡眠到 VPS，AI 主动找人 | Apple Watch 的现实路线是"快捷指令推送"，不是 BLE；这是 P-3 稀疏来源的第一个实例，也是 0.9 本机桥的输入格式候选（HTTP POST JSON） |
| Akari Pulse（yoruuuchan） | vivo 手机/BlueOS 手表 → 自建库 → MCP；每个观测带 PASS / NO_DATA / DENIED / UNSUPPORTED 状态，"缺失就显示缺失，不用缓存冒充" | 它的"状态标记"比我们的 `n/a` 更细；P-2/P-3 借用这个思路 |
| Toy-Relay-AI-mcp-SOSEXY（tutu-kitty） | MCP 服务器 + 手机 Chrome Web Bluetooth 中继页，AI 前端完全不知道 BLE | 证明"Web Bluetooth 中继页"是可行的手机路线；我们 0.9 本机桥可以反过来做"手机 Chrome 采集 → 桌面酒馆" |
| Eventide / Tidefall | 给 AI 伴侣的**模拟**生理状态引擎（周期、驱力、事件） | 与 TBC 是镜像关系：它们模拟角色的身体，我们测量读者的身体；`mode="character"` 时两者可能同时存在，协议应说明 `<bio_context>` 永远是读者的测量值，不是角色设定 |

## 7. Apple 研究对设备层的启示（2026-09，1460 人，Polar H10 胸带为参考）

- 研究本身就用 BLE 数据流采 WHOOP 5.0、华为 WATCH 5、Garmin、Pixel（表 1），说明 BLE 心率流是厂商面向用户的一等数据源，不是黑魔法。
- WHOOP 5.0 在**静息**时与 Apple Watch 差异不显著（图 3 空心方块）；**案头工作**时均方根误差比 Apple Watch 差约 1.5–2 bpm（显著）；**备餐**差约 3 bpm；**步行**差约 6 bpm。绝对误差论文没给，只给与 Apple 的差值。对我们：静坐读回复的数据可信；手在键盘上打字时误差明显上升；这与实测的 rr-loss 上升一致，也支持"相对基线 10% 以内视为噪声"的尺度。
- 数据有效性门槛（覆盖率 ≥70%，超出 30–220 bpm 的点 ≤5%）是现成的、经同行评审的规则，P-2 直接采用。
- Apple Watch 面向用户的最高频数据是 5 秒一次，且只有内部应用能拿到，HealthKit 后台 30 秒一次：Apple Watch 用户永远拿不到 1 Hz，P-3 必须有。

## 8. 下一步

- heartlink 0.7.2（修第 4 节 1–6）：去掉主动 `saveChat`；`extra.bio` 镜像进 `swipe_info`；`continue` 只更新 trigger；传 `filter`；枚举取自 context；`MIN_ST_VERSION = '1.12.12'` 检测并降级。
- 协议 v0.2 草案：把 P-1 … P-10 写进 `docs/spec-zh.md`，README 的 Status 改为"v0.2 draft"；heartlink 0.8 跟随实现（`SPEC_VERSION = '0.2'`）。
- 每个 ST release：跑 `docs/DEVELOPMENT.md` 第 4 节清单；本文第 3 节的表随之更新。
