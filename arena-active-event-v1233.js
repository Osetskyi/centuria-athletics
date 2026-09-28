/* Centuria v12.35 — active event League preview mirrors the real League table. */
(()=>{
  'use strict';

  const BUILD='12.35';
  const ACTIVE_EVENT_KEY='ca_arena_active_event';
  const ACTIVE_EVENT_LEGACY_KEY='ca_arena_active_event_v925';
  let busy=false;
  let timer=0;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const updateVersion=()=>{
    document.querySelectorAll('.settings-version strong').forEach(el=>{el.textContent=`v${BUILD}`;});
  };

  const isScored=m=>Number.isFinite(m?.homeScore)&&Number.isFinite(m?.awayScore);
  const currentLeagueRound=comp=>(comp?.rounds||[]).find(r=>(r?.matches||[]).some(m=>!isScored(m)))||(comp?.rounds||[]).at(-1)||null;

  const eventFromCompetition=comp=>{
    if(!comp?.kind)return null;
    if(comp.kind==='league'){
      const r=currentLeagueRound(comp);
      return {
        type:'league', route:'league', title:String(comp.title||'CENTURIA LEAGUE'),
        meta:`${(comp.participants||[]).length} УЧАСНИКІВ • ${comp.champion?'ЗАВЕРШЕНО':`ТУР ${r?.round||1}/${(comp.rounds||[]).length||1}`}`,
        icon:'arena-icon-league-pixel.gif?v=9.15', createdAt:comp.createdAt||Date.now()
      };
    }
    if(comp.kind==='cup'){
      const r=(comp.rounds||[]).at(-1)||null;
      return {
        type:'cup', route:'cup', title:String(comp.title||'CENTURIA CUP'),
        meta:`${(comp.participants||[]).length} УЧАСНИКІВ • ${comp.champion?'ЗАВЕРШЕНО':String(r?.label||'КУБОК')}`,
        icon:'arena-icon-cup-pixel.gif?v=10.53', createdAt:comp.createdAt||Date.now()
      };
    }
    return null;
  };

  const persistEvent=event=>{
    if(!event?.route||!event?.title)return false;
    const raw=JSON.stringify(event);
    let changed=false;
    try{
      changed=localStorage.getItem(ACTIVE_EVENT_KEY)!==raw;
      localStorage.setItem(ACTIVE_EVENT_KEY,raw);
      localStorage.setItem(ACTIVE_EVENT_LEGACY_KEY,raw);
    }catch(_e){}
    try{
      const old=JSON.stringify(window.__CENTURIA_ARENA_ACTIVE_EVENT__||null);
      if(old!==raw)changed=true;
      window.__CENTURIA_ARENA_ACTIVE_EVENT__=event;
    }catch(_e){window.__CENTURIA_ARENA_ACTIVE_EVENT__=event;}
    return changed;
  };

  const leagueRows=comp=>{
    const names=[...(comp?.participants||[])];
    const map=new Map(names.map(name=>[name,{name,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}]));
    const rounds=comp?.rounds||[];
    for(const round of rounds){
      if(round?.playoff)continue;
      for(const m of round?.matches||[]){
        if(String(m?.id||'').startsWith('LP_')||!isScored(m))continue;
        const h=map.get(m.home),a=map.get(m.away);
        if(!h||!a)continue;
        h.p++;a.p++;
        h.gf+=Number(m.homeScore)||0;h.ga+=Number(m.awayScore)||0;
        a.gf+=Number(m.awayScore)||0;a.ga+=Number(m.homeScore)||0;
        if(m.homeScore>m.awayScore){h.w++;a.l++;h.pts+=3;}
        else if(m.homeScore<m.awayScore){a.w++;h.l++;a.pts+=3;}
        else{h.d++;a.d++;h.pts++;a.pts++;}
      }
      if(comp?.leagueFormat==='swiss'){
        for(const name of round?.byes||[]){
          const row=map.get(name);
          if(row){row.p++;row.w++;row.pts+=3;}
        }
      }
    }
    return [...map.values()].sort((a,b)=>b.pts-a.pts||((b.gf-b.ga)-(a.gf-a.ga))||b.gf-a.gf||String(a.name).localeCompare(String(b.name),'uk'));
  };

  const leagueMatchCounts=comp=>{
    const matches=(comp?.rounds||[]).flatMap(r=>r?.playoff?[]:(r?.matches||[])).filter(m=>!String(m?.id||'').startsWith('LP_'));
    return {completed:matches.filter(isScored).length,total:matches.length};
  };

  const clubFor=(comp,name)=>String(comp?.participantClubs?.[name]||'Centuria').trim()||'Centuria';
  const placeClass=i=>i===0?'place-1':i===1?'place-2':i===2?'place-3':'place-rest';

  const leagueTableMarkup=comp=>{
    const rows=leagueRows(comp);
    const counts=leagueMatchCounts(comp);
    return `<div class="arena-card-v852 arena-league-card-v920 arena-league-standings-card-v1096 arena-active-event-full-table-v1234">
      <div class="arena-league-standings-head-v1097"><div><small>ОФІЦІЙНА ТУРНІРНА ТАБЛИЦЯ</small><strong>${esc(comp.title||'CENTURIA LEAGUE')}</strong></div><span>${counts.completed}/${counts.total} матчів</span></div>
      <div class="arena-league-standings-wrap-v1096">
        <table class="arena-table-v852 arena-league-standings-table-v1096"><thead><tr><th>#</th><th>ГРАВЕЦЬ / КЛУБ</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>ЗГ</th><th>ПГ</th><th>РГ</th><th>О</th></tr></thead><tbody>${rows.map((p,i)=>{const gd=p.gf-p.ga;return `<tr class="arena-league-place-row-v1097 ${placeClass(i)}"><td><span class="arena-league-rank-v1096"><span class="arena-league-rank-num-v1128">${i+1}</span></span></td><td class="arena-league-player-cell-v1096 has-club-crest-v1232"><span class="arena-league-table-crest-desktop-v1232" aria-hidden="true"></span><strong>${esc(p.name)}</strong><small>${esc(clubFor(comp,p.name))}</small></td><td>${p.p}</td><td>${p.w}</td><td>${p.d}</td><td>${p.l}</td><td>${p.gf}</td><td>${p.ga}</td><td><span class="arena-league-gd-v1096 ${gd>0?'plus':gd<0?'minus':'zero'}">${gd>0?'+':''}${gd}</span></td><td><b class="arena-league-points-v1096">${p.pts}</b></td></tr>`;}).join('')}</tbody></table>
        <div class="arena-league-mobile-grid-v1099" role="table" aria-label="Турнірна таблиця Ліги"><div class="arena-league-mobile-row-v1099 mobile-head" role="row"><span role="columnheader">#</span><span role="columnheader">ГРАВЕЦЬ</span><span role="columnheader">І</span><span role="columnheader">В</span><span role="columnheader">Н</span><span role="columnheader">П</span><span role="columnheader">ЗГ</span><span role="columnheader">ПГ</span><span role="columnheader">РГ</span><span role="columnheader">О</span></div>${rows.map((p,i)=>{const gd=p.gf-p.ga;return `<div class="arena-league-mobile-row-v1099 ${placeClass(i)}" role="row"><span class="mobile-place" role="cell">${i+1}</span><span class="mobile-player has-club-crest-v1232" role="cell" title="${esc(p.name)} · ${esc(clubFor(comp,p.name))}"><span class="arena-league-table-crest-v1232" aria-hidden="true"></span><b>${esc(p.name)}</b><small>${esc(clubFor(comp,p.name))}</small></span><span role="cell">${p.p}</span><span role="cell">${p.w}</span><span role="cell">${p.d}</span><span role="cell">${p.l}</span><span role="cell">${p.gf}</span><span role="cell">${p.ga}</span><span role="cell">${gd>0?'+':''}${gd}</span><span class="mobile-points" role="cell"><b>${p.pts}</b></span></div>`;}).join('')}</div>
      </div>
      <div class="arena-league-standings-legend-v1097"><span><i class="top1"></i>1 місце</span><span><i class="top2"></i>2 місце</span><span><i class="top3"></i>3 місце</span></div>
    </div>`;
  };

  const renderActiveLeagueTable=comp=>{
    const root=document.getElementById('arenaApp');
    if(!root||root.dataset.route!=='home'||comp?.kind!=='league')return;
    const card=root.querySelector('.arena-active-event-v877:not(.arena-active-event-empty-v879)');
    const preview=card?.querySelector('.arena-active-event-preview-v879');
    if(!preview)return;
    const key=JSON.stringify({id:comp.id||'',participants:comp.participants||[],clubs:comp.participantClubs||{},rounds:comp.rounds||[],champion:comp.champion||null});
    if(preview.dataset.fullLeagueV1234===key){
      window.__centuriaLeagueTableV1232?.refresh?.();
      return;
    }
    preview.dataset.fullLeagueV1234=key;
    preview.classList.add('arena-active-event-league-full-v1234');
    // v12.35: arena.js already renders the final table. Do not replace it,
    // because replacing compact/full markup was the source of the visible jump.
    if(!preview.querySelector('.arena-active-event-full-table-v1234')){
      preview.innerHTML=leagueTableMarkup(comp);
    }
    requestAnimationFrame(()=>window.__centuriaLeagueTableV1232?.refresh?.());
  };

  const sync=async(redraw=true)=>{
    updateVersion();
    if(busy)return;
    const api=window.CenturiaArenaStateApi;
    if(!api?.isReady?.()||!api?.get)return;
    busy=true;
    try{
      const row=await api.get();
      const comp=row?.active_competition;
      const event=(row?.active_event?.route&&row?.active_event?.title)
        ? row.active_event
        : eventFromCompetition(comp);
      if(!event)return;
      const changed=persistEvent(event);
      const root=document.getElementById('arenaApp');
      if(redraw&&changed&&root?.dataset?.route==='home'){
        window.ArenaV852?.draw?.();
      }
      if(comp?.kind==='league')renderActiveLeagueTable(comp);
    }catch(err){
      console.warn('Arena active event v12.35',err);
    }finally{busy=false;}
  };

  const wrapMethod=name=>{
    const api=window.ArenaV852;
    if(!api||typeof api[name]!=='function'||api[name].__activeEventV1234)return;
    const original=api[name];
    const wrapped=function(...args){
      const result=original.apply(this,args);
      clearTimeout(timer);
      timer=setTimeout(()=>sync(true),120);
      setTimeout(()=>sync(true),650);
      return result;
    };
    wrapped.__activeEventV1234=true;
    api[name]=wrapped;
  };

  const bind=()=>{
    updateVersion();
    ['open','goHome'].forEach(wrapMethod);
    const root=document.getElementById('arenaApp');
    if(root&&!root.__activeEventObserverV1234){
      root.__activeEventObserverV1234=true;
      const observer=new MutationObserver(()=>{
        updateVersion();
        if(root.dataset.route==='home'){
          clearTimeout(timer);
          timer=setTimeout(()=>sync(true),90);
        }
      });
      observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-route']});
    }
    sync(true);
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();

  setInterval(()=>{
    updateVersion();
    if(document.getElementById('arenaApp')?.dataset?.route==='home')sync(true);
  },2500);
})();
