#!/usr/bin/env node
// fix-encoding.js
// Fixes UTF-8 Mojibake in server JS files:
//   Files were originally saved as UTF-8, then re-read as Windows-1252,
//   then saved again as UTF-8 — doubling the byte-width of every non-ASCII char.
//   This script reverses that process.
//
// Usage:
//   node fix-encoding.js          — fix all server/**/*.js in-place
//   node fix-encoding.js --dry    — preview changes without writing
//   node fix-encoding.js server/server.js  — fix a single file

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Windows-1252 extended byte table (0x80–0x9F only) ──────────────────────
// Maps Unicode code points → their Windows-1252 byte value for the range
// that differs from Latin-1.  All other chars: codePoint ≤ 0xFF → byte = cp.
const W1252_TO_BYTE = new Map([
  [0x20AC, 0x80], // €
  [0x201A, 0x82], // ‚
  [0x0192, 0x83], // ƒ
  [0x201E, 0x84], // „
  [0x2026, 0x85], // …
  [0x2020, 0x86], // †
  [0x2021, 0x87], // ‡
  [0x02C6, 0x88], // ˆ
  [0x2030, 0x89], // ‰
  [0x0160, 0x8A], // Š
  [0x2039, 0x8B], // ‹
  [0x0152, 0x8C], // Œ
  [0x017D, 0x8E], // Ž
  [0x2018, 0x91], // '
  [0x2019, 0x92], // '
  [0x201C, 0x93], // "
  [0x201D, 0x94], // "
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x02DC, 0x98], // ˜
  [0x2122, 0x99], // ™
  [0x0161, 0x9A], // š
  [0x203A, 0x9B], // ›
  [0x0153, 0x9C], // œ
  [0x017E, 0x9E], // ž
  [0x0178, 0x9F], // Ÿ
]);

/**
 * Translate a single Unicode code point back to its Windows-1252 byte value.
 * Returns undefined if the character cannot be represented in Windows-1252.
 */
function charToByte(cp) {
  if (cp <= 0xFF) return cp;           // Latin-1 range maps 1-to-1
  return W1252_TO_BYTE.get(cp);        // CP1252 extension, or undefined
}

/**
 * Reverse Windows-1252 mojibake in a UTF-8 string.
 *
 * Strategy: scan for sequences of adjacent non-ASCII characters.
 * For each such run, collect their would-be W1252 byte values and try to
 * decode groups of 2 / 3 / 4 bytes as UTF-8.  A clean single-codepoint
 * decode wins.  Otherwise the character is emitted unchanged.
 *
 * Surrogate pairs and codepoints > 0xFF that are not in the W1252 table
 * are unmappable → fall straight through unchanged (emoji preserved).
 */
function fixMojibake(text) {
  let out = '';
  let i   = 0;

  while (i < text.length) {
    const code = text.codePointAt(i);
    const charLen = code > 0xFFFF ? 2 : 1; // JS surrogate-pair awareness

    if (code <= 0x7F) {
      // ASCII: always copy straight through
      out += text[i];
      i++;
      continue;
    }

    // Non-ASCII: try to collect a window of 2–4 non-ASCII chars
    // and check whether they form a valid UTF-8 sequence when reversed.
    let fixed = false;

    for (let len = 2; len <= 4 && !fixed; len++) {
      const bytes  = [];
      let   j      = i;

      while (bytes.length < len) {
        if (j >= text.length) break;
        const cp  = text.codePointAt(j);
        const adv = cp > 0xFFFF ? 2 : 1;
        const b   = charToByte(cp);
        if (b === undefined) break;   // unmappable → stop collecting
        bytes.push(b);
        j += adv;
      }

      if (bytes.length < len) continue; // not enough chars mapped

      // Attempt UTF-8 decode
      const decoded = Buffer.from(bytes).toString('utf8');

      // Valid if: no replacement chars, and exactly ONE codepoint was decoded
      // using exactly `len` bytes.
      // We count codepoints (not code units) to handle emoji > U+FFFF.
      if (!decoded.includes('\uFFFD')) {
        const cps = [...decoded]; // array of actual codepoints
        if (cps.length === 1) {
          out  += cps[0];
          i     = j;
          fixed = true;
        }
      }
    }

    if (!fixed) {
      // Emit original code unit (or surrogate pair) unchanged
      out += text.slice(i, i + charLen);
      i   += charLen;
    }
  }

  return out;
}

// ── CLI ────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry');
const targets = args.filter(a => a !== '--dry');

function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const ROOT    = path.resolve(__dirname);
const fileList = targets.length > 0
  ? targets.map(t => path.resolve(t))
  : collectFiles(path.join(ROOT, 'server'));

let fixedCount = 0;
let cleanCount = 0;

for (const file of fileList) {
  const original = fs.readFileSync(file, 'utf8');
  const fixed    = fixMojibake(original);

  if (fixed === original) {
    cleanCount++;
    continue;
  }

  fixedCount++;
  const rel = path.relative(ROOT, file);

  if (dryRun) {
    // Show a diff-style summary
    const origLines = original.split('\n');
    const fixLines  = fixed.split('\n');
    let changes = 0;
    console.log(`\n--- ${rel} ---`);
    for (let ln = 0; ln < origLines.length; ln++) {
      if (origLines[ln] !== fixLines[ln]) {
        changes++;
        if (changes <= 10) {
          console.log(`  L${ln + 1}  BEFORE: ${origLines[ln].substring(0, 120)}`);
          console.log(`  L${ln + 1}  AFTER : ${fixLines[ln].substring(0, 120)}`);
        }
      }
    }
    if (changes > 10) console.log(`  ... and ${changes - 10} more changed lines`);
    console.log(`  Total changed lines: ${changes}`);
  } else {
    fs.writeFileSync(file, fixed, 'utf8');
    console.log(`Fixed: ${rel}`);
  }
}

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Results: ${fixedCount} files fixed, ${cleanCount} files already clean.`);
