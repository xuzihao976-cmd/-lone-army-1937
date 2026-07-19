
// 事件、卡牌、情报文本库
import { Dilemma, TacticalCard } from "../../types";

export const NEW_SUPPLY_DILEMMAS: Dilemma[] = [
    {
        id: 'student_run',
        title: '学生冲桥',
        description: '【高风险补给】一群爱国学生和童子军扛着巨大的包裹，正试图冲过新垃圾桥！日军的机枪已经调转枪口。如果【接应】，必须用火力压制日军，这会暴露我们的位置并遭到反击。如果不接应，他们必死无疑。',
        options: [
            { label: '火力接应', actionCmd: 'EVT_RESOLVE:student_run:0', riskText: '七九弹最多-600 | 急救包+10 | 阵亡0-15人 | 建立民间支援线' },
            { label: '含泪拒止', actionCmd: 'EVT_RESOLVE:student_run:1', riskText: '士气 -3' }
        ]
    },
    {
        id: 'smuggler_boat',
        title: '私枭闯关',
        description: '【极高风险补给】几个江湖气息浓重的人划着小船靠近，声称只要给“金条”，就送上一批七九步枪弹。这可能是日军的陷阱，也可能是唯一的补给机会。',
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
            { label: '严词拒绝', actionCmd: 'EVT_RESOLVE:brit_ceasefire:1', riskText: '士气+5 | 后续侧翼攻势提前' }
        ]
    },
    {
        id: 'student_thanks',
        title: '河对岸的回声',
        description: '被救下的学生把仓库仍在坚守的消息传遍租界。苏州河对岸亮起手电和标语，地下交通员也趁乱送来一批药品。',
        requiresFlag: 'students_rescued',
        excludesFlag: 'student_support_arrived',
        minDay: 2,
        options: [
            { label: '接受民众支援', actionCmd: 'EVT_RESOLVE:student_thanks:0', riskText: '急救包+8 | 士气+8' },
        ]
    },
    {
        id: 'smuggler_return',
        title: '私枭再度靠岸',
        description: '那条熟悉的小船再次出现在雾里。对方记得上一次交易，也知道日军巡逻的空隙；这次他们愿意送来机枪弹，但要求守军掩护撤离。',
        requiresFlag: 'smuggler_trusted',
        excludesFlag: 'smuggler_network_resolved',
        minDay: 3,
        options: [
            { label: '掩护运输线', actionCmd: 'EVT_RESOLVE:smuggler_return:0', riskText: '机枪弹+1800 | 七九弹-300' },
            { label: '不再冒险', actionCmd: 'EVT_RESOLVE:smuggler_return:1', riskText: '无物资 | 保持隐蔽' },
        ]
    },
    {
        id: 'british_pressure',
        title: '租界侧翼压力',
        description: '拒绝停火的消息传开后，英军封锁了南侧联络点。日军侦察队趁机沿苏州河岸接近地下室外墙，下一轮侧翼攻势已经提前。',
        requiresFlag: 'british_defied',
        excludesFlag: 'british_pressure_resolved',
        minDay: 3,
        options: [
            { label: '立即转移防务', actionCmd: 'EVT_RESOLVE:british_pressure:0', riskText: '预警地下室袭击 | 工事材料-120' },
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
        actionCmd: 'CARD_RESOLVE:morale_boost',
        color: 'gold'
    },
    {
        id: 'reinforce',
        title: '孤胆英雄',
        description: '几名散兵游勇冲破封锁线加入了我们。虽然人少，但都是老兵。',
        effectText: '士兵+5',
        actionCmd: 'CARD_RESOLVE:reinforce',
        color: 'blue'
    },
    {
        id: 'supplies',
        title: '意外物资',
        description: '我们在清理废墟时发现了一个被遗忘的军火箱。',
        effectText: '弹药+500',
        actionCmd: 'CARD_RESOLVE:supplies',
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
