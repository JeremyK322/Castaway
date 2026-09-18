// net.js — connection banner, loading overlay, retry plumbing.

// ---------- refs ----------

const banner  = () => document.getElementById('net-banner');
const message = () => document.getElementById('net-message');
const retry   = () => document.getElementById('net-retry');
const loading = () => document.getElementById('loading');
const loadingText = () => document.getElementById('loading-text');

let retryHandler = null;

// ---------- net banner (used on API failure) ----------

export function showBanner(text, onRetry) {
  const b = banner();
  const m = message();
  const r = retry();
  if (!b || !m) return;

  m.textContent = text || 'Connection lost.';
  b.classList.remove('hidden');

  retryHandler = onRetry;
  if (r) {
    r.onclick = () => {
      if (typeof retryHandler === 'function') retryHandler();
    };
  }
}

export function hideBanner() {
  const b = banner();
  if (b) b.classList.add('hidden');
  retryHandler = null;
}

// ---------- loading overlay ----------

export function showLoading(text = 'The island takes shape…') {
  const el = loading();
  const t  = loadingText();
  if (t) t.textContent = text;
  if (el) el.classList.remove('hidden');
}

export function hideLoading() {
  const el = loading();
  if (el) el.classList.add('hidden');
}

// ---------- online/offline passthrough ----------

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}