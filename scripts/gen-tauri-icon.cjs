#!/usr/bin/env node
/**
 * gen-tauri-icon.js — generates a 512x512 PNG icon for the MIX Engine Tauri shell.
 * Pure Node, zero dependencies. Draws a cyan→purple gradient triangle (the MIX "▲")
 * on a dark background, then `npx tauri icon` produces all platform-specific sizes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;

// --- Minimal PNG encoder (RGBA, 8-bit) -----------------------------------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Filtered scanlines: each row prefixed with filter byte 0 (None)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4);
    raw[off] = 0;
    pixels.copy(raw, off + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Draw the icon --------------------------------------------------------
const px = Buffer.alloc(SIZE * SIZE * 4);

// Triangle vertices (▲)
const top = { x: 256, y: 70 };
const bl  = { x: 70,  y: 410 };
const br  = { x: 442, y: 410 };

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;

    // Barycentric point-in-triangle test
    const d = (top.x - br.x) * (bl.y - br.y) - (bl.x - br.x) * (top.y - br.y);
    const a = ((x - br.x) * (bl.y - br.y) - (bl.x - br.x) * (y - br.y)) / d;
    const b = ((br.x - x) * (top.y - br.y) - (top.x - br.x) * (y - br.y)) / d;
    const c = 1 - a - b;
    const inside = a >= 0 && b >= 0 && c >= 0;

    if (inside) {
      // Gradient: cyan (#00f0ff) at top → purple (#c084fc) at bottom
      const t = Math.min(1, Math.max(0, (y - top.y) / (bl.y - top.y)));
      px[i]     = Math.round(0   * (1 - t) + 192 * t); // R
      px[i + 1] = Math.round(240 * (1 - t) + 132 * t); // G
      px[i + 2] = Math.round(255 * (1 - t) + 252 * t); // B
      px[i + 3] = 255;
    } else {
      // Dark background #06080a
      px[i] = 6; px[i + 1] = 8; px[i + 2] = 10; px[i + 3] = 255;
    }
  }
}

const outDir = path.join(__dirname, '..', 'src-tauri', 'icons');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'icon.png');
fs.writeFileSync(outPath, encodePNG(SIZE, SIZE, px));
console.log(`[gen-icon] Wrote ${path.relative(process.cwd(), outPath)} (${SIZE}x${SIZE})`);
