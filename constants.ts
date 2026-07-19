
import { GameStats, Soldier, Achievement } from './types';

const INITIAL_ROSTER: Soldier[] = [
    { id: 's1', name: '陈树生', origin: '湖北', trait: '敢死队', status: 'alive' },
    { id: 's2', name: '杨瑞符', origin: '天津', trait: '指挥官', status: 'alive' },
    { id: 's3', name: '万连卿', origin: '湖北', trait: '神枪手', status: 'alive' },
    { id: 's4', name: '石大力', origin: '山东', trait: '大力士', status: 'alive' },
    { id: 's5', name: '朱胜忠', origin: '湖北', trait: '暴躁', status: 'alive' },
    { id: 's6', name: '齐家铭', origin: '四川', trait: '老兵', status: 'alive' },
    { id: 's7', name: '唐棣', origin: '湖南', trait: '文书', status: 'alive' },
    { id: 's8', name: '雷雄', origin: '湖北', trait: '机枪手', status: 'alive' },
    { id: 's9', name: '小湖北', origin: '湖北', trait: '胆小', status: 'alive' },
    { id: 's10', name: '老葫芦', origin: '河南', trait: '厨师', status: 'alive' },
    { id: 's11', name: '王看山', origin: '浙江', trait: '观察员', status: 'alive' },
    { id: 's12', name: '李铁柱', origin: '河北', trait: '工兵', status: 'alive' },
];

export const INITIAL_STATS: GameStats = {
  location: '一楼入口',
  
  // 兵力重组：总数414
  // 步兵: 354
  // 机枪连: 60 (2支队伍 x 30人)
  soldiers: 354, 
  wounded: 0, 
  woundedTimer: 0, 
  
  roster: INITIAL_ROSTER,

  hmgSquads: [
      { name: '机枪一连', location: '一楼入口', count: 30, status: 'active' },
      { name: '机枪二连', location: '二楼阵地', count: 30, status: 'active' }
  ],
  specialistSquads: [
    { id: 'veteran', name: '湖北老兵班', role: 'veteran', location: '二楼阵地', count: 18, status: 'active' },
    { id: 'engineer', name: '工兵抢修组', role: 'engineer', location: '一楼入口', count: 12, status: 'active' },
    { id: 'medic', name: '战地救护组', role: 'medic', location: '地下室', count: 10, status: 'active' },
    { id: 'assault', name: '敢死突击组', role: 'assault', location: '一楼入口', count: 16, status: 'active' },
  ],

  morale: 80, // Start slightly lower for tutorial growth
  minMorale: 0, 
  health: 100,
  day: 0, // Start at Day 0 (Prologue)
  currentTime: "19:00", 
  turnCount: 0,
  lastRestTurn: 0,
  lastAttackTurn: -99,
  rngState: 19371026,
  lastStandUsed: false,
  fatigue: 12,
  searchExhaustion: 0,
  speechStreak: 0,
  reconBonus: 0,
  
  // New Mechanics Init
  tutorialStep: 0,
  siegeMeter: 10, // Starts low
  activeTacticalCard: null,
  
  // 资源修正
  ammo: 20000,
  machineGunAmmo: 8000,
  grenades: 500,
  sandbags: 2600,
  medkits: 40,          

  hasFlagRaised: false,
  flagWarned: false,
  enemiesKilled: 0,
  triggeredEvents: [],
  usedTacticalCards: [],
  consequenceFlags: [],
  campaignHistory: [],
  enemyOperation: {
    id: 1,
    target: '一楼入口',
    routeName: '北侧废墟 → 一楼正门',
    attackType: 'INFANTRY',
    scale: 'SMALL',
    turnsRemaining: 7,
    revealed: false,
    confidence: 25,
  },
  aggressiveCount: 0, // New Stat for Ending 2
  
  // 步兵分布 
  soldierDistribution: {
    '一楼入口': 140, 
    '二楼阵地': 180, 
    '屋顶': 10,      
    '地下室': 24     
  },

  sectorIntegrity: {
    '一楼入口': 100,
    '二楼阵地': 100,
    '屋顶': 100,
    '地下室': 100,
  },
  sealedApproaches: [],

  fortificationLevel: {
    '一楼入口': 1,
    '二楼阵地': 1,
    '屋顶': 0,
    '地下室': 3
  },
  
  fortificationBuildCounts: {
    '一楼入口': 2,
    '二楼阵地': 2,
    '屋顶': 0,
    '地下室': 6 
  },

  isGameOver: false,
  gameResult: 'ongoing',
  gameOverReason: undefined,
};

export const ACHIEVEMENTS: Achievement[] = [
    {
        id: 'victory_hold',
        title: '固若金汤',
        icon: '🏰',
        desc: '达成条件：坚持防守直到第6天。'
    },
    {
        id: 'victory_retreat',
        title: '孤军撤退',
        icon: '🌉',
        desc: '达成条件：在第4天后奉命撤入租界（历史结局）。'
    },
    {
        id: 'defeat_assault',
        title: '反攻的号角',
        icon: '⚔️',
        desc: '达成条件：频繁主动出击（突袭/夜袭），直到成建制战力崩溃。'
    },
    {
        id: 'defeat_martyr',
        title: '血染孤旗',
        icon: '🇹🇼',
        desc: '达成条件：升起国旗后，力战殉国。'
    },
    {
        id: 'defeat_commander',
        title: '将星陨落',
        icon: '✦',
        desc: '达成条件：指挥官所在防区遭袭，并在炮火中阵亡。',
        isSecret: true
    },
    {
        id: 'defeat_deserter',
        title: '懦夫',
        icon: '🏳️',
        desc: '达成条件：在战斗初期（第0-1天）试图逃跑。',
        isSecret: true
    }
];
