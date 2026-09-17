// Tavern Bio-Context 注入块的参考解析器（v0.2 + v0.3 草案）。
// 规则与 schema/block.abnf、docs/conformance-zh.md 一致；实现可以直接 import 本文件做一致性测试。
//
// parseBlock(text) → { ok, errors: [{line, code, message}], warnings: [...], header, lines: [{name, raw}] }

export const MODES = ['backstage', 'in-story', 'device-aware', 'author', 'character'];
export const TRANSPORTS = ['ble', 'bridge', 'push', 'api', 'bus'];
export const TRIGGERS = ['normal', 'swipe', 'regenerate', 'continue', 'impersonate'];
export const NOTE_TEXT = 'note: observable record only; phase edges are page events; hr lags seconds; wrist motion lowers confidence';
export const SCOPE_TEXT = 'scope: gen, read = previous reply; write, send = this message';

// 扩展区（send 之后、series 之前）里登记过的行名；未登记的行只给警告（读者必须忽略不认识的行）
export const EXTENSION_LINES = {
  sleep: { level: 'L1' }, day: { level: 'L1' }, workout: { level: 'L1', repeat: 3 }, trend: { level: 'L1' },
  wear: { level: 'L0' }, button: { level: 'L0' }, motion: { level: 'L0' }, sensor: { level: 'L0' },
  body: { level: 'L2' }, cycle: { level: 'L2' }, journal: { level: 'L2' },
  env: { level: 'L0' },
  // v0.3 §5.8：触觉输出的当前状态，让卡片 / 预设知道能不能写 <bio_act/>、用户选了哪个档位
  // v0.3 §5.12：读者对设备的操作与上一条回复动作的执行结果（玩具 → 剧情）
  feedback: { level: 'L0', body: /^(?:acts \d+ sent, \d+ done|(?:(?:stop by (?:reader|safeword|device))|stronger \+\d{1,3}%|weaker -\d{1,3}%|pace (?:slow-burn|steady|frenzy|max)|replay [a-z]+|skip) (?:gen|read|write) @\d+s(?: \([^()|<>]{1,40}\))?|\+\d+ more)(?: \| (?:acts \d+ sent, \d+ done|(?:(?:stop by (?:reader|safeword|device))|stronger \+\d{1,3}%|weaker -\d{1,3}%|pace (?:slow-burn|steady|frenzy|max)|replay [a-z]+|skip) (?:gen|read|write) @\d+s(?: \([^()|<>]{1,40}\))?|\+\d+ more)){0,8}$/ },
  haptics: { level: 'L0', body: /^(?:off|on \| cap \d{1,3}% \| profile (?:slow-burn|steady|frenzy|max)(?: \| actuators \d+)?)$/ },
};
export const KINDS = ['hr', 'rr', 'pressure', 'temperature', 'room_temperature', 'humidity', 'spo2', 'stress', 'button', 'battery',
  'wear', 'motion', 'skin_temperature', 'resp_rate', 'posture', 'charging', 'ppg'];

const CLOCK = '\\d{2}:\\d{2}:\\d{2}';
const DUR = '(?:\\d+s|\\d+:\\d{2})';
const HR_RANGE = 'hr \\d+→\\d+ \\[\\d+–\\d+\\](?: peak \\d+ @\\d+s)?';
const SEG = '(?: \\| [^|]+)*';

// 固定区：顺序固定；required=true 必须出现
const FIXED = [
  { name: 'sent', required: true, re: new RegExp(`^sent: ${CLOCK}$`) },
  { name: 'scope', required: false, re: new RegExp(`^${escapeRe(SCOPE_TEXT)}$`) },
  { name: 'baseline', required: true, re: /^baseline: (?:\d+ bpm \((?:quiet-median|p20|manual)(?:, n=\d+)?(?:; hrv \d+ ms)?\)|n\/a \([^)]*\))$/ },
  { name: 'prior', required: false, re: /^prior\([^,()]+, [^()]+\): [^|]+(?: \| [^|]+)*$/ },
  { name: 'history', required: true, re: /^history: (?:n\/a|read-peaks [\d ·]+(?: \| read-dur [\d: ·]+)?(?: \| hrv [\d ·]+)?)$/ },
  { name: 'gen', required: true, re: new RegExp(`^gen: (?:n/a|${DUR}(?: \\([^)]*\\))? \\| (?:${HR_RANGE}|n/a(?: \\([^)]*\\))?)${SEG})$`) },
  { name: 'read', required: true, re: new RegExp(`^read: (?:n/a(?: \\([^)]*\\))?|${DUR} \\| (?:${HR_RANGE}|n/a(?: \\([^)]*\\))?)${SEG})$`) },
  { name: 'read-pos', required: false, re: /^read-pos: (?:peak ~\d+% \(~\d+\/\d+ chars, para \d+\/\d+\) @\d+ cps (?:est|cal)|partial \(read time covers ~\d+% of \d+ chars @\d+ cps (?:est|cal)\), peak at \d+% of read time)$/ },
  { name: 'write', required: true, re: new RegExp(`^write: (?:n/a(?: \\([^)]*\\))?|${DUR}, \\d+ chars, pauses \\d+, edits \\d+ \\| (?:${HR_RANGE}|n/a(?: \\([^)]*\\))?)${SEG})$`) },
  { name: 'away', required: true, re: new RegExp(`^away: (?:none|${CLOCK}–${CLOCK} (?:hidden|idle)(?: \\[\\d+–\\d+\\])?(?:; ${CLOCK}–${CLOCK} (?:hidden|idle)(?: \\[\\d+–\\d+\\])?)*)$`) },
  { name: 'send', required: true, re: /^send: (?:n\/a(?: \([^)]*\))?|\d+ bpm(?: \([+-]\d+%\))?)$/ },
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parseHeader(line, errors) {
  const m = /^<bio_context((?: [a-z-]+="[^"<>]*")*)>$/.exec(line);
  if (!m) { errors.push({ line: 1, code: 'HEADER_SYNTAX', message: '首行必须是 <bio_context 属性="值" …>' }); return null; }
  const attrs = {};
  for (const a of m[1].matchAll(/ ([a-z-]+)="([^"]*)"/g)) {
    if (a[1] in attrs) errors.push({ line: 1, code: 'HEADER_DUP', message: `属性 ${a[1]} 重复` });
    attrs[a[1]] = a[2];
  }
  const need = ['v', 'mode', 'source'];
  for (const k of need) if (!(k in attrs)) errors.push({ line: 1, code: 'HEADER_MISSING', message: `缺少必需属性 ${k}` });
  if (attrs.v && !/^0\.\d+$/.test(attrs.v)) errors.push({ line: 1, code: 'HEADER_VERSION', message: `v="${attrs.v}" 不是 0.x` });
  if (attrs.mode && !MODES.includes(attrs.mode)) errors.push({ line: 1, code: 'HEADER_MODE', message: `mode="${attrs.mode}" 不在 ${MODES.join(' / ')}` });
  if (attrs.source && !/^[a-z0-9][a-z0-9._-]*$/.test(attrs.source)) errors.push({ line: 1, code: 'HEADER_SOURCE', message: 'source 只能用小写字母、数字、点、下划线、连字符' });
  if ('device' in attrs) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(attrs.device)) errors.push({ line: 1, code: 'HEADER_DEVICE', message: 'device 只能用小写字母、数字、点、连字符' });
    if (/\d{6,}/.test(attrs.device)) errors.push({ line: 1, code: 'PRIVACY_SERIAL', message: 'device 疑似含序列号（连续 6 位以上数字）' });
  }
  if ('transport' in attrs && !TRANSPORTS.includes(attrs.transport)) errors.push({ line: 1, code: 'HEADER_TRANSPORT', message: `transport="${attrs.transport}" 不在 ${TRANSPORTS.join(' / ')}` });
  if ('cadence' in attrs && !/^\d+(?:ms|s)$/.test(attrs.cadence)) errors.push({ line: 1, code: 'HEADER_CADENCE', message: 'cadence 必须是 数字+ms 或 数字+s' });
  if ('rr' in attrs && !['yes', 'no'].includes(attrs.rr)) errors.push({ line: 1, code: 'HEADER_RR', message: 'rr 只能是 yes / no' });
  if ('trigger' in attrs && !TRIGGERS.includes(attrs.trigger)) errors.push({ line: 1, code: 'HEADER_TRIGGER', message: `trigger 不在 ${TRIGGERS.join(' / ')}` });
  if ('perceiver' in attrs) {
    const list = attrs.perceiver.split('、');
    if (!list.length || list.length > 3 || list.some((x) => !x || x.length > 24)) errors.push({ line: 1, code: 'HEADER_PERCEIVER', message: 'perceiver 为 1–3 个名字，用“、”分隔，每个 ≤ 24 字' });
    if (['backstage', 'author'].includes(attrs.mode)) errors.push({ line: 1, code: 'PERCEIVER_IN_BACKSTAGE', message: '幕后模式不得带 perceiver' });
  }
  const known = new Set(['v', 'mode', 'source', 'device', 'transport', 'cadence', 'rr', 'trigger', 'perceiver']);
  const unknown = Object.keys(attrs).filter((k) => !known.has(k));
  return { attrs, unknown };
}

export function parseBlock(text) {
  const errors = [];
  const warnings = [];
  const rows = String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const lines = [];
  const header = parseHeader(rows[0] || '', errors);
  if (header && header.unknown.length) warnings.push({ line: 1, code: 'HEADER_UNKNOWN', message: `未登记的首行属性：${header.unknown.join(', ')}` });
  if (rows[rows.length - 1] !== '</bio_context>') errors.push({ line: rows.length, code: 'CLOSE_MISSING', message: '最后一行必须是 </bio_context>' });
  const body = rows.slice(1, rows[rows.length - 1] === '</bio_context>' ? -1 : undefined);

  let i = 0;
  // 1) 固定区
  for (const f of FIXED) {
    const raw = body[i];
    const lineNo = i + 2;
    if (raw !== undefined && raw.startsWith(f.name === 'read-pos' ? 'read-pos:' : `${f.name}${f.name === 'prior' ? '(' : ':'}`)) {
      if (!f.re.test(raw)) errors.push({ line: lineNo, code: 'LINE_SYNTAX', message: `${f.name} 行格式不符：${raw}` });
      lines.push({ name: f.name, raw });
      i++;
    } else if (f.required) {
      errors.push({ line: lineNo, code: 'LINE_MISSING', message: `缺少 ${f.name} 行（或顺序不对）` });
    }
  }
  // 2) 扩展区：send 之后、series / note 之前
  const workoutCount = { n: 0 };
  for (; i < body.length; i++) {
    const raw = body[i];
    const lineNo = i + 2;
    if (raw.startsWith('series(') || raw.startsWith('note:') || raw.startsWith('warn:')) break;
    if (raw.startsWith('device: ')) {
      if (raw.length > 128 || /[<>]/.test(raw)) errors.push({ line: lineNo, code: 'DEVICE_LINE', message: 'device 行 ≤ 120 字符（不含前缀）且不得含尖括号' });
      lines.push({ name: 'device', raw });
      continue;
    }
    const m = /^([a-z][a-z0-9_]*)\(([^()]*(?:\([^()]*\))?[^()]*)\)( \[L2\])?: (.+)$/.exec(raw);
    if (!m) { errors.push({ line: lineNo, code: 'LINE_SYNTAX', message: `无法识别的行：${raw}` }); continue; }
    const [, name, , l2] = m;
    const reg = EXTENSION_LINES[name];
    if (reg) {
      if (reg.level === 'L2' && !l2) errors.push({ line: lineNo, code: 'L2_TAG_MISSING', message: `${name} 是 L2 敏感段，行名后必须带 [L2]` });
      if (reg.level !== 'L2' && l2) errors.push({ line: lineNo, code: 'L2_TAG_WRONG', message: `${name} 不是 L2 段，不得带 [L2]` });
      if (reg.body && !reg.body.test(m[4])) errors.push({ line: lineNo, code: 'LINE_SYNTAX', message: `${name} 行格式不符：${raw}` });
      if (name === 'workout' && ++workoutCount.n > reg.repeat) errors.push({ line: lineNo, code: 'WORKOUT_TOO_MANY', message: 'workout 行最多 3 条' });
    } else if (!KINDS.includes(name) && !name.startsWith('x_')) {
      warnings.push({ line: lineNo, code: 'LINE_UNKNOWN', message: `未登记的行名 ${name}（读者会忽略；自定义请用 x_ 前缀）` });
    }
    lines.push({ name, raw });
  }
  // 3) 尾部：series? note warn*
  if (body[i] && body[i].startsWith('series(')) {
    if (!/^series\(\d+s from \d{2}:\d{2}:\d{2}\): [\d· ]+$/.test(body[i])) errors.push({ line: i + 2, code: 'LINE_SYNTAX', message: `series 行格式不符：${body[i]}` });
    lines.push({ name: 'series', raw: body[i] });
    i++;
  }
  if (body[i] === NOTE_TEXT) { lines.push({ name: 'note', raw: body[i] }); i++; }
  else errors.push({ line: i + 2, code: 'NOTE_MISSING', message: 'note 行缺失或文字不是规定的固定句' });
  for (; i < body.length; i++) {
    if (body[i].startsWith('warn: ')) lines.push({ name: 'warn', raw: body[i] });
    else errors.push({ line: i + 2, code: 'TRAILING_LINE', message: `note 之后只允许 warn 行：${body[i]}` });
  }
  return { ok: errors.length === 0, errors, warnings, header: header ? header.attrs : null, lines };
}
