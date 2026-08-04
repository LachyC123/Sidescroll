#!/usr/bin/env node
// Confirm game/ can be published as a site root.
//
// GitHub Pages serves game/ as "/", so anything that resolves above it is a
// 404 in production while working perfectly on a local server rooted at the
// repository. A naive grep for "../" is useless here, because sibling module
// imports inside game/src legitimately use it -- what matters is whether a
// resolved path escapes the directory being published.
//
//   node tools/check_selfcontained.mjs [root]

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.argv[2] || 'game');
const problems = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|html|css|json)$/.test(e.name)) check(p);
  }
}

// relative specifiers in imports, fetches, src/href attributes and url()
const PATTERNS = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bfetch\s*\(\s*['"]([^'"]+)['"]/g,
  /\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g,
  /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
];

function check(file) {
  const src = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (/^(https?:|data:|blob:|#|mailto:)/.test(spec)) continue;
      if (spec.startsWith('/')) {
        problems.push(`${path.relative(ROOT, file)}: absolute path "${spec}"`);
        continue;
      }
      if (!spec.startsWith('.')) continue;   // bare specifier, not a file path
      const resolved = path.resolve(dir, spec);
      if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
        problems.push(`${path.relative(ROOT, file)}: "${spec}" escapes ${path.basename(ROOT)}/`);
      }
    }
  }
}

walk(ROOT);

if (problems.length) {
  console.error(`${path.basename(ROOT)}/ is not self-contained:`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`${path.basename(ROOT)}/ is self-contained and safe to publish as a site root`);
