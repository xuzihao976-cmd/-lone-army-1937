export type AiMode = 'narrate' | 'freeform' | 'advisor';
export type AiSource = 'siliconflow' | 'local';

export interface AiReply {
  text: string;
  source: AiSource;
}

interface AiRequest {
  mode: AiMode;
  prompt: string;
  context?: string;
  history?: Array<{ role: string; text: string }>;
}

const REQUEST_TIMEOUT_MS = 8_000;
let gatewayUnavailableUntil = 0;
const isStaticHosting = () => typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

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

const requestAi = async (request: AiRequest, signal?: AbortSignal): Promise<string | null> => {
  // GitHub Pages cannot host a protected server-side API. Skip the request
  // entirely there so the UI never waits for an endpoint that cannot exist.
  if (isStaticHosting()) return null;
  if (Date.now() < gatewayUnavailableUntil) return null;

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    gatewayUnavailableUntil = Date.now() + 30_000;
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => timeoutController.abort();
  if (signal?.aborted) timeoutController.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: timeoutController.signal,
    });

    if ([404, 405, 501, 503].includes(response.status)) {
      gatewayUnavailableUntil = Number.POSITIVE_INFINITY;
    } else if (!response.ok) {
      gatewayUnavailableUntil = Date.now() + 60_000;
    }
    if (!response.ok) return null;

    const data = (await response.json()) as { text?: unknown };
    return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
  } catch {
    if (!timeoutController.signal.aborted) gatewayUnavailableUntil = Date.now() + 15_000;
    return null;
  } finally {
    window.clearTimeout(timeoutId);
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
  return enhanced
    ? { text: `${enhanced}${stats}`, source: 'siliconflow' }
    : { text: narrative, source: 'local' };
};

export const generateAdvisorResponse = async (
  history: Array<{ role: string; text: string }>,
  userMessage: string,
  signal?: AbortSignal,
): Promise<AiReply> => {
  const localText = localAdvisorReply(userMessage);
  const enhanced = await requestAi({ mode: 'advisor', prompt: userMessage, history: history.slice(-8) }, signal);
  return enhanced ? { text: enhanced, source: 'siliconflow' } : { text: localText, source: 'local' };
};

export const resetAiGatewayProbe = (): void => {
  gatewayUnavailableUntil = 0;
};
