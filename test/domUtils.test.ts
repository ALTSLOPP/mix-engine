import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/ui/domUtils';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('xss')">`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;');
  });

  it('escapes ampersands first so entities are not double-mangled', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Box #12 (Character)')).toBe('Box #12 (Character)');
  });
});
