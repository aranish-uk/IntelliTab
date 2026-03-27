#!/usr/bin/env node
/**
 * IntelliTab Icon Generator — stacked cards design, fills the full square
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

function buildSVG(size) {
    const s = size;
    const r = s * 0.18; // outer corner radius

    // Card dimensions — much bigger, filling the space
    const cw = s * 0.58;  // card width
    const ch = s * 0.44;  // card height
    const cr = s * 0.07;  // card corner radius
    const sw = s * 0.025; // stroke width

    // Front card — centered-ish, slightly left and down
    const fx = s * 0.12;
    const fy = s * 0.36;

    // Middle card — offset up-right
    const mx = fx + s * 0.1;
    const my = fy - s * 0.12;

    // Back card — offset further up-right
    const bx = fx + s * 0.2;
    const by = fy - s * 0.24;

    // List lines on front card
    const lx = fx + s * 0.12;
    const ly1 = fy + s * 0.12;
    const ly2 = fy + s * 0.22;
    const ly3 = fy + s * 0.32;
    const ll1 = s * 0.28;
    const ll2 = s * 0.38;
    const ll3 = s * 0.2;
    const dotR = s * 0.018;
    const dotX = fx + s * 0.07;
    const lsw = s * 0.025; // line stroke width

    // Tab indicator on top of front card
    const tabW = s * 0.22;
    const tabH = s * 0.08;
    const tabX = fx + s * 0.04;
    const tabY = fy - tabH + s * 0.01;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${s}" height="${s}" rx="${r}" ry="${r}" fill="#1e293b"/>
  <radialGradient id="bgHL" cx="35%" cy="35%" r="70%">
    <stop offset="0%" stop-color="#334155" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#1e293b" stop-opacity="0"/>
  </radialGradient>
  <rect width="${s}" height="${s}" rx="${r}" ry="${r}" fill="url(#bgHL)"/>

  <!-- Back card (most faded) -->
  <rect x="${bx}" y="${by}" width="${cw}" height="${ch}" rx="${cr}"
        fill="none" stroke="#06b6d4" stroke-width="${sw}" opacity="0.3"/>

  <!-- Middle card -->
  <rect x="${mx}" y="${my}" width="${cw}" height="${ch}" rx="${cr}"
        fill="none" stroke="#06b6d4" stroke-width="${sw}" opacity="0.5"/>

  <!-- Front card (solid, filled) -->
  <rect x="${fx}" y="${fy}" width="${cw}" height="${ch}" rx="${cr}"
        fill="#0f172a" stroke="#06b6d4" stroke-width="${sw * 1.2}" opacity="1"/>

  <!-- Tab on top of front card -->
  <rect x="${tabX}" y="${tabY}" width="${tabW}" height="${tabH}" rx="${s * 0.03}"
        fill="#0f172a" stroke="#06b6d4" stroke-width="${sw}" opacity="0.8"/>

  <!-- List lines on front card -->
  <circle cx="${dotX}" cy="${ly1}" r="${dotR}" fill="#22d3ee"/>
  <line x1="${lx}" y1="${ly1}" x2="${lx + ll1}" y2="${ly1}"
        stroke="#22d3ee" stroke-width="${lsw}" stroke-linecap="round" opacity="0.9"/>

  <circle cx="${dotX}" cy="${ly2}" r="${dotR}" fill="#22d3ee"/>
  <line x1="${lx}" y1="${ly2}" x2="${lx + ll2}" y2="${ly2}"
        stroke="#22d3ee" stroke-width="${lsw}" stroke-linecap="round" opacity="0.7"/>

  <circle cx="${dotX}" cy="${ly3}" r="${dotR}" fill="#22d3ee"/>
  <line x1="${lx}" y1="${ly3}" x2="${lx + ll3}" y2="${ly3}"
        stroke="#22d3ee" stroke-width="${lsw}" stroke-linecap="round" opacity="0.5"/>
</svg>`;
}

async function generateIcon(size, outputPath) {
    const svg = buildSVG(size);
    await sharp(Buffer.from(svg))
        .resize(size, size)
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outputPath);
    console.log(`Generated: ${outputPath} (${size}x${size})`);
}

async function main() {
    await generateIcon(48, path.join(publicDir, 'icon-48.png'));
    await generateIcon(128, path.join(publicDir, 'icon-128.png'));
    console.log('Done.');
}

main().catch((err) => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
