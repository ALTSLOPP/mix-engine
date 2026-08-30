export interface MsdfGlyph {
  id: number;
  index: number;
  char: string;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  chnl: number;
  x: number;
  y: number;
  page: number;
}

export interface MsdfFontInfo {
  face: string;
  size: number;
  distanceRange: number;
  textureWidth: number;
  textureHeight: number;
  glyphs: Map<string, MsdfGlyph>;
}

export type TranslationTable = Record<string, string>;

/**
 * LocalizationManager.ts — Multi-language localization (i18n) and MSDF font engine.
 * Handles language dictionaries, parameter interpolation, pluralization rules, and MSDF font metrics.
 */
export class LocalizationManager {
  private currentLanguage = 'en';
  private fallbackLanguage = 'en';
  private readonly locales = new Map<string, TranslationTable>();
  private readonly rtlLanguages = new Set(['ar', 'he', 'fa', 'ur']);

  constructor() {}

  /** Load translation dictionary for a language code (e.g. 'en', 'es', 'ja', 'zh'). */
  registerLanguage(lang: string, table: TranslationTable): void {
    const existing = this.locales.get(lang) || {};
    this.locales.set(lang, { ...existing, ...table });
  }

  /** Set current active language. */
  setLanguage(lang: string): void {
    this.currentLanguage = lang;
  }

  getLanguage(): string {
    return this.currentLanguage;
  }

  setFallbackLanguage(lang: string): void {
    this.fallbackLanguage = lang;
  }

  /** Check if the active language reads Right-to-Left (RTL). */
  isRTL(lang = this.currentLanguage): boolean {
    return this.rtlLanguages.has(lang);
  }

  /**
   * Translate a key with optional parameter substitution.
   * Example: t('welcome', { name: 'Hero' }) -> "Welcome, Hero!"
   */
  t(key: string, params?: Record<string, string | number>): string {
    const table = this.locales.get(this.currentLanguage);
    let str = table ? table[key] : undefined;

    if (str === undefined) {
      // A present-but-incomplete fallback table used to yield `undefined`, which then
      // crashed on str.replace() below. Fall through to the key itself instead.
      const fallbackTable = this.locales.get(this.fallbackLanguage);
      str = fallbackTable?.[key] ?? key;
    }

    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
      }
    }

    return str;
  }

  /**
   * Translate pluralized strings.
   * Keys convention: `key_one` (count === 1), `key_other` (count !== 1), or `key_zero`.
   */
  tPlural(key: string, count: number, params: Record<string, string | number> = {}): string {
    const p = { ...params, count };
    if (count === 0) {
      const zeroKey = `${key}_zero`;
      const table = this.locales.get(this.currentLanguage);
      if (table && table[zeroKey]) return this.t(zeroKey, p);
    }

    const specificKey = count === 1 ? `${key}_one` : `${key}_other`;
    return this.t(specificKey, p);
  }

  /**
   * Parse MSDF font descriptor JSON (from msdf-bmfont-xml).
   */
  static parseMsdfFont(fontJson: any): MsdfFontInfo {
    const info = fontJson.info || {};
    const common = fontJson.common || {};
    const distanceField = fontJson.distanceField || {};

    const glyphs = new Map<string, MsdfGlyph>();
    if (Array.isArray(fontJson.chars)) {
      for (const char of fontJson.chars) {
        const glyph: MsdfGlyph = {
          id: char.id,
          index: char.index ?? char.id,
          char: char.char ?? String.fromCharCode(char.id),
          width: char.width ?? 0,
          height: char.height ?? 0,
          xoffset: char.xoffset ?? 0,
          yoffset: char.yoffset ?? 0,
          xadvance: char.xadvance ?? 0,
          chnl: char.chnl ?? 15,
          x: char.x ?? 0,
          y: char.y ?? 0,
          page: char.page ?? 0,
        };
        glyphs.set(glyph.char, glyph);
      }
    }

    return {
      face: info.face ?? 'UnknownFont',
      size: info.size ?? 32,
      distanceRange: distanceField.distanceRange ?? 3,
      textureWidth: common.scaleW ?? 512,
      textureHeight: common.scaleH ?? 512,
      glyphs,
    };
  }
}
