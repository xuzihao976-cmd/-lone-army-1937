import { localAdvisorResponse } from '../engine/localAdvisor';
import type { GameStats } from '../types';
import { validateAiOrder } from './aiOrders';
export interface AiFailure { code: 'unconfigured' | 'timeout' | 'network' | 'http' | 'invalid_response' | 'invalid_order' | 'input_rejected' | 'cancelled'; status?: number; upstreamCode?: number; gatewayCode?: string; }
const DASHSCOPE_ERRORS: Record<string, string> = {
  dashscope_key_missing: '百炼千问尚未配置服务端 API Key，暂未连接。',
  dashscope_free_only_unconfirmed: '尚未确认百炼“免费额度用完即停”已开启，已暂停模型调用。',
  dashscope_free_quota_exhausted: '百炼免费额度已耗尽或失效，免费额度保护已停止调用。',
  dashscope_access_denied: '百炼拒绝调用，请检查北京地域 API Key 和模型权限。',
  dashscope_unavailable: '百炼服务暂时不可用或请求受限，已回退本地。',
  dashscope_timeout: '百炼请求等待超过 7 秒，已停止等待。',
};
export const describeAiFailure = (failure: AiFailure): string => {
  if (failure.code === 'http') {
    if (failure.gatewayCode && Object.hasOwn(DASHSCOPE_ERRORS, failure.gatewayCode)) return DASHSCOPE_ERRORS[failure.gatewayCode];
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
      if (details && typeof details.error === 'string' && (Object.hasOwn(DASHSCOPE_ERRORS, details.error) || ['ai_binding_missing', 'ai_inference_failed', 'invalid_model_reply', 'empty_model_reply'].includes(details.error))) failure.gatewayCode = details.error;
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
  history: Array<{ role: string; text: string }>, userMessage: string, signal?: AbortSignal,
  options: { stats?: GameStats; enabled?: boolean } = {},
): Promise<AiReply> => {
  const local = localAdvisorResponse(userMessage, options.stats, history.length);
  if (options.enabled !== true || local.known) return {text:local.text,source:'local'};
  const enhanced = await requestAi({mode:'advisor',prompt:userMessage,history:history.slice(-8)}, signal);
  return enhanced.text ? {text:enhanced.text,source:'cloudflare'} : {text:local.text,source:'local',failure:enhanced.failure};
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
