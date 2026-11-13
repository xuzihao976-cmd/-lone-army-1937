import type { EndingType, GameStats } from '../../types';

export interface CampaignScore {
  rank: string;
  text: string;
}

export const calculateCampaignScore = (stats: GameStats, endingType: EndingType): CampaignScore => {
  const hmgSurvivors = stats.hmgSquads.reduce((sum, squad) => sum + (squad.status === 'active' ? squad.count : 0), 0);
  const totalSurvivors = stats.soldiers + stats.wounded + hmgSurvivors;
  const record = `当前记录：步兵${stats.soldiers}人，现役机枪人员${hmgSurvivors}人，待治伤员${stats.wounded}人，合计${totalSurvivors}人；累计毙敌${stats.enemiesKilled}人。专业小队已包含在步兵中，失散者的后续不在这份记录内。`;
  let rank = '尽忠职守';
  let text = '坚守的结果已经记下。留下多少人，就还要为多少人的下一步作安排。';

  if (endingType === 'defeat_deserter') return { rank: '擅离阵地', text: `你在战斗初期确认撤离，未完成守备任务。对这道命令的评价，不等于已经判定人员死亡。\n${record}` };
  if (endingType === 'defeat_assault') return { rank: '反攻失利', text: `主动出击未能挽回本局防守，结局由实际溃败条件触发；不能用勇敢抵消指挥的代价。\n${record}` };
  if (endingType === 'defeat_martyr') return { rank: '孤旗为证', text: `本局曾升起国旗，最后可战力量归零。伤员与失散人员分别登记，不据此宣称全员阵亡。\n${record}` };
  if (endingType === 'defeat_commander') return { rank: '阵前殉职', text: `指挥官在所在防区遭袭阵亡，本局防守随指挥中断而结束。其余人员不随这一死讯一并记作阵亡。\n${record}` };
  if (endingType === 'victory_retreat') return { rank: '奉命撤离', text: `守军进入撤入租界的结局。走出仓库并不是所有苦难的终点，仍活着的人也不应被要求为幸存而羞愧。\n${record}` };

  if (totalSurvivors > 300) {
    rank = '守住归途';
    text = '任务到期时，现有记录仍留下较多人手。往后的路不能替他们许诺，眼下至少还可以逐个听见回答。';
  } else if (totalSurvivors > 200) {
    rank = '负重坚守';
    text = '防务撑到了期限，现有队伍仍有可以交接的人手。胜利的字写下去，清点与救护却不能跟着停。';
  } else if (totalSurvivors > 100) {
    rank = '血战余生';
    text = '任务已经到期，现有人员仍按实数登记。每一个还在的人，都有资格继续想念战场以外的生活。';
  }
  if (endingType === 'defeat_generic') text = '兵力或核心阵地已无法支持继续防守。失败条件与现存人员分别记录，不能把一场失守写成所有人的死亡。';
  return { rank, text: `${text}\n${record}` };
};
