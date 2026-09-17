import type { GameStats } from '../types';
import { validateAiOrder } from './aiOrders';
export interface AiFailure { code: 'unconfigured' | 'timeout' | 'network' | 'http' | 'invalid_response' | 'invalid_order' | 'input_rejected' | 'cancelled'; status?: number; upstreamCode?: number; gatewayCode?: string; }
export const describeAiFailure = (failure: AiFailure): string => {
  if (failure.code === 'http') {
    const providerMessages: Record<number, string> = {
      10000: 'Cloudflare 模型调用鉴权失败',
      3023: 'Cloudflare 未允许此账户使用 AI 服务',
      3036: 'Cloudflare 账户今日免费 AI 额度已用完，需等待额度重置',
      3040: 'Cloudflare 模型当前容量不足',
      3041: '此账户没有该模型的访问权限',
      5018: '此账户没有该模型的访问权限',
      5016: '模型要求先接受使用条款',
      5035: '模型要求付费计划，本游戏未自动升级套餐',
      5007: 'Cloudflare 找不到配置的模型',
      3042: 'Cloudflare 模型名称无效',
      3007: 'Cloudflare 模型推理超时',
      3008: 'Cloudflare 模型推理被中止',
    };
    if (failure.upstreamCode && providerMessages[failure.upstreamCode]) return `${providerMessages[failure.upstreamCode]}（CF ${failure.upstreamCode}）。`;
    if (failure.gatewayCode === 'ai_binding_missing') return 'AI 网关缺少模型绑定，需要修复服务端配置。';
    if (failure.gatewayCode === 'ai_inference_failed') return 'Cloudflare 模型调用失败（HTTP 503，未提供已知错误编号），需要检查服务端日志。';
    if (failure.gatewayCode === 'invalid_model_reply' || failure.gatewayCode === 'empty_model_reply') return '模型未返回可用文本（HTTP 502）。';
    if (failure.status === 429) return 'AI 请求受到限流（HTTP 429），请稍后再试。';
    if (failure.status === 401 || failure.status === 403) return `AI 网关拒绝访问（HTTP ${failure.status}），需要检查服务权限或访问规则。`;
    if (failure.status === 503) return 'AI 网关暂时无法调用模型（HTTP 503），需要检查服务端权限、额度或模型状态。';
    return `AI 网关返回错误（HTTP ${failure.status}）。`;
  }
  return {
    unconfigured: '此版本没有配置 AI 网关。',
    timeout: 'AI 请求超过 8 秒仍未完成，已停止等待；暂不能区分网络慢还是模型慢。',
    network: '浏览器无法完成 AI 请求，可能是网络、域名连接或跨域访问失败。',
    invalid_response: 'AI 网关返回了无法读取的内容。',
    invalid_order: '模型回复不符合军令格式或安全校验，未执行。',
    input_rejected: '这条输入超出 AI 支持范围，未发送。',
    cancelled: 'AI 请求已取消。',
  }[failure.code];
};
export type AiMode = 'narrate' | 'freeform' | 'advisor' | 'intent';
export type AiSource = 'cloudflare' | 'local';

export interface AiReply {
  text: string;
  source: AiSource;
  failure?: AiFailure;
}

interface AiRequest {
  mode: AiMode;
  prompt: string;
  context?: string;
  history?: Array<{ role: string; text: string }>;
}

const REQUEST_TIMEOUT_MS = 8_000;
let gatewayUnavailableUntil = 0;
let previousFailure: AiFailure | undefined;
const configuredGateway = String(import.meta.env.VITE_AI_GATEWAY_URL || '').replace(/\/$/, '');
export const isAiConfigured = () => /^https:\/\/[^/]+(?:\/[^?#]*)?$/.test(configuredGateway);

const localAdvisorReply = (message: string): string => {
  const text = message.trim();
  if (/胜利|怎么赢|通关|结局/.test(text)) {
    return '主要目标是守到第六天。不要让可战人员和仓库整体结构崩溃，也要避免一楼、二楼、地下室全部失守；第四天以后还可以执行历史撤退。';
  }
  if (/指挥官|阵亡|死亡概率|风险/.test(text)) {
    return '只有敌袭命中指挥官所在楼层时才判定阵亡。中等防御的基础概率约2%；高等级工事、充足驻军和本层机枪可降到约0.3%，防区空虚且濒临失守时最高5%。战略地图会显示当前概率。';
  }
  if (/楼层|防区|地图|失守|夺回|反冲锋|封锁|楼梯/.test(text)) {
    return '每层都有独立完整度。一楼失守后敌军会分兵二楼和地下室；可以提前转移机枪，在突破口出现后封锁通往下一层的楼梯，或消耗800发七九弹和40枚手榴弹反冲锋夺回失地。';
  }
  if (/士气/.test(text)) {
    return '士气过低会增加逃兵和哗变风险。休息、演讲和打出漂亮的防御战都能恢复士气，伤亡则会快速打击士气。';
  }
  if (/压力|威胁|围攻|红条|接敌/.test(text)) {
    return '“敌军压力”影响后续攻势强度；压力达到100%时，会把“接敌时间”压到最后1回合。接敌时间才决定何时开战：短行动推进1格，90分钟以上的长行动推进2格，零耗时交谈不推进。';
  }
  if (/弹药|机枪|手榴弹|资源|工事材料/.test(text)) {
    return '七九弹供步兵与反冲锋使用，机枪弹维持两个机枪连的压制，手榴弹还能用于封锁楼梯。工事材料既能加固防区，也能和手榴弹一起布置一次性障碍。';
  }
  if (/伤员|治疗|急救/.test(text)) {
    return '伤员长期得不到救治会死亡。地下室医院一旦失守，治疗会停止、伤员恶化时间减半，还会立即损失部分药品和弹药，因此地下室不能完全空防。';
  }
  if (/升旗|国旗/.test(text)) {
    return '升旗能大幅提升士气，但会明显增加敌军轰炸风险。必须先到屋顶，并再次确认后执行。';
  }
  if (/撤退|撤离|逃跑/.test(text)) {
    return '撤退属于不可逆命令，系统会要求二次确认。战斗初期擅自逃离会触发失败结局，第四天后才可能进入历史撤退结局。';
  }
  if (/教程|开始|第一步|加固/.test(text)) {
    return '开局先按副官提示加固一楼，再安排轮换休息。完成这两步后，正式守备阶段才会开始。';
  }
  return '建议先确认当前工事、士气、弹药、敌军压力和接敌时间，再决定加固、休息、治疗、侦察或转移。AI 通讯不可用时，本地顾问仍会回答核心规则。';
};

const requestAi = async (request: AiRequest, signal?: AbortSignal): Promise<{ text: string; failure?: never } | { text: null; failure: AiFailure }> => {
  // Pages hosts the game; an explicitly configured external Worker hosts AI.
  // Builds without a gateway stay entirely local.
  if (signal?.aborted) return { text: null, failure: { code: 'cancelled' } };
  if (!isAiConfigured()) return { text: null, failure: { code: 'unconfigured' } };
  if (Date.now() < gatewayUnavailableUntil && previousFailure) return { text: null, failure: previousFailure };

  const fail = (failure: AiFailure, cooldown = 15_000) => {
    previousFailure = failure;
    gatewayUnavailableUntil = Date.now() + cooldown;
    return { text: null, failure } as const;
  };

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => timeoutController.abort();
  if (signal?.aborted) timeoutController.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(`${configuredGateway}/api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      let details: { upstreamCode?: unknown; error?: unknown } | null = null;
      try { details = await response.json(); } catch {
        if (timeoutController.signal.aborted) throw new Error('aborted');
      }
      const failure: AiFailure = { code: 'http', status: response.status };
      if (details && typeof details.upstreamCode === 'number' && Number.isInteger(details.upstreamCode)) failure.upstreamCode = details.upstreamCode;
      if (details && typeof details.error === 'string' && ['ai_binding_missing', 'ai_inference_failed', 'invalid_model_reply', 'empty_model_reply'].includes(details.error)) failure.gatewayCode = details.error;
      return fail(failure, 60_000);
    }

    let data: { text?: unknown } | null;
    try { data = await response.json(); } catch {
      if (timeoutController.signal.aborted) throw new Error('aborted');
      return fail({ code: 'invalid_response' });
    }
    if (!data || typeof data.text !== 'string' || data.text.length > 2000 || !data.text.trim()) return fail({ code: 'invalid_response' });
    previousFailure = undefined;
    gatewayUnavailableUntil = 0;
    return { text: data.text.trim() };
  } catch {
    if (signal?.aborted) return { text: null, failure: { code: 'cancelled' } };
    return fail({ code: timedOut ? 'timeout' : 'network' }, timedOut ? 30_000 : 15_000);
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abort);
  }
};

const splitBattleReport = (text: string): { prose: string; stats: string } => {
  const divider = '\n\n━━━━━━━━━━━━━━\n';
  const index = text.indexOf(divider);
  if (index < 0) return { prose: text, stats: '' };
  return { prose: text.slice(0, index), stats: text.slice(index) };
};

export const enhanceBattleNarrative = async (
  narrative: string,
  command: string,
  context: string,
  signal?: AbortSignal,
): Promise<AiReply> => {
  const { prose, stats } = splitBattleReport(narrative);
  if (!prose.trim()) return { text: narrative, source: 'local' };

  const enhanced = await requestAi({ mode: 'narrate', prompt: prose, context: `${context}\n玩家命令：${command}` }, signal);
  return enhanced.text
    ? { text: `${enhanced.text}${stats}`, source: 'cloudflare' }
    : { text: narrative, source: 'local', failure: enhanced.failure };
};

export const generateAdvisorResponse = async (
  history: Array<{ role: string; text: string }>,
  userMessage: string,
  signal?: AbortSignal,
): Promise<AiReply> => {
  const localText = localAdvisorReply(userMessage);
  const enhanced = await requestAi({ mode: 'advisor', prompt: userMessage, history: history.slice(-8) }, signal);
  return enhanced.text ? { text: enhanced.text, source: 'cloudflare' } : { text: localText, source: 'local', failure: enhanced.failure };
};

export const resetAiGatewayProbe = (): void => {
  gatewayUnavailableUntil = 0;
  previousFailure = undefined;
};

export async function interpretUnknownCommand(input: string, stats: GameStats, signal?: AbortSignal) {
  if (input.length > 300 || /confirm_|evt_resolve|card_resolve|忽略.*规则|修改.*规则|加.*[0-9]{3}/i.test(input)) return { order: null, failure: { code: 'input_rejected' } as AiFailure };
  const context = JSON.stringify({ day: stats.day, time: stats.currentTime, location: stats.location, morale: stats.morale, soldiers: stats.soldiers, wounded: stats.wounded, ammo: stats.ammo, sectorIntegrity: stats.sectorIntegrity });
  const result = await requestAi({ mode: 'intent', prompt: input, context }, signal);
  if (!result.text) return { order: null, failure: result.failure };
  try {
    const order = validateAiOrder(JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '')), stats);
    return order ? { order, failure: undefined } : { order: null, failure: { code: 'invalid_order' } as AiFailure };
  } catch { return { order: null, failure: { code: 'invalid_order' } as AiFailure }; }
}
