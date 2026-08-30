import { describe, it, expect } from 'vitest';
import { VirtualPak } from '../src/export/VirtualPak';
import { GamePackager } from '../src/export/GamePackager';

describe('VirtualPak Archive Packer & Reader', () => {
  it('packs and extracts binary files with fast TOC lookup', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const file1 = { path: 'scenes/main.json', data: encoder.encode('{"name":"MainScene"}') };
    const file2 = { path: 'scripts/player.js', data: encoder.encode('console.log("hello");') };
    const file3 = { path: 'textures/grass.png', data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) };

    const pakBytes = VirtualPak.pack([file1, file2, file3]);
    expect(pakBytes.byteLength).toBeGreaterThan(0);

    const { header, entries } = VirtualPak.readTOC(pakBytes);
    expect(header.magic).toBe('MIXPAK1');
    expect(header.fileCount).toBe(3);
    expect(entries.has('scenes/main.json')).toBe(true);
    expect(entries.has('scripts/player.js')).toBe(true);
    expect(entries.has('textures/grass.png')).toBe(true);

    // Extract single file
    const extractedScript = VirtualPak.extract(pakBytes, 'scripts/player.js');
    expect(extractedScript).not.toBeNull();
    expect(decoder.decode(extractedScript!)).toBe('console.log("hello");');

    // Extract all files
    const allFiles = VirtualPak.extractAll(pakBytes);
    expect(allFiles.size).toBe(3);
    expect(decoder.decode(allFiles.get('scenes/main.json')!)).toBe('{"name":"MainScene"}');
  });

  it('supports XOR encrypted / obfuscated pak archives', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const secretFile = { path: 'secret.dat', data: encoder.encode('Confidential Game Asset') };
    const encPak = VirtualPak.pack([secretFile], true);

    const { header } = VirtualPak.readTOC(encPak);
    expect(header.encrypted).toBe(true);

    const decrypted = VirtualPak.extract(encPak, 'secret.dat');
    expect(decrypted).not.toBeNull();
    expect(decoder.decode(decrypted!)).toBe('Confidential Game Asset');
  });

  it('builds full game binary package via GamePackager', () => {
    const encoder = new TextEncoder();
    const bundle = GamePackager.buildBinaryPak(
      {
        title: 'CyberQuest',
        entryScene: 'city',
        scenes: { city: {} },
      },
      [
        { path: 'audio/theme.mp3', data: encoder.encode('audio-bytes') },
      ]
    );

    expect(bundle.manifest.gameTitle).toBe('CyberQuest');
    expect(bundle.pakBytes.byteLength).toBeGreaterThan(0);

    const { entries } = VirtualPak.readTOC(bundle.pakBytes);
    expect(entries.has('manifest.json')).toBe(true);
    // The cooker keeps the true extension until a real encoder is attached. It used
    // to rename this to .opus while packing the original MP3 bytes, so the archive
    // advertised a format it did not contain.
    expect(entries.has('audio/theme.mp3')).toBe(true);
    expect(entries.has('audio/theme.opus')).toBe(false);
  });
});
