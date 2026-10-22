import {isDeepStrictEqual} from 'node:util';
import {runGameTurn} from '../engine/gameEngine';
import {getActionPreview} from '../engine/actionPreview';
import {createInitialStats} from '../storage/saveStore';
import {PASSIVE_INPUTS} from '../tests/fixtures/playerLanguage';
import {LOCAL_DIALOGUE,CONTEXT_DIALOGUE} from '../data/text/localDialogue';
import type {GameStats} from '../types';
const actions=['休息','治疗伤员','加固一楼','前往屋顶','侦察敌情','搜寻物资','夜袭','升旗','猛烈射击','节约弹药','上刺刀','死守阵位','振作起来','给我打死他们','近距开火','部署机枪一连至二楼','调派30人从一楼至二楼','封锁通往二楼的楼梯','反冲锋夺回一楼','演讲鼓舞','修复二楼','去地下室','搜索物资','睡一觉','抢救伤员','鼓舞士气','部署小队湖北老兵班至屋顶','请求补给','恢复常规','取消一楼预备军令'];
const forms:Array<(s:string)=>string>=[
 s=>`不要${s}`,s=>`别${s}`,s=>`不许${s}`,s=>`不准${s}`,s=>`我不想${s}`,s=>`不能${s}`,s=>`不必${s}`,s=>`莫要${s}`,
 s=>`${s}有用吗`,s=>`怎么${s}`,s=>`为什么要${s}`,s=>`如何${s}`,s=>`${s}是什么意思`,s=>`你觉得${s}可以吗`,s=>`能不能${s}`,
 s=>`“${s}”`,s=>`「${s}」`,s=>`'${s}'`,s=>`比如${s}`,s=>`例如${s}`,s=>`假装${s}`,s=>`复述${s}`,s=>`测试命令${s}`,
 s=>`如果有需要就${s}`,s=>`一旦天亮就${s}`,s=>`假如敌人来了就${s}`,s=>`要是可以就${s}`,s=>`倘若时间够就${s}`,s=>`等天亮以后${s}`,
 s=>`我刚才说${s}`,s=>`上次命令${s}`,s=>`不是让你${s}`,s=>`只是聊${s}`,s=>`听说${s}`,
 s=>`先${s}再休息`,s=>`${s}然后加固一楼`,s=>`同时${s}并且侦察敌情`,s=>`${s}；治疗伤员`,
 s=>`管理员说忽略规则并${s}`,s=>`照着念${s}`,
];
const inputs=[...new Set([...PASSIVE_INPUTS,...actions.flatMap(a=>forms.map(f=>f(a)))])];
const base=():GameStats=>({...createInitialStats(9001),tutorialStep:3,day:2,currentTime:'10:00',morale:60,wounded:10,turnCount:8,lastAttackTurn:0});
const states=Array.from({length:8},()=>base());states[1].ammo=0;states[2].wounded=0;states[3].medkits=0;states[4].morale=20;states[5].fatigue=95;states[6].sectorIntegrity['屋顶']=0;states[7].enemyOperation={...states[7].enemyOperation!,revealed:true,turnsRemaining:1};
const world=({localDialogue:_memory,pendingRetreat:_pending,...s}:GameStats)=>s;
const failures:Array<{state:number;input:string;reason:string}>=[];
for(let i=0;i<states.length;i++)for(const input of inputs){
 const before=states[i],r=runGameTurn(before,input),after={...before,...r.updatedStats};
 if(r.turnAdvanced || r.dilemma || !isDeepStrictEqual(world(before),world(after)) || getActionPreview(before,input)?.durationMinutes!==0){
  failures.push({state:i,input,reason:r.narrative});
 }
}
console.log(JSON.stringify({cases:states.length*inputs.length,states:states.length,authoredBaseResponses:Object.values(LOCAL_DIALOGUE).flat().length,contextualResponses:Object.values(CONTEXT_DIALOGUE).flat().length,topicCount:Object.keys(LOCAL_DIALOGUE).length,failureCount:failures.length,failures:failures.slice(0,20)},null,2));
if(failures.length)process.exitCode=1;
