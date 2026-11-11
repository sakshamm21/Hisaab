import { useQuery } from '@tanstack/react-query';

import { api } from './api';

export type AiStatus = {
  provider: 'openrouter' | 'ollama' | 'custom';
  model: string;
  base_url: string;
  ready: boolean;
  key: string;
  key_from_env: boolean;
  fallbacks: string[];
  recommended: { id: string; label: string; tier: 'free' | 'cheap' | 'best'; why: string }[];
  offline: { id: string; label: string; size_gb: number; needs: string }[];
};

export type AiEvent =
  | { type: 'thread'; thread_id: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; label: string; args: Record<string, unknown> }
  | { type: 'proposal'; kind: 'budget' | 'recategorize' | 'rule'; category_id: number; category: string; amount?: number; period?: string; payee?: string; count?: number; pattern?: string }
  | { type: 'done'; thread_id: string; tools: string[]; text: string }
  | { type: 'error'; message: string };

export const useAiStatus = () => useQuery({ queryKey: ['ai', 'status'], queryFn: () => api<AiStatus>('/ai/status') });

/** POST and read a server-sent-events stream, calling onEvent for each `data:` line. */
export async function streamPost<T>(path: string, body: unknown, onEvent: (e: T) => void, signal?: AbortSignal) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      message = (await res.json()).detail ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof message === 'string' ? message : 'Something went wrong');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)) as T);
          } catch {
            /* ignore a malformed line */
          }
        }
      }
    }
  }
}
