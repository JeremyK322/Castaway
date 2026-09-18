// settings.js — API key, provider, model persistence
// Stores in localStorage. Never sends the key anywhere except the chosen provider.

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

// ---------- UI wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  const modal       = document.getElementById('settings-modal');
  const btnOpen     = document.getElementById('btn-settings');
  const btnSave     = document.getElementById('btn-save-settings');
  const btnClear    = document.getElementById('btn-clear-settings');
  const statusEl    = document.getElementById('settings-status');
  const providerEl  = document.getElementById('input-provider');
  const apiKeyEl    = document.getElementById('input-apikey');
  const modelEl     = document.getElementById('input-model');
  const hintEl      = document.getElementById('provider-hint');

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
    if (text) {
      clearTimeout(setStatus._t);
      setStatus._t = setTimeout(() => {
        statusEl.textContent = '';
        statusEl.classList.remove('error');
      }, 2600);
    }
  }

  function openModal() {
    const s = loadSettings();
    providerEl.value = s.provider;
    apiKeyEl.value   = s.apiKey;
    modelEl.value    = s.model;
    hintEl.textContent = PROVIDER_DEFAULTS[s.provider]?.hint || '';
    modal.classList.remove('hidden');
    setTimeout(() => apiKeyEl.focus(), 80);
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function applyProviderDefaults() {
    const provider = providerEl.value;
    const defaults = PROVIDER_DEFAULTS[provider];
    if (defaults) {
      modelEl.value = defaults.model;
      hintEl.textContent = defaults.hint;
    }
  }

  btnOpen.addEventListener('click', openModal);

  modal.addEventListener('click', (e) => {
    if (e.target.matches('[data-close="settings"]')) closeModal();
  });

  providerEl.addEventListener('change', applyProviderDefaults);

  btnSave.addEventListener('click', () => {
    const settings = {
      provider: providerEl.value,
      apiKey:   apiKeyEl.value.trim(),
      model:    modelEl.value.trim() || PROVIDER_DEFAULTS[providerEl.value]?.model,
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

  btnClear.addEventListener('click', () => {
    clearSettings();
    apiKeyEl.value = '';
    setStatus('Key cleared.');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
});