// history.js — append-only chat log for the LLM.
// Each entry: { role: 'user' | 'assistant', content: string }
// The prompt formatter in prompts.js converts this into a string.

import { loadHistory, saveHistory, clearHistory } from './state.js';

export function getHistory() {
  return loadHistory();
}

export function appendUser(content) {
  const h = loadHistory();
  h.push({ role: 'user', content });
  saveHistory(h);
  return h;
}

export function appendAssistant(content) {
  const h = loadHistory();
  h.push({ role: 'assistant', content });
  saveHistory(h);
  return h;
}

export function clearAll() {
  clearHistory();
}

/**
 * Format history for the prompt (compact, role-prefixed).
 */
export function formatForPrompt(history) {
  if (!history || history.length === 0) return '(no history yet)';
  return history
    .map(h => {
      const role = h.role === 'user' ? 'PLAYER' : 'GM';
      const content = typeof h.content === 'string' ? h.content : JSON.stringify(h.content);
      // Keep it tight — trim very long entries
      const trimmed = content.length > 400 ? content.slice(0, 400) + '…' : content;
      return `${role}: ${trimmed}`;
    })
    .join('\n\n');
}