/**
 * Generates 32x32 and 16x16 favicons from app/icon.png by cropping to the
 * center (logo area) so the logo is visible in browser tabs.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'app', 'icon.png');

// Crop to center ~55% so the logo is visible but not too zoomed in
const size = 512;
const cropPercent = 0.55;
const cropSize = Math.round(size * cropPercent);
const left = Math.round((size - cropSize) / 2);

const pipeline = sharp(src)
  .extract({ left, top: left, width: cropSize, height: cropSize });

const p32 = pipeline.clone().resize(32, 32);
const p16 = pipeline.clone().resize(16, 16);

await Promise.all([
  p32.png().toFile(join(root, 'app', 'icon1.png')),
  p16.png().toFile(join(root, 'app', 'icon2.png')),
]);

console.log('Generated app/icon1.png (32x32) and app/icon2.png (16x16)');
