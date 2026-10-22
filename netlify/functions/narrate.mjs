const DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MODES = new Set(['narrate', 'freeform', 'advisor']);

const systemPromptFor = (mode) => {
  if (mode === 'advisor') {
    return '你是文字策略游戏《孤军：四行1937》的战地顾问。简短、专业地解释玩法或历史背景，不剧透随机事件，不编造不存在的规则。任务目标是守至第六天，结局由本地引擎按实际兵力与阵地判定，不擅自承诺胜负。只回答和预览，不执行军令。不替历史人物编造私人经历或引语。使用简体中文。';
  }
  if (mode === 'freeform') {
    return '你是1937年四行仓库文字游戏的叙述者。严格遵守时代技术条件，用简短、克制、有角色感的简体中文回应玩家，允许恐惧、犹疑、关照和干涩幽默，少用口号；不新增伤亡、资源或隐藏情报，不宣称执行行动，不替历史人物编造私人经历或引语，不能修改任何数值、胜负或游戏规则。';
  }
  return '你是1937年四行仓库文字游戏的文学编辑。只润色用户提供的基础战报，保持全部事实、因果、命令、提示与结局不变；不得新增伤亡、资源、战果或规则，不输出新的数值。仅在原战报确认受伤或死亡时写具体创伤，写实惨烈但不猎奇；不用口号替代人物感受，不替历史人物编造私人经历或引语。使用简体中文，控制在120字以内。';
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const allowedOrigin = process.env.AI_ALLOWED_ORIGIN;
  const requestOrigin = event.headers?.origin;
  if (allowedOrigin && requestOrigin && requestOrigin !== allowedOrigin) {
    return json(403, { error: 'Origin not allowed' });
  }
  if (!process.env.SILICONFLOW_API_KEY) {
    return json(503, { error: 'AI gateway is not configured' });
  }
  if (!event.body || event.body.length > 24_000) return json(400, { error: 'Invalid request' });

  try {
    const payload = JSON.parse(event.body);
    if (!MODES.has(payload.mode) || typeof payload.prompt !== 'string') {
      return json(400, { error: 'Invalid request' });
    }

    const history = Array.isArray(payload.history)
      ? payload.history.slice(-8)
        .filter((item) => item && typeof item.text === 'string')
        .map((item) => ({
          role: item.role === 'advisor' || item.role === 'model' ? 'assistant' : 'user',
          content: item.text.slice(0, 1_500),
        }))
      : [];
    const context = typeof payload.context === 'string' ? `背景：${payload.context.slice(0, 2_000)}\n\n` : '';
    const messages = [
      { role: 'system', content: systemPromptFor(payload.mode) },
      ...history,
      { role: 'user', content: `${context}${payload.prompt.slice(0, 6_000)}` },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_500);
    const providerResponse = await fetch(process.env.AI_BASE_URL || DEFAULT_BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        messages,
        temperature: payload.mode === 'advisor' ? 0.35 : 0.65,
        max_tokens: 320,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!providerResponse.ok) return json(502, { error: 'AI provider rejected the request' });
    const result = await providerResponse.json();
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return json(502, { error: 'Empty AI response' });
    return json(200, { text: text.trim(), provider: 'siliconflow' });
  } catch {
    return json(400, { error: 'Invalid or timed-out request' });
  }
};
