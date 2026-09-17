// TBC v0.3 §5 参考实现：解析回复里的 <bio_act/>，并把抽象振动模式展开成强度帧。
// 实现可以有自己的写法，但对同样的输入应给出同样的结果（heartlink 的一致性测试会比对）。

// '*' = 任意输出：执行器有什么就用什么（振动、往复、旋转、收缩、抽动……）；不写 output 时就是它
export const OUTPUTS = ['*', 'Vibrate', 'Rotate', 'Oscillate', 'Constrict', 'Spray', 'Temperature', 'Led', 'Position', 'HwPositionWithDuration', 'Estim'];
// §5.9：有风险的输出。output="*"（含不写 output）不会驱动它们，必须点名
export const RISKY_OUTPUTS = ['Temperature', 'Estim', 'Spray'];
export const PATTERNS = ['pulse', 'double', 'triple', 'long', 'heartbeat', 'wave'];
export const MAX_PER_REPLY = 3;
export const DEFAULT_INTENSITY = 0.5;
// 各模式的默认时长（毫秒）；long / heartbeat / wave 可由 ms 指定，pulse / double / triple 固定
export const DEFAULT_MS = { pulse: 200, double: 500, triple: 800, long: 1500, heartbeat: 2700, wave: 3000 };

// v0.3 §5.8：强度档位预设。用户开场选择，之后可在设置里改；每一项也可单独自定义
//   floor：强度下限——非 0 的强度按 floor + (1 − floor) × 强度 抬高（0 仍是停止）
//   defaultMs：持续类模式没写 ms 时的时长
//   minIntervalMs：同一执行器两次触发的缺省最小间隔（执行器自己声明的更大时取更大者）
//   maxPerReply：每条回复最多执行几个（上限 MAX_PER_REPLY_LIMIT）
export const PROFILES = {
  'slow-burn': { floor: 0, defaultMs: { long: 1500, heartbeat: 2700, wave: 3000 }, minIntervalMs: 1500, maxPerReply: 3 },   // 慢热：从轻开始
  steady: { floor: 0.25, defaultMs: { long: 8000, heartbeat: 8100, wave: 9000 }, minIntervalMs: 1200, maxPerReply: 3 },       // 持久：中等强度、时间长
  frenzy: { floor: 0.4, defaultMs: { long: 5000, heartbeat: 5400, wave: 6000 }, minIntervalMs: 800, maxPerReply: 5 },         // 狂暴：高触发、高功率
  max: { floor: 0.8, defaultMs: { long: 10000, heartbeat: 9000, wave: 10000 }, minIntervalMs: 500, maxPerReply: 5 },         // 极限：几乎一直开满
};
export const DEFAULT_PROFILE = 'slow-burn';
export const MAX_PER_REPLY_LIMIT = 5;

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

// 返回 { acts: [...], errors: [...] }；超过上限（缺省 3，opts.maxPerReply 可改，最多 5）的部分丢弃并报错
export function parseBioActs(text, opts) {
  const limit = opts && Number.isInteger(opts.maxPerReply) ? Math.min(MAX_PER_REPLY_LIMIT, Math.max(0, opts.maxPerReply)) : MAX_PER_REPLY;
  const acts = [];
  const errors = [];
  const re = /<bio_act\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
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
    if (!PATTERNS.includes(act.pattern)) { errors.push({ code: 'BAD_PATTERN', value: act.pattern, fallback: 'pulse' }); act.pattern = 'pulse'; }
    if (!Number.isFinite(act.intensity) || act.intensity < 0 || act.intensity > 1) { errors.push({ code: 'BAD_INTENSITY', value: a.intensity }); act.intensity = Math.min(1, Math.max(0, Number.isFinite(act.intensity) ? act.intensity : DEFAULT_INTENSITY)); }
    if (act.durationMs != null && (!Number.isFinite(act.durationMs) || act.durationMs <= 0)) { errors.push({ code: 'BAD_MS', value: a.ms }); act.durationMs = null; }
    if (acts.length >= limit) { errors.push({ code: 'TOO_MANY', value: acts.length + 1 }); continue; }
    acts.push(act);
  }
  return { acts, errors };
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
    case 'pulse':
    default: return [[0, I], [DEFAULT_MS.pulse, 0]];
  }
}
