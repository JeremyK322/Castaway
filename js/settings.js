// settings.js — API key, provider, model persistence.
// Exports openModal() so main.js can pop the settings dialog from anywhere.

const STORAGE_KEY = 'castaway.settings.v1';

const PROVIDER_DEFAULTS = {
  deepseek:  {
    model: 'deepseek-v4-flash',
    hint:  'Key starts with "sk-". Get one at platform.deepseek.com. Stored only on this device.',
  },
  openai:    {
    model: 'gpt-4o-mini',
    hint:  'Key starts with "sk-". Stored only on this device.',
  },
  anthropic: {
    model: 'claude-3-5-haiku-latest',
    hint:  'Key starts with "sk-ant-". Stored only on this device.',
  },
  gemini:    {
    model: 'gemini-2.0-flash',
    hint:  'Key from Google AI Studio. Stored only on this device.',
  },
};

const DEFAULT_PROVIDER = 'deepseek';

// ---------- public API ----------

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        provider: DEFAULT_PROVIDER,
        apiKey: '',
        model: PROVIDER_DEFAULTS[DEFAULT_PROVIDER].model,
      };
    }
    const parsed = JSON.parse(raw);
    const provider = parsed.provider || DEFAULT_PROVIDER;
    return {
      provider,
      apiKey: parsed.apiKey || '',
      model:  parsed.model || PROVIDER_DEFAULTS[provider]?.model || PROVIDER_DEFAULTS[DEFAULT_PROVIDER].model,
    };
  } catch {
    return {
      provider: DEFAULT_PROVIDER,
      apiKey: '',
      model: PROVIDER_DEFAULTS[DEFAULT_PROVIDER].model,
    };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error('saveSettings failed', e);
    return false;
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('clearSettings failed', e);
  }
}

export function hasApiKey() {
  const s = loadSettings();
  return Boolean(s.apiKey && s.apiKey.trim().length > 0);
}

// ---------- UI ----------

let _els = null;

function refs() {
  if (_els) return _els;
  _els = {
    modal:      document.getElementById('settings-modal'),
    provider:   document.getElementById('input-provider'),
    apiKey:     document.getElementById('input-apikey'),
    model:      document.getElementById('input-model'),
    hint:       document.getElementById('provider-hint'),
    status:     document.getElementById('settings-status'),
    btnOpen:    document.getElementById('btn-settings'),
    btnSave:    document.getElementById('btn-save-settings'),
    btnClear:   document.getElementById('btn-clear-settings'),
  };
  return _els;
}

function setStatus(text, isError = false) {
  const el = refs().status;
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
  if (text) {
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => {
      el.textContent = '';
      el.classList.remove('error');
    }, 2600);
  }
}

function applyProviderDefaults() {
  const el = refs();
  const provider = el.provider.value;
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults) {
    el.model.value = defaults.model;
    el.hint.textContent = defaults.hint;
  }
}

/**
 * Public: open the settings modal, populating fields from localStorage.
 * Safe to call from anywhere.
 */
export function openModal() {
  const el = refs();
  if (!el.modal) return;
  const s = loadSettings();
  el.provider.value = s.provider;
  el.apiKey.value   = s.apiKey;
  el.model.value    = s.model;
  el.hint.textContent = PROVIDER_DEFAULTS[s.provider]?.hint || '';
  el.modal.classList.remove('hidden');
  setTimeout(() => el.apiKey.focus(), 80);
}

export function closeModal() {
  const el = refs();
  if (el.modal) el.modal.classList.add('hidden');
}

// ---------- wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  const el = refs();
  if (!el.btnOpen) return;

  el.btnOpen.addEventListener('click', openModal);

  el.provider.addEventListener('change', applyProviderDefaults);

  el.btnSave.addEventListener('click', () => {
    const settings = {
      provider: el.provider.value,
      apiKey:   el.apiKey.value.trim(),
      model:    el.model.value.trim() || PROVIDER_DEFAULTS[el.provider.value]?.model,
    };
    if (!settings.apiKey) {
      setStatus('Enter an API key first.', true);
      return;
    }
    if (saveSettings(settings)) {
      setStatus('Saved.');
      setTimeout(closeModal, 600);
    } else {
      setStatus('Could not save (storage blocked?).', true);
    }
  });

  el.btnClear.addEventListener('click', () => {
    clearSettings();
    el.apiKey.value = '';
    setStatus('Key cleared.');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.modal.classList.contains('hidden')) closeModal();
  });
});