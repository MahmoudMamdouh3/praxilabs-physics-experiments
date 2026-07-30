import type { Engine } from './Engine.ts';
import type { Physics } from './Physics.ts';
import type { IExperiment, ParameterSchema } from '../experiments/IExperiment.ts';

import { TOKEN, el } from './ui/tokens.ts';
import { ParameterPanel } from './ui/ParameterPanel.ts';
import { GraphPanel } from './ui/GraphPanel.ts';
import { ControlsBar } from './ui/ControlsBar.ts';

// ---------------------------------------------------------------------------
// Experiment registry
// ---------------------------------------------------------------------------
type ExperimentFactory = () => IExperiment;
export const EXPERIMENT_REGISTRY: Array<{ id: string; label: string; factory: ExperimentFactory }> = [];

export function registerExperiment(id: string, label: string, factory: ExperimentFactory): void {
  EXPERIMENT_REGISTRY.push({ id, label, factory });
}

// ---------------------------------------------------------------------------
// Main UI Orchestrator
// ---------------------------------------------------------------------------
export class UI {
  private readonly shell: HTMLDivElement;
  private toastContainer: HTMLDivElement | null = null;
  
  private readonly parameterPanel: ParameterPanel;
  private readonly graphPanel: GraphPanel;
  private readonly controlsBar: ControlsBar;
  private readonly physics: Physics;
  private readonly physics2: Physics;
  private readonly engine: Engine;
  
  private hasWarnedViewport: boolean = false;

  constructor(
    physics: Physics,
    physics2: Physics,
    engine: Engine
  ) {
    this.physics = physics;
    this.physics2 = physics2;
    this.engine = engine;
    // Inject fonts
    if (!document.getElementById('ui-font-inter')) {
      const link = document.createElement('link');
      link.id = 'ui-font-inter';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap';
      document.head.appendChild(link);
    }

    // Listen for auto-pause events from experiments (e.g. Projectile landing)
    document.addEventListener('praxilabs-auto-pause', () => {
      if (!this.physics.isPaused) {
        document.getElementById('ui-btn-pause')?.click();
      }
    });

    // ── Root shell (pointer-events: none so Three.js canvas stays interactive)
    this.shell = el('div', {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '10',
      fontFamily: TOKEN.fontSans,
      color: TOKEN.text,
    });
    document.body.appendChild(this.shell);

    // ── Top HUD ────────────────────────────────────────────────────────
    const topHud = el('div', {
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'fit-content',
      padding: '0 32px',
      borderRadius: '8px',
      height: '36px',
      background: 'linear-gradient(180deg, rgba(13,13,15,0.9) 0%, rgba(13,13,15,0.4) 100%)',
      border: `1px solid rgba(255,255,255,0.1)`,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: '20',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    });

    topHud.innerHTML = `
      <div style="display:flex; gap: 40px; align-items:center; font-family:${TOKEN.fontMono}; font-size:11px; letter-spacing:2px; color:${TOKEN.textBright}; font-weight:600;">
        <span>SYS.STATUS: ONLINE</span>
        <div style="width: 200px; height: 1px; background: linear-gradient(90deg, transparent, ${TOKEN.accent}, transparent); opacity:0.3;"></div>
        <span>SIMULATION: ENGAGED</span>
        <div style="width: 200px; height: 1px; background: linear-gradient(90deg, transparent, ${TOKEN.accent}, transparent); opacity:0.3;"></div>
        <span>RENDER: NOMINAL</span>
      </div>
    `;
    this.shell.appendChild(topHud);

    // ── Left panel (holds header, switcher, controls, and parameter sliders) ──
    const sidePanel = el('div', {
      position: 'absolute',
      top: '56px',
      left: '16px',
      width: '320px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'auto',
    });
    this.shell.appendChild(sidePanel);

    // Header
    const header = el('div', {
      padding: '14px 16px 12px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.borderAccent,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
    });
    header.innerHTML = `
      <div style="font-size:10px;letter-spacing:2px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:4px;">PraxiLabs</div>
      <div id="ui-exp-name" style="font-size:16px;font-weight:600;color:${TOKEN.textBright};line-height:1.2;">Physics Experiments</div>
      <div id="ui-exp-desc" style="font-size:11px;color:${TOKEN.textMuted};margin-top:4px;line-height:1.5;"></div>
    `;
    sidePanel.appendChild(header);

    // Sub-components
    this.graphPanel = new GraphPanel(this.physics);
    this.parameterPanel = new ParameterPanel(
      this.physics,
      this.physics2,
      this.engine,
      () => this.graphPanel.reset(),
      (msg) => this.showModalWarning(msg)
    );
    this.controlsBar = new ControlsBar(
      this.physics,
      this.physics2,
      this.engine,
      this.parameterPanel,
      this.graphPanel,
      (msg, type) => this.showToast(msg, type),
      (msg) => this.showModalWarning(msg),
      (title, contentHtml) => this.showHelpModal(title, contentHtml)
    );

    // Assemble the rest of the layout
    sidePanel.appendChild(this.controlsBar.switcherElement);
    sidePanel.appendChild(this.controlsBar.element);
    sidePanel.appendChild(this.parameterPanel.paramSection);
    // ── Right Panel Container ────────────────────────────────────────────────
    const rightPanel = el('div', {
      position: 'absolute',
      top: '56px',
      right: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      width: '240px',
      pointerEvents: 'none',
      zIndex: '10',
    });

    // Make children interactive
    this.parameterPanel.readoutsPanel.style.pointerEvents = 'auto';
    rightPanel.appendChild(this.parameterPanel.readoutsPanel);

    // ── Settings Panel ────────────────────────────────────────────────────────
    const settingsPanel = el('div', {
      padding: '12px 16px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    });
    settingsPanel.innerHTML = `<div style="font-size:10px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;letter-spacing:1px;">Settings</div>`;

    // Theme Selector
    const themeWrapper = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    const themeLabel = el('span', { fontSize: '11px', color: TOKEN.textMuted, fontFamily: TOKEN.fontSans });
    themeLabel.textContent = 'Theme:';
    
    const themeSelect = document.createElement('select');
    themeSelect.style.cssText = `
      background:transparent; color:${TOKEN.textBright};
      border:1px solid rgba(255,255,255,0.2); border-radius:4px;
      font-size:11px; font-family:${TOKEN.fontSans};
      padding:4px 8px; cursor:pointer; outline:none;
      max-width: 130px;
    `;
    const themes = [
      { val: 'default', name: 'Sci-Fi Dark' },
      { val: 'light', name: 'Clean Light' },
      { val: 'hc-dark', name: 'High Contrast Dark' },
      { val: 'hc-light', name: 'High Contrast Light' },
      { val: 'protanopia', name: 'Protanopia Safe' },
      { val: 'deuteranopia', name: 'Deuteranopia Safe' },
      { val: 'tritanopia', name: 'Tritanopia Safe' },
      { val: 'solarized-dark', name: 'Solarized Dark' },
      { val: 'solarized-light', name: 'Solarized Light' },
      { val: 'monokai', name: 'Monokai' },
    ];
    for (const t of themes) {
      const opt = document.createElement('option');
      opt.value = t.val;
      opt.textContent = t.name;
      opt.style.background = '#0d0e12';
      opt.style.color = '#fff';
      themeSelect.appendChild(opt);
    }
    const savedTheme = localStorage.getItem('praxilabs-theme') || 'default';
    document.body.dataset.theme = savedTheme;
    themeSelect.value = savedTheme;
    themeSelect.addEventListener('change', () => {
      document.body.dataset.theme = themeSelect.value;
      localStorage.setItem('praxilabs-theme', themeSelect.value);
    });
    
    themeWrapper.appendChild(themeLabel);
    themeWrapper.appendChild(themeSelect);
    settingsPanel.appendChild(themeWrapper);

    // UI Scale Slider
    const scaleWrapper = el('div', { display: 'flex', alignItems: 'center', gap: '8px' });
    const scaleLabel = el('span', { fontSize: '11px', color: TOKEN.textMuted, fontFamily: TOKEN.fontSans });
    scaleLabel.textContent = 'UI Scale:';
    
    const scaleSlider = document.createElement('input');
    scaleSlider.type = 'range';
    scaleSlider.min = '0.8';
    scaleSlider.max = '1.5';
    scaleSlider.step = '0.1';
    scaleSlider.value = '1.0';
    scaleSlider.style.flex = '1';
    scaleSlider.style.minWidth = '0';
    // Use the styleSlider logic inline since it's hard to import if not exported? Wait, we can import styleSlider from tokens.ts.
    // I see styleSlider is imported at the top of UI.ts? No, let's check UI.ts imports.
    // I'll just apply basic styles to make it safe.
    scaleSlider.style.cssText = `flex:1; min-width:0; accent-color:${TOKEN.accent};`;
    
    scaleSlider.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      (this.shell as any).style.zoom = val;
    });
    
    scaleWrapper.appendChild(scaleLabel);
    scaleWrapper.appendChild(scaleSlider);
    settingsPanel.appendChild(scaleWrapper);
    
    // Reset Settings Button
    const resetSettingsBtn = document.createElement('button');
    resetSettingsBtn.textContent = '↺ Reset Settings';
    resetSettingsBtn.title = 'Reset UI Scale and Theme to their defaults';
    resetSettingsBtn.style.cssText = `
      margin-top: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
      color: ${TOKEN.textMuted}; border-radius: 4px; padding: 4px 8px;
      font-size: 11px; font-family: ${TOKEN.fontSans}; cursor: pointer; outline: none;
      transition: background 0.2s, color 0.2s;
    `;
    resetSettingsBtn.addEventListener('mouseenter', () => { resetSettingsBtn.style.color = TOKEN.textBright; resetSettingsBtn.style.background = 'rgba(255, 255, 255, 0.1)'; });
    resetSettingsBtn.addEventListener('mouseleave', () => { resetSettingsBtn.style.color = TOKEN.textMuted; resetSettingsBtn.style.background = 'rgba(255, 255, 255, 0.05)'; });
    resetSettingsBtn.addEventListener('click', () => {
      // Reset Theme
      themeSelect.value = 'default';
      document.body.dataset.theme = 'default';
      localStorage.setItem('praxilabs-theme', 'default');
      // Reset Scale
      scaleSlider.value = '1.0';
      (this.shell as any).style.zoom = '1.0';
      this.showToast('Settings reset to defaults', 'info');
    });
    settingsPanel.appendChild(resetSettingsBtn);
    
    rightPanel.appendChild(settingsPanel);

    // ── Camera controls hint ─────────────────────────────────────────────────
    const camHint = el('div', {
      padding: '12px 16px',
      background: TOKEN.bg,
      backdropFilter: TOKEN.panelBlur,
      border: TOKEN.border,
      borderRadius: TOKEN.radius,
      boxShadow: TOKEN.shadow,
      pointerEvents: 'auto',
    });
    camHint.innerHTML = `
      <div style="font-size:10px;color:${TOKEN.accent};font-family:${TOKEN.fontMono};text-transform:uppercase;margin-bottom:6px;letter-spacing:1px;">Camera Controls</div>
      <div style="font-size:12px;color:${TOKEN.textMuted};font-family:${TOKEN.fontSans};line-height:1.6;">
        <b style="color:${TOKEN.textBright};">Left Click + Drag</b>: Pan View<br>
        <b style="color:${TOKEN.textBright};">Scroll Wheel</b>: Zoom In / Out
      </div>
    `;
    rightPanel.appendChild(camHint);

    this.shell.appendChild(rightPanel);
    this.shell.appendChild(this.graphPanel.element);

    this.checkViewportSize();
    window.addEventListener('resize', () => this.checkViewportSize());

    // ── Toast Container ───────────────────────────────────────────────────────
    this.toastContainer = el('div', {
      position: 'absolute',
      top: '70px',
      left: '50%',
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      zIndex: '9999',
    });
    this.shell.appendChild(this.toastContainer);
  }

  // ── Public API (delegates to sub-components) ──────────────────────────────

  buildParameterPanel(schema: Record<string, ParameterSchema>): void {
    this.parameterPanel.buildPanel(schema, this.controlsBar.compareMode);
  }

  updateGraph(measurements: Record<string, number>, measurements2?: Record<string, number> | null): void {
    this.graphPanel.update(measurements, measurements2, this.controlsBar.compareMode);
  }

  updateReadouts(measurements: Record<string, number>): void {
    this.parameterPanel.updateReadouts(measurements);
  }

  updateHeader(experiment: IExperiment): void {
    const nameEl = document.getElementById('ui-exp-name');
    const descEl = document.getElementById('ui-exp-desc');
    if (nameEl) nameEl.textContent = experiment.name;
    if (descEl) descEl.textContent = experiment.description;
  }

  resetGraph(): void {
    this.graphPanel.reset();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private showHelpModal(title: string, contentHtml: string): void {
    const modalBg = el('div', {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      pointerEvents: 'auto',
    });

    const modalBox = el('div', {
      background: TOKEN.bgSolid,
      border: TOKEN.borderAccent,
      borderRadius: '8px',
      padding: '24px 32px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      maxWidth: '600px',
      maxHeight: '80vh',
      overflowY: 'auto',
    });

    const header = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    const titleEl = el('div', { fontSize: '18px', fontWeight: '600', color: TOKEN.accent, fontFamily: TOKEN.fontSans });
    titleEl.textContent = title;
    
    const closeIcon = document.createElement('button');
    closeIcon.innerHTML = '&times;';
    closeIcon.style.cssText = `
      background: transparent; border: none; color: ${TOKEN.textMuted}; font-size: 24px;
      cursor: pointer; padding: 0; line-height: 1; outline: none;
    `;
    closeIcon.addEventListener('click', () => {
      if (modalBg.parentNode) modalBg.parentNode.removeChild(modalBg);
    });

    header.appendChild(titleEl);
    header.appendChild(closeIcon);
    modalBox.appendChild(header);

    const contentBox = document.createElement('div');
    contentBox.style.cssText = `font-size:14px;color:${TOKEN.textBright};font-family:${TOKEN.fontSans};line-height:1.6;`;
    contentBox.innerHTML = contentHtml;
    modalBox.appendChild(contentBox);

    modalBg.appendChild(modalBox);
    
    // Close on clicking outside
    modalBg.addEventListener('click', (e) => {
      if (e.target === modalBg) {
        if (modalBg.parentNode) modalBg.parentNode.removeChild(modalBg);
      }
    });

    document.body.appendChild(modalBg);
  }

  private showModalWarning(message: string): void {
    const modalBg = el('div', {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      pointerEvents: 'auto',
    });

    const modalBox = el('div', {
      background: TOKEN.bgSolid,
      border: '1px solid #ff4444',
      borderRadius: '8px',
      padding: '24px 32px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      maxWidth: '400px',
      textAlign: 'center',
    });

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size: 32px; margin-bottom: -8px;';
    icon.textContent = '⚠️';
    modalBox.appendChild(icon);

    const msgEl = document.createElement('div');
    msgEl.style.cssText = `font-size:14px;color:${TOKEN.textBright};font-family:${TOKEN.fontSans};line-height:1.5;`;
    msgEl.textContent = message;
    modalBox.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Acknowledge & Close';
    closeBtn.style.cssText = `
      margin-top: 8px;
      background: rgba(255, 68, 68, 0.15);
      border: 1px solid #ff4444;
      color: #ff4444;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: ${TOKEN.fontSans};
      font-weight: 600;
      cursor: pointer;
      outline: none;
    `;
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'rgba(255, 68, 68, 0.3)');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'rgba(255, 68, 68, 0.15)');
    closeBtn.addEventListener('click', () => {
      if (modalBg.parentNode) modalBg.parentNode.removeChild(modalBg);
    });

    modalBox.appendChild(closeBtn);
    modalBg.appendChild(modalBox);
    document.body.appendChild(modalBg);
  }

  private showToast(message: string, type: 'warning' | 'info' = 'warning'): void {
    if (!this.toastContainer) return;

    const toast = el('div', {
      background: TOKEN.bgSolid,
      border: type === 'warning' ? '1px solid #ff4444' : TOKEN.borderAccent,
      color: TOKEN.textBright,
      padding: '10px 20px',
      borderRadius: '6px',
      fontFamily: TOKEN.fontSans,
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
      opacity: '0',
      transition: 'opacity 0.3s ease-in-out',
      pointerEvents: 'none',
    });
    toast.textContent = type === 'warning' ? `⚠️ ${message}` : `ℹ️ ${message}`;
    this.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  private checkViewportSize(): void {
    if (this.hasWarnedViewport) return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (width < 1024 || height < 700) {
      this.showToast('Window size is too small for optimal layout. Please maximize.', 'warning');
      this.hasWarnedViewport = true; // Only warn once per session to avoid spam
    }
  }
}
