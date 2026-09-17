> Normative English text of TBC v0.2 (2026-09-17). The Chinese version is the source; where they differ, the Chinese text wins until v0.2 is frozen.

# Tavern Bio-Context (TBC) v0.2 Specification

> Status: v0.2 release candidate, 2026-09-17. Reference implementation heartlink 0.8.2 (everything in-page implemented; the local bridge is in 0.9). The v0.1 draft (`spec-zh.md`) is kept for history; v0.2 only adds, it does not change — a v0.1 reader simply ignores lines and attributes it doesn't recognize.

## 0. One-liner

The integration script turns the reader's physiological signals into a text block with a fixed format and no interpretation, injects it into the prompt, and at the same time writes the chat variable and broadcasts page events; presets and cards depend on only these three artifacts. Other signal sources `push` into the bus; actuators register a one-line status into the bus; cross-process communication goes through the local bridge.

## 1. Layering

Same as v0.1 §1, with two additions:
- **Bus layer** (in-page): `window.tbc`, see §5.
- **Bridge layer** (cross-process): local WebSocket, see §6.

## 2. The `<bio_context>` text block

Injected once before every user-visible generation, as a `system`-role message at in-chat depth 0, scannable by world info. All keys are fixed English, one per line; the block MUST NOT contain conclusory/interpretive wording.

### 2.1 First-line attributes

```
<bio_context v="0.2" mode="author|character" source="<实现名>" [device="whoop-5.0"] [transport="ble|bridge|push|api|bus"] [cadence="1s"] [rr="yes|no"] [trigger="normal|swipe|regenerate|continue|impersonate"]>
```

- `device`: lowercase, hyphenated; the device model or name prefix. MUST NOT contain a serial number.
- `transport`: how the real-time samples arrived. `bus` means an external source coming through the page bus.
- `cadence`: the sampling interval of the primary signal (heart rate), the median interval of the most recent 60 samples; `≥ 30s` is treated as a sparse source (§2.6).
- `rr`: whether the most recent 30 samples include inter-beat intervals.
- `trigger`: the trigger type for this generation turn. When `continue`, the block is a replay of the previous turn and phases are not recomputed.

### 2.2 Fixed lines (fixed order)

| Line | Format | Description |
|---|---|---|
| sent | `sent: HH:MM:SS` | send timestamp |
| baseline | `baseline: 73 bpm (quiet-median\|p20\|manual, n=…; hrv 99 ms)` or `baseline: n/a (session too short)` | baseline for this session |
| prior (optional) | `prior(<source>, <date>): recovery 67 \| hrv 69.6 ms \| rhr 59 bpm \| sleep 6.5 h \| spo2 95.5% \| skin 33.6°C` | a day-level prior from a non-real-time source; MUST carry a date; write only the fields actually obtained |
| history | `history: read-peaks … \| read-dur … \| hrv …` or `history: n/a` | most recent ≤ 8 turns |
| gen | `gen: 79s (ttft 56s, reasoning 8s, body 15s) \| hr 80→75 [74–80] \| cov 96%` | covers generation |
| read | `read: 2:03 \| hr 75→78 [70–78] peak 83 @32s \| cov 94% \| rr-loss 12% \| hrv 95 ms [\| flag: too-long (likely away)]` | covers reading the reply |
| read-pos (optional) | `read-pos: peak ~62% (~870/1400 chars, para 4/7) @6 cps est\|cal` or `read-pos: partial (read time covers ~30% of 1000 chars @6 cps est), peak at 68% of read time` | peak position; `partial` = read duration × reading speed < 0.8 × reply length in characters |
| write | `write: 10s, 45 chars, pauses 1, edits 0 \| hr 78→75 [75–78] \| cov 100% \| rr-loss 100%` | covers writing the message |
| away | `away: HH:MM:SS–HH:MM:SS hidden\|idle [min–max]; …` or `away: none` | away interval(s) |
| send | `send: 75 bpm (+3%)` | heart rate at send time, relative to baseline |
| `<kind>` line (optional, 0+ lines) | `pressure(civet, 100ms): read 7.9→12.3 kPa peak 14.1 @41s \| write 8.0→8.2 kPa` | non-heart-rate physiological signal, aggregated per phase |
| env (optional) | `env(mijia, 10s): 26.3°C 58% rh` | most recent room temperature/humidity reading (within 10 minutes); not aggregated per phase |
| device (optional, 0+ lines) | `device: coyote ch-A 35/100 "经典" 12s` | status registered by an actuator, ≤ 120 characters, no angle brackets |
| series | `series(10s from HH:MM:SS): 75 75 · 73 …` | raw sequence in 10-second buckets |
| note | fixed sentence | `observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence` |

### 2.3 Coverage `cov`

`cov = (sample count for that phase) / (phase duration / cadence)`, capped at 100%. Only output when `cadence` is present. Interpretation-layer convention: a phase below 70% is unreliable (the validity threshold from Apple's 2026 heart-rate study).

### 2.4 Phase boundaries

Same as v0.1: `send / stream_start / reasoning_end / reply_end / type / activity / visible / hidden / swipe`; `continue` does not produce `send` or `reply_end`.

### 2.5 Judgment scale (belongs in the interpretation layer, not in the block)

Within 10% of baseline counts as noise; a sustained rise of more than 20%, occurring in the `read` phase, counts as a clear reaction; HRV clearly below the quiet-state value = tense or aroused, clearly above = relaxed; a `read` with `flag: too-long` MUST NOT be treated as a reading reaction; a `read-pos` marked `partial` MUST NOT be treated as a paragraph position.

### 2.6 Sparse sources

When `cadence ≥ 30s`: `series` and `hrv` MUST NOT be output; when a phase has fewer than 5 samples, write `n/a (sparse)`. Applies to sources such as iOS Shortcuts push and exported-file replay.

## 3. Chat variable `bio`

```json
{ "v": "0.2", "source": "heartlink", "updatedAt": 1789560584206, "mode": "author", "baseline": 73,
  "prior": { "source": "whoop-api", "date": "09-15", "fields": { "recovery": 67, "hrv": 69.6, "rhr": 59 } },
  "last": { "t": …, "readStart": …, "readSec": 117, "readPeak": 83, "readMean": 77, "readFirst": 75, "readLast": 78, "peakAtSec": 32, "hrv": 95, "writeSec": 7, "sendBpm": 80, "baseline": 73, "genSec": 40, "replyChars": 1400,
            "readPos": { "pct": 62, "chars": 870, "replyChars": 1400, "para": 4, "paraCount": 7, "cps": 6, "source": "est" } },
  "turns": [ "…最近 20 轮，同 last 结构…" ],
  "lastSignal": { "t": …, "text": "…模型思维链里的 Reader Signal 原文…" } }
```

When `readPos` is `partial`, it takes the form `{ "partial": true, "readPct": 30, "peakPct": 68, "replyChars": 1000, "cps": 6, "source": "est" }`. Each AI message's `extra.bio` = the `last` structure for that turn + `signal`; the write MUST also be mirrored into `swipe_info[swipe_id].extra.bio`.

## 4. Page events

`bio:sample` (one per sample; `detail` same as the Sample in §5), `bio:inject` (once per send; `detail` is `{ text, mode, summary }`), `bio:state` (on connection/mode/source change; `detail` same as `getState()`).

## 5. Page bus `window.tbc`

```js
tbc.version                       // '0.2'
tbc.push(sample)                  // Sample = { t?, source, kind, value, unit?, cadence?, quality?, device?, rr? }
tbc.registerContext(source, fn)   // fn() → string | null；生成 device: 行
tbc.unregisterContext(source)
tbc.setPrior(prior) / tbc.getPrior()   // prior = { source, date, fields }
tbc.on(event, fn) / tbc.off(event, fn)
tbc.sources()                     // { signals: { hr: {…}, pressure: {…} }, contexts: [...] }
```

Reserved `kind` values: `hr` (the primary signal, aggregated across all phases), `rr`, `pressure`, `temperature` (body temperature), `room_temperature`, `humidity`, `spo2`, `stress`, `button`, `battery`. When two implementations coexist, the one with the higher `version` acts as the bus; the lower one only `push`es.

## 6. Local bridge (0.9, specification ahead of implementation)

`ws://127.0.0.1:27130/tbc/v0.2`, one JSON object per line:

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

The bridge MUST bind only to `127.0.0.1`. After the page-side script connects to the bridge, it feeds `bio:sample` into the local `tbc.push` and hands `bio:prior` to `tbc.setPrior`; all other logic is unchanged. When the page is already connected to Bluetooth itself, it ignores the bridge's `hr`. The page sends `cmd: state` back with the baseline, current phase, and previous-turn summary, and the bridge's UI displays the phase from that. Browser restriction: an https page connecting to `ws://127.0.0.1` is allowed in Chrome / Firefox (loopback exception), but not allowed in Safari. Reference implementation: heartlink 0.9.1 + heartlink Desk (macOS).

## 7. Implementation constraints (when the host is SillyTavern)

1. MUST NOT call `saveChat` proactively; message-level data is written synchronously inside `CHARACTER_MESSAGE_RENDERED`, and the chat variable goes through the metadata save API.
2. Inject only for user-visible generations: a `type` allowlist on `GENERATION_STARTED` plus `dryRun` filtering; when `setExtensionPrompt`'s `filter` parameter is available (1.13.2+), pass it too.
3. Only one window MUST run the integration script for a given chat at any one time.
4. Use capability detection instead of version numbers; without `STREAM_TOKEN_RECEIVED` there is no `ttft`; without `STREAM_REASONING_DONE`, fall back to a `</thinking>` regex.

## 8. Security and privacy

- The integration script MUST NOT make any network request other than to the declared local bridge address; the block MUST NOT contain a device serial number, token, or IP address.
- Physiological data MUST stay on the local machine; it travels with the prompt only to the model provider the user has configured, and nowhere else.
- The reverse layer (actuators) MUST have a duration cap, an intensity cap, and a global stop; it MUST stop as soon as the page unloads or the bridge disconnects.
- For an unknown device, only listen to its broadcast; MUST NOT write to its characteristics.

## 9. Differences from v0.1 at a glance

Added: 5 optional first-line attributes; the `prior`, `env`, `<kind>`, and `device` lines; `cov`; `read-pos: partial`; `prior` and `readPos.partial` in the variable; the bus's `setPrior`/`getPrior`; the §6 bridge messages; the §7 implementation constraints; §8 security. Unchanged: the format and order of all other lines, the three event names, and the variable name.
