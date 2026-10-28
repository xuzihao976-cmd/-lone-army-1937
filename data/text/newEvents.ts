import type { Dilemma } from '../../types';

/** Fictional encounters; quantities and targeted state come from the shared plan. */
export const NEW_CHAPTER_EVENTS: Dilemma[] = [
  {
    id: 'street_corner', chapterId: 'street', title: '坍下的转角',
    description: '砖从内巷转角滑下来，把原先能并肩走的地方填住了。带路的兵伸手拦了一下，没让身后的人往前挤。“清出一条道，还是走查过的河边？”他回头等你的话。（虚构战场情境。）',
    options: [
      { label: '清障，保留内巷', actionCmd: 'EVT_RESOLVE:street_corner:0', riskText: '清开现有障碍，不新增护送人数；下一次护送仍按内巷耗时' },
      { label: '改走已查明的沿河线', actionCmd: 'EVT_RESOLVE:street_corner:1', riskText: '沿河护送15分钟，暴露压力更高；内巷障碍仍在，可另行清理' },
    ],
  },
  {
    id: 'wall_knocking', chapterId: 'street', title: '墙那边的敲击',
    description: '一面隔墙后传来敲击。队伍停下来，听见里面也停了；有人试着叫了一声，那边又响了两下。登记上还有没找到的人，现在还不能把这几声写成“救出来了”。（虚构战场情境。）',
    options: [
      { label: '停下来核实搜救', actionCmd: 'EVT_RESOLVE:wall_knocking:0', riskText: '找到登记中尚未找到的1人；仍需另行护送，不增加十二人总数' },
      { label: '继续既定撤收', actionCmd: 'EVT_RESOLVE:wall_knocking:1', riskText: '不扣士气；未核实对方身份与去向，不记作死亡' },
    ],
  },
  {
    id: 'beam_creak', title: '承重梁的响声', minDay: 1,
    description: '炮击后，受损楼层的墙缝里还在落灰。抢修的人按住一段松动的支撑：“能从挡弹工事里拆些木料来顶。可那一面，就得薄下去。”他没有动手，先让人把附近停下。（虚构战场情境。）',
    options: [
      { label: '拆用现成工事，支撑结构', actionCmd: 'EVT_RESOLVE:beam_creak:0', riskText: '本层工事降低一档，完整度最多恢复8点；不消耗额外材料，不恢复敌占楼层' },
      { label: '保留挡弹工事', actionCmd: 'EVT_RESOLVE:beam_creak:1', riskText: '不扣资源；完整度维持现状，承受其已有风险' },
    ],
  },
  {
    id: 'wet_medicine', title: '渗水的药箱', minDay: 1,
    description: '地下室的水沿着药箱外角往下滴。守箱的人掀起外层纸，立刻又盖住，把还干着的部分往里推。“给我腾个干地方，成吗？再放着，这批就保不住了。”（虚构战场情境。）',
    options: [
      { label: '搬移整理，保住现有药品', actionCmd: 'EVT_RESOLVE:wet_medicine:0', riskText: '保留现有库存；不产生新药品，也不等于完成治疗' },
      { label: '先顾阵位，接受药品报废', actionCmd: 'EVT_RESOLVE:wet_medicine:1', riskText: '不耗时；按当前库存报废最多2份急救包，不虚增伤亡' },
    ],
  },
  {
    id: 'hmg_jam', title: '拉不动的机柄', minDay: 1,
    description: '刚结束射击的枪位传来报告：机柄卡住了。枪组长让人停手，没有继续硬拉。“人都在，枪眼下不能用。给我们时间查一遍，还是先靠步枪守着？”（虚构战场情境。）',
    options: [
      { label: '现在停射检修', actionCmd: 'EVT_RESOLVE:hmg_jam:0', riskText: '恢复本次故障枪；不消耗未建模的零件，检修仍推进战场' },
      { label: '暂缓检修，以步枪接替', actionCmd: 'EVT_RESOLVE:hmg_jam:1', riskText: '故障保留，人员仍在；该枪无射击、减伤或指挥官掩护收益，可稍后检修' },
    ],
  },
];
