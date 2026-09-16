# 普查：把生物/身体设备接进酒馆或 LLM 角色扮演的现有项目（2026-09-16）

范围与方法：GitHub 用搜索 API（名称、描述、README、`sillytavern-extension` 主题）；awesome-buttplug 索引全页；Reddit 的搜索接口和页面对本机抓取一律拦截（返回 HTML / 拒绝），只能靠网页搜索间接覆盖，**没有找到任何相关帖子**；X 无法在不登录的情况下检索，**未覆盖**。这两处的空白要靠人工翻或在社区发帖问。

## 一、信号进模型（bio → prompt）

| 项目 | 平台 | 做法 | 状态 |
|---|---|---|---|
| [HZXXXC/sillytavern-heart-rate-hrv](https://github.com/HZXXXC/sillytavern-heart-rate-hrv) | ST UI 扩展 | Web Bluetooth 读 0x180D，30 秒 RMSSD，`setExtensionPrompt` 注入即时状态标签，模板可配 | 2026-05，1 星，活跃度低 |
| [Ashthetik/Polarity-](https://github.com/Ashthetik/Polarity-)（Polarity++） | 通用 / 游戏引擎 | 摄像头表情识别 + 情感词典 + 心率，目标是喂给 NLP/LLM 和游戏 NPC | alpha |
| [Das-L1/Heartrate-Buttplug](https://github.com/Das-L1/Heartrate-Buttplug) | OBS / 直播 | 心率 → 玩具震动强度（反馈回身体，不进模型） | — |
| [brugr9/Heartbeat51](https://github.com/brugr9/Heartbeat51) | Unreal Engine | Polar H10 → MQTT → 引擎 | 非 LLM |
| kcgoofee-jpg/heartlink（本项目） | 酒馆助手全局脚本 | 分相位时间线 `<bio_context>`，会话自动基线，聊天变量与消息 extra | 参考实现 |

结论：**把生理信号送进酒馆提示词的，公开项目只有 HZXXXC 一个**，且是“即时标签”思路；分相位、跨轮、不解释的记录方式目前只有 heartlink。

## 二、模型控制设备（prompt → device），酒馆生态

| 项目 | 星 | 形态 | 触发 |
|---|---|---|---|
| [Enclave0775/Intiface_Central-Sillytavern-plugin](https://github.com/Enclave0775/Intiface_Central-Sillytavern-plugin) | 38 | ST 扩展 | 扫描消息里的命令，按阅读速度延时执行，卡拉 OK 高亮 |
| [cheesedtld/ST-Intiface-Plugin](https://github.com/cheesedtld/ST-Intiface-Plugin) | — | ST 扩展 | Intiface Central |
| [intiface-command/intiface-command](https://github.com/intiface-command/intiface-command) | — | ST 扩展 | 助手消息内嵌 `{vibrate: 0.8; duration: 3}`，与 AllTalk TTS 音频同步 |
| [kirin-3/buttplug-ST](https://github.com/kirin-3/buttplug-ST) | 2 | Python 桥 + REST | Sorcery 扩展触发 `fetch` |
| [sol-nyx/SillyTavern-ButtplugBridge](https://github.com/sol-nyx/SillyTavern-ButtplugBridge) | 0 | 桥 | — |
| [test157t/Extension-Embody](https://github.com/test157t/Extension-Embody) | 3 | ST 扩展 | VRM 形象 + 语音 + Intiface 三合一 |
| [Karasukaigan/TavLite](https://github.com/Karasukaigan/TavLite) | — | 独立轻量酒馆 | 角色卡 + Intiface |
| [phoenixthrush/llm-roleplay-intiface](https://github.com/phoenixthrush/llm-roleplay-intiface) | — | 独立应用 | — |

酒馆之外：buttplug-mcp、tactus、signal_bridge（MCP 让任何 Agent 控设备）；a9lim/rlaif（PiShock 电击给 Agent 做正负反馈）；AgenticLover、sayit.love（商业 AI 伴侣控设备）。完整索引见 [awesome.buttplug.io](https://awesome.buttplug.io/)。

## 三、把“真实世界”注入酒馆的同类思路

| 项目 | 说明 | 与 bio 协议的关系 |
|---|---|---|
| [cha1latte/sillytavern-real-world-weather](https://github.com/cha1latte/sillytavern-real-world-weather)（8 星） | 拉真实天气注入提示词 | 同一件事的另一种数据源；协议的 `source` 字段和“只记录不解释”原则可以直接套用 |
| [p-e-w/sorcery](https://github.com/p-e-w/sorcery) | 让模型输出触发真实世界动作（JS） | 反向层的通用触发器；bio 协议的 `bio:*` 事件可作为它的输入 |

## 四、哪些能整合到 bio 协议里

| 候选 | 整合方式 | 难度 | 价值 |
|---|---|---|---|
| **HZXXXC/sillytavern-heart-rate-hrv** | 加一个“输出 `<bio_context>`”开关：它已有 0x2A37 解析和 RMSSD，只缺相位记录；相位事件可以从酒馆核心事件拿，不依赖酒馆助手 | 中（约 300 行） | 高：让协议有第二个独立实现，且是 ST 扩展形态，云酒馆之外的用户能装 |
| **Enclave0775 的阅读速度模拟** | 把“按字/秒推算读到哪”搬进 heartlink，产出 `read-pos` 字段 | 低 | 高：峰值能对应到段落 |
| **intiface-command 的内联命令语法** | 反向层示例：模型在 `mode="author"` 下不写正文命令，但可以在思维链里输出 `{haptic: ...}` 供反向扩展读取 | 中 | 中：闭环 demo |
| **sorcery** | 订阅 `bio:inject` 触发动作的通用胶水 | 低 | 中 |
| **real-world-weather** | 提议它也用 `<bio_context>` 同款“记录块”约定（`source="weather"`） | 低 | 中：证明协议不只为心率 |
| **Polarity++** | 表情识别作为第二信号源，`source="fer"` | 高 | 低（alpha） |

## 五、可以提交的 issue / discussion 草稿

### 1. SillyTavern 官方仓库（Discussions，Ideas 分类）

标题：Proposal: a shared convention for injecting real-world biosignals (heart rate first) into prompts

正文要点：
- 现状：至少两个独立项目（HZXXXC 的扩展、heartlink 脚本）在做同一件事，各自发明块格式。
- 提案：不改 ST 核心，只约定一个 system 注入块 `<bio_context>`、一个聊天变量 `bio`、三个页面事件；附真机证据（注入块原文、模型思维链原文）。
- 请官方评估两点：a) `setExtensionPrompt` 的 `scan` 参数与 in_chat 深度 0 是否是推荐的注入位置；b) 是否愿意在文档“Writing extensions”里链接一条“社区约定”。
- 不要求合并任何代码。

### 2. HZXXXC/sillytavern-heart-rate-hrv

标题：Interop: would you consider an optional `<bio_context>` output mode?

正文要点：先致谢（协议 README 已列为 prior art）；说明差异（即时标签 vs 分相位记录）；提出最小改动：在注入模板旁加一个“协议模式”，输出 `<bio_context v="0.1" mode="author" source="st-heart-rate-hrv">`，字段缺失写 n/a；我们提供 PR。

### 3. Enclave0775/Intiface_Central-Sillytavern-plugin

标题：Reading-speed estimator as a reusable piece + listening to `bio:*` events

正文要点：请教阅读速度模拟的实现细节与参数；提议它监听 `bio:inject`，把读者心率作为循环强度的输入（闭环）。

## 六、缺口

- Reddit、Discord、X 三处未能检索；建议在 r/SillyTavernAI 和官方 Discord 发一帖问“有没有人接过心率/手环”。
- 没有找到任何 EEG、皮电、呼吸带接酒馆的项目；协议第 2 节的“扩展字段”暂时没有实例。

## 补遗（2026-09-17）

第一版普查漏掉了 awesome-ai-companion（DasterProkio）清单里的这些项目，评价见 `st-compat-audit-2026-09-zh.md` 第 6 节：phantom-touch-bridge（本机触觉桥，可选心率输入）、always-here（Apple Watch + iOS 快捷指令推送）、Akari Pulse（vivo/BlueOS → MCP）、Toy-Relay-AI-mcp-SOSEXY（MCP + 手机 Chrome Web Bluetooth 中继）、dsh-toy（DeepSeek Harness 玩具插件，guardrails 范本）、Eventide / Tidefall（模拟生理状态引擎）。第一版里"发 issue 给官方/他人"的草稿作废，不再对外推广。
