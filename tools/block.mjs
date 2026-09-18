// Tavern Bio-Context 注入块的参考解析器（v0.2、v0.3；v0.4 草案语法只在 v="0.4" 及以上时检查）。
// 规则与 schema/block.abnf、docs/conformance-zh.md §3–§4、docs/spec-v0.3-draft-zh.md §2 一致；实现可以直接 import 本文件做一致性测试。
//
// parseBlock(text, { profile }) → { ok, profile, errors: [{line, code, message}], warnings: [...], header, view, lines: [{name, meta, l2, body, raw, line}] }
//   profile = 'producer'（缺省）：已知行按登记语法与顺序检查，报错；未知行、未知段、未知属性只警告。
//   profile = 'reader'：只把首行、闭合标签、通用行语法与单块完整性当错误，其余全部降为警告。
// 读者必须按行名取值，不得因为顺序、未知行、已知行里的未知段而拒收整块（v0.3 §2.3）。

import { serialProblem, serialDigitsProblem, DATE_RE, DATE_SHORT_RE, DEVICE_RE, DEVICE_MAX, IDENT_RE } from './sanitize.mjs';

export const VIEWS = ['backstage', 'in-story', 'device-aware'];
export const LEGACY_MODES = ['author', 'character'];
// 读者接受的全部 mode 值；0.x 的生产者只写 LEGACY_MODES，新名写在 view（v0.3 §1.1）
export const MODES = [...VIEWS, ...LEGACY_MODES];
export const MODE_FOR_VIEW = { backstage: 'author', 'in-story': 'character', 'device-aware': 'character' };
const VIEW_FOR_VALUE = { author: 'backstage', character: 'in-story', backstage: 'backstage', 'in-story': 'in-story', 'device-aware': 'device-aware' };
export function effectiveView(attrs) {
  if (!attrs) return null;
  if (VIEWS.includes(attrs.view)) return attrs.view;
  return VIEW_FOR_VALUE[attrs.mode] ?? null;
}

export const TRANSPORTS = ['ble', 'bridge', 'push', 'api', 'bus'];
export const TRIGGERS = ['normal', 'swipe', 'regenerate', 'continue', 'impersonate'];
export const REPLAYS = ['continue', 'group'];
export const NOTE_TEXT = 'note: observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence';
export const MINIMAL_WARN = 'warn: block-invalid';

// v0.3 §1.3：scope 行按 trigger 取一句登记过的固定文字
export const SCOPE_TEXTS = {
  normal: 'scope: gen, read = previous reply; write, send = this message',
  discarded: 'scope: gen, read = discarded reply (not in context); no new message',
  impersonate: 'scope: gen, read = previous reply; no reader message yet',
};
export const SCOPE_TEXT = SCOPE_TEXTS.normal; // v0.3 草案的导出名，保留
const SCOPE_REPLAY_RE = /^scope: replay of block composed at \d{2}:\d{2}:\d{2}; continuing previous reply$/;
export const SCOPE_FOR_TRIGGER = { normal: 'normal', swipe: 'discarded', regenerate: 'discarded', continue: 'replay', impersonate: 'impersonate' };
export const NO_NEW_MESSAGE = 'n/a (no new message)';
export const IMPERSONATE_WRITE = 'n/a (impersonate)';

// v0.3 §2.4：基线方法登记（v0.4 起生产者不得再输出已弃用的两个）
export const BASELINE_METHODS = ['manual', 'rest', 'rolling-low', 'prior-rhr'];
export const DEPRECATED_BASELINE_METHODS = ['quiet-median', 'p20'];

// 首行属性 → 起始版本。v 低于起始版本的属性按“未登记”处理（警告）
export const HEADER_ATTRS = {
  v: '0.1', mode: '0.1', source: '0.1',
  device: '0.2', transport: '0.2', cadence: '0.2', rr: '0.2', trigger: '0.2',
  perceiver: '0.3', view: '0.3', date: '0.3', tz: '0.3', replay: '0.3',
  stream: '0.4', lag: '0.4',
};

// 固定区（v0.3 起冻结，新行一律进扩展区）
export const FIXED_LINES = ['sent', 'scope', 'baseline', 'prior', 'history', 'gen', 'read', 'read-pos', 'write', 'away', 'send'];
const REQUIRED_LINES = ['sent', 'baseline', 'history', 'gen', 'read', 'write', 'away', 'send'];

// 扩展区（send 之后、series 之前，顺序不限）登记过的行名
export const EXTENSION_LINES = {
  env: { level: 'L0', since: '0.2' },
  sleep: { level: 'L1', since: '0.3', date: 'sleep' }, day: { level: 'L1', since: '0.3', date: 'day' },
  workout: { level: 'L1', since: '0.3', repeat: 3 }, trend: { level: 'L1', since: '0.3' },
  wear: { level: 'L0', since: '0.3', named: true }, button: { level: 'L0', since: '0.3', named: true },
  motion: { level: 'L0', since: '0.3', named: true }, sensor: { level: 'L0', since: '0.3', named: true },
  body: { level: 'L2', since: '0.3', date: 'plain' }, cycle: { level: 'L2', since: '0.3', date: 'plain' },
  journal: { level: 'L2', since: '0.3', date: 'plain' },
  // v0.3 §5.8：触觉输出的当前状态
  //   主体之后可以有任意段（v0.3 §2.3-2）；v0.4 §13 登记 tuned 段（语法见 checkHaptics）
  haptics: { level: 'L0', since: '0.3' },
  // v0.3 §5.12：读者对设备的操作与上一条回复动作的执行结果（语法见 checkFeedback）
  feedback: { level: 'L0', since: '0.3' },
  // v0.4 草案 §1：流式显示段
  stream: { level: 'L1', since: '0.4' },
  // v0.4 草案 §5.2：只统计没有执行器驱动的那些秒
  clean: { level: 'L1', since: '0.4' },
  // v0.4 草案 §8：执行器的电量与连接；§9：用户开启了的设备自带模式
  actuator: { level: 'L0', since: '0.4', named: true, perActuator: true },
  native: { level: 'L0', since: '0.4', named: true, perActuator: true },
  // v0.4 草案 §12：本轮用了哪些门槛（语法见 checkGates）
  gates: { level: 'L0', since: '0.4' },
};

export const KIND_SINCE = {
  hr: '0.1', rr: '0.1', pressure: '0.2', temperature: '0.2', room_temperature: '0.2', humidity: '0.2', spo2: '0.2', stress: '0.2',
  button: '0.2', battery: '0.2', wear: '0.3', motion: '0.3', skin_temperature: '0.3', resp_rate: '0.3', posture: '0.3', charging: '0.3', ppg: '0.3',
};
export const KINDS = Object.keys(KIND_SINCE);
export const BUS_ONLY_KINDS = ['ppg'];

// 读者档只把这些当错误
export const READER_ERRORS = new Set(['HEADER_SYNTAX', 'HEADER_MISSING', 'CLOSE_MISSING', 'LINE_GRAMMAR', 'BLOCK_MARKERS']);

// 版本按 "." 切分、逐段按整数比较：compareVersions('0.10', '0.3') === 1
export function compareVersions(a, b) {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0;
    const y = parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const CLOCK = '\\d{2}:\\d{2}:\\d{2}';
const DUR = '(?:\\d+s|\\d+:\\d{2})';
const NA_RE = /^n\/a(?: \([^()]*\))?$/;
const HR_RE = /^hr (\d+)→(\d+) \[(\d+)–(\d+)\](?: peak (\d+) @(\d+)s( carryover)?)?$/;
const HR_NA_RE = /^(?:hr )?n\/a(?: \([^()]*\))?$/;
// 通用行语法（v0.3 §2.3）：name ["(" meta ")"] [" [L2]"] ": " body；meta 不含 ( ) < >，body 不含 < > 与控制字符
const LINE_RE = /^([a-z][a-z0-9_-]*)(?:\(([^\x00-\x1f\x7f()<>]+)\))?( \[L2\])?: ([^\x00-\x1f\x7f<>]+)$/;
const HEADER_RE = /^<bio_context((?: [a-z][a-z0-9_-]*="[^"<>\x00-\x1f\x7f]*")+)>$/;

// v0.4 草案 §5：执行器与相位的重叠
export const RISKY_OUTPUTS = ['Temperature', 'Estim', 'Spray'];   // v0.3 §5.9-6，act 段里必须点名
export const CLEAN_PHASES = ['gen', 'read', 'write'];
export const CLEAN_MIN_SEC = 10;        // 干净秒不少于 max(10, 2 × lag)（经验值）
export const CLEAN_MIN_SHARE = 30;      // 干净秒不少于相位时长的 30%（经验值）
// 来自执行器的传感器行不得写的物理单位（单位不统一，只能写相对变化）
const TOY_SENSOR_UNIT_RE = /(?:\d\s?(?:kpa|bpm|mmhg|ms|g)\b|°c|℃)/i;

const PHASE_MAIN = {
  gen: new RegExp(`^${DUR}(?: \\([^()]*\\))?$`),
  read: new RegExp(`^${DUR}$`),
  write: new RegExp(`^${DUR}, \\d+ chars, pauses \\d+, edits \\d+$`),
};
const PHASE_SEGS = [
  { key: 'cov', since: '0.2', re: /^cov (\d{1,3})%$/ },
  { key: 'rr-loss', since: '0.1', re: /^rr-loss \d{1,3}%$/ },
  { key: 'hrv', since: '0.1', re: /^hrv \d+ ms$/ },
  { key: 'flag', since: '0.1', re: /^flag: [a-z][a-z-]*(?: \([^()]*\))?$/ },
  { key: 'off-wrist', since: '0.3', re: /^off-wrist \d+:\d{2}$/ },
  // v0.4 草案 §4：带定义的派生事实
  { key: 'mean', since: '0.4', re: /^mean \d+ \([+-]\d+%\)$/ },
  { key: 'above', since: '0.4', re: new RegExp(`^above \\+\\d+% ${DUR}$`) },
  { key: 'away', since: '0.4', re: new RegExp(`^away ${DUR}$`) },
  { key: 'tail-max', since: '0.4', re: /^tail-max (\d+) @\+(\d+)s$/ },
  // v0.4 草案 §5.1：本相位内执行器运行的秒数、强度与动作条数（算的是生产者发出的动作）
  { key: 'act', since: '0.4', re: new RegExp(`^act (${DUR}), mean (\\d{1,3})%, (\\d{1,2}) (acts?)(?: \\((${RISKY_OUTPUTS.join('|')})(?:\\/(?:${RISKY_OUTPUTS.join('|')}))*\\))?$`) },
];
const STREAM_SEGS = [
  { key: 'pos', since: '0.4', re: /^pos ~(\d+)\/(\d+) chars, para (\d+)\/(\d+)$/ },
  ...PHASE_SEGS.filter((s) => s.key !== 'away' && s.key !== 'tail-max' && s.key !== 'off-wrist'),
];
// v0.4 草案 §5.2：clean 行的 sec 段与可用段（只在干净秒上算）
const CLEAN_SEC_RE = /^sec (\d+)\/(\d+)$/;
const CLEAN_SEGS = PHASE_SEGS.filter((s) => ['cov', 'rr-loss', 'hrv', 'mean', 'above'].includes(s.key));
const BASELINE_SEGS = [
  { key: 'age', since: '0.4', re: /^age \d+[smhd]$/ },
  { key: 'noise', since: '0.4', re: /^noise ±\d+$/ },
  { key: 'changed', since: '0.4', re: /^changed from ([a-z][a-z-]*) \d+ turns? ago$/ },
];
const HISTORY_SEGS = [
  { key: 'read-dur', since: '0.1', re: /^read-dur [\d: ·]+$/ },
  { key: 'hrv', since: '0.1', re: /^hrv [\d ·]+$/ },
  { key: 'read-peak-rel', since: '0.4', re: /^read-peak-rel (?:[+-]\d+%|·)(?: (?:[+-]\d+%|·))*$/ },
];
const READPOS_RE = /^(?:peak ~\d+% \(~\d+\/\d+ chars, para \d+\/\d+\) @(\d+(?:\.\d)?) cps (?:est|cal)|partial \(read time covers ~\d+% of \d+ chars @(\d+(?:\.\d)?) cps (?:est|cal)\), peak at \d+% of read time)$/;
const SEND_RE = /^(?:n\/a(?: \([^()]*\))?|\d+ bpm(?: \([+-]\d+%\))?)$/;

// v0.3 §1.4：只减少输出的生产者规则里可以从块本身检查的部分
export const PEAK_MIN_PHASE_SEC = 10;   // v0.4 起为 max(10, 2 × lag)
export const HRV_MAX_LOSS = 5;          // 被剔除或插值的 RR 超过 5% 不输出 hrv
export const PHASE_FLAGS = ['too-long', 'hr-high'];

const FEEDBACK_ACTS_RE = /^acts (\d+) sent, (\d+) done(?:, (\d+) cut)?(?:, (\d+) pending)?(?:, (\d+) refused)?$/;
const FEEDBACK_EVENT_RE = /^(stop by (?:reader|safeword|device)|stronger \+\d{1,3}%|weaker -\d{1,3}%|pace (?:slow-burn|steady|frenzy|max)|replay [a-z]+|skip) (gen|read|write|send) @(\d+)s(?: \(([^()|<>]{1,40})\))?$/;
const FEEDBACK_KEYS = new Set(['acts', 'stop', 'stronger', 'weaker', 'pace', 'replay', 'skip']);
const FEEDBACK_REASON = '(?:disconnected|deadline|heat-limit|rate-limit|stop-failed|maybe-running|other)';
const FEEDBACK_REF_RE = new RegExp(`^(?:${FEEDBACK_REASON}(?:, |$))?(?:reply -\\d+(?:, act \\d+)?(?:, \\d+(?:\\.\\d)?s in)?)?$`);
const FEEDBACK_REF_LEGACY_RE = /^act \d+(?:, \d+(?:\.\d)?s in)?$/;
const FEEDBACK_MAX_EVENTS = 8;
// v0.4 草案 §9.6：停止指令发出后自带模式仍在运行
const FEEDBACK_REF_V04_RE = new RegExp(`^native-unstoppable(?:, reply -\\d+(?:, act \\d+)?(?:, \\d+(?:\\.\\d)?s in)?)?$`);

// v0.4 草案 §8、§9
export const ACTUATOR_LOW_MAX = 15;          // low 只在电量 ≤ 15% 时可以写（经验值）
export const ACTUATOR_MAX_LINES = 4;
export const NATIVE_MAX_MODES = 8;
export const LINKS = ['ok', 'reconnecting', 'lost'];
const ACTUATOR_SEGS = [
  { key: 'battery', since: '0.4', re: /^battery (?:(\d{1,3})%( low)?|n\/a(?: \([^()]*\))?)$/ },
  { key: 'charging', since: '0.4', re: /^charging (?:yes|no)$/ },
  { key: 'link', since: '0.4', re: /^link (?:ok|reconnecting|lost)$/ },
];
const NATIVE_SEG_RE = new RegExp(`^(\\d{1,2}) ([^\\s|()<>]{1,8})(?: \\((.*)\\))?$`, 'u');
const NATIVE_NOTE_RE = new RegExp(`^unstoppable, ${DUR}, opt-in$`);

export function parseBlock(text, opts = {}) {
  const profile = opts.profile === 'reader' ? 'reader' : 'producer';
  const errors = [];
  const warnings = [];
  const err = (line, code, message) => errors.push({ line, code, message });
  const warn = (line, code, message) => warnings.push({ line, code, message });

  const src = String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '');
  // 单块保证（v0.3 §2.5）：恰好一个 <bio_context 和一个 </bio_context>
  const opens = src.split('<bio_context').length - 1;
  const closes = src.split('</bio_context>').length - 1;
  if (opens !== 1 || closes !== 1) err(0, 'BLOCK_MARKERS', `必须恰好含一个 <bio_context 和一个 </bio_context>（现在 ${opens} / ${closes}）`);

  const rows = src.split('\n');
  const header = parseHeader(rows[0] || '', err);
  const attrs = header || {};
  const v = /^0\.\d+$/.test(attrs.v || '') ? attrs.v : '0.2';
  const at = (min) => compareVersions(v, min) >= 0;
  const ctx = { v, at, err, warn, attrs };
  if (header) checkHeader(ctx);

  const closed = rows.length > 1 && rows[rows.length - 1] === '</bio_context>';
  if (!closed) err(rows.length, 'CLOSE_MISSING', '最后一行必须是 </bio_context>');
  const bodyRows = rows.slice(1, closed ? -1 : undefined);

  const lines = [];
  bodyRows.forEach((raw, idx) => {
    const line = idx + 2;
    const m = LINE_RE.exec(raw);
    if (!m) { err(line, 'LINE_GRAMMAR', `不符合通用行语法（name[(meta)][ [L2]]: body，不含尖括号）：${raw}`); return; }
    lines.push({ name: m[1], meta: m[2] ?? null, l2: Boolean(m[3]), body: m[4], raw, line });
  });

  checkStructure(ctx, lines);
  checkLines(ctx, lines);

  if (profile === 'reader') {
    for (let i = errors.length - 1; i >= 0; i--) {
      if (!READER_ERRORS.has(errors[i].code)) warnings.unshift(...errors.splice(i, 1));
    }
  }
  return {
    ok: errors.length === 0,
    profile,
    errors,
    warnings,
    header: header,
    view: effectiveView(header),
    lines: lines.map(({ name, meta, l2, body, raw, line }) => ({ name, meta, l2, body, raw, line })),
  };
}

function parseHeader(line, err) {
  const m = HEADER_RE.exec(line);
  if (!m) { err(1, 'HEADER_SYNTAX', '首行必须是 <bio_context 属性="值" …>，属性值不得含 " < > 与换行'); return null; }
  const attrs = {};
  for (const a of m[1].matchAll(/ ([a-z][a-z0-9_-]*)="([^"]*)"/g)) {
    if (a[1] in attrs) err(1, 'HEADER_DUP', `属性 ${a[1]} 重复`);
    attrs[a[1]] = a[2];
  }
  for (const k of ['v', 'mode', 'source']) if (!(k in attrs)) err(1, 'HEADER_MISSING', `缺少必需属性 ${k}`);
  return attrs;
}

function checkHeader({ v, at, err, warn, attrs }) {
  const has = (k) => k in attrs && at(HEADER_ATTRS[k]);
  if (attrs.v && !/^0\.\d+$/.test(attrs.v)) err(1, 'HEADER_VERSION', `v="${attrs.v}" 不是 0.x`);
  if ('mode' in attrs) {
    if (!MODES.includes(attrs.mode)) err(1, 'HEADER_MODE', `mode="${attrs.mode}" 不在 ${MODES.join(' / ')}`);
    else if (VIEWS.includes(attrs.mode)) err(1, 'HEADER_MODE_NEW', `0.x 期间 mode 只写 author / character；"${attrs.mode}" 应写成 mode="${MODE_FOR_VIEW[attrs.mode]}" view="${attrs.mode}"`);
  }
  if (has('view')) {
    if (!VIEWS.includes(attrs.view)) err(1, 'HEADER_VIEW', `view="${attrs.view}" 不在 ${VIEWS.join(' / ')}`);
    else if (LEGACY_MODES.includes(attrs.mode) && MODE_FOR_VIEW[attrs.view] !== attrs.mode) err(1, 'HEADER_VIEW_MISMATCH', `view="${attrs.view}" 要求 mode="${MODE_FOR_VIEW[attrs.view]}"`);
  } else if (at('0.3')) {
    warn(1, 'VIEW_MISSING', 'v0.3 起生产者应该同时写 view（backstage / in-story / device-aware）');
  }
  if ('source' in attrs && !IDENT_RE.test(attrs.source)) err(1, 'HEADER_SOURCE', 'source 须符合标识规则：小写字母或数字开头，只含 a-z 0-9 . _ : -，≤ 32 字符');
  if ('device' in attrs) {
    const why = serialProblem(attrs.device);
    if (why) err(1, 'PRIVACY_SERIAL', `device 疑似含序列号或原始蓝牙名（${why}）`);
    if (!DEVICE_RE.test(attrs.device) || attrs.device.length > DEVICE_MAX) err(1, 'HEADER_DEVICE', 'device 只能是小写字母、数字，用 . 或 - 连接，≤ 32 字符');
  }
  if ('transport' in attrs && !TRANSPORTS.includes(attrs.transport)) err(1, 'HEADER_TRANSPORT', `transport="${attrs.transport}" 不在 ${TRANSPORTS.join(' / ')}`);
  if ('cadence' in attrs && !/^\d+(?:ms|s)$/.test(attrs.cadence)) err(1, 'HEADER_CADENCE', 'cadence 必须是 数字+ms 或 数字+s');
  if ('rr' in attrs && !['yes', 'no'].includes(attrs.rr)) err(1, 'HEADER_RR', 'rr 只能是 yes / no');
  if ('trigger' in attrs && !TRIGGERS.includes(attrs.trigger)) err(1, 'HEADER_TRIGGER', `trigger 不在 ${TRIGGERS.join(' / ')}`);
  if (has('perceiver')) {
    const list = attrs.perceiver.split('、');
    if (!list.length || list.length > 3 || list.some((x) => !x || Array.from(x).length > 24)) err(1, 'HEADER_PERCEIVER', 'perceiver 为 1–3 个名字，用“、”分隔，每个 ≤ 24 字');
    if (effectiveView(attrs) === 'backstage') err(1, 'PERCEIVER_IN_BACKSTAGE', '幕后（backstage / author）不得带 perceiver');
  }
  if (has('replay') && !REPLAYS.includes(attrs.replay)) err(1, 'HEADER_REPLAY', `replay 只能是 ${REPLAYS.join(' / ')}`);
  if (has('date') && !DATE_RE.test(attrs.date)) err(1, 'HEADER_DATE', 'date 必须是 YYYY-MM-DD（sent 所在的本地日期）');
  if (has('tz') && !/^[+-]\d{2}:\d{2}$/.test(attrs.tz)) err(1, 'HEADER_TZ', 'tz 必须是 +HH:MM 或 -HH:MM');
  if (has('stream') && !['yes', 'no'].includes(attrs.stream)) err(1, 'HEADER_STREAM', 'stream 只能是 yes / no');
  if (has('lag') && !/^\d+s$/.test(attrs.lag)) err(1, 'HEADER_LAG', 'lag 必须是 数字+s');
  const unknown = Object.keys(attrs).filter((k) => !k.startsWith('x_') && !(k in HEADER_ATTRS && at(HEADER_ATTRS[k])));
  if (unknown.length) warn(1, 'HEADER_UNKNOWN', `v="${v}" 未登记的首行属性：${unknown.join(', ')}（读者会忽略）`);
}

// 行的类别与顺序号；null = 未登记（只警告，不参加顺序检查）
function classify(ctx, name) {
  const fi = FIXED_LINES.indexOf(name);
  if (fi >= 0) return { kind: 'fixed', rank: fi };
  if (name === 'device') return { kind: 'device', rank: 20 };
  const ext = EXTENSION_LINES[name];
  if (ext && ctx.at(ext.since)) return { kind: 'extension', rank: 20, reg: ext };
  if (name in KIND_SINCE && ctx.at(KIND_SINCE[name])) return { kind: 'signal', rank: 20 };
  if (name === 'series') return { kind: 'series', rank: 30 };
  if (name === 'note') return { kind: 'note', rank: 40 };
  if (name === 'warn') return { kind: 'warn', rank: 50 };
  return { kind: name.startsWith('x_') ? 'custom' : 'unknown', rank: null };
}

function checkStructure(ctx, lines) {
  const { err, warn } = ctx;
  const SEND_RANK = FIXED_LINES.indexOf('send');
  const minimal = lines.some((l) => l.raw === MINIMAL_WARN);
  const seen = new Map();
  let maxRank = -1;
  let maxName = null;
  let workouts = 0;
  for (const l of lines) {
    const c = classify(ctx, l.name);
    l.cls = c;
    if (c.rank === null) {
      if (maxRank < SEND_RANK) warn(l.line, 'LINE_IN_FIXED_ZONE', `固定区已冻结，${l.name} 行应放在扩展区（send 之后）`);
      else if (maxRank > 20) warn(l.line, 'LINE_ORDER_UNKNOWN', `${l.name} 行应放在扩展区（series / note 之前）`);
      if (c.kind === 'unknown') warn(l.line, 'LINE_UNKNOWN', `未登记的行名 ${l.name}（读者会忽略；自定义请用 x_ 前缀）`);
      continue;
    }
    if (c.rank < maxRank) err(l.line, 'LINE_ORDER', `${l.name} 行应在 ${maxName} 行之前`);
    else { maxRank = c.rank; maxName = l.name; }
    if (['fixed', 'series', 'note'].includes(c.kind)) {
      if (seen.has(l.name)) err(l.line, 'LINE_DUP', `${l.name} 行只能出现一次`);
      else seen.set(l.name, l);
    }
    if (l.name === 'workout' && ++workouts > EXTENSION_LINES.workout.repeat) err(l.line, 'WORKOUT_TOO_MANY', 'workout 行最多 3 条');
  }
  const required = minimal ? ['sent'] : REQUIRED_LINES;
  const last = lines.length ? lines[lines.length - 1].line + 1 : 2;
  for (const name of required) if (!seen.has(name)) err(last, 'LINE_MISSING', `缺少 ${name} 行`);
  if (!seen.has('note')) err(last, 'NOTE_MISSING', 'note 行缺失');
}

function checkSegs(ctx, l, segs, table) {
  const found = {};
  for (const seg of segs) {
    const key = seg.split(/[ :]/)[0];
    const def = table.find((d) => d.key === key && ctx.at(d.since));
    if (!def) { ctx.warn(l.line, 'SEG_UNKNOWN', `${l.name} 行里未登记的段（读者会忽略）：${seg}`); continue; }
    const m = def.re.exec(seg);
    if (!m) { ctx.err(l.line, 'LINE_SYNTAX', `${l.name} 行的 ${key} 段格式不符：${seg}`); continue; }
    if (key in found) ctx.err(l.line, 'SEG_DUP', `${l.name} 行的 ${key} 段重复`);
    found[key] = m;
  }
  return found;
}

function parseHr(ctx, l, piece) {
  const m = HR_RE.exec(piece);
  if (m) {
    const [first, last, min, max] = [m[1], m[2], m[3], m[4]].map(Number);
    const peak = m[5] == null ? null : Number(m[5]);
    const hr = { first, last, min, max, peak, at: m[6] == null ? null : Number(m[6]), carryover: Boolean(m[7]) };
    if (hr.carryover && !ctx.at('0.4')) { ctx.err(l.line, 'LINE_SYNTAX', `carryover 是 v0.4 的写法：${l.raw}`); return null; }
    if (min > max || first < min || first > max || last < min || last > max) ctx.err(l.line, 'HR_RANGE', `${l.name} 行的起止值不在区间 [${min}–${max}] 内`);
    if (peak != null && (peak > max || peak < min)) ctx.err(l.line, 'PEAK_OUT_OF_RANGE', `${l.name} 行的 peak ${peak} 不在区间 [${min}–${max}] 内（峰值是平滑值，不超过最大值）`);
    return hr;
  }
  if (HR_NA_RE.test(piece)) return { na: true, peak: null };
  ctx.err(l.line, 'LINE_SYNTAX', `${l.name} 行的心率段格式不符：${piece}`);
  return null;
}

function checkPhase(ctx, l, sparse, lagSec) {
  const pieces = l.body.split(' | ');
  let hr = null;
  let segs;
  if (NA_RE.test(pieces[0])) {
    hr = { na: true, peak: null };
    segs = pieces.slice(1);
  } else if (pieces.length >= 2 && PHASE_MAIN[l.name].test(pieces[0])) {
    hr = parseHr(ctx, l, pieces[1]);
    if (!hr) return null;
    segs = pieces.slice(2);
  } else {
    ctx.err(l.line, 'LINE_SYNTAX', `${l.name} 行格式不符：${l.raw}`);
    return null;
  }
  const found = checkSegs(ctx, l, segs, PHASE_SEGS);
  const cov = found.cov ? Number(found.cov[1]) : null;
  const dur = hr.na && !PHASE_MAIN[l.name].test(pieces[0]) ? null : durSec(pieces[0]);
  if (found.flag) {
    const f = /^flag: ([a-z-]+)/.exec(found.flag[0])[1];
    if (!PHASE_FLAGS.includes(f)) ctx.warn(l.line, 'FLAG_UNKNOWN', `未登记的 flag：${f}（读者会忽略）`);
  }
  if (found.hrv) {
    if (sparse) ctx.err(l.line, 'SPARSE_FIELD', `稀疏来源不得输出 hrv（${l.name} 行）`);
    if (ctx.at('0.3')) {
      const slow = hr.max != null && hr.max < 60;
      const minWin = slow ? 60 : 30;
      if (dur != null && dur < minWin) ctx.err(l.line, 'HRV_SHORT_WINDOW', `相位 ${dur}s 短于 ${minWin}s，不得输出 hrv（${l.name} 行）`);
      if (found['rr-loss'] && Number(/\d+/.exec(found['rr-loss'][0])[0]) > HRV_MAX_LOSS) ctx.err(l.line, 'HRV_QUALITY', `rr-loss 超过 ${HRV_MAX_LOSS}% 时不得输出 hrv（${l.name} 行）`);
      if (l.name === 'write') ctx.warn(l.line, 'HRV_IN_WRITE', 'write 相位在打字，不应输出 hrv');
    }
  }
  if (hr.peak != null && ctx.at('0.3') && dur != null) {
    const minPhase = Math.max(PEAK_MIN_PHASE_SEC, lagSec != null ? 2 * lagSec : 0);
    if (dur < minPhase) ctx.err(l.line, 'PEAK_SHORT_PHASE', `相位 ${dur}s 短于 ${minPhase}s，不得输出 peak（${l.name} 行）`);
  }
  if (hr.peak != null && ctx.at('0.3')) {
    if (sparse) ctx.err(l.line, 'SPARSE_FIELD', `稀疏来源不得输出 peak（${l.name} 行）`);
    if (cov != null && cov < 70) ctx.err(l.line, 'PEAK_LOW_COVERAGE', `cov ${cov}% < 70% 时不得输出 peak（${l.name} 行）`);
  }
  if (ctx.at('0.4') && hr.peak != null && lagSec != null) {
    if (hr.at < lagSec && !hr.carryover) ctx.err(l.line, 'CARRYOVER_MISSING', `peak @${hr.at}s 早于 lag ${lagSec}s，必须写 carryover（${l.name} 行）`);
    if (hr.at >= lagSec && hr.carryover) ctx.err(l.line, 'CARRYOVER_WRONG', `peak @${hr.at}s 不早于 lag ${lagSec}s，不得写 carryover（${l.name} 行）`);
  }
  if (found['tail-max'] && hr.peak != null && Number(found['tail-max'][1]) <= hr.peak) ctx.err(l.line, 'TAILMAX_NOT_HIGHER', `tail-max 只在高于本相位 peak 时输出（${l.name} 行）`);
  if (found['tail-max'] && lagSec != null && Number(found['tail-max'][2]) > lagSec) ctx.err(l.line, 'TAILMAX_WINDOW', `tail-max 的时刻不得晚于相位结束后 lag 秒（${l.name} 行）`);
  hr.dur = dur;
  hr.act = checkAct(ctx, l, found.act, dur);
  return hr;
}

// v0.4 草案 §5.1：act 段（秒数、平均强度、动作条数、点名的风险输出）
function checkAct(ctx, l, m, dur) {
  if (!m) return null;
  const sec = durSec(m[1]);
  const mean = Number(m[2]);
  const n = Number(m[3]);
  const word = m[4];
  if (!sec || !n) ctx.err(l.line, 'ACT_EMPTY', `没有执行器运行时整段省略，不写 act 0s / 0 acts（${l.name} 行）`);
  if (mean < 1 || mean > 100) ctx.err(l.line, 'ACT_MEAN_RANGE', `act 的 mean 是 1–100 的整数百分比（强度 0 就是停止）：${m[0]}`);
  if ((n === 1) !== (word === 'act')) ctx.err(l.line, 'ACT_COUNT_WORD', `一条动作写 "1 act"，多条写 "N acts"：${m[0]}`);
  if (dur != null && sec > dur) ctx.err(l.line, 'ACT_OVER_PHASE', `act ${sec}s 大于相位时长 ${dur}s（${l.name} 行）`);
  return { sec, mean, n, risky: m[5] ? m[0].replace(/^.*\((.*)\)$/, '$1').split('/') : [] };
}

// v0.4 草案 §5.2：clean 行（只统计没有执行器驱动的那些秒）
function checkClean(ctx, l, lagSec) {
  if (!CLEAN_PHASES.includes(l.meta)) { ctx.err(l.line, 'CLEAN_PHASE', `clean 行括号里必须是 ${CLEAN_PHASES.join(' / ')}：${l.raw}`); return null; }
  const pieces = l.body.split(' | ');
  const hr = parseHr(ctx, l, pieces[0]);
  if (!hr) return null;
  if (hr.na) { ctx.err(l.line, 'LINE_SYNTAX', `clean 行必须有心率统计，没有就整行省略：${l.raw}`); return null; }
  const sm = CLEAN_SEC_RE.exec(pieces[1] ?? '');
  if (!sm) { ctx.err(l.line, 'LINE_SYNTAX', `clean 行的心率统计之后必须是 sec 干净秒/相位时长：${l.raw}`); return null; }
  checkSegs(ctx, l, pieces.slice(2), CLEAN_SEGS);
  const clean = Number(sm[1]);
  const total = Number(sm[2]);
  const minClean = Math.max(CLEAN_MIN_SEC, lagSec != null ? 2 * lagSec : 0);
  if (clean > total) ctx.err(l.line, 'CLEAN_OVER_PHASE', `clean 的干净秒 ${clean}s 大于相位时长 ${total}s`);
  if (clean < minClean) ctx.err(l.line, 'CLEAN_TOO_SHORT', `干净秒 ${clean}s 少于 max(10 s, 2 × lag) = ${minClean}s 时整行省略`);
  if (clean * 100 < total * CLEAN_MIN_SHARE) ctx.err(l.line, 'CLEAN_LOW_SHARE', `干净秒 ${clean}s 不足相位时长 ${total}s 的 ${CLEAN_MIN_SHARE}% 时整行省略`);
  if (hr.peak != null) {
    if (hr.at > total) ctx.err(l.line, 'CLEAN_PEAK_AT', `clean 的 peak @${hr.at}s 超出相位时长 ${total}s（时刻相对相位开始）`);
    if (lagSec != null) {
      if (hr.at < lagSec && !hr.carryover) ctx.err(l.line, 'CARRYOVER_MISSING', `peak @${hr.at}s 早于 lag ${lagSec}s，必须写 carryover（clean 行）`);
      if (hr.at >= lagSec && hr.carryover) ctx.err(l.line, 'CARRYOVER_WRONG', `peak @${hr.at}s 不早于 lag ${lagSec}s，不得写 carryover（clean 行）`);
    }
  }
  return { phase: l.meta, clean, total, l };
}

// v0.4 草案 §5.6：来自执行器的传感器行只写相对变化，不写物理单位
function checkToySensor(ctx, l) {
  if (l.name === 'button') return;   // 按键次数不是测量值（v0.3 §2.1）
  const stripped = l.body.replace(/@\d+(?:\.\d)?s/g, '').replace(/\d+:\d{2}/g, '');
  if (/(?<![+\-\d.])\d/.test(stripped)) ctx.err(l.line, 'TOY_SENSOR_ABSOLUTE', `来自执行器的 ${l.name} 行只写相对变化，每个数值必须带 + 或 -：${l.raw}`);
  if (TOY_SENSOR_UNIT_RE.test(l.body)) ctx.err(l.line, 'TOY_SENSOR_UNIT', `执行器上的传感器单位不统一（unit: 'raw'），不得换算成物理单位：${l.raw}`);
}

function durSec(text) {
  const m = /^(?:(\d+)s|(\d+):(\d{2}))/.exec(text || '');
  if (!m) return null;
  return m[1] != null ? Number(m[1]) : Number(m[2]) * 60 + Number(m[3]);
}

function checkDateText(ctx, l, d) {
  if (DATE_RE.test(d)) return;
  if (DATE_SHORT_RE.test(d)) ctx.warn(l.line, 'DATE_SHORT', `${l.name} 行的日期 ${d} 是已弃用的 MM-DD 写法，应写 YYYY-MM-DD`);
  else ctx.err(l.line, 'DATE_FORMAT', `${l.name} 行的日期格式不符：${d}`);
}

function checkLineDate(ctx, l, how) {
  if (!ctx.at('0.3') || !l.meta) return;
  const parts = l.meta.split(', ');
  const second = parts.slice(1).join(', ');
  if (!second) { if (how === 'prior' || how === 'plain') ctx.err(l.line, 'DATE_FORMAT', `${l.name} 行括号里必须写 来源, 日期`); return; }
  let m;
  if (how === 'prior' || how === 'plain') checkDateText(ctx, l, second);
  else if (how === 'day') { m = /^(\S+)(?: so far)?$/.exec(second); m ? checkDateText(ctx, l, m[1]) : ctx.err(l.line, 'DATE_FORMAT', `day 行括号里的日期格式不符：${second}`); }
  else if (how === 'sleep') {
    if ((m = /^night of (\S+)$/.exec(second))) checkDateText(ctx, l, m[1]);
    else if ((m = /^nap (\S+) \d{2}:\d{2}$/.exec(second))) checkDateText(ctx, l, m[1]);
    else ctx.err(l.line, 'DATE_FORMAT', `sleep 行括号里应写 night of 日期 或 nap 日期 HH:MM：${second}`);
  }
}

function checkBaseline(ctx, l) {
  const pieces = l.body.split(' | ');
  const main = pieces[0];
  if (NA_RE.test(main) && main !== 'n/a') { checkSegs(ctx, l, pieces.slice(1), BASELINE_SEGS); return; }
  const m = /^(\d+) bpm \(([a-z][a-z0-9-]*)(?:, n=\d+)?(?:, set (\d{4}-\d{2}-\d{2}), ([^,;()]+))?(?:; hrv \d+ ms)?\)$/.exec(main);
  if (!m) { ctx.err(l.line, 'LINE_SYNTAX', `baseline 行格式不符：${l.raw}`); return; }
  const method = m[2];
  if (DEPRECATED_BASELINE_METHODS.includes(method)) {
    if (ctx.at('0.4')) ctx.err(l.line, 'BASELINE_METHOD_DEPRECATED', `v0.4 起不得输出已弃用的基线方法 ${method}`);
    else if (ctx.at('0.3')) ctx.warn(l.line, 'BASELINE_METHOD_DEPRECATED', `${method} 已弃用，应改用 ${BASELINE_METHODS.join(' / ')}`);
  } else if (!BASELINE_METHODS.includes(method)) {
    ctx.err(l.line, 'LINE_SYNTAX', `未登记的基线方法 ${method}`);
  }
  if (m[3]) {
    if (!ctx.at('0.4')) ctx.err(l.line, 'LINE_SYNTAX', `manual 的 set 写法是 v0.4 的：${l.raw}`);
    else if (method !== 'manual') ctx.err(l.line, 'LINE_SYNTAX', 'set 日期与设备只用于 manual');
    else {
      if (!DATE_RE.test(m[3])) ctx.err(l.line, 'DATE_FORMAT', `manual 的设定日期格式不符：${m[3]}`);
      if (!DEVICE_RE.test(m[4]) || serialProblem(m[4])) ctx.err(l.line, 'PRIVACY_SERIAL', `manual 的设备名不合规：${m[4]}`);
    }
  } else if (ctx.at('0.4') && method === 'manual') {
    ctx.err(l.line, 'BASELINE_MANUAL_INFO', 'v0.4 起 manual 基线必须带 set 日期与设备');
  }
  const found = checkSegs(ctx, l, pieces.slice(1), BASELINE_SEGS);
  if (found.changed) {
    const old = found.changed[1];
    if (!BASELINE_METHODS.includes(old) && !DEPRECATED_BASELINE_METHODS.includes(old)) ctx.err(l.line, 'LINE_SYNTAX', `changed from 后面是未登记的方法 ${old}`);
  }
  if (ctx.at('0.4') && !found.age) ctx.err(l.line, 'BASELINE_AGE_MISSING', 'v0.4 起有数值的基线必须带 age 段');
}

function checkHistory(ctx, l) {
  const pieces = l.body.split(' | ');
  if (pieces[0] === 'n/a') { checkSegs(ctx, l, pieces.slice(1), HISTORY_SEGS); return; }
  if (!/^read-peaks [\d ·]+$/.test(pieces[0])) { ctx.err(l.line, 'LINE_SYNTAX', `history 行格式不符：${l.raw}`); return; }
  checkSegs(ctx, l, pieces.slice(1), HISTORY_SEGS);
}

function checkAway(ctx, l) {
  const pieces = l.body.split(' | ');
  checkSegs(ctx, l, pieces.slice(1), []);
  if (pieces[0] === 'none') return;
  const absRe = new RegExp(`^${CLOCK}–${CLOCK} (hidden|idle|unfocused|offscreen)(?: \\[\\d+–\\d+\\])?$`);
  const relRe = /^-(\d+):(\d{2})\.\.-(\d+):(\d{2}) (hidden|idle|unfocused|offscreen) \((gen|read|write)\)(?: \[\d+–\d+\])?$/;
  let abs = false;
  for (const span of pieces[0].split('; ')) {
    let m;
    if ((m = absRe.exec(span))) {
      abs = true;
      if ((m[1] === 'unfocused' || m[1] === 'offscreen') && !ctx.at('0.4')) ctx.err(l.line, 'LINE_SYNTAX', `${m[1]} 是 v0.4 的类型：${span}`);
    } else if ((m = relRe.exec(span))) {
      if (!ctx.at('0.4')) { ctx.err(l.line, 'LINE_SYNTAX', `相对 sent 的 away 写法是 v0.4 的：${span}`); continue; }
      const from = Number(m[1]) * 60 + Number(m[2]);
      const to = Number(m[3]) * 60 + Number(m[4]);
      if (from < to) ctx.err(l.line, 'LINE_SYNTAX', `away 区间起点必须早于终点：${span}`);
    } else {
      ctx.err(l.line, 'LINE_SYNTAX', `away 区间格式不符：${span}`);
    }
  }
  if (abs && ctx.at('0.4')) ctx.warn(l.line, 'AWAY_ABSOLUTE', 'v0.4 起 away 应写相对 sent 的偏移（绝对时刻写法 1.0 移除）');
}

// v0.3 §5.8 haptics 行的主体 + v0.4 §13 tuned 段（只列改过的参数）
const HAPTICS_HEAD = /^(?:off|on \| cap \d{1,3}% \| profile (?:slow-burn|steady|frenzy|max)(?: \| actuators \d+)?)(?= \| |$)/;
const TUNED_ITEMS = {
  floor: { re: /^floor (\d{1,3})%$/, ok: (m) => Number(m[1]) <= 95 },
  long: { re: /^long (\d{1,3}(?:\.\d)?)s$/, ok: (m) => Number(m[1]) >= 1 && Number(m[1]) <= 60 },
  heartbeat: { re: /^heartbeat (\d{1,3}(?:\.\d)?)s$/, ok: (m) => Number(m[1]) >= 1 && Number(m[1]) <= 60 },
  wave: { re: /^wave (\d{1,3}(?:\.\d)?)s$/, ok: (m) => Number(m[1]) >= 1 && Number(m[1]) <= 60 },
  gap: { re: /^gap (\d{1,3}(?:\.\d)?)s$/, ok: (m) => Number(m[1]) >= 0.2 && Number(m[1]) <= 10 },
  'per-reply': { re: /^per-reply ([1-5])$/, ok: () => true },
};
function checkHaptics(ctx, l) {
  const head = HAPTICS_HEAD.exec(l.body);
  if (!head) { ctx.err(l.line, 'LINE_SYNTAX', `haptics 行格式不符：${l.raw}`); return; }
  const rest = l.body.slice(head[0].length);
  if (!rest) return;
  for (const seg of rest.slice(3).split(' | ')) {
    if (!seg.startsWith('tuned ')) { ctx.warn(l.line, 'SEG_UNKNOWN', `haptics 行里未登记的段（读者会忽略）：${seg}`); continue; }
    if (!ctx.at('0.4')) { ctx.warn(l.line, 'SEG_UNKNOWN', 'tuned 段是 v0.4 草案 §13 登记的（v0.3 读者会忽略）'); continue; }
    if (l.body.startsWith('off')) ctx.err(l.line, 'HAPTICS_TUNED', 'haptics 是 off 时不写 tuned 段');
    const seen = new Set();
    for (const item of seg.slice(6).split(', ')) {
      const key = item.split(' ')[0];
      const def = TUNED_ITEMS[key];
      const m = def && def.re.exec(item);
      if (!m) { ctx.err(l.line, 'HAPTICS_TUNED', `tuned 段里的参数不符：${item}`); continue; }
      if (!def.ok(m)) ctx.err(l.line, 'HAPTICS_TUNED', `tuned 段的 ${key} 超出范围：${item}`);
      if (seen.has(key)) ctx.err(l.line, 'HAPTICS_TUNED', `tuned 段的 ${key} 重复`);
      seen.add(key);
    }
  }
}

// v0.4 §12 gates 行：门槛名、时长、来源；值在允许范围里
const GATE_RANGE = { idle: [60, 300], 'too-long': [180, 1800], pause: [3, 20] };
function checkGates(ctx, l) {
  const segs = l.body.split(' | ');
  if (segs[segs.length - 1] === 'frozen') segs.pop();
  if (!segs.length) { ctx.err(l.line, 'GATES_SYNTAX', 'gates 行至少写一个门槛'); return; }
  const seen = new Set();
  for (const seg of segs) {
    const m = /^(idle|too-long|pause) ((?:\d+s|\d+:\d{2})) \((est|cal n=\d+|user)\)$/.exec(seg);
    if (!m) { ctx.err(l.line, 'GATES_SYNTAX', `gates 行的门槛格式不符：${seg}`); continue; }
    if (seen.has(m[1])) ctx.err(l.line, 'GATES_SYNTAX', `gates 行的 ${m[1]} 重复`);
    seen.add(m[1]);
    const sec = durSec(m[2]);
    const [lo, hi] = GATE_RANGE[m[1]];
    if (sec < lo || sec > hi) ctx.err(l.line, 'GATES_RANGE', `${m[1]} ${m[2]} 超出允许范围（${lo}–${hi} 秒）`);
  }
}

function checkFeedback(ctx, l) {
  const segs = l.body.split(' | ');
  let events = 0;
  segs.forEach((seg, i) => {
    let m;
    if ((m = FEEDBACK_ACTS_RE.exec(seg))) {
      if (i !== 0) ctx.err(l.line, 'LINE_SYNTAX', 'feedback 行的 acts 段必须在最前');
      const [sent, done, cut, pending, refused] = m.slice(1).map((x) => Number(x ?? 0));
      if (sent !== done + cut + pending + refused) ctx.err(l.line, 'FEEDBACK_COUNT', `acts 段必须满足 sent = done + cut + pending + refused（${sent} ≠ ${done + cut + pending + refused}）`);
      return;
    }
    if (/^\+\d+ more$/.test(seg)) {
      if (i !== segs.length - 1) ctx.err(l.line, 'LINE_SYNTAX', 'feedback 行的 +N more 段必须在最后');
      return;
    }
    if ((m = FEEDBACK_EVENT_RE.exec(seg))) {
      events++;
      if (m[2] === 'send' && m[3] !== '0') ctx.err(l.line, 'FEEDBACK_SEND_AT', `发送时刻的事件写 send @0s：${seg}`);
      const note = m[4];
      if (note != null) {
        if (FEEDBACK_REF_V04_RE.test(note)) {
          if (!ctx.at('0.4')) ctx.err(l.line, 'LINE_SYNTAX', `native-unstoppable 是 v0.4 的备注：${note}`);
          else if (!m[1].startsWith('stop by')) ctx.err(l.line, 'LINE_SYNTAX', `native-unstoppable 只用于 stop by …：${seg}`);
        } else if (FEEDBACK_REF_LEGACY_RE.test(note)) ctx.warn(l.line, 'FEEDBACK_REF_LEGACY', `旧备注写法（读者仍接受），应写 reply -N, act N, Ns in：${note}`);
        else if (!FEEDBACK_REF_RE.test(note) || note === '') ctx.err(l.line, 'LINE_SYNTAX', `feedback 备注只能写原因与 reply -N[, act N][, Ns in]：${note}`);
        else if (/^(?:disconnected|deadline|heat-limit|rate-limit|other)/.test(note) && !m[1].startsWith('stop by device')) ctx.err(l.line, 'LINE_SYNTAX', `停止原因只用于 stop by device：${seg}`);
      }
      return;
    }
    const key = seg.split(' ')[0];
    if (FEEDBACK_KEYS.has(key)) ctx.err(l.line, 'LINE_SYNTAX', `feedback 行的 ${key} 段格式不符：${seg}`);
    else ctx.warn(l.line, 'SEG_UNKNOWN', `feedback 行里未登记的段（读者会忽略）：${seg}`);
  });
  if (events > FEEDBACK_MAX_EVENTS) ctx.err(l.line, 'FEEDBACK_TOO_MANY', `feedback 行最多 ${FEEDBACK_MAX_EVENTS} 个事件段，多的丢弃最早的并写 +N more`);
}

function checkStream(ctx, l, sparse, lagSec) {
  const lm = /^lag (\d+)s$/.exec(l.meta || '');
  if (!lm) { ctx.err(l.line, 'LINE_SYNTAX', 'stream 行括号里必须是 lag Ns'); }
  else if (lagSec != null && Number(lm[1]) !== lagSec) ctx.err(l.line, 'STREAM_LAG_MISMATCH', `stream 行的 lag ${lm[1]}s 与首行 lag="${ctx.attrs.lag}" 不一致`);
  if (ctx.attrs.stream !== 'yes') ctx.err(l.line, 'STREAM_WITHOUT_ATTR', '只有首行 stream="yes" 时才能输出 stream 行');
  const pieces = l.body.split(' | ');
  const wait = new RegExp(`^wait ${DUR}(?: \\([^()]*\\))?$`);
  const body = new RegExp(`^body ${DUR}, (\\d+) chars$`);
  const bm = pieces[1] ? body.exec(pieces[1]) : null;
  if (pieces.length < 3 || !wait.test(pieces[0]) || !bm) { ctx.err(l.line, 'LINE_SYNTAX', `stream 行格式不符：${l.raw}`); return; }
  const hr = parseHr(ctx, { ...l, name: 'stream' }, pieces[2].replace(/ carryover$/, ''));
  if (!hr) return;
  const found = checkSegs(ctx, l, pieces.slice(3), STREAM_SEGS);
  checkAct(ctx, l, found.act, durSec(pieces[1].slice(5)));   // §5.1：统计范围是 body 区间
  if (hr.peak != null && sparse) ctx.err(l.line, 'SPARSE_FIELD', '稀疏来源不得输出 peak（stream 行）');
  if (found.pos) {
    const [n, total, para, paras] = found.pos.slice(1).map(Number);
    if (hr.peak == null) ctx.err(l.line, 'STREAM_POS_WITHOUT_PEAK', '没有 peak 时不得输出 pos');
    if (sparse) ctx.err(l.line, 'SPARSE_FIELD', '稀疏来源不得输出 pos（stream 行）');
    if (total !== Number(bm[1]) || n > total || para > paras || para < 1) ctx.err(l.line, 'STREAM_POS_RANGE', `pos 必须满足 已显示 ≤ 总字数（= body 字数），段落号在 1–总段落数之间：${found.pos[0]}`);
  }
}

// v0.4 草案 §8.3
function checkActuator(ctx, l) {
  const found = checkSegs(ctx, l, l.body.split(' | '), ACTUATOR_SEGS);
  const keys = Object.keys(found);
  if (!keys.length) { ctx.err(l.line, 'LINE_SYNTAX', `actuator 行至少要有 battery / charging / link 之一：${l.raw}`); return; }
  const order = ACTUATOR_SEGS.map((d) => d.key).filter((k) => keys.includes(k));
  if (keys.join() !== order.join()) ctx.err(l.line, 'LINE_ORDER', `actuator 行的段顺序应为 battery → charging → link：${l.raw}`);
  const b = found.battery;
  if (b && b[1] != null) {
    const pct = Number(b[1]);
    if (pct > 100) ctx.err(l.line, 'ACTUATOR_BATTERY_RANGE', `电量必须在 0–100%：${b[0]}`);
    if (b[2] && pct > ACTUATOR_LOW_MAX) ctx.err(l.line, 'ACTUATOR_LOW_WRONG', `low 只在电量 ≤ ${ACTUATOR_LOW_MAX}% 时可以写：${b[0]}`);
  }
}

// v0.4 草案 §9.3
function checkNative(ctx, l) {
  const segs = l.body.split(' | ');
  if (segs.length > NATIVE_MAX_MODES) ctx.err(l.line, 'NATIVE_TOO_MANY', `native 行最多 ${NATIVE_MAX_MODES} 个模式`);
  let last = 0;
  for (const seg of segs) {
    const m = NATIVE_SEG_RE.exec(seg);
    if (!m) { ctx.err(l.line, 'LINE_SYNTAX', `native 行的模式段应为 序号 名字[ (unstoppable, 时长, opt-in)]：${seg}`); continue; }
    const n = Number(m[1]);
    if (n < 1 || n <= last) ctx.err(l.line, 'NATIVE_ORDER', `native 行的序号必须从 1 起、升序且不重复：${seg}`);
    last = Math.max(last, n);
    if (m[3] != null && !NATIVE_NOTE_RE.test(m[3])) ctx.err(l.line, 'LINE_SYNTAX', `native 行的括号只能写 unstoppable, 时长, opt-in：${seg}`);
  }
}

function checkLines(ctx, lines) {
  const { err, warn, at, attrs } = ctx;
  const sparse = /^\d+(?:ms|s)$/.test(attrs.cadence || '') && !attrs.cadence.endsWith('ms') && parseInt(attrs.cadence, 10) >= 30;
  const lagSec = at('0.4') && /^\d+s$/.test(attrs.lag || '') ? parseInt(attrs.lag, 10) : null;
  const first = {};
  const info = {};
  // v0.4 草案 §5.6：块里出现过的执行器 id（actuator / native 行），用来认出玩具上的传感器行
  const actuatorIds = new Set(lines.filter((l) => (l.name === 'actuator' || l.name === 'native') && l.meta).map((l) => l.meta.split(', ')[0]));
  const cleans = [];
  for (const l of lines) {
    const c = l.cls;
    if (!(l.name in first)) first[l.name] = l;
    if (c.kind === 'unknown' || c.kind === 'custom') continue;
    if (l.l2 && !(c.kind === 'extension' && c.reg.level === 'L2')) err(l.line, 'L2_TAG_WRONG', `${l.name} 不是 L2 段，不得带 [L2]`);
    const needsMeta = l.name === 'prior' || l.name === 'series' || c.kind === 'extension' || c.kind === 'signal';
    if (needsMeta && !l.meta) { err(l.line, 'LINE_SYNTAX', `${l.name} 行必须带括号：${l.raw}`); continue; }
    if (!needsMeta && l.meta) { err(l.line, 'LINE_SYNTAX', `${l.name} 行不带括号：${l.raw}`); continue; }
    switch (l.name) {
      case 'sent':
        if (!new RegExp(`^${CLOCK}$`).test(l.body)) err(l.line, 'LINE_SYNTAX', `sent 行格式不符：${l.raw}`);
        break;
      case 'scope':
        if (l.raw === SCOPE_TEXTS.normal) info.scope = 'normal';
        else if (at('0.3') && l.raw === SCOPE_TEXTS.discarded) info.scope = 'discarded';
        else if (at('0.3') && l.raw === SCOPE_TEXTS.impersonate) info.scope = 'impersonate';
        else if (at('0.3') && SCOPE_REPLAY_RE.test(l.raw)) info.scope = 'replay';
        else err(l.line, 'LINE_SYNTAX', `scope 行不是登记过的固定句：${l.raw}`);
        break;
      case 'baseline': checkBaseline(ctx, l); break;
      case 'prior': {
        if (!/^[^,]+, .+$/.test(l.meta)) { err(l.line, 'LINE_SYNTAX', `prior 行括号里必须是 来源, 日期：${l.raw}`); break; }
        checkLineDate(ctx, l, 'prior');
        break;
      }
      case 'history': checkHistory(ctx, l); break;
      case 'gen': case 'read': case 'write':
        if (!(l.name in info)) info[l.name] = checkPhase(ctx, l, sparse, lagSec);
        break;
      case 'read-pos': {
        const pieces = l.body.split(' | ');
        const m = READPOS_RE.exec(pieces[0]);
        if (!m) { err(l.line, 'LINE_SYNTAX', `read-pos 行格式不符：${l.raw}`); break; }
        checkSegs(ctx, l, pieces.slice(1), []);
        if (/\./.test(m[1] ?? m[2])) warn(l.line, 'CPS_NOT_INTEGER', '生产者应该把 cps 取整');
        info.readPos = l;
        break;
      }
      case 'away': checkAway(ctx, l); break;
      case 'send': {
        const pieces = l.body.split(' | ');
        if (!SEND_RE.test(pieces[0])) err(l.line, 'LINE_SYNTAX', `send 行格式不符：${l.raw}`);
        checkSegs(ctx, l, pieces.slice(1), []);
        break;
      }
      case 'series':
        if (!new RegExp(`^\\d+s from ${CLOCK}$`).test(l.meta) || !/^[\d· ]+$/.test(l.body)) err(l.line, 'LINE_SYNTAX', `series 行格式不符：${l.raw}`);
        if (sparse) err(l.line, 'SPARSE_FIELD', '稀疏来源不得输出 series');
        break;
      case 'note':
        if (l.raw !== NOTE_TEXT) err(l.line, 'NOTE_MISSING', 'note 行的文字不是规定的固定句');
        break;
      case 'warn': break;
      case 'device':
        if (l.body.length > 120) err(l.line, 'DEVICE_LINE', 'device 行 ≤ 120 字符（不含前缀）');
        break;
      default: {
        if (c.kind === 'signal' || c.reg?.named) {
          const who = l.meta.split(', ')[0];
          const why = serialDigitsProblem(who);
          if (why) err(l.line, 'PRIVACY_SERIAL', `${l.name} 行括号里的名字疑似含序列号（${why}）`);
        }
        if (c.kind === 'signal') {
          if (BUS_ONLY_KINDS.includes(l.name)) err(l.line, 'KIND_NOT_IN_BLOCK', `${l.name} 只在总线上流转，不进块`);
          // v0.4 §5.6-1：括号里是执行器 id，或设备 id（某个执行器 id 的前缀）
          if (at('0.4')) { const id = l.meta.split(', ')[0]; if (actuatorIds.has(id) || [...actuatorIds].some((a) => a.startsWith(`${id}:`))) checkToySensor(ctx, l); }
          break;
        }
        const reg = c.reg;
        if (reg.level === 'L2' && !l.l2) err(l.line, 'L2_TAG_MISSING', `${l.name} 是 L2 敏感段，行名后必须带 [L2]`);
        if (reg.body && !reg.body.test(l.body)) err(l.line, 'LINE_SYNTAX', `${l.name} 行格式不符：${l.raw}`);
        if (reg.date) checkLineDate(ctx, l, reg.date);
        if (l.name === 'feedback') checkFeedback(ctx, l);
        if (l.name === 'haptics') checkHaptics(ctx, l);
        if (l.name === 'gates') checkGates(ctx, l);
        if (l.name === 'stream') { info.stream = l; checkStream(ctx, l, sparse, lagSec); }
        if (l.name === 'clean') {
          if (cleans.some((c) => c.phase === l.meta)) err(l.line, 'LINE_DUP', `clean(${l.meta}) 行只能出现一次`);
          const c = checkClean(ctx, l, lagSec);
          if (c) cleans.push(c);
        }
        if (reg.perActuator) {
          if (!IDENT_RE.test(l.meta)) err(l.line, 'ACTUATOR_NAME', `${l.name} 行括号里必须是执行器 id（v0.3 §4.4 的标识规则）：${l.meta}`);
          const seen = (info[l.name] ??= new Set());
          if (seen.has(l.meta)) err(l.line, 'LINE_DUP', `${l.name}(${l.meta}) 行只能出现一次`);
          seen.add(l.meta);
          if (l.name === 'actuator') {
            if (seen.size === ACTUATOR_MAX_LINES + 1) err(l.line, 'ACTUATOR_TOO_MANY', `actuator 行最多 ${ACTUATOR_MAX_LINES} 行`);
            checkActuator(ctx, l);
          } else {
            info.nativeLine ??= l;
            checkNative(ctx, l);
          }
        }
      }
    }
  }

  // 跨行规则
  const trig = attrs.trigger;
  if (at('0.3')) {
    const minimal = lines.some((l) => l.raw === MINIMAL_WARN);
    if (!first.scope && !minimal && attrs.replay !== 'group') warn(first.sent?.line ?? 2, 'SCOPE_MISSING', 'v0.3 起生产者应该在 sent 后输出 scope 行');
    if (info.scope && trig && SCOPE_FOR_TRIGGER[trig] !== info.scope) err(first.scope.line, 'SCOPE_TRIGGER', `trigger="${trig}" 的 scope 行应是 ${SCOPE_FOR_TRIGGER[trig]} 那一句`);
    if (trig === 'continue' && attrs.replay !== 'continue') err(1, 'REPLAY_MISSING', 'trigger="continue" 时首行必须带 replay="continue"');
    if (attrs.replay === 'continue' && trig && trig !== 'continue') err(1, 'HEADER_REPLAY', 'replay="continue" 只用于 trigger="continue"');
    const discarded = trig === 'swipe' || trig === 'regenerate' || info.scope === 'discarded';
    if (discarded && attrs.replay !== 'continue') {
      for (const n of ['write', 'send']) {
        if (first[n] && first[n].body.split(' | ')[0] !== NO_NEW_MESSAGE) err(first[n].line, 'SWIPE_NEW_MESSAGE', `换页 / 重新生成没有新消息，${n} 行必须写 ${n}: ${NO_NEW_MESSAGE}`);
      }
      if (info.readPos) err(info.readPos.line, 'READPOS_FORBIDDEN', '换页 / 重新生成时被读的回复已不在上下文里，不得输出 read-pos');
    }
    if (trig === 'impersonate' && first.write && first.write.body.split(' | ')[0] !== IMPERSONATE_WRITE) err(first.write.line, 'IMPERSONATE_WRITE', `trigger="impersonate" 时写 write: ${IMPERSONATE_WRITE}`);
    if (info.readPos) {
      if (!info.read || info.read.peak == null) err(info.readPos.line, 'READPOS_WITHOUT_PEAK', 'read 行没有 peak 时不得输出 read-pos');
      if (sparse) err(info.readPos.line, 'SPARSE_FIELD', '稀疏来源不得输出 read-pos');
    }
  }
  // v0.4 草案 §5.2：clean 行与它那条相位行的关系
  for (const c of cleans) {
    const phase = info[c.phase];
    if (!first[c.phase]) { err(c.l.line, 'CLEAN_WITHOUT_ACT', `没有 ${c.phase} 行时不得输出 clean(${c.phase})`); continue; }
    if (!phase || !phase.act) { err(c.l.line, 'CLEAN_WITHOUT_ACT', `只有 ${c.phase} 行有 act 段时才可以输出 clean(${c.phase})`); continue; }
    if (phase.dur != null && c.total !== phase.dur) err(c.l.line, 'CLEAN_PHASE_SEC', `clean 的 sec 分母必须等于相位时长（${c.phase} 行是 ${phase.dur}s，写了 ${c.total}s）`);
    if (phase.dur != null && c.clean > phase.dur - phase.act.sec) err(c.l.line, 'CLEAN_OVER_PHASE', `干净秒 ${c.clean}s 大于相位时长减去 act ${phase.act.sec}s`);
  }
  if (at('0.4') && info.nativeLine && first.haptics && first.haptics.body === 'off') err(info.nativeLine.line, 'NATIVE_HAPTICS_OFF', 'haptics 行是 off 时不得输出 native 行');
  if (at('0.4') && attrs.stream === 'yes' && info.readPos) err(info.readPos.line, 'READPOS_FORBIDDEN', 'stream="yes" 时不得输出 read-pos（位置看 stream 行的 pos）');
}

// 按行名取值（读者用）：getLine(result, 'read') → 第一条同名行或 null
export function getLine(result, name) {
  return result.lines.find((l) => l.name === name) ?? null;
}
