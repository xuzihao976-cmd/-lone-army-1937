/* Fixed engine snapshots; this file never imports the engine or touches saved games. */
(() => {
  const host=document.getElementById('lone-army-ui-options');
  const data=JSON.parse(document.getElementById('la-concept-fixture').textContent);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paragraphs=text=>String(text??'').split(/\n\n+/).filter(Boolean).map(p=>`<p>${escape(p).replace(/\n/g,'<br>')}</p>`).join('');
  const number=value=>Number(value).toLocaleString('en-US');
  const chapters=new Map(data.chapters.map(c=>[c.id,c]));
  const appRoots=host.querySelectorAll('[data-concept]');
  for(const root of appRoots){
    const design=root.dataset.concept;
    const state={chapterId:'sihang',view:host.dataset.screen||'game',input:'',readingSize:16};
    const sample=()=>chapters.get(state.chapterId)[host.dataset.sample==='opening'?'openingSample':'fieldSample'];
    const chapter=()=>chapters.get(state.chapterId);
    const actionButton=(a,index)=>{
      const p=a.preview;const blocked=a.tutorialBlocked||!p?.available;
      const caption=blocked?(a.tutorialBlocked?'先完成当前引导':p?.reason||'当前不可执行'):(p.costs?.length?`${p.durationLabel} · ${p.costs.join('、')}`:p.durationLabel);
      return `<button type="button" class="quick-action" data-action="preview" data-index="${index}" aria-label="预览${escape(a.label)}军令${blocked?'，当前不可执行':''}"><b>${escape(a.label)}</b><span>${escape(caption)}</span></button>`;
    };
    function sectorMarkup(){
      const s=sample().stats;
      if(state.chapterId!=='sihang'){
        const m=s.mission;const rows=state.chapterId==='street'?[['登记民众',12],['已找到',m.found],['安全抵达',m.evacuated],['距封锁',`${180-m.elapsedMinutes}分钟`]]:[['需掩护过桥',60],['已过桥',m.crossed],['桥头掩体',`${m.cover}/3`],['距封锁',`${180-m.elapsedMinutes}分钟`]];
        return `<h3>本章进度</h3>${rows.map(([k,v])=>`<div class="sector"><div class="sector-label"><span>${escape(k)}</span><b>${escape(v)}</b></div></div>`).join('')}<p class="meta" style="margin-top:18px">${escape(chapter().objective)}</p>`;
      }
      return `<h3>仓库阵地</h3><p class="meta" style="margin-bottom:16px">本方防区示意</p>${['屋顶','二楼阵地','一楼入口','地下室'].map(name=>{
        const integrity=s.sectorIntegrity[name];
        return `<div class="sector"><div class="sector-label"><span>${name}</span><small>${s.location===name?'指挥部':integrity>0?'受控':'失守'}</small></div><div class="sector-track"><span style="width:${Math.max(0,Math.min(100,integrity))}%"></span></div><div class="sector-details"><span>完整度 ${integrity}%</span><span>步兵 ${s.soldierDistribution[name]}</span></div></div>`;
      }).join('')}<p class="meta" style="margin-top:18px">${escape(sample().intel)}</p>`;
    }
    function metricsMarkup(){
      const d=sample(),s=d.stats;const short=state.chapterId!=='sihang';
      const metrics=short?[['可战',d.combatReady,'combatReady'],['伤员',s.wounded,'wounded'],[state.chapterId==='street'?'安全抵达':'已过桥',state.chapterId==='street'?s.mission.evacuated:s.mission.crossed,'progress'],['距封锁',`${180-s.mission.elapsedMinutes}分`,'remaining']]:[['可战',d.combatReady,'combatReady'],['伤员',s.wounded,'wounded'],['士气',s.morale,'morale'],['总结构',s.health,'health']];
      const supplies=short?[['七九弹',s.ammo,'ammo'],['急救包',s.medkits,'medkits'],...(state.chapterId==='bridge'?[['工事材料',s.sandbags,'sandbags']]:[])]:[['七九弹',s.ammo,'ammo'],['机枪弹',s.machineGunAmmo,'machineGunAmmo'],['手榴弹',s.grenades,'grenades'],['工事材料',s.sandbags,'sandbags'],['急救包',s.medkits,'medkits']];
      return `<div class="dateline"><div><div class="chapter-caption"><span>${escape(chapter().title)}</span><span>${short?'虚构支线':`第${s.day}天`}</span></div><div class="place-name">${short?escape(chapter().subtitle):escape(s.location)}</div></div><div class="clock">${s.currentTime}<small>${short?'本章开场':escape(d.date)}</small></div></div>
        <div class="metrics">${metrics.map(([k,v,key])=>`<div class="metric"><span>${k}</span><strong data-field="${key}" data-value="${escape(v)}">${typeof v==='number'?number(v):escape(v)}</strong></div>`).join('')}</div>
        <div class="supplies" style="grid-template-columns:repeat(${supplies.length},minmax(0,1fr))" aria-label="现有物资">${supplies.map(([k,v,key])=>`<div class="supply"><span>${k}</span><b data-field="${key}" data-value="${v}">${number(v)}</b></div>`).join('')}</div>
        <div class="readouts"><span>压力 <b>${s.siegeMeter}%</b></span><span>疲劳 <b>${s.fatigue}%</b></span>${short?'':`<span>接敌 <b>${s.enemyOperation?`${s.enemyOperation.turnsRemaining}回合${s.enemyOperation.revealed?'':' · 目标未明'}`:'重整中'}</b></span><span>国旗 <b>${s.hasFlagRaised?'飘扬':'未升起'}</b></span>`}</div>`;
    }
    function journalMarkup(){
      const d=sample();const opening=host.dataset.sample==='opening'||state.chapterId!=='sihang';
      const text=opening?d.history[0].text:d.history.at(-1).text;
      const chunks=text.split(/\n\n+/).filter(p=>p&&!/^【/.test(p));
      if(opening&&state.chapterId==='sihang')chunks.shift();
      const body=chunks.map(p=>p.startsWith('💤 ')?`<p class="settlement-note">${escape(p.slice(3))}</p>`:paragraphs(p)).join('');
      return `<div class="journal-header"><h2 class="journal-title">${escape(chapter().subtitle)}</h2><span class="eyebrow">${opening?'入驻记录':'作战记录'}</span></div>
        <div class="journal-copy"><span class="narrative-kicker">${escape(d.date)} · ${d.stats.currentTime}　${state.chapterId==='sihang'?'四行仓库':'虚构支线'}</span>${body}${d.dialogue&&!opening?`<blockquote><span class="meta">你说：我有点害怕</span>${paragraphs(d.dialogue)}</blockquote>`:''}
        <div class="journal-tools"><button type="button" data-action="history">查看完整战报 →</button><span class="meta">${d.history.length}条记录</span></div></div>`;
    }
    function menuMarkup(){
      const c=chapter();
      return `<div class="menu-hero"><p class="eyebrow">文字策略 / 一九三七</p><h1>孤军</h1><p class="subtitle">不同的阵地，<br>许多个想回家的人。</p><p class="meta" style="margin-top:22px">三处阵地，三份独立记录。</p></div>
        <div class="chapter-picker" aria-label="章节选择">${data.chapters.map(c=>`<button type="button" class="chapter-option" data-action="chapter" data-chapter="${c.id}" aria-pressed="${c.id===state.chapterId}"><span class="chapter-number">${c.number}</span><div><p class="meta">${escape(c.setting)}</p><h3>${escape(c.title)}</h3><p class="meta">${escape(c.subtitle)}</p></div><span class="arrow" aria-hidden="true">${c.id===state.chapterId?'✓':'→'}</span></button>`).join('')}</div>
        <section class="chapter-brief" aria-label="章节说明"><p class="eyebrow">本章任务</p><p>${escape(c.objective)}</p><p class="meta">${escape(c.duration)}</p></section>
        <section class="tactic-preview"><p class="eyebrow">本章战术 · 二选一</p><p class="meta">当前样本：不携带，可查看两张牌的规则。</p><div class="tactic-list">${c.tactics.map((t,i)=>`<button type="button" data-action="tactic" data-index="${i}"><b>${escape(t.title)}</b><span class="meta">查看效果与代价 →</span></button>`).join('')}</div></section>
        <p class="menu-footer">成人战争叙事，含具体伤势、死亡与战地创伤。前两章为虚构支线，演绎不作史料。</p>`;
    }
    function render(){
      const d=sample(),s=d.stats;const opening=s.tutorialStep===1&&state.chapterId==='sihang';
      root.className=`la-concept theme-${design} mode-${state.view}`;
      root.dataset.chapter=state.chapterId;root.dataset.stateHash=d.stateHash;
      root.setAttribute('aria-label',{'night':'守夜档案','command':'前线指挥','paper':'灰纸战报'}[design]+'界面');
      const compact=design==='night'&&state.view==='game';
      const brand=compact?`<span class="brand brand-compact"><span class="night-title">孤军<small>${escape(chapter().title)}</small></span><span class="night-context">${state.chapterId==='sihang'?`第${s.day}天 · ${escape(s.location)}`:'虚构支线 · 独立小队'}</span></span>`:`<span class="brand">孤军<small>${state.view==='menu'?'战役档案':state.chapterId==='sihang'?'一九三七':chapter().title}</small></span>`;
      const headerState=compact?`<div class="header-time tabular">${s.currentTime}<small>${escape(d.date)}</small></div>`:'<span class="local-label">本地游玩</span>';
      root.innerHTML=`<header class="masthead"><button type="button" class="wordmark" data-action="menu" aria-label="返回章节">${brand}</button><div class="masthead-right">${headerState}<button type="button" data-action="${state.view==='menu'?'game':'menu'}">${state.view==='menu'?'看战报':'章节'}</button></div></header>
        <section class="overview" aria-label="战况与物资">${metricsMarkup()}</section>
        <div class="workspace"><div class="intel-note"><b>${opening?'当前目标':'本章任务'}</b><span>${opening?'先加固一楼入口，再让守军轮换休息。':escape(chapter().objective)}</span></div><aside class="situation" aria-label="阵地详情">${sectorMarkup()}</aside><article class="journal" aria-label="作战记录">${journalMarkup()}</article></div>
        <footer class="command-dock" aria-label="军令与对话"><h3 class="command-side">指挥区</h3><div class="quick-actions">${d.previews.slice(0,design==='night'?2:3).map(actionButton).join('')}${design==='night'?'<button type="button" class="quick-action" data-action="actions"><b>全部军令</b><span>先查看代价 →</span></button>':''}</div><div class="empty-space"></div><p class="compact-cost" aria-live="polite"></p><form class="command-form"><input id="${design}-command" class="command-input" aria-label="军令或对话" placeholder="下令，或说两句话" autocomplete="off" value="${escape(state.input)}"><button type="submit" class="primary" aria-label="查看输入的军令预览">预览</button></form><div class="dock-tools"><button type="button" data-action="map">${state.chapterId==='sihang'?'阵地':'任务'}</button><button type="button" data-action="advisor">顾问</button><button type="button" data-action="actions">军令</button><span>交谈不耗时</span></div></footer>
        <section class="menu-content" aria-label="章节与战术">${menuMarkup()}</section><footer class="menu-dock"><div><div class="meta"><span>${escape(chapter().title)}</span><span>样本战术：不携带</span></div><button type="button" class="primary" data-action="game"><span>预览${escape(chapter().title)}</span><span aria-hidden="true">→</span></button></div></footer>
        <dialog aria-labelledby="${design}-dialog-heading"><div class="dialog-head"><h2 id="${design}-dialog-heading"></h2><form method="dialog"><button type="submit" aria-label="关闭窗口">关闭</button></form></div><div class="dialog-body"></div></dialog>`;
      root.style.setProperty('--reading-size',state.readingSize+'px');
    }
    function modal(title,body){const dialog=root.querySelector('dialog');dialog.querySelector('h2').textContent=title;dialog.querySelector('.dialog-body').innerHTML=body;if(!dialog.open)dialog.showModal();else dialog.querySelector('button').focus();}
    function showPreview(index){
      const a=sample().previews[index];if(!a)return;
      const p=a.preview;const blocked=a.tutorialBlocked||!p?.available;
      const cost=p?.costs?.length?p.costs.join(' · '):'无额外物资消耗';
      modal(`军令预览 · ${a.label}`,`<p class="eyebrow">${escape(a.command)}</p>${blocked?`<p class="unavailable">当前不可执行：${escape(a.tutorialBlocked?'先完成当前新手引导':p?.reason||'未识别为行动')}</p>`:`<p class="cost-line">${escape(p.durationLabel)} · ${escape(cost)}</p><p>${escape(p.riskLabel)}</p><p>${escape(p.reason)}</p>`}<p class="meta" style="margin-top:22px">只读界面样本：尚未执行军令，时间与资源保持原值。</p>`);
    }
    root.addEventListener('click',event=>{
      const control=event.target.closest('button[data-action]');if(!control)return;
      switch(control.dataset.action){
        case'menu':state.view='menu';render();break;
        case'game':state.view='game';render();break;
        case'chapter':state.chapterId=control.dataset.chapter;state.input='';render();break;
        case'preview':showPreview(Number(control.dataset.index));break;
        case'actions':modal('常用军令',sample().previews.map((a,i)=>`<button type="button" data-action="preview" data-index="${i}"><b>${escape(a.label)}</b><span>${escape(a.tutorialBlocked?'先完成引导':a.preview?.short||'未识别')}</span></button>`).join('')+'<p class="meta" style="margin-top:16px">选择军令查看规则和代价；此样本不执行行动。</p>');break;
        case'map':modal(state.chapterId==='sihang'?'仓库阵地':'本章任务',sectorMarkup());break;
        case'advisor':modal('战地顾问',`<p class="eyebrow">回答与预览，不执行军令</p><p>${escape(chapter().objective)}</p><p>${escape(sample().intel||'先明确本章任务和行动代价。')}</p><p class="meta" style="margin-top:18px">本地只读说明；没有发送模型请求。</p>`);break;
        case'history':modal('完整战报',sample().history.map((h,i)=>`<p class="eyebrow" style="margin-top:20px">${i+1} · ${escape(h.command==='start_game'?'开场':h.command)}</p>${paragraphs(h.text)}`).join(''));break;
        case'tactic':{const t=chapter().tactics[Number(control.dataset.index)];modal(t.title,`${paragraphs(t.description)}<p class="cost-line">${escape(t.effect)}</p><p>${escape(t.tradeoff)}</p><p class="meta" style="margin-top:18px">此处只查看战术说明，未改变样本装备。</p>`);break;}
      }
    });
    root.addEventListener('input',event=>{
      if(!event.target.matches('.command-input'))return;
      state.input=event.target.value;
      const a=sample().previews.find(p=>p.command===state.input.trim());
      root.querySelector('.compact-cost').textContent=a?`${a.label} · ${a.preview?.short||'先查看规则'}`:'';
    });
    root.addEventListener('submit',event=>{
      if(!event.target.matches('.command-form'))return;
      event.preventDefault();const i=sample().previews.findIndex(p=>p.command===state.input.trim());
      if(i>=0)showPreview(i);else modal('军令与对话',`<p>${state.input.trim()?`已输入：${escape(state.input)}`:'可以先从常用军令中选择一项，查看时间、物资和风险。'}</p><p class="meta" style="margin-top:18px">这是一份只读界面样本，没有执行军令、写入存档或请求模型。</p>`);
    });
    render();
    if(globalThis.Tweak){
      const tweak=new Tweak({container:root,onChange:()=>root.style.setProperty('--reading-size',state.readingSize+'px')});
      tweak.addSlider(state,'readingSize',{label:'正文大小',min:16,max:20,step:1,unit:'px',reference:'--reading-size'});
    }
  }
})();
