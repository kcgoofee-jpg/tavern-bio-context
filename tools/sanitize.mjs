// TBC v0.3 §4.4 总线字符串校验与清洗、§2.6 设备名规则的参考实现。
// 标识类字段不合法就拒收（调用方拿到 false / BAD_INPUT）；自由文本清洗后写入。

export const IDENT_RE = /^[a-z0-9][a-z0-9._:-]{0,31}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_SHORT_RE = /^\d{2}-\d{2}$/; // 已弃用，读者仍接受
export const DEVICE_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const DEVICE_MAX = 32;
export const TEXT_LIMITS = { device: 120, note: 40, perceiver: 24 };
export const ENUM_VALUES = { posture: ['lying', 'reclined', 'seated', 'upright'] };
export const TIMESTAMP_TRANSPORTS = ['push', 'bridge', 'api'];
export const DAY_MS = 24 * 3600 * 1000;
export const FUTURE_SLACK_MS = 5000;

export function isIdentifier(s) {
  return typeof s === 'string' && IDENT_RE.test(s);
}

export function isDate(s, { allowShort = false } = {}) {
  if (typeof s !== 'string') return false;
  if (allowShort && DATE_SHORT_RE.test(s)) {
    const [m, d] = s.split('-').map(Number);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 设备名疑似含序列号时返回原因，否则 null（§2.6）：
// 原值含 ":" 或 "_"；连续 ≥ 6 位数字；按 "." "-" 切分后，有长度 ≥ 6、至少含一个数字的纯十六进制段。
export function serialProblem(value) {
  const s = String(value ?? '');
  if (/[:_]/.test(s)) return 'contains ":" or "_" (looks like a raw BLE name or address)';
  if (/\d{6,}/.test(s)) return '6 or more consecutive digits';
  if (s.toLowerCase().split(/[.-]/).some((seg) => seg.length >= 6 && /^[0-9a-f]+$/.test(seg) && /\d/.test(seg))) return 'hex segment of 6 or more characters';
  return null;
}

// 只检查数字 / 十六进制段（用于 `<kind>(…)`、`sensor(…)` 括号里的名字，以及可以含 ":" 的执行器 id）
export function serialDigitsProblem(value) {
  const s = String(value ?? '');
  if (/\d{6,}/.test(s)) return '6 or more consecutive digits';
  if (s.toLowerCase().split(/[.:_-]/).some((seg) => seg.length >= 6 && /^[0-9a-f]+$/.test(seg) && /\d/.test(seg))) return 'hex segment of 6 or more characters';
  return null;
}

// → null | 'PRIVACY_SERIAL' | 'BAD_DEVICE'
export function checkDeviceName(s) {
  if (typeof s !== 'string' || !s.length || s.length > DEVICE_MAX) return 'BAD_DEVICE';
  if (serialProblem(s)) return 'PRIVACY_SERIAL';
  if (!DEVICE_RE.test(s)) return 'BAD_DEVICE';
  return null;
}

// 执行器 id：标识规则 + 不含序列号（id 可以含 ":"，如 intiface:0:1）
export function checkActuatorId(s) {
  if (!isIdentifier(s)) return 'BAD_INPUT';
  if (serialDigitsProblem(s)) return 'PRIVACY_SERIAL';
  return null;
}

// 自由文本：删除 < >、控制字符；换行换成空格；按字符数截断
export function sanitizeText(s, max) {
  let t = String(s ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
  const chars = Array.from(t);
  if (max && chars.length > max) t = chars.slice(0, max).join('').trimEnd();
  return t;
}

// 首行属性值：含 " < > 或换行时返回 null（生产者删掉该属性）
export function attrValueOrNull(s) {
  const t = String(s ?? '');
  return /["<>\x00-\x1f\x7f\u2028\u2029]/.test(t) ? null : t;
}

// perceiver：每个名字按自由文本清洗，并去掉 " 与分隔符 、；最多 3 个，每个 ≤ 24 字
export function sanitizePerceiver(names) {
  const list = (Array.isArray(names) ? names : [names])
    .map((n) => sanitizeText(String(n ?? '').replace(/["、]/g, ''), TEXT_LIMITS.perceiver))
    .filter(Boolean)
    .slice(0, 3);
  return list.length ? list.join('、') : null;
}

// tbc.push(sample) 的入口检查（§4.4、§4.5）。→ { ok: true } | { ok: false, code: 'BAD_INPUT', field }
export function checkSample(sample, { now = Date.now() } = {}) {
  const bad = (field) => ({ ok: false, code: 'BAD_INPUT', field });
  if (!sample || typeof sample !== 'object') return bad('sample');
  if (!isIdentifier(sample.kind)) return bad('kind');
  if (!isIdentifier(sample.source)) return bad('source');
  if (sample.unit != null && !isIdentifier(sample.unit)) return bad('unit');
  if (sample.target != null && checkActuatorId(sample.target)) return bad('target');
  if (sample.device != null && checkDeviceName(sample.device)) return bad('device');
  const allowed = ENUM_VALUES[sample.kind];
  if (typeof sample.value === 'string') {
    if (!allowed || !allowed.includes(sample.value)) return bad('value');
  } else if (typeof sample.value !== 'number' || !Number.isFinite(sample.value)) {
    return bad('value');
  }
  const needT = TIMESTAMP_TRANSPORTS.includes(sample.transport) || sample.lagMs != null;
  if (sample.t == null) {
    if (needT) return bad('t');
  } else if (typeof sample.t !== 'number' || !Number.isFinite(sample.t) || sample.t < now - DAY_MS || sample.t > now + FUTURE_SLACK_MS) {
    return bad('t');
  }
  return { ok: true };
}

// tbc.setDaily(section, data) / setPrior 的入口检查
export function checkDaily(data) {
  const bad = (field) => ({ ok: false, code: 'BAD_INPUT', field });
  if (!data || typeof data !== 'object') return bad('data');
  if (!isIdentifier(data.source)) return bad('source');
  if (data.date != null && !isDate(data.date, { allowShort: true })) return bad('date');
  return { ok: true };
}
