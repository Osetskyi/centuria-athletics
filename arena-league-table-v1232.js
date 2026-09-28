/* Centuria v12.33 — club crests inside the active League standings table. */
(()=>{
  'use strict';

  const BUILD='12.33';
  let refreshTimer=0;

  const normalize=s=>String(s??'')
    .trim()
    .toLocaleLowerCase('uk-UA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/&/g,' and ')
    .replace(/[^a-zа-яіїєґ0-9]+/giu,' ')
    .replace(/\s+/g,' ')
    .trim();

  const compact=s=>normalize(s)
    .split(' ')
    .filter(x=>x&&!['fc','cf','afc','ac','ssc','vfl','fk','sc','club','calcio'].includes(x))
    .join(' ');

  const updateVersion=()=>{
    document.querySelectorAll('.settings-version strong').forEach(el=>{el.textContent=`v${BUILD}`;});
  };

  const clubRows=()=>{
    const rows=window.__CENTURIA_CLUB_DATABASE__;
    return Array.isArray(rows)?rows:[];
  };

  const clubLogoFor=team=>{
    const wanted=normalize(team);
    const wantedCompact=compact(team);
    if(!wanted)return '';
    const rows=clubRows();
    let row=rows.find(x=>normalize(x?.name)===wanted);
    if(!row&&wantedCompact){
      row=rows.find(x=>compact(x?.name)===wantedCompact);
    }
    if(!row&&wantedCompact.length>=5){
      const matches=rows.filter(x=>{
        const n=compact(x?.name);
        return n.length>=5&&(n===wantedCompact||n.includes(wantedCompact)||wantedCompact.includes(n));
      });
      if(matches.length===1)row=matches[0];
    }
    return String(row?.logo||'').trim();
  };

  const paintCrest=(crest,team)=>{
    const logo=clubLogoFor(team);
    const key=`${team}::${logo?logo.slice(0,64):''}`;
    if(crest.dataset.key===key)return;
    crest.dataset.key=key;
    crest.setAttribute('title',team||'Клуб');
    crest.setAttribute('aria-label',team?`Емблема ${team}`:'Емблема клубу');
    crest.innerHTML='';
    if(logo){
      const img=document.createElement('img');
      img.src=logo;
      img.alt=team||'Клуб';
      img.loading='eager';
      img.decoding='async';
      crest.appendChild(img);
    }else{
      const fallback=document.createElement('span');
      fallback.className='arena-league-table-crest-fallback-v1232';
      fallback.textContent='⚽';
      crest.appendChild(fallback);
    }
  };

  const ensureCrest=(cell,team,desktop=false)=>{
    if(!cell||!team)return;
    const cls=desktop?'arena-league-table-crest-desktop-v1232':'arena-league-table-crest-v1232';
    let crest=cell.querySelector(`.${cls}`);
    if(!crest){
      crest=document.createElement('span');
      crest.className=cls;
      cell.prepend(crest);
    }
    cell.classList.add('has-club-crest-v1232');
    paintCrest(crest,team);
  };

  const enhance=()=>{
    updateVersion();
    const root=document.getElementById('arenaApp');
    if(!root||root.dataset.route!=='league')return;

    root.querySelectorAll('.arena-league-standings-card-v1096 .arena-league-mobile-row-v1099:not(.mobile-head)').forEach(row=>{
      const cell=row.querySelector('.mobile-player');
      const team=String(cell?.querySelector('small')?.textContent||'').trim();
      ensureCrest(cell,team,false);
    });

    root.querySelectorAll('.arena-league-standings-card-v1096 table.arena-league-standings-table-v1096 tbody .arena-league-player-cell-v1096').forEach(cell=>{
      const team=String(cell.querySelector('small')?.textContent||'').trim();
      ensureCrest(cell,team,true);
    });
  };

  const queueEnhance=()=>{
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(enhance,60);
  };

  const init=()=>{
    updateVersion();
    const root=document.getElementById('arenaApp')||document.documentElement;
    const observer=new MutationObserver(queueEnhance);
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-route','class']});
    setInterval(enhance,1400);
    enhance();
    window.__centuriaLeagueTableV1232={refresh:enhance};
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
