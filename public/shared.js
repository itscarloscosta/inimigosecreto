'use strict';

window.InimigoUI = (() => {
  /**
   * Formats raw digits into Brazilian DDD format: (xx) x xxxx xxxx
   */
  function formatPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
      digits = digits.slice(2);
    }
    digits = digits.slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length === 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 7) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
  }

  function phoneDigits(raw) {
    return String(raw || '').replace(/\D/g, '');
  }

  function attachPhoneMask(inputEl) {
    if (!inputEl) return;
    inputEl.setAttribute('maxlength', '16');
    inputEl.setAttribute('inputmode', 'numeric');

    const applyMask = () => {
      const formatted = formatPhone(inputEl.value);
      if (inputEl.value !== formatted) {
        inputEl.value = formatted;
      }
    };

    inputEl.addEventListener('input', applyMask);
    inputEl.addEventListener('paste', () => {
      requestAnimationFrame(applyMask);
    });
  }

  function attachPasswordToggles(root = document) {
    root.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-toggle-password');
        const input = document.getElementById(targetId);
        if (!input) return;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
        btn.textContent = showing ? '👁️' : '🙈';
      });
    });
  }

  async function api(url, options = {}) {
    const config = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    };

    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Ocorreu um erro inesperado.');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => el.remove(), 220);
    }, 3400);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  }

  function launchEmojiBurst(originEl) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let layer = document.querySelector('.burst-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'burst-layer';
      document.body.appendChild(layer);
    }
    const rect = originEl
      ? originEl.getBoundingClientRect()
      : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const emojis = ['😈', '🎁', '💀', '🔥', '😂', '🪮', '🧦'];

    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span');
      p.className = 'burst-particle';
      p.textContent = emojis[i % emojis.length];
      const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.4;
      const dist = 90 + Math.random() * 140;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--ty', `${Math.sin(angle) * dist - 40}px`);
      p.style.setProperty('--rot', `${(Math.random() - 0.5) * 320}deg`);
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1250);
    }
  }

  return {
    formatPhone,
    phoneDigits,
    attachPhoneMask,
    attachPasswordToggles,
    api,
    toast,
    escapeHtml,
    formatDateTime,
    launchEmojiBurst,
  };
})();
