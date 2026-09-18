// TBC v0.3 §5 参考实现：解析回复里的 <bio_act/>，并把抽象振动模式展开成强度帧。
// v0.4 草案 §9：pattern="native" + mode 直通设备自带模式，只在调用方传入执行器能力（opts.actuators）时接受。
// 实现可以有自己的写法，但对同样的输入应给出同样的结果（heartlink 的一致性测试会比对）。

// '*' = 任意输出：执行器有什么就用什么（振动、往复、旋转、收缩、抽动……）；不写 output 时就是它
export const OUTPUTS = ['*', 'Vibrate', 'Rotate', 'Oscillate', 'Constrict', 'Spray', 'Temperature', 'Led', 'Position', 'HwPositionWithDuration', 'Estim'];
// §5.9：有风险的输出。output="*"（含不写 output）不会驱动它们，必须点名
export const RISKY_OUTPUTS = ['Temperature', 'Estim', 'Spray'];
export const PATTERNS = ['pulse', 'double', 'triple', 'long', 'heartbeat', 'wave'];
// v0.4 草案 §9：设备自带模式直通。不在 PATTERNS 里（抽象模式表与 v0.3 一致）
export const NATIVE_PATTERN = 'native';
export const MAX_PER_REPLY = 50;   // 2026-09-19：不再限制每条回复的动作数（50 只防失控）
export const DEFAULT_INTENSITY = 0.5;
// 各模式的默认时长（毫秒）；long / heartbeat / wave 可由 ms 指定，pulse / double / triple 固定
export const DEFAULT_MS = { pulse: 200, double: 500, triple: 800, long: 1500, heartbeat: 2700, wave: 3000 };

// v0.3 §5.8：强度档位预设。用户开场选择，之后可在设置里改；每一项也可单独自定义
//   floor：强度下限——非 0 的强度按 floor + (1 − floor) × 强度 抬高（0 仍是停止）
//   defaultMs：持续类模式没写 ms 时的时长
//   minIntervalMs：同一执行器两次触发的缺省最小间隔（执行器自己声明的更大时取更大者）
//   maxPerReply：每条回复最多执行几个（上限 MAX_PER_REPLY_LIMIT）
export const PROFILES = {
  'slow-burn': { floor: 0, defaultMs: { long: 1500, heartbeat: 2700, wave: 3000 }, minIntervalMs: 1500, maxPerReply: 50 },   // 慢热：从轻开始
  steady: { floor: 0.25, defaultMs: { long: 8000, heartbeat: 8100, wave: 9000 }, minIntervalMs: 1200, maxPerReply: 50 },       // 持久：中等强度、时间长
  frenzy: { floor: 0.4, defaultMs: { long: 5000, heartbeat: 5400, wave: 6000 }, minIntervalMs: 800, maxPerReply: 50 },         // 狂暴：高触发、高功率
  max: { floor: 0.8, defaultMs: { long: 10000, heartbeat: 9000, wave: 10000 }, minIntervalMs: 500, maxPerReply: 50 },         // 极限：几乎一直开满
};
export const DEFAULT_PROFILE = 'slow-burn';
export const MAX_PER_REPLY_LIMIT = 50;

// 档位 + 用户覆盖 → 生效的参数（未知档位按 DEFAULT_PROFILE）
export function resolveSettings(profile, overrides) {
  const base = PROFILES[profile] || PROFILES[DEFAULT_PROFILE];
  const o = overrides || {};
  const clamp01 = (v, d) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  return {
    profile: PROFILES[profile] ? profile : DEFAULT_PROFILE,
    floor: clamp01(o.floor, base.floor),
    defaultMs: Object.assign({}, base.defaultMs, o.defaultMs || {}),
    minIntervalMs: Number.isFinite(o.minIntervalMs) && o.minIntervalMs >= 0 ? o.minIntervalMs : base.minIntervalMs,
    maxPerReply: Number.isInteger(o.maxPerReply) ? Math.min(MAX_PER_REPLY_LIMIT, Math.max(0, o.maxPerReply)) : base.maxPerReply,
  };
}
// 强度按下限抬高；0 永远是停止（§5.9）
export function liftIntensity(intensity, floor) {
  const I = Math.min(1, Math.max(0, Number(intensity) || 0));
  if (I === 0) return 0;
  const f = Math.min(1, Math.max(0, floor || 0));
  return Math.round((f + (1 - f) * I) * 1000) / 1000;
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const BIO_ACT_TAG_RE = /<bio_act\b[^>]*?\/?>/g;

// v0.3 §5.3：不算动作的部分。解析前先去掉，每条回复的上限按剩下的标签计算。
//   - 正文里的思维链：<think>…</think>、<thinking>…</thinking>（含带前缀的变体，如 <my_thinking>）
//   - 只有结束标签的前缀（预设用 prefill 开头的情况）；没有闭合的思维链（一直到结尾）
//   - 宿主推理模板的前后缀（opts.reasoningMarkers：[{ prefix, suffix }]）
//   - 代码块（``` 或 ~~~）、行内代码、HTML 注释
// 宿主单独给出的推理字段（reasoning）本来就不传进来，不解析。
export function stripNonActionText(text, opts) {
  let t = String(text || '');
  t = t.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, ' ');
  t = t.replace(/`[^`\n]*`/g, ' ');
  t = t.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
  for (const mk of (opts && opts.reasoningMarkers) || []) {
    if (!mk || !mk.prefix || !mk.suffix) continue;
    t = t.replace(new RegExp(`${escapeRe(mk.prefix)}[\\s\\S]*?(?:${escapeRe(mk.suffix)}|$)`, 'g'), ' ');
  }
  t = t.replace(/<([a-z_]*think(?:ing)?)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  t = t.replace(/^[\s\S]*?<\/[a-z_]*think(?:ing)?\s*>/i, ' ');
  t = t.replace(/<[a-z_]*think(?:ing)?\b[^>]*>[\s\S]*$/i, ' ');
  return t;
}

// 只作用于显示：去掉全部 <bio_act/> 标签（不管执行没执行）。不改消息原文，不依赖宿主的 HTML 清理。
export function hideBioActs(text) {
  return String(text || '').replace(BIO_ACT_TAG_RE, '');
}

// 返回 { acts: [...], errors: [...] }；超过上限（缺省 50，opts.maxPerReply 可改，最多 50）的部分丢弃并报错
// opts.reasoningMarkers：宿主推理模板的前后缀（见 stripNonActionText）
export function parseBioActs(text, opts) {
  const limit = opts && Number.isInteger(opts.maxPerReply) ? Math.min(MAX_PER_REPLY_LIMIT, Math.max(0, opts.maxPerReply)) : MAX_PER_REPLY;
  const acts = [];
  const errors = [];
  const re = /<bio_act\b([^>]*?)\/?>/g;
  const body = stripNonActionText(text, opts);
  let m;
  while ((m = re.exec(body))) {
    const a = {};
    const ar = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;
    let x;
    while ((x = ar.exec(m[1]))) a[x[1]] = x[2];
    const act = {
      target: a.target || '*',
      output: a.output || '*',
      pattern: a.pattern || 'pulse',
      intensity: num(a.intensity) ?? DEFAULT_INTENSITY,
      durationMs: num(a.ms),
    };
    if (!OUTPUTS.includes(act.output)) { errors.push({ code: 'BAD_OUTPUT', value: act.output }); continue; }
    if (act.pattern === NATIVE_PATTERN) {
      // v0.4 §8.4：找不到就跳过，不退回 pulse
      const r = resolveNative(act.target, act.output, a.mode, opts && opts.actuators);
      if (r.error) { errors.push({ code: r.error, value: a.mode ?? null }); continue; }
      act.mode = a.mode;
      act.native = r.native;
    } else if (a.mode != null) {
      errors.push({ code: 'MODE_IGNORED', value: a.mode });
    }
    if (act.pattern !== NATIVE_PATTERN && !PATTERNS.includes(act.pattern)) { errors.push({ code: 'BAD_PATTERN', value: act.pattern, fallback: 'pulse' }); act.pattern = 'pulse'; }
    if (!Number.isFinite(act.intensity) || act.intensity < 0 || act.intensity > 1) { errors.push({ code: 'BAD_INTENSITY', value: a.intensity }); act.intensity = Math.min(1, Math.max(0, Number.isFinite(act.intensity) ? act.intensity : DEFAULT_INTENSITY)); }
    if (act.durationMs != null && (!Number.isFinite(act.durationMs) || act.durationMs <= 0)) { errors.push({ code: 'BAD_MS', value: a.ms }); act.durationMs = null; }
    if (acts.length >= limit) { errors.push({ code: 'TOO_MANY', value: acts.length + 1 }); continue; }
    acts.push(act);
  }
  return { acts, errors };
}

// v0.4 §8.1、§8.4：在执行器列表里找点名的自带模式
//   actuators：tbc.actuators() 的结果 [{ id, outputs, native: [{ n, name, outputs?, stoppable?, enabled }] }]；
//   也接受能力原样 [{ id, outputs, nativePatterns: [{ name, … }] }]（序号 = 位置，缺 enabled 视为已开启）
//   返回 { native: [{ id, n, name, stoppable }] } 或 { error }
const modesOf = (x) => {
  const list = Array.isArray(x && x.native) ? x.native : Array.isArray(x && x.nativePatterns) ? x.nativePatterns : null;
  return list && list.map((m, i) => m && { ...m, n: Number.isInteger(m.n) ? m.n : i + 1 }).filter(Boolean);
};
export function resolveNative(target, output, mode, actuators) {
  if (!Array.isArray(actuators)) return { error: 'NATIVE_NO_CAPS' };
  if (mode == null || mode === '') return { error: 'NATIVE_NO_MODE' };
  const byIndex = /^\d{1,2}$/.test(mode);
  const pool = actuators.map((x) => ({ x, modes: modesOf(x) })).filter((p) => p.modes && (target === '*' || p.x.id === target));
  if (!pool.length) return { error: 'NATIVE_UNAVAILABLE' };
  if (byIndex && target === '*' && pool.filter((p) => p.modes.some((m) => m.enabled !== false)).length > 1) return { error: 'NATIVE_TARGET_AMBIGUOUS' };
  const native = [];
  let off = false;
  for (const { x, modes } of pool) {
    const m = modes.find((k) => (byIndex ? k.n === Number(mode) : k.name === mode));
    if (!m) continue;
    if (m.enabled === false) { off = true; continue; }
    const outs = Array.isArray(m.outputs) && m.outputs.length ? m.outputs : (x.outputs || []);
    const ok = output === '*' ? outs.some((o) => !RISKY_OUTPUTS.includes(o)) : outs.includes(output);
    if (!ok) continue;
    native.push({ id: x.id, n: m.n, name: m.name, stoppable: m.stoppable !== false });
  }
  if (!native.length) return { error: off ? 'NATIVE_OFF' : 'NATIVE_UNAVAILABLE' };
  return { native };
}

// 模式 → 帧 [[毫秒偏移, 强度 0–1], …]，最后一帧强度必为 0
// opts：{ floor, defaultMs }（resolveSettings 的结果即可）；不传时与 v0.3 初版完全一致
export function patternFrames(pattern, intensity, durationMs, opts) {
  const o = opts || {};
  const I = liftIntensity(intensity, o.floor || 0);
  const D = Object.assign({}, DEFAULT_MS, o.defaultMs || {});
  const r = (v) => Math.round(v * 1000) / 1000;
  switch (pattern) {
    case 'double': return [[0, I], [180, 0], [320, I], [500, 0]];
    case 'triple': return [[0, I], [160, 0], [320, I], [480, 0], [640, I], [800, 0]];
    case 'long': { const ms = durationMs || D.long; return [[0, I], [ms, 0]]; }
    case 'heartbeat': {
      const ms = durationMs || D.heartbeat;
      const beats = Math.max(1, Math.round(ms / 900));
      const out = [];
      for (let b = 0; b < beats; b++) {
        const t = b * 900;
        out.push([t, I], [t + 120, 0], [t + 250, r(I * 0.7)], [t + 380, 0]);
      }
      return out;
    }
    case 'wave': {
      const ms = durationMs || D.wave;
      const steps = 10;
      const out = [];
      for (let i = 0; i <= steps; i++) out.push([Math.round((ms * i) / steps), r(I * Math.sin((Math.PI * i) / steps))]);
      out[out.length - 1][1] = 0;
      return out;
    }
    // v0.4 §8.5：直通时帧只作包络（看门狗与 deadline 用）
    case 'native': { const ms = durationMs || D.long; return [[0, I], [ms, 0]]; }
    case 'pulse':
    default: return [[0, I], [DEFAULT_MS.pulse, 0]];
  }
}
