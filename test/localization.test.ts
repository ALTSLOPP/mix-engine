import { describe, it, expect } from 'vitest';
import { LocalizationManager } from '../src/ui/LocalizationManager';

describe('LocalizationManager & MSDF Font Engine', () => {
  it('translates strings with parameter interpolation and fallbacks', () => {
    const loc = new LocalizationManager();

    loc.registerLanguage('en', {
      greeting: 'Hello, {name}!',
      score_display: 'Score: {score} pts',
    });

    loc.registerLanguage('es', {
      greeting: '¡Hola, {name}!',
    });

    expect(loc.t('greeting', { name: 'Player1' })).toBe('Hello, Player1!');

    loc.setLanguage('es');
    expect(loc.t('greeting', { name: 'Player1' })).toBe('¡Hola, Player1!');

    // Fallback to English when key is missing in Spanish
    expect(loc.t('score_display', { score: 150 })).toBe('Score: 150 pts');
  });

  it('handles pluralization and RTL detection', () => {
    const loc = new LocalizationManager();

    loc.registerLanguage('en', {
      coins_one: '{count} Coin',
      coins_other: '{count} Coins',
      coins_zero: 'No Coins',
    });

    expect(loc.tPlural('coins', 0)).toBe('No Coins');
    expect(loc.tPlural('coins', 1)).toBe('1 Coin');
    expect(loc.tPlural('coins', 5)).toBe('5 Coins');

    expect(loc.isRTL('en')).toBe(false);
    expect(loc.isRTL('ar')).toBe(true);
  });

  it('parses MSDF font descriptor data', () => {
    const mockFontJson = {
      info: { face: 'Inter-Bold', size: 48 },
      common: { scaleW: 1024, scaleH: 1024 },
      distanceField: { fieldType: 'msdf', distanceRange: 4 },
      chars: [
        { id: 65, char: 'A', width: 30, height: 35, xoffset: 0, yoffset: 2, xadvance: 32, x: 10, y: 10 },
        { id: 66, char: 'B', width: 28, height: 35, xoffset: 1, yoffset: 2, xadvance: 30, x: 50, y: 10 },
      ],
    };

    const font = LocalizationManager.parseMsdfFont(mockFontJson);
    expect(font.face).toBe('Inter-Bold');
    expect(font.distanceRange).toBe(4);
    expect(font.glyphs.size).toBe(2);

    const glyphA = font.glyphs.get('A');
    expect(glyphA).toBeDefined();
    expect(glyphA?.width).toBe(30);
    expect(glyphA?.xadvance).toBe(32);
  });
});
