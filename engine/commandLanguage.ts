/** Shared, bounded command grammar. Normalization never executes input. */
export const canonicalCommand = (input: string): string => input.normalize('NFKC')
  .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '').trim().toLowerCase()
  .replace(/頂/g, '顶').replace(/樓/g, '楼').replace(/層/g, '层')
  .replace(/顶楼|楼顶/g, '屋顶').replace(/第二层|第二楼|2楼|二层/g, '二楼')
  .replace(/第一层|第一楼|1楼|一层|大门/g, '一楼').replace(/地窖|负一层|負一层|-1楼|b1/g, '地下室');
export const compactCommand = (input: string): string => canonicalCommand(input).replace(/[，。！？、,.!?；;：:\s]/g, '');
const FLOOR = '(?:屋顶|二楼(?:阵地)?|一楼(?:入口)?|地下室)';
const ADDRESS = '(?:(?:副官|长官|弟兄们|兄弟们|同志们|大家)[,，:：!！\\s]*)?';
const POLITE = '(?:(?:请|麻烦|帮我|给我|立刻|立即|马上|现在|赶紧|全体|全军|我们|咱们|命令|下令)\\s*)*';
const END = '(?:一下|一会儿|一会|吧|了|起来|去|啊|呀|!|！|。|\\.)*';
const patterns = [
  `(?:前往|去|走到|移动到|转移到|撤到)${FLOOR}`,
  `(?:加固|修复|修补|抢修)(?:${FLOOR})?(?:工事|阵地|防线)?`,
  `${FLOOR}(?:加固|修复|修补|抢修)(?:工事|阵地|防线)?`,
  '休息(?:整顿|轮换)?|整顿(?:休息)?|睡(?:觉|一觉|一会儿|一会)?|轮换休息',
  '(?:治疗|抢救|救治|救助|包扎)(?:伤员|伤兵|弟兄们|弟兄)?|军医(?:治疗|救治)伤员',
  '(?:搜寻|搜|寻找|搜索)(?:物资|弹药|仓库|补给)?',
  '(?:侦察|观察)(?:敌情|日军|敌军|敌人|战场)?',
  '(?:火力)?(?:突袭|夜袭|偷袭|反击|进攻)(?:敌人|敌军|日军|阵地)?',
  `(?:反冲锋)?夺回${FLOOR}|反冲锋${FLOOR}`,
  `封锁(?:通往)?${FLOOR}(?:的)?(?:楼梯|通道)|封锁(?:楼梯|通道)${FLOOR}`,
  `(?:调派|增援)30人从${FLOOR}至${FLOOR}`,
  `部署机枪(?:机枪)?[一二]连至${FLOOR}`,
  `部署小队[^,，。；;\\n]{1,24}至${FLOOR}`,
  '(?:演讲|训话|鼓舞|动员)(?:鼓舞|士气|弟兄们|守军|全军)?|坚持|顶住|拼了|万岁',
  '升旗|升起国旗|升国旗', '(?:请求|呼叫)?补给|整理物资',
];
const executable = new RegExp(`^${ADDRESS}${POLITE}(?:${patterns.join('|')})${END}$`);
export const isExecutableLocalAction = (input: string): boolean => executable.test(canonicalCommand(input));
export const normalizeExecutableAction = (input: string): string => canonicalCommand(input)
  .replace(/轮换休息|睡(?:觉|一觉|一会儿|一会)/g, '休息整顿').replace(/救治|救助|包扎/g, '治疗')
  .replace(/搜索/g, '搜寻').replace(/升起国旗|升国旗/g, '升旗');
export const isQuestion = (input: string): boolean => /[?？]|怎么|咋|如何|为什么|为何|怎样|是否|能否|能不能|可不可以|会不会|有没有|多少|还剩|几个人|几发|几点|第几天|情况|状况|状态|有信心|能赢|能守住|撑得住|什么意思|有用|(?:吗|么|嘛)[!！。\s]*$/.test(input)
  || /^(?:副官[,，:：\s]*)?(?:报告|查询|查看|查一下|查查)/.test(input);
export const directiveCore = (input: string): string => compactCommand(input)
  .replace(/^(?:他妈的|妈的|妈了个巴子)/, '')
  .replace(/(?:屋顶|二楼(?:阵地)?|一楼(?:入口)?|地下室)(?:的)?/g, '')
  .replace(/^(?:(?:副官|长官|弟兄们|兄弟们|同志们|大家|全体|你们|全军|我命令|命令|下令|现在|立刻|立即|马上|赶紧|给我|帮我|请))+/g, '')
  .replace(/(?:吧|啊|呀)+$/, '');
export type LanguageGuard = 'too_long' | 'injection' | 'ethics' | 'conditional' | 'compound' | 'quotation' | 'discussion';
export const getLanguageGuard = (raw: string): LanguageGuard | null => {
  const input = canonicalCommand(raw);
  if (raw.length > 500) return 'too_long';
  if (/confirm_|evt_resolve|card_resolve|tactic_use|encounter_skip|start_game|skip_tutorial|__proto__|<script|javascript:|(?:rngstate|soldiers|morale|ammo)\s*[:=]|(?:忽略|无视|绕过|修改|重写).{0,12}(?:规则|限制|系统|设定)|(?:给我|增加|加到|修改|设置|改成).{0,12}(?:无限|无敌|[0-9]{3,})|无限(?:子弹|弹药|资源)|一键(?:通关|胜利)|我是(?:开发者|管理员)|开发者模式|上帝模式|作弊器/.test(input)) return 'injection';
  if (/(?:杀|毙|处决|枪决|开火|扫射|射击|烧|炸|虐待|折磨|强奸|侮辱).{0,12}(?:俘虏|平民|百姓|自己人|副官|伤员|伤兵|投降的|妇女|女人|孩子)|(?:俘虏|平民|百姓|自己人|副官|伤员|伤兵).{0,10}(?:杀掉|杀光|打死|枪毙|处决|扫射|烧死)|(?:向|朝|对着)租界.{0,5}(?:开火|扫射)|杀了我|枪毙我|弄死我|强奸|轮奸/.test(input)) return 'ethics';
  if (/如果|一旦|假如|要是|若是|倘若|倘使|只要.{1,20}就|等.{1,20}以后/.test(input)) return 'conditional';
  if (/[“”「」『』"'`]|比如|例如|假装|扮演|测试一下|测试命令|复述|重复说|照着念/.test(input)) return 'quotation';
  const actions = input.match(/休息|治疗|抢救|救治|加固|修复|侦察|搜寻|搜索|夜袭|突袭|进攻|升旗|前往|调派|部署|夺回|猛烈射击|集中火力|开火|开枪|节约弹药|刺刀|死守|加油|振作|演讲/g) || [];
  const close = /^(?:先别开枪|别开枪|不要开枪)?等(?:他们|敌人|敌军|鬼子)?(?:靠近|近了)(?:了)?再打$/.test(directiveCore(input));
  if (!close && actions.length >= 2 && /然后|同时|并且|顺便|接着|之后|先.{1,30}再|先.{1,30}后|[;；\n]/.test(input)) return 'compound';
  if (/(?:我(?:刚才|刚刚|之前|昨天)|上次|刚才).{0,18}(?:说|喊|命令)|不是让你|不是叫你|只是说|只是聊|随便说|我想问|我在问|听说/.test(input)) return 'discussion';
  return null;
};
