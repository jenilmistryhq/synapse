#!/usr/bin/env node
// Packs each case's print kit into two .zip downloads, next to its PDFs:
//   <id>-player-kit.zip    everything a player may see (no spoilers)
//   <id>-complete-kit.zip  the whole kit, sealed pages included (for whoever prints)
// It reads print/pdf/index.json (written by build-pdfs.js) and adds the zips to it.
// Runs at the end of "npm run pdf", or alone:   node tools/build-zips.js [caseId]
//
// No dependencies: a small ZIP writer over Node's own zlib.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const casesDir = path.resolve(__dirname, '..', 'cases');

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

// A fixed timestamp keeps the zip identical between builds when nothing changed.
const DOS_TIME = 0, DOS_DATE = ((2025 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(stored ? 0 : 8, 10); cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

function readme(m, spoiler) {
  return [
    `PROJECT SYNAPSE - Case ${m.number}: ${m.title}`,
    '',
    spoiler
      ? 'COMPLETE KIT. This zip contains the sealed pages: the Authority results, the Reconsider\r\ninserts and Envelope S-1 (the solution). If you want to play, let someone else open it.'
      : 'PLAYER FILES. Nothing in this zip spoils the case. The sealed pages are in the complete kit.',
    '',
    `You need: ${m.printKit.sheets}, and ${m.printKit.envelopes}.`,
    'Print on A4, default margins, 100% scale. PRINT-GUIDE.md explains every step.',
    '',
  ].join('\r\n');
}

function buildCase(id) {
  const m = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'digital.json'), 'utf8'));
  const outDir = path.join(casesDir, id, 'print', 'pdf');
  const idxPath = path.join(outDir, 'index.json');
  if (!m.printKit || !fs.existsSync(idxPath)) return false;
  const index = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const pdf = file => ({ name: `${id}/${file}`, data: fs.readFileSync(path.join(outDir, file)) });
  const guidePath = path.join(casesDir, id, m.printKit.guide || 'print/PRINT-GUIDE.md');
  const guide = fs.existsSync(guidePath) ? [{ name: `${id}/PRINT-GUIDE.md`, data: fs.readFileSync(guidePath) }] : [];
  const files = index.files.map(f => f.file);
  const safe = index.files.filter(f => !f.spoiler).map(f => f.file);
  const pack = key => (index.packs.find(p => p.id === key) || {}).file;

  const kits = [
    { id: 'zip-player', file: `${id}-player-kit.zip`, spoiler: false,
      entries: [{ name: `${id}/README.txt`, data: Buffer.from(readme(m, false)) }, ...guide, ...[pack('player'), ...safe, pack('labels')].filter(Boolean).map(pdf)] },
    { id: 'zip-all', file: `${id}-complete-kit.zip`, spoiler: true,
      entries: [{ name: `${id}/README.txt`, data: Buffer.from(readme(m, true)) }, ...guide, ...[pack('player'), pack('sealed'), pack('labels'), ...files].filter(Boolean).map(pdf)] },
  ];
  index.packs = index.packs.filter(p => !p.id.startsWith('zip-'));
  for (const k of kits) {
    const buf = zip(k.entries);
    fs.writeFileSync(path.join(outDir, k.file), buf);
    index.packs.push({ id: k.id, file: k.file, bytes: buf.length, files: k.entries.length, spoiler: k.spoiler });
    console.log(`  ${k.file}: ${k.entries.length} files, ${(buf.length / 1024).toFixed(0)} KB`);
  }
  fs.writeFileSync(idxPath, JSON.stringify(index, null, 2) + '\n');
  return true;
}

module.exports = { buildCase, zip, crc32 };

if (require.main === module) {
  const only = process.argv[2];
  let n = 0;
  for (const id of fs.readdirSync(casesDir).sort()) {
    if (only && id !== only) continue;
    if (fs.existsSync(path.join(casesDir, id, 'digital.json')) && buildCase(id)) { console.log(`${id}: zips written`); n++; }
  }
  console.log(n ? `OK - zips built for ${n} case(s).` : 'No cases with built PDFs. Run "npm run pdf" first.');
}
