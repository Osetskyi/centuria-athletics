/* Centuria v12.33 — keep the active League/Cup visible on the Arena home screen. */
(()=>{
  'use strict';

  const BUILD='12.33';
  const ACTIVE_EVENT_KEY='ca_arena_active_event';
  const ACTIVE_EVENT_LEGACY_KEY='ca_arena_active_event_v925';
  let busy=false;
  let timer=0;

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
        // Base Arena's home renderer reads the event from localStorage.
        // Persist first, then redraw so it cannot show the stale "no active events" state.
        window.ArenaV852?.draw?.();
      }
    }catch(err){
      console.warn('Arena active event v12.33',err);
    }finally{busy=false;}
  };

  const wrapMethod=name=>{
    const api=window.ArenaV852;
    if(!api||typeof api[name]!=='function'||api[name].__activeEventV1233)return;
    const original=api[name];
    const wrapped=function(...args){
      const result=original.apply(this,args);
      clearTimeout(timer);
      timer=setTimeout(()=>sync(true),120);
      setTimeout(()=>sync(true),650);
      return result;
    };
    wrapped.__activeEventV1233=true;
    api[name]=wrapped;
  };

  const bind=()=>{
    updateVersion();
    ['open','goHome'].forEach(wrapMethod);
    const root=document.getElementById('arenaApp');
    if(root&&!root.__activeEventObserverV1233){
      root.__activeEventObserverV1233=true;
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
