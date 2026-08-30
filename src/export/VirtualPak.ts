export interface PakEntry {
  path: string;
  offset: number;
  length: number;
  checksum: number;
}

export interface PakHeader {
  magic: string;
  version: number;
  fileCount: number;
  tocOffset: number;
  encrypted: boolean;
}

export interface PakFileItem {
  path: string;
  data: Uint8Array;
}

/**
 * VirtualPak.ts — Single-file binary archive packer and zero-copy reader for MIX Engine game assets.
 * Encapsulates scene graphs, textures, audio banks, and scripts into a high-speed seekable .pak archive.
 */
export class VirtualPak {
  static readonly MAGIC = 'MIXPAK1';
  static readonly VERSION = 1;
  static readonly HEADER_SIZE = 20;

  /** Simple Fast CRC32 / DJB2 checksum calculation. */
  static computeChecksum(data: Uint8Array): number {
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash) ^ data[i];
    }
    return hash >>> 0;
  }

  /**
   * Pack an array of files into a binary .pak buffer.
   */
  static pack(files: PakFileItem[], encrypted = false): Uint8Array {
    const encoder = new TextEncoder();
    const entries: PakEntry[] = [];

    let currentOffset = this.HEADER_SIZE;

    for (const file of files) {
      const checksum = this.computeChecksum(file.data);
      entries.push({
        path: file.path,
        offset: currentOffset,
        length: file.data.byteLength,
        checksum,
      });
      currentOffset += file.data.byteLength;
    }

    const tocOffset = currentOffset;

    // Serialize Table of Contents (TOC)
    const tocChunks: Uint8Array[] = [];
    for (const entry of entries) {
      const pathBytes = encoder.encode(entry.path);
      const entryBuf = new Uint8Array(2 + pathBytes.byteLength + 4 + 4 + 4);
      const view = new DataView(entryBuf.buffer);

      view.setUint16(0, pathBytes.byteLength, true);
      entryBuf.set(pathBytes, 2);

      const metaOffset = 2 + pathBytes.byteLength;
      view.setUint32(metaOffset, entry.offset, true);
      view.setUint32(metaOffset + 4, entry.length, true);
      view.setUint32(metaOffset + 8, entry.checksum, true);

      tocChunks.push(entryBuf);
    }

    let tocTotalSize = 0;
    for (const chunk of tocChunks) {
      tocTotalSize += chunk.byteLength;
    }

    const totalPakSize = tocOffset + tocTotalSize;
    const pak = new Uint8Array(totalPakSize);
    const pakView = new DataView(pak.buffer);

    // 1. Write Header (20 bytes)
    const magicBytes = encoder.encode(this.MAGIC);
    pak.set(magicBytes, 0);
    pakView.setUint16(8, this.VERSION, true);
    pakView.setUint16(10, encrypted ? 1 : 0, true);
    pakView.setUint32(12, files.length, true);
    pakView.setUint32(16, tocOffset, true);

    // 2. Write Data Payload
    let writePos = this.HEADER_SIZE;
    for (const file of files) {
      if (encrypted) {
        // XOR obfuscation key
        const encData = new Uint8Array(file.data);
        for (let i = 0; i < encData.length; i++) {
          encData[i] ^= 0x5a;
        }
        pak.set(encData, writePos);
      } else {
        pak.set(file.data, writePos);
      }
      writePos += file.data.byteLength;
    }

    // 3. Write TOC
    writePos = tocOffset;
    for (const chunk of tocChunks) {
      pak.set(chunk, writePos);
      writePos += chunk.byteLength;
    }

    return pak;
  }

  /**
   * Parse the Table of Contents from a .pak buffer.
   */
  static readTOC(pakBytes: Uint8Array): { header: PakHeader; entries: Map<string, PakEntry> } {
    const decoder = new TextDecoder();
    const view = new DataView(pakBytes.buffer, pakBytes.byteOffset, pakBytes.byteLength);

    const magic = decoder.decode(pakBytes.subarray(0, 7));
    if (magic !== this.MAGIC) {
      throw new Error(`Invalid PAK magic: expected '${this.MAGIC}', received '${magic}'`);
    }

    const version = view.getUint16(8, true);
    const encrypted = view.getUint16(10, true) === 1;
    const fileCount = view.getUint32(12, true);
    const tocOffset = view.getUint32(16, true);

    const header: PakHeader = { magic, version, fileCount, tocOffset, encrypted };
    const entries = new Map<string, PakEntry>();

    let readPos = tocOffset;
    for (let i = 0; i < fileCount; i++) {
      const pathLen = view.getUint16(readPos, true);
      readPos += 2;

      const pathBytes = pakBytes.subarray(readPos, readPos + pathLen);
      const path = decoder.decode(pathBytes);
      readPos += pathLen;

      const offset = view.getUint32(readPos, true);
      const length = view.getUint32(readPos + 4, true);
      const checksum = view.getUint32(readPos + 8, true);
      readPos += 12;

      entries.set(path, { path, offset, length, checksum });
    }

    return { header, entries };
  }

  /**
   * Extract a specific asset by path from a .pak archive without decoding the whole file.
   */
  static extract(pakBytes: Uint8Array, path: string, verify = true): Uint8Array | null {
    const { header, entries } = this.readTOC(pakBytes);
    const entry = entries.get(path);
    if (!entry) return null;

    const raw = pakBytes.subarray(entry.offset, entry.offset + entry.length);
    let out: Uint8Array;
    if (header.encrypted) {
      out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        out[i] = raw[i] ^ 0x5a;
      }
    } else {
      out = new Uint8Array(raw);
    }

    // The per-entry checksum was written at pack time and then never read, so a
    // truncated or corrupted archive silently handed back garbage assets.
    if (verify) {
      const actual = this.computeChecksum(out);
      if (actual !== entry.checksum) {
        throw new Error(
          `PAK entry '${path}' failed checksum (expected ${entry.checksum}, got ${actual}) — archive is corrupt or truncated`,
        );
      }
    }

    return out;
  }

  /**
   * Extract all files from a .pak archive.
   */
  static extractAll(pakBytes: Uint8Array): Map<string, Uint8Array> {
    const { header, entries } = this.readTOC(pakBytes);
    const out = new Map<string, Uint8Array>();

    for (const [path, entry] of entries.entries()) {
      const raw = pakBytes.subarray(entry.offset, entry.offset + entry.length);
      if (header.encrypted) {
        const decrypted = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          decrypted[i] = raw[i] ^ 0x5a;
        }
        out.set(path, decrypted);
      } else {
        out.set(path, new Uint8Array(raw));
      }
    }

    return out;
  }
}
