import type { GameStats, GameTurnResult } from '../types';
import { createEnemyOperation, revealEnemyOperation } from './battlefield';
import { addConsequenceFlag, appendCampaignHistory } from './campaignProgress';
import { reconcileSoldierDistribution } from './roster';
import { getSectorDefenseProfile } from './strategicDefense';

type RandomSource = () => number;
type DeathRecorder = (updates: Partial<GameStats>, deaths: number, narrative: string[]) => void;

export const resolveDilemma = (
  stats: GameStats,
  eventId: string,
  optionIndex: number,
  random: RandomSource,
  recordDeaths: DeathRecorder,
): GameTurnResult => {
  const updates: Partial<GameStats> = {};
  const logs: string[] = [];
  const narrative: string[] = [];
  let text = '';
  let visualEffect: GameTurnResult['visualEffect'] = 'none';
  updates.triggeredEvents = stats.triggeredEvents.includes(eventId)
    ? stats.triggeredEvents
    : [...stats.triggeredEvents, eventId];

  if (eventId === 'student_run') {
    if (optionIndex === 0) {
      const deaths = Math.floor(random() * 16);
      const ammoUsed = Math.min(600, stats.ammo);
      updates.medkits = stats.medkits + 10;
      updates.ammo = stats.ammo - ammoUsed;
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'students_rescued');
      recordDeaths(updates, deaths, narrative);
      text = '【惨烈接应】你下令机枪全线开火压制！在弹雨中，学生们把药品扔进了窗口。但日军的掷弹筒也砸了过来……';
      logs.push('📦 获得急救包 +10', `🔻 火力接应消耗七九弹 ${ammoUsed}`);
      appendCampaignHistory(stats, updates, '学生冲桥', `火力接应成功，付出${deaths}人阵亡与${ammoUsed}发弹药的代价。`, deaths > 5 ? 'bad' : 'good');
      if (deaths > 0) {
        logs.push(`🔴 阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
        updates.morale = Math.max(0, stats.morale - deaths * 2);
      }
      visualEffect = 'heavy-damage';
    } else {
      updates.morale = Math.max(0, stats.morale - 3);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'students_abandoned');
      text = '你痛苦地闭上了眼睛，没有下令开火。眼睁睁看着那几个年轻的身影倒在桥头。';
      logs.push('💔 士气 -3');
      appendCampaignHistory(stats, updates, '学生倒在桥头', '守军为保持隐蔽拒绝接应，民间支援线未能建立。', 'bad');
    }
  } else if (eventId === 'smuggler_boat') {
    if (optionIndex === 0 && random() < 0.5) {
      const deaths = 10 + Math.floor(random() * 10);
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.morale = Math.max(0, stats.morale - deaths * 2);
      recordDeaths(updates, deaths, narrative);
      text = '【中计！】船刚靠岸，帆布揭开，露出的不是弹药，而是黑洞洞的机枪口！';
      logs.push(`🔴 伏击阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
      visualEffect = 'heavy-damage';
    } else if (optionIndex === 0) {
      updates.ammo = stats.ammo + 3000;
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'smuggler_trusted');
      text = '【惊险交易】对方收了“金条”，把几个沉重的木箱推上了岸。里面是成排的七九步枪弹！';
      logs.push('📦 获得七九弹 +3000');
      appendCampaignHistory(stats, updates, '私枭交易成功', '取得3000发七九弹，并建立了一条不稳定的水路联系。', 'good');
    } else text = '“滚！”你朝天鸣枪。小船迅速消失在迷雾中。';
  } else if (eventId === 'puppet_defector') {
    if (optionIndex === 0 && random() < 0.3) {
      const oldLevel = stats.fortificationLevel['一楼入口'];
      const newLevel = Math.max(0, oldLevel - 1);
      const before = Math.round(getSectorDefenseProfile(stats, '一楼入口').mitigation * 100);
      updates.fortificationLevel = { ...stats.fortificationLevel, '一楼入口': newLevel };
      updates.fortificationBuildCounts = {
        ...stats.fortificationBuildCounts,
        '一楼入口': Math.min(stats.fortificationBuildCounts['一楼入口'] || oldLevel * 2, newLevel * 2 + 1),
      };
      const afterState = { ...stats, fortificationLevel: updates.fortificationLevel, fortificationBuildCounts: updates.fortificationBuildCounts };
      const after = Math.round(getSectorDefenseProfile(afterState, '一楼入口').mitigation * 100);
      text = '【自杀袭击】那几个伪军突然拉响了身上的炸药包！巨大的爆炸震塌了仓库的一角。';
      logs.push(`🏚️ 一楼掩体被炸开: 实际减伤 ${before}% → ${after}%`);
      visualEffect = 'heavy-damage';
    } else if (optionIndex === 0) {
      updates.grenades = stats.grenades + 50;
      text = '他们是真的投诚。这几名伪军哭着跪在地上，把带来的手榴弹交给了我们。';
      logs.push('📦 获得手榴弹 +50');
    } else {
      updates.morale = Math.max(0, stats.morale - 2);
      text = '为了安全起见，你下令射击。几具尸体倒在门外。';
    }
  } else if (eventId === 'wrecked_truck') {
    if (optionIndex === 0) {
      const deaths = Math.floor(random() * 5) + 1;
      updates.ammo = stats.ammo + 2000;
      updates.soldiers = Math.max(0, stats.soldiers - deaths);
      updates.morale = Math.max(0, stats.morale - deaths * 2);
      recordDeaths(updates, deaths, narrative);
      text = '【生死抢运】烟雾弹掩护下，突击小组冲了出去。日军狙击手击倒了几名弟兄，但弹药箱被成功拖回。';
      logs.push('📦 获得七九弹 +2000', `🔴 阵亡: ${deaths}人`, `💔 士气 -${deaths * 2}`);
    } else {
      updates.morale = Math.max(0, stats.morale - 2);
      text = '你放下了望远镜。那几箱弹药不值得用人命去填。';
      logs.push('💔 士气 -2');
    }
  } else if (eventId === 'stray_airdrop') {
    if (optionIndex === 0 && random() > 0.3) {
      updates.medkits = stats.medkits + 5;
      updates.sandbags = stats.sandbags + 100;
      updates.morale = Math.min(100, stats.morale + 5);
      text = '【绝技】小战士徒手爬上避雷针，割断绳索，带着补给包安全滑下。大家爆发出欢呼！';
      logs.push('📦 获得急救包 +5', '📦 获得工事材料 +100', '💪 士气 +5');
    } else if (optionIndex === 0) {
      updates.soldiers = Math.max(0, stats.soldiers - 1);
      updates.morale = Math.max(0, stats.morale - 5);
      recordDeaths(updates, 1, narrative);
      text = '【坠落】一阵横风吹过，战士脚下一滑，从三楼坠落，补给包也摔散了。';
      logs.push('🔴 意外坠亡: 1人', '💔 士气 -5');
    } else {
      updates.sandbags = stats.sandbags + 50;
      text = '神枪手一枪打断绳索。药品摔碎了，但工兵仍捡回一批可用材料。';
      logs.push('📦 获得工事材料 +50');
    }
  } else if (eventId === 'brit_ceasefire') {
    if (optionIndex === 0) {
      updates.morale = Math.max(0, stats.morale - 5);
      updates.medkits = stats.medkits + 5;
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_ceasefire_accepted');
      text = '【妥协】你咬着牙下令：“朝南面打的枪，都给我停了！”英军随后送来少量药品。';
      logs.push('💔 士气 -5', '📦 获得急救包 +5');
      appendCampaignHistory(stats, updates, '接受英军停火要求', '南侧火力受限，但换得5份急救物资。', 'neutral');
    } else {
      const operation = stats.enemyOperation || createEnemyOperation(stats, random);
      updates.morale = Math.min(100, stats.morale + 5);
      updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_defied');
      updates.enemyOperation = { ...operation, target: '地下室', routeName: '苏州河岸 → 地下室侧墙', turnsRemaining: Math.max(1, operation.turnsRemaining - 1) };
      text = '【强硬】“这也是中国领土！”你拒绝了英军的要求。';
      logs.push('💪 士气 +5');
      appendCampaignHistory(stats, updates, '拒绝英军通牒', '士气提高，但南侧联络被封锁，地下室侧翼攻势提前。', 'neutral');
    }
  } else if (eventId === 'student_thanks') {
    updates.medkits = stats.medkits + 8;
    updates.morale = Math.min(100, stats.morale + 8);
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'student_support_arrived');
    text = '【河对岸的回声】学生们没有忘记守军。地下交通员从排水口送来药品，河对岸也亮起支持孤军的灯光。';
    logs.push('📦 急救包 +8', '💪 士气 +8');
    appendCampaignHistory(stats, updates, '民众支援抵达', '此前救下的学生带来了药品和来自租界的声援。', 'good');
  } else if (eventId === 'smuggler_return') {
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'smuggler_network_resolved');
    if (optionIndex === 0 && stats.ammo >= 300) {
      updates.ammo = stats.ammo - 300;
      updates.machineGunAmmo = stats.machineGunAmmo + 1800;
      text = '【水路接力】守军用步枪火力遮断巡逻队，小船贴着阴影完成卸货。此前的信任终于换成真正的重火力补给。';
      logs.push('🔻 七九弹 -300', '📦 机枪弹 +1800');
      appendCampaignHistory(stats, updates, '水路补给线', '掩护私枭撤离，获得1800发机枪弹。', 'good');
    } else {
      text = '你拒绝继续拿弟兄们的命赌这条水路。小船熄灯离开，此后再也没有出现。';
      appendCampaignHistory(stats, updates, '中止水路联系', '选择保存火力，放弃后续机枪弹补给。', 'neutral');
    }
  } else if (eventId === 'british_pressure') {
    const materialUsed = Math.min(120, stats.sandbags);
    const operation = stats.enemyOperation || createEnemyOperation(stats, random);
    updates.sandbags = stats.sandbags - materialUsed;
    updates.consequenceFlags = addConsequenceFlag(stats.consequenceFlags, 'british_pressure_resolved');
    updates.enemyOperation = revealEnemyOperation({ ...operation, target: '地下室', routeName: '苏州河岸 → 地下室侧墙', turnsRemaining: Math.min(2, operation.turnsRemaining) });
    text = '【侧翼预警】工兵把木料和沙袋运往地下室侧墙。代价不小，但敌军企图已经被标在作战图上。';
    logs.push(`🧱 工事材料 -${materialUsed}`);
    appendCampaignHistory(stats, updates, '南侧封锁的代价', '地下室侧翼攻势提前，但守军取得完整预警。', 'bad');
  }

  // Event casualties bypass the normal turn finalizer, so reconcile the map
  // immediately instead of leaving total strength and floor garrisons out of
  // sync until the player's next timed action.
  if (typeof updates.soldiers === 'number') {
    updates.soldierDistribution = reconcileSoldierDistribution(
      updates.soldierDistribution || stats.soldierDistribution,
      updates.soldiers,
      stats.location,
    );
  }

  const fullNarrative = `${text}${narrative.length ? `\n${narrative.join('')}` : ''}${logs.length ? `\n\n${logs.join('\n')}` : ''}`;
  return { narrative: fullNarrative, updatedStats: updates, eventTriggered: 'none', visualEffect };
};
