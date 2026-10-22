import React from 'react';
const examples = [
  ['报告弹药和士气','查状态 · 不耗时'], ['弟兄们，振作起来','简短鼓励 · 15分钟'],
  ['一楼猛烈射击','预备军令 · 下次步兵接战生效'], ['取消一楼预备军令','撤销预备 · 不耗时'],
  ['怎么治疗伤员','问规则 · 不执行治疗'], ['我想回家','聊心事 · 不等于撤退'],
];
export default function LocalCommandGuide({onFill}:{onFill:(input:string)=>void}) {
  return <details className="mt-2 text-xs text-neutral-400">
    <summary className="cursor-pointer py-1 hover:text-neutral-200">本地交流与军令示例 · 无需 AI</summary>
    <div className="max-h-52 overflow-y-auto pr-1">
      <p className="my-2 leading-relaxed">点击只填入，查看预览后再发送。聊天不耗时；有效行动推进战场。一次一条命令。</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{examples.map(([input,label])=><button type="button" key={input} onClick={()=>onFill(input)} className="min-w-0 rounded border border-neutral-700 px-3 py-2 text-left leading-relaxed hover:bg-neutral-800"><span className="block break-words text-neutral-200">{input}</span><span className="text-neutral-500">{label}</span></button>)}</div>
      <p className="mt-2 leading-relaxed">可以问候、诉苦、开玩笑和质疑。意思不明确时先澄清；条件命令和批量军令暂不自动执行。</p>
    </div>
  </details>;
}
