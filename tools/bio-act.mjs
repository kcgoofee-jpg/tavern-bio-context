// TBC v0.3 §5 参考实现：解析回复里的 <bio_act/>，并把抽象振动模式展开成强度帧。
// 实现可以有自己的写法，但对同样的输入应给出同样的结果（heartlink 的一致性测试会比对）。

export const OUTPUTS = ['Vibrate', 'Rotate', 'Oscillate', 'Constrict', 'Spray', 'Temperature', 'Led', 'Position', 'HwPositionWithDuration', 'Estim'];
export const PATTERNS = ['pulse', 'double', 'triple', 'long', 'heartbeat', 'wave'];
export const MAX_PER_REPLY = 3;
export const DEFAULT_INTENSITY = 0.5;
// 各模式的默认时长（毫秒）；long / heartbeat / wave 可由 ms 指定，pulse / double / triple 固定
export const DEFAULT_MS = { pulse: 200, double: 500, triple: 800, long: 1500, heartbeat: 2700, wave: 3000 };

const num = (v) => (v == null || v === '' ? null : Number(v));

// 返回 { acts: [...], errors: [...] }；超过 3 个的部分丢弃并报错
export function parseBioActs(text) {
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
      output: a.output || 'Vibrate',
      pattern: a.pattern || 'pulse',
      intensity: num(a.intensity) ?? DEFAULT_INTENSITY,
      durationMs: num(a.ms),
    };
    if (!OUTPUTS.includes(act.output)) { errors.push({ code: 'BAD_OUTPUT', value: act.output }); continue; }
    if (!PATTERNS.includes(act.pattern)) { errors.push({ code: 'BAD_PATTERN', value: act.pattern, fallback: 'pulse' }); act.pattern = 'pulse'; }
    if (!Number.isFinite(act.intensity) || act.intensity < 0 || act.intensity > 1) { errors.push({ code: 'BAD_INTENSITY', value: a.intensity }); act.intensity = Math.min(1, Math.max(0, Number.isFinite(act.intensity) ? act.intensity : DEFAULT_INTENSITY)); }
    if (act.durationMs != null && (!Number.isFinite(act.durationMs) || act.durationMs <= 0)) { errors.push({ code: 'BAD_MS', value: a.ms }); act.durationMs = null; }
    if (acts.length >= MAX_PER_REPLY) { errors.push({ code: 'TOO_MANY', value: acts.length + 1 }); continue; }
    acts.push(act);
  }
  return { acts, errors };
}

// 模式 → 帧 [[毫秒偏移, 强度 0–1], …]，最后一帧强度必为 0
export function patternFrames(pattern, intensity, durationMs) {
  const I = Math.min(1, Math.max(0, intensity));
  const r = (v) => Math.round(v * 1000) / 1000;
  switch (pattern) {
    case 'double': return [[0, I], [180, 0], [320, I], [500, 0]];
    case 'triple': return [[0, I], [160, 0], [320, I], [480, 0], [640, I], [800, 0]];
    case 'long': { const ms = durationMs || DEFAULT_MS.long; return [[0, I], [ms, 0]]; }
    case 'heartbeat': {
      const ms = durationMs || DEFAULT_MS.heartbeat;
      const beats = Math.max(1, Math.round(ms / 900));
      const out = [];
      for (let b = 0; b < beats; b++) {
        const t = b * 900;
        out.push([t, I], [t + 120, 0], [t + 250, r(I * 0.7)], [t + 380, 0]);
      }
      return out;
    }
    case 'wave': {
      const ms = durationMs || DEFAULT_MS.wave;
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
