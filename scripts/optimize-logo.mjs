#!/usr/bin/env node
/**
 * Optimize portfolio logo: resize and compress PNG, output WebP for modern browsers.
 * Run: node scripts/optimize-logo.mjs
 */
import sharp from 'sharp';
import { statSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public/images/portfolio/logo.png');
const dir = dirname(src);

// Max display in app is ~240px; 512 is enough for 2x retina
const SIZE = 512;

async function main() {
  const pngPath = join(dir, 'logo.png');
  const tmpPath = join(dir, 'logo.tmp.png');
  const webpPath = join(dir, 'logo.webp');

  const pipeline = sharp(src)
    .resize(SIZE, SIZE, { fit: 'contain' })
    .png({ compressionLevel: 9, palette: false });

  await pipeline.toFile(tmpPath);
  renameSync(tmpPath, pngPath);
  console.log('Written:', pngPath);

  await sharp(src)
    .resize(SIZE, SIZE, { fit: 'contain' })
    .webp({ quality: 90 })
    .toFile(webpPath);
  console.log('Written:', webpPath);

  for (const f of [pngPath, webpPath]) {
    const { size } = statSync(f);
    console.log(`  ${f.split('/').pop()}: ${(size / 1024).toFixed(1)} KB`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
