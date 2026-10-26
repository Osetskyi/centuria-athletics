/* Centuria v12.57 — position history from match screenshots; read-only player UI. */
(function(){
  'use strict';
  // Russian position names match the game's score screen. The rest of the UI is Ukrainian.
  const POS = [
    ['GK','ВРТ','Вратарь',50,92,'keeper'],
    ['LB','ЛЗ','Левый защитник',9,77,'defense'],
    ['LCB','ЛЦЗ','Левый центральный защитник',29,79,'defense'],
    ['CB','ЦЗ','Центральный защитник',50,80,'defense'],
    ['RCB','ПЦЗ','Правый центральный защитник',71,79,'defense'],
    ['RB','ПЗ','Правый защитник',91,77,'defense'],
    ['LDM','ЛОП','Левый опорный полузащитник',27,65,'midfield'],
    ['CDM','ЦОП','Центральный опорный полузащитник',50,65,'midfield'],
    ['RDM','ПОП','Правый опорный полузащитник',73,65,'midfield'],
    ['LCM','ЛЦП','Левый центральный полузащитник',27,52,'midfield'],
    ['CM','ЦП','Центральный полузащитник',50,52,'midfield'],
    ['RCM','ПЦП','Правый центральный полузащитник',73,52,'midfield'],
    ['CAM','ЦАП','Центральный атакующий полузащитник',50,39,'midfield'],
    ['LM','ЛП','Левый полузащитник',9,40,'midfield'],
    ['RM','ПП','Правый полузащитник',91,40,'midfield'],
    ['LW','ЛФА','Левый фланговый атакующий',9,27,'attack'],
    ['RW','ПФА','Правый фланговый атакующий',91,27,'attack'],
    ['LF','ЛФД','Левый форвард',34,13,'attack'],
    ['CF','ЦФД','Центральный форвард',50,13,'attack'],
    ['RF','ПФД','Правый форвард',66,13,'attack']
  ];
  const BYCODE = Object.fromEntries(POS.map(p=>[p[0],p]));
  const ALIASES = Object.fromEntries(POS.flatMap(p=>[[p[0],p[0]],[p[1],p[0]]]));
  Object.assign(ALIASES,{'ФРВ':'CF','FRV':'CF','ST':'CF'});
  const normalize = raw => ALIASES[String(raw??'').trim().toUpperCase()] || null;
  const $ = id => document.getElementById(id);
  const data = () => Array.isArray(window.CenturiaPositionMatchesV1250) ? window.CenturiaPositionMatchesV1250 : [];
  const dateKey = date => String(date??'').slice(0,7);
  const usable = record => BYCODE[normalize(record?.position_code)] || null;
  const current = () => typeof editPlayerId !== 'undefined' ? editPlayerId : null;
  const validRating = r => r?.rating !== null && r?.rating !== undefined && r?.rating !== '' && Number.isFinite(Number(r.rating)) && Number(r.rating)>=0 && Number(r.rating)<=10;
  const rated = rows => rows.filter(validRating);
  const matchWord = n => n%10===1 && n%100!==11?'матч':(n%10>=2 && n%10<=4 && !(n%100>=12 && n%100<=14)?'матчі':'матчів');
  const average = rows => {
    const found=rated(rows);
    return found.length ? found.reduce((sum,r)=>sum+Number(r.rating),0)/found.length : null;
  };
  const formatAverage = n => n===null?'—':n.toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2});
  const escapeHtml = s => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const monthName = key => {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))return key;
    const d=new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1);
    const label=d.toLocaleDateString('uk-UA',{month:'long',year:'numeric'});
    return label.charAt(0).toLocaleUpperCase('uk-UA')+label.slice(1);
  };
  const byPlayer = pid => data().filter(r=>r.player_id===pid && usable(r));

  // The 50% threshold is per team calendar month, not per player's total apps.
  // A candidate's positional average must include a valid rating for EVERY such match.
  function monthWinner(month,mode,category,teamMatches){
    if(!(teamMatches>0))return null;
    const minimum=Math.ceil(teamMatches/2);
    const key=month && typeof month.getMonth==='function'
      ? `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}` : dateKey(month);
    const rows=data().filter(r=>(mode==='combined'||r.match_type===mode) && dateKey(r.match_date)===key && usable(r)?.[5]===category);
    const groups=new Map();
    rows.forEach(r=>{if(!groups.has(r.player_id))groups.set(r.player_id,[]);groups.get(r.player_id).push(r);});
    const eligible=[];
    groups.forEach((matches,pid)=>{
      if(matches.length<minimum || rated(matches).length!==matches.length)return;
      const player=(typeof players!=='undefined'?players:[]).find(p=>p.id===pid);
      if(!player)return;
      const avg=average(matches);
      eligible.push({player,stats:{matches:matches.length,average:avg,goals:0,assists:0,mvp:0},adjusted:avg,awardScore:avg});
    });
    eligible.sort((a,b)=>b.stats.average-a.stats.average || b.stats.matches-a.stats.matches || a.player.name.localeCompare(b.player.name));
    return eligible[0]||null;
  }

  let selectedPlayer=null;
  let selectedCode=null;
  let loading=null;
  let loaded=false;

  function fit(){
    const slider=$('playerViewSlider'),slide=$('playerPositionsSlide');
    if(!slider||!slide||!$('playerPositionsTab')?.classList.contains('active'))return;
    requestAnimationFrame(()=>{slider.style.height=`${slide.clientHeight}px`;});
  }

  function showPositionDetails(code,pid,moveToDetails=false){
    const info=$('positionDetailsV1250');
    if(!info)return;
    const pos=BYCODE[code];
    if(!pos){info.hidden=true;return;}
    const rows=byPlayer(pid).filter(r=>normalize(r.position_code)===code);
    const ratedCount=rated(rows).length;
    const rating=average(rows);
    $('positionDetailsTitleV1250').textContent=`${pos[1]} — ${pos[2]}`;
    $('positionDetailsMatchesV1250').textContent=String(rows.length);
    $('positionDetailsAvgV1250').textContent=formatAverage(rating);
    const coverage=$('positionDetailsCoverageV1250');
    coverage.hidden=rows.length===0 || ratedCount===rows.length;
    coverage.textContent=rows.length===0?'':`Є оцінки для ${ratedCount} із ${rows.length} матчів. Середня розрахована лише за наявними оцінками.`;
    const months=new Map();
    rows.forEach(r=>{
      const key=dateKey(r.match_date);
      if(!/^\d{4}-\d{2}$/.test(key))return;
      if(!months.has(key))months.set(key,[]);
      months.get(key).push(r);
    });
    $('positionDetailsMonthsV1250').innerHTML=months.size
      ?[...months.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([key,values])=>{
        const countRated=rated(values).length;
        return `<div class="pt-month-row"><span><b>${escapeHtml(monthName(key))}</b><small>${values.length} ${matchWord(values.length)}${countRated<values.length?` · оцінок ${countRated}`:''}</small></span><strong>${formatAverage(average(values))}</strong></div>`;
      }).join('')
      :'<p class="pt-no-months">На цій позиції ще немає зіграних матчів.</p>';
    info.hidden=false;
    $('positionPitchV1250')?.querySelectorAll('[data-pos-code]').forEach(dot=>{
      const active=dot.dataset.posCode===code;
      dot.classList.toggle('pt-selected-dot',active);
      dot.setAttribute('aria-pressed',String(active));
    });
    fit();
    if(moveToDetails) requestAnimationFrame(()=>{
      info.scrollIntoView({behavior:'smooth',block:'nearest'});
      fit();
    });
  }

  function render(pid=current()){
    if(!pid)return;
    if(selectedPlayer!==pid){selectedPlayer=pid;selectedCode=null;}
    if(!loaded&&!loading && typeof sb!=='undefined' && typeof authUser!=='undefined' && authUser)void refresh();
    const root=$('playerPositionsSlide');if(!root)return;
    const p=(typeof players!=='undefined'?players:[]).find(x=>x.id===pid);
    const rows=byPlayer(pid);
    const counts=Object.fromEntries(POS.map(pos=>[pos[0],0]));
    const categories={keeper:0,defense:0,midfield:0,attack:0};
    rows.forEach(record=>{const pos=usable(record);counts[pos[0]]++;categories[pos[5]]++;});
    const label=$('positionPlayerLabelV1250');if(label)label.textContent=p?.name||'—';
    const pitch=$('positionPitchV1250');
    if(pitch){
      pitch.innerHTML='<div class="pt-field-border"></div><div class="pt-half-line"></div><div class="pt-center-circle"></div><div class="pt-top-box"></div><div class="pt-bottom-box"></div><div class="pt-top-goal"></div><div class="pt-bottom-goal"></div>'+
        POS.map(pos=>{
          const [code,short,name,x,y]=pos;
          const n=counts[code];
          const percent=rows.length ? 100*n/rows.length : 0;
          const cls=n===0?'':percent>90?' pt-gold':percent>=40?' pt-most':percent>=20?' pt-mid':' pt-used';
          const percentLabel=percent.toLocaleString('uk-UA',{maximumFractionDigits:1});
          return `<button type="button" class="pt-dot${cls}" style="--pt-x:${x}%;--pt-y:${y}%" data-pos-code="${code}" title="${escapeHtml(name)}: ${n} матчів (${percentLabel}%)" aria-label="${escapeHtml(name)}: ${n} матчів, ${percentLabel}%" aria-pressed="false"><b>${short}</b><small>${n}</small></button>`;
        }).join('');
      pitch.querySelectorAll('[data-pos-code]').forEach(dot=>{
        dot.addEventListener('click',()=>{
          selectedCode=dot.dataset.posCode;
          showPositionDetails(selectedCode,pid,true);
        });
      });
    }
    const total=$('positionTotalV1250');if(total)total.textContent=String(rows.length);
    Object.entries(categories).forEach(([key,n])=>{const el=$(`position-${key}-total`);if(el)el.textContent=String(n);});
    showPositionDetails(selectedCode,pid);
    fit();
  }

  async function refresh(){
    if(typeof sb==='undefined'||!sb||typeof authUser==='undefined'||!authUser)return;
    if(loading)return loading;
    loading=(async()=>{
      const {data:rows,error}=await sb.from('player_position_matches').select('*');
      if(error){console.warn('Position history fetch error',error);return;}
      window.CenturiaPositionMatchesV1250=rows||[];
      loaded=true;
      if($('playerPositionsTab')?.classList.contains('active'))render();
      // Awards use exactly the same per-match source as this position screen.
      if(typeof generalStatsSlide!=='undefined' && generalStatsSlide===3 && typeof renderGeneralAwards==='function')renderGeneralAwards();
    })();
    try{await loading;}finally{loading=null;}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('playerPositionsTab')?.addEventListener('click',()=>{
      // Always recheck server data when users revisit the read-only positions tab.
      void refresh();
    });
  });
  window.CenturiaPositionsV1250={normalize,positions:POS,render,refresh,monthWinner};
  if(!Array.isArray(window.CenturiaPositionMatchesV1250))window.CenturiaPositionMatchesV1250=[];
})();
