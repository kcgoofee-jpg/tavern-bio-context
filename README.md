# Tavern Bio-Context (TBC)

**A proposed open convention for feeding a reader's real-time biosignals (heart rate today; more later) into SillyTavern prompts — device-agnostic, preset-agnostic, card-agnostic.**

**一个开放约定的提案：把读者的实时生理信号（先是心率）以统一格式送进酒馆（SillyTavern）的提示词，设备无关、预设无关、卡片无关。**

Status: draft v0.1 (2026-09-16). Reference implementation: `heartlink` v0.7.1 (WHOOP → Chrome Web Bluetooth → Tavern Helper global script; falls back to SillyTavern core `setExtensionPrompt` / `eventSource` when Tavern Helper APIs are absent), to be published separately.

## Why / 为什么

Wearables can broadcast heart rate over standard Bluetooth. A script can turn that into a compact, phase-labelled record of what the reader's body did while a reply was generated, while it was read, and while the next message was typed. Models use it well — but only if every device script, preset author and card author agree on **one block format, one chat-variable schema and one set of page events**. This repo is that agreement.

设备广播心率是标准协议；脚本能把它整理成“看生成 / 读回复 / 写消息”分相位的记录；模型能用好它。前提是设备脚本、预设作者、卡片作者用**同一个文本块格式、同一个聊天变量、同一组页面事件**。这个仓库就是这份约定。

## The three artifacts / 三样东西

1. `<bio_context v="0.1" mode="author|character" source="...">` — one `system` message injected before every user-visible generation, in-chat depth 0, world-info scannable. Fields are fixed English keys, one per line, **no interpretation inside the block**.
2. Chat variable `bio` — `{ v, source, updatedAt, mode, baseline, last, turns[≤20] }` so cards (MVU etc.) can read it and exports carry it.
3. Page events `bio:sample`, `bio:inject`, `bio:state` — for downstream extensions (e.g. haptics via buttplug.io) to subscribe without touching the device layer.

Optional field (v0.1.1 proposal, implemented in heartlink 0.7): `read-pos: peak ~62% (~870/1400 chars, para 4/7) @6 cps est` — where in the previous reply the reader probably was when the read-phase peak happened, from an estimated (`est`) or self-calibrated (`cal`) reading speed. Still a record, not an interpretation. Since heartlink 0.7.1 the same value is also written to `bio.last.readPos` / `bio.turns[].readPos` and to the message's `extra.bio.readPos`. Known limitation from a live capture (3809-char reply read for 2:17, peak at 133 s): when read-time × cps is far below the reply length the mapping is unreliable; a `partial` marker is under discussion (see spec §8).

Interpretation lives in a world-info book (one constant entry + two mode entries) and, optionally, one line in the preset's chain-of-thought (`Reader Signal` → pace / tension / intensity).

## Layers / 分层

| Layer | Owner | Output |
|---|---|---|
| Device | device script | 1 Hz samples `{t, bpm, rr[]}` |
| Phase | device script | page events: send / stream_start / reasoning_end / reply_end / type / activity / visible / hidden / swipe |
| Context | device script | `<bio_context>` block, chat variable `bio`, `bio:*` events (**the standard**) |
| Interpretation | world-info / preset | how to read it, two usage modes, one CoT line |
| Reverse (optional) | separate extension | model output → device action; subscribes to `bio:*` only |

## Compatibility / 适配声明

| Environment | Direct (Web Bluetooth) | Local bridge (WebSocket) |
|---|---|---|
| Chrome / Edge on Windows, macOS, Linux | yes | yes |
| Chrome / Edge on Android | yes | yes |
| iOS browsers, macOS Safari | no | yes |
| Android WebView browsers (Via etc.) | no | yes |
| Tavern served over plain http on LAN | no (not a secure context) | yes |
| localhost / https | yes | yes |

## Landscape / 现有项目普查

See [docs/landscape-zh.md](docs/landscape-zh.md): every public project we could find that feeds biosignals into SillyTavern/LLM roleplay or lets the model drive devices, which ones could adopt this convention, and draft issues for the SillyTavern repo and the two closest projects.

## Full draft / 完整草稿

See [docs/spec-zh.md](docs/spec-zh.md) (Chinese). English normative text to follow once v0.1 stabilises.

## Dependency notes / 依赖说明

- Tavern Helper (JS-Slash-Runner) 3.0.0→4.9.6 (2024-09 to 2026-09, 183 versions) had few breaking changes: 3.2.3 settings format, 3.6.1 `Character`→`RawCharacter`, 4.0.0 `replaceVariables` no longer async. `injectPrompts` exists since 3.4.15 (2025-08-27); `eventOn` returns `stop` since 3.4.13. A device script should feature-detect and fall back to SillyTavern core APIs.
- Web Bluetooth has been stable in Chromium desktop and Android Chrome since 2017; `getDevices()` / `watchAdvertisements()` remain behind flags on some builds. Not available in iOS browsers, macOS Safari, Android WebView (Via etc.), or plain-http LAN origins.

## Prior art checked / 已核对的现有轮子

- buttplug.io / Intiface — device **control** protocol; complementary, used by the optional reverse layer.
- SillyTavern character card v3, STScript, Tavern Helper API — untouched; TBC only fixes a block format, a variable name and event names on top of them.
- [HZXXXC/sillytavern-heart-rate-hrv](https://github.com/HZXXXC/sillytavern-heart-rate-hrv) (2026-05) — a SillyTavern extension that reads BLE heart rate + HRV and injects an instantaneous state line (`心率 95 bpm (兴奋, 上升↑) | HRV 22 ms`). Same device layer, different context layer: it injects labels at generation time; TBC injects an uninterpreted, phase-labelled record of the whole turn and leaves interpretation to world-info / CoT. It is the closest prior implementation and a natural candidate to emit `<bio_context>` as well.
- No existing public **convention** for "biosignals → prompt" was found as of 2026-09-16. Corrections welcome via issues.

## License

CC BY 4.0 for the specification text.
