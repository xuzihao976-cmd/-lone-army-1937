import { describe, expect, it } from 'vitest';
import { isExplicitRetreatCommand, isMoveCommand, normalizeCommand } from '../engine/intents';

describe('command intents', () => {
  it('normalizes punctuation and spaces', () => {
    expect(normalizeCommand('  全军，立即 撤退！ ')).toBe('全军立即撤退');
  });

  it.each(['撤退', '全军撤退', '下令撤退', '逃跑', '撤入租界'])(
    'recognizes explicit retreat: %s',
    (command) => expect(isExplicitRetreatCommand(command)).toBe(true),
  );

  it.each(['走到屋顶', '离开地下室，前往一楼', '去二楼', '撤到二楼阵地', '我们走吧'])(
    'does not turn movement into desertion: %s',
    (command) => expect(isExplicitRetreatCommand(command)).toBe(false),
  );

  it.each(['走到屋顶', '前往二楼', '撤到一楼入口'])(
    'recognizes movement with a destination: %s',
    (command) => expect(isMoveCommand(command)).toBe(true),
  );
});
