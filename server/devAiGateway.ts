import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type AiMode = 'narrate' | 'freeform' | 'advisor';

interface AiPayload {
  mode: AiMode;
  prompt: string;
  context?: string;
  history?: Array<{ role: string; text: string }>;
}

const DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions';

const systemPromptFor = (mode: AiMode): string => {
  if (mode === 'advisor') {
    return '你是文字策略游戏《孤军：四行1937》的战地顾问。简短、专业地解释玩法或历史背景，不剧透随机事件，不编造不存在的规则。游戏胜利目标是守到第六天且战斗人员不少于20人。使用简体中文。';
  }
  if (mode === 'freeform') {
    return '你是1937年四行仓库文字游戏的叙述者。严格遵守时代技术条件，用简短、克制、沉浸的简体中文回应玩家；不能修改任何数值、胜负或游戏规则。';
  }
  return '你是1937年四行仓库文字游戏的文学编辑。只润色用户提供的基础战报，保持全部事实、因果、命令、提示与结局不变；不得新增伤亡、资源、战果或规则，不输出新的数值。使用克制、紧张的简体中文，控制在120字以内。';
};

const readPayload = async (request: IncomingMessage): Promise<AiPayload> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 24_000) throw new Error('Payload too large');
    chunks.push(buffer);
  }

  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<AiPayload>;
  if (!['narrate', 'freeform', 'advisor'].includes(parsed.mode ?? '') || typeof parsed.prompt !== 'string') {
    throw new Error('Invalid request');
  }
  return {
    mode: parsed.mode as AiMode,
    prompt: parsed.prompt.slice(0, 6_000),
    context: typeof parsed.context === 'string' ? parsed.context.slice(0, 2_000) : undefined,
    history: Array.isArray(parsed.history) ? parsed.history.slice(-8) : undefined,
  };
};

const sendJson = (response: ServerResponse, status: number, data: unknown): void => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(data));
};

const createMessages = (payload: AiPayload) => {
  const history = (payload.history ?? [])
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => ({
      role: item.role === 'advisor' || item.role === 'model' ? 'assistant' : 'user',
      content: item.text.slice(0, 1_500),
    }));
  const context = payload.context ? `背景：${payload.context}\n\n` : '';
  return [
    { role: 'system', content: systemPromptFor(payload.mode) },
    ...history,
    { role: 'user', content: `${context}${payload.prompt}` },
  ];
};

export const createDevAiGateway = (env: Record<string, string>): Plugin => {
  const middleware = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }
    if (!env.SILICONFLOW_API_KEY) {
      sendJson(response, 503, { error: 'AI gateway is not configured' });
      return;
    }

    try {
      const payload = await readPayload(request);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7_500);
      const providerResponse = await fetch(env.AI_BASE_URL || DEFAULT_BASE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SILICONFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.AI_MODEL || DEFAULT_MODEL,
          messages: createMessages(payload),
          temperature: payload.mode === 'advisor' ? 0.35 : 0.65,
          max_tokens: 320,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!providerResponse.ok) {
        sendJson(response, 502, { error: 'AI provider rejected the request' });
        return;
      }
      const result = await providerResponse.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const text = result.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        sendJson(response, 502, { error: 'Empty AI response' });
        return;
      }
      sendJson(response, 200, { text: text.trim(), provider: 'siliconflow' });
    } catch {
      sendJson(response, 400, { error: 'Invalid or timed-out request' });
    }
  };

  const attach = (server: { middlewares: { use(path: string, handler: typeof middleware): void } }) => {
    server.middlewares.use('/api/narrate', middleware);
  };

  return {
    name: 'lone-army-ai-gateway',
    configureServer: attach,
    configurePreviewServer: attach,
  };
};
