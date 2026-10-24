/**
 * theme.js — Centralized UI Theme Management & Dynamic Palette Switcher
 * Supported Themes:
 * - emerald: Modern Emerald Teal & Cyan (Default)
 * - ocean: Royal Ocean Blue & Sky
 * - cyber: Deep Cyber Violet & Neon
 * - sunset: Warm Sunset Coral & Amber
 */

(function () {
  const THEMES = {
    emerald: {
      id: 'emerald',
      name: 'Emerald Teal & Cyan',
      shortName: 'Emerald',
      desc: 'Fresh & vibrant',
      gradient: 'linear-gradient(135deg, #0d9488, #06b6d4)'
    },
    ocean: {
      id: 'ocean',
      name: 'Ocean Blue & Sky',
      shortName: 'Ocean Blue',
      desc: 'Corporate & professional',
      gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)'
    },
    cyber: {
      id: 'cyber',
      name: 'Cyber Violet & Neon',
      shortName: 'Cyber Violet',
      desc: 'Modern dark AI style',
      gradient: 'linear-gradient(135deg, #7c3aed, #c084fc)'
    },
    sunset: {
      id: 'sunset',
      name: 'Sunset Coral & Amber',
      shortName: 'Sunset Coral',
      desc: 'Warm & high-contrast',
      gradient: 'linear-gradient(135deg, #ea580c, #f59e0b)'
    }
  };

  function getCurrentTheme() {
    return localStorage.getItem('gd_theme') || 'emerald';
  }

  function applyTheme(themeId, notify = false) {
    const validTheme = THEMES[themeId] ? themeId : 'emerald';
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem('gd_theme', validTheme);

    // Update switcher UI if mounted
    const label = document.getElementById('theme-name-label');
    if (label) label.textContent = THEMES[validTheme].shortName;

    const options = document.querySelectorAll('.theme-option');
    options.forEach(opt => {
      if (opt.getAttribute('data-theme') === validTheme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });

    // Notify user if triggered interactively
    if (notify && window.AppUtils && typeof window.AppUtils.showToast === 'function') {
      window.AppUtils.showToast(`Active Theme: ${THEMES[validTheme].name}`, 'success', 2000);
    }

    window.dispatchEvent(new CustomEvent('gd_theme_changed', { detail: { theme: validTheme } }));
  }

  function mountSwitcher() {
    if (document.getElementById('gd-theme-switcher')) return;

    const current = getCurrentTheme();
    const widget = document.createElement('div');
    widget.id = 'gd-theme-switcher';
    widget.className = 'theme-switcher-widget';

    const optionsHtml = Object.values(THEMES).map(t => `
      <button class="theme-option ${t.id === current ? 'active' : ''}" data-theme="${t.id}" type="button">
        <span class="theme-dot" style="background: ${t.gradient}"></span>
        <div class="theme-text">
          <div class="theme-title">${t.name}</div>
          <div class="theme-desc">${t.desc}</div>
        </div>
        <span class="theme-check">✓</span>
      </button>
    `).join('');

    widget.innerHTML = `
      <button class="theme-toggle-btn" id="theme-toggle-btn" type="button" aria-label="Change UI Theme" title="Switch UI Color Theme">
        <span class="theme-color-dot"></span>
        <span class="theme-name-label" id="theme-name-label">${THEMES[current].shortName}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="theme-chevron-icon">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      <div class="theme-dropdown-menu" id="theme-dropdown-menu">
        <div class="theme-dropdown-header">Interface Color Theme</div>
        ${optionsHtml}
      </div>
    `;

    document.body.appendChild(widget);

    const toggleBtn = widget.querySelector('#theme-toggle-btn');
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      widget.classList.toggle('open');
    });

    widget.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const themeId = btn.getAttribute('data-theme');
        applyTheme(themeId, true);
        widget.classList.remove('open');
      });
    });

    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target)) {
        widget.classList.remove('open');
      }
    });
  }

  // Apply immediately on load before DOM render to eliminate flash
  applyTheme(getCurrentTheme(), false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSwitcher);
  } else {
    mountSwitcher();
  }

  window.ThemeManager = {
    THEMES,
    getCurrentTheme,
    setTheme: applyTheme,
    mountSwitcher
  };
})();
