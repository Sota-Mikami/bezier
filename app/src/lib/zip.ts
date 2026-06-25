// Minimal ZIP writer — STORE method (no compression), enough to bundle a handful
// of small text files (md / html) for Share > Export (DEC-146). Dependency-free so
// it needs no npm install / Rust crate; the files are tiny, so skipping compression
// is fine. Output is a standard .zip (PK\x03\x04 … central directory … EOCD).

export interface ZipFile {
  /** Path inside the archive (forward slashes). */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

/** Build a STORE-method .zip from the given files. */
export function zipSync(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const SIG_LOCAL = u32(0x04034b50);
  const SIG_CENTRAL = u32(0x02014b50);
  const SIG_EOCD = u32(0x06054b50);
  const DATE = u16(0x21); // 1980-01-01 (fixed; we don't carry mtime)
  const TIME = u16(0);

  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = u32(crc32(data));
    const size = u32(data.length);
    const lfh = concat([
      SIG_LOCAL,
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method = store
      TIME,
      DATE,
      crc,
      size, // compressed size
      size, // uncompressed size
      u16(name.length),
      u16(0), // extra length
      name,
      data,
    ]);
    local.push(lfh);
    central.push(
      concat([
        SIG_CENTRAL,
        u16(20), // version made by
        u16(20), // version needed
        u16(0), // flags
        u16(0), // method
        TIME,
        DATE,
        crc,
        size,
        size,
        u16(name.length),
        u16(0), // extra
        u16(0), // comment
        u16(0), // disk number
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // local header offset
        name,
      ]),
    );
    offset += lfh.length;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    SIG_EOCD,
    u16(0), // this disk
    u16(0), // central dir start disk
    u16(files.length), // entries on this disk
    u16(files.length), // total entries
    u32(centralBytes.length),
    u32(offset), // central dir offset
    u16(0), // comment length
  ]);

  return concat([...local, centralBytes, eocd]);
}
