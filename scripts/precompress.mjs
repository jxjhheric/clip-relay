#!/usr/bin/env node
/**
 * Precompress static assets and/or analyze sizes.
 * - Usage examples:
 *   node scripts/precompress.mjs ./.next-export --analyze
 *   node scripts/precompress.mjs ./.next-export --write-br --no-gz
 */
import { promises as fs } from 'node:fs';
import { constants as zconst, brotliCompressSync, constants as zc } from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const root = path.resolve(args[0] || '.next-export');
const flags = new Set(args.slice(1));

const DO_ANALYZE = flags.has('--analyze');
const WRITE_BR = flags.has('--write-br');
const WRITE_GZ = flags.has('--write-gz');
const NO_BR = flags.has('--no-br');
const NO_GZ = flags.has('--no-gz');

const shouldWriteBr = WRITE_BR || (!WRITE_GZ && !NO_BR && !DO_ANALYZE); // default write .br when not analyzing and no explicit --write-gz
const shouldWriteGz = WRITE_GZ && !NO_GZ; // write .gz only when requested

const textLike = new Set([
  'html','js','css','json','svg','txt','xml','map','webmanifest','csv'
]);
const alreadyCompressed = new Set(['br','gz','woff2']);

function isCompressible(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!ext) return false;
  if (alreadyCompressed.has(ext)) return false;
  return textLike.has(ext);
}

async function* walk(dir) {
  for (const dirent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, dirent.name);
    if (dirent.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function brotli(buf) {
  return brotliCompressSync(buf, {
    params: {
      [zc.BROTLI_PARAM_QUALITY]: 11,
      [zc.BROTLI_PARAM_MODE]: zc.BROTLI_MODE_TEXT,
      [zc.BROTLI_PARAM_SIZE_HINT]: buf.length,
    }
  });
}

async function main() {
  let origTotal = 0n, brTotal = 0n, gzTotal = 0n;
  let count = 0, brCount = 0, gzCount = 0;

  for await (const file of walk(root)) {
    if (!isCompressible(file)) continue;
    const buf = await fs.readFile(file);
    origTotal += BigInt(buf.length);
    count++;

    const wantBr = !NO_BR && (DO_ANALYZE || shouldWriteBr);
    const wantGz = !NO_GZ && (DO_ANALYZE || shouldWriteGz);

    if (wantBr) {
      const out = brotli(buf);
      brTotal += BigInt(out.length);
      brCount++;
      if (!DO_ANALYZE && shouldWriteBr) {
        await fs.writeFile(file + '.br', out);
      }
    }
    if (wantGz) {
      const z = await import('node:zlib');
      const out = z.gzipSync(buf, { level: zconst.Z_BEST_COMPRESSION });
      gzTotal += BigInt(out.length);
      gzCount++;
      if (!DO_ANALYZE && shouldWriteGz) {
        await fs.writeFile(file + '.gz', out);
      }
    }
  }

  if (DO_ANALYZE) {
    const fmt = (n) => `${(Number(n)/1024).toFixed(1)} KiB`;
    console.log(`Analyzed directory: ${root}`);
    console.log(`Source files: ${count}, total=${fmt(origTotal)}`);
    console.log(`gzip files:   ${gzCount}, total=${fmt(gzTotal)}`);
    console.log(`brotli files: ${brCount}, total=${fmt(brTotal)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
