// Copy of public/qr.js (the website's QR encoder) for the native app.
/* Small QR code generator (byte mode, versions 1-6, any error level) + a rounded SVG renderer.
   Used for the WendyCoin pay code that the cashier or the self-order kiosk scans. */
const QR = (() => {
  // [format bits, ECC codewords per block (v1..6), number of blocks (v1..6)]
  const LEVEL = {
    L: [1, [7, 10, 15, 20, 26, 18], [1, 1, 1, 1, 1, 2]],
    M: [0, [10, 16, 26, 18, 24, 16], [1, 1, 1, 2, 2, 4]],
    Q: [3, [13, 22, 18, 26, 18, 24], [1, 1, 2, 2, 4, 4]],
    H: [2, [17, 28, 22, 16, 22, 28], [1, 1, 2, 4, 4, 4]],
  };
  const rawModules = v => (16 * v + 128) * v + 64 - (v >= 2 ? 25 : 0);
  const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
    return r;
  }

  function matrix(text, level = 'H') {
    const bytes = typeof TextEncoder !== 'undefined' ? [...new TextEncoder().encode(String(text))] : String(text).split('').map(ch => ch.charCodeAt(0) & 255);
    const [fmt, eccPer, blocksPer] = LEVEL[level];
    let v = 1;
    for (; v <= 6; v++) {
      const dataCw = Math.floor(rawModules(v) / 8) - eccPer[v - 1] * blocksPer[v - 1];
      if (4 + 8 + bytes.length * 8 <= dataCw * 8) break;
    }
    if (v > 6) throw new Error('QR: text too long');
    const eccLen = eccPer[v - 1], nBlocks = blocksPer[v - 1], rawCw = Math.floor(rawModules(v) / 8), dataCw = rawCw - eccLen * nBlocks;

    // data bits: byte mode, length, bytes, terminator, padding
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, dataCw * 8 - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < dataCw * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

    // split into blocks, add Reed-Solomon codewords, interleave
    const shortBlocks = nBlocks - rawCw % nBlocks, shortLen = Math.floor(rawCw / nBlocks), div = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < shortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) all.push(b[i]); });

    const size = v * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (v >= 2) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    const formatBits = mask => {
      const d = (fmt << 3) | mask; let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    formatBits(0);

    // zigzag placement of the codewords
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < all.length * 8) { mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }

    const maskFn = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => { // runs, 2x2 blocks and dark/light balance (enough to pick a good mask)
      let p = 0, dark = 0;
      for (let a = 0; a < size; a++) {
        let rr = 1, rc = 1;
        for (let b = 1; b < size; b++) {
          if (mod[a][b] === mod[a][b - 1]) { rr++; if (rr === 5) p += 3; else if (rr > 5) p++; } else rr = 1;
          if (mod[b][a] === mod[b - 1][a]) { rc++; if (rc === 5) p += 3; else if (rc > 5) p++; } else rc = 1;
        }
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x && y && mod[y][x] === mod[y - 1][x] && mod[y][x] === mod[y][x - 1] && mod[y][x] === mod[y - 1][x - 1]) p += 3;
      }
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); formatBits(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    applyMask(best); formatBits(best);
    return { size, mod, fn };
  }

  // rounded dots, rounded finder "eyes", optional logo in the middle (modules under it are left out)
  function svg(text, { logo = '', color = '#111', eye = '#111', bg = '#fff', logoSize = 0.24 } = {}) {
    const { size, mod } = matrix(text, 'H');
    const q = 3, n = size + q * 2;
    const hole = logo ? Math.ceil(size * logoSize / 2) * 2 + 1 : 0, h0 = (size - hole) / 2, h1 = h0 + hole;
    const isEye = (x, y) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
    let dots = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!mod[y][x] || isEye(x, y)) continue;
      if (hole && x >= h0 && x < h1 && y >= h0 && y < h1) continue;
      dots += `<rect x="${x + q + 0.05}" y="${y + q + 0.05}" width="0.9" height="0.9" rx="0.32"/>`;
    }
    const eyeAt = (x, y) => `<rect x="${x + q + 0.5}" y="${y + q + 0.5}" width="6" height="6" rx="2" fill="none" stroke="${eye}" stroke-width="1"/><rect x="${x + q + 2}" y="${y + q + 2}" width="3" height="3" rx="1" fill="${eye}"/>`;
    const c = size / 2 + q;
    const lg = hole ? `<circle cx="${c}" cy="${c}" r="${hole / 2 - 0.1}" fill="${bg}"/><image href="${logo}" x="${c - hole / 2 + 0.5}" y="${c - hole / 2 + 0.5}" width="${hole - 1}" height="${hole - 1}" preserveAspectRatio="xMidYMid meet"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="geometricPrecision"><rect width="${n}" height="${n}" rx="${n * 0.08}" fill="${bg}"/><g fill="${color}">${dots}</g>${eyeAt(0, 0)}${eyeAt(size - 7, 0)}${eyeAt(0, size - 7)}${lg}</svg>`;
  }
  return { matrix, svg };
})();
export default QR;
