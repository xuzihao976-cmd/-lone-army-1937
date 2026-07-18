
// 事件、卡牌、情报文本库
import { Dilemma, TacticalCard } from "../../types";

export const NEW_SUPPLY_DILEMMAS: Dilemma[] = [
    {
        id: 'student_run',
        title: '学生冲桥',
        description: '【高风险补给】一群爱国学生和童子军扛着巨大的包裹，正试图冲过新垃圾桥！日军的机枪已经调转枪口。如果【接应】，必须用火力压制日军，这会暴露我们的位置并遭到反击。如果不接应，他们必死无疑。',
        options: [
            { label: '火力接应', actionCmd: 'EVT_RESOLVE:student_run:0', riskText: '获得医疗包x10 | 阵亡 0-15 人' },
            { label: '含泪拒止', actionCmd: 'EVT_RESOLVE:student_run:1', riskText: '士气 -3' }
        ]
    },
    {
        id: 'smuggler_boat',
        title: '私枭闯关',
        description: '【极高风险补给】几个江湖气息浓重的人划着小船靠近，声称只要给“金条”（大量弹药交换），就送上一批重机枪子弹。这可能是日军的陷阱，也可能是唯一的补给机会。',
        options: [
            { label: '冒险交易', actionCmd: 'EVT_RESOLVE:smuggler_boat:0', riskText: '获得弹药x3000 | 可能遭遇伏击(阵亡10+)' },
            { label: '开枪驱离', actionCmd: 'EVT_RESOLVE:smuggler_boat:1', riskText: '无影响' }
        ]
    },
    {
        id: 'puppet_defector',
        title: '伪军投诚',
        description: '【中风险补给】几名穿着伪军制服的人举着白旗靠近，背着沉重的箱子。“别开枪！是中国人！”他们声称是来送手榴弹的。如果是诈降，我们会被炸上天。',
        options: [
            { label: '放行进入', actionCmd: 'EVT_RESOLVE:puppet_defector:0', riskText: '获得手榴弹x50 | 或 仓库被炸(防御降级)' },
            { label: '射杀勿论', actionCmd: 'EVT_RESOLVE:puppet_defector:1', riskText: '士气 -2' }
        ]
    },
    {
        id: 'wrecked_truck',
        title: '损毁卡车',
        description: '【弹药补给】观察哨报告：一辆国军撤退时遗弃的运输车侧翻在距离大门50米的弹坑旁。望远镜显示车厢里有几箱未开封的七九弹。日军狙击手正盯着那个位置。',
        options: [
            { label: '烟雾掩护抢运', actionCmd: 'EVT_RESOLVE:wrecked_truck:0', riskText: '获得大量弹药 | 阵亡 1-5 人' },
            { label: '风险太大，放弃', actionCmd: 'EVT_RESOLVE:wrecked_truck:1', riskText: '士气 -2' }
        ]
    },
    {
        id: 'stray_airdrop',
        title: '偏离的空投',
        description: '【意外物资】一架试图飞越租界的飞机抛下了一个补给包，但风向不对，挂在了仓库外墙三楼摇摇欲坠的避雷针上。',
        options: [
            { label: '攀爬取回', actionCmd: 'EVT_RESOLVE:stray_airdrop:0', riskText: '获得全套物资 | 士兵可能坠亡' },
            { label: '开枪击落', actionCmd: 'EVT_RESOLVE:stray_airdrop:1', riskText: '物资减半 | 安全' }
        ]
    }
];

export const ALL_DILEMMAS = [
    ...NEW_SUPPLY_DILEMMAS,
    {
        id: 'brit_ceasefire',
        title: '英军通牒',
        description: '公共租界英军指挥官派人传来口信：“贵军的流弹多次落入租界，引起了外籍人士的恐慌。请立即停止向苏州河方向射击，否则我们将采取强制措施。”',
        options: [
            { label: '答应要求', actionCmd: 'EVT_RESOLVE:brit_ceasefire:0', riskText: '士气-5 | 获得急救包x5' },
            { label: '严词拒绝', actionCmd: 'EVT_RESOLVE:brit_ceasefire:1', riskText: '士气+5 | 侧翼受袭概率增加' }
        ]
    }
];

export const MUTINY_SCENES = [
    "【哗变风险】绝望的情绪在蔓延。几个士兵扔下了武器，试图从后门逃跑，被督战队当场制服。",
    "【士气崩溃】“守不住了！都要死在这里！”一名精神崩溃的士兵大喊大叫，引发了一阵骚乱。",
    "【逃兵】趁着夜色，几名士兵试图游过苏州河，却被日军巡逻艇发现射杀。"
];

export const TACTICAL_CARDS: TacticalCard[] = [
    {
        id: 'morale_boost',
        title: '家书抵万金',
        description: '一名邮差冒死送来了几封家书。战士们读着信，泪流满面，士气大振。',
        effectText: '士气+15',
        actionCmd: '演讲', 
        color: 'gold'
    },
    {
        id: 'reinforce',
        title: '孤胆英雄',
        description: '几名散兵游勇冲破封锁线加入了我们。虽然人少，但都是老兵。',
        effectText: '士兵+5',
        actionCmd: '加固一楼', 
        color: 'blue'
    },
    {
        id: 'supplies',
        title: '意外物资',
        description: '我们在清理废墟时发现了一个被遗忘的军火箱。',
        effectText: '弹药+500',
        actionCmd: '整理补给', 
        color: 'gold'
    }
];

export const ENEMY_INTEL_BY_DAY: Record<number, string> = {
    0: "日军动向不明，似乎正在集结。",
    1: "日军第六师团先头部队已到达，正在试探我军火力。",
    2: "日军增兵了，看来他们准备发动全面进攻。",
    3: "敌军调来了装甲车和平射炮，形势严峻。",
    4: "日军已将我军完全包围，并在苏州河对岸架设了机枪。",
    5: "日军似乎失去了耐心，可能会动用重武器进行毁灭性打击。",
    6: "日军已成强弩之末，但我们也到了极限。"
};
