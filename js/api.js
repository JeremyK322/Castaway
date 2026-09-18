// api.js — LLM provider adapters with DeepSeek as primary target.
// Exposes: callLLM({ messages, provider?, model?, maxTokens?, temperature?, jsonMode?, jsonFallback? })

import { loadSettings } from './settings.js';

// ---------- provider configs ----------

const PROVIDERS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-v4-flash',
    supportsJsonMode: true,
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: ({ model, messages, maxTokens, temperature, jsonMode }) => {
      const body = {
        model,
        messages,
        max_tokens: maxTokens ?? 4096,
        temperature: temperature ?? 0.7,
        stream: false,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };
      return body;
    },
    extractText: (data) => data?.choices?.[0]?.message?.content ?? '',
    extractUsage: (data) => data?.usage ?? null,
  },

  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    supportsJsonMode: true,
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: ({ model, messages, maxTokens, temperature, jsonMode }) => {
      const body = {
        model,
        messages,
        max_tokens: maxTokens ?? 4096,
        temperature: temperature ?? 0.7,
        stream: false,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };
      return body;
    },
    extractText: (data) => data?.choices?.[0]?.message?.content ?? '',
    extractUsage: (data) => data?.usage ?? null,
  },

  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-haiku-latest',
    supportsJsonMode: false,
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    buildBody: ({ model, messages, maxTokens, temperature }) => {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const rest   = messages.filter(m => m.role !== 'system');
      return {
        model,
        system,
        messages: rest,
        max_tokens: maxTokens ?? 4096,
        temperature: temperature ?? 0.7,
      };
    },
    extractText: (data) => data?.content?.[0]?.text ?? '',
    extractUsage: (data) => data?.usage ?? null,
  },

  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-2.0-flash',
    supportsJsonMode: true,
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    }),
    buildBody: ({ messages, temperature, jsonMode }) => {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const rest   = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const body = {
        contents: rest,
        generationConfig: { temperature: temperature ?? 0.7 },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (jsonMode) body.generationConfig.responseMimeType = 'application/json';
      return body;
    },
    buildUrl: (baseUrl, model) => `${baseUrl}/${model}:generateContent`,
    extractText: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    extractUsage: (data) => data?.usageMetadata ?? null,
  },
};

// ---------- core call ----------

export async function callLLM({
  messages,
  provider,
  model,
  maxTokens = 4096,
  temperature = 0.7,
  jsonMode = false,
  jsonFallback = true,
  retries = 1,
} = {}) {
  const settings = loadSettings();
  const chosenProvider = provider || settings.provider || 'deepseek';
  const chosenModel    = model    || settings.model    || PROVIDERS[chosenProvider].defaultModel;
  const apiKey         = settings.apiKey;

  if (!apiKey) {
    throw new ApiError('NO_KEY', 'No API key set. Open settings (⚙) and paste your key.');
  }

  const cfg = PROVIDERS[chosenProvider];
  if (!cfg) throw new ApiError('BAD_PROVIDER', `Unknown provider: ${chosenProvider}`);

  // Ensure "json" appears in the messages when jsonMode is on.
  if (jsonMode && cfg.supportsJsonMode) {
    const hasJsonWord = messages.some(m =>
      typeof m.content === 'string' && /\bjson\b/i.test(m.content)
    );
    if (!hasJsonWord) {
      messages = [
        { role: 'system', content: 'Respond with valid JSON only.' },
        ...messages,
      ];
    }
  }

  const url = cfg.buildUrl ? cfg.buildUrl(cfg.baseUrl, chosenModel) : cfg.baseUrl;

  // Plan: try JSON mode first; if empty, retry without JSON mode.
  let attemptPlan = [];
  if (jsonMode && jsonFallback && cfg.supportsJsonMode) {
    attemptPlan = [
      { jsonMode: true,  label: 'json-mode' },
      { jsonMode: false, label: 'no-json-mode' },
    ];
  } else {
    attemptPlan = [{ jsonMode, label: 'default' }];
  }

  let lastError = null;

  for (const plan of attemptPlan) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const body = cfg.buildBody({
          model: chosenModel,
          messages,
          maxTokens,
          temperature,
          jsonMode: plan.jsonMode,
        });

        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: cfg.buildHeaders(apiKey),
          body: JSON.stringify(body),
        }, 90000);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new ApiError(
            `HTTP_${res.status}`,
            `Provider returned ${res.status}: ${errText.slice(0, 300)}`,
            res.status
          );
        }

        const data = await res.json();
        const text = cfg.extractText(data);
        const usage = cfg.extractUsage(data);

        if (!text || !text.trim()) {
          lastError = new ApiError('EMPTY_CONTENT', `Empty content (plan=${plan.label}).`);
          if (attempt < retries) {
            await sleep(500);
            continue;
          }
          break; // move to next plan
        }

        return { text, usage, raw: data, plan: plan.label };
      } catch (err) {
        lastError = err;

        if (err instanceof ApiError) {
          if (err.code === 'NO_KEY' || err.code === 'BAD_PROVIDER') throw err;
          if (err.status === 401 || err.status === 403) throw err;
          if (err.status === 400) throw err;
        }

        if (attempt < retries) {
          await sleep(600 * Math.pow(2, attempt));
          continue;
        }
        break; // move to next plan
      }
    }
  }

  throw lastError || new ApiError('UNKNOWN', 'Unknown error');
}

// ---------- helpers ----------

export class ApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- JSON parsing ----------

export function parseJSONResponse(text) {
  if (!text) throw new ApiError('PARSE', 'Empty text to parse');

  let cleaned = text.trim();

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch (e) {
      throw new ApiError('PARSE', `Could not parse JSON: ${e.message}\n\nRaw: ${cleaned.slice(0, 400)}`);
    }
  }

  throw new ApiError('PARSE', `No JSON object found in response.\n\nRaw: ${cleaned.slice(0, 400)}`);
}