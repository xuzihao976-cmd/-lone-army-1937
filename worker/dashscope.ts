export interface DashscopeEnv {
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_FREE_ONLY_CONFIRMED?: string;
}
export const DASHSCOPE_MODEL = 'qwen3.7-flash';
export async function callDashscope(env: DashscopeEnv, system: string, prompt: string, context: string, mode: string): Promise<{ output?: unknown; error?: string; status?: number }> {
  if (!env.DASHSCOPE_API_KEY?.trim()) return { error: 'dashscope_key_missing', status: 503 };
  // This is an operator acknowledgement, not a substitute for the account-side switch.
  if (env.DASHSCOPE_FREE_ONLY_CONFIRMED !== 'true') return { error: 'dashscope_free_only_unconfirmed', status: 503 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DASHSCOPE_MODEL, enable_thinking: false, stream: false, max_tokens: 400,
        ...(mode === 'intent' ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ input: prompt, context }) }],
      }),
    });
    const data = await response.json() as { error?: { code?: unknown }; code?: unknown } | null;
    if (!response.ok) {
      const code = data?.error?.code || data?.code;
      if (code === 'AllocationQuota.FreeTierOnly') return { error: 'dashscope_free_quota_exhausted', status: 403 };
      if (response.status === 401 || response.status === 403) return { error: 'dashscope_access_denied', status: response.status };
      return { error: 'dashscope_unavailable', status: response.status === 429 ? 429 : 503 };
    }
    return { output: data };
  } catch {
    return { error: controller.signal.aborted ? 'dashscope_timeout' : 'dashscope_unavailable', status: 503 };
  } finally { clearTimeout(timer); }
}
