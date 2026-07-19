import type { EndingType, GameStats } from '../../types';

export interface CampaignScore {
  rank: string;
  text: string;
}

export const calculateCampaignScore = (stats: GameStats, endingType: EndingType): CampaignScore => {
  let rank = '尽忠职守';
  let text = '你完成了基本的守备任务，但在惨烈的战斗中损失惨重。';

  if (endingType === 'defeat_deserter') return { rank: '懦夫', text: '你在战斗初期抛弃了部队。你的名字将被钉在耻辱柱上，后世无人知晓你的下落。' };
  if (endingType === 'defeat_assault') return { rank: '勇猛的莽夫', text: '你的勇气令人敬佩，但连续出击耗尽了全营的成建制战力。作为指挥官，你选择了最壮烈也最惨痛的道路。' };
  if (endingType === 'defeat_martyr') return { rank: '民族英雄', text: '旗帜不倒，军魂永存！你们全员殉国，但那面旗帜在四行仓库上空飘扬的画面，将永远激励着中华民族！' };
  if (endingType === 'defeat_commander') return { rank: '阵前殉职', text: '你把指挥部放在了最危险的火线上。部队仍有人活着，但失去指挥官的瞬间让整条防线陷入混乱。' };
  if (endingType === 'victory_retreat') return { rank: '孤军', text: '你成功完成了掩护大部队撤退的任务，并按照命令撤入租界。虽然结局充满无奈（被英军缴械），但你保全了这支抗战的火种。' };

  const hmgSurvivors = stats.hmgSquads.reduce((sum, squad) => sum + (squad.status === 'active' ? squad.count : 0), 0);
  const totalSurvivors = stats.soldiers + stats.wounded + hmgSurvivors;
  if (totalSurvivors > 300) {
    rank = '在此封神';
    text = `奇迹！绝大多数弟兄都活了下来（${totalSurvivors}人）。击毙日军${stats.enemiesKilled}人。你的指挥艺术将被写进教科书！`;
  } else if (totalSurvivors > 200) {
    rank = '民族脊梁';
    text = `你保全了主力部队（${totalSurvivors}人），打出了国军的威风。击毙日军${stats.enemiesKilled}人。`;
  } else if (totalSurvivors > 100) {
    rank = '血战到底';
    text = `虽然伤亡过半（剩余${totalSurvivors}人），但那面旗帜始终飘扬。击毙日军${stats.enemiesKilled}人。`;
  }
  if (endingType === 'defeat_generic') text = '仓库已经失守，但你们的抵抗让日军付出了沉重代价，幸存者仍会记住这场战斗。';
  return { rank, text };
};
