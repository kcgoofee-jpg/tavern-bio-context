#!/usr/bin/env node
// L1 检查：块样例、JSON 样例、Schema 自洽。用法：node tools/validate.mjs [块文件…]
// 带参数时只校验给定的块文件（实现可以用它检查自己生成的块）。
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseBlock } from './block.mjs';
import { parseBioActs, patternFrames, PATTERNS } from './bio-act.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (msg) => { failed++; console.log('✗ ' + msg); };
const pass = (msg) => console.log('✓ ' + msg);
const show = (r) => [...r.errors.map((e) => `    error L${e.line} ${e.code}: ${e.message}`), ...r.warnings.map((w) => `    warn  L${w.line} ${w.code}: ${w.message}`)].join('\n');

const args = process.argv.slice(2);
if (args.length) {
  for (const f of args) {
    const r = parseBlock(readFileSync(f, 'utf8'));
    (r.ok ? pass : fail)(`${f}${r.ok ? '' : '\n' + show(r)}`);
    if (r.ok && r.warnings.length) console.log(show(r));
  }
  process.exit(failed ? 1 : 0);
}

// 块样例
const bdir = join(ROOT, 'fixtures/blocks');
for (const f of readdirSync(join(bdir, 'valid')).filter((x) => x.endsWith('.txt')).sort()) {
  const r = parseBlock(readFileSync(join(bdir, 'valid', f), 'utf8'));
  r.ok ? pass(`valid/${f}${r.warnings.length ? '（有警告）\n' + show(r) : ''}`) : fail(`valid/${f} 应通过\n${show(r)}`);
}
const expected = JSON.parse(readFileSync(join(bdir, 'invalid/expected.json'), 'utf8'));
for (const f of readdirSync(join(bdir, 'invalid')).filter((x) => x.endsWith('.txt')).sort()) {
  const r = parseBlock(readFileSync(join(bdir, 'invalid', f), 'utf8'));
  const codes = new Set(r.errors.map((e) => e.code));
  const want = expected[f] || [];
  const missing = want.filter((c) => !codes.has(c));
  if (r.ok) fail(`invalid/${f} 应失败但通过了`);
  else if (missing.length) fail(`invalid/${f} 缺少预期错误 ${missing.join(', ')}\n${show(r)}`);
  else pass(`invalid/${f} → ${[...codes].join(', ')}`);
}

// <bio_act/> 样例与模式帧
for (const c of JSON.parse(readFileSync(join(ROOT, 'fixtures/bio-act/replies.json'), 'utf8'))) {
  const r = parseBioActs(c.text);
  const same = JSON.stringify(r.acts) === JSON.stringify(c.acts) && JSON.stringify(r.errors.map((e) => e.code)) === JSON.stringify(c.errors);
  same ? pass(`bio-act/${c.name}`) : fail(`bio-act/${c.name}\n    得到 ${JSON.stringify(r)}`);
}
for (const p of PATTERNS) {
  const f = patternFrames(p, 0.8, 2000);
  const ok = f.length >= 2 && f[f.length - 1][1] === 0 && f.every(([t, v], i) => v >= 0 && v <= 0.8 && (i === 0 || t >= f[i - 1][0]));
  ok ? pass(`bio-act/帧 ${p}`) : fail(`bio-act/帧 ${p} 不合规：${JSON.stringify(f)}`);
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
