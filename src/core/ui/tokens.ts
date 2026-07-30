// ---------------------------------------------------------------------------
// tokens.ts — Shared design system for the PraxiLabs UI
// ---------------------------------------------------------------------------
// All UI sub-modules import from here. Define once, change once.
// ---------------------------------------------------------------------------

// ── CSS Custom-property injection (themes) ────────────────────────────────

const STYLES = `
  :root {
    --color-bg: rgba(13, 14, 18, 0.82);
    --color-bg-solid: #0d0e12;
    --color-border: 1px solid rgba(255,255,255,0.08);
    --color-border-accent: 1px solid rgba(34,170,255,0.4);
    --color-accent: #22aaff;
    --color-accent-dim: rgba(34,170,255,0.15);
    --color-text: #c8cdd8;
    --color-text-muted: #8a95a8;
    --color-text-bright: #eef0f5;
  }
  [data-theme="light"] {
    --color-bg: rgba(240, 242, 245, 0.82);
    --color-bg-solid: #f0f2f5;
    --color-border: 1px solid rgba(0,0,0,0.1);
    --color-border-accent: 1px solid rgba(0,120,215,0.4);
    --color-accent: #0078d7;
    --color-accent-dim: rgba(0,120,215,0.15);
    --color-text: #202428;
    --color-text-muted: #5a6473;
    --color-text-bright: #000000;
  }
  [data-theme="hc-dark"] {
    --color-bg: rgba(0, 0, 0, 0.95);
    --color-bg-solid: #000000;
    --color-border: 1px solid #ffff00;
    --color-border-accent: 1px solid #00ff00;
    --color-accent: #ffff00;
    --color-accent-dim: rgba(255,255,0,0.2);
    --color-text: #ffffff;
    --color-text-muted: #cccccc;
    --color-text-bright: #ffffff;
  }
  [data-theme="hc-light"] {
    --color-bg: rgba(255, 255, 255, 0.95);
    --color-bg-solid: #ffffff;
    --color-border: 1px solid #000000;
    --color-border-accent: 1px solid #0000ff;
    --color-accent: #0000ff;
    --color-accent-dim: rgba(0,0,255,0.15);
    --color-text: #000000;
    --color-text-muted: #333333;
    --color-text-bright: #000000;
  }
  [data-theme="protanopia"] {
    --color-bg: rgba(13, 14, 18, 0.82);
    --color-bg-solid: #0d0e12;
    --color-border: 1px solid rgba(255,255,255,0.08);
    --color-border-accent: 1px solid rgba(255,194,10,0.4);
    --color-accent: #ffc20a;
    --color-accent-dim: rgba(255,194,10,0.15);
    --color-text: #c8cdd8;
    --color-text-muted: #8a95a8;
    --color-text-bright: #eef0f5;
  }
  [data-theme="deuteranopia"] {
    --color-bg: rgba(13, 14, 18, 0.82);
    --color-bg-solid: #0d0e12;
    --color-border: 1px solid rgba(255,255,255,0.08);
    --color-border-accent: 1px solid rgba(12,123,220,0.4);
    --color-accent: #0c7bdc;
    --color-accent-dim: rgba(12,123,220,0.15);
    --color-text: #c8cdd8;
    --color-text-muted: #8a95a8;
    --color-text-bright: #eef0f5;
  }
  [data-theme="tritanopia"] {
    --color-bg: rgba(13, 14, 18, 0.82);
    --color-bg-solid: #0d0e12;
    --color-border: 1px solid rgba(255,255,255,0.08);
    --color-border-accent: 1px solid rgba(212,17,89,0.4);
    --color-accent: #d41159;
    --color-accent-dim: rgba(212,17,89,0.15);
    --color-text: #c8cdd8;
    --color-text-muted: #8a95a8;
    --color-text-bright: #eef0f5;
  }
  [data-theme="solarized-dark"] {
    --color-bg: rgba(0, 43, 54, 0.82);
    --color-bg-solid: #002b36;
    --color-border: 1px solid rgba(147,161,161,0.2);
    --color-border-accent: 1px solid rgba(38,139,210,0.4);
    --color-accent: #268bd2;
    --color-accent-dim: rgba(38,139,210,0.15);
    --color-text: #839496;
    --color-text-muted: #586e75;
    --color-text-bright: #93a1a1;
  }
  [data-theme="solarized-light"] {
    --color-bg: rgba(253, 246, 227, 0.82);
    --color-bg-solid: #fdf6e3;
    --color-border: 1px solid rgba(101,123,131,0.2);
    --color-border-accent: 1px solid rgba(38,139,210,0.4);
    --color-accent: #268bd2;
    --color-accent-dim: rgba(38,139,210,0.15);
    --color-text: #657b83;
    --color-text-muted: #93a1a1;
    --color-text-bright: #586e75;
  }
  [data-theme="monokai"] {
    --color-bg: rgba(39, 40, 34, 0.82);
    --color-bg-solid: #272822;
    --color-border: 1px solid rgba(248,248,242,0.1);
    --color-border-accent: 1px solid rgba(166,226,46,0.4);
    --color-accent: #a6e22e;
    --color-accent-dim: rgba(166,226,46,0.15);
    --color-text: #f8f8f2;
    --color-text-muted: #75715e;
    --color-text-bright: #ffffff;
  }
`;

// Inject styles exactly once (idempotent — safe to import from multiple modules).
if (!document.getElementById('praxilabs-theme-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'praxilabs-theme-styles';
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);
}

// ── Design tokens — CSS custom properties wrapped as JS constants ─────────
// All values reference CSS variables so they respond to theme changes at runtime.

export const TOKEN = {
  bg:           'var(--color-bg)',
  bgSolid:      'var(--color-bg-solid)',
  border:       'var(--color-border)',
  borderAccent: 'var(--color-border-accent)',
  accent:       'var(--color-accent)',
  accentDim:    'var(--color-accent-dim)',
  text:         'var(--color-text)',
  textMuted:    'var(--color-text-muted)',
  textBright:   'var(--color-text-bright)',
  fontMono:     "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  fontSans:     "'Inter', system-ui, sans-serif",
  radius:       '6px',
  panelBlur:    'blur(14px) saturate(160%)',
  shadow:       '0 8px 32px rgba(0,0,0,0.6)',
  transition:   'all 0.18s ease',
} as const;

// ── Shared DOM helpers ────────────────────────────────────────────────────

/** Create an element and apply inline styles in one call. */
export function el(tag: string, styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const element = document.createElement(tag) as HTMLDivElement;
  Object.assign(element.style, styles);
  return element;
}

/** Create a styled ghost button with hover highlight. */
export function button(text: string, color: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `
    background:transparent;border:1px solid ${color}33;border-radius:4px;
    color:${color};font-size:11px;font-family:${TOKEN.fontSans};
    padding:4px 10px;cursor:pointer;white-space:nowrap;
    transition:${TOKEN.transition};
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.background = `${color}18`;
    btn.style.borderColor = color;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.borderColor = `${color}33`;
  });
  return btn;
}

/**
 * Apply (or reapply) the filled-track gradient to a range input.
 * Safe to call multiple times — overwrites the background each call.
 */
export function styleSlider(slider: HTMLInputElement): void {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 1;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;

  slider.style.cssText += `
    -webkit-appearance:none;appearance:none;
    height:4px;border-radius:2px;
    background:linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${pct}%,rgba(255,255,255,0.08) ${pct}%);
    outline:none;cursor:pointer;
  `;

  // Guard so we don't stack listeners on repeated calls.
  if (!(slider as HTMLInputElement & { _trackListenerAdded?: boolean })._trackListenerAdded) {
    (slider as HTMLInputElement & { _trackListenerAdded?: boolean })._trackListenerAdded = true;
    slider.addEventListener('input', () => {
      const p = ((parseFloat(slider.value) - parseFloat(slider.min)) /
        (parseFloat(slider.max) - parseFloat(slider.min))) * 100;
      slider.style.background = `linear-gradient(to right,${TOKEN.accent} 0%,${TOKEN.accent} ${p}%,rgba(255,255,255,0.08) ${p}%)`;
    });
  }
}

/** Format a raw numeric measurement value for display in the readouts panel. */
export function formatValue(key: string, val: number): string {
  if (key.endsWith('_deg'))  return `${val.toFixed(2)} °`;
  if (key.endsWith('_s'))    return `${val.toFixed(3)} s`;
  if (key.endsWith('_ms'))   return `${val.toFixed(1)} m/s`;
  if (key.endsWith('_rads')) return `${val.toFixed(4)} rad/s`;
  return val.toFixed(4);
}
