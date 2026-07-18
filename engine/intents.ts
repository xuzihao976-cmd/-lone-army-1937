const RETREAT_PHRASES = new Set([
  '撤退',
  '立即撤退',
  '全军撤退',
  '下令撤退',
  '命令撤退',
  '撤离战场',
  '离开战场',
  '放弃阵地',
  '逃跑',
  '逃离',
  '撤入租界',
  '撤往租界',
]);

export const normalizeCommand = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:\s]/g, '');

/**
 * Only matches an explicit order to abandon the battlefield.
 * Movement such as “走到屋顶” or “离开地下室” must never trigger an ending.
 */
export const isExplicitRetreatCommand = (input: string): boolean => {
  const command = normalizeCommand(input);
  if (RETREAT_PHRASES.has(command)) return true;

  return /^(?:我军|全营|全军|部队|弟兄们)?(?:立即|马上)?(?:撤退|撤离战场|撤入租界|撤往租界)$/.test(command);
};

export const isMoveCommand = (input: string): boolean => {
  const command = normalizeCommand(input);
  const hasDestination = /(?:屋顶|楼顶|二楼|一楼|地下室)/.test(command);
  return hasDestination && /(?:去|前往|走到|移动到|转移到|撤到)/.test(command);
};
