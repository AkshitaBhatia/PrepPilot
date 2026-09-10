/**
 * Renders the native icon set from assets/logo.svg.
 *
 * Android cannot use an SVG for a launcher icon or a splash image, so those
 * have to be PNGs — but keeping hand-made PNGs alongside the SVG is how a
 * rebrand ends up half-done, with the new mark in the app and the old one on
 * the home screen. Generating them means there is one logo to replace.
 *
 * Run after editing the logo:  pnpm logo:build
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = path.join(root, 'assets', 'logo.svg');
const outputDir = path.join(root, 'assets', 'images');

/** The app's background, so a transparent mark does not render on white. */
const BACKGROUND = '#0B0F14';

/**
 * What each generated file is for.
 *
 * `padding` is the fraction of the canvas left empty around the mark. Android
 * masks adaptive icons to a circle and crops hard, so the foreground needs far
 * more room than a plain icon does — without it the ring loses its edges.
 */
const TARGETS = [
  { file: 'icon.png', size: 1024, padding: 0.12, background: BACKGROUND },
  { file: 'android-icon-foreground.png', size: 1024, padding: 0.3, background: null },
  { file: 'splash-icon.png', size: 512, padding: 0.05, background: null },
  { file: 'favicon.png', size: 96, padding: 0.05, background: null },
];

/**
 * Resolves the CSS variables the SVG uses for theming.
 *
 * The in-app copy is themed at runtime; a rasteriser only sees the fallbacks,
 * and `var(--x, #fff)` is not something every SVG renderer understands.
 */
function resolveThemeVariables(svg) {
  return svg.replace(/var\(\s*--[\w-]+\s*,\s*([^)]+)\)/g, (_match, fallback) => fallback.trim());
}

async function main() {
  const svg = resolveThemeVariables(await readFile(source, 'utf8'));
  await mkdir(outputDir, { recursive: true });

  for (const target of TARGETS) {
    const inner = Math.round(target.size * (1 - target.padding * 2));
    const margin = Math.round((target.size - inner) / 2);

    const mark = await sharp(Buffer.from(svg), { density: 512 })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const canvas = sharp({
      create: {
        width: target.size,
        height: target.size,
        channels: 4,
        background: target.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });

    const png = await canvas
      .composite([{ input: mark, top: margin, left: margin }])
      // Palette compression: these are flat-colour marks, so it costs nothing
      // visible and the icon was 780 KB before.
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    const destination = path.join(outputDir, target.file);
    await writeFile(destination, png);
    console.log(`${target.file.padEnd(30)} ${target.size}px  ${(png.length / 1024).toFixed(1)} KB`);
  }
}

await main();
