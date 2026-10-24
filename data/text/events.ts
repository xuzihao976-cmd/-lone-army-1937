
// 事件、战地际遇、情报文本库。旧导出名保留以读取已有存档。
import { Dilemma, TacticalCard } from "../../types";

export const NEW_SUPPLY_DILEMMAS: Dilemma[] = [
    {
        id: 'student_run',
        title: '学生冲桥',
        description: '桥头有人举着药品包，隔着枪声朝仓库喊。是来送东西的学生和童子军，跑到一半不敢再动。接应要动用守军火力，也可能付出人命；不接应，就得让他们自行寻找退路。副官没有替你说哪一种比较轻。',
        options: [
            { label: '火力接应', actionCmd: 'EVT_RESOLVE:student_run:0', riskText: '七九弹最多-600 | 急救包+10 | 阵亡0-15人 | 建立民间支援线' },
            { label: '不作火力接应', actionCmd: 'EVT_RESOLVE:student_run:1', riskText: '士气 -3' }
        ]
    },
    {
        id: 'smuggler_boat',
        title: '私枭闯关',
        description: '【极高风险补给】河面一条小船靠近，来人压着嗓子说有七九弹，要求守军让他们靠岸卸货。帆布底下是什么，岸上看不清。对方催得急，副官却把手按在放行簿上，等你决定。',
        options: [
            { label: '冒险交易', actionCmd: 'EVT_RESOLVE:smuggler_boat:0', riskText: '七九弹+3000，或遭伏击阵亡10—19人' },
            { label: '拒绝靠岸', actionCmd: 'EVT_RESOLVE:smuggler_boat:1', riskText: '放弃交易，不消耗弹药' }
        ]
    },
    {
        id: 'puppet_defector',
        title: '门外的白旗',
        description: '门外几名携械来人举起白布，声称愿意投诚，箱子里装着能交给守军的手榴弹。岗哨叫他们停住，对方果然不动了。人和箱子都还在掩体外，是真是假，隔着这段距离问不出来。',
        options: [
            { label: '放行进入', actionCmd: 'EVT_RESOLVE:puppet_defector:0', riskText: '手榴弹+50，或一楼工事降1级' },
            { label: '拒绝入内', actionCmd: 'EVT_RESOLVE:puppet_defector:1', riskText: '士气 -2' }
        ]
    },
    {
        id: 'wrecked_truck',
        title: '损毁卡车',
        description: '观察哨找到一辆侧翻的运输车，车厢里还压着七九弹箱。位置在守军掩体之外，敌军火力能罩住那段路。突击组来问要不要搬，人已经站在门边，谁也没先说自己能活着回来。',
        options: [
            { label: '派队抢运', actionCmd: 'EVT_RESOLVE:wrecked_truck:0', riskText: '七九弹+2000 | 阵亡1—5人 | 每人阵亡士气-2' },
            { label: '风险太大，放弃', actionCmd: 'EVT_RESOLVE:wrecked_truck:1', riskText: '士气 -2' }
        ]
    },
    {
        id: 'stray_airdrop',
        title: '偏离的空投',
        description: '风把一个空投包挂在仓库高处的金属支架上。包里可能有药品和材料，人却得离开遮蔽才能够到。绳子正一下下擦着断口，下面的人仰着头，没人催那个准备攀爬的兵。',
        options: [
            { label: '攀爬取回', actionCmd: 'EVT_RESOLVE:stray_airdrop:0', riskText: '成功：急救包+5、材料+100、士气最多+5；失败：阵亡1人、士气-5' },
            { label: '保守回收', actionCmd: 'EVT_RESOLVE:stray_airdrop:1', riskText: '仅回收材料+50，不冒攀爬风险' }
        ]
    }
];

export const ALL_DILEMMAS = [
    ...NEW_SUPPLY_DILEMMAS,
    {
        id: 'brit_ceasefire',
        title: '英军通牒',
        description: '联络处送来租界方面的停火要求：限制朝苏州河方向的射击，换取少量药品。副官把译文摊开，手指停在限制火力的那一行。答应要压住守军的不满；拒绝则可能让南侧联络与防务更难维持。（本事件为游戏情境演绎。）',
        options: [
            { label: '答应要求', actionCmd: 'EVT_RESOLVE:brit_ceasefire:0', riskText: '士气-5 | 获得急救包x5' },
            { label: '严词拒绝', actionCmd: 'EVT_RESOLVE:brit_ceasefire:1', riskText: '士气最多+5 | 地下室侧翼攻势提前' }
        ]
    },
    {
        id: 'student_thanks',
        title: '河对岸的回声',
        description: '此前接应的学生托人传来消息：药品已经筹齐，等守军接收。联络员说他们记得桥头那次掩护，连谁替他们开了路都想问清。副官把接收单递来，这回纸上终于有一项不是损失。',
        requiresFlag: 'students_rescued',
        excludesFlag: 'student_support_arrived',
        minDay: 2,
        options: [
            { label: '接受民众支援', actionCmd: 'EVT_RESOLVE:student_thanks:0', riskText: '急救包+8 | 士气最多+8' },
        ]
    },
    {
        id: 'smuggler_return',
        title: '私枭再度靠岸',
        description: '做过一次交易的小船又来了。船上说有机枪弹，但卸货后需要守军掩护撤离。来人认得上次接头的地方，却没因此省掉价码：要300发七九弹作掩护，少了便不卸货。',
        requiresFlag: 'smuggler_trusted',
        excludesFlag: 'smuggler_network_resolved',
        minDay: 3,
        options: [
            { label: '掩护运输线', actionCmd: 'EVT_RESOLVE:smuggler_return:0', riskText: '需七九弹300；换机枪弹+1800' },
            { label: '不再冒险', actionCmd: 'EVT_RESOLVE:smuggler_return:1', riskText: '不消耗弹药，放弃后续补给' },
        ]
    },
    {
        id: 'british_pressure',
        title: '租界侧翼压力',
        description: '拒绝停火后，南侧联络受阻。观察哨的报告送到指挥处：地下室外墙一线有敌军接近，攻势比预料更早。工兵等着领料转移防务，作战图上那条河，此刻像直接贴到了背上。',
        requiresFlag: 'british_defied',
        excludesFlag: 'british_pressure_resolved',
        minDay: 3,
        options: [
            { label: '立即转移防务', actionCmd: 'EVT_RESOLVE:british_pressure:0', riskText: '揭示地下室袭击 | 最多消耗材料120' },
        ]
    }
];

export const MUTINY_SCENES = [
    "【逃散与失踪】点名的声音越来越急，仍有位置无人回答。有人说看见同伴离开了队列，却说不清去了哪里。副官只能先把缺额记下，不能把失踪直接写成阵亡。",
    "【士气崩溃】“还要等到什么时候？”一声喊叫突然穿过楼道。争吵过后重新集合，人数已经对不上；有人逃散，有人下落不明，留下的人眼里也没有了刚才的安稳。",
    "【队伍散失】集合令传了下去，回来的报数却少了一截。副官把名册翻回去重查，指节在纸边压得发白。这些人已经离队，去向尚未证实。"
];

export const TACTICAL_CARDS: TacticalCard[] = [
    {
        id: 'morale_boost',
        title: '家书抵万金',
        description: '送信的人到了接应处，几封信还裹在油纸里。先别催着报军情，是否安排把信送到士兵手里？收下后才结算效果。',
        effectText: '士气最多+15',
        actionCmd: 'CARD_RESOLVE:morale_boost',
        color: 'gold'
    },
    {
        id: 'reinforce',
        title: '散兵接应',
        description: '早期侦察核实了仍由守军控制的入口接应点，五名散兵等着核验身份。口音各不相同，身上都带着走过火线的灰；接受后才正式编入。（虚构补员情境。）',
        effectText: '士兵+5',
        actionCmd: 'CARD_RESOLVE:reinforce',
        color: 'blue'
    },
    {
        id: 'supplies',
        title: '意外物资',
        description: '这次搜寻中，清理废墟的人报来一个尚可开启的弹药箱。需要核验并接收入库；接受后才增加弹药。',
        effectText: '七九弹+500',
        actionCmd: 'CARD_RESOLVE:supplies',
        color: 'gold'
    }
];

export const ENEMY_INTEL_BY_DAY: Record<number, string> = {
    0: "敌情尚未确认。先整理防务，具体路线需要侦察。",
    1: "日军开始试探防线。日况仅作总体参考，不代表已经侦察到本次目标。",
    2: "炮火压力上升。当前来袭方向以实际侦察报告为准。",
    3: "大规模攻势更易出现。不能只看指挥官所在楼层，其他防区也需要准备。",
    4: "封锁进一步收紧，火力与轮休都要留出余地。具体路线尚须核实。",
    5: "重火力与大规模进攻风险处于高位，别把一次暂歇当成敌军已经力竭。",
    6: "已抵达本局坚守目标日，战役将按实际兵力与阵地情况结算。"
};
