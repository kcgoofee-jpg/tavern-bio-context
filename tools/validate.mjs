#!/usr/bin/env node
// L1 检查：块样例、JSON 样例、Schema 自洽、清洗规则。
// 用法：node tools/validate.mjs                       全部样例
//       node tools/validate.mjs [--reader] 块文件…     只校验给定的块（缺省按生产者档；--reader 按读者档）
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseBlock, compareVersions, effectiveView, CLEAN_MIN_SEC, CLEAN_MIN_SHARE, CLEAN_PHASES } from './block.mjs';
import * as sanitize from './sanitize.mjs';
import { parseBioActs, patternFrames, PATTERNS, PROFILES, resolveSettings, liftIntensity, hideBioActs, NATIVE_PATTERN } from './bio-act.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (msg) => { failed++; console.log('✗ ' + msg); };
const pass = (msg) => console.log('✓ ' + msg);
const show = (r) => [...r.errors.map((e) => `    error L${e.line} ${e.code}: ${e.message}`), ...r.warnings.map((w) => `    warn  L${w.line} ${w.code}: ${w.message}`)].join('\n');
const codesOf = (list) => [...new Set(list.map((x) => x.code))];

const argv = process.argv.slice(2);
const files = argv.filter((a) => !a.startsWith('--'));
if (files.length) {
  const profile = argv.includes('--reader') ? 'reader' : 'producer';
  for (const f of files) {
    const r = parseBlock(readFileSync(f, 'utf8'), { profile });
    (r.ok ? pass : fail)(`${f}（${profile}）${r.ok ? '' : '\n' + show(r)}`);
    if (r.ok && r.warnings.length) console.log(show(r));
  }
  process.exit(failed ? 1 : 0);
}

// 块样例：合规样例在生产者档和读者档都必须通过；expected.json 里列出的警告必须出现
const bdir = join(ROOT, 'fixtures/blocks');
const validExpected = JSON.parse(readFileSync(join(bdir, 'valid/expected.json'), 'utf8'));
for (const f of readdirSync(join(bdir, 'valid')).filter((x) => x.endsWith('.txt')).sort()) {
  const text = readFileSync(join(bdir, 'valid', f), 'utf8');
  const r = parseBlock(text);
  const rr = parseBlock(text, { profile: 'reader' });
  const want = validExpected[f]?.warnings;
  const got = codesOf(r.warnings);
  if (!r.ok) { fail(`valid/${f} 应通过\n${show(r)}`); continue; }
  if (!rr.ok) { fail(`valid/${f} 读者档应通过\n${show(rr)}`); continue; }
  if (want) {
    const missing = want.filter((c) => !got.includes(c));
    const extra = want.length === 0 ? got : [];
    if (missing.length) { fail(`valid/${f} 缺少预期警告 ${missing.join(', ')}\n${show(r)}`); continue; }
    if (extra.length) { fail(`valid/${f} 不应有警告，得到 ${extra.join(', ')}\n${show(r)}`); continue; }
  }
  pass(`valid/${f}${got.length ? ` （警告 ${got.join(', ')}）` : ''}`);
}

const expected = JSON.parse(readFileSync(join(bdir, 'invalid/expected.json'), 'utf8'));
for (const f of readdirSync(join(bdir, 'invalid')).filter((x) => x.endsWith('.txt')).sort()) {
  const text = readFileSync(join(bdir, 'invalid', f), 'utf8');
  const spec = Array.isArray(expected[f]) ? { errors: expected[f] } : (expected[f] || { errors: [] });
  const r = parseBlock(text);
  const codes = codesOf(r.errors);
  const missing = spec.errors.filter((c) => !codes.includes(c));
  if (r.ok) { fail(`invalid/${f} 应失败但通过了`); continue; }
  if (missing.length) { fail(`invalid/${f} 缺少预期错误 ${missing.join(', ')}\n${show(r)}`); continue; }
  let readerNote = '';
  if (spec.reader !== undefined) {
    const rr = parseBlock(text, { profile: 'reader' });
    if (spec.reader === 'ok') {
      if (!rr.ok) { fail(`invalid/${f} 读者档应接受（只给警告）\n${show(rr)}`); continue; }
      readerNote = '；读者档接受';
    } else {
      const rc = codesOf(rr.errors);
      const rm = spec.reader.filter((c) => !rc.includes(c));
      if (rr.ok || rm.length) { fail(`invalid/${f} 读者档应报 ${spec.reader.join(', ')}\n${show(rr)}`); continue; }
      readerNote = `；读者档拒收 ${rc.join(', ')}`;
    }
  }
  pass(`invalid/${f} → ${codes.join(', ')}${readerNote}`);
}

// 版本比较、视图换算（v0.3 §1.1、§4.6）
{
  const cases = [
    ['版本：0.10 > 0.3', compareVersions('0.10', '0.3') === 1],
    ['版本：0.3 = 0.3.0', compareVersions('0.3', '0.3.0') === 0],
    ['版本：0.2 < 0.3', compareVersions('0.2', '0.3') === -1],
    ['视图：view 优先于 mode', effectiveView({ mode: 'character', view: 'device-aware' }) === 'device-aware'],
    ['v0.3 块里的 actuator / native 行只给未知行警告', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/13-v04-actuator-native.txt'), 'utf8')
        .replace('v="0.4"', 'v="0.3"').replace(/ stream="no" lag="4s"/, '').replace(/ \| age 12m \| noise ±3/, '').replace(/ \| stop by reader.*$/m, ''));
      return r.ok && r.warnings.filter((w) => w.code === 'LINE_UNKNOWN').length === 3;
    })()],
    ['视图：旧 mode 换算', effectiveView({ mode: 'author' }) === 'backstage' && effectiveView({ mode: 'character' }) === 'in-story'],
    ['v0.3 块里的 act 段与 clean 行只给未知段 / 未知行警告', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/14-v04-act-clean.txt'), 'utf8')
        .replace('v="0.4"', 'v="0.3"').replace(/ stream="no" lag="4s"/, '')
        .replace(/ \| age 8m \| noise ±3/, '').replace(/ \| read-peak-rel [^\n]*/m, ''));
      const segs = r.warnings.filter((w) => w.code === 'SEG_UNKNOWN' && /act \d/.test(w.message));
      const lines = r.warnings.filter((w) => w.code === 'LINE_UNKNOWN' && /clean|actuator/.test(w.message));
      return r.ok && segs.length === 2 && lines.length === 2;
    })()],
    ['v0.4 stream 行的 act 段按 body 区间检查（§5.1）', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/12-v04-stream.txt'), 'utf8')
        .replace('| cov 95%\nnote:', '| cov 95% | act 60s, mean 50%, 2 acts\nnote:'));
      return r.errors.some((e) => e.code === 'ACT_OVER_PHASE');
    })()],
    ['v0.4 clean 行的阈值是可配置的经验值', CLEAN_MIN_SEC === 10 && CLEAN_MIN_SHARE === 30 && CLEAN_PHASES.join() === 'gen,read,write'],
    ['v0.4 首行 lag 取 1–30 秒（§2.1）', (() => {
      const src = readFileSync(join(ROOT, 'fixtures/blocks/valid/12-v04-stream.txt'), 'utf8');
      const zero = parseBlock(src.replace('lag="6s"', 'lag="0s"'));
      const big = parseBlock(src.replace('lag="6s"', 'lag="31s"'));
      return zero.errors.some((e) => e.code === 'HEADER_LAG') && big.errors.some((e) => e.code === 'HEADER_LAG');
    })()],
    ['v0.4 stream 行的 body 区间按相位规则判 carryover，carryover 峰值不出 pos（§1.2）', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/12-v04-stream.txt'), 'utf8').replace('peak 100 @40s', 'peak 100 @4s'));
      const codes = r.errors.map((e) => e.code);
      return codes.includes('CARRYOVER_MISSING') && codes.includes('STREAM_POS_IN_WAIT');
    })()],
    ['v0.4 有被读的回复而没写 stream 属性只警告（§1.1）', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/13-v04-actuator-native.txt'), 'utf8').replace(' stream="no"', ''));
      return r.ok && r.warnings.some((w) => w.code === 'STREAM_ATTR_MISSING');
    })()],
    ['v0.4 stream="yes" 没有 stream 行只警告（§1.2-1）', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/12-v04-stream.txt'), 'utf8').replace(/^stream\(lag 6s\):[^\n]*\n/m, ''));
      return r.ok && r.warnings.some((w) => w.code === 'STREAM_LINE_MISSING');
    })()],
    ['v0.4 没有基线时不得输出 mean / above（§4-3）', (() => {
      const r = parseBlock(readFileSync(join(ROOT, 'fixtures/blocks/valid/18-v04-lag-derived.txt'), 'utf8').replace(/^baseline:[^\n]*$/m, 'baseline: n/a (session too short)'));
      return r.errors.filter((e) => e.code === 'DERIVED_WITHOUT_BASELINE').length === 5;
    })()],
  ];
  for (const [name, ok] of cases) ok ? pass(`block/${name}`) : fail(`block/${name}`);
}

// 清洗与标识规则（v0.3 §4.4、§2.6）
for (const c of JSON.parse(readFileSync(join(ROOT, 'fixtures/sanitize/cases.json'), 'utf8'))) {
  const fn = sanitize[c.fn];
  if (typeof fn !== 'function') { fail(`sanitize/${c.fn} 不存在`); continue; }
  const got = fn(...c.args);
  const same = JSON.stringify(got) === JSON.stringify(c.expect);
  same ? pass(`sanitize/${c.fn}：${c.name}`) : fail(`sanitize/${c.fn}：${c.name}\n    期望 ${JSON.stringify(c.expect)}，得到 ${JSON.stringify(got)}`);
}

// <bio_act/> 样例与模式帧
for (const c of JSON.parse(readFileSync(join(ROOT, 'fixtures/bio-act/replies.json'), 'utf8'))) {
  const r = parseBioActs(c.text, c.opts);
  const same = JSON.stringify(r.acts) === JSON.stringify(c.acts) && JSON.stringify(r.errors.map((e) => e.code)) === JSON.stringify(c.errors);
  same ? pass(`bio-act/${c.name}`) : fail(`bio-act/${c.name}\n    得到 ${JSON.stringify(r)}`);
}
for (const p of PATTERNS) {
  const f = patternFrames(p, 0.8, 2000);
  const ok = f.length >= 2 && f[f.length - 1][1] === 0 && f.every(([t, v], i) => v >= 0 && v <= 0.8 && (i === 0 || t >= f[i - 1][0]));
  ok ? pass(`bio-act/帧 ${p}`) : fail(`bio-act/帧 ${p} 不合规：${JSON.stringify(f)}`);
}

// §5.8 档位与自定义参数
{
  const fz = resolveSettings('frenzy');
  const cases = [
    ['档位：狂暴抬高强度', JSON.stringify(patternFrames('long', 0.5, null, fz)) === JSON.stringify([[0, 0.7], [5000, 0]])],
    ['档位：强度 0 仍是停止', liftIntensity(0, 0.9) === 0 && patternFrames('pulse', 0, null, fz)[0][1] === 0],
    ['档位：不传参数与初版一致', JSON.stringify(patternFrames('wave', 0.8, null)) === JSON.stringify(patternFrames('wave', 0.8, null, resolveSettings('slow-burn')))],
    ['自定义：覆盖默认时长', patternFrames('long', 1, null, resolveSettings('slow-burn', { defaultMs: { long: 8000 } })).at(-1)[0] === 8000],
    ['自定义：每条回复上限可调，最多 50', resolveSettings('frenzy', { maxPerReply: 99 }).maxPerReply === 50 && resolveSettings('frenzy', { maxPerReply: 9 }).maxPerReply === 9 && parseBioActs('<bio_act/>'.repeat(6), { maxPerReply: 5 }).acts.length === 5],
    ['显示时隐藏全部标签（含思维链里的）', hideBioActs('<think><bio_act/></think>她笑了<bio_act pattern="wave"/>。') === '<think></think>她笑了。'],
    ['v0.4 直通：帧只作包络，0 仍是停止', JSON.stringify(patternFrames(NATIVE_PATTERN, 0.5, null, resolveSettings('steady'))) === JSON.stringify([[0, 0.625], [8000, 0]]) && patternFrames(NATIVE_PATTERN, 0, 3000, resolveSettings('max'))[0][1] === 0],
    ['v0.4 直通：native 不在抽象模式表里', !PATTERNS.includes(NATIVE_PATTERN)],
    ['未知档位按慢热', resolveSettings('turbo').profile === 'slow-burn' && Object.keys(PROFILES).join() === 'slow-burn,steady,frenzy,max'],
  ];
  for (const [name, ok] of cases) ok ? pass(`bio-act/${name}`) : fail(`bio-act/${name}`);
}

// JSON Schema
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const schemas = {};
for (const f of readdirSync(join(ROOT, 'schema')).filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8'));
  ajv.addSchema(s, f);
  schemas[basename(f, '.schema.json')] = f;
}
const jdir = join(ROOT, 'fixtures/json');
for (const kind of ['valid', 'invalid']) {
  for (const f of readdirSync(join(jdir, kind)).filter((x) => x.endsWith('.json')).sort()) {
    const name = f.split('.')[0];
    const validate = ajv.getSchema(schemas[name]);
    if (!validate) { fail(`${kind}/${f} 找不到 schema ${name}`); continue; }
    const ok = validate(JSON.parse(readFileSync(join(jdir, kind, f), 'utf8')));
    if ((kind === 'valid') === ok) pass(`${kind}/${f}`);
    else fail(`${kind}/${f} ${ok ? '应失败但通过了' : '应通过\n    ' + ajv.errorsText(validate.errors)}`);
  }
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
