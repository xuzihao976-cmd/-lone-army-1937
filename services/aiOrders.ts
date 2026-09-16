import type { GameStats, Location } from '../types';

export const AI_ACTIONS = {
  rapid: '猛烈射击', conserve: '节约弹药', close: '近距开火', bayonet: '刺刀准备', hold: '死守阵位',
  encourage: '振作起来', scout: '侦察敌情', heal: '治疗伤员', rest: '休息整顿', build: '加固', move: '前往',
} as const;
const FLOORS: Location[] = ['屋顶', '二楼阵地', '一楼入口', '地下室'];
export interface AiOrder { command?: string; reply: string; }

/** Model output is never a raw engine command. No retreats, cards or event IDs. */
export function validateAiOrder(value: unknown, stats: GameStats): AiOrder | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = value as Record<string, unknown>;
  if (x.type === 'chat' || x.type === 'clarify') {
    return typeof x.reply === 'string' && x.reply.length <= 400 ? { reply: x.reply } : null;
  }
  if (x.type !== 'order' || typeof x.action !== 'string' || !Object.hasOwn(AI_ACTIONS, x.action)) return null;
  if (typeof x.confidence !== 'number' || !Number.isFinite(x.confidence) || x.confidence < 0.85 || x.confidence > 1) return null;
  const action = x.action as keyof typeof AI_ACTIONS;
  const needsTarget = ['rapid', 'conserve', 'close', 'bayonet', 'hold', 'build', 'move'].includes(action);
  if (needsTarget && !FLOORS.includes(x.target as Location)) return { reply: '请明确指定屋顶、二楼、一楼或地下室，尚未执行。' };
  const target = x.target as Location;
  if (needsTarget && stats.sectorIntegrity[target] <= 0) return { reply: `${target}已失守，无法直接执行这项命令。` };
  const command = needsTarget ? `${AI_ACTIONS[action]}${target}` : AI_ACTIONS[action];
  return { command, reply: `副官理解为“${command}”。请核对预计耗时与风险，确认后才执行。` };
}
