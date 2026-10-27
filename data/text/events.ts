
// 事件、战地际遇、情报文本库。旧导出名保留以读取已有存档。
import { Dilemma, TacticalCard } from "../../types";

export const NEW_SUPPLY_DILEMMAS: Dilemma[] = [
  {
    id: 'student_run', title: '学生冲桥', minDay: 1,
    description: '桥头有人举着药品包，是来送东西的学生和童子军。他们停在守军尚能接应的位置，等一阵掩护。副官先报了用弹和派出人数：“接不接，您定。他们在等；咱们出去的人，也得算进去。”（虚构战场情境。）',
    options: [
      { label: '组织火力接应', actionCmd: 'EVT_RESOLVE:student_run:0', riskText: '需600发七九弹；急救包+10；阵亡由实际派出人数限制；建立民间支援线' },
      { label: '不作火力接应', actionCmd: 'EVT_RESOLVE:student_run:1', riskText: '不扣资源或士气；未建立支援线，外面人员的后续未确认' },
    ],
  },
  {
    id: 'smuggler_boat', title: '私枭闯关', minDay: 1,
    description: '水路接应点外，一条小船停住。来人说有七九弹，催着靠岸；帆布下面看不清。岗哨没有放行。核验需要时间和掩护用弹，直接接货则要承担更大的风险。（虚构战场情境。）',
    options: [
      { label: '冒险直接接货', actionCmd: 'EVT_RESOLVE:smuggler_boat:0', riskText: '50%取得七九弹3000发；50%遭伏击，阵亡不超过派出人数' },
      { label: '拒绝靠岸', actionCmd: 'EVT_RESOLVE:smuggler_boat:1', riskText: '不扣资源或士气，不建立水路联系' },
      { label: '核验后接货', actionCmd: 'EVT_RESOLVE:smuggler_boat:2', riskText: '30分钟、100发掩护用弹；80%取得2400发已核实弹药，20%遇险' },
    ],
  },
  {
    id: 'puppet_defector', title: '门外的白旗', minDay: 1,
    description: '门外来人举着白布，声称愿意交出一箱手榴弹。岗哨叫他们停住，对方照做了。接收位置与核验办法还没有定，谁也没有替那只箱子作保。（虚构战场情境。）',
    options: [
      { label: '直接放行接收', actionCmd: 'EVT_RESOLVE:puppet_defector:0', riskText: '70%手榴弹+50；30%工事受损，零级工事时改为真实人员受伤' },
      { label: '拒绝入内', actionCmd: 'EVT_RESOLVE:puppet_defector:1', riskText: '不扣资源或士气；不执行射杀' },
      { label: '隔离核验后接收', actionCmd: 'EVT_RESOLVE:puppet_defector:2', riskText: '20分钟、30材料；70%核实30枚可用手榴弹；30%拒收，不损工事、不增伤亡' },
    ],
  },
  {
    id: 'wrecked_truck', title: '损毁卡车', minDay: 1,
    description: '侦察后确认的外侧通路旁，一辆运输车侧翻着，车厢里压着弹药箱。抢运的人等在受控入口，问得很短：“这一趟，去不去？”风险、兵力和十五分钟都得算进去。（虚构战场情境。）',
    options: [
      { label: '派队抢运', actionCmd: 'EVT_RESOLVE:wrecked_truck:0', riskText: '15分钟；七九弹+2000；阵亡1—5人且不超过实际派出人数' },
      { label: '放弃本次抢运', actionCmd: 'EVT_RESOLVE:wrecked_truck:1', riskText: '不扣资源或士气；弹药没有入库' },
    ],
  },
  {
    id: 'stray_airdrop', title: '悬着的补给包', minDay: 1,
    description: '仓库高处的支架上挂着一个破开的补给包，下方散落了些可回收材料。包里还有什么，要取回核验才知道。准备攀爬的人试了试支撑，又停下来等你的话。（虚构战场情境，不作特定空投史实。）',
    options: [
      { label: '攀爬取回', actionCmd: 'EVT_RESOLVE:stray_airdrop:0', riskText: '70%药品+5、材料+100、士气最多+5；30%阵亡1人、士气最多-5' },
      { label: '只收地面散落材料', actionCmd: 'EVT_RESOLVE:stray_airdrop:1', riskText: '材料+50，不承担攀爬风险；行动仍可能接敌' },
      { label: '放弃此次回收', actionCmd: 'EVT_RESOLVE:stray_airdrop:2', riskText: '不耗时、不扣资源或士气；没有物资入库' },
    ],
  },
];

export const ALL_DILEMMAS: Dilemma[] = [
  ...NEW_SUPPLY_DILEMMAS,
  {
    id: 'brit_ceasefire', title: '南岸联络交涉', minDay: 2,
    description: '南岸联络处提出补给交接条件。配合会招来守军的不满，但能取得药品；拒绝则保留强硬态度，南侧防务压力也会增加。副官把得失逐项报完，没有替你作决定。（虚构交涉；后续攻势变化为战役规则抽象，不对应真实外交因果。）',
    options: [
      { label: '接受交接安排', actionCmd: 'EVT_RESOLVE:brit_ceasefire:0', riskText: '急救包+5、士气最多-5；后续炮击倾向降低；不额外限制我方射击' },
      { label: '拒绝交接条件', actionCmd: 'EVT_RESOLVE:brit_ceasefire:1', riskText: '士气最多+5；合法侧翼攻势提前1回合，南侧长期压力增加；变更后的情报需重新侦察' },
    ],
  },
  {
    id: 'student_thanks', title: '河对岸的回声', presentation: 'notice',
    description: '此前接应的学生托人送来筹齐的药品。接收单上夹着一句谢意，这回纸上终于有一项不是损失。支援抵达后按真实库存入库。',
    requiresFlag: 'students_rescued', excludesFlag: 'student_support_arrived', minDay: 2,
    options: [{ label: '接收民众支援', actionCmd: 'EVT_RESOLVE:student_thanks:0', riskText: '急救包+8、士气最多+8；支援抵达通知，不额外耗时' }],
  },
  {
    id: 'smuggler_return', title: '私枭再度靠岸',
    description: '上次做成交易的小船又来了，这回带着机枪弹。来人认得接头的位置，却没有省掉条件：卸货和撤离需要三百发七九弹掩护。够不够，先看库存，再下令。（虚构战场情境。）',
    requiresFlag: 'smuggler_trusted', excludesFlag: 'smuggler_network_resolved', minDay: 3,
    options: [
      { label: '掩护运输线', actionCmd: 'EVT_RESOLVE:smuggler_return:0', riskText: '机枪弹+1800；缺弹不能执行，可另选拒绝' },
      { label: '不再接货', actionCmd: 'EVT_RESOLVE:smuggler_return:1', riskText: '不扣资源或士气；明确结束这次水路联系' },
    ],
  },
  {
    id: 'british_pressure', title: '侧翼来袭预警', presentation: 'notice',
    description: '南岸联络受阻后，观察哨补送了当前来袭报告。指挥处先核对实际战线，再把能确认的目标、路线与接敌时间写上图。预警不等于工事已经建好，也不等于兵力已经调过去。',
    requiresFlag: 'british_defied', excludesFlag: 'british_pressure_resolved', minDay: 3,
    options: [{ label: '核对来袭报告', actionCmd: 'EVT_RESOLVE:british_pressure:0', riskText: '免费揭示当前合法攻势；不扣材料、不凭空调兵，不再额外提前接敌' }],
  },
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
        description: '五名散兵在入口接应点等待核验身份。口音各不相同，身上都带着走过火线的灰；接受后才正式编入仍由守军控制的阵地。（虚构补员情境。）',
        effectText: '士兵+5',
        actionCmd: 'CARD_RESOLVE:reinforce',
        color: 'blue'
    },
    {
        id: 'supplies',
        title: '意外物资',
        description: '清理废墟的人报来一个尚可开启的弹药箱。需要核验并接收入库；接受后才增加弹药。',
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
