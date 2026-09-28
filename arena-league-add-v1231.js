/* Centuria v12.35 — add-player control moved below the League table tab. */
(()=>{
  'use strict';

  const BUILD='12.35';
  const BLOCK_ID='arenaLeagueAddPlayerBlockV1231';
  const MODAL_ID='arenaLeagueAddPlayerModalV1231';
  let uiBusy=false;
  let refreshTimer=0;
  let lastRow=null;

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const same=(a,b)=>String(a??'').trim().toLocaleLowerCase('uk-UA')===String(b??'').trim().toLocaleLowerCase('uk-UA');
  const normalizeClub=s=>String(s??'').trim().toLocaleLowerCase('uk-UA').replace(/\s+/g,' ');
  const isAdmin=()=>String(window.getCenturiaAuthRole?.()||'viewer').toLowerCase()==='admin';
  const stateApi=()=>window.CenturiaArenaStateApi||null;
  const allMatches=comp=>(comp?.rounds||[]).flatMap(r=>r?.matches||[]);
  const isScored=m=>Number.isFinite(m?.homeScore)&&Number.isFinite(m?.awayScore);
  const hasPendingProposal=m=>String(m?.proposal?.status||m?.proposalStatus||'').toLowerCase()==='pending';
  const leagueLocked=comp=>allMatches(comp).some(m=>isScored(m)||hasPendingProposal(m));

  const rosterPlayers=()=>{
    let rows=[];
    try{ rows=window.getCenturiaArenaPlayers?.()||[]; }catch(_e){ rows=[]; }
    return [...new Set(rows.map(x=>String(typeof x==='string'?x:x?.name||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'uk'));
  };

  const candidatePlayers=comp=>rosterPlayers().filter(name=>!(comp?.participants||[]).some(old=>same(old,name)));

  const secureIndex=max=>{
    if(max<=1)return 0;
    try{
      if(globalThis.crypto?.getRandomValues){
        const a=new Uint32Array(1),limit=Math.floor(4294967296/max)*max;
        do{globalThis.crypto.getRandomValues(a);}while(a[0]>=limit);
        return a[0]%max;
      }
    }catch(_e){}
    return Math.floor(Math.random()*max);
  };

  const pickClub=comp=>{
    const allowed=[...new Set((comp?.allowedClubs||[]).map(x=>String(x||'').trim()).filter(Boolean))];
    if(!allowed.length)throw new Error('У цій лізі немає списку команд для жеребкування');
    const used=new Set(Object.values(comp?.participantClubs||{}).map(normalizeClub).filter(Boolean));
    const free=allowed.filter(club=>!used.has(normalizeClub(club)));
    const pool=free.length?free:allowed;
    return {club:pool[secureIndex(pool.length)],freeLeft:free.length,usedRepeat:!free.length};
  };

  // Same circle method as Arena's League generator. Existing results are never
  // touched because this feature is allowed only before the first result.
  const makeLeagueSchedule=(players)=>{
    const arr=[...players];
    if(arr.length%2)arr.push(null);
    const n=arr.length,rounds=[];
    let rot=[...arr];
    for(let r=0;r<n-1;r++){
      const matches=[];
      for(let i=0;i<n/2;i++){
        let a=rot[i],b=rot[n-1-i];
        if(!a||!b)continue;
        if((r+i)%2===1)[a,b]=[b,a];
        matches.push({id:`L${r+1}_${i+1}`,round:r+1,home:a,away:b,homeScore:null,awayScore:null});
      }
      rounds.push({round:r+1,matches});
      rot=[rot[0],rot[n-1],...rot.slice(1,n-1)];
    }
    return rounds;
  };

  const rebuildLeagueRounds=(players,format)=>{
    if(format==='swiss'){
      throw new Error('Додавання після жеребкування для швейцарської ліги поки недоступне');
    }
    const first=makeLeagueSchedule(players);
    if(format!=='double')return first;
    return first.concat(first.map((r,index)=>({
      round:first.length+index+1,
      matches:(r.matches||[]).map((m,i)=>({
        ...m,
        id:`L${first.length+index+1}_${i+1}`,
        round:first.length+index+1,
        home:m.away,
        away:m.home,
        homeScore:null,
        awayScore:null,
        proposal:null,
        proposalStatus:''
      }))
    })));
  };

  const nextActiveEvent=(row,comp)=>{
    const rounds=comp?.rounds||[];
    const first=rounds[0];
    const old=row?.active_event&&typeof row.active_event==='object'?row.active_event:{};
    return {
      ...old,
      type:'league',
      route:'league',
      title:comp.title||old.title||'CENTURIA LEAGUE',
      meta:`${comp.participants.length} УЧАСНИКІВ • ТУР ${first?.round||1}/${rounds.length||1}`,
      icon:old.icon||'arena-icon-league-pixel.gif?v=9.15',
      createdAt:old.createdAt||comp.createdAt||Date.now()
    };
  };

  const updateVersion=()=>{
    document.querySelectorAll('.settings-version strong').forEach(el=>{el.textContent=`v${BUILD}`;});
  };

  const removeBlock=()=>document.getElementById(BLOCK_ID)?.remove();
  const closeModal=()=>document.getElementById(MODAL_ID)?.remove();

  const openModal=async()=>{
    if(!isAdmin())return;
    const api=stateApi();
    if(!api?.isReady?.()||!api?.get){window.showToast?.('Arena ще не підключилась');return;}
    let row;
    try{row=await api.get();}catch(err){window.showToast?.('Не вдалося перевірити стан Ліги');return;}
    const comp=row?.active_competition;
    if(comp?.kind!=='league'){window.showToast?.('Активної Ліги немає');return;}
    if(leagueLocked(comp)){removeBlock();window.showToast?.('Додавання закрито: внесено або вже запропоновано перший результат');return;}
    if(comp.leagueFormat==='swiss'){window.showToast?.('Для швейцарської Ліги склад після жеребкування не змінюється');return;}

    const candidates=candidatePlayers(comp);
    const allowed=[...new Set((comp.allowedClubs||[]).map(x=>String(x||'').trim()).filter(Boolean))];
    const used=new Set(Object.values(comp.participantClubs||{}).map(normalizeClub).filter(Boolean));
    const freeCount=allowed.filter(x=>!used.has(normalizeClub(x))).length;

    closeModal();
    const overlay=document.createElement('div');
    overlay.id=MODAL_ID;
    overlay.className='arena-league-add-modal-v1231';
    overlay.innerHTML=`
      <div class="arena-league-add-dialog-v1231" role="dialog" aria-modal="true" aria-label="Додати гравця в Лігу">
        <div class="arena-league-add-head-v1231">
          <div><small>ADMIN · ЛІГА</small><h2>ДОДАТИ ГРАВЦЯ</h2><p>Старі команди залишаться без змін. Новому гравцю випадково випаде команда з пулу Ліги, після чого календар перебудується під нову кількість учасників.</p></div>
          <button type="button" class="arena-league-add-close-v1231" aria-label="Закрити">✕</button>
        </div>
        <div class="arena-league-add-stats-v1231"><span><b>${comp.participants?.length||0}</b><small>ЗАРАЗ У ЛІЗІ</small></span><span><b>${freeCount}</b><small>ВІЛЬНИХ КОМАНД</small></span><span><b>${allowed.length}</b><small>КОМАНД У ПУЛІ</small></span></div>
        <div class="arena-league-add-list-v1231">
          ${candidates.length?candidates.map(name=>`<button type="button" class="arena-league-add-player-row-v1231" data-player="${esc(name)}"><span><b>${esc(name)}</b><small>Додати до активної Ліги</small></span><em>＋</em></button>`).join(''):`<div class="arena-league-add-empty-v1231">Немає інших гравців у списку Centuria, яких можна додати.</div>`}
        </div>
        <p class="arena-league-add-note-v1231">Кнопка додавання автоматично зникне після першого підтвердженого результату. Якщо вільні клуби закінчаться, нові гравці отримуватимуть випадкову команду з повного пулу.</p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.arena-league-add-close-v1231')?.addEventListener('click',closeModal);
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
    overlay.querySelectorAll('.arena-league-add-player-row-v1231').forEach(btn=>btn.addEventListener('click',async()=>{
      const name=String(btn.dataset.player||'').trim();
      if(!name||uiBusy)return;
      if(!confirm(`Додати ${name} до активної Ліги?\n\nЙому випадково випаде команда, а календар перебудується. Команди нинішніх учасників не зміняться.`))return;
      await addPlayer(name,btn);
    }));
  };

  const addPlayer=async(name,button)=>{
    if(uiBusy||!isAdmin())return;
    uiBusy=true;
    button?.classList.add('is-loading');
    const api=stateApi();
    try{
      if(!api?.isReady?.()||!api?.canWrite?.()||!api?.get||!api?.save)throw new Error('Немає ADMIN-підключення до Arena');
      // Fetch immediately before the write so an already-entered score cannot be
      // accidentally erased by a stale browser snapshot.
      const row=await api.get();
      const source=row?.active_competition;
      if(source?.kind!=='league')throw new Error('Активної Ліги вже немає');
      if(leagueLocked(source))throw new Error('Додавання закрито: уже є результат або заявка на результат');
      if(source.leagueFormat==='swiss')throw new Error('Для швейцарської Ліги склад після жеребкування не змінюється');
      if((source.participants||[]).some(old=>same(old,name)))throw new Error('Цей гравець уже є в Лізі');

      const picked=pickClub(source);
      const comp=JSON.parse(JSON.stringify(source));
      comp.participants=[...(comp.participants||[]),name];
      comp.participantClubs={...(comp.participantClubs||{}),[name]:picked.club};
      comp.champion=null;
      comp.rounds=rebuildLeagueRounds(comp.participants,comp.leagueFormat||'single');

      const oldEntries=Array.isArray(comp.draw?.entries)?comp.draw.entries.map(x=>({...x})):[];
      const preserved=oldEntries.filter(entry=>(source.participants||[]).some(p=>same(p,entry?.player)));
      comp.draw={...(comp.draw||{}),kind:'league',entries:[...preserved,{player:name,club:picked.club}]};
      // Keep the original completedAt: the original draw stays the same; we only
      // append the newly assigned player instead of re-running everybody's draw.
      if(!comp.draw.completedAt)comp.draw.completedAt=source.createdAt||Date.now();

      const saved=await api.save({
        activeCompetition:comp,
        historyArchive:(row?.history_archive&&typeof row.history_archive==='object')?row.history_archive:{cup:[],league:[]},
        activeEvent:nextActiveEvent(row,comp)
      });
      if(!saved?.active_competition || !(saved.active_competition.participants||[]).some(p=>same(p,name))){
        throw new Error('Сервер не підтвердив додавання гравця');
      }
      // v12.35: keep the instant Arena cache in lock-step with Supabase.
      // Without this, the next draw can briefly use the pre-add schedule and
      // then redraw again when realtime arrives, which makes Active Event jump.
      try{
        localStorage.setItem('ca_arena_active_competition_v996',JSON.stringify(saved.active_competition));
        if(saved.active_event){
          const eventRaw=JSON.stringify(saved.active_event);
          localStorage.setItem('ca_arena_active_event',eventRaw);
          localStorage.setItem('ca_arena_active_event_v925',eventRaw);
          window.__CENTURIA_ARENA_ACTIVE_EVENT__=saved.active_event;
        }
      }catch(_e){}

      lastRow=saved;
      closeModal();
      const extra=picked.usedRepeat?' Вільні команди вже закінчилися, тому використано команду з повного пулу.':'';
      window.showToast?.(`${name} додано · ${picked.club}.${extra}`);
      setTimeout(()=>window.ArenaV852?.go?.('league'),180);
      setTimeout(refreshUi,450);
    }catch(err){
      console.warn('League add player v12.35',err);
      window.showToast?.(err?.message||'Не вдалося додати гравця');
    }finally{
      uiBusy=false;
      button?.classList.remove('is-loading');
    }
  };

  const makeBlock=(comp)=>{
    const candidates=candidatePlayers(comp);
    const el=document.createElement('div');
    el.id=BLOCK_ID;
    el.className='arena-league-add-admin-v1231';
    el.innerHTML=`<div class="arena-league-add-copy-v1231"><b>УЧАСНИКИ ЛІГИ · ${comp.participants?.length||0}</b><small>Склад можна доповнювати до першого результату. Старе жеребкування команд не змінюється.</small></div><button type="button" class="arena-league-add-btn-v1231" ${candidates.length?'':'disabled'}>＋ ДОДАТИ ГРАВЦЯ</button>`;
    el.querySelector('button')?.addEventListener('click',openModal);
    return el;
  };

  const renderFromRow=row=>{
    updateVersion();
    const root=document.getElementById('arenaApp');
    const comp=row?.active_competition;
    if(!root || root.dataset.route!=='league' || !isAdmin() || comp?.kind!=='league' || leagueLocked(comp) || comp.leagueFormat==='swiss'){
      removeBlock();
      return;
    }
    // v12.34: show the ADMIN control only inside the TABLE tab and place it
    // directly below the standings card. On every other League tab it is hidden.
    const tableCard=root.querySelector('.arena-league-standings-card-v1096');
    if(!tableCard){removeBlock();return;}
    const old=document.getElementById(BLOCK_ID);
    const count=comp.participants?.length||0;
    if(old?.dataset.count===String(count) && old.previousElementSibling===tableCard)return;
    old?.remove();
    const block=makeBlock(comp);block.dataset.count=String(count);
    tableCard.insertAdjacentElement('afterend',block);
  };

  async function refreshUi(){
    updateVersion();
    if(uiBusy)return;
    const root=document.getElementById('arenaApp');
    if(!root || root.dataset.route!=='league' || !isAdmin()){
      removeBlock();return;
    }
    const api=stateApi();
    if(!api?.isReady?.()||!api?.get)return;
    try{
      const row=await api.get();
      lastRow=row;
      renderFromRow(row);
    }catch(_e){}
  }

  const queueRefresh=()=>{
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(refreshUi,120);
  };

  const init=()=>{
    updateVersion();
    const observer=new MutationObserver(queueRefresh);
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-route','class','data-site-theme']});
    setInterval(refreshUi,1800);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
    refreshUi();
    window.__centuriaLeagueAddV1231={refresh:refreshUi,open:openModal};
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
