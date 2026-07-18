
export type Location = '地下室' | '一楼入口' | '二楼阵地' | '屋顶';

export interface HmgSquad {
    name: string; // "机枪一连"
    location: Location | '待命'; 
    count: number; // Specific number of men (starts at 30)
    status: 'active' | 'destroyed' | 'disbanded'; // Added 'disbanded' for ammo depletion
}

export interface Soldier {
    id: string;
    name: string;
    origin: string; // e.g. "湖北通城", "四川"
    trait: string; // e.g. "胆小", "神枪手", "老兵", "写信"
    status: 'alive' | 'dead';
    deathReason?: string;
}

export interface DilemmaOption {
    label: string;
    actionCmd: string; // The command string to send to backend
    riskText?: string;
}

export interface Dilemma {
    id: string;
    title: string;
    description: string;
    options: DilemmaOption[];
}

export interface TacticalCard {
    id: string;
    title: string;
    description: string;
    effectText: string;
    actionCmd: string;
    color: string; // 'gold' | 'red' | 'blue'
}

// NEW: Define Ending Types
export type EndingType = 
  | 'victory_hold'      // 1. 正常坚守胜利
  | 'defeat_assault'    // 2. 反攻灭亡
  | 'defeat_deserter'   // 3. 逃兵 (早期撤退)
  | 'victory_retreat'   // 4. 历史撤退 (后期撤退)
  | 'defeat_martyr'     // 5. 血染孤旗 (升旗后阵亡)
  | 'defeat_generic'    // 普通战败
  | 'ongoing';

export interface GameStats {
  location: Location;
  soldiers: number; // Healthy Riflemen/Infantry
  wounded: number;  
  woundedTimer: number; 
  
  // Dynamic Roster (New Item 1)
  roster: Soldier[];

  // Specialized Squads (The 60 men extracted)
  hmgSquads: HmgSquad[];

  morale: number; // 0-100
  minMorale: number; // Morale floor
  health: number; // 0-100 
  day: number;
  currentTime: string; 
  turnCount: number;
  lastRestTurn: number;
  rngState: number; // Seeded random state, persisted for repeatable saves
  
  // NEW MECHANICS
  tutorialStep: number; // 0: Start, 1: Need Fortify, 2: Need Supply, 3: Done
  siegeMeter: number; // 0-100, triggers attack when full
  activeTacticalCard?: TacticalCard | null;

  // Resources
  ammo: number; 
  machineGunAmmo: number; 
  grenades: number; 
  sandbags: number; 
  medkits: number; 

  // State
  hasFlagRaised: boolean;
  flagWarned: boolean; 
  enemiesKilled: number; // NEW: Track total enemies killed
  triggeredEvents: string[]; // NEW: Track IDs of unique events that have occurred
  usedTacticalCards: string[]; // NEW: Track used tactical cards
  
  // NEW: Track Aggression for Ending 2
  aggressiveCount: number; 

  soldierDistribution: Record<string, number>;

  // Fortifications
  fortificationLevel: Record<string, number>; 
  fortificationBuildCounts: Record<string, number>; 

  isGameOver: boolean;
  gameResult: EndingType; // Changed from simple string to Enum-like type
  
  // End Game Report
  finalRank?: string;
  wavesRepelled?: number;
}

export interface GameLog {
  id: string;
  sender: 'system' | 'user';
  text: string;
  isTyping?: boolean;
}

export interface GameTurnResult {
  narrative: string;
  updatedStats: Partial<GameStats>;
  eventTriggered?: 'attack' | 'new_day' | 'none' | 'game_over' | 'victory';
  visualEffect?: 'shake' | 'heavy-damage' | 'none'; 
  attackLocation?: Location | null; // NEW: Indicates which specific map node is under attack
  dilemma?: Dilemma; 
  enemyIntel?: string; 
}

export interface SaveData {
  schemaVersion: number;
  stats: GameStats;
  logs: GameLog[];
  savedAt: number;
}

export interface SaveSlotMeta {
    id: number;
    isEmpty: boolean;
    savedAt: number;
    day?: number;
    soldiers?: number;
    location?: string;
}

export interface Achievement {
    id: EndingType;
    title: string;
    icon: string;
    desc: string;
    isSecret?: boolean;
}
