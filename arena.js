// v10.93 — League creator, registration, clubs and formats; Cup v10.92 retained.
(() => {
  const P=[["Volkovson",1000,"Manchester United"],["Osetskyi_3",1000,"Real Madrid"],["Romeo_130901",1000,"Arsenal"],["Mitsuki_one_love",1000,"Barcelona"],["Loter24",1000,"Milan"],["vladiks56",1000,"Chelsea"]];
  const C={"Manchester United":"🔴","Real Madrid":"⚪","Arsenal":"🔴","Barcelona":"🔵","Milan":"⚫","Chelsea":"🔵","Liverpool":"🔴","Juventus":"⚫","Bayern Munich":"🔴","PSG":"🔵","Inter":"🔵","Centuria":"🟡"};
  let route="home", tab="mine", hist="cup", testParticipants=[];
  let leagueTableViewV1108="table";
  let leagueCalendarOpenRoundsV1115={};
  let cupPollPanelV1031="";
  let cupDrawOpenV1032=false;
  let cupDrawAnimationOpenV1033=false;
  let cupDrawAnimationStateV1033=null;
  let cupDrawAnimationTimerV1033=null;
  let cupDrawAutoAttemptKeyV1034="";
  // v10.95: one immutable League draw, revealed once per viewer.
  let leagueDrawAnimationOpenV1095=false;
  let leagueDrawAnimationStateV1095=null;
  let leagueDrawAnimationTimerV1095=null;
  let leagueDrawAutoAttemptKeyV1095="";
  let leagueDrawSeenCheckKeyV1095="";
  let cupDrawSeenCheckInFlightV1034="";
  let testBackTarget="arena";
  let customTestParticipants=[];
  // v10.12 — Arena-wide Supabase state sync hooks. The real implementation
  // is attached after the history helpers are initialized.
  let remoteArenaStateApplyingV1012=false;
  let queueRemoteArenaStateSaveV1012=()=>{};
  const PLAYER_PREFS_KEY="ca_arena_player_prefs_v930";
  let playerArenaPrefs={};
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const jsq=s=>String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  const loadPlayerArenaPrefs=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(PLAYER_PREFS_KEY)||"{}");
      playerArenaPrefs=saved&&typeof saved==="object"?saved:{};
    }catch(_e){ playerArenaPrefs={}; }
    return playerArenaPrefs;
  };
  const savePlayerArenaPrefs=()=>{
    try{ localStorage.setItem(PLAYER_PREFS_KEY,JSON.stringify(playerArenaPrefs||{})); }catch(_e){}
  };
  loadPlayerArenaPrefs();

  /* ========================================================
     v10.11 — shared Arena favorite clubs
     Supabase is canonical; localStorage is only a fast cache/fallback.
     ======================================================== */
  let remotePlayerPrefsV1011={};
  let remotePlayerPrefsLoadingV1011=false;
  let remotePlayerPrefsLoadedV1011=false;
  let remotePlayerPrefsPollV1011=0;
  const PLAYER_PREFS_REMOTE_MIGRATION_V1011="ca_arena_player_prefs_remote_migrated_v1011";
  const prefsApiV1011=()=>window.CenturiaArenaPlayerPrefsApi||null;
  const effectivePlayerPrefV1011=name=>remotePlayerPrefsLoadedV1011
    ? ({...(remotePlayerPrefsV1011?.[name]||{})})
    : ({...(playerArenaPrefs?.[name]||{}),...(remotePlayerPrefsV1011?.[name]||{})});
  const migrateAdminPlayerPrefsV1011=async()=>{
    const api=prefsApiV1011();
    if(!api?.isReady?.() || !api?.canAdminWrite?.() || !api?.seedMissing) return;
    try{
      if(localStorage.getItem(PLAYER_PREFS_REMOTE_MIGRATION_V1011)==="1")return;
    }catch(_e){}
    try{
      await api.seedMissing(playerArenaPrefs||{});
      try{localStorage.setItem(PLAYER_PREFS_REMOTE_MIGRATION_V1011,"1")}catch(_e){}
    }catch(err){
      console.warn("Arena favorite clubs migration",err);
    }
  };
  const refreshRemotePlayerPrefsV1011=async(redraw=true)=>{
    const api=prefsApiV1011();
    if(!api?.isReady?.() || !api?.list || remotePlayerPrefsLoadingV1011)return remotePlayerPrefsV1011;
    remotePlayerPrefsLoadingV1011=true;
    try{
      if(api?.canAdminWrite?.()) await migrateAdminPlayerPrefsV1011();
      const rows=await api.list();
      const next={};
      (Array.isArray(rows)?rows:[]).forEach(r=>{
        const playerName=String(r?.player_name||"").trim();
        const favoriteTeam=String(r?.favorite_team||"").trim();
        if(playerName&&favoriteTeam) next[playerName]={favoriteTeam,favoriteTeamPhoto:""};
      });
      remotePlayerPrefsV1011=next;
      remotePlayerPrefsLoadedV1011=true;

      // Mirror canonical remote values locally so other Arena helpers that still
      // read the cache receive the same club on every account.
      Object.entries(next).forEach(([name,pref])=>{
        playerArenaPrefs[name]={...(playerArenaPrefs[name]||{}),...pref};
      });
      savePlayerArenaPrefs();
      if(redraw && document.getElementById("screen-arena")?.classList.contains("active")) draw();
    }catch(err){
      console.warn("Arena favorite clubs refresh",err);
    }finally{
      remotePlayerPrefsLoadingV1011=false;
    }
    return remotePlayerPrefsV1011;
  };
  const ensureRemotePlayerPrefsPollingV1011=()=>{
    if(remotePlayerPrefsPollV1011)return;
    remotePlayerPrefsPollV1011=setInterval(()=>{
      if(document.getElementById("screen-arena")?.classList.contains("active")){
        refreshRemotePlayerPrefsV1011(true);
      }
    },8000);
  };
  const A=document.querySelector("#arenaApp");
  if(!A) return;
  let backBtn=document.querySelector("#screen-arena .arena-back-v852");
  if(backBtn && backBtn.parentNode){
    const cleanBackBtn=backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(cleanBackBtn, backBtn);
    backBtn=cleanBackBtn;
    backBtn.removeAttribute("data-nav");
  }

  const pc=n=>`<div class="arena-pcard-v852">${n}</div>`;
  const cr=c=>`<div class="arena-crest-v852">${C[c]||"⚽"}</div>`;
  const tabs=a=>`<div class="arena-tabs-v852">${a.map(x=>`<button class="${tab===x[0]?"on":""}" onclick="ArenaV852.setTab('${x[0]}')">${x[1]}</button>`).join("")}</div>`;
  const tabDots=(items,active,handler)=>`<div class="arena-tab-dots-v924" aria-label="Індикатор вкладок">${items.map((x,i)=>`<button class="arena-tab-dot-v924 ${active===x[0]?"on":""}" aria-label="Перейти на вкладку ${x[1]}" onclick="${handler}('${x[0]}')" ${active===x[0]?"aria-current=\"true\"":""}></button>`).join("")}</div>`;
  const tabStage=(content,items,active,handler)=>`<div class="arena-tab-stage-v924" data-anim="${tabAnim}">${content}</div>${tabDots(items,active,handler)}`;

  let swipeStartX=0, swipeStartY=0, swipeLocked=false, swipeIgnoreBracket=false, tabAnim="none", animResetTimer=0;

  // v8.79: the active-event field stays visible and expands into a live tournament preview.
  // When no event is live, keep this null. When an event starts, set:
  // {type:"league", route:"league", title:"CENTURIA LEAGUE #1", meta:"ТУР 4/7 • В ПРОЦЕСІ", icon:"arena-icon-league-pixel.gif?v=9.15"}
  // or {type:"cup", route:"cup", title:"CENTURIA CUP #1", meta:"1/2 ФІНАЛУ • В ПРОЦЕСІ", icon:"arena-icon-cup-pixel.gif?v=10.53"}.
  const ACTIVE_EVENT_KEY="ca_arena_active_event";
  const ACTIVE_EVENT_LEGACY_KEY="ca_arena_active_event_v925";
  let activeEvent=null;
  const loadActiveEvent=()=>{
    try{
      const raw=localStorage.getItem(ACTIVE_EVENT_KEY)||localStorage.getItem(ACTIVE_EVENT_LEGACY_KEY)||"null";
      const saved=JSON.parse(raw);
      if(saved && saved.route && saved.title) activeEvent=saved;
      else if(window.__CENTURIA_ARENA_ACTIVE_EVENT__) activeEvent=window.__CENTURIA_ARENA_ACTIVE_EVENT__;
      else activeEvent=null;
    }catch(_e){
      activeEvent=window.__CENTURIA_ARENA_ACTIVE_EVENT__||null;
    }
    return activeEvent;
  };
  const saveActiveEvent=()=>{
    try{
      if(activeEvent){
        const raw=JSON.stringify(activeEvent);
        localStorage.setItem(ACTIVE_EVENT_KEY,raw);
        localStorage.setItem(ACTIVE_EVENT_LEGACY_KEY,raw);
        window.__CENTURIA_ARENA_ACTIVE_EVENT__=activeEvent;
      }else{
        localStorage.removeItem(ACTIVE_EVENT_KEY);
        localStorage.removeItem(ACTIVE_EVENT_LEGACY_KEY);
        window.__CENTURIA_ARENA_ACTIVE_EVENT__=null;
      }
      if(cupSignupPoll)localStorage.setItem(CUP_SIGNUP_POLL_KEY,JSON.stringify(cupSignupPoll));
      else localStorage.removeItem(CUP_SIGNUP_POLL_KEY);
      if(leagueSignupPoll)localStorage.setItem(LEAGUE_SIGNUP_POLL_KEY,JSON.stringify(leagueSignupPoll));
      else localStorage.removeItem(LEAGUE_SIGNUP_POLL_KEY);
    }catch(_e){
      window.__CENTURIA_ARENA_ACTIVE_EVENT__=activeEvent||null;
    }
    if(!remoteArenaStateApplyingV1012) queueRemoteArenaStateSaveV1012();
  };
  loadActiveEvent();

  const TEST_COMP_KEY="ca_arena_active_competition_v996";
  const CUP_SIGNUP_POLL_KEY="ca_arena_cup_signup_poll_v1026";
  const LEAGUE_SIGNUP_POLL_KEY="ca_arena_league_signup_poll_v1093";
  let testCompetition=null;
  let cupSignupPoll=null;
  let leagueSignupPoll=null;
  let remoteLeagueVotesV1093={};
  let remoteLeagueVotesLoadingV1093=false;
  let remoteCupVotesV1029={};
  let remoteCupVoteRowsV1029=[];
  let remoteCupVotesLoadingV1029=false;
  const loadCupSignupPoll=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(CUP_SIGNUP_POLL_KEY)||"null");
      cupSignupPoll=(saved&&saved.kind==="cup"&&Array.isArray(saved.participants))?saved:null;
    }catch(_e){ cupSignupPoll=null; }
    return cupSignupPoll;
  };
  const saveCupSignupPoll=()=>{
    try{
      if(cupSignupPoll)localStorage.setItem(CUP_SIGNUP_POLL_KEY,JSON.stringify(cupSignupPoll));
      else localStorage.removeItem(CUP_SIGNUP_POLL_KEY);
    }catch(_e){}
    if(!remoteArenaStateApplyingV1012) queueRemoteArenaStateSaveV1012();
  };
  loadCupSignupPoll();
  const loadLeagueSignupPollV1093=()=>{
    try{
      const poll=JSON.parse(localStorage.getItem(LEAGUE_SIGNUP_POLL_KEY)||'null');
      leagueSignupPoll=poll?.kind==='league'&&Array.isArray(poll.participants)?poll:null;
    }catch(_e){leagueSignupPoll=null;}
    return leagueSignupPoll;
  };
  const saveLeagueSignupPollV1093=()=>{
    try{
      if(leagueSignupPoll)localStorage.setItem(LEAGUE_SIGNUP_POLL_KEY,JSON.stringify(leagueSignupPoll));
      else localStorage.removeItem(LEAGUE_SIGNUP_POLL_KEY);
    }catch(_e){}
    if(!remoteArenaStateApplyingV1012)queueRemoteArenaStateSaveV1012();
  };
  loadLeagueSignupPollV1093();
  const loadTestCompetition=()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(TEST_COMP_KEY)||"null");
      testCompetition=saved&&saved.kind&&Array.isArray(saved.participants)?saved:null;
    }catch(_e){ testCompetition=null; }
    return testCompetition;
  };
  const saveTestCompetition=()=>{
    try{
      if(testCompetition)localStorage.setItem(TEST_COMP_KEY,JSON.stringify(testCompetition));
      else localStorage.removeItem(TEST_COMP_KEY);
    }catch(_e){}
    if(!remoteArenaStateApplyingV1012) queueRemoteArenaStateSaveV1012();
  };
  const playerPool=()=>{
    let live=[];
    try{ live=(window.getCenturiaArenaPlayers?.()||[]).map(x=>typeof x==="string"?x:x?.name).filter(Boolean); }catch(_e){}
    const fallback=P.map(x=>x[0]);
    // v10.12: only shared/persistent participants affect Arena-wide lists.
    // A manual draft nickname exists only while ADMIN is building a tournament
    // and must not make the Players/EVO page differ on one device.
    const activeParticipants=Array.isArray(testCompetition?.participants)?testCompetition.participants:[];
    return [...new Set([...live,...fallback,...activeParticipants].map(x=>String(x||"").trim()).filter(Boolean))];
  };
  const ARENA_BASE_EVO=1000;
  const ARENA_ELO_K=24;
  const isDemoFriendlyMatch=m=>/^F_SEED_/i.test(String(m?.id||""));
  const ensureArenaRatingEntry=(map,name)=>{
    const key=String(name||"").trim();
    if(!key)return null;
    if(!map.has(key))map.set(key,ARENA_BASE_EVO);
    return key;
  };
  // v10.61 — Cup: one game or two home/away legs per pairing.
  const cupLegCount=(comp=testCompetition)=>Number(comp?.matchLegs)===2?2:1;
  const cupLeg2Scored=m=>Number.isInteger(m?.leg2HomeScore)&&m.leg2HomeScore>=0&&Number.isInteger(m?.leg2AwayScore)&&m.leg2AwayScore>=0;
  const cupAggregate=m=>({home:Number(m.homeScore)+Number(m.leg2AwayScore),away:Number(m.awayScore)+Number(m.leg2HomeScore)});
  const cupMatchWinner=(m,comp=testCompetition)=>{
    if(!isScored(m))return null;
    if(cupLegCount(comp)===1)return m.homeScore===m.awayScore?null:(m.homeScore>m.awayScore?m.home:m.away);
    if(!cupLeg2Scored(m))return null;
    const score=cupAggregate(m);
    if(score.home!==score.away)return score.home>score.away?m.home:m.away;
    return [m.home,m.away].includes(m.tiebreakWinner)?m.tiebreakWinner:null;
  };
  const cupMatchFinished=(m,comp=testCompetition)=>!!cupMatchWinner(m,comp);
  const cupMatchScore=(m,comp=testCompetition)=>{
    if(!isScored(m))return '— : —';
    if(cupLegCount(comp)===1)return `${m.homeScore} : ${m.awayScore}`;
    if(!cupLeg2Scored(m))return `М1 ${m.homeScore}:${m.awayScore} · М2 —`;
    const score=cupAggregate(m);
    return `${score.home} : ${score.away}${score.home===score.away&&m.tiebreakWinner?' · пен.':''}`;
  };
  const pushRatedCompetitionMatch=(out,m,comp,sortOrder,createdAt)=>{
    if(!isScored(m))return;
    out.push({home:String(m.home||'').trim(),away:String(m.away||'').trim(),homeScore:m.homeScore,awayScore:m.awayScore,sortOrder,createdAt});
    if(comp?.kind==='cup'&&cupLegCount(comp)===2&&cupLeg2Scored(m)){
      out.push({home:String(m.away||'').trim(),away:String(m.home||'').trim(),homeScore:m.leg2HomeScore,awayScore:m.leg2AwayScore,sortOrder:sortOrder+0.01,createdAt});
    }
  };
  const collectArenaRatedMatches=()=>{
    const rated=[];
    const archivedIds=new Set();
    try{
      ["league","cup"].forEach(kind=>{
        historyArchiveItems(kind).forEach((entry,ei)=>{
          if(entry?.competitionId)archivedIds.add(String(entry.competitionId));
          const rounds=Array.isArray(entry?.rounds)?entry.rounds:[];
          rounds.flatMap(r=>r?.matches||[]).forEach((m,mi)=>{
            pushRatedCompetitionMatch(rated,m,{kind,matchLegs:entry.matchLegs},ei*100+mi,String(entry.completedAt||`ARCHIVE_${kind}_${ei}_${mi}`));
          });
        });
      });
    }catch(_e){}
    const compMatches=(testCompetition?.id && archivedIds.has(String(testCompetition.id)))?[]:allMatches();
    compMatches.forEach((m,i)=>{
      pushRatedCompetitionMatch(rated,m,testCompetition,5000+i,String(testCompetition?.createdAt||`COMP_${i}`));
    });
    getFriendlyMatchesCombinedV1007().forEach((m,i)=>{
      if(!friendlyIsScored(m) || isDemoFriendlyMatch(m))return;
      rated.push({home:String(m.home||"").trim(),away:String(m.away||"").trim(),homeScore:Number(m.homeScore),awayScore:Number(m.awayScore),sortOrder:10000+i,createdAt:String(m.createdAt||`FR_${i}`)});
    });
    rated.sort((a,b)=>{
      const at=Date.parse(a.createdAt);
      const bt=Date.parse(b.createdAt);
      const av=Number.isFinite(at)?at:a.sortOrder;
      const bv=Number.isFinite(bt)?bt:b.sortOrder;
      return av-bv || a.sortOrder-b.sortOrder;
    });
    return rated.filter(m=>m.home && m.away && m.home!==m.away);
  };
  const computeArenaRatings=()=>{
    const ratings=new Map();
    playerPool().forEach(name=>ensureArenaRatingEntry(ratings,name));
    for(const m of collectArenaRatedMatches()){
      const home=ensureArenaRatingEntry(ratings,m.home);
      const away=ensureArenaRatingEntry(ratings,m.away);
      if(!home||!away||home===away)continue;
      const ra=Number(ratings.get(home)||ARENA_BASE_EVO);
      const rb=Number(ratings.get(away)||ARENA_BASE_EVO);
      const expectedHome=1/(1+Math.pow(10,(rb-ra)/400));
      const expectedAway=1-expectedHome;
      const scoreHome=m.homeScore>m.awayScore?1:(m.homeScore<m.awayScore?0:0.5);
      const scoreAway=1-scoreHome;
      const goalDiff=Math.abs(Number(m.homeScore)-Number(m.awayScore));
      const factor=ARENA_ELO_K*(1+Math.min(0.4,Math.max(0,goalDiff-1)*0.08));
      const nextHome=Math.round(ra + factor*(scoreHome-expectedHome));
      const nextAway=Math.round(rb + factor*(scoreAway-expectedAway));
      ratings.set(home,nextHome);
      ratings.set(away,nextAway);
    }
    return ratings;
  };
  const ratingFor=n=>{
    const key=String(n||"").trim();
    if(!key)return ARENA_BASE_EVO;
    return Math.round(computeArenaRatings().get(key)||ARENA_BASE_EVO);
  };
  const clubFor=n=>String(effectivePlayerPrefV1011(n)?.favoriteTeam||P.find(x=>x[0]===n)?.[2]||"Centuria").trim()||"Centuria";
  const teamPhotoFor=_n=>""; // v9.87: emblems only come from ADMIN Club Database

  const HISTORY_ARCHIVE_KEY="ca_arena_history_archive_v992";
  let historyArchive={cup:[],league:[]};
  const formatArenaArchiveDate=d=>{
    const date=d?new Date(d):new Date();
    if(Number.isNaN(date.getTime())) return "";
    const day=String(date.getDate()).padStart(2,'0');
    const mon=String(date.getMonth()+1).padStart(2,'0');
    const year=String(date.getFullYear());
    return `${day}.${mon}.${year}`;
  };
  const historySeedArchive=()=>({cup:[],league:[]});
  const mergeHistoryArchive=(base,extra)=>{
    const mergeList=(seed,saved)=>{
      const map=new Map();
      [...(Array.isArray(seed)?seed:[]),...(Array.isArray(saved)?saved:[])].forEach(item=>{
        if(!item || typeof item!== 'object') return;
        const key=String(item.archiveId||item.competitionId||item.title||`${item.kind||'event'}_${map.size+1}`);
        map.set(key,{...item,archiveId:key});
      });
      return [...map.values()].sort((a,b)=>Date.parse(b.completedAt||'')-Date.parse(a.completedAt||'') || String(b.date||'').localeCompare(String(a.date||'')) || String(b.title||'').localeCompare(String(a.title||'')));
    };
    return {
      cup:mergeList(base?.cup,extra?.cup),
      league:mergeList(base?.league,extra?.league)
    };
  };
  const loadHistoryArchive=()=>{
    const seed=historySeedArchive();
    let saved={cup:[],league:[]};
    try{
      const raw=JSON.parse(localStorage.getItem(HISTORY_ARCHIVE_KEY)||"null");
      if(raw && typeof raw==='object') saved=raw;
    }catch(_e){ saved={cup:[],league:[]}; }
    historyArchive=mergeHistoryArchive(seed,saved);
    return historyArchive;
  };
  const saveHistoryArchive=()=>{
    try{ localStorage.setItem(HISTORY_ARCHIVE_KEY,JSON.stringify(historyArchive||{cup:[],league:[]})); }catch(_e){}
    if(!remoteArenaStateApplyingV1012) queueRemoteArenaStateSaveV1012();
  };
  const historyArchiveItems=kind=>{
    loadHistoryArchive();
    return Array.isArray(historyArchive?.[kind]) ? historyArchive[kind] : [];
  };
  const isCompetitionCompleted=comp=>!!(comp && (comp.kind==='league'
    ? (comp.leagueFormat==='top4' ? !!comp.champion
      : comp.leagueFormat==='swiss' ? (comp.rounds||[]).length>=Math.max(1,Number(comp.swissRounds)||1) && (comp.rounds||[]).every(leagueRoundDoneV1093)
      : (comp.rounds||[]).every(leagueRoundDoneV1093)) : !!comp.champion));
  const nextHistoryOrdinalForKind=kind=>{
    const prefix=kind==='cup' ? 'CENTURIA CUP #' : 'CENTURIA LEAGUE #';
    const all=historyArchiveItems(kind);
    let max=0;
    all.forEach(entry=>{
      const m=String(entry?.title||'').match(/#(\d+)$/);
      if(m) max=Math.max(max, Number(m[1])||0);
    });
    return `${prefix}${max+1}`;
  };
  const buildHistoryArchiveSnapshot=comp=>{
    if(!isCompetitionCompleted(comp)) return null;
    loadHistoryArchive();
    const list=historyArchive?.[comp.kind]||[];
    const existing=list.find(x=>String(x?.competitionId||'')===String(comp.id||''))||null;
    const participantClubs={};
    (comp.participants||[]).forEach(name=>{ participantClubs[name]=canonicalTeamName(comp.participantClubs?.[name]||clubFor(name)); });
    const completedAt=existing?.completedAt || comp.completedAt || new Date().toISOString();
    const title=existing?.title || comp.title || comp.archiveTitle || nextHistoryOrdinalForKind(comp.kind);
    if(comp.kind==='league'){
      const standings=leagueStandings().map(row=>({...row,club:participantClubs[row.name]||canonicalTeamName(clubFor(row.name))}));
      const winner=String(comp.champion||standings[0]?.name||'');
      return {
        archiveId:String(existing?.archiveId||comp.id||title),
        competitionId:String(comp.id||title),
        kind:'league',
        title,
        date:formatArenaArchiveDate(completedAt),
        completedAt,
        winner,
        winnerClub:participantClubs[winner]||canonicalTeamName(clubFor(winner)),
        participantClubs,
        leagueFormat:String(comp.leagueFormat||'single'),
        cover:String(comp.cover||''),
        standings,
        rounds:(comp.rounds||[]).map(round=>({round:round.round,playoff:String(round.playoff||''),label:String(round.label||`ТУР ${round.round}`),matches:(round.matches||[]).map(match=>({id:String(match.id||''),home:match.home,away:match.away,homeClub:participantClubs[match.home]||canonicalTeamName(clubFor(match.home)),awayClub:participantClubs[match.away]||canonicalTeamName(clubFor(match.away)),homeScore:Number.isFinite(match.homeScore)?Number(match.homeScore):null,awayScore:Number.isFinite(match.awayScore)?Number(match.awayScore):null,tiebreakWinner:String(match.tiebreakWinner||'')}))}))
      };
    }
    const rounds=(comp.rounds||[]).map(round=>({
      round:round.round,
      label:round.label||cupLabel((round.matches||[]).length*2 + (round.byes||[]).length),
      byes:[...(round.byes||[])],
      matches:(round.matches||[]).map(match=>({
        home:match.home,
        away:match.away,
        homeClub:participantClubs[match.home]||canonicalTeamName(clubFor(match.home)),
        awayClub:participantClubs[match.away]||canonicalTeamName(clubFor(match.away)),
        homeScore:Number.isFinite(match.homeScore)?Number(match.homeScore):null,
        awayScore:Number.isFinite(match.awayScore)?Number(match.awayScore):null,
        leg2HomeScore:Number.isFinite(match.leg2HomeScore)?Number(match.leg2HomeScore):null,
        leg2AwayScore:Number.isFinite(match.leg2AwayScore)?Number(match.leg2AwayScore):null,
        tiebreakWinner:String(match.tiebreakWinner||'')
      }))
    }));
    const winner=String(comp.champion||rounds.at(-1)?.matches?.[0]?.home||'');
    return {
      archiveId:String(existing?.archiveId||comp.id||title),
      competitionId:String(comp.id||title),
      kind:'cup',
      title,
      date:formatArenaArchiveDate(completedAt),
      completedAt,
      winner,
      winnerClub:participantClubs[winner]||canonicalTeamName(clubFor(winner)),
      participantClubs,
      matchLegs:cupLegCount(comp),
      voteSourceId:String(comp.voteSourceId||''),
      rounds
    };
  };
  const syncHistoryArchiveFromCompetition=(comp=testCompetition)=>{
    const snap=buildHistoryArchiveSnapshot(comp);
    if(!snap) return null;
    loadHistoryArchive();
    const key=snap.kind==='cup'?'cup':'league';
    const list=[...(historyArchive[key]||[])];
    const idx=list.findIndex(x=>String(x?.archiveId||'')===String(snap.archiveId) || String(x?.competitionId||'')===String(snap.competitionId));
    if(idx>=0) list[idx]={...list[idx],...snap};
    else list.unshift(snap);
    list.sort((a,b)=>Date.parse(b.completedAt||'')-Date.parse(a.completedAt||'') || String(b.title||'').localeCompare(String(a.title||'')));
    historyArchive[key]=list;
    saveHistoryArchive();
    if(comp && typeof comp==='object'){
      comp.archiveTitle=snap.title;
      comp.completedAt=snap.completedAt;
    }
    return snap;
  };
  loadHistoryArchive();
  const FRIENDLY_MATCHES_KEY="ca_arena_friendlies_v972";
  const FRIENDLY_CLEAR_MIGRATION_V998="ca_migration_friendlies_cleared_v998";
  const FRIENDLY_CLEAR_MIGRATION_V999="ca_migration_friendlies_cleared_v999";
  const HISTORY_CLEAR_MIGRATION_V994="ca_migration_history_cleared_v994";
  const HISTORY_CLEAR_MIGRATION_V995="ca_migration_history_winners_cleared_v995";
  let friendlyMatches=[];
  const runHistoryClearMigrationV994=()=>{
    try{
      if(localStorage.getItem(HISTORY_CLEAR_MIGRATION_V994)!=="1"){
        historyArchive={cup:[],league:[]};
        localStorage.setItem(HISTORY_ARCHIVE_KEY,JSON.stringify(historyArchive));
        localStorage.setItem(HISTORY_CLEAR_MIGRATION_V994,"1");
      }
    }catch(_e){ historyArchive={cup:[],league:[]}; }
  };
  const runHistoryClearMigrationV995=()=>{
    try{
      if(localStorage.getItem(HISTORY_CLEAR_MIGRATION_V995)!=="1"){
        historyArchive={cup:[],league:[]};
        localStorage.setItem(HISTORY_ARCHIVE_KEY,JSON.stringify(historyArchive));
        localStorage.setItem(HISTORY_CLEAR_MIGRATION_V995,"1");
      }
    }catch(_e){ historyArchive={cup:[],league:[]}; }
  };
  const runFriendlyClearMigrationV998=()=>{
    try{
      if(localStorage.getItem(FRIENDLY_CLEAR_MIGRATION_V998)!=="1"){
        friendlyMatches=[];
        localStorage.setItem(FRIENDLY_MATCHES_KEY,"[]");
        localStorage.setItem(FRIENDLY_CLEAR_MIGRATION_V998,"1");
      }
    }catch(_e){ friendlyMatches=[]; }
  };
  const runFriendlyClearMigrationV999=()=>{
    try{
      if(localStorage.getItem(FRIENDLY_CLEAR_MIGRATION_V999)!=="1"){
        friendlyMatches=[];
        localStorage.setItem(FRIENDLY_MATCHES_KEY,"[]");
        localStorage.setItem(FRIENDLY_CLEAR_MIGRATION_V999,"1");
      }
    }catch(_e){ friendlyMatches=[]; }
  };
  const currentArenaPlayerName=()=>String(window.getCenturiaCurrentPlayerName?.()||"Osetskyi_3").trim()||"Osetskyi_3";
  const scoreNum=v=>(v===null||v===undefined||String(v).trim()==="")?NaN:Number(v);
  const friendlyIsScored=m=>Number.isInteger(scoreNum(m?.homeScore))&&Number.isInteger(scoreNum(m?.awayScore));
  const normalizeFriendlyMatch=(m,i=0)=>{
    const home=String(m?.home||"").trim();
    const away=String(m?.away||"").trim();
    if(!home||!away)return null;
    const hs=(m?.homeScore===null||m?.homeScore===undefined||m?.homeScore==="")?null:Number(m.homeScore);
    const as=(m?.awayScore===null||m?.awayScore===undefined||m?.awayScore==="")?null:Number(m.awayScore);
    return {
      id:String(m?.id||`F${Date.now()}_${i}`),
      home,away,
      homeClub:String(m?.homeClub||clubFor(home)||"Centuria").trim()||"Centuria",
      awayClub:String(m?.awayClub||clubFor(away)||"Centuria").trim()||"Centuria",
      homeScore:Number.isInteger(hs)&&hs>=0?hs:null,
      awayScore:Number.isInteger(as)&&as>=0?as:null,
      createdAt:String(m?.createdAt||new Date().toISOString())
    };
  };
  const defaultFriendlyMatches=()=>[];
  const saveFriendlyMatches=()=>{
    try{localStorage.setItem(FRIENDLY_MATCHES_KEY,JSON.stringify(friendlyMatches||[]));}catch(_e){}
  };
  const loadFriendlyMatches=()=>{
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(FRIENDLY_MATCHES_KEY)||"null");}catch(_e){saved=null;}
    if(Array.isArray(saved)) friendlyMatches=saved.map(normalizeFriendlyMatch).filter(Boolean).filter(m=>!isDemoFriendlyMatch(m));
    else {friendlyMatches=defaultFriendlyMatches();saveFriendlyMatches();}
    friendlyMatches.forEach(m=>{
      if(friendlyIsScored(m)){
        upsertClubDatabase(m.homeClub,undefined);
        upsertClubDatabase(m.awayClub,undefined);
      }
    });
    return friendlyMatches;
  };

  let friendlyRemoteRowsV1007=[];
  let friendlyRemoteLoadingV1007=false;
  let friendlyRemoteSubscribedV1007=false;
  let friendlyRemotePollV1007=0;

  const friendlyApiV1007=()=>window.CenturiaArenaFriendlyApi||null;
  const friendlyRemoteMeV1007=()=>friendlyApiV1007()?.me?.()||null;

  const remoteFriendlyToMatchV1007=row=>{
    if(!row || !["accepted","completed"].includes(String(row.status||""))) return null;
    return normalizeFriendlyMatch({
      id:`DB_${row.id}`,
      home:row.sender_player,
      away:row.recipient_player,
      homeClub:row.sender_club,
      awayClub:row.recipient_club||clubFor(row.recipient_player),
      homeScore:row.home_score,
      awayScore:row.away_score,
      createdAt:row.created_at
    });
  };

  const getFriendlyRemoteMatchesV1007=()=>friendlyRemoteRowsV1007
    .map(remoteFriendlyToMatchV1007)
    .filter(Boolean);

  const getFriendlyMatchesCombinedV1007=()=>{
    const remote=getFriendlyRemoteMatchesV1007();
    // v10.12: authenticated Arena uses Supabase as the only canonical source.
    // Old localStorage friendlies are kept only as an offline fallback so they
    // cannot make EVO/match lists differ between two logged-in accounts.
    if(friendlyApiV1007()?.isReady?.()) return remote;
    return loadFriendlyMatches();
  };

  const refreshRemoteFriendliesV1007=async(redraw=true)=>{
    const api=friendlyApiV1007();
    if(!api?.isReady?.() || !api?.list || friendlyRemoteLoadingV1007) return friendlyRemoteRowsV1007;
    friendlyRemoteLoadingV1007=true;
    try{
      const rows=await api.list();
      friendlyRemoteRowsV1007=Array.isArray(rows)?rows:[];
      friendlyRemoteRowsV1007.forEach(row=>{
        if(["accepted","completed"].includes(String(row?.status||""))){
          upsertClubDatabase(row.sender_club,undefined);
          if(row.recipient_club) upsertClubDatabase(row.recipient_club,undefined);
        }
      });
      if(redraw && (route==="friendly" || route==="home")) draw();
    }catch(err){
      console.warn("Arena friendly refresh",err);
    }finally{
      friendlyRemoteLoadingV1007=false;
    }
    return friendlyRemoteRowsV1007;
  };

  const ensureFriendlyRealtimeV1007=()=>{
    const api=friendlyApiV1007();
    if(!api?.isReady?.()) return;
    if(!friendlyRemoteSubscribedV1007 && api.subscribe){
      friendlyRemoteSubscribedV1007=true;
      api.subscribe(()=>refreshRemoteFriendliesV1007(true));
    }
    if(!friendlyRemotePollV1007){
      friendlyRemotePollV1007=setInterval(()=>{
        if(route==="friendly" || route==="home") refreshRemoteFriendliesV1007(true);
      },5000);
    }
  };
  const friendlyRemoteRowForMatchV1010=matchId=>{
    const raw=String(matchId||"");
    if(!raw.startsWith("DB_"))return null;
    return (friendlyRemoteRowsV1007||[]).find(row=>String(row?.id)===raw.slice(3))||null;
  };
  const friendlyIsParticipantV1010=row=>{
    const uid=friendlyRemoteMeV1007()?.user_id;
    return !!uid && !!row && (row.sender_user_id===uid || row.recipient_user_id===uid);
  };
  const friendlyNeedsMyResultConfirmationV1010=row=>{
    const uid=friendlyRemoteMeV1007()?.user_id;
    return !!uid && !!row && row.status==="accepted" && row.result_proposal_status==="pending" && row.result_proposed_by && row.result_proposed_by!==uid && (row.sender_user_id===uid || row.recipient_user_id===uid);
  };
  const friendlyActionCountV1010=()=>{
    const uid=friendlyRemoteMeV1007()?.user_id;
    if(!uid)return 0;
    return (friendlyRemoteRowsV1007||[]).filter(row=>
      (row.status==="pending" && row.recipient_user_id===uid) || friendlyNeedsMyResultConfirmationV1010(row) ||
      (isArenaAdmin() && row.status==='accepted' && row.result_proposal_status==='pending')
    ).length;
  };
  const matchProposalV1067=m=>m?.proposal?.status==='pending'?m.proposal:null;
  const canPlayerActV1067=m=>isArenaAdmin()||!!(linkedArenaPlayerName()&&(sameArenaPlayer(linkedArenaPlayerName(),m?.home)||sameArenaPlayer(linkedArenaPlayerName(),m?.away)));
  const canConfirmMatchV1067=m=>!!matchProposalV1067(m)&&(isArenaAdmin()||(canPlayerActV1067(m)&&matchProposalV1067(m).proposedBy!==String(window.CenturiaArenaFriendlyApi?.me?.()?.user_id||'')));
  const matchPendingHtmlV1067=m=>matchProposalV1067(m)?`<span class="arena-match-pending-v1067">⏳ РЕЗУЛЬТАТ ОЧІКУЄ ПІДТВЕРДЖЕННЯ${canConfirmMatchV1067(m)?' · ТВОЯ ДІЯ':''}</span>`:(m?.proposalStatus==='rejected'?'<span class="arena-match-pending-v1067 is-rejected">❌ РАХУНОК ВІДХИЛЕНО · МОЖНА НАДІСЛАТИ НОВИЙ</span>':'');
  const matchActionTextV1067=m=>matchProposalV1067(m)?(canConfirmMatchV1067(m)?'ПІДТВЕРДИТИ':'ОЧІКУЄ ПІДТВЕРДЖЕННЯ'):(testCompetition?.kind==='cup'&&cupLegCount(testCompetition)===2&&isScored(m)?'ВНЕСТИ МАТЧ 2':'ВНЕСТИ РЕЗУЛЬТАТ');
  const matchActionButtonV1067=(m,small=false)=>canPlayerActV1067(m)?`<button type="button" class="${small?'arena-mini-result-v927':'arena-primary-v852 arena-cup-btn-v969'}" onclick="ArenaV852.modalResult('${jsq(m.id)}')">${matchActionTextV1067(m)}</button>`:'';
  const leagueActionCountV1016=()=>{
    if(testCompetition?.kind!=="league")return 0;
    const me=linkedArenaPlayerName();if(!me)return 0;
    return (currentLeagueRound()?.matches||[]).filter(m=>!isScored(m)&&(sameArenaPlayer(me,m.home)||sameArenaPlayer(me,m.away))).length;
  };
  // v10.86 — Cup badge is personal, NOT an administrator's pending-results queue.
  // Only show the badge for the logged-in player's own assigned, unfinished matches.
  const cupActionCountV1016=()=>{
    if(testCompetition?.kind!=="cup" || testCompetition?.champion)return 0;
    const viewer=linkedArenaPlayerName();
    if(!viewer || !(testCompetition.participants||[]).some(name=>sameArenaPlayer(name,viewer)))return 0;
    return (currentCupRound()?.matches||[]).filter(m=>
      (sameArenaPlayer(m?.home,viewer)||sameArenaPlayer(m?.away,viewer)) &&
      !cupMatchFinished(m,testCompetition)
    ).length;
  };
  const arenaTileBadgeHtmlV1016=count=>{
    const value=Math.max(0,Number(count)||0);
    return value?`<span class="arena-friendly-alert-v1010 arena-route-alert-v1016" aria-label="Є нові події"><b>${value>9?'9+':value}</b></span>`:"";
  };

  const isArenaAdmin=()=>String(window.getCenturiaAuthRole?.()||"viewer").toLowerCase()==="admin";
  const linkedArenaPlayerName=()=>String(window.getCenturiaCurrentPlayerName?.()||"").trim();
  const currentArenaViewerName=()=>linkedArenaPlayerName();
  const sameArenaPlayer=(a,b)=>String(a||"").trim().toLocaleLowerCase()===String(b||"").trim().toLocaleLowerCase();
  const cupPollStillActive=poll=>!!(poll&&Number(poll.endsAt||0)>Date.now());
  const cupPollTimeLeftMs=poll=>Math.max(0,Number(poll?.endsAt||0)-Date.now());
  const formatCupPollTimeLeft=poll=>{
    const totalMs=cupPollTimeLeftMs(poll);
    if(!totalMs)return 'ЗАВЕРШЕНО';
    const totalMin=Math.ceil(totalMs/60000);
    const days=Math.floor(totalMin/1440);
    const hours=Math.floor((totalMin%1440)/60);
    const mins=totalMin%60;
    if(days>0)return `${days}д ${hours}г`;
    if(hours>0)return `${hours}г ${mins}хв`;
    return `${mins}хв`;
  };
  const cupPollVoteFor=(poll,name)=>{
    const key=String(name||'').trim();
    if(!key)return '';
    const remoteKey=Object.keys(remoteCupVotesV1029||{}).find(n=>sameArenaPlayer(n,key));
    const localKey=Object.keys(poll?.votes||{}).find(n=>sameArenaPlayer(n,key));
    return String((remoteKey?remoteCupVotesV1029[remoteKey]:undefined) ?? (localKey?poll?.votes?.[localKey]:undefined) ?? '').trim().toLowerCase();
  };
  const cupPollAllPlayers=poll=>{
    const names=[...(poll?.participants||[]),...Object.keys(remoteCupVotesV1029||{})];
    return names.filter((name,i,arr)=>name && arr.findIndex(x=>sameArenaPlayer(x,name))===i);
  };
  const cupPollConfirmedPlayers=poll=>cupPollAllPlayers(poll).filter(name=>cupPollVoteFor(poll,name)==='yes');
  const cupPollDeclinedPlayers=poll=>cupPollAllPlayers(poll).filter(name=>cupPollVoteFor(poll,name)==='no');
  const cupPollPendingPlayers=poll=>(poll?.participants||[]).filter(name=>!cupPollVoteFor(poll,name));
  const cupPollParticipantClubFor=(poll,name)=>String(poll?.participantClubs?.[name]||clubFor(name)||'Centuria').trim()||'Centuria';
  const shuffleCupDrawV1032=list=>{
    const out=[...(list||[])];
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  };
  // Independent CSPRNG Fisher–Yates for a one-time, non-rerollable League draw.
  const secureLeagueShuffleV1095=list=>{
    const out=[...(list||[])];
    const uint32=new Uint32Array(1);
    const rng=globalThis.crypto?.getRandomValues ? max=>{
      const span=max+1,limit=Math.floor(4294967296/span)*span;
      do{globalThis.crypto.getRandomValues(uint32);}while(uint32[0]>=limit);
      return uint32[0]%span;
    } : max=>Math.floor(Math.random()*(max+1));
    for(let i=out.length-1;i>0;i--){
      const j=rng(i);
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  };
  const cupDrawClubDeckV1032=(clubs,count)=>{
    const base=[...new Set((clubs||[]).map(x=>canonicalTeamName(String(x||'').trim())).filter(Boolean))];
    const out=[];
    if(!base.length)return out;
    while(out.length<count) out.push(...shuffleCupDrawV1032(base));
    return out.slice(0,count);
  };
  const canEditArenaFavoriteTeam=name=>isArenaAdmin() || (!!linkedArenaPlayerName() && sameArenaPlayer(linkedArenaPlayerName(),name));
  // v10.63 — Trophy counts come from the actual completed Arena archives,
  // not from EVO or manually entered values. Include a just-finished tournament
  // while its archive is syncing; do not count the same competition twice.
  const arenaTrophiesForV1063=name=>{
    const totals={cup:0,league:0,total:0};
    if(!String(name||'').trim())return totals;
    for(const kind of ['cup','league']){
      const seen=new Set();
      const entries=historyArchiveItems(kind);
      for(const entry of entries){
        if(!entry||typeof entry!=='object')continue;
        const key=String(entry.competitionId||entry.archiveId||`${kind}:${entry.title||''}:${entry.completedAt||entry.date||''}`).trim();
        if(seen.has(key))continue;
        seen.add(key);
        const winner=String(entry.winner||(kind==='league'?entry.standings?.[0]?.name:'')||'').trim();
        if(winner&&sameArenaPlayer(winner,name))totals[kind]++;
      }
      const active=testCompetition;
      if(active?.kind===kind && isCompetitionCompleted(active)){
        const activeKey=String(active.id||active.archiveId||`${kind}:${active.title||''}:${active.completedAt||''}`).trim();
        if(!seen.has(activeKey)){
          const winner=kind==='cup'?active.champion:leagueStandings()[0]?.name;
          if(winner&&sameArenaPlayer(winner,name))totals[kind]++;
        }
      }
    }
    totals.total=totals.cup+totals.league;
    return totals;
  };
  const arenaRecordFor=(name)=>{
    const key=String(name||"").trim();
    const stats={w:0,d:0,l:0};
    for(const m of collectArenaRatedMatches()){
      if(m.home!==key && m.away!==key)continue;
      const isHome=m.home===key;
      const gf=isHome?m.homeScore:m.awayScore;
      const ga=isHome?m.awayScore:m.homeScore;
      if(gf>ga)stats.w++;
      else if(gf<ga)stats.l++;
      else stats.d++;
    }
    return stats;
  };
  const arenaPlayerList=()=>{
    let live=[];
    try{ live=window.getCenturiaArenaPlayers?.()||[]; }catch(_e){ live=[]; }
    const baseOrder=P.map(x=>x[0]);
    const extras=live.map(x=>String(x?.name||"").trim()).filter(Boolean).filter(n=>!baseOrder.includes(n));
    const names=[...baseOrder,...extras];
    const list=names.map(name=>{
      const base=P.find(x=>x[0]===name);
      const livePlayer=live.find(x=>String(x?.name||"").trim()===name)||{};
      const prefs=effectivePlayerPrefV1011(name);
      return {
        name,
        evo:ratingFor(name),
        favoriteTeam:String(prefs.favoriteTeam||base?.[2]||"Centuria").trim()||"Centuria",
        favoriteTeamPhoto:"",
        cardImage:livePlayer.cardImage||"",
        number:livePlayer.number||"",
        primaryPos:livePlayer.primaryPos||"",
        status:livePlayer.status||"",
        record:arenaRecordFor(name)
      };
    }).sort((a,b)=>b.evo-a.evo||a.name.localeCompare(b.name));
    list.forEach((p,i)=>p.rank=i+1);
    return list;
  };
  const arenaPlayerByName=name=>arenaPlayerList().find(p=>p.name===name)||{name:String(name||""),evo:ratingFor(name),favoriteTeam:clubFor(name),favoriteTeamPhoto:"",record:{w:0,d:0,l:0},rank:0,cardImage:"",number:"",primaryPos:"",status:""};
  const playerCardThumb=p=>p?.cardImage
    ? `<div class="arena-pcard-v852 arena-pcard-real-v930"><img src="${esc(p.cardImage)}" alt="${esc(p.name)}"></div>`
    : `<div class="arena-pcard-v852 arena-pcard-real-v930"><span class="arena-pcard-fallback-v930">${esc(p?.name||"")}</span></div>`;
  const crestLabel=team=>C[team]||"⚽";
  const normalizeTeamName=team=>String(team||"").toLowerCase().trim().replace(/\s+/g," ");
  const teamAliases={
    "manchester united":"Manchester United",
    "man united":"Manchester United",
    "man utd":"Manchester United",
    "real madrid":"Real Madrid",
    "arsenal":"Arsenal",
    "barcelona":"Barcelona",
    "fc barcelona":"Barcelona",
    "milan":"Milan",
    "ac milan":"Milan",
    "chelsea":"Chelsea",
    "chelsea fc":"Chelsea",
    "liverpool":"Liverpool",
    "liverpool fc":"Liverpool",
    "juventus":"Juventus",
    "juve":"Juventus",
    "bayern munich":"Bayern Munich",
    "bayern":"Bayern Munich",
    "psg":"PSG",
    "paris saint-germain":"PSG",
    "paris saint germain":"PSG",
    "inter":"Inter",
    "internazionale":"Inter",
    "inter milan":"Inter",
    "centuria":"Centuria",
  };
  const teamThemeMap={
    "Manchester United":{bg1:"#b91c1c",bg2:"#5b0a0a",ring:"#f7d774",text:"MU"},
    "Real Madrid":{bg1:"#f3f4f6",bg2:"#d1d5db",ring:"#d4af37",text:"RM",fg:"#1f2937"},
    "Arsenal":{bg1:"#dc2626",bg2:"#7f1d1d",ring:"#f0d27b",text:"AFC"},
    "Barcelona":{bg1:"#1d4ed8",bg2:"#7c2d12",ring:"#f0c55a",text:"BAR"},
    "Milan":{bg1:"#111827",bg2:"#7f1d1d",ring:"#d4af37",text:"MIL"},
    "Chelsea":{bg1:"#1d4ed8",bg2:"#1e3a8a",ring:"#f4d27a",text:"CFC"},
    "Liverpool":{bg1:"#b91c1c",bg2:"#7f1d1d",ring:"#f1d48b",text:"LIV"},
    "Juventus":{bg1:"#111827",bg2:"#374151",ring:"#f3f4f6",text:"JUV"},
    "Bayern Munich":{bg1:"#dc2626",bg2:"#1d4ed8",ring:"#f5f5f5",text:"FCB"},
    "PSG":{bg1:"#1e3a8a",bg2:"#7f1d1d",ring:"#e5e7eb",text:"PSG"},
    "Inter":{bg1:"#0f172a",bg2:"#1d4ed8",ring:"#d4af37",text:"INT"},
    "Centuria":{bg1:"#d4a12e",bg2:"#5b3a0a",ring:"#fff0b3",text:"CA",fg:"#201505"}
  };
  const CLUB_DB_KEY="ca_arena_club_database_v945";
  const CLUB_DB_DELETED_KEY="ca_arena_club_database_deleted_v946";
  let clubDatabase=[];
  let clubDatabaseDeleted=[];
  let remoteClubDatabaseV1009=[];
  let remoteClubDatabaseLoadedV1009=false;
  let remoteClubDatabaseLoadingV1009=false;
  let remoteClubPollV1009=0;
  const CLUB_REMOTE_MIGRATION_V1009="ca_arena_clubs_remote_migrated_v1009";
  const loadClubDatabaseDeleted=()=>{
    try{
      const raw=JSON.parse(localStorage.getItem(CLUB_DB_DELETED_KEY)||"[]");
      clubDatabaseDeleted=Array.isArray(raw)?raw.map(x=>normalizeTeamName(x)).filter(Boolean):[];
    }catch(_e){clubDatabaseDeleted=[];}
    return clubDatabaseDeleted;
  };
  const saveClubDatabaseDeleted=()=>{
    try{localStorage.setItem(CLUB_DB_DELETED_KEY,JSON.stringify([...new Set(clubDatabaseDeleted||[])]));}catch(_e){}
  };
  const clubDbFind=name=>{
    const key=normalizeTeamName(name);
    if(!key)return null;
    return clubDatabase.find(c=>normalizeTeamName(c?.name)===key)||null;
  };
  const saveClubDatabase=()=>{
    try{localStorage.setItem(CLUB_DB_KEY,JSON.stringify(clubDatabase||[]));}catch(_e){}
    try{window.__CENTURIA_CLUB_DATABASE__=(clubDatabase||[]).map(c=>({...c}));}catch(_e){}
  };
  const loadClubDatabase=()=>{
    let saved=[];
    try{
      const raw=JSON.parse(localStorage.getItem(CLUB_DB_KEY)||"[]");
      if(Array.isArray(raw))saved=raw;
    }catch(_e){saved=[];}
    loadClubDatabaseDeleted();
    // Once the shared DB has loaded, device-specific deletion/cache state must
    // not change what another account sees.
    const deleted=new Set(remoteClubDatabaseLoadedV1009?[]:(clubDatabaseDeleted||[]));
    const map=new Map();
    const put=(name,logo="")=>{
      name=String(name||"").trim();
      if(!name)return;
      const key=normalizeTeamName(name);
      if(deleted.has(key))return;
      const prev=map.get(key);
      const cleanLogo=String(logo||"").trim();
      if(!prev)map.set(key,{name,logo:cleanLogo});
      else if(!prev.logo&&cleanLogo)prev.logo=cleanLogo;
    };
    if(remoteClubDatabaseLoadedV1009){
      // v10.15: after the shared DB has loaded, it is the ONLY source of
      // clubs that belong to "База клубів". This makes DELETE real: a club
      // removed from Supabase is no longer silently re-created from defaults,
      // player favorites or old local data.
      (remoteClubDatabaseV1009||[]).forEach(c=>put(c?.name,c?.logo));
    }else{
      // Offline / first-load fallback before Supabase answers.
      Object.keys(teamThemeMap).forEach(name=>put(name,""));
      P.forEach(row=>put(row?.[2],""));
      saved.forEach(c=>put(c?.name,c?.logo));
      Object.values(playerArenaPrefs||{}).forEach(pref=>put(pref?.favoriteTeam,""));
    }

    clubDatabase=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"}));
    saveClubDatabase();
    return clubDatabase;
  };
  const clubDbNames=()=>loadClubDatabase().map(c=>c.name);
  const clubLogoFor=team=>String(clubDbFind(team)?.logo||"").trim();
  const upsertClubDatabase=(name,logo,opts={})=>{
    name=String(name||"").trim();
    if(!name)return null;
    loadClubDatabase();
    const newKey=normalizeTeamName(name);
    clubDatabaseDeleted=(clubDatabaseDeleted||[]).filter(k=>k!==newKey);
    saveClubDatabaseDeleted();
    const renameFrom=String(opts.renameFrom||"").trim();
    if(renameFrom&&normalizeTeamName(renameFrom)!==normalizeTeamName(name)){
      const oldKey=normalizeTeamName(renameFrom);

      // v9.88: a club rename is global. Every player profile that currently
      // points to the old club name must immediately follow the new name,
      // including players that were still using a fallback/default value.
      playerPool().forEach(player=>{
        if(normalizeTeamName(clubFor(player))===oldKey){
          playerArenaPrefs[player]={
            ...(playerArenaPrefs[player]||{}),
            favoriteTeam:name,
            favoriteTeamPhoto:""
          };
        }
      });
      Object.keys(playerArenaPrefs||{}).forEach(player=>{
        const pref=playerArenaPrefs[player];
        if(normalizeTeamName(pref?.favoriteTeam)===oldKey) pref.favoriteTeam=name;
      });
      savePlayerArenaPrefs();
      try{
        prefsApiV1011()?.renameClub?.(renameFrom,name)
          ?.then(()=>refreshRemotePlayerPrefsV1011(true))
          ?.catch(err=>console.warn("Arena favorite club rename sync",err));
      }catch(_e){}

      // Keep saved friendly-match club labels in sync with the renamed club.
      try{
        const saved=JSON.parse(localStorage.getItem(FRIENDLY_MATCHES_KEY)||"[]");
        if(Array.isArray(saved)){
          const renamed=saved.map(m=>({
            ...m,
            homeClub:normalizeTeamName(m?.homeClub)===oldKey?name:m?.homeClub,
            awayClub:normalizeTeamName(m?.awayClub)===oldKey?name:m?.awayClub
          }));
          localStorage.setItem(FRIENDLY_MATCHES_KEY,JSON.stringify(renamed));
          friendlyMatches=renamed.map(normalizeFriendlyMatch).filter(Boolean).filter(m=>!isDemoFriendlyMatch(m));
        }
      }catch(_e){}

      // Prevent built-in/default club names (e.g. "Centuria") from being
      // automatically re-added to the database after they were renamed.
      clubDatabase=clubDatabase.filter(c=>normalizeTeamName(c.name)!==oldKey);
      clubDatabaseDeleted=[...new Set([...(clubDatabaseDeleted||[]),oldKey])];
      saveClubDatabaseDeleted();
    }
    let entry=clubDbFind(name);
    const hasLogo=logo!==undefined&&logo!==null;
    if(entry){
      entry.name=name;
      if(hasLogo)entry.logo=String(logo||"").trim();
    }else{
      entry={name,logo:hasLogo?String(logo||"").trim():""};
      clubDatabase.push(entry);
    }
    clubDatabase.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"}));
    saveClubDatabase();
    return entry;
  };
  const removeClubDatabaseEntry=name=>{
    loadClubDatabase();
    const key=normalizeTeamName(name);
    if(!key)return false;
    clubDatabase=clubDatabase.filter(c=>normalizeTeamName(c.name)!==key);
    clubDatabaseDeleted=[...new Set([...(clubDatabaseDeleted||[]),key])];
    saveClubDatabaseDeleted();
    saveClubDatabase();
    return true;
  };
  const clubApiV1009=()=>window.CenturiaArenaClubApi||null;
  const migrateAdminClubLogosToRemoteV1009=async()=>{
    const api=clubApiV1009();
    if(!api?.isReady?.() || !api?.canWrite?.() || !api?.upsertMany)return;
    try{
      if(localStorage.getItem(CLUB_REMOTE_MIGRATION_V1009)==="1")return;
    }catch(_e){}
    // Read the ADMIN browser's existing local database before remote data can
    // replace it. This is where the already-uploaded custom emblems live.
    const localSnapshot=loadClubDatabase()
      .filter(c=>String(c?.logo||"").trim())
      .map(c=>({name:c.name,logo:c.logo||""}));
    try{
      await api.upsertMany(localSnapshot);
      try{localStorage.setItem(CLUB_REMOTE_MIGRATION_V1009,"1")}catch(_e){}
    }catch(err){
      console.warn("Arena club migration",err);
    }
  };
  const refreshRemoteClubDatabaseV1009=async(redraw=true)=>{
    const api=clubApiV1009();
    if(!api?.isReady?.() || !api?.list || remoteClubDatabaseLoadingV1009)return remoteClubDatabaseV1009;
    remoteClubDatabaseLoadingV1009=true;
    try{
      // First ADMIN open uploads the old local emblems to Supabase once.
      if(api?.canWrite?.()) await migrateAdminClubLogosToRemoteV1009();
      const rows=await api.list();
      remoteClubDatabaseV1009=(Array.isArray(rows)?rows:[]).map(r=>({
        name:String(r?.name||"").trim(),
        logo:String(r?.logo||"").trim()
      })).filter(c=>c.name);
      remoteClubDatabaseLoadedV1009=true;
      loadClubDatabase();
      if(redraw && document.getElementById("screen-arena")?.classList.contains("active"))draw();
    }catch(err){
      console.warn("Arena club refresh",err);
    }finally{
      remoteClubDatabaseLoadingV1009=false;
    }
    return remoteClubDatabaseV1009;
  };
  const ensureRemoteClubPollingV1009=()=>{
    if(remoteClubPollV1009)return;
    remoteClubPollV1009=setInterval(()=>{
      if(document.getElementById("screen-arena")?.classList.contains("active")){
        refreshRemoteClubDatabaseV1009(true);
      }
    },10000);
  };


  /* ========================================================
     v10.12 — full Arena shared state
     Supabase is canonical for active League/Cup, tournament results,
     active event and History. Existing club DB, favorites and friendlies
     are refreshed through one Arena-wide realtime bridge as well.
     ======================================================== */
  let remoteArenaStateLoadingV1012=false;
  let remoteArenaStateReadyV1012=false;
  let remoteArenaStateSaveTimerV1012=0;
  let remoteArenaStateSaveInFlightV1061=Promise.resolve();
  let remoteArenaStatePollV1012=0;
  let remoteArenaRealtimeBoundV1012=false;
  let remoteArenaLastUpdatedV1012='';
  const ARENA_STATE_SEEDED_V1012='ca_arena_global_state_seeded_v1012';
  const arenaStateApiV1012=()=>window.CenturiaArenaStateApi||null;
  const arenaRealtimeApiV1012=()=>window.CenturiaArenaRealtimeApi||null;
  const cloneArenaStateV1012=value=>{
    try{return value==null?value:JSON.parse(JSON.stringify(value));}catch(_e){return value;}
  };
  const arenaGlobalSnapshotV1012=()=>({
    activeCompetition:cloneArenaStateV1012(testCompetition),
    historyArchive:cloneArenaStateV1012(historyArchive||{cup:[],league:[]}),
    activeEvent:cloneArenaStateV1012(activeEvent),
    cupSignupPoll:cloneArenaStateV1012(cupSignupPoll)
  });
  const persistRemoteArenaStateLocallyV1012=()=>{
    try{
      if(testCompetition)localStorage.setItem(TEST_COMP_KEY,JSON.stringify(testCompetition));
      else localStorage.removeItem(TEST_COMP_KEY);
      localStorage.setItem(HISTORY_ARCHIVE_KEY,JSON.stringify(historyArchive||{cup:[],league:[]}));
      if(activeEvent){
        const raw=JSON.stringify(activeEvent);
        localStorage.setItem(ACTIVE_EVENT_KEY,raw);
        localStorage.setItem(ACTIVE_EVENT_LEGACY_KEY,raw);
        window.__CENTURIA_ARENA_ACTIVE_EVENT__=activeEvent;
      }else{
        localStorage.removeItem(ACTIVE_EVENT_KEY);
        localStorage.removeItem(ACTIVE_EVENT_LEGACY_KEY);
        window.__CENTURIA_ARENA_ACTIVE_EVENT__=null;
      }
      if(cupSignupPoll)localStorage.setItem(CUP_SIGNUP_POLL_KEY,JSON.stringify(cupSignupPoll));
      else localStorage.removeItem(CUP_SIGNUP_POLL_KEY);
      if(leagueSignupPoll)localStorage.setItem(LEAGUE_SIGNUP_POLL_KEY,JSON.stringify(leagueSignupPoll));
      else localStorage.removeItem(LEAGUE_SIGNUP_POLL_KEY);
    }catch(_e){}
  };
  const applyRemoteArenaStateV1012=(row,redraw=true)=>{
    remoteArenaStateApplyingV1012=true;
    try{
      const remoteComp=row?.active_competition;
      testCompetition=(remoteComp&&remoteComp.kind&&Array.isArray(remoteComp.participants))
        ? cloneArenaStateV1012(remoteComp)
        : null;
      const remoteHistory=row?.history_archive;
      historyArchive=mergeHistoryArchive(
        historySeedArchive(),
        (remoteHistory&&typeof remoteHistory==='object')?cloneArenaStateV1012(remoteHistory):{cup:[],league:[]}
      );
      const remoteEvent=row?.active_event;
      activeEvent=(remoteEvent&&remoteEvent.route&&remoteEvent.title)
        ? cloneArenaStateV1012(remoteEvent)
        : null;
      const remoteCupPoll=row?.active_event?.signup_poll ?? row?.cup_signup_poll ?? row?.cupSignupPoll;
      cupSignupPoll=(remoteCupPoll&&remoteCupPoll.kind==='cup'&&Array.isArray(remoteCupPoll.participants))
        ? cloneArenaStateV1012(remoteCupPoll)
        : null;
      if(!cupSignupPoll){ remoteCupVotesV1029={}; remoteCupVoteRowsV1029=[]; }
      const remoteLeaguePoll=row?.active_event?.signup_poll ?? row?.league_signup_poll;
      leagueSignupPoll=(remoteLeaguePoll?.kind==='league'&&Array.isArray(remoteLeaguePoll.participants))
        ? cloneArenaStateV1012(remoteLeaguePoll) : null;
      if(!leagueSignupPoll)remoteLeagueVotesV1093={};
      remoteArenaLastUpdatedV1012=String(row?.updated_at||'');
      remoteArenaStateReadyV1012=true;
      persistRemoteArenaStateLocallyV1012();
    }finally{
      remoteArenaStateApplyingV1012=false;
    }
    if(redraw && document.getElementById('screen-arena')?.classList.contains('active')) draw();
  };
  const saveRemoteArenaStateNowV1012=()=>{
    const api=arenaStateApiV1012();
    if(remoteArenaStateApplyingV1012 || !remoteArenaStateReadyV1012 || !api?.isReady?.() || !api?.canWrite?.() || !api?.save)return Promise.resolve();
    const write=async()=>{try{
      const row=await api.save(arenaGlobalSnapshotV1012());
      remoteArenaLastUpdatedV1012=String(row?.updated_at||remoteArenaLastUpdatedV1012||'');
      try{localStorage.setItem(ARENA_STATE_SEEDED_V1012,'1')}catch(_e){}
    }catch(err){
      console.warn('Arena global state save',err);
    }};
    remoteArenaStateSaveInFlightV1061=remoteArenaStateSaveInFlightV1061.then(write,write);
    return remoteArenaStateSaveInFlightV1061;
  };
  queueRemoteArenaStateSaveV1012=()=>{
    const api=arenaStateApiV1012();
    if(remoteArenaStateApplyingV1012 || !remoteArenaStateReadyV1012 || !api?.canWrite?.())return;
    clearTimeout(remoteArenaStateSaveTimerV1012);
    remoteArenaStateSaveTimerV1012=setTimeout(saveRemoteArenaStateNowV1012,90);
  };
  const refreshRemoteArenaStateV1012=async(redraw=true)=>{
    const api=arenaStateApiV1012();
    if(!api?.isReady?.() || !api?.get || remoteArenaStateLoadingV1012)return null;
    remoteArenaStateLoadingV1012=true;
    try{
      const row=await api.get();
      if(row){
        applyRemoteArenaStateV1012(row,redraw);
        return row;
      }
      // First ADMIN open migrates the old local Arena competition/history
      // into the shared row. For non-admin accounts, an absent row means
      // there is no shared active tournament/history yet.
      if(api?.canWrite?.()){
        const seeded=await api.save(arenaGlobalSnapshotV1012());
        remoteArenaLastUpdatedV1012=String(seeded?.updated_at||'');
        remoteArenaStateReadyV1012=true;
        try{localStorage.setItem(ARENA_STATE_SEEDED_V1012,'1')}catch(_e){}
        if(redraw) draw();
        return seeded;
      }
      applyRemoteArenaStateV1012({active_competition:null,history_archive:{cup:[],league:[]},active_event:null,updated_at:''},redraw);
      return null;
    }catch(err){
      console.warn('Arena global state refresh',err);
      return null;
    }finally{
      remoteArenaStateLoadingV1012=false;
    }
  };
  const CLUB_FULL_REMOTE_MIGRATION_V1012='ca_arena_all_clubs_remote_migrated_v1012';
  const migrateAllAdminClubsV1012=async()=>{
    const api=clubApiV1009();
    if(!api?.isReady?.() || !api?.canWrite?.() || !api?.upsertMany)return;
    try{if(localStorage.getItem(CLUB_FULL_REMOTE_MIGRATION_V1012)==='1')return;}catch(_e){}
    let rawLocal=[];
    try{
      const parsed=JSON.parse(localStorage.getItem(CLUB_DB_KEY)||'[]');
      if(Array.isArray(parsed))rawLocal=parsed;
    }catch(_e){rawLocal=[];}
    const fixed=[
      ...Object.keys(teamThemeMap).map(name=>({name,logo:''})),
      ...P.map(row=>({name:row?.[2],logo:''})),
      ...rawLocal
    ];
    const map=new Map();
    fixed.forEach(c=>{
      const name=String(c?.name||'').trim();if(!name)return;
      const key=normalizeTeamName(name);
      const logo=String(c?.logo||'').trim();
      const prev=map.get(key);
      if(!prev)map.set(key,{name,logo});
      else if(!prev.logo&&logo)prev.logo=logo;
    });
    try{
      await api.upsertMany([...map.values()]);
      try{localStorage.setItem(CLUB_FULL_REMOTE_MIGRATION_V1012,'1')}catch(_e){}
    }catch(err){console.warn('Arena full club migration',err);}
  };
  const cupVoteApiV1029=()=>window.CenturiaArenaCupVoteApi||null;
  const refreshRemoteCupVotesV1029=async(redraw=true)=>{
    const pollId=String(cupSignupPoll?.id||'').trim();
    const api=cupVoteApiV1029();
    if(!pollId || !api?.isReady?.() || !api?.list){
      remoteCupVotesV1029={}; remoteCupVoteRowsV1029=[];
      if(redraw && document.getElementById('screen-arena')?.classList.contains('active'))draw();
      return [];
    }
    if(remoteCupVotesLoadingV1029)return remoteCupVoteRowsV1029;
    remoteCupVotesLoadingV1029=true;
    try{
      const rows=await api.list(pollId);
      remoteCupVoteRowsV1029=Array.isArray(rows)?rows:[];
      const next={};
      remoteCupVoteRowsV1029.forEach(row=>{
        const name=String(row?.player_name||'').trim();
        const vote=String(row?.vote||'').trim().toLowerCase();
        if(name && (vote==='yes'||vote==='no'))next[name]=vote;
      });
      remoteCupVotesV1029=next;
    }catch(err){ console.warn('Arena cup votes refresh',err); }
    finally{ remoteCupVotesLoadingV1029=false; }
    if(redraw && document.getElementById('screen-arena')?.classList.contains('active'))draw();
    return remoteCupVoteRowsV1029;
  };

  // Same authenticated vote transport as the Cup, but isolated by league poll ID.
  // The admin-only global Arena state is never written by regular players.
  const leagueVoteForV1093=(poll,name)=>{
    const key=String(name||'').trim();if(!key)return '';
    const remote=Object.keys(remoteLeagueVotesV1093).find(n=>sameArenaPlayer(n,key));
    const local=Object.keys(poll?.votes||{}).find(n=>sameArenaPlayer(n,key));
    return String((remote?remoteLeagueVotesV1093[remote]:undefined)??(local?poll.votes[local]:undefined)??'').toLowerCase();
  };
  const leagueAllPlayersV1093=poll=>[...(poll?.participants||[]),...Object.keys(remoteLeagueVotesV1093)]
    .filter((name,i,all)=>name&&all.findIndex(x=>sameArenaPlayer(x,name))===i);
  const leagueConfirmedV1093=poll=>leagueAllPlayersV1093(poll).filter(n=>leagueVoteForV1093(poll,n)==='yes');
  const refreshRemoteLeagueVotesV1093=async(redraw=true)=>{
    const id=String(leagueSignupPoll?.id||'');
    const api=cupVoteApiV1029();
    if(!id||!api?.isReady?.()||!api?.list){remoteLeagueVotesV1093={};return [];}
    if(remoteLeagueVotesLoadingV1093)return [];
    remoteLeagueVotesLoadingV1093=true;
    try{
      const rows=await api.list(id);
      const votes={};
      (Array.isArray(rows)?rows:[]).forEach(row=>{
        const name=String(row?.player_name||'').trim(),vote=String(row?.vote||'').toLowerCase();
        if(name&&(vote==='yes'||vote==='no'))votes[name]=vote;
      });
      remoteLeagueVotesV1093=votes;
      if(redraw&&document.getElementById('screen-arena')?.classList.contains('active'))draw();
      return rows;
    }catch(err){console.warn('League registration refresh',err);return [];}
    finally{remoteLeagueVotesLoadingV1093=false;}
  };
  const refreshAllArenaRemoteV1012=async(redraw=true)=>{
    // Before Supabase becomes canonical, ADMIN exports every old local club
    // (not only the clubs with uploaded logos) once.
    await migrateAllAdminClubsV1012();
    await Promise.allSettled([
      refreshRemoteArenaStateV1012(false),
      refreshRemoteClubDatabaseV1009(false),
      refreshRemotePlayerPrefsV1011(false),
      refreshRemoteFriendliesV1007(false),
      refreshRemoteCupVotesV1029(false),
      refreshRemoteLeagueVotesV1093(false)
    ]);
    if(redraw && document.getElementById('screen-arena')?.classList.contains('active'))draw();
  };
  const ensureFullArenaSyncV1012=()=>{
    const rt=arenaRealtimeApiV1012();
    if(!remoteArenaRealtimeBoundV1012 && rt?.isReady?.() && rt?.subscribe){
      remoteArenaRealtimeBoundV1012=true;
      rt.subscribe((table)=>{
        if(table==='arena_global_state') refreshRemoteArenaStateV1012(true);
        else if(table==='arena_clubs') refreshRemoteClubDatabaseV1009(true);
        else if(table==='arena_player_preferences') refreshRemotePlayerPrefsV1011(true);
        else if(table==='arena_friendly_challenges') refreshRemoteFriendliesV1007(true);
        else if(table==='arena_cup_votes'){
          refreshRemoteCupVotesV1029(true);
          refreshRemoteLeagueVotesV1093(true);
        }
      });
    }
    if(!remoteArenaStatePollV1012){
      remoteArenaStatePollV1012=setInterval(()=>{
        if(document.getElementById('screen-arena')?.classList.contains('active')){
          refreshAllArenaRemoteV1012(true);
        }
      },5000);
    }
  };

  const readClubLogoFile=file=>new Promise(resolve=>{
    if(!file||!/^image\//.test(String(file.type||""))){resolve("");return;}
    const reader=new FileReader();
    reader.onerror=()=>resolve("");
    reader.onload=()=>{
      const raw=String(reader.result||"");
      const img=new Image();
      img.onerror=()=>resolve(raw);
      img.onload=()=>{
        try{
          const max=256;
          const scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
          const w=Math.max(1,Math.round((img.naturalWidth||1)*scale));
          const h=Math.max(1,Math.round((img.naturalHeight||1)*scale));
          const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext("2d");ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL("image/webp",.9)||raw);
        }catch(_e){resolve(raw);}
      };
      img.src=raw;
    };
    reader.readAsDataURL(file);
  });
  // v12.1: Tournament covers are NOT club crests. Preserve enough pixels for
  // Retina screens; keep encoded size modest because covers live in Arena state.
  const readTournamentCoverFile=file=>new Promise((resolve,reject)=>{
    if(!file||!/^image\//.test(String(file.type||""))){reject(new Error("Обери зображення для обкладинки"));return;}
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Не вдалося прочитати файл"));
    reader.onload=()=>{
      const image=new Image();
      image.onerror=()=>reject(new Error("Не вдалося відкрити зображення. Спробуй JPG або PNG"));
      image.onload=()=>{
        try{
          const iw=image.naturalWidth||0,ih=image.naturalHeight||0;
          if(!iw||!ih)throw new Error("Не вдалося визначити розмір фото");
          const canvas=document.createElement("canvas");
          const ctx=canvas.getContext("2d");
          if(!ctx)throw new Error("Не вдалося обробити фото");
          ctx.imageSmoothingEnabled=true;
          ctx.imageSmoothingQuality="high";
          const longSide=Math.max(iw,ih);
          // A landscape 1600px cover stays crisp at typical mobile 2x/3x DPR.
          for(const limit of [1600,1440,1280,1120]){
            const scale=Math.min(1,limit/longSide);
            canvas.width=Math.max(1,Math.round(iw*scale));
            canvas.height=Math.max(1,Math.round(ih*scale));
            ctx.imageSmoothingEnabled=true;
            ctx.imageSmoothingQuality="high";
            ctx.drawImage(image,0,0,canvas.width,canvas.height);
            for(const quality of [.92,.86,.79]){
              let result=canvas.toDataURL("image/webp",quality);
              if(!result.startsWith("data:image/webp"))result=canvas.toDataURL("image/jpeg",quality);
              // Approximately <= 825 kB encoded, without bloating shared state.
              if(result.length<=1100000){resolve(result);return;}
            }
          }
          throw new Error("Фото занадто велике. Спробуй JPG або PNG меншого розміру");
        }catch(err){reject(err);}
      };
      image.src=String(reader.result||"");
    };
    reader.readAsDataURL(file);
  });
  loadClubDatabase();
  // v9.95: no placeholder winners. History starts empty until a real tournament finishes.
  runHistoryClearMigrationV994();
  runHistoryClearMigrationV995();
  // v9.99: clear the remaining old friendly match once, then future matches persist normally.
  runFriendlyClearMigrationV998();
  runFriendlyClearMigrationV999();
  // v9.75: friendlies can register scored clubs only after Club Database helpers exist.
  loadFriendlyMatches();
  window.getCenturiaClubDatabase=()=>loadClubDatabase().map(c=>({...c}));
  window.getCenturiaClubNames=()=>clubDbNames();
  const canonicalTeamName=team=>{
    const raw=String(team||"").trim();
    const directDb=clubDbFind(raw);
    if(directDb?.name) return directDb.name;
    const aliased=teamAliases[normalizeTeamName(raw)]||raw||"Centuria";
    const aliasDb=clubDbFind(aliased);
    return aliasDb?.name||aliased;
  };
  const svgToDataUri=svg=>`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const initialsForTeam=team=>{
    const clean=canonicalTeamName(team).replace(/[^A-Za-zА-Яа-яІіЇїЄє0-9 ]/g,' ').trim();
    const parts=clean.split(/\s+/).filter(Boolean);
    if(!parts.length) return 'FC';
    if(parts.length===1) return parts[0].slice(0,3).toUpperCase();
    return parts.slice(0,3).map(p=>p[0]).join('').toUpperCase();
  };
  const autoTeamLogo=team=>{
    const canonical=canonicalTeamName(team);
    const theme=teamThemeMap[canonical]||{bg1:'#b08b42',bg2:'#3b2a12',ring:'#f2d79c',text:initialsForTeam(canonical),fg:'#ffffff'};
    const fg=theme.fg||'#ffffff';
    const label=(theme.text||initialsForTeam(canonical)).slice(0,4).toUpperCase();
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${theme.bg1}"/><stop offset="100%" stop-color="${theme.bg2}"/></linearGradient><radialGradient id="shine" cx="0.3" cy="0.2" r="0.9"><stop offset="0%" stop-color="rgba(255,255,255,0.55)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient></defs><circle cx="80" cy="80" r="73" fill="url(#g)" stroke="${theme.ring}" stroke-width="8"/><circle cx="80" cy="80" r="57" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/><circle cx="80" cy="80" r="73" fill="url(#shine)" opacity="0.35"/><text x="80" y="90" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="${fg}" letter-spacing="1.5">${label}</text></svg>`;
    return svgToDataUri(svg);
  };
  const crestBadge=(team,photo="")=>{
    const teamName=canonicalTeamName(team);
    const dbSrc=clubLogoFor(teamName);
    const manualSrc=String(photo||"").trim();
    const autoSrc=autoTeamLogo(teamName);
    const finalSrc=dbSrc||manualSrc||autoSrc;
    return `<div class="arena-crest-v852 arena-crest-team-v930 ${finalSrc?"has-photo":""}" title="${esc(teamName)}">${finalSrc?`<img src="${esc(finalSrc)}" alt="${esc(teamName)}">`:`<span>${esc(crestLabel(teamName))}</span>`}</div>`;
  };
  const makeLeagueSchedule=(names)=>{
    const arr=[...names];
    if(arr.length%2)arr.push(null);
    const n=arr.length, rounds=[];
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
  const makeLeagueScheduleV1093=(players,format='single')=>{
    const first=makeLeagueSchedule(players);
    if(format!=='double')return first;
    return first.concat(first.map((r,index)=>({
      round:first.length+index+1,
      matches:r.matches.map((m,i)=>({...m,id:`L${first.length+index+1}_${i+1}`,round:first.length+index+1,
        home:m.away,away:m.home,homeScore:null,awayScore:null,proposal:null,proposalStatus:''}))
    })));
  };
  const leagueFormatLabelV1093={single:'ОДНЕ КОЛО',double:'ДВА КОЛА',top4:'ЛІГА + ТОП-4 ПЛЕЙ-ОФ',swiss:'ШВЕЙЦАРСЬКА СИСТЕМА'};
  // v11.38: Pair primarily by points. Rematches are allowed even when a
  // repeat-free matching exists; prefer fresh opponents only among equally
  // close point matchings. Freeze the pre-round points.
  const makeSwissRoundV1093=(players,roundNo,previous=[],standings=[])=>{
    const pool=new Set(players);
    const ranking=[...new Set([
      ...standings.map(row=>row.name).filter(name=>pool.has(name)),
      ...players
    ])];
    const points=new Map(standings.map(row=>[row.name,Number(row.pts)||0]));
    const rank=new Map(ranking.map((name,i)=>[name,i]));
    const pairKey=(a,b)=>[a,b].sort((x,y)=>x.localeCompare(y)).join('\u0001');
    const seen=new Set(previous.flatMap(r=>(r.matches||[]).map(m=>pairKey(m.home,m.away))));
    const pastByes=new Set(previous.flatMap(r=>r.byes||[]));
    const pts=name=>points.get(name)||0;
    const pairCost=(a,b)=>({
      repeats:Number(seen.has(pairKey(a,b))),
      maxGap:Math.abs(pts(a)-pts(b)),
      gap:Math.abs(pts(a)-pts(b)),
      rankGap:Math.abs((rank.get(a)||0)-(rank.get(b)||0))
    });
    // Priority: smallest maximum points gap, then smallest total points gap;
    // repeats are a tiebreaker, NOT a barrier to close-by-points matches.
    const better=(a,b)=>!b || a.maxGap<b.maxGap ||
      (a.maxGap===b.maxGap&&(a.gap<b.gap ||
        (a.gap===b.gap&&(a.repeats<b.repeats ||
          (a.repeats===b.repeats&&a.rankGap<b.rankGap)))));
    const quality=pairs=>pairs.reduce((sum,[a,b])=>{
      const c=pairCost(a,b);
      return {repeats:sum.repeats+c.repeats,maxGap:Math.max(sum.maxGap,c.maxGap),
        gap:sum.gap+c.gap,rankGap:sum.rankGap+c.rankGap};
    },{repeats:0,maxGap:0,gap:0,rankGap:0});
    const optimizePairs=names=>{
      if(!names.length)return [];
      // Exact minimum-cost perfect matching for typical Swiss leagues (up to
      // 18 participants); memoize masks so choosing an opponent is global.
      if(names.length<=18){
        const memo=new Map();
        memo.set(0,{repeats:0,maxGap:0,gap:0,rankGap:0,opponent:-1,next:0});
        const full=(1<<names.length)-1;
        const solve=mask=>{
          if(memo.has(mask))return memo.get(mask);
          let first=0;
          while((mask&(1<<first))===0)first++;
          const withoutFirst=mask&~(1<<first);
          let best=null;
          for(let j=first+1;j<names.length;j++){
            if((withoutFirst&(1<<j))===0)continue;
            const next=withoutFirst&~(1<<j);
            const tail=solve(next);
            const c=pairCost(names[first],names[j]);
            const option={repeats:tail.repeats+c.repeats,
              maxGap:Math.max(tail.maxGap,c.maxGap),gap:tail.gap+c.gap,
              rankGap:tail.rankGap+c.rankGap,opponent:j,next};
            if(better(option,best))best=option;
          }
          memo.set(mask,best);
          return best;
        };
        solve(full);
        const pairs=[];
        let mask=full;
        while(mask){
          let first=0;
          while((mask&(1<<first))===0)first++;
          const step=memo.get(mask);
          pairs.push([names[first],names[step.opponent]]);
          mask=step.next;
        }
        return pairs;
      }
      // Large leagues: start with adjacent point brackets, then improve the
      // complete pairing through deterministic two-pair swaps.
      const pairs=[];
      for(let i=0;i<names.length;i+=2)pairs.push([names[i],names[i+1]]);
      for(let pass=0;pass<12;pass++){
        let changed=false;
        for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){
          const [a,b]=pairs[i],[c,d]=pairs[j];
          const old=quality([pairs[i],pairs[j]]);
          const variants=[[[a,c],[b,d]],[[a,d],[b,c]]];
          const candidate=variants.filter(v=>better(quality(v),old))
            .sort((v,w)=>better(quality(v),quality(w))?-1:better(quality(w),quality(v))?1:0)[0];
          if(candidate){pairs[i]=candidate[0];pairs[j]=candidate[1];changed=true;}
        }
        if(!changed)break;
      }
      return pairs;
    };
    let remaining=ranking.slice();
    const byes=[];
    let pairs=[];
    if(remaining.length%2){
      const newByeChoices=remaining.filter(name=>!pastByes.has(name));
      const choices=(newByeChoices.length?newByeChoices:remaining).sort((a,b)=>
        pts(a)-pts(b)||(rank.get(b)||0)-(rank.get(a)||0));
      // A bye belongs to the lowest eligible points bracket; within that
      // bracket choose the player who leaves the closest feasible pairings.
      const lowest=pts(choices[0]);
      const candidates=choices.filter(name=>pts(name)===lowest).slice(0,6);
      let best=null;
      for(const bye of candidates){
        const left=remaining.filter(name=>name!==bye);
        const candidatePairs=optimizePairs(left);
        const cost=quality(candidatePairs);
        if(better(cost,best?.cost))best={bye,candidatePairs,cost};
      }
      byes.push(best.bye);
      remaining=remaining.filter(name=>name!==best.bye);
      pairs=best.candidatePairs;
    }else pairs=optimizePairs(remaining);
    const matches=pairs.map(([a,b],i)=>({
      id:`LS${roundNo}_${i+1}`,round:roundNo,
      home:roundNo%2?a:b,away:roundNo%2?b:a,
      homeScore:null,awayScore:null
    }));
    const pairingQuality=quality(pairs);
    return {round:roundNo,matches,byes,label:`ТУР ${roundNo}`,
      swissPairingVersion:1138,
      swissPairingPoints:Object.fromEntries(players.map(name=>[name,pts(name)])),
      swissPairingQuality:pairingQuality};
  };
  const leaguePlayoffWinnerV1093=m=>{
    if(!isScored(m))return null;
    if(m.homeScore>m.awayScore)return m.home;
    if(m.homeScore<m.awayScore)return m.away;
    return [m.home,m.away].some(n=>sameArenaPlayer(n,m.tiebreakWinner))?m.tiebreakWinner:null;
  };
  const leagueRoundDoneV1093=r=>(r?.matches||[]).every(m=>isScored(m)&&(!r?.playoff||!!leaguePlayoffWinnerV1093(m)));
  const leagueCanAdvanceV1093=comp=>{
    if(comp?.kind!=='league')return false;
    const rounds=comp.rounds||[],last=rounds.at(-1);
    if(!last||!leagueRoundDoneV1093(last))return false;
    if(comp.leagueFormat==='swiss')return rounds.length<Math.max(1,Number(comp.swissRounds)||1);
    if(comp.leagueFormat==='top4')return !comp.champion;
    return false;
  };
  const cupLabel=count=>count<=2?"ФІНАЛ":count<=4?"1/2 ФІНАЛУ":count<=8?"1/4 ФІНАЛУ":count<=16?"1/8 ФІНАЛУ":`РАУНД ${count}`;
  const makeCupRound=(names,roundNo)=>{
    const matches=[],byes=[];
    for(let i=0;i<names.length;i+=2){
      if(i+1>=names.length){byes.push(names[i]);continue;}
      matches.push({id:`C${roundNo}_${Math.floor(i/2)+1}`,round:roundNo,home:names[i],away:names[i+1],homeScore:null,awayScore:null,leg2HomeScore:null,leg2AwayScore:null,tiebreakWinner:null});
    }
    return {round:roundNo,label:cupLabel(names.length),matches,byes};
  };
  const allMatches=()=>{
    if(!testCompetition)return [];
    if(testCompetition.kind==="league")return (testCompetition.rounds||[]).flatMap(r=>r.matches||[]);
    return (testCompetition.rounds||[]).flatMap(r=>r.matches||[]);
  };
  const isScored=m=>Number.isFinite(m?.homeScore)&&Number.isFinite(m?.awayScore);
  const currentLeagueRound=()=>{
    if(!testCompetition||testCompetition.kind!=="league")return null;
    return (testCompetition.rounds||[]).find(r=>(r.matches||[]).some(m=>!isScored(m)||(r.playoff&&!leaguePlayoffWinnerV1093(m)))) || (testCompetition.rounds||[]).at(-1) || null;
  };
  const currentCupRound=()=>testCompetition?.kind==="cup"?(testCompetition.rounds||[]).at(-1)||null:null;
  // v11.00: the same ranking rules for the live table and each completed round.
  // A round cutoff only limits which results are counted; no snapshot or client
  // storage is needed, so all viewers derive identical movement from shared scores.
  const leagueStandings=(throughRoundIndex=null)=>{
    const comp=testCompetition;
    const names=comp?.kind==="league"?comp.participants:P.map(x=>x[0]);
    const s=new Map(names.map(n=>[n,{name:n,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}]));
    const rounds=comp?.kind==='league'?(comp.rounds||[]):[];
    const visibleRounds=throughRoundIndex===null?rounds:rounds.slice(0,Math.max(0,throughRoundIndex+1));
    const matches=comp?.kind==='league'?visibleRounds.flatMap(r=>r.matches||[]):allMatches();
    for(const m of matches){
      // TOP-4 playoffs determine the champion but do not alter league rankings.
      if(comp?.kind==='league'&&String(m.id||'').startsWith('LP_'))continue;
      if(!isScored(m))continue;
      const h=s.get(m.home),a=s.get(m.away);if(!h||!a)continue;
      h.p++;a.p++;h.gf+=m.homeScore;h.ga+=m.awayScore;a.gf+=m.awayScore;a.ga+=m.homeScore;
      if(m.homeScore>m.awayScore){h.w++;a.l++;h.pts+=3}
      else if(m.homeScore<m.awayScore){a.w++;h.l++;a.pts+=3}
      else{h.d++;a.d++;h.pts++;a.pts++}
    }
    if(comp?.kind==='league'&&comp.leagueFormat==='swiss'){
      visibleRounds.forEach(r=>(r.byes||[]).forEach(name=>{
        const row=s.get(name);if(row){row.p++;row.w++;row.pts+=3;}
      }));
    }
    return [...s.values()].sort((a,b)=>b.pts-a.pts||((b.gf-b.ga)-(a.gf-a.ga))||b.gf-a.gf||a.name.localeCompare(b.name,'uk'));
  };
  // Compare to the table before the most recent round with results. When the
  // next round has not started, keep the last arrows visible instead of resetting
  // them on page refresh or the opening of a new round.
  // Read exactly the points before this round. Older rounds may not have a
  // snapshot; reconstruct it from rounds 1..N-1 without counting this round's bye.
  const swissPointsBeforeRoundV1137=(roundNo)=>{
    const round=(testCompetition?.rounds||[]).find(r=>r.round===roundNo);
    if(round?.swissPairingPoints)return round.swissPairingPoints;
    return Object.fromEntries(leagueStandings(Math.max(-1,Number(roundNo)-2))
      .map(row=>[row.name,row.pts]));
  };
  const swissFixturePointsHtmlV1137=m=>{
    if(testCompetition?.leagueFormat!=='swiss'||!m)return '';
    const points=swissPointsBeforeRoundV1137(m.round);
    return `<div class="arena-swiss-fixture-points-v1137">ОЧКИ ПЕРЕД ТУРОМ: ${Number(points[m.home])||0} — ${Number(points[m.away])||0}</div>`;
  };
  const swissByeHtmlV1137=round=>{
    if(testCompetition?.leagueFormat!=='swiss'||!round?.byes?.length)return '';
    const points=swissPointsBeforeRoundV1137(round.round);
    return round.byes.map(name=>`<div class="arena-card-v852 arena-swiss-bye-v1137"><b>${esc(name)}</b><span>ПРОПУСК ТУРУ · +3 ОЧКИ · БУЛО ${Number(points[name])||0} ОЧОК</span></div>`).join('');
  };
  const swissCanRepairRoundV1137=comp=>{
    if(!isArenaAdmin()||comp?.kind!=='league'||comp.leagueFormat!=='swiss')return false;
    const round=comp.rounds?.at(-1);
    return !!round && round.round>1 &&
      (round.matches||[]).every(m=>!isScored(m)&&!m.proposal&&!m.proposalStatus);
  };
  const leaguePlaceChangesV1100=(currentRows=leagueStandings())=>{
    const comp=testCompetition;
    if(comp?.kind!=='league')return new Map();
    const rounds=comp.rounds||[];
    let lastPlayed=-1;
    rounds.forEach((r,i)=>{
      if(r.playoff)return;
      if((r.matches||[]).some(isScored)||(comp.leagueFormat==='swiss'&&(r.byes||[]).length))lastPlayed=i;
    });
    if(lastPlayed<0)return new Map();
    const previous=leagueStandings(lastPlayed-1);
    const previousPlace=new Map(previous.map((row,i)=>[row.name,i+1]));
    return new Map(currentRows.map((row,i)=>[row.name,(previousPlace.get(row.name)||i+1)-(i+1)]));
  };
  const leaguePlaceArrowV1100=(change,compact=false)=>{
    const numeric=Number.isFinite(change)?change:0;
    const cls=numeric>0?'up':numeric<0?'down':'same';
    const message=numeric>0
      ? `Піднявся на ${numeric} ${numeric===1?'місце':'місць'}`
      : numeric<0
        ? `Опустився на ${-numeric} ${numeric===-1?'місце':'місць'}`
        : 'Без змін у таблиці';
    const glyph=numeric>0?'↑':numeric<0?'↓':'—';
    return `<span class="arena-league-place-change-v1100 ${cls}${compact?' compact':''}" title="${esc(message)}" aria-label="${esc(message)}">${glyph}</span>`;
  };

  const leaguePlayoffRoundsV1108=comp=>(comp?.kind==='league'&&comp?.leagueFormat==='top4')?(comp.rounds||[]).filter(r=>!!r?.playoff):[];
  const leaguePlayoffParticipantMissingV1114=name=>{
    const value=String(name||'').trim();
    return !value || /очікує|перемож|winner|pending/i.test(value);
  };
  const syncLeaguePlayoffStateV1114=(comp=testCompetition)=>{
    if(comp?.kind!=='league' || comp?.leagueFormat!=='top4')return false;
    const rounds=comp.rounds||[];
    const semi=rounds.find(r=>r?.playoff==='semi')||null;
    const final=rounds.find(r=>r?.playoff==='final')||null;
    let changed=false;
    if(semi && Array.isArray(semi.matches) && semi.matches.length>=2){
      const winners=semi.matches.map(leaguePlayoffWinnerV1093);
      const ready=winners.length>=2 && winners.every(Boolean);
      if(final?.matches?.[0]){
        const fm=final.matches[0];
        const needsHome=leaguePlayoffParticipantMissingV1114(fm.home) || fm.home!==winners[0];
        const needsAway=leaguePlayoffParticipantMissingV1114(fm.away) || fm.away!==winners[1];
        if(ready && !isScored(fm) && (needsHome || needsAway)){
          fm.home=winners[0];
          fm.away=winners[1];
          if(!sameArenaPlayer(fm.tiebreakWinner,fm.home) && !sameArenaPlayer(fm.tiebreakWinner,fm.away))fm.tiebreakWinner=null;
          changed=true;
        }
      }else if(ready){
        rounds.push({
          round:(semi.round||rounds.length)+1,
          playoff:'final',
          label:'ФІНАЛ',
          matches:[{id:'LP_FINAL',round:(semi.round||rounds.length)+1,home:winners[0],away:winners[1],homeScore:null,awayScore:null,tiebreakWinner:null}]
        });
        changed=true;
      }
    }
    const finalMatch=(rounds.find(r=>r?.playoff==='final')?.matches||[])[0]||null;
    const champion=finalMatch?leaguePlayoffWinnerV1093(finalMatch):null;
    if(champion && comp.champion!==champion){
      comp.champion=champion;
      changed=true;
    }
    return changed;
  };
  const leaguePlayoffAvailableV1108=comp=>leaguePlayoffRoundsV1108(comp).length>0;
  const leaguePlayoffCurrentRoundV1108=comp=>{
    const rounds=leaguePlayoffRoundsV1108(comp);
    return rounds.find(r=>(r.matches||[]).some(m=>!isScored(m)||!leaguePlayoffWinnerV1093(m))) || rounds.at(-1) || null;
  };
  const leaguePlayoffLabelV1108=r=>r?.label || (r?.playoff==='semi'?'1/2 ФІНАЛУ':r?.playoff==='final'?'ФІНАЛ':'ПЛЕЙ-ОФ');
  const leagueTableViewSwitchV1108=(active='table')=>`<div class="arena-league-bottom-switch-v1108"><button type="button" class="${active==='table'?'on':''}" onclick="ArenaV852.setLeagueTableViewV1108('table')">ТАБЛИЦЯ</button><button type="button" class="${active==='playoff'?'on':''}" onclick="ArenaV852.setLeagueTableViewV1108('playoff')">ПЛЕЙ-ОФ</button></div>`;
  const leaguePlayoffPreviewHtmlV1108=comp=>{
    const current=leaguePlayoffCurrentRoundV1108(comp);
    if(!current)return '';
    return `<div class="arena-active-event-preview-v879 arena-active-event-cup-preview-v879 arena-active-event-preview-full-v1101"><div class="arena-active-event-preview-title-v879"><span>ПЛЕЙ-ОФ ЛІГИ</span><span>${esc(leaguePlayoffLabelV1108(current))}</span></div><div class="arena-active-bracket-v879"><div class="arena-active-bracket-stage-v879"><small>${esc(leaguePlayoffLabelV1108(current))}</small>${(current.matches||[]).map(m=>`<div><span>${esc(m.home)}</span><b>${isScored(m)?`${m.homeScore} : ${m.awayScore}`:'VS'}</b><span>${esc(m.away)}</span></div>`).join('')}</div></div></div>`;
  };
  const ensureCupProgress=()=>{
    if(!testCompetition||testCompetition.kind!=="cup")return;
    const rounds=testCompetition.rounds||[];
    const cur=rounds.at(-1); if(!cur)return;
    if((cur.matches||[]).some(m=>!cupMatchFinished(m,testCompetition)))return;
    const winners=[...(cur.byes||[])];
    for(const m of cur.matches||[]){ winners.push(cupMatchWinner(m,testCompetition)); }
    if(winners.length<=1){ testCompetition.champion=winners[0]||null; return; }
    if(rounds.length>cur.round)return;
    rounds.push(makeCupRound(winners,cur.round+1));
  };
  const buildCompetition=(kind,names,title="",options={})=>{
    const participants=[...new Set(names.map(x=>String(x).trim()).filter(Boolean))];
    const participantClubs=options.participantClubs||Object.fromEntries(participants.map(name=>[name,canonicalTeamName(clubFor(name))]));
    const competitionTitle=String(title||"").trim() || (kind==="league"?"CENTURIA LEAGUE":"CENTURIA CUP");
    if(kind==="league"){
      const format=['single','double','top4','swiss'].includes(options.leagueFormat)?options.leagueFormat:'single';
      const swissRounds=Math.max(1,Math.min(24,Number(options.swissRounds)||Math.ceil(Math.log2(Math.max(2,participants.length)))));
      return {id:`league_${Date.now()}`,kind,title:competitionTitle,participants,participantClubs,
        createdAt:Date.now(),leagueFormat:format,swissRounds,
        cover:String(options.cover||''),allowedClubs:[...(options.allowedClubs||[])],voteSourceId:String(options.voteSourceId||''),
        rounds:format==='swiss'?[makeSwissRoundV1093(participants,1)]:makeLeagueScheduleV1093(participants,format)};
    }
    return {id:`cup_${Date.now()}`,kind,title:competitionTitle,participants,participantClubs,createdAt:Date.now(),rounds:[makeCupRound(participants,1)],champion:null};
  };
  const competitionClubFor=name=>String(testCompetition?.participantClubs?.[name]||clubFor(name)||"Centuria").trim()||"Centuria";
  const advanceLeagueRoundV1093=()=>{
    const comp=testCompetition;
    if(comp?.kind!=='league'||!leagueCanAdvanceV1093(comp))return false;
    const last=comp.rounds.at(-1);
    if(comp.leagueFormat==='swiss'){
      comp.rounds.push(makeSwissRoundV1093(comp.participants,comp.rounds.length+1,comp.rounds,leagueStandings()));
      return true;
    }
    if(comp.leagueFormat==='top4'){
      if(!last.playoff){
        const top=leagueStandings().slice(0,4).map(row=>row.name);
        if(top.length<4)return false;
        comp.rounds.push({round:last.round+1,playoff:'semi',label:'1/2 ФІНАЛУ',matches:[
          {id:'LP_SEMI_1',round:last.round+1,home:top[0],away:top[3],homeScore:null,awayScore:null},
          {id:'LP_SEMI_2',round:last.round+1,home:top[1],away:top[2],homeScore:null,awayScore:null}
        ]});
        return true;
      }
      if(last.playoff==='semi'){
        const winners=last.matches.map(leaguePlayoffWinnerV1093);
        if(winners.some(x=>!x))return false;
        comp.rounds.push({round:last.round+1,playoff:'final',label:'ФІНАЛ',matches:[
          {id:'LP_FINAL',round:last.round+1,home:winners[0],away:winners[1],homeScore:null,awayScore:null}
        ]});
        return true;
      }
      if(last.playoff==='final'){
        comp.champion=leaguePlayoffWinnerV1093(last.matches[0]);
        return !!comp.champion;
      }
    }
    return false;
  };
  const syncActiveEventFromCompetition=()=>{
    if(!testCompetition)return;
    if(testCompetition.kind==="league"){
      const r=currentLeagueRound();
      activeEvent={type:"league",route:"league",title:testCompetition.title||"CENTURIA LEAGUE",meta:`${testCompetition.participants.length} УЧАСНИКІВ • ${isCompetitionCompleted(testCompetition)?"ЗАВЕРШЕНО":`ТУР ${r?.round||1}/${testCompetition.rounds?.length||1}`}`,icon:"arena-icon-league-pixel.gif?v=9.15",createdAt:testCompetition.createdAt};
    }else{
      const r=currentCupRound();
      activeEvent={type:"cup",route:"cup",title:testCompetition.title||"CENTURIA CUP",meta:`${testCompetition.participants.length} УЧАСНИКІВ • ${cupLegCount(testCompetition)===2?'2 МАТЧІ':'1 МАТЧ'} • ${testCompetition.champion?"ЗАВЕРШЕНО":(r?.label||"КУБОК")}`,icon:"arena-icon-cup-pixel.gif?v=10.53",createdAt:testCompetition.createdAt};
    }
    saveActiveEvent();
  };
  const purgeLegacyTestState=()=>{
    try{
      ["ca_arena_test_competition_v927","ca_arena_test_competition","ca_arena_test_competition_v925","ca_arena_test_competition_v926","ca_arena_test_league","ca_arena_test_cup"].forEach(k=>localStorage.removeItem(k));
      ["ca_arena_test_competition_v927","ca_arena_test_competition","ca_arena_test_competition_v925","ca_arena_test_competition_v926","ca_arena_test_league","ca_arena_test_cup"].forEach(k=>sessionStorage.removeItem(k));
    }catch(_e){}
    try{window.__CENTURIA_ARENA_TEST_COMPETITION__=null;}catch(_e){}
    if(activeEvent?.isTest){activeEvent=null;saveActiveEvent();}
  };
  purgeLegacyTestState();
  loadTestCompetition();
  syncHistoryArchiveFromCompetition(testCompetition);


  // A dedicated home-sized two-column bracket. Do NOT mount the full Cup board
  // here: it has a 480px+ intrinsic height and its connector layout expands it.
  const activeBracketMiniMatchV1112=(match,label,comp,slot=0)=>{
    const pending=!match;
    const winner=pending?'':(comp.kind==='cup'?cupMatchWinner(match,comp):leaguePlayoffWinnerV1093(match));
    const scores=pending?null:(comp.kind==='cup'&&cupLegCount(comp)===2&&cupLeg2Scored(match)
      ?cupAggregate(match):isScored(match)?{home:match.homeScore,away:match.awayScore}:null);
    const home=pending?`Переможець ${slot*2+1}`:match.home;
    const away=pending?`Переможець ${slot*2+2}`:match.away;
    const line=(name,score)=>`<div class="arena-mini-bracket-team-v1112 ${winner&&sameArenaPlayer(winner,name)?'is-winner':''}"><span title="${esc(name)}">${esc(name)}</span><b>${score===null?'—':esc(score)}</b></div>`;
    return `<div class="arena-mini-bracket-match-v1112 ${pending?'is-upcoming':''}"><div class="arena-mini-bracket-match-label-v1112">${esc(label)}${slot>=0?' · '+(slot+1):''}</div>${line(home,scores?.home??null)}${line(away,scores?.away??null)}</div>`;
  };
  const activeBracketMiniWrapV1112=(title,comp,firstRound,nextRound=null)=>{
    const rounds=comp?.rounds||[];
    const index=rounds.indexOf(firstRound);
    const firstMatches=firstRound?.matches||[];
    const nextMatches=nextRound?.matches||[];
    const firstLabel=String(firstRound?.label||'ПЛЕЙ-ОФ');
    const nextLabel=String(nextRound?.label|| (firstRound?.playoff==='semi'?'ФІНАЛ':cupBracketStageLabelV1036(Math.max(2,firstMatches.length),Math.max(1,Math.ceil(firstMatches.length/2)))));
    // A preview of the next stage is visual only; it never creates rounds/results.
    const nextCount=nextRound?nextMatches.length:Math.max(1,Math.ceil(firstMatches.length/2));
    const column=(label,items,count,placeholder)=>`<section class="arena-mini-bracket-stage-v1112"><div class="arena-mini-bracket-stage-head-v1112">${esc(label)}</div><div class="arena-mini-bracket-stage-games-v1112">${Array.from({length:count},(_,i)=>activeBracketMiniMatchV1112(items[i]||null,label,comp,i)).join('')}</div></section>`;
    const firstHtml=column(firstLabel,firstMatches,firstMatches.length,false);
    const secondHtml=column(nextLabel,nextMatches,nextCount,true);
    return `<div class="arena-active-event-preview-v879 arena-active-event-preview-full-v1101 arena-active-event-bracket-preview-v1110 arena-active-event-bracket-mini-v1112"><div class="arena-active-event-preview-title-v879"><span>${esc(title)}</span><span>${esc(firstLabel)} → ${esc(nextLabel)}</span></div><div class="arena-mini-bracket-board-v1112">${firstHtml}<span class="arena-mini-bracket-link-v1112" aria-hidden="true"></span>${secondHtml}</div><div class="arena-mini-bracket-hint-v1112">Натисни, щоб відкрити повну сітку ↗</div></div>`;
  };

  const activeLeaguePreview=()=>{
    if(leagueSignupPoll){
      const yes=leagueConfirmedV1093(leagueSignupPoll).length;
      return `<div class="arena-active-event-preview-v879 arena-active-event-cup-preview-v879"><div class="arena-active-event-preview-title-v879"><span>РЕЄСТРАЦІЯ НА ЛІГУ</span><span>${formatCupPollTimeLeft(leagueSignupPoll)}</span></div><div class="arena-active-bracket-v879"><div class="arena-active-bracket-stage-v879"><small>${esc(leagueSignupPoll.title)}</small><div><span>Підтвердили</span><b>${yes}</b><span>${esc(leagueFormatLabelV1093[leagueSignupPoll.leagueFormat]||'ОДНЕ КОЛО')}</span></div></div></div></div>`;
    }
    if(testCompetition?.kind==='league' && leaguePlayoffAvailableV1108(testCompetition)){
      const playoff=leaguePlayoffRoundsV1108(testCompetition);
      return activeBracketMiniWrapV1112('ПЛЕЙ-ОФ ЛІГИ',testCompetition,playoff[0],playoff[1]||null);
    }
    const rows=testCompetition?.kind==="league"?leagueStandings():P.map((p,i)=>({name:p[0],p:4,gf:[8,5,3,0,-2,2,1,-1][i]||0,ga:0,pts:[10,9,7,5,4,4,3,1][i]||0}));
    return `<div class="arena-active-event-preview-v879 arena-active-event-league-preview-v879 arena-active-event-preview-full-v1101">
      <div class="arena-active-event-preview-title-v879"><span>ТУРНІРНА ТАБЛИЦЯ</span><span>Учасники: ${rows.length}</span></div>
      <div class="arena-active-event-table-v879">
        ${rows.map((p,i)=>`<div class="arena-active-event-table-row-v879"><span class="arena-active-event-place-v879">${i+1}</span><span class="arena-active-event-player-v879">${p.name}</span><span>${p.p||0}</span><span>${(p.gf||0)-(p.ga||0)}</span><b>${p.pts||0}</b></div>`).join("")}
      </div>
    </div>`;
  };

  const activeCupPreview=()=>{
    if(cupSignupPoll){
      const yes=cupPollConfirmedPlayers(cupSignupPoll).length;
      const no=cupPollDeclinedPlayers(cupSignupPoll).length;
      const drawReady=cupSignupPoll.phase==='draw_ready'||!cupPollStillActive(cupSignupPoll);
      return `<div class="arena-active-event-preview-v879 arena-active-event-cup-preview-v879"><div class="arena-active-event-preview-title-v879"><span>${drawReady?'ОЧІКУЄ ЖЕРЕБКУВАННЯ':'ГОЛОСУВАННЯ НА КУБОК'}</span><span>${drawReady?'🎲':formatCupPollTimeLeft(cupSignupPoll)}</span></div><div class="arena-active-bracket-v879"><div class="arena-active-bracket-stage-v879"><small>${esc(cupSignupPoll.title||'CENTURIA CUP')}</small><div><span>Підтвердили</span><b>${yes}</b><span>Відмовились: ${no}</span></div></div></div></div>`;
    }
    const r=testCompetition?.kind==="cup"?currentCupRound():null;
    if(r){
      const rounds=testCompetition.rounds||[];
      const currentIndex=rounds.indexOf(r);
      const first=(r.matches||[]).length===1&&currentIndex>0?rounds[currentIndex-1]:r;
      const next=rounds[rounds.indexOf(first)+1]||null;
      return activeBracketMiniWrapV1112('СІТКА КУБКА',testCompetition,first,next);
    }
    return `<div class="arena-active-event-preview-v879 arena-active-event-cup-preview-v879"><div class="arena-active-event-preview-title-v879"><span>СІТКА КУБКА</span><span>ОЧІКУЄ ЖЕРЕБКУВАННЯ</span></div></div>`;
  };

  const activeEventPreview=()=>{
    if(!activeEvent) return "";
    return (activeEvent.type||activeEvent.route)==="cup" ? activeCupPreview() : activeLeaguePreview();
  };

  const activeEventCard=()=>activeEvent
    ? `<div class="arena-active-event-v877 arena-active-event-expanded-v879" role="button" tabindex="0"
          onclick="ArenaV852.go('${activeEvent.route}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ArenaV852.go('${activeEvent.route}')}">
        <div class="arena-active-event-head-v879">
          <span class="arena-active-event-icon-v877" aria-hidden="true"><img src="${activeEvent.icon||((activeEvent.type||activeEvent.route)==='cup'?'arena-icon-cup-pixel.gif?v=10.53':'arena-icon-league-pixel.gif?v=9.15')}" alt=""></span>
          <span class="arena-active-event-copy-v877">
            <span class="arena-active-event-label-v877"><i aria-hidden="true"></i> АКТИВНА ПОДІЯ</span>
            <strong>${activeEvent.title}</strong>
            <small>${activeEvent.meta||''}</small>
          </span>
          <span class="arena-active-event-arrow-v877" aria-hidden="true">›</span>
        </div>
        ${activeEventPreview()}
      </div>`
    : `<div class="arena-active-event-v877 arena-active-event-expanded-v879 arena-active-event-empty-v878 arena-active-event-empty-v879" role="status" aria-live="polite">
        <div class="arena-active-event-empty-head-v879">
          <span class="arena-active-event-label-v877"><i aria-hidden="true"></i> АКТИВНА ПОДІЯ</span>
        </div>
        <div class="arena-active-event-empty-body-v879">
          <span class="arena-active-event-empty-icon-v879" aria-hidden="true">—</span>
          <strong>НЕМАЄ АКТИВНИХ ПОДІЙ</strong>
          <small>Тут зʼявиться турнірна таблиця ліги або сітка кубка</small>
        </div>
      </div>`;

  function home(){loadActiveEvent();return `<div class="arena-home-v854">
    <div class="arena-home-menu-v854 arena-home-docked-v1123">
      ${activeEventCard()}
      <div class="arena-grid-v852 arena-home-main-grid-v854">
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-main-v854 arena-home-alert-tile-v1016" onclick="ArenaV852.go('league')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-league-pixel.gif?v=9.15" alt=""></span>
          <span class="arena-home-copy-v854"><strong>ЛІГА</strong><small>Сезонні турніри</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
          ${arenaTileBadgeHtmlV1016(leagueActionCountV1016())}
        </button>
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-main-v854 arena-home-alert-tile-v1016" onclick="ArenaV852.go('cup')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-cup-pixel.gif?v=10.53" alt=""></span>
          <span class="arena-home-copy-v854"><strong>КУБОК</strong><small>Сітка та плей-оф</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
          ${arenaTileBadgeHtmlV1016(cupActionCountV1016())}
        </button>
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-main-v854 arena-friendly-tile-v1010 arena-home-alert-tile-v1016" onclick="ArenaV852.go('friendly')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-friendly-pixel.gif?v=10.54" alt=""></span>
          <span class="arena-home-copy-v854"><strong>ТОВ. МАТЧ</strong><small>Швидкий матч</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
          ${arenaTileBadgeHtmlV1016(friendlyActionCountV1010())}
        </button>
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-main-v854" onclick="ArenaV852.go('evo')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-evo-pixel.gif?v=10.53" alt=""></span>
          <span class="arena-home-copy-v854"><strong>EVO</strong><small>Персональний рейтинг</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
        </button>
      </div>
      <div class="arena-home-secondary-grid-v854">
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-small-v854" onclick="ArenaV852.go('history')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-history-pixel.gif?v=9.10" alt=""></span>
          <span class="arena-home-copy-v854"><strong>ІСТОРІЯ</strong><small>Результати та архів</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
        </button>
        <button class="arena-tile-v852 arena-home-tile-v854 arena-home-tile-small-v854" onclick="ArenaV852.go('players')">
          <span class="arena-home-icon-v854" aria-hidden="true"><img class="arena-home-icon-img-v875" src="arena-icon-players-pixel.gif?v=9.10" alt=""></span>
          <span class="arena-home-copy-v854"><strong>ГРАВЦІ</strong><small>Статистика і профіль</small></span><span class="arena-home-arrow-v864" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  </div>`}

  const leagueCalendarRoundKeyV1115=r=>`${testCompetition?.id||'league'}::${r?.playoff||'round'}::${r?.round||0}`;
  const leagueCalendarRoundStatusV1115=(r,currentRound)=>{
    const done=(r?.matches||[]).every(isScored);
    if(done)return '✓ Завершено';
    if(r?.playoff && currentRound?.playoff===r.playoff && currentRound?.round===r.round)return '🟢 Поточний';
    if(!r?.playoff && !currentRound?.playoff && currentRound?.round===r.round)return '🟢 Поточний';
    return '🔒 Очікує';
  };
  const leagueCalendarRoundDefaultOpenV1115=(r,currentRound)=>{
    if(!currentRound)return (testCompetition?.rounds||[])[0]===r;
    if(r?.playoff||currentRound?.playoff)return r?.playoff===currentRound?.playoff && r?.round===currentRound?.round;
    return r?.round===currentRound?.round;
  };
  const leagueCalendarRoundOpenV1115=(r,currentRound)=>{
    const key=leagueCalendarRoundKeyV1115(r);
    if(Object.prototype.hasOwnProperty.call(leagueCalendarOpenRoundsV1115,key))return !!leagueCalendarOpenRoundsV1115[key];
    return leagueCalendarRoundDefaultOpenV1115(r,currentRound);
  };

  function league(){
    const t=[["mine","МОЇ МАТЧІ"],["round","ТУР"],["table","ТАБЛИЦЯ"],["calendar","КАЛЕНДАР"]];
    if(testCompetition?.kind==="league"){
      const round=currentLeagueRound();
      const viewer=linkedArenaPlayerName();
      const pending=(round?.matches||[]).find(m=>!isScored(m)&&(isArenaAdmin()||(viewer&&(sameArenaPlayer(viewer,m.home)||sameArenaPlayer(viewer,m.away)))));
      const ownCompleted=!isArenaAdmin()&&viewer?(round?.matches||[]).find(m=>isScored(m)&&(sameArenaPlayer(viewer,m.home)||sameArenaPlayer(viewer,m.away))):null;
      const standings=leagueStandings();
      const leaguePlaceChanges=leaguePlaceChangesV1100(standings);
      const playoffRounds=leaguePlayoffRoundsV1108(testCompetition);
      const playoffAvailable=playoffRounds.length>0;
      if(!playoffAvailable && leagueTableViewV1108==='playoff') leagueTableViewV1108='table';
      const leagueStandingsMatches=(testCompetition.rounds||[]).flatMap(r=>r.matches||[]).filter(m=>!String(m.id||'').startsWith('LP_'));
      const completedLeagueMatches=leagueStandingsMatches.filter(isScored).length;
      const totalLeagueMatches=leagueStandingsMatches.length;
      const leagueCardV1067=m=>`<div class="arena-card-v852 arena-league-card-v920"><div class="arena-gold-v852">${m.id.startsWith('LP_SEMI')?'1/2 ФІНАЛУ':m.id==='LP_FINAL'?'ФІНАЛ':`ТУР ${m.round}`}</div><div class="arena-league-result-row-v1067"><span>${esc(m.home)}</span><strong>${isScored(m)?`${m.homeScore} : ${m.awayScore}`:'VS'}</strong><span>${esc(m.away)}</span></div>${swissFixturePointsHtmlV1137(m)}${matchPendingHtmlV1067(m)}${!isScored(m)?matchActionButtonV1067(m,true):(isArenaAdmin()?`<button class="arena-mini-result-v927" onclick="ArenaV852.modalResult('${jsq(m.id)}')">ВИПРАВИТИ РАХУНОК</button>`:'')}</div>`;
      const leaguePlayoffViewHtmlV1108=()=>playoffAvailable
        ? `${leagueLivePlayoffBracketBoardV1109(testCompetition)}${leagueTableViewSwitchV1108('playoff')}`
        : '';
      const leagueStandingsViewHtmlV1108=()=>`<div class="arena-card-v852 arena-league-card-v920 arena-league-standings-card-v1096"><div class="arena-league-standings-head-v1097"><div><small>ОФІЦІЙНА ТУРНІРНА ТАБЛИЦЯ</small><strong>${esc(testCompetition.title||'CENTURIA LEAGUE')}</strong></div><span>${completedLeagueMatches}/${totalLeagueMatches} матчів</span></div><div class="arena-league-standings-wrap-v1096"><table class="arena-table-v852 arena-league-standings-table-v1096"><thead><tr><th>#</th><th>ГРАВЕЦЬ / КЛУБ</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>ЗГ</th><th>ПГ</th><th>РГ</th><th>О</th></tr></thead><tbody>${standings.map((p,i)=>`<tr class="arena-league-place-row-v1097 ${i===0?'place-1':i===1?'place-2':i===2?'place-3':'place-rest'}"><td><span class="arena-league-rank-v1096"><span class="arena-league-rank-num-v1128">${i+1}</span>${leaguePlaceArrowV1100(leaguePlaceChanges.get(p.name))}</span></td><td class="arena-league-player-cell-v1096"><strong>${esc(p.name)}</strong><small>${esc(competitionClubFor(p.name))}</small></td><td>${p.p}</td><td>${p.w}</td><td>${p.d}</td><td>${p.l}</td><td>${p.gf}</td><td>${p.ga}</td><td><span class="arena-league-gd-v1096 ${(p.gf-p.ga)>0?'plus':(p.gf-p.ga)<0?'minus':'zero'}">${(p.gf-p.ga)>0?'+':''}${p.gf-p.ga}</span></td><td><b class="arena-league-points-v1096">${p.pts}</b></td></tr>`).join("")}</tbody></table><div class="arena-league-mobile-grid-v1099" role="table" aria-label="Турнірна таблиця Ліги"><div class="arena-league-mobile-row-v1099 mobile-head" role="row"><span role="columnheader">#</span><span role="columnheader">ГРАВЕЦЬ</span><span role="columnheader" title="Ігри">І</span><span role="columnheader" title="Перемоги">В</span><span role="columnheader" title="Нічиї">Н</span><span role="columnheader" title="Поразки">П</span><span role="columnheader" title="Забиті голи">ЗГ</span><span role="columnheader" title="Пропущені голи">ПГ</span><span role="columnheader" title="Різниця голів">РГ</span><span role="columnheader" title="Очки">О</span></div>${standings.map((p,i)=>`<div class="arena-league-mobile-row-v1099 ${i===0?'place-1':i===1?'place-2':i===2?'place-3':'place-rest'}" role="row"><span class="mobile-place" role="cell">${i+1}${leaguePlaceArrowV1100(leaguePlaceChanges.get(p.name),true)}</span><span class="mobile-player" role="cell" title="${esc(p.name)} · ${esc(competitionClubFor(p.name))}"><b>${esc(p.name)}</b><small>${esc(competitionClubFor(p.name))}</small></span><span role="cell" aria-label="Ігри: ${p.p}">${p.p}</span><span role="cell" aria-label="Перемоги: ${p.w}">${p.w}</span><span role="cell" aria-label="Нічиї: ${p.d}">${p.d}</span><span role="cell" aria-label="Поразки: ${p.l}">${p.l}</span><span role="cell" aria-label="Забиті голи: ${p.gf}">${p.gf}</span><span role="cell" aria-label="Пропущені голи: ${p.ga}">${p.ga}</span><span role="cell" aria-label="Різниця голів: ${p.gf-p.ga}">${p.gf-p.ga>0?'+':''}${p.gf-p.ga}</span><span class="mobile-points" role="cell" aria-label="Очки: ${p.pts}"><b>${p.pts}</b></span></div>`).join('')}</div></div><div class="arena-league-standings-legend-v1097"><span><i class="top1"></i>1 місце</span><span><i class="top2"></i>2 місце</span><span><i class="top3"></i>3 місце</span></div></div>${playoffAvailable?leagueTableViewSwitchV1108('table'):''}`;
      let body=tab==="mine"
        ? (pending?`<div class="arena-card-v852 arena-league-card-v920"><div class="arena-gold-v852">ТВІЙ МАТЧ • ТУР ${pending.round}</div><div class="arena-match-v852 arena-league-match-v920"><div><h3>${esc(pending.home)}</h3><span class="arena-muted-v852">${esc(competitionClubFor(pending.home))}</span></div><div class="arena-score-v852">VS</div><div class="arena-right-v852"><h3>${esc(pending.away)}</h3><span class="arena-muted-v852">${esc(competitionClubFor(pending.away))}</span></div></div>${matchPendingHtmlV1067(pending)}${matchActionButtonV1067(pending)}</div>`
          : ownCompleted?leagueCardV1067(ownCompleted)
          : `<div class="arena-card-v852"><b>${isArenaAdmin()?(isCompetitionCompleted(testCompetition)?'ЛІГУ ЗАВЕРШЕНО':'УСІ МАТЧІ ТУРУ ЗІГРАНО'):'У ЦЬОМУ ТУРІ НЕМАЄ ТВОГО МАТЧУ'}</b><p class="arena-muted-v852">${isArenaAdmin()?'Усі результати внесено.':'Перевір вкладку «ТУР» або «КАЛЕНДАР». '}</p>${isArenaAdmin()&&isCompetitionCompleted(testCompetition)?`<button class="arena-primary-v852 arena-finish-tournament-v996" onclick="ArenaV852.finishCurrentTournament()">ЗАКРИТИ ЛІГУ</button>`:''}</div>`)
        : tab==="round"
          ? `<div class="arena-swiss-note-v1137" ${testCompetition.leagueFormat==='swiss'?'':'hidden'}>Пари формуються насамперед за очками. Повторні зустрічі дозволені; за рівноцінних пар перевага новим суперникам.</div>${(round?.matches||[]).map(leagueCardV1067).join('')}${swissByeHtmlV1137(round)}`
          : tab==="table"
            ? (leagueTableViewV1108==='playoff'&&playoffAvailable?leaguePlayoffViewHtmlV1108():leagueStandingsViewHtmlV1108())
            : (testCompetition.rounds||[]).map(r=>{
                const label=r.playoff?leaguePlayoffLabelV1108(r):`ТУР ${r.round}`;
                const key=leagueCalendarRoundKeyV1115(r);
                const isOpen=leagueCalendarRoundOpenV1115(r,round);
                const status=leagueCalendarRoundStatusV1115(r,round);
                return `<div class="arena-card-v852 arena-league-card-v920 arena-league-calendar-round-v1115 ${isOpen?'is-open':''}"><button type="button" class="arena-league-calendar-toggle-v1115" onclick="ArenaV852.toggleLeagueCalendarRoundV1115('${jsq(key)}')" aria-expanded="${isOpen?'true':'false'}"><span class="arena-league-calendar-toggle-main-v1115"><b>${esc(label)}</b><small>${esc(status)}</small></span><span class="arena-league-calendar-toggle-side-v1115"><i>${(r.matches||[]).length} ${(r.matches||[]).length===1?'матч':'матчі'}</i><em>${isOpen?'▴':'▾'}</em></span></button><div class="arena-league-calendar-panel-v1115" ${isOpen?'':'hidden'}><div class="arena-league-calendar-matches-v1067">${(r.matches||[]).map(leagueCardV1067).join('')}</div></div></div>`;
              }).join('');
      const advanceButton=isArenaAdmin()&&leagueCanAdvanceV1093(testCompetition)
        ? `<button class="arena-primary-v852 arena-league-next-round-v1093" type="button" onclick="ArenaV852.advanceLeagueRoundV1093()">${testCompetition.leagueFormat==='swiss'?'▶ НАСТУПНИЙ ТУР':testCompetition.rounds.at(-1)?.playoff==='final'?'🏆 ВИЗНАЧИТИ ЧЕМПІОНА':'▶ НАСТУПНИЙ ЕТАП ПЛЕЙ-ОФ'}</button>`:'';
      const swissRepairButton=swissCanRepairRoundV1137(testCompetition)
        ? `<button class="arena-secondary-v852 arena-swiss-repair-v1137" type="button" onclick="ArenaV852.repairSwissRoundV1137()">↻ ПЕРЕРАХУВАТИ ПАРИ ЗА ОЧКАМИ</button>`:'';
      const formatLabel=leagueFormatLabelV1093[testCompetition.leagueFormat]||'ОДНЕ КОЛО';
      const cover=testCompetition.cover?`<div class="arena-league-cover-v1093"><img src="${esc(testCompetition.cover)}" alt="${esc(testCompetition.title)}"></div>`:'';
      const drawButton=testCompetition.draw?.kind==='league' ? `<div class="arena-league-draw-trigger-v1095"><button type="button" class="arena-cup-draw-toggle-v1032" onclick="ArenaV852.openLeagueDrawAnimationV1095()"><span>🎲 ПЕРЕГЛЯНУТИ ЖЕРЕБКУВАННЯ</span><small>ЗАФІКСОВАНІ ГРАВЦІ ТА КЛУБИ · БЕЗ ПЕРЕТАСУВАННЯ</small></button></div>` : '';
      const replaceCover=isArenaAdmin()?`<div class="arena-live-cover-edit-v121"><button type="button" class="arena-secondary-v852 arena-cover-replace-v121" onclick="document.getElementById('arenaLeagueLiveCoverV121')?.click()">🖼 ЗАМІНИТИ ФОТО ЛІГИ</button><input id="arenaLeagueLiveCoverV121" type="file" accept="image/*" hidden onchange="ArenaV852.replaceTournamentCover(this,'league','live')"></div>`:'';
      return `${cover}${replaceCover}<div class="arena-route-head-v920 arena-league-head-v920"><h2>${esc(testCompetition.title||"CENTURIA LEAGUE")}</h2><p class="arena-gold-v852">${testCompetition.participants.length} УЧАСНИКІВ • ${esc(formatLabel)} • ТУР ${round?.round||testCompetition.rounds.length}/${testCompetition.leagueFormat==='swiss'?testCompetition.swissRounds:testCompetition.rounds.length}</p></div>${drawButton}${tabs(t)}${tabStage(body+(tab==='round'?swissRepairButton:'')+advanceButton,t,tab,'ArenaV852.setTab')}`;
    }
    if(leagueSignupPoll){
      const poll=leagueSignupPoll,ready=poll.phase==='ready'||!cupPollStillActive(poll);
      const confirmed=leagueConfirmedV1093(poll),all=leagueAllPlayersV1093(poll);
      const me=linkedArenaPlayerName(),vote=me?leagueVoteForV1093(poll,me):'';
      const labels=all.map(name=>{
        const v=leagueVoteForV1093(poll,name);
        return `<div class="arena-cup-poll-person-v1026"><div class="arena-cup-poll-person-left-v1026">${crestBadge(poll.previewClubs?.[name]||clubFor(name),'')}<div><strong>${esc(name)}</strong><small>${v==='yes'?'ПІДТВЕРДИВ УЧАСТЬ':v==='no'?'НЕ БЕРЕ УЧАСТІ':'ОЧІКУЄ ВІДПОВІДІ'}</small></div></div><span class="arena-cup-poll-status-v1026 ${v==='yes'?'yes':v==='no'?'no':'pending'}">${v==='yes'?'✓':v==='no'?'✖':'…'}</span></div>`;
      }).join('');
      const clubLabels=(poll.allowedClubs||[]).map(n=>`<div class="arena-cup-poll-club-v1028">${crestBadge(n,'')}<span>${esc(n)}</span></div>`).join('');
      const preview=ready?`<section class="arena-league-registration-section-v1093"><b>🎲 ЖЕРЕБКУВАННЯ ЛІГИ</b><p>Після запуску один раз випадково визначаться учасники, їхні клуби й порядок календаря. Кожен побачить жеребкування під час першого входу.</p></section>`:'';
      const admin=isArenaAdmin()?`<div class="arena-cup-poll-admin-actions-v1026">${ready
        ? `<button type="button" class="arena-primary-v852" onclick="ArenaV852.launchLeagueV1093()">🎲 ПРОВЕСТИ ЖЕРЕБКУВАННЯ ТА ЗАПУСТИТИ</button>`
        : `<button type="button" class="arena-secondary-v852" onclick="ArenaV852.closeLeagueRegistrationV1093()">ЗАВЕРШИТИ РЕЄСТРАЦІЮ ДОСТРОКОВО</button>`}
        <button type="button" class="arena-secondary-v852 arena-cover-replace-v121" onclick="document.getElementById('arenaLeagueCoverReplaceV121')?.click()">🖼 ЗАМІНИТИ ФОТО</button><input id="arenaLeagueCoverReplaceV121" type="file" accept="image/*" hidden onchange="ArenaV852.replaceTournamentCover(this,'league')"><button type="button" class="arena-secondary-v852" onclick="ArenaV852.cancelLeagueRegistrationV1093()">СКАСУВАТИ РЕЄСТРАЦІЮ</button></div>`:'';
      const voteActions=me&&!ready?`<div class="arena-cup-poll-actions-v1026"><button type="button" class="arena-primary-v852" onclick="ArenaV852.voteLeagueV1093('yes')">✅ БЕРУ УЧАСТЬ</button><button type="button" class="arena-secondary-v852" onclick="ArenaV852.voteLeagueV1093('no')">✖ НЕ БЕРУ</button></div>`:'';
      const clubsOpen=`<details class="arena-league-registration-section-v1093"><summary>⚽ КОМАНДИ ЛІГИ · ${(poll.allowedClubs||[]).length}</summary><div class="arena-cup-poll-clubs-grid-v1028">${clubLabels}</div></details>`;
      const playersOpen=`<details class="arena-league-registration-section-v1093"><summary>👥 УЧАСНИКИ · ${confirmed.length} ПІДТВЕРДИЛИ</summary><div class="arena-cup-poll-list-v1026">${labels||'Поки немає учасників'}</div></details>`;
      const card=`<div class="arena-card-v852 arena-cup-poll-card-v1026 arena-league-signup-v1093">${poll.cover?`<div class="arena-cup-poll-cover-v1026"><img src="${esc(poll.cover)}" alt="${esc(poll.title)}"></div>`:''}<div class="arena-cup-poll-top-v1026"><div><div class="arena-gold-v852">${ready?'РЕЄСТРАЦІЮ ЗАВЕРШЕНО':'ВІДКРИТО РЕЄСТРАЦІЮ'}</div><h3>${esc(poll.title)}</h3><p class="arena-muted-v852">${esc(leagueFormatLabelV1093[poll.leagueFormat]||'ОДНЕ КОЛО')} · ${confirmed.length} підтвердили участь${poll.leagueFormat==='swiss'?` · ${poll.swissRounds} турів`:''}</p></div><div class="arena-cup-poll-timer-v1026"><strong>${ready?'✓':formatCupPollTimeLeft(poll)}</strong><small>${ready?'ГОТОВО':'ЗАЛИШИЛОСЯ'}</small></div></div>${clubsOpen}${playersOpen}${!me&&!ready?'<p>Для реєстрації прив’яжи футболіста до свого акаунта.</p>':''}${voteActions}${me&&vote?`<p class="arena-muted-v852">Твоя відповідь: ${vote==='yes'?'беру участь':'не беру участь'}</p>`:''}${preview}${admin}</div>`;
      return `<div class="arena-route-head-v920 arena-league-head-v920"><h2>${esc(poll.title)}</h2><p class="arena-gold-v852">${ready?'ОЧІКУЄ ЗАПУСКУ':'РЕЄСТРАЦІЯ • '+formatCupPollTimeLeft(poll)}</p></div>${tabs(t)}${tabStage(card,t,tab,'ArenaV852.setTab')}`;
    }
    const emptyLeague=`<div class="arena-card-v852 arena-empty-state-v978"><div class="arena-empty-icon-v978">⚽</div><b>ЛІГУ ЩЕ НЕ СТВОРЕНО</b><p class="arena-muted-v852">Тут з’явиться активна ліга, таблиця, календар турів і результати після створення турніру.</p>${isArenaAdmin()?`<button class="arena-primary-v852 arena-create-tournament-v996" onclick="ArenaV852.openTournamentCreator('league')">＋ СТВОРИТИ ЛІГУ</button>`:""}</div>`;
    const body=emptyLeague;
    return `<div class="arena-route-head-v920 arena-league-head-v920"><h2>CENTURIA LEAGUE</h2><p class="arena-gold-v852">АКТИВНОЇ ЛІГИ ПОКИ НЕМАЄ</p></div>${tabs(t)}${tabStage(body,t,tab,'ArenaV852.setTab')}`
  }

  function cup(){
    const t=[["mine","МІЙ МАТЧ"],["bracket","СІТКА"],["round","РАУНД"],["old","ІСТОРІЯ"]];
    const cupHero=(title,meta,kicker="ТУРНІР КУБКА")=>`<div class="arena-route-head-v920 arena-cup-hero-v969"><div class="arena-cup-kicker-v969">🏆 ${kicker}</div><h2>${title}</h2><p>${meta}</p></div>`;
    const resultBtn=id=>{const m=allMatches().find(x=>x.id===id);return m?`${matchPendingHtmlV1067(m)}${matchActionButtonV1067(m)}`:'';};
    const matchCard=(home,away,label,action)=>`<div class="arena-card-v852 arena-cup-match-card-v969"><div class="arena-gold-v852 arena-cup-stage-v969">${label}</div><div class="arena-cup-match-v969"><div class="arena-cup-side-v969">${crestBadge(competitionClubFor(home),teamPhotoFor(home))}<h3>${esc(home)}</h3><span>${esc(competitionClubFor(home))}</span></div><div class="arena-cup-vs-v969">VS</div><div class="arena-cup-side-v969">${crestBadge(competitionClubFor(away),teamPhotoFor(away))}<h3>${esc(away)}</h3><span>${esc(competitionClubFor(away))}</span></div></div>${action}</div>`;
    const pairCard=(home,away,scoreHtml,kicker,match=null)=>`<div class="arena-card-v852 arena-cup-pair-v969"><div class="arena-cup-pair-kicker-v969">${kicker}</div><div class="arena-cup-pair-line-v969"><div class="arena-cup-pair-side-v1058">${crestBadge(competitionClubFor(home),teamPhotoFor(home))}<span class="arena-cup-pair-copy-v1058"><b>${esc(home)}</b><span class="arena-muted-v852">${esc(competitionClubFor(home))}</span></span></div><div class="arena-cup-pair-score-v969">${scoreHtml}</div><div class="arena-cup-pair-side-v1058 arena-cup-pair-side-right-v1058">${crestBadge(competitionClubFor(away),teamPhotoFor(away))}<span class="arena-cup-pair-copy-v1058"><b>${esc(away)}</b><span class="arena-muted-v852">${esc(competitionClubFor(away))}</span></span></div></div>${match?matchPendingHtmlV1067(match):''}</div>`;
    if(testCompetition?.kind==="cup"){
      const r=currentCupRound();
      const viewer=currentArenaViewerName();
      const viewerMatch=viewer?(r?.matches||[]).find(m=>sameArenaPlayer(m.home,viewer)||sameArenaPlayer(m.away,viewer)):null;
      const viewerBye=viewer?(r?.byes||[]).find(n=>sameArenaPlayer(n,viewer)):null;
      const pending=(viewerMatch&&!cupMatchFinished(viewerMatch,testCompetition))?viewerMatch:(isArenaAdmin()?(r?.matches||[]).find(m=>!cupMatchFinished(m,testCompetition)):null);
      let body=tab==="mine"
        ? (testCompetition.champion
            ? `<div class="arena-card-v852 arena-cup-win-v969"><div class="arena-cup-win-icon-v969">🏆</div><div class="arena-gold-v852">ПЕРЕМОЖЕЦЬ КУБКА</div><h3>${esc(testCompetition.champion)}</h3><p>${esc(competitionClubFor(testCompetition.champion))}</p>${isArenaAdmin()?`<button class="arena-primary-v852 arena-finish-tournament-v996" onclick="ArenaV852.finishCurrentTournament()">ЗАКРИТИ КУБОК</button>`:""}</div>`
            : viewerBye
              ? `<div class="arena-card-v852 arena-cup-bye-v1032"><div class="arena-cup-draw-icon-v1032">🎟️</div><div class="arena-gold-v852">ТВІЙ ЖЕРЕБ</div><h3>${esc(viewerBye)}</h3><p>Команда: <b>${esc(competitionClubFor(viewerBye))}</b></p><strong>BYE — ПРОХІД У НАСТУПНИЙ РАУНД</strong></div>`
              : pending
                ? matchCard(pending.home,pending.away,`${r?.label||"КУБОК"} • ${cupLegCount(testCompetition)===2?'ДВА МАТЧІ':'ОДИН МАТЧ'} • ${cupMatchScore(pending,testCompetition)}`,resultBtn(pending.id))
                : `<div class="arena-card-v852 arena-cup-empty-v969"><b>ОЧІКУЄМО НАСТУПНИЙ РАУНД</b><p class="arena-muted-v852">Як тільки з’явиться нова пара, вона відобразиться тут.</p></div>`)
        : tab==="bracket"
          ? cupLiveBracketBoardV1036()
          : tab==="round"
            ? ((r?.matches||[]).map(m=>pairCard(m.home,m.away,cupMatchFinished(m,testCompetition)?`${cupMatchScore(m,testCompetition)}${isArenaAdmin()?`<button class="arena-mini-result-v927" onclick="ArenaV852.modalResult('${jsq(m.id)}')">ВИПРАВИТИ</button>`:''}`:(matchActionButtonV1067(m,true)||cupMatchScore(m,testCompetition)),r?.label||"ПОТОЧНИЙ РАУНД",m)).join("") || `<div class="arena-card-v852 arena-cup-empty-v969">Матчів поки немає</div>`)
            : (allMatches().filter(m=>cupMatchFinished(m,testCompetition)).map(m=>pairCard(m.home,m.away,cupMatchScore(m,testCompetition),"ЗАВЕРШЕНА ПАРА")).join("")||`<div class="arena-card-v852 arena-cup-empty-v969">Історії ще немає</div>`);
      const draw=testCompetition.draw||null;
      const drawRows=draw?((draw.pairs||[]).map(pair=>`<div class="arena-cup-draw-pair-v1032"><div>${crestBadge(pair.homeClub,'')}<span><strong>${esc(pair.home)}</strong><small>${esc(pair.homeClub)}</small></span></div><b>VS</b><div>${crestBadge(pair.awayClub,'')}<span><strong>${esc(pair.away)}</strong><small>${esc(pair.awayClub)}</small></span></div></div>`).join('')+(draw.byes||[]).map(x=>`<div class="arena-cup-draw-pair-v1032 bye"><div>${crestBadge(x.club,'')}<span><strong>${esc(x.player)}</strong><small>${esc(x.club)}</small></span></div><b>BYE</b><div><span><strong>Без суперника</strong><small>Прохід далі</small></span></div></div>`).join('')):'';
      const drawBlock=draw?`<div class="arena-cup-draw-shell-v1032"><button class="arena-cup-draw-toggle-v1032 ${cupDrawAnimationOpenV1033?'on':''}" type="button" onclick="ArenaV852.openCupDrawAnimation()"><span>🎲 ЖЕРЕБКУВАННЯ</span><small>ПУСТА СІТКА → РУЛЕТКА → ПАРИ ТА КОМАНДИ</small></button></div>`:'';
      const meta=testCompetition.champion?`${testCompetition.participants.length} УЧАСНИКІВ • ЗАВЕРШЕНО`:`${testCompetition.participants.length} УЧАСНИКІВ • ${r?.label||"АКТИВНИЙ КУБОК"}`;
      const liveCover=testCompetition.cover?`<div class="arena-cup-poll-cover-v1026 arena-live-cup-cover-v121"><img src="${esc(testCompetition.cover)}" alt="${esc(testCompetition.title||'CENTURIA CUP')}"></div>`:'';
      const replaceCover=isArenaAdmin()?`<div class="arena-live-cover-edit-v121"><button type="button" class="arena-secondary-v852 arena-cover-replace-v121" onclick="document.getElementById('arenaCupLiveCoverV121')?.click()">🖼 ЗАМІНИТИ ФОТО КУБКА</button><input id="arenaCupLiveCoverV121" type="file" accept="image/*" hidden onchange="ArenaV852.replaceTournamentCover(this,'cup','live')"></div>`:'';
      return `${cupHero(testCompetition.title||'CENTURIA CUP',meta,'ТУРНІР КУБКА')}${liveCover}${replaceCover}${drawBlock}${tabs(t)}${tabStage(body,t,tab,'ArenaV852.setTab')}`;
    }
    if(cupSignupPoll){
      const poll=cupSignupPoll;
      const confirmed=cupPollConfirmedPlayers(poll);
      const declined=cupPollDeclinedPlayers(poll);
      const pendingVotes=cupPollPendingPlayers(poll);
      const myName=currentArenaViewerName();
      const myVote=myName?cupPollVoteFor(poll,myName):'';
      const canVote=!!myName;
      const visiblePollPlayers=cupPollAllPlayers(poll);
      const participantsHtml=visiblePollPlayers.map(name=>{
        const status=cupPollVoteFor(poll,name);
        const label=status==='yes'?'ПІДТВЕРДИВ':status==='no'?'ВІДМОВИВСЯ':'ОЧІКУЄ';
        const cls=status==='yes'?'yes':status==='no'?'no':'pending';
        return `<div class="arena-cup-poll-person-v1026"><div class="arena-cup-poll-person-left-v1026">${crestBadge(cupPollParticipantClubFor(poll,name),teamPhotoFor(name))}<div><strong>${esc(name)}</strong><small>${esc(cupPollParticipantClubFor(poll,name))}</small></div></div><span class="arena-cup-poll-status-v1026 ${cls}">${label}</span></div>`;
      }).join('');
      const allowedClubsHtml=(poll.allowedClubs||[]).map(club=>`<div class="arena-cup-poll-club-v1028">${crestBadge(club,'')}<span>${esc(club)}</span></div>`).join('');
      const pollDetailsButtons=`<div class="arena-cup-poll-detail-tabs-v1031"><button type="button" class="${cupPollPanelV1031==='clubs'?'on':''}" onclick="ArenaV852.toggleCupPollPanel('clubs')">⚽ КОМАНДИ <span>${(poll.allowedClubs||[]).length}</span></button><button type="button" class="${cupPollPanelV1031==='players'?'on':''}" onclick="ArenaV852.toggleCupPollPanel('players')">👥 УЧАСНИКИ <span>${visiblePollPlayers.length}</span></button></div>`;
      const clubsPanel=cupPollPanelV1031==='clubs'?`<div class="arena-cup-poll-detail-panel-v1031 arena-cup-poll-clubs-v1028"><div class="arena-gold-v852">КОМАНДИ КУБКА</div>${allowedClubsHtml?`<div class="arena-cup-poll-clubs-grid-v1028">${allowedClubsHtml}</div>`:`<div class="arena-cup-poll-detail-empty-v1031">Команди для цього Кубка ще не вказані.</div>`}</div>`:'';
      const playersPanel=cupPollPanelV1031==='players'?`<div class="arena-cup-poll-detail-panel-v1031"><div class="arena-gold-v852">УЧАСНИКИ ГОЛОСУВАННЯ</div><div class="arena-cup-poll-list-v1026">${participantsHtml||`<div class="arena-cup-poll-detail-empty-v1031">Поки ніхто не долучився.</div>`}</div></div>`:'';
      const drawReady=poll.phase==='draw_ready'||!cupPollStillActive(poll);
      const voteBox=`<div class="arena-cup-poll-actions-v1026">${canVote && !drawReady?`<button class="arena-primary-v852" type="button" onclick="ArenaV852.voteCupSignup('yes')">✅ БЕРУ УЧАСТЬ</button><button class="arena-secondary-v852" type="button" onclick="ArenaV852.voteCupSignup('no')">✖ НЕ БЕРУ</button>`:''}${!canVote&&!drawReady?`<div class="arena-cup-poll-note-v1026">Щоб голосувати, акаунт має бути прив’язаний до твого гравця.</div>`:''}${canVote&&myVote?`<div class="arena-cup-poll-note-v1026">Твій голос: <b>${myVote==='yes'?'беру участь':'не беру участь'}</b>${drawReady?'. Реєстрацію вже завершено.':'. Його можна змінити до завершення голосування.'}</div>`:''}${drawReady&&!isArenaAdmin()?`<div class="arena-cup-draw-wait-v1032"><b>🎲 ОЧІКУЄМО ЖЕРЕБКУВАННЯ</b><span>ADMIN проведе жереб. Після цього тут з’являться твоя команда та суперник.</span></div>`:''}</div>`;
      const adminActions=isArenaAdmin()?`<div class="arena-cup-poll-admin-actions-v1026">${drawReady?`<button class="arena-primary-v852 arena-cup-draw-now-v1032" type="button" onclick="ArenaV852.conductCupDraw()">🎲 ПРОВЕСТИ ЖЕРЕБКУВАННЯ</button>`:`<button class="arena-secondary-v852" type="button" onclick="ArenaV852.finalizeCupSignupPoll(true)">ЗАВЕРШИТИ РЕЄСТРАЦІЮ ДОСТРОКОВО</button>`}<button class="arena-secondary-v852 arena-cover-replace-v121" type="button" onclick="document.getElementById('arenaCupCoverReplaceV121')?.click()">🖼 ЗАМІНИТИ ФОТО</button><input id="arenaCupCoverReplaceV121" type="file" accept="image/*" hidden onchange="ArenaV852.replaceTournamentCover(this,'cup')"><button class="arena-secondary-v852" type="button" onclick="ArenaV852.cancelCupSignupPoll()">СКАСУВАТИ ГОЛОСУВАННЯ</button></div>`:'';
      const stageLead=drawReady?'Реєстрацію завершено. Учасники очікують жеребкування команд і пар першого раунду.':(tab==='bracket'?'Сітка з’явиться після жеребкування.':tab==='round'?'Пари раунду з’являться після жеребкування.':'Поки триває голосування, гравці підтверджують свою участь у Кубку.');
      const body=`<div class="arena-card-v852 arena-cup-poll-card-v1026 ${drawReady?'is-draw-ready-v1032':''}">${poll.cover?`<div class="arena-cup-poll-cover-v1026"><img src="${esc(poll.cover)}" alt="${esc(poll.title||'CENTURIA CUP')}"></div>`:''}<div class="arena-cup-poll-top-v1026"><div><div class="arena-gold-v852">${drawReady?'РЕЄСТРАЦІЮ ЗАВЕРШЕНО':'ГОЛОСУВАННЯ НА КУБОК'}</div><h3>${esc(poll.title||'CENTURIA CUP')}</h3><p class="arena-muted-v852">${stageLead}</p></div><div class="arena-cup-poll-timer-v1026"><strong>${drawReady?'🎲':formatCupPollTimeLeft(poll)}</strong><small>${drawReady?'ЧЕКАЄМО ЖЕРЕБ':'ДО ЗАВЕРШЕННЯ'}</small></div></div>${pollDetailsButtons}${clubsPanel}${playersPanel}<div class="arena-cup-poll-stats-v1026"><span><b>${confirmed.length}</b><small>ПІДТВЕРДИЛИ</small></span><span><b>${pendingVotes.length}</b><small>ОЧІКУЮТЬ</small></span><span><b>${declined.length}</b><small>ВІДМОВИЛИСЬ</small></span></div>${voteBox}${adminActions}</div>`;
      const meta=`${confirmed.length} ПІДТВЕРДИЛИ • ${drawReady?'ОЧІКУЄ ЖЕРЕБКУВАННЯ':`ГОЛОСУВАННЯ ${formatCupPollTimeLeft(poll)}`}`;
      return `${cupHero(poll.title||'CENTURIA CUP',meta,'ТУРНІР КУБКА')}${tabs(t)}${tabStage(body,t,tab,'ArenaV852.setTab')}`}
    const emptyCup=`<div class="arena-card-v852 arena-empty-state-v978"><div class="arena-empty-icon-v978">🏆</div><b>КУБОК ЩЕ НЕ СТВОРЕНО</b><p class="arena-muted-v852">Після створення кубка тут з’являться сітка, пари раунду, результати та історія матчів.</p>${isArenaAdmin()?`<button class="arena-primary-v852 arena-create-tournament-v996" onclick="ArenaV852.openTournamentCreator('cup')">＋ СТВОРИТИ КУБОК</button>`:""}</div>`;
    const body=emptyCup;
    return `${cupHero('CENTURIA CUP','АКТИВНОГО КУБКА ПОКИ НЕМАЄ','ТУРНІР КУБКА')}${tabs(t)}${tabStage(body,t,tab,'ArenaV852.setTab')}`}

  function friendly(){
    const t=[["mine","МОЇ МАТЧІ"],["all","УСІ МАТЧІ"]];
    const mine=currentArenaPlayerName();
    const api=friendlyApiV1007();
    const me=friendlyRemoteMeV1007();

    const all=getFriendlyMatchesCombinedV1007()
      .slice()
      .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const list=tab==="all"?all:all.filter(m=>m.home===mine||m.away===mine);

    const side=(player,club)=>`<div class="arena-friendly-side-v972"><b>${esc(player)}</b><div class="arena-friendly-crest-v972">${crestBadge(club,teamPhotoFor(player))}</div><span>${esc(club)}</span></div>`;
    const resultCenter=m=>{
      if(friendlyIsScored(m)) return `<strong>${m.homeScore} : ${m.awayScore}</strong><small>ЗАВЕРШЕНО</small>`;
      const row=friendlyRemoteRowForMatchV1010(m.id);
      if(!row){
        return `<strong>VS</strong><small>ОЧІКУЄ РЕЗУЛЬТАТ</small>${isArenaAdmin()?`<button type="button" class="arena-mini-result-v927 arena-friendly-result-v972" onclick="ArenaV852.modalFriendlyResult('${jsq(m.id)}')">ВНЕСТИ</button>`:""}`;
      }
      if(row.result_proposal_status==="pending"){
        const score=`${Number(row.proposed_home_score)||0} : ${Number(row.proposed_away_score)||0}`;
        const mineProposal=row.result_proposed_by===me?.user_id;
        return `<strong class="arena-friendly-proposed-score-v1010">${score}</strong><small>${mineProposal?"ЧЕКАЄ ПІДТВЕРДЖЕННЯ":"ПОТРІБНЕ ТВОЄ ПІДТВЕРДЖЕННЯ"}</small><button type="button" class="arena-mini-result-v927 arena-friendly-result-v972${mineProposal?' waiting':''}" onclick="ArenaV852.modalFriendlyResult('${jsq(m.id)}')">${mineProposal?"СТАН":"ПЕРЕВІРИТИ"}</button>`;
      }
      const rejected=row.result_proposal_status==="rejected";
      return `<strong>VS</strong><small>${rejected?"РАХУНОК ВІДХИЛЕНО · МОЖНА ПОДАТИ НОВИЙ":"ОЧІКУЄ РЕЗУЛЬТАТ"}</small>${friendlyIsParticipantV1010(row)||isArenaAdmin()?`<button type="button" class="arena-mini-result-v927 arena-friendly-result-v972" onclick="ArenaV852.modalFriendlyResult('${jsq(m.id)}')">${isArenaAdmin()?"ВНЕСТИ":"ЗАПРОПОНУВАТИ"}</button>`:""}`;
    };
    const card=m=>`<div class="arena-card-v852 arena-friendly-match-v972">${side(m.home,m.homeClub)}<div class="arena-friendly-center-v972">${resultCenter(m)}</div>${side(m.away,m.awayClub)}</div>`;

    const incoming=(friendlyRemoteRowsV1007||[]).filter(row=>
      String(row.status||"")==="pending" &&
      row.recipient_user_id===me?.user_id
    );
    const outgoing=(friendlyRemoteRowsV1007||[]).filter(row=>
      String(row.status||"")==="pending" &&
      row.sender_user_id===me?.user_id
    );
    const resultIncoming=(friendlyRemoteRowsV1007||[]).filter(row=>friendlyNeedsMyResultConfirmationV1010(row)||(isArenaAdmin()&&row.status==='accepted'&&row.result_proposal_status==='pending'));

    const incomingHtml=incoming.map(row=>`<div class="arena-card-v852 arena-friendly-challenge-v1007 incoming">
      <div class="arena-friendly-challenge-kicker-v1007">⚔️ ВХІДНИЙ ВИКЛИК</div>
      <div class="arena-friendly-challenge-main-v1007">
        <div>${crestBadge(row.sender_club,"")}<span><b>${esc(row.sender_player)}</b><small>${esc(row.sender_club)}</small></span></div>
        <strong>VS</strong>
        <div>${crestBadge(clubFor(row.recipient_player),"")}<span><b>${esc(row.recipient_player)}</b><small>Вибери свою команду</small></span></div>
      </div>
      <div class="arena-friendly-challenge-actions-v1007">
        <button class="arena-primary-v852" type="button" onclick="ArenaV852.openIncomingFriendly('${jsq(row.id)}')">ВИБРАТИ КОМАНДУ Й ПІДТВЕРДИТИ</button>
        <button class="arena-secondary-v852" type="button" onclick="ArenaV852.declineIncomingFriendly('${jsq(row.id)}')">ВІДХИЛИТИ</button>
      </div>
    </div>`).join("");

    const resultIncomingHtml=resultIncoming.map(row=>`<div class="arena-card-v852 arena-friendly-challenge-v1007 arena-friendly-result-request-v1010 incoming">
      <div class="arena-friendly-challenge-kicker-v1007">⚽ РЕЗУЛЬТАТ НА ПІДТВЕРДЖЕННЯ</div>
      <div class="arena-friendly-result-request-score-v1010"><span>${esc(row.sender_player)}</span><strong>${Number(row.proposed_home_score)||0} : ${Number(row.proposed_away_score)||0}</strong><span>${esc(row.recipient_player)}</span></div>
      <div class="arena-friendly-challenge-actions-v1007">
        <button class="arena-primary-v852" type="button" onclick="ArenaV852.modalFriendlyResult('DB_${jsq(row.id)}')">ПЕРЕВІРИТИ РАХУНОК</button>
      </div>
    </div>`).join("");

    const outgoingHtml=outgoing.map(row=>`<div class="arena-card-v852 arena-friendly-challenge-v1007 outgoing">
      <div class="arena-friendly-challenge-kicker-v1007">⏳ ВИКЛИК НАДІСЛАНО</div>
      <div class="arena-friendly-challenge-main-v1007">
        <div>${crestBadge(row.sender_club,"")}<span><b>${esc(row.sender_player)}</b><small>${esc(row.sender_club)}</small></span></div>
        <strong>VS</strong>
        <div>${crestBadge(clubFor(row.recipient_player),"")}<span><b>${esc(row.recipient_player)}</b><small>Очікуємо підтвердження</small></span></div>
      </div>
    </div>`).join("");

    const challengeHtml=(tab==="mine" && (incomingHtml||resultIncomingHtml||outgoingHtml))
      ? `<div class="arena-friendly-challenges-v1007">${incomingHtml}${resultIncomingHtml}${outgoingHtml}</div>`
      : "";

    const body=list.length
      ? list.map(card).join("")
      : `<div class="arena-card-v852 arena-friendly-empty-v972"><b>Матчів поки немає</b><p class="arena-muted-v852">${api?.isReady?.()?"Надісланий виклик з’явиться у суперника в його акаунті.":"Створи нову товариську гру — вона з’явиться тут."}</p></div>`;

    return `<div class="arena-actions-v852 arena-friendly-headrow-v972 arena-friendly-headrow-compact-v1002"><button class="arena-primary-v852" onclick="ArenaV852.modalMatch()">＋ СТВОРИТИ МАТЧ</button></div>${tabs(t)}${challengeHtml}${tabStage(body,t,tab,'ArenaV852.setTab')}`;
  }
  function evo(){
    const q=arenaPlayerList();
    return `<section class="arena-evo-page-v967">
      <div class="arena-evo-hero-v967">
        <div class="arena-evo-kicker-v967">🔥 CENTURIA EVO</div>
        <h2>РЕЙТИНГ ГРАВЦІВ</h2>
        <p>Старт 1000 <span>•</span> Elo K=32 <span>•</span> мінімум 100</p>
      </div>
      <div class="arena-evo-list-v967">
        ${q.map((p,i)=>{
          const place=i+1;
          const topClass=place<=3?` top-${place}`:"";
          const medal=place===1?"🥇":place===2?"🥈":place===3?"🥉":"";
          return `<button class="arena-evo-row-v967${topClass}" type="button" onclick="ArenaV852.openArenaPlayer('${jsq(p.name)}')">
            <span class="arena-evo-place-v967"><b>${medal||place}</b><small>${place<=3?"ТОП":"МІСЦЕ"}</small></span>
            <span class="arena-evo-name-v967"><strong>${esc(p.name)}</strong><small>#${place} У РЕЙТИНГУ</small></span>
            <span class="arena-evo-score-v967"><strong>${p.evo}</strong><small>EVO</small></span>
          </button>`;
        }).join("")}
      </div>
    </section>`;
  }
  function players(){
    const list=arenaPlayerList();
    return `<div class="arena-route-head-v881"><h2>ГРАВЦІ</h2><p class="arena-route-subtitle-v881">РЕЙТИНГ ARENA</p></div><div class="arena-players-v852">${list.map(p=>`<button class="arena-card-v852 arena-pitem-v852 arena-pitem-v930" type="button" onclick="ArenaV852.openArenaPlayer('${jsq(p.name)}')">${playerCardThumb(p)}<div class="arena-pmeta-v930"><b>${esc(p.name)}</b><div class="arena-gold-v852">🔥 ${p.evo} EVO • #${p.rank}</div><div class="arena-muted-v852">❤️ ${esc(p.favoriteTeam)}</div><div class="arena-player-record-v930">В: ${p.record.w} • Н: ${p.record.d} • П: ${p.record.l}</div></div>${crestBadge(p.favoriteTeam,p.favoriteTeamPhoto)}</button>`).join("")}</div>`
  }
  const cupHistoryDetail=(m,comp)=>{
    if(cupLegCount(comp)!==2)return cupMatchScore(m,comp);
    const first=isScored(m)?`${m.homeScore}:${m.awayScore}`:'—';
    const second=cupLeg2Scored(m)?`${m.leg2HomeScore}:${m.leg2AwayScore}`:'—';
    return `М1 ${first} · М2 ${second} · Σ ${cupMatchScore(m,comp)}${m.tiebreakWinner?' · пен.: '+m.tiebreakWinner:''}`;
  };
  const historyArchiveEntryById=(kind,archiveId)=>historyArchiveItems(kind).find(item=>String(item.archiveId||item.competitionId||item.title)===String(archiveId||''))||null;
  const historyLeagueTableHtmlV992=entry=>{
    const rows=Array.isArray(entry?.standings)?entry.standings:[];
    const title=entry?.title||'CENTURIA LEAGUE';
    const leagueMatches=(Array.isArray(entry?.rounds)?entry.rounds:[])
      .filter(r=>!r?.playoff)
      .flatMap(r=>(r?.matches||[]).filter(m=>!String(m?.id||'').startsWith('LP_')));
    const inferredMatches=Math.round(rows.reduce((sum,row)=>sum+Number(row?.p||0),0)/2);
    const totalMatches=leagueMatches.length||inferredMatches;
    const completedMatches=leagueMatches.length?leagueMatches.filter(isScored).length:inferredMatches;
    return `<div class="arena-card-v852 arena-league-card-v920 arena-league-standings-card-v1096 arena-history-league-table-card-v1120"><div class="arena-league-standings-head-v1097"><div><small>ОФІЦІЙНА ТУРНІРНА ТАБЛИЦЯ</small><strong>${esc(title)}</strong></div><span>${completedMatches}/${totalMatches||completedMatches} матчів</span></div><div class="arena-league-standings-wrap-v1096"><table class="arena-table-v852 arena-league-standings-table-v1096"><thead><tr><th>#</th><th>ГРАВЕЦЬ</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>ЗГ</th><th>ПГ</th><th>РГ</th><th>О</th></tr></thead><tbody>${rows.map((row,i)=>{const gd=(row.gf??0)-(row.ga??0);return `<tr class="arena-league-place-row-v1097 ${i===0?'place-1':i===1?'place-2':i===2?'place-3':'place-rest'}"><td><span class="arena-league-rank-v1096"><span class="arena-league-rank-num-v1128">${i+1}</span></span></td><td class="arena-league-player-cell-v1096"><strong>${esc(row.name)}</strong><small>${esc(canonicalTeamName(row.club||'Centuria'))}</small></td><td>${row.p??0}</td><td>${row.w??0}</td><td>${row.d??0}</td><td>${row.l??0}</td><td>${row.gf??0}</td><td>${row.ga??0}</td><td><span class="arena-league-gd-v1096 ${gd>0?'plus':gd<0?'minus':'zero'}">${gd>0?'+':''}${gd}</span></td><td><b class="arena-league-points-v1096">${row.pts??0}</b></td></tr>`}).join('')}</tbody></table><div class="arena-league-mobile-grid-v1099" role="table" aria-label="Архівна турнірна таблиця Ліги"><div class="arena-league-mobile-row-v1099 mobile-head" role="row"><span role="columnheader">#</span><span role="columnheader">ГРАВЕЦЬ</span><span role="columnheader">І</span><span role="columnheader">В</span><span role="columnheader">Н</span><span role="columnheader">П</span><span role="columnheader">ЗГ</span><span role="columnheader">ПГ</span><span role="columnheader">РГ</span><span role="columnheader">О</span></div>${rows.map((row,i)=>{const gd=(row.gf??0)-(row.ga??0);return `<div class="arena-league-mobile-row-v1099 ${i===0?'place-1':i===1?'place-2':i===2?'place-3':'place-rest'}" role="row"><span class="mobile-place" role="cell">${i+1}</span><span class="mobile-player" role="cell" title="${esc(row.name)} · ${esc(canonicalTeamName(row.club||'Centuria'))}"><b>${esc(row.name)}</b><small>${esc(canonicalTeamName(row.club||'Centuria'))}</small></span><span role="cell">${row.p??0}</span><span role="cell">${row.w??0}</span><span role="cell">${row.d??0}</span><span role="cell">${row.l??0}</span><span role="cell">${row.gf??0}</span><span role="cell">${row.ga??0}</span><span role="cell">${gd>0?'+':''}${gd}</span><span class="mobile-points" role="cell"><b>${row.pts??0}</b></span></div>`}).join('')}</div></div><div class="arena-league-standings-legend-v1097"><span><i class="top1"></i>1 місце</span><span><i class="top2"></i>2 місце</span><span><i class="top3"></i>3 місце</span></div></div>`;
  };
  const historyCupBracketHtmlV992=rounds=>(rounds||[]).map(round=>`<div class="arena-card-v852 arena-cup-bracket-v969 arena-history-bracket-v992"><h3>${esc(round.label||'РАУНД')}</h3><div class="arena-cup-bracket-list-v969">${(round.matches||[]).map(match=>`<div class="arena-cup-bracket-item-v969 arena-history-bracket-item-v992"><span><strong>${esc(match.home)}</strong><small>${esc(canonicalTeamName(match.homeClub||'Centuria'))}</small></span><b>${Number.isInteger(match.homeScore)&&Number.isInteger(match.awayScore)?`${match.homeScore} : ${match.awayScore}`:'— : —'}</b><span><strong>${esc(match.away)}</strong><small>${esc(canonicalTeamName(match.awayClub||'Centuria'))}</small></span></div>`).join('')}${(round.byes||[]).map(name=>`<div class="arena-cup-bracket-item-v969 arena-history-bracket-item-v992"><span><strong>${esc(name)}</strong><small>${esc(canonicalTeamName((historyArchiveEntryById('cup','')?.participantClubs||{})[name]||clubFor(name)))}</small></span><b>BYE</b><span>—</span></div>`).join('')}</div></div>`).join('');
  // v11.17 — archived League playoff is separate from the regular-season table.
  const historyLeaguePlayoffRoundsV1117=entry=>{
    if(entry?.kind!=='league'||entry.leagueFormat!=='top4')return [];
    const rounds=Array.isArray(entry.rounds)?entry.rounds:[];
    const flagged=rounds.filter(r=>r.playoff==='semi'||r.playoff==='final');
    if(flagged.length){
      return flagged.map(r=>({...r,label:r.playoff==='semi'?'1/2 ФІНАЛУ':'ФІНАЛ'}));
    }
    if(rounds.length<2)return [];
    const [semi,final]=rounds.slice(-2);
    if(semi?.matches?.length!==2||final?.matches?.length!==1)return [];
    return [{...semi,playoff:'semi',label:'1/2 ФІНАЛУ'},
      {...final,playoff:'final',label:'ФІНАЛ'}];
  };
  // v10.62: render a finished Cup from its archived rounds, not the active competition.
  const historyCupBracketBoardV1062=(entry,leaguePlayoff=false)=>{
    const rounds=leaguePlayoff?historyLeaguePlayoffRoundsV1117(entry):(Array.isArray(entry?.rounds)?entry.rounds:[]);
    if(!rounds.length)return `<div class="arena-card-v852 arena-history-empty-v1062">${leaguePlayoff?'Сітка плей-офф у цьому архіві недоступна.':'Сітка цього Кубка в архіві відсутня.'}</div>`;
    const legs=cupLegCount(entry);
    const initialNodes=(rounds[0]?.matches?.length||0)+(rounds[0]?.byes?.length||0);
    const height=Math.max(470,initialNodes*(legs===2?144:114)+40);
    const columns=rounds.map((round,idx)=>{
      const label=String(round.label||`РАУНД ${idx+1}`);
      const matches=Array.isArray(round.matches)?round.matches:[];
      const byes=Array.isArray(round.byes)?round.byes:[];
      const nodes=matches.map((m,i)=>{
        const homeClub=m.homeClub||entry.participantClubs?.[m.home]||clubFor(m.home);
        const awayClub=m.awayClub||entry.participantClubs?.[m.away]||clubFor(m.away);
        const aggregate=legs===2&&cupLeg2Scored(m)?cupAggregate(m):null;
        const homeScore=aggregate?aggregate.home:(isScored(m)?m.homeScore:'');
        const awayScore=aggregate?aggregate.away:(isScored(m)?m.awayScore:'');
        const scoreText=leaguePlayoff?(isScored(m)?`${m.homeScore} : ${m.awayScore}${m.tiebreakWinner?' · пен.':''}`:'— : —'):cupMatchScore(m,entry);
        const playoffFinal=rounds.find(r=>r.playoff==='final')?.matches?.[0];
        const winner=leaguePlayoff
          ? (leaguePlayoffWinnerV1093(m)||((idx===0 && playoffFinal)?[m.home,m.away].find(n=>[playoffFinal.home,playoffFinal.away].some(p=>sameArenaPlayer(p,n)))||'':''))
          : (cupMatchWinner(m,entry)||'');
        const details=leaguePlayoff?(m.tiebreakWinner?`<small class="arena-history-match-detail-v1062">Пенальті: ${esc(m.tiebreakWinner)}</small>`:''):(legs===2?`<small class="arena-history-match-detail-v1062">${esc(cupHistoryDetail(m,entry))}</small>`:'');
        return `<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 is-complete" data-home="${esc(m.home)}" data-away="${esc(m.away)}" data-winner="${esc(winner)}"><div class="arena-cup-bracket-match-no-v1036">${esc(label)}${matches.length>1?` · ${i+1}`:''}</div>${cupBracketEntryV1040(m.home,homeClub,{revealed:true,score:homeScore})}${cupBracketVsV1040(scoreText)}${cupBracketEntryV1040(m.away,awayClub,{revealed:true,score:awayScore})}${details}</div>`;
      }).join('');
      const byeNodes=byes.map(name=>`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 bye is-complete" data-home="${esc(name)}" data-away="" data-winner="${esc(name)}"><div class="arena-cup-bracket-match-no-v1036">BYE</div>${cupBracketEntryV1040(name,entry.participantClubs?.[name]||clubFor(name),{revealed:true})}${cupBracketVsV1040('BYE')}${cupBracketEntryV1040('Автопрохід','',{ghost:true,empty:'→',clubPlaceholder:'У наступний раунд'})}</div>`).join('');
      return `<section class="arena-cup-bracket-stage-v1036 ${idx?'future-stage':'first'}"><header><span>${esc(label)}</span><small>${matches.length} ${matches.length===1?'матч':'матчі'}${byes.length?` · ${byes.length} BYE`:''}</small></header><div class="arena-cup-bracket-stage-nodes-v1036">${nodes}${byeNodes}</div></section>`;
    }).join('');
    return `<div class="arena-card-v852 arena-cup-bracket-card-v1036 arena-cup-bracket-card-compact-v1037 arena-history-bracket-v1062"><div class="arena-cup-bracket-compact-title-v1037"><b>🏆 ${esc(entry.title||(leaguePlayoff?'CENTURIA LEAGUE':'CENTURIA CUP'))}</b><small>${leaguePlayoff?'ПЛЕЙ-ОФ ЛІГИ':`ФІНАЛЬНА СІТКА · ${legs===2?'2 МАТЧІ':'1 МАТЧ'}`}</small></div><div class="arena-cup-bracket-scroll-v1036" role="region" aria-label="Завершена турнірна сітка"><div class="arena-cup-bracket-board-v1036 live" style="--bracket-height:${height}px;--bracket-stages:${rounds.length}">${columns}</div></div></div>`;
  };
  function openHistoryArchiveV992(kind,archiveId){
    const entry=historyArchiveEntryById(kind,archiveId);
    if(!entry){
      modal(`<div class="arena-history-modal-v992"><div class="arena-history-modal-head-v992"><div><small>ARENA · ІСТОРІЯ</small><h2>АРХІВ ТУРНІРУ</h2></div><button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button></div><p>Архів цього турніру поки ще не заповнений.</p><div class="arena-history-modal-actions-v992"><button class="arena-primary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button></div></div>`);
      return;
    }
    const winnerClub=canonicalTeamName(entry.winnerClub||entry.standings?.[0]?.club||'Centuria');
    const leaguePlayoff=kind==='league'&&historyLeaguePlayoffRoundsV1117(entry).length>0;
    const leagueContent=leaguePlayoff
      ? `<div class="arena-history-league-switch-v1117" role="group" aria-label="Перегляд історії ліги"><button type="button" class="on" aria-pressed="true" onclick="ArenaV852.setHistoryLeagueViewV1117(this,'table')">ТАБЛИЦЯ</button><button type="button" aria-pressed="false" onclick="ArenaV852.setHistoryLeagueViewV1117(this,'playoff')">ПЛЕЙ-ОФ</button></div><section class="arena-history-league-panel-v1117" data-history-league-panel="table">${historyLeagueTableHtmlV992(entry)}</section><section class="arena-history-league-panel-v1117" data-history-league-panel="playoff" hidden>${historyCupBracketBoardV1062(entry,true)}</section>`
      : historyLeagueTableHtmlV992(entry);
    const body=kind==='league'?leagueContent:historyCupBracketBoardV1062(entry);
    modal(`<div class="arena-history-modal-v992"><div class="arena-history-modal-head-v992"><div><small>ARENA · ІСТОРІЯ ТУРНІРУ</small><h2>${esc(entry.title||'АРХІВ')}</h2><p>${kind==='league'?'ОСТАННЯ ТУРНІРНА ТАБЛИЦЯ':'ОСТАННЯ СІТКА КУБКА'}</p></div><button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button></div><div class="arena-history-modal-summary-v992"><div class="arena-history-modal-winner-v992"><div class="arena-history-modal-winner-copy-v992"><span>${kind==='league'?'ПЕРЕМОЖЕЦЬ ЛІГИ':'ПЕРЕМОЖЕЦЬ КУБКА'}</span><strong>${esc(entry.winner||'—')}</strong><small>${esc(winnerClub)}</small></div></div><div class="arena-history-modal-crest-v992">${crestBadge(winnerClub,'')}</div></div>${body}<div class="arena-history-modal-actions-v992"><button class="arena-primary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button></div></div>`);
    if(kind==='cup') queueCupBracketConnectorsV1038(document.querySelector('.arena-modal-v852 .arena-history-modal-v992')||document);
  }
  function historyView(){
    const t=[["cup","КУБОК"],["league","ЛІГА"]];
    const data=historyArchiveItems(hist);
    const rows=data.length ? data.map(item=>{
      const p=arenaPlayerByName(item.winner||'');
      const tournamentClub=canonicalTeamName(item.winnerClub||'Centuria');
      const archiveKey=String(item.archiveId||item.competitionId||item.title||'');
      return `<button class="arena-card-v852 arena-history-v852 arena-history-row-v968" type="button" onclick="ArenaV852.openHistoryArchive('${hist}','${jsq(archiveKey)}')"><div class="arena-history-card-v968">${playerCardThumb(p)}</div><div class="arena-history-info-v968"><div class="arena-history-kicker-v968">${hist==='cup'?'🏆 ПЕРЕМОЖЕЦЬ КУБКА':'🥇 ПЕРЕМОЖЕЦЬ ЛІГИ'}</div><h3>${esc(item.winner||'—')}</h3><div class="arena-history-date-v968">${esc(item.date||'')}</div><div class="arena-history-event-v968">${esc(item.title||'')}</div></div><div class="arena-history-club-v968">${crestBadge(tournamentClub,'')}<small>КОМАНДА НА ТУРНІРІ</small><strong>${esc(tournamentClub)}</strong></div></button>`;
    }).join('') : `<div class="arena-card-v852 arena-empty-state-v978"><div class="arena-empty-icon-v978">🏆</div><b>АРХІВ ЩЕ ПОРОЖНІЙ</b><p class="arena-muted-v852">Коли ліга або кубок будуть завершені, вони автоматично з’являться тут разом із фінальною таблицею або сіткою.</p></div>`;
    return `<div class="arena-history-head-v968"><h2>ІСТОРІЯ</h2><p>ПЕРЕМОЖЦІ ТУРНІРІВ CENTURIA</p></div><div class="arena-tabs-v852 arena-history-tabs-v968"><button class="${hist==='cup'?'on':''}" onclick="ArenaV852.setHist('cup')">КУБОК</button><button class="${hist==='league'?'on':''}" onclick="ArenaV852.setHist('league')">ЛІГА</button></div>${tabStage(`<div class="arena-history-list-v968">${rows}</div>`,t,hist,'ArenaV852.setHist')}`;
  }

  function currentSwipeList(){
    if(route==="league") return ["mine","round","table","calendar"];
    if(route==="cup") return ["mine","bracket","round","old"];
    if(route==="friendly") return ["mine","all"];
    if(route==="history") return ["cup","league"];
    return null;
  }
  function changeSwipeTab(direction){
    const list=currentSwipeList();
    if(!list || list.length<2) return;
    if(route==="history"){
      let idx=list.indexOf(hist);
      if(idx<0) idx=0;
      idx=Math.max(0,Math.min(list.length-1,idx+direction));
      if(list[idx]!==hist){ tabAnim=direction>0?"next":"prev"; hist=list[idx]; draw(); }
      return;
    }
    let idx=list.indexOf(tab);
    if(idx<0) idx=0;
    idx=Math.max(0,Math.min(list.length-1,idx+direction));
    if(list[idx]!==tab){ tabAnim=direction>0?"next":"prev"; tab=list[idx]; draw(); }
  }
  function bindSwipeTabs(){
    A.ontouchstart=null;
    A.ontouchend=null;
    A.ontouchmove=null;
    A.ontouchcancel=null;
    swipeIgnoreBracket=false;
    const list=currentSwipeList();
    if(!list) return;
    A.ontouchstart=(e)=>{
      // v10.55: dragging the Cup bracket moves only the bracket.
      swipeIgnoreBracket=!!e.target?.closest?.('.arena-cup-bracket-scroll-v1036');
      if(swipeIgnoreBracket) return;
      const t=e.changedTouches && e.changedTouches[0];
      if(!t) return;
      swipeStartX=t.clientX;
      swipeStartY=t.clientY;
      swipeLocked=false;
    };
    A.ontouchmove=(e)=>{
      if(swipeIgnoreBracket || swipeLocked) return;
      const t=e.changedTouches && e.changedTouches[0];
      if(!t) return;
      const dx=t.clientX-swipeStartX;
      const dy=t.clientY-swipeStartY;
      if(Math.abs(dx)>18 && Math.abs(dx)>Math.abs(dy)) swipeLocked=true;
    };
    A.ontouchend=(e)=>{
      if(swipeIgnoreBracket){ swipeIgnoreBracket=false; return; }
      const t=e.changedTouches && e.changedTouches[0];
      if(!t) return;
      const dx=t.clientX-swipeStartX;
      const dy=t.clientY-swipeStartY;
      if(Math.abs(dx)<56 || Math.abs(dx)<Math.abs(dy)*1.2) return;
      changeSwipeTab(dx<0 ? 1 : -1);
    };
    A.ontouchcancel=()=>{ swipeIgnoreBracket=false; };
  }

  function syncBackButton(){
    if(!backBtn) return;
    const label = route==="home" ? "На головну" : "Назад в Arena";
    backBtn.setAttribute("aria-label", label);
    backBtn.title = label;
  }
  if(backBtn){
    backBtn.addEventListener("click",(e)=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      if(route==="home"){
        if(window.navigateCenturia) window.navigateCenturia("home");
        return;
      }
      route="home";
      tab="mine";
      draw();
    });
  }

  const CUP_DRAW_SEEN_LOCAL_PREFIX_V1034="ca_arena_cup_draw_seen_v1034";
  const cupDrawViewApiV1034=()=>window.CenturiaArenaCupDrawViewApi||null;
  const cupDrawViewKeyV1034=()=>{
    const c=testCompetition;
    if(!c?.draw)return "";
    const id=String(c.id||c.voteSourceId||c.title||"cup").trim()||"cup";
    const stamp=String(c.draw?.completedAt||c.createdAt||"").trim()||"draw";
    return `${id}:${stamp}`;
  };
  const cupDrawSeenLocalKeyV1034=(drawKey=cupDrawViewKeyV1034())=>{
    const viewer=String(currentArenaViewerName?.()||"account").trim().toLocaleLowerCase("uk-UA")||"account";
    return `${CUP_DRAW_SEEN_LOCAL_PREFIX_V1034}:${viewer}:${drawKey}`;
  };
  const cupDrawSeenLocalV1034=drawKey=>{
    if(!drawKey)return false;
    try{return localStorage.getItem(cupDrawSeenLocalKeyV1034(drawKey))==="1";}catch(_e){return false;}
  };
  const rememberCupDrawSeenLocalV1034=drawKey=>{
    if(!drawKey)return;
    try{localStorage.setItem(cupDrawSeenLocalKeyV1034(drawKey),"1");}catch(_e){}
  };
  const markCupDrawSeenV1034=async()=>{
    const drawKey=cupDrawViewKeyV1034();
    if(!drawKey)return;
    rememberCupDrawSeenLocalV1034(drawKey);
    try{
      const api=cupDrawViewApiV1034();
      if(api?.isReady?.()&&api?.markSeen) await api.markSeen(drawKey);
    }catch(err){ console.warn("Arena Cup draw seen save",err); }
  };
  const maybeAutoStartCupDrawV1034=async()=>{
    if(route!=="cup"||!testCompetition?.draw||cupDrawAnimationOpenV1033)return;
    const drawKey=cupDrawViewKeyV1034();
    if(!drawKey||cupDrawAutoAttemptKeyV1034===drawKey||cupDrawSeenCheckInFlightV1034===drawKey)return;
    cupDrawAutoAttemptKeyV1034=drawKey;
    if(cupDrawSeenLocalV1034(drawKey))return;
    cupDrawSeenCheckInFlightV1034=drawKey;
    let seen=false;
    try{
      const api=cupDrawViewApiV1034();
      if(api?.isReady?.()&&api?.hasSeen) seen=!!(await api.hasSeen(drawKey));
    }catch(err){ console.warn("Arena Cup draw seen check",err); }
    finally{ if(cupDrawSeenCheckInFlightV1034===drawKey)cupDrawSeenCheckInFlightV1034=""; }
    if(seen){ rememberCupDrawSeenLocalV1034(drawKey); return; }
    if(route!=="cup"||cupDrawViewKeyV1034()!==drawKey||cupDrawAnimationOpenV1033)return;
    cupDrawAnimationOpenV1033=true;
    resetCupDrawAnimationStateV1033();
    cupDrawAnimationStateV1033.running=true;
    renderCupDrawAnimationModalV1033();
    runCupDrawAnimationStepV1033(0);
  };

  const clearCupDrawAnimationTimerV1033=()=>{ try{ clearTimeout(cupDrawAnimationTimerV1033); }catch(_e){} cupDrawAnimationTimerV1033=null; };
  const cupDrawAnimationEntriesV1033=draw=>{
    if(!draw)return[];
    const pairEntries=(draw.pairs||[]).map((pair,index)=>({
      type:'pair',index,label:`ПАРА ${index+1}`,
      slots:[
        {key:`pair_${index}_home_player`,title:'ГРАВЕЦЬ 1',placeholder:'Очікує жереб',value:pair.home,pool:(testCompetition?.participants||[])},
        {key:`pair_${index}_away_player`,title:'ГРАВЕЦЬ 2',placeholder:'Очікує жереб',value:pair.away,pool:(testCompetition?.participants||[])},
        {key:`pair_${index}_home_club`,title:'КОМАНДА 1',placeholder:'Команда з’явиться',value:pair.homeClub,pool:(testCompetition?.allowedClubs||[])},
        {key:`pair_${index}_away_club`,title:'КОМАНДА 2',placeholder:'Команда з’явиться',value:pair.awayClub,pool:(testCompetition?.allowedClubs||[])}
      ]
    }));
    const byeEntries=(draw.byes||[]).map((bye,index)=>({
      type:'bye',index,label:`BYE ${index+1}`,
      slots:[
        {key:`bye_${index}_player`,title:'ГРАВЕЦЬ',placeholder:'Очікує жереб',value:bye.player,pool:(testCompetition?.participants||[])},
        {key:`bye_${index}_club`,title:'КОМАНДА',placeholder:'Команда з’явиться',value:bye.club,pool:(testCompetition?.allowedClubs||[])},
        {key:`bye_${index}_status`,title:'СТАТУС',placeholder:'Очікує',value:'BYE',pool:['BYE','ПРОХІД ДАЛІ','LUCKY SLOT']}
      ]
    }));
    return [...pairEntries,...byeEntries];
  };
  const cupDrawAnimationFlatStepsV1033=draw=>cupDrawAnimationEntriesV1033(draw).flatMap(entry=>entry.slots.map((slot,slotIndex)=>({
    entryKey:`${entry.type}_${entry.index}`,
    slotKey:slot.key,
    entryType:entry.type,
    entryIndex:entry.index,
    slotIndex,
    title:slot.title,
    value:slot.value,
    pool:(Array.isArray(slot.pool)&&slot.pool.length?slot.pool:[slot.value]).filter(Boolean)
  })));
  const resetCupDrawAnimationStateV1033=()=>{
    clearCupDrawAnimationTimerV1033();
    cupDrawAnimationStateV1033={running:false,finished:false,stepIndex:-1,currentKey:'',rollingText:'',revealed:{}};
  };
  const cupDrawAnimationValueHtmlV1033=slot=>{
    const st=cupDrawAnimationStateV1033||{revealed:{}};
    const current=st.currentKey===slot.key;
    const revealed=Object.prototype.hasOwnProperty.call(st.revealed||{},slot.key);
    if(current && st.running){
      return `<div class="arena-cup-draw-anim-value-v1033 rolling">${esc(st.rollingText||'...')}</div>`;
    }
    if(revealed){
      return `<div class="arena-cup-draw-anim-value-v1033 revealed">${esc(st.revealed[slot.key]||slot.value||'')}</div>`;
    }
    return `<div class="arena-cup-draw-anim-value-v1033 placeholder">${esc(slot.placeholder||'Очікує')}</div>`;
  };
  const cupBracketStageLabelV1036=(playersCount,matchCount)=>{
    if(matchCount<=1)return 'ФІНАЛ';
    if(matchCount===2)return '1/2 ФІНАЛУ';
    if(matchCount===4)return '1/4 ФІНАЛУ';
    if(matchCount===8)return '1/8 ФІНАЛУ';
    return `РАУНД ${Math.max(1,Math.ceil(Math.log2(Math.max(2,playersCount))))}`;
  };
  const cupDrawSlotViewV1036=slot=>{
    const st=cupDrawAnimationStateV1033||{revealed:{}};
    const current=st.currentKey===slot.key && !!st.running;
    const revealed=Object.prototype.hasOwnProperty.call(st.revealed||{},slot.key);
    return {
      current,revealed,
      text:current?String(st.rollingText||'...'):(revealed?String(st.revealed[slot.key]||slot.value||''):''),
      final:String(slot.value||'')
    };
  };
  const cupBracketEntryV1040=(player,club,opts={})=>{
    const name=String(player||'').trim()||'Очікує гравця';
    const team=String(club||'').trim();
    const ghost=!!opts.ghost;
    const rolling=!!opts.rolling;
    const revealed=!!opts.revealed;
    const score=(opts.score===0||opts.score)?String(opts.score):'';
    const marker=String(opts.marker||'');
    const photo=String(opts.photo||'');
    const empty=String(opts.empty||'?');
    const crestHtml=team?crestBadge(team,photo):`<span class="arena-cup-entry-empty-v1040">${esc(empty)}</span>`;
    return `<div class="arena-cup-entry-v1040${ghost?' is-ghost':''}${rolling?' is-rolling':''}${revealed?' is-revealed':''}" data-player="${esc(name)}" data-club="${esc(team)}"><div class="arena-cup-entry-crest-v1040">${crestHtml}</div><div class="arena-cup-entry-meta-v1040"><b>${esc(name)}</b><span>${esc(team||opts.clubPlaceholder||'Команда ще не визначена')}</span></div>${score!==''?`<strong class="arena-cup-entry-score-v1040">${esc(score)}</strong>`:(marker?`<span class="arena-cup-entry-marker-v1040">${esc(marker)}</span>`:'')}</div>`;
  };
  const cupBracketVsV1040=(text='VS')=>`<div class="arena-cup-match-vs-v1040"><span>${esc(text)}</span></div>`;
  const cupDrawBracketTeamRowV1036=(playerSlot,clubSlot)=>{
    const pv=cupDrawSlotViewV1036(playerSlot), cv=cupDrawSlotViewV1036(clubSlot);
    const playerText=pv.text||'Очікує гравця';
    const clubText=cv.text||'';
    const active=pv.current||cv.current;
    return cupBracketEntryV1040(playerText,clubText,{rolling:active,revealed:pv.revealed&&cv.revealed,marker:active?'🎲':'',clubPlaceholder:'Команда ще не визначена'});
  };
  const cupDrawBracketBoardV1036=(drawData,currentStep)=>{
    const entries=cupDrawAnimationEntriesV1033(drawData);
    const firstCount=Math.max(1,entries.length);
    const height=Math.max(480,firstCount*114+40);
    const stages=[];
    const firstNodes=entries.map(entry=>{
      const activeEntry=currentStep && currentStep.entryType===entry.type && currentStep.entryIndex===entry.index;
      if(entry.type==='pair'){
        const [p1,p2,c1,c2]=entry.slots;
        return `<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 ${activeEntry?'is-active':''}"><div class="arena-cup-bracket-match-no-v1036">${esc(entry.label)}</div>${cupDrawBracketTeamRowV1036(p1,c1)}${cupBracketVsV1040('VS')}${cupDrawBracketTeamRowV1036(p2,c2)}</div>`;
      }
      const [p,c,status]=entry.slots;
      const pv=cupDrawSlotViewV1036(p), cv=cupDrawSlotViewV1036(c), sv=cupDrawSlotViewV1036(status);
      return `<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 bye ${activeEntry?'is-active':''}"><div class="arena-cup-bracket-match-no-v1036">${esc(entry.label)}</div>${cupBracketEntryV1040(pv.text||'Очікує гравця',cv.text||'',{rolling:pv.current||cv.current,marker:'🎟️',clubPlaceholder:'Команда ще не визначена'})}${cupBracketVsV1040(sv.text||'BYE')}${cupBracketEntryV1040('Автопрохід','',{ghost:true,empty:'→',clubPlaceholder:'У наступний раунд'})}</div>`;
    }).join('');
    stages.push(`<section class="arena-cup-bracket-stage-v1036 first"><header><span>${esc(testCompetition?.rounds?.[0]?.label||'ПЕРШИЙ РАУНД')}</span><small>${firstCount} ${firstCount===1?'пара':'пар'}</small></header><div class="arena-cup-bracket-stage-nodes-v1036">${firstNodes}</div></section>`);
    let prevCount=firstCount;
    while(prevCount>1){
      const nextCount=Math.ceil(prevCount/2);
      const label=cupBracketStageLabelV1036(Math.max(2,nextCount*2),nextCount);
      const nodes=Array.from({length:nextCount},(_,i)=>`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 future"><div class="arena-cup-bracket-match-no-v1036">${label}${nextCount>1?` · ${i+1}`:''}</div>${cupBracketEntryV1040('Переможець','',{ghost:true,clubPlaceholder:'Попередньої пари'})}${cupBracketVsV1040('VS')}${cupBracketEntryV1040('Переможець','',{ghost:true,clubPlaceholder:'Попередньої пари'})}</div>`).join('');
      stages.push(`<section class="arena-cup-bracket-stage-v1036 future-stage"><header><span>${label}</span><small>${nextCount} ${nextCount===1?'матч':'матчі'}</small></header><div class="arena-cup-bracket-stage-nodes-v1036">${nodes}</div></section>`);
      prevCount=nextCount;
    }
    return `<div class="arena-cup-bracket-scroll-v1036"><div class="arena-cup-bracket-board-v1036" style="--bracket-height:${height}px;--bracket-stages:${stages.length}">${stages.join('')}</div></div>`;
  };
  const cupLiveBracketTeamRowV1036=(player,scoreText='')=>{
    const club=competitionClubFor(player);
    return cupBracketEntryV1040(player,club,{revealed:true,score:scoreText,photo:teamPhotoFor(player)});
  };
  const cupLiveBracketBoardV1036=()=>{
    if(!testCompetition?.kind||testCompetition.kind!=='cup')return '';
    const rounds=testCompetition.rounds||[];
    let playerCount=Math.max(2,testCompetition.participants?.length||2);
    const totalStages=[];
    let n=playerCount;
    while(n>1){totalStages.push(n);n=Math.ceil(n/2)}
    const height=Math.max(480,Math.ceil(playerCount/2)*114+40);
    const cols=totalStages.map((playersInStage,idx)=>{
      const rr=rounds[idx]||null;
      const expectedNodes=Math.max(1,Math.ceil(playersInStage/2));
      const label=rr?.label||cupBracketStageLabelV1036(playersInStage,expectedNodes);
      let nodes='';
      if(rr){
        nodes+=(rr.matches||[]).map((m,i)=>`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 ${cupMatchFinished(m,testCompetition)?'is-complete':''}" data-home="${esc(m.home)}" data-away="${esc(m.away)}" data-winner="${esc(cupMatchWinner(m,testCompetition)||'')}"><div class="arena-cup-bracket-match-no-v1036">${esc(label)}${expectedNodes>1?` · ${i+1}`:''}</div>${cupLiveBracketTeamRowV1036(m.home,cupLegCount(testCompetition)===2&&cupLeg2Scored(m)?cupAggregate(m).home:(isScored(m)?m.homeScore:''))}${cupBracketVsV1040(matchProposalV1067(m)?'⏳ ОЧІКУЄ':(isScored(m)?cupMatchScore(m,testCompetition).replace(/\s/g,' '):'VS'))}${cupLiveBracketTeamRowV1036(m.away,cupLegCount(testCompetition)===2&&cupLeg2Scored(m)?cupAggregate(m).away:(isScored(m)?m.awayScore:''))}</div>`).join('');
        nodes+=(rr.byes||[]).map(name=>`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 bye is-complete" data-home="${esc(name)}" data-away="" data-winner="${esc(name)}"><div class="arena-cup-bracket-match-no-v1036">BYE</div>${cupLiveBracketTeamRowV1036(name,'')}${cupBracketVsV1040('BYE')}${cupBracketEntryV1040('Автопрохід','',{ghost:true,empty:'→',clubPlaceholder:'У наступний раунд'})}</div>`).join('');
      }
      const actualCount=(rr?.matches?.length||0)+(rr?.byes?.length||0);
      for(let i=actualCount;i<expectedNodes;i++)nodes+=`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 future"><div class="arena-cup-bracket-match-no-v1036">${esc(label)}${expectedNodes>1?` · ${i+1}`:''}</div>${cupBracketEntryV1040('Очікує переможця','',{ghost:true,clubPlaceholder:'Попередньої пари'})}${cupBracketVsV1040('VS')}${cupBracketEntryV1040('Очікує переможця','',{ghost:true,clubPlaceholder:'Попередньої пари'})}</div>`;
      return `<section class="arena-cup-bracket-stage-v1036 ${idx?'future-stage':'first'}"><header><span>${esc(label)}</span><small>${expectedNodes} ${expectedNodes===1?'матч':'матчі'}</small></header><div class="arena-cup-bracket-stage-nodes-v1036">${nodes}</div></section>`;
    }).join('');
    return `<div class="arena-card-v852 arena-cup-bracket-card-v1036 arena-cup-bracket-card-compact-v1037"><div class="arena-cup-bracket-compact-title-v1037"><b>🏆 ${esc(testCompetition.title||'CENTURIA CUP')}</b><small>КУБКОВА СІТКА</small></div><div class="arena-cup-bracket-scroll-v1036"><div class="arena-cup-bracket-board-v1036 live" style="--bracket-height:${height}px;--bracket-stages:${totalStages.length}">${cols}</div></div></div>`;
  };


  const leagueLivePlayoffBracketBoardV1109=(comp=testCompetition)=>{
    if(comp?.kind!=='league' || comp?.leagueFormat!=='top4')return '';
    const rounds=leaguePlayoffRoundsV1108(comp);
    if(!rounds.length)return '';
    const totalStages=[2,1];
    const height=Math.max(460,totalStages[0]*114+40);
    const labelForStage=(idx,count)=>count===1?'ФІНАЛ':'1/2 ФІНАЛУ';
    const cols=totalStages.map((expectedNodes,idx)=>{
      const rr=rounds[idx]||null;
      const label=rr?.label||labelForStage(idx,expectedNodes);
      let nodes='';
      if(rr){
        nodes+=(rr.matches||[]).map((m,i)=>{
          const winner=leaguePlayoffWinnerV1093(m)||'';
          const scoreText=matchProposalV1067(m)?'⏳ ОЧІКУЄ':(isScored(m)?`${m.homeScore} : ${m.awayScore}${m.tiebreakWinner?' • пен.':''}`:'VS');
          return `<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 ${winner?'is-complete':''}" data-home="${esc(m.home)}" data-away="${esc(m.away)}" data-winner="${esc(winner)}"><div class="arena-cup-bracket-match-no-v1036">${esc(label)}${expectedNodes>1?` · ${i+1}`:''}</div>${cupLiveBracketTeamRowV1036(m.home,isScored(m)?m.homeScore:'')}${cupBracketVsV1040(scoreText)}${cupLiveBracketTeamRowV1036(m.away,isScored(m)?m.awayScore:'')}</div>`;
        }).join('');
      }
      const actualCount=rr?.matches?.length||0;
      for(let i=actualCount;i<expectedNodes;i++)nodes+=`<div class="arena-cup-bracket-match-v1036 arena-cup-match-v1040 future"><div class="arena-cup-bracket-match-no-v1036">${esc(label)}${expectedNodes>1?` · ${i+1}`:''}</div>${cupBracketEntryV1040('Очікує переможця','',{ghost:true,clubPlaceholder:'Попередньої пари'})}${cupBracketVsV1040('VS')}${cupBracketEntryV1040('Очікує переможця','',{ghost:true,clubPlaceholder:'Попередньої пари'})}</div>`;
      return `<section class="arena-cup-bracket-stage-v1036 ${idx?'future-stage':'first'}"><header><span>${esc(label)}</span><small>${expectedNodes} ${expectedNodes===1?'матч':'матчі'}</small></header><div class="arena-cup-bracket-stage-nodes-v1036">${nodes}</div></section>`;
    }).join('');
    return `<div class="arena-card-v852 arena-cup-bracket-card-v1036 arena-cup-bracket-card-compact-v1037 arena-league-playoff-bracket-v1109"><div class="arena-cup-bracket-compact-title-v1037"><b>🏆 ${esc(comp.title||'CENTURIA LEAGUE')}</b><small>ПЛЕЙ-ОФ ЛІГИ</small></div><div class="arena-cup-bracket-scroll-v1036"><div class="arena-cup-bracket-board-v1036 live" style="--bracket-height:${height}px;--bracket-stages:${totalStages.length}">${cols}</div></div></div>`;
  };


  // v10.92: vertically center every round between the feeder pairs so the
  // bracket narrows naturally toward the final, instead of later rounds
  // sticking to the top. Works for the live Cup screen and the Cup archive.
  const layoutCupBracketStagesV1092=(root=document)=>{
    const boards=[...(root?.querySelectorAll?.('.arena-cup-bracket-board-v1036.live')||[])];
    boards.forEach(board=>{
      const stages=[...board.querySelectorAll(':scope > .arena-cup-bracket-stage-v1036')];
      if(!stages.length)return;
      const firstNodes=[...stages[0].querySelectorAll(':scope > .arena-cup-bracket-stage-nodes-v1036 > .arena-cup-bracket-match-v1036')];
      const slotCount=Math.max(1,firstNodes.length);
      let prevCenters=[];
      stages.forEach((stage,stageIndex)=>{
        stage.style.setProperty('display','flex','important');
        stage.style.setProperty('flex-direction','column','important');
        stage.style.setProperty('align-items','stretch','important');
        stage.style.setProperty('height','100%','important');
        stage.style.setProperty('min-height','100%','important');
        stage.style.setProperty('box-sizing','border-box','important');
        const header=stage.querySelector(':scope > header');
        const nodes=stage.querySelector(':scope > .arena-cup-bracket-stage-nodes-v1036');
        if(!nodes)return;
        const matches=[...nodes.querySelectorAll(':scope > .arena-cup-bracket-match-v1036')];
        nodes.style.setProperty('position','relative','important');
        nodes.style.setProperty('top','auto','important');
        nodes.style.setProperty('left','auto','important');
        nodes.style.setProperty('right','auto','important');
        nodes.style.setProperty('transform','none','important');
        nodes.style.setProperty('display','block','important');
        nodes.style.setProperty('flex','0 0 auto','important');
        nodes.style.setProperty('justify-content','flex-start','important');
        nodes.style.setProperty('gap','0','important');
        nodes.style.setProperty('overflow','visible','important');
        const stageHeight=Math.max(stage.clientHeight, stage.getBoundingClientRect().height, board.clientHeight, 1);
        const headerHeight=header?Math.max(header.offsetHeight, header.getBoundingClientRect().height):0;
        const nodesHeight=Math.max(1, stageHeight - headerHeight);
        nodes.style.setProperty('height', `${nodesHeight}px`, 'important');
        nodes.style.setProperty('min-height', `${nodesHeight}px`, 'important');
        const currentCenters=[];
        if(stageIndex===0){
          const unit=nodesHeight/slotCount;
          matches.forEach((match,i)=>{
            const mh=Math.max(match.offsetHeight, match.getBoundingClientRect().height||0, 56);
            const center=(i+0.5)*unit;
            currentCenters.push(center);
            const top=Math.max(0, Math.min(nodesHeight-mh, center-mh/2));
            match.style.setProperty('position','absolute','important');
            match.style.setProperty('left','0','important');
            match.style.setProperty('right','0','important');
            match.style.setProperty('top', `${top}px`, 'important');
          });
        }else{
          matches.forEach((match,i)=>{
            const mh=Math.max(match.offsetHeight, match.getBoundingClientRect().height||0, 56);
            const feederA=prevCenters[Math.min(prevCenters.length-1, i*2)];
            const feederBIndex=i*2+1;
            const feederB=feederBIndex<prevCenters.length ? prevCenters[feederBIndex] : feederA;
            const center=((Number(feederA)||0)+(Number(feederB)||0))/2;
            currentCenters.push(center);
            const top=Math.max(0, Math.min(nodesHeight-mh, center-mh/2));
            match.style.setProperty('position','absolute','important');
            match.style.setProperty('left','0','important');
            match.style.setProperty('right','0','important');
            match.style.setProperty('top', `${top}px`, 'important');
          });
        }
        prevCenters=currentCenters;
      });
    });
  };

  // v10.89: draw each Cup route from the individual player row to the
  // corresponding player row in the following round, not card edge to card edge.
  const renderCupBracketConnectorsV1038=(root=document)=>{
    const boards=[...(root?.querySelectorAll?.('.arena-cup-bracket-board-v1036')||[])];
    boards.forEach(board=>{
      let svg=board.querySelector(':scope > .arena-cup-bracket-connectors-v1038');
      if(!svg){
        svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('class','arena-cup-bracket-connectors-v1038');
        svg.setAttribute('aria-hidden','true');
        board.prepend(svg);
      }
      const bw=Math.max(board.scrollWidth,board.clientWidth,1);
      const bh=Math.max(board.scrollHeight,board.clientHeight,1);
      svg.setAttribute('width',String(bw));
      svg.setAttribute('height',String(bh));
      svg.setAttribute('viewBox',`0 0 ${bw} ${bh}`);
      while(svg.firstChild)svg.removeChild(svg.firstChild);
      const boardRect=board.getBoundingClientRect();
      const stages=[...board.querySelectorAll(':scope > .arena-cup-bracket-stage-v1036')];
      const playerRows=match=>[...match.querySelectorAll(':scope > .arena-cup-entry-v1040')];
      const rowCenter=row=>{
        const r=row.getBoundingClientRect();
        return { x1:r.right-boardRect.left, x2:r.left-boardRect.left, y:r.top-boardRect.top+r.height/2, rect:r };
      };
      const addPath=(d,kind,player='')=>{
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d',d);
        path.setAttribute('class',`arena-cup-bracket-link-v1038${kind?' '+kind:''}`);
        if(player)path.setAttribute('data-player',player);
        svg.appendChild(path);
      };
      for(let s=0;s<stages.length-1;s++){
        const from=[...stages[s].querySelectorAll(':scope > .arena-cup-bracket-stage-nodes-v1036 > .arena-cup-bracket-match-v1036')];
        const to=[...stages[s+1].querySelectorAll(':scope > .arena-cup-bracket-stage-nodes-v1036 > .arena-cup-bracket-match-v1036')];
        from.forEach((match,i)=>{
          if(!to.length)return;
          const winner=String(match.getAttribute('data-winner')||'').trim();
          const realRows=playerRows(match).filter(row=>!row.classList.contains('is-ghost')&&!row.classList.contains('is-rolling')&&row.classList.contains('is-revealed'));
          if(!realRows.length)return;
          const expectedTarget=to[Math.min(to.length-1,Math.floor(i/2))];
          let targetMatch=expectedTarget;
          let targetRow=null;
          if(winner){
            for(const nextMatch of to){
              const found=playerRows(nextMatch).find(nextRow=>sameArenaPlayer(nextRow.getAttribute('data-player'),winner));
              if(found){targetMatch=nextMatch;targetRow=found;break;}
            }
          }
          const targetRows=playerRows(targetMatch);
          if(!targetRow)targetRow=targetRows[i%2]||targetRows[0]||null;
          const sourceCenters=realRows.map(row=>({ row, player:String(row.getAttribute('data-player')||'').trim(), ...rowCenter(row) }));
          if(!sourceCenters.length)return;
          const yJoin=sourceCenters.length===1?sourceCenters[0].y:(sourceCenters[0].y+sourceCenters[sourceCenters.length-1].y)/2;
          const targetInfo=targetRow?rowCenter(targetRow):null;
          const xTarget=targetInfo?targetInfo.x2:null;
          const yTarget=targetInfo?targetInfo.y:yJoin;
          const minGap=targetInfo?Math.max(0,xTarget-Math.max(...sourceCenters.map(v=>v.x1))):0;
          const joinX=Math.max(...sourceCenters.map(v=>v.x1))+Math.max(14,Math.min(26,minGap*0.22||18));
          const trunkBendX=targetInfo?joinX+Math.max(14,Math.min(34,(xTarget-joinX)*0.55)):joinX;
          // Draw individual lines from each team row to the shared center junction.
          sourceCenters.forEach(src=>{
            const toCenter=`M ${src.x1} ${src.y} H ${joinX}${Math.abs(src.y-yJoin)>0.5?` V ${yJoin}`:''}`;
            if(winner){
              addPath(toCenter,sameArenaPlayer(src.player,winner)?'is-advanced':'is-eliminated',src.player);
            }else{
              addPath(toCenter,'is-pending',src.player);
            }
          });
          if(!targetInfo)return;
          if(winner){
            const winnerSrc=sourceCenters.find(src=>sameArenaPlayer(src.player,winner))||sourceCenters[0];
            const nextName=String(targetRow?.getAttribute('data-player')||'').trim();
            const placeholder=!!targetRow?.classList.contains('is-ghost')||!nextName;
            if(placeholder||sameArenaPlayer(nextName,winner)){
              const route=`M ${joinX} ${yJoin} H ${trunkBendX}${Math.abs(yTarget-yJoin)>0.5?` V ${yTarget}`:''} H ${xTarget}`;
              addPath(route,'is-advanced',winnerSrc.player);
            }
          }else{
            const route=`M ${joinX} ${yJoin} H ${trunkBendX}${Math.abs(yTarget-yJoin)>0.5?` V ${yTarget}`:''} H ${xTarget}`;
            addPath(route,'is-pending','');
          }
        });
      }
    });
  };
  const queueCupBracketConnectorsV1038=(root=document)=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      layoutCupBracketStagesV1092(root);
      renderCupBracketConnectorsV1038(root);
    }));
  };

  const cupDrawAnimationModalHtmlV1033=()=>{
    const drawData=testCompetition?.draw||null;
    if(!drawData)return '';
    if(!cupDrawAnimationStateV1033)resetCupDrawAnimationStateV1033();
    const st=cupDrawAnimationStateV1033;
    const entries=cupDrawAnimationEntriesV1033(drawData);
    const totalPairs=(drawData.pairs||[]).length;
    const totalByes=(drawData.byes||[]).length;
    const roundLabel=testCompetition?.rounds?.[0]?.label||'ПЕРШИЙ РАУНД';
    const currentStep=(st.stepIndex>=0?cupDrawAnimationFlatStepsV1033(drawData)[st.stepIndex]:null);
    const progressTotal=Math.max(1,cupDrawAnimationFlatStepsV1033(drawData).length);
    const progressDone=Math.min(progressTotal,Math.max(0,Object.keys(st.revealed||{}).length)+(st.running?1:0));
    const controls=st.running
      ? `<button class="arena-secondary-v852 arena-cup-draw-anim-start-v1033" type="button" onclick="ArenaV852.stopCupDrawAnimation()">ЗУПИНИТИ</button>`
      : `<button class="arena-primary-v852 arena-cup-draw-anim-start-v1033" type="button" onclick="ArenaV852.startCupDrawAnimation()">${st.finished?'ЩЕ РАЗ ЗАПУСТИТИ ЖЕРЕБКУВАННЯ':'ЗАПУСТИТИ ЖЕРЕБКУВАННЯ'}</button>`;
    const statusCopy=st.running
      ? `<b>ЙДЕ ЖЕРЕБКУВАННЯ</b><span>${esc(currentStep?.title||'Визначаємо наступний слот')} • крок ${progressDone} / ${progressTotal}</span>`
      : st.finished
        ? `<b>ЖЕРЕБКУВАННЯ ЗАВЕРШЕНО</b><span>Усі пари та команди визначені. Можна закрити це вікно або переграти анімацію без зміни результату.</span>`
        : `<b>ПУСТА СІТКА ГОТОВА</b><span>Під час першого входу в цей Кубок жеребкування запускається автоматично. Потім його завжди можна переграти вручну без зміни результату.</span>`;
    const bracketBoard=cupDrawBracketBoardV1036(drawData,currentStep);
    return `<div class="arena-cup-draw-modal-v1033 arena-cup-draw-modal-bracket-v1037"><div class="arena-cup-draw-compact-head-v1037"><div><small>КУБКОВА СІТКА · ЖЕРЕБКУВАННЯ</small><h2>${esc(testCompetition?.title||'CENTURIA CUP')}</h2><p>${testCompetition?.participants?.length||0} учасників · ${totalPairs} пар${totalByes?` · ${totalByes} BYE`:''} · свайпни по сітці →</p></div><button type="button" class="arena-cup-draw-close-v1037" onclick="ArenaV852.closeCupDrawAnimation()">✕</button></div><div class="arena-cup-draw-compact-toolbar-v1037"><div class="arena-cup-draw-compact-status-v1037">${statusCopy}</div><div class="arena-cup-draw-compact-actions-v1037">${controls}<button class="arena-secondary-v852 arena-cup-draw-close-action-v1041" type="button" onclick="ArenaV852.closeCupDrawAnimation()">ЗАКРИТИ</button></div></div>${bracketBoard}</div>`;
  };
  const renderCupDrawAnimationModalV1033=()=>{
    const existing=document.getElementById('arenaCupDrawAnimModalV1033');
    if(!cupDrawAnimationOpenV1033 || !testCompetition?.draw){
      if(existing)existing.remove();
      return;
    }
    const html=cupDrawAnimationModalHtmlV1033();
    if(!existing){
      document.body.insertAdjacentHTML('beforeend',`<div id="arenaCupDrawAnimModalV1033" class="arena-modal-v852 arena-cup-draw-modal-wrap-v1033" onclick="if(event.target===this) ArenaV852.closeCupDrawAnimation()"><div>${html}</div></div>`);
    }else{
      existing.innerHTML=`<div>${html}</div>`;
    }
    queueCupBracketConnectorsV1038(document.getElementById('arenaCupDrawAnimModalV1033')||document);
  };
  const runCupDrawAnimationStepV1033=index=>{
    const drawData=testCompetition?.draw||null;
    const st=cupDrawAnimationStateV1033;
    if(!drawData || !st || !st.running)return;
    const steps=cupDrawAnimationFlatStepsV1033(drawData);
    if(index>=steps.length){
      st.running=false;
      st.finished=true;
      st.currentKey='';
      st.rollingText='';
      renderCupDrawAnimationModalV1033();
      markCupDrawSeenV1034();
      return;
    }
    const step=steps[index];
    st.stepIndex=index;
    st.currentKey=step.slotKey;
    const pool=(Array.isArray(step.pool)&&step.pool.length?step.pool:[step.value]).filter(Boolean);
    let tick=0;
    const tickMax=step.value==='BYE'?6:(step.title.includes('КОМАНДА')?11:13);
    const spin=()=>{
      if(!cupDrawAnimationStateV1033?.running)return;
      tick+=1;
      st.rollingText=String(pool[Math.floor(Math.random()*pool.length)]||step.value||'...');
      renderCupDrawAnimationModalV1033();
      if(tick<tickMax){
        cupDrawAnimationTimerV1033=setTimeout(spin,70);
        return;
      }
      st.revealed[step.slotKey]=step.value;
      st.rollingText='';
      st.currentKey='';
      renderCupDrawAnimationModalV1033();
      cupDrawAnimationTimerV1033=setTimeout(()=>runCupDrawAnimationStepV1033(index+1),260);
    };
    spin();
  };
  const openCupDrawAnimationV1033=()=>{
    if(!testCompetition?.draw)return;
    cupDrawAnimationOpenV1033=true;
    if(!cupDrawAnimationStateV1033)resetCupDrawAnimationStateV1033();
    renderCupDrawAnimationModalV1033();
  };
  const closeCupDrawAnimationV1033=()=>{
    cupDrawAnimationOpenV1033=false;
    clearCupDrawAnimationTimerV1033();
    if(cupDrawAnimationStateV1033)cupDrawAnimationStateV1033.running=false;
    renderCupDrawAnimationModalV1033();
  };
  const startCupDrawAnimationV1033=()=>{
    if(!testCompetition?.draw)return;
    cupDrawAnimationOpenV1033=true;
    resetCupDrawAnimationStateV1033();
    cupDrawAnimationStateV1033.running=true;
    renderCupDrawAnimationModalV1033();
    runCupDrawAnimationStepV1033(0);
  };
  const stopCupDrawAnimationV1033=()=>{
    if(!cupDrawAnimationStateV1033)return;
    clearCupDrawAnimationTimerV1033();
    cupDrawAnimationStateV1033.running=false;
    cupDrawAnimationStateV1033.currentKey='';
    cupDrawAnimationStateV1033.rollingText='';
    renderCupDrawAnimationModalV1033();
  };

  /* ==========================================================
     v10.95 — League draw shown once after launch. The table animation only
     reveals the fixed shared snapshot; it never changes the schedule/clubs.
     Reuse Cup's per-account seen transport with a namespaced League key.
     ========================================================== */
  const LEAGUE_DRAW_SEEN_PREFIX_V1095='ca_arena_league_draw_seen_v1095';
  const leagueDrawViewKeyV1095=()=>{
    const comp=testCompetition;
    if(comp?.kind!=='league'||comp.draw?.kind!=='league')return '';
    return `league:${String(comp.id||comp.voteSourceId||comp.title||'league')}:${String(comp.draw.completedAt||comp.createdAt||'draw')}`;
  };
  const leagueDrawLocalKeyV1095=key=>`${LEAGUE_DRAW_SEEN_PREFIX_V1095}:${String(currentArenaViewerName()||'account').trim().toLowerCase()}:${key}`;
  const leagueDrawSeenLocalV1095=key=>{
    try{return !!key&&localStorage.getItem(leagueDrawLocalKeyV1095(key))==='1';}catch(_e){return false;}
  };
  const markLeagueDrawSeenV1095=async key=>{
    if(!key)return;
    try{localStorage.setItem(leagueDrawLocalKeyV1095(key),'1');}catch(_e){}
    try{
      const api=cupDrawViewApiV1034();
      if(api?.isReady?.()&&api?.markSeen)await api.markSeen(key);
    }catch(err){console.warn('League draw seen save',err);}
  };
  const leagueDrawEntriesV1095=()=>Array.isArray(testCompetition?.draw?.entries)?testCompetition.draw.entries:[];
  const resetLeagueDrawStateV1095=()=>{
    clearTimeout(leagueDrawAnimationTimerV1095);
    leagueDrawAnimationTimerV1095=null;
    leagueDrawAnimationStateV1095={key:leagueDrawViewKeyV1095(),running:false,finished:false,index:-1,
      currentKey:'',rollingText:'',revealed:{}};
  };
  const leagueDrawStepsV1095=()=>leagueDrawEntriesV1095().flatMap((entry,i)=>[
    {key:`player_${i}`,kind:'player',row:i,value:entry.player},
    {key:`club_${i}`,kind:'club',row:i,value:entry.club}
  ]);
  const leagueDrawModalHtmlV1095=()=>{
    const comp=testCompetition,st=leagueDrawAnimationStateV1095;
    const entries=leagueDrawEntriesV1095(),steps=leagueDrawStepsV1095();
    const progress=Object.keys(st?.revealed||{}).length;
    const current=steps[st?.index]||null;
    const display=(kind,i,fallback)=>{
      const key=`${kind}_${i}`;
      if(st?.running&&st.currentKey===key)return `<span class="arena-league-draw-rolling-v1095">${esc(st.rollingText||'…')}</span>`;
      if(Object.prototype.hasOwnProperty.call(st?.revealed||{},key))return esc(st.revealed[key]);
      return `<span class="arena-league-draw-placeholder-v1095">${esc(fallback)}</span>`;
    };
    const rows=entries.map((entry,i)=>{
      const clubReady=Object.prototype.hasOwnProperty.call(st?.revealed||{},`club_${i}`);
      const club=clubReady?entry.club:'';
      return `<tr data-row="${i}" class="${st?.index>=0&&current?.row===i?'is-drawing':''} ${clubReady?'is-revealed':''}"><td>${i+1}</td><td class="arena-league-draw-club-v1095"><span class="arena-league-draw-crest-v1095">${club?crestBadge(club,''):'⚽'}</span><span>${display('club',i,'ОЧІКУЄ КОМАНДУ')}</span></td><td class="arena-league-draw-player-v1095">${display('player',i,'ОЧІКУЄ ГРАВЦЯ')}</td><td>0</td><td>0</td><td>0</td></tr>`;
    }).join('');
    const status=st?.running?`ЖЕРЕБКУВАННЯ · ${progress}/${steps.length} · ${current?.kind==='player'?'ВИБІР ГРАВЦЯ':'ВИБІР КОМАНДИ'}`:
      st?.finished?'ЖЕРЕБКУВАННЯ ЗАВЕРШЕНО · РЕЗУЛЬТАТ ЗАФІКСОВАНО':'ГОТОВО ДО ПЕРЕГЛЯДУ';
    return `<div class="arena-league-draw-modal-v1095"><header><div><small>🎲 ЛІГА · ЖЕРЕБКУВАННЯ</small><h2>${esc(comp.title||'CENTURIA LEAGUE')}</h2><p>Учасники та клуби з’являються поступово. Розподіл уже зафіксовано і його не можна перетасувати.</p></div><button type="button" class="arena-player-close-v934" onclick="ArenaV852.closeLeagueDrawAnimationV1095()" aria-label="Закрити жеребкування">✕</button></header><div class="arena-league-draw-progress-v1095"><strong>${esc(status)}</strong><span>${progress} / ${steps.length}</span></div><div class="arena-league-draw-scroll-v1095"><table class="arena-league-draw-table-v1095"><thead><tr><th>#</th><th>КОМАНДА</th><th>ГРАВЕЦЬ</th><th>І</th><th>РГ</th><th>О</th></tr></thead><tbody>${rows}</tbody></table></div><div class="arena-league-draw-actions-v1095">${!st?.running?`<button type="button" class="arena-secondary-v852" onclick="ArenaV852.replayLeagueDrawAnimationV1095()">${st?.finished?'↻ ПОВТОРИТИ ПЕРЕГЛЯД':'▶ ПЕРЕГЛЯНУТИ'}</button>`:''}<button type="button" class="arena-primary-v852" onclick="ArenaV852.closeLeagueDrawAnimationV1095()">ЗАКРИТИ</button></div><p class="arena-league-draw-note-v1095">Повторний перегляд не змінює клуби, учасників чи календар матчів.</p></div>`;
  };
  const renderLeagueDrawAnimationModalV1095=()=>{
    const existing=document.getElementById('arenaLeagueDrawModalV1095');
    if(!leagueDrawAnimationOpenV1095||testCompetition?.kind!=='league'||!testCompetition.draw?.entries){
      existing?.remove();return;
    }
    if(!leagueDrawAnimationStateV1095||leagueDrawAnimationStateV1095.key!==leagueDrawViewKeyV1095())resetLeagueDrawStateV1095();
    const inner=`<div>${leagueDrawModalHtmlV1095()}</div>`;
    if(!existing)document.body.insertAdjacentHTML('beforeend',`<div class="arena-modal-v852 arena-league-draw-modal-wrap-v1095" id="arenaLeagueDrawModalV1095" role="dialog" aria-modal="true" aria-label="Жеребкування Ліги">${inner}</div>`);
    else existing.innerHTML=inner;
    const scroll=document.querySelector('#arenaLeagueDrawModalV1095 .arena-league-draw-scroll-v1095');
    const active=scroll?.querySelector('tr.is-drawing');
    if(scroll&&active){
      const top=active.offsetTop;
      scroll.scrollTop=Math.max(0,top-scroll.clientHeight/2+active.offsetHeight/2);
    }
  };
  const runLeagueDrawAnimationStepV1095=index=>{
    const st=leagueDrawAnimationStateV1095;
    if(!st?.running||st.key!==leagueDrawViewKeyV1095())return;
    const steps=leagueDrawStepsV1095();
    if(index>=steps.length){
      st.running=false;st.finished=true;st.currentKey='';st.rollingText='';
      renderLeagueDrawAnimationModalV1095();
      markLeagueDrawSeenV1095(st.key);
      return;
    }
    const step=steps[index],pool=(step.kind==='player'?leagueDrawEntriesV1095().map(x=>x.player):[...new Set((testCompetition?.allowedClubs||[]).concat(leagueDrawEntriesV1095().map(x=>x.club)))]).filter(Boolean);
    st.index=index;st.currentKey=step.key;
    let tick=0;
    const spin=()=>{
      if(!st.running||st.key!==leagueDrawViewKeyV1095())return;
      tick++;
      st.rollingText=String(pool[Math.floor(Math.random()*pool.length)]||step.value||'…');
      renderLeagueDrawAnimationModalV1095();
      if(tick<9){leagueDrawAnimationTimerV1095=setTimeout(spin,65);return;}
      st.revealed[step.key]=step.value;st.currentKey='';st.rollingText='';
      renderLeagueDrawAnimationModalV1095();
      leagueDrawAnimationTimerV1095=setTimeout(()=>runLeagueDrawAnimationStepV1095(index+1),180);
    };
    spin();
  };
  const startLeagueDrawAnimationV1095=()=>{
    if(testCompetition?.kind!=='league'||testCompetition.draw?.kind!=='league')return;
    leagueDrawAnimationOpenV1095=true;
    resetLeagueDrawStateV1095();
    leagueDrawAnimationStateV1095.running=true;
    renderLeagueDrawAnimationModalV1095();
    runLeagueDrawAnimationStepV1095(0);
  };
  const openLeagueDrawAnimationV1095=()=>{
    if(testCompetition?.draw?.kind!=='league')return;
    leagueDrawAnimationOpenV1095=true;
    if(!leagueDrawAnimationStateV1095||leagueDrawAnimationStateV1095.key!==leagueDrawViewKeyV1095())resetLeagueDrawStateV1095();
    renderLeagueDrawAnimationModalV1095();
  };
  const closeLeagueDrawAnimationV1095=()=>{
    // Explicit dismissal counts as this viewer's first view. Do not reopen
    // the animation after every realtime refresh; manual replay is available.
    const key=leagueDrawAnimationStateV1095?.key||leagueDrawViewKeyV1095();
    if(key){leagueDrawAutoAttemptKeyV1095=key;markLeagueDrawSeenV1095(key);}
    leagueDrawAnimationOpenV1095=false;
    clearTimeout(leagueDrawAnimationTimerV1095);
    leagueDrawAnimationTimerV1095=null;
    if(leagueDrawAnimationStateV1095)leagueDrawAnimationStateV1095.running=false;
    document.getElementById('arenaLeagueDrawModalV1095')?.remove();
  };
  const maybeAutoStartLeagueDrawV1095=async()=>{
    if(route!=='league'||!testCompetition?.draw?.entries||leagueDrawAnimationOpenV1095)return;
    const key=leagueDrawViewKeyV1095();
    if(!key||leagueDrawAutoAttemptKeyV1095===key||leagueDrawSeenCheckKeyV1095===key)return;
    leagueDrawAutoAttemptKeyV1095=key;
    leagueDrawSeenCheckKeyV1095=key;
    let seen=leagueDrawSeenLocalV1095(key);
    try{
      const api=cupDrawViewApiV1034();
      // Remote key is per authenticated user. Trust it over a shared-browser
      // local cache (including accounts without a linked player name).
      if(api?.isReady?.()&&api?.hasSeen)seen=!!(await api.hasSeen(key));
    }catch(err){console.warn('League draw seen check',err);}
    finally{if(leagueDrawSeenCheckKeyV1095===key)leagueDrawSeenCheckKeyV1095='';}
    if(seen){try{localStorage.setItem(leagueDrawLocalKeyV1095(key),'1');}catch(_e){};return;}
    if(route==='league'&&!leagueDrawAnimationOpenV1095&&leagueDrawViewKeyV1095()===key)startLeagueDrawAnimationV1095();
  };

  // v11.02: grow the Active Event into the space already reserved above the
  // Arena tiles. Do not push either row of navigation tiles downward. If a
  // tournament is too large for that gap, scroll only the preview inside it.
  const fitActiveEventToTilesV1102=(root=A)=>{
    if(!root||root.dataset.route!=="home")return;
    const event=root.querySelector('.arena-active-event-expanded-v879:not(.arena-active-event-empty-v878)');
    const grid=root.querySelector('.arena-home-main-grid-v854');
    const preview=event?.querySelector('.arena-active-event-preview-v879');
    if(!event||!grid||!preview)return;
    if(preview.classList.contains('arena-active-event-bracket-mini-v1112')){
      grid.style.setProperty('margin-top','10px','important');
      preview.style.removeProperty('max-height');
      preview.style.removeProperty('overflow-y');
      event.style.removeProperty('overflow');
      return;
    }

    // Measure the original, unconstrained card each time, including on resize.
    grid.style.removeProperty('margin-top');
    preview.style.removeProperty('max-height');
    preview.style.removeProperty('overflow-y');
    preview.style.removeProperty('overscroll-behavior');
    event.style.removeProperty('overflow');
    const leagueRows=[...preview.querySelectorAll('.arena-active-event-table-row-v879')];
    const cupRows=[...preview.querySelectorAll('.arena-active-bracket-stage-v879 > div')];
    const rows=leagueRows.length?leagueRows:cupRows;
    const originalVisible=leagueRows.length?5:3;
    if(rows.length<=originalVisible)return;
    // Real rendered row heights (including gaps/borders) rather than a hardcoded
    // number keep the tiles stationary on different phones and font scales.
    const firstHidden=rows[originalVisible].getBoundingClientRect();
    const last=rows[rows.length-1].getBoundingClientRect();
    const addedHeight=Math.max(0,last.bottom-firstHidden.top);
    if(!addedHeight)return;
    const baseMargin=parseFloat(getComputedStyle(grid).marginTop)||0;
    const existingGap=grid.getBoundingClientRect().top-event.getBoundingClientRect().bottom;
    const absorb=Math.min(addedHeight,Math.max(0,existingGap-14));
    grid.style.setProperty('margin-top',`${baseMargin-absorb}px`,'important');
    const leftover=addedHeight-absorb;
    if(leftover>0.5){
      const naturalHeight=preview.getBoundingClientRect().height;
      preview.style.setProperty('max-height',`${Math.max(72,naturalHeight-leftover)}px`,'important');
      preview.style.setProperty('overflow-y','auto','important');
      preview.style.setProperty('overscroll-behavior','contain','important');
      event.style.setProperty('overflow','hidden','important');
    }
  };
  const queueActiveEventFitV1102=()=>{
    requestAnimationFrame(()=>requestAnimationFrame(()=>fitActiveEventToTilesV1102(A)));
  };
  window.addEventListener('resize',()=>{if(route==='home')queueActiveEventFitV1102();},{passive:true});

  function draw(){
    if(syncLeaguePlayoffStateV1114(testCompetition)) saveTestCompetition();
    const f={home,league,cup,friendly,evo,players,history:historyView}[route]||home;
    A.dataset.route=route;
    A.innerHTML=f();
    syncBackButton();
    bindSwipeTabs();
    renderCupDrawAnimationModalV1033();
    renderLeagueDrawAnimationModalV1095();
    queueCupBracketConnectorsV1038(A);
    if(route==="home")queueActiveEventFitV1102();
    if(route==="league"&&testCompetition?.draw?.kind==='league'&&!leagueDrawAnimationOpenV1095){
      setTimeout(()=>maybeAutoStartLeagueDrawV1095(),80);
    }
    if(route==="cup"&&testCompetition?.draw&&!cupDrawAnimationOpenV1033){
      setTimeout(()=>maybeAutoStartCupDrawV1034(),80);
    }
    clearTimeout(animResetTimer);
    animResetTimer=setTimeout(()=>{tabAnim="none";},320);
  }
  function modal(html){document.body.insertAdjacentHTML("beforeend",`<div class="arena-modal-v852" onclick="if(event.target===this)this.remove()"><div>${html}</div></div>`)}


  let clubLogoCropState=null;
  const renderClubLogoCropImageV993=()=>{
    const imgEl=document.getElementById("arenaClubLogoCropImageV993");
    const frame=document.getElementById("arenaClubLogoCropFrameV993");
    if(!imgEl||!frame||!clubLogoCropState?.img)return;
    const frameSize=Math.max(1,frame.clientWidth||240);
    const img=clubLogoCropState.img;
    const base=Math.min(frameSize/Math.max(1,img.naturalWidth),frameSize/Math.max(1,img.naturalHeight));
    const w=img.naturalWidth*base;
    const h=img.naturalHeight*base;
    imgEl.style.width=`${w}px`;
    imgEl.style.height=`${h}px`;
    imgEl.style.transform=`translate(-50%,-50%) translate(${clubLogoCropState.x}px,${clubLogoCropState.y}px) scale(${clubLogoCropState.zoom})`;
    const zoomValue=document.getElementById("arenaClubLogoCropZoomValueV993");
    if(zoomValue) zoomValue.textContent=`${Math.round(clubLogoCropState.zoom*100)}%`;
  };
  const bindClubLogoCropGesturesV993=()=>{
    const frame=document.getElementById("arenaClubLogoCropFrameV993");
    if(!frame||!clubLogoCropState)return;
    let dragging=false,startX=0,startY=0,originX=0,originY=0,pointerId=null;
    frame.onpointerdown=e=>{
      if(!clubLogoCropState)return;
      dragging=true;pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;
      originX=clubLogoCropState.x;originY=clubLogoCropState.y;
      try{frame.setPointerCapture(pointerId)}catch(_e){}
      frame.classList.add("is-dragging");
      e.preventDefault();
    };
    frame.onpointermove=e=>{
      if(!dragging||e.pointerId!==pointerId||!clubLogoCropState)return;
      clubLogoCropState.x=originX+(e.clientX-startX);
      clubLogoCropState.y=originY+(e.clientY-startY);
      renderClubLogoCropImageV993();
      e.preventDefault();
    };
    const end=e=>{
      if(!dragging)return;
      dragging=false;
      try{frame.releasePointerCapture(pointerId)}catch(_e){}
      frame.classList.remove("is-dragging");
    };
    frame.onpointerup=end;
    frame.onpointercancel=end;
  };
  let tournamentDraftParticipants=[];
  let tournamentDraftClubs=[];
  let tournamentDraftKind="league";
  let tournamentDraftCover="";
  let tournamentDraftVoteHours=24;
  const tournamentDefaultTitle=kind=>kind==="league"?nextHistoryOrdinalForKind("league"):nextHistoryOrdinalForKind("cup");
  const updateTournamentCreatorCount=()=>{
    const el=document.getElementById("arenaTournamentSelectedCountV996");
    if(el)el.textContent=`Додано ADMIN: ${tournamentDraftParticipants.length}`;
  };
  const updateTournamentClubCountV1028=()=>{
    const el=document.getElementById('arenaTournamentSelectedClubCountV1028');
    if(el)el.textContent=`Обрано клубів: ${tournamentDraftClubs.length}`;
  };
  const renderTournamentCoverPreviewV1026=()=>{
    const box=document.getElementById('arenaTournamentCoverPreviewV1026');
    if(!box)return;
    if(!tournamentDraftCover){
      box.innerHTML=`<div class="arena-cup-cover-empty-v1026">Фото ${tournamentDraftKind==='league'?'ліги':'кубка'} ще не додано</div>`;
      return;
    }
    box.innerHTML=`<img src="${esc(tournamentDraftCover)}" alt="Фото ${tournamentDraftKind==='league'?'ліги':'кубка'}"><button type="button" class="arena-chip-btn-v936" onclick="ArenaV852.clearTournamentCover()">ПРИБРАТИ ФОТО</button>`;
  };
  const buildCupSignupPoll=(names,title,cover,voteHours,clubs=[],matchLegs=1)=>{
    const participants=[...new Set((names||[]).map(x=>String(x||'').trim()).filter(Boolean))];
    const allowedClubs=[...new Set((clubs||[]).map(x=>canonicalTeamName(String(x||'').trim())).filter(Boolean))];
    const participantClubs=Object.fromEntries(participants.map(name=>[name,canonicalTeamName(clubFor(name))]));
    // v10.35 — every player added by ADMIN is immediately treated exactly
    // like a player who pressed "Беру участь" themselves. Remote self-votes
    // can still override this later (for example, if that player chooses "Не беру").
    const adminAdded=[...participants];
    const votes=Object.fromEntries(adminAdded.map(name=>[name,'yes']));
    const safeHours=Math.max(1,Math.min(168,Number(voteHours)||24));
    const now=Date.now();
    return {
      id:`cup_poll_${now}`,
      kind:'cup',
      title:String(title||'CENTURIA CUP').trim()||'CENTURIA CUP',
      cover:String(cover||''),
      participants,
      adminAdded,
      allowedClubs,
      participantClubs,
      votes,
      createdAt:now,
      endsAt:now + safeHours*60*60*1000,
      voteHours:safeHours,
      matchLegs:Number(matchLegs)===2?2:1
    };
  };

  window.ArenaV852={
    open(){
      testBackTarget="arena";
      route="home";
      tab="mine";
      // Local data is only an instant cache. v10.12 immediately replaces it
      // with the canonical Supabase Arena state for every account.
      loadActiveEvent();
      loadTestCompetition();
      loadCupSignupPoll();
      loadLeagueSignupPollV1093();
      loadHistoryArchive();
      ensureFriendlyRealtimeV1007();
      ensureRemoteClubPollingV1009();
      ensureRemotePlayerPrefsPollingV1011();
      ensureFullArenaSyncV1012();
      refreshAllArenaRemoteV1012(false).finally(()=>draw());
      draw();
    },
    go(r){
      const wasCup=route==="cup";
      route=r; tab="mine"; tabAnim="none";
      if(r!=="cup"||!wasCup)cupDrawAutoAttemptKeyV1034="";
      if(r!=="league")leagueDrawAutoAttemptKeyV1095="";
      draw();
      ensureFullArenaSyncV1012();
      refreshAllArenaRemoteV1012(true);
    },
    goHome(){
      route="home"; tab="mine"; tabAnim="none";
      cupDrawAutoAttemptKeyV1034="";
      leagueDrawAutoAttemptKeyV1095="";
      ensureFullArenaSyncV1012();
      refreshAllArenaRemoteV1012(true);
    },
    setTab(t){
      if(t===tab) return;
      const list=currentSwipeList()||[];
      const cur=list.indexOf(tab), next=list.indexOf(t);
      tabAnim=next>cur?"next":"prev";
      tab=t;
      draw()
    },
    setLeagueTableViewV1108(view){
      const next=view==='playoff'?'playoff':'table';
      if(next===leagueTableViewV1108) return;
      leagueTableViewV1108=next;
      draw();
    },
    toggleLeagueCalendarRoundV1115(key){
      const roundItem=(testCompetition?.rounds||[]).find(r=>leagueCalendarRoundKeyV1115(r)===key);
      if(!roundItem)return;
      const currentRound=currentLeagueRound();
      const currentOpen=leagueCalendarRoundOpenV1115(roundItem,currentRound);
      leagueCalendarOpenRoundsV1115[key]=!currentOpen;
      draw();
    },
    setHist(h){
      if(h===hist) return;
      const list=currentSwipeList()||["cup","league"];
      const cur=list.indexOf(hist), next=list.indexOf(h);
      tabAnim=next>cur?"next":"prev";
      hist=h;
      draw()
    },
    toggleCupPollPanel(panel){
      cupPollPanelV1031=cupPollPanelV1031===panel?"":panel;
      draw();
    },
    toggleCupDrawResults(){
      cupDrawOpenV1032=!cupDrawOpenV1032;
      draw();
    },
    openCupDrawAnimation(){ openCupDrawAnimationV1033(); },
    closeCupDrawAnimation(){ closeCupDrawAnimationV1033(); },
    startCupDrawAnimation(){ startCupDrawAnimationV1033(); },
    stopCupDrawAnimation(){ stopCupDrawAnimationV1033(); },
    openLeagueDrawAnimationV1095(){ openLeagueDrawAnimationV1095(); },
    closeLeagueDrawAnimationV1095(){ closeLeagueDrawAnimationV1095(); },
    replayLeagueDrawAnimationV1095(){ startLeagueDrawAnimationV1095(); },
    openHistoryArchive(kind,archiveId){ openHistoryArchiveV992(kind,archiveId); },
    setHistoryLeagueViewV1117(button,view){
      const modalRoot=button?.closest?.('.arena-history-modal-v992');
      if(!modalRoot)return;
      const selected=view==='playoff'?'playoff':'table';
      modalRoot.querySelectorAll('[data-history-league-panel]').forEach(panel=>{
        panel.hidden=panel.dataset.historyLeaguePanel!==selected;
      });
      modalRoot.querySelectorAll('.arena-history-league-switch-v1117 button').forEach(btn=>{
        const on=btn===button;
        btn.classList.toggle('on',on);
        btn.setAttribute('aria-pressed',String(on));
      });
      if(selected==='playoff')queueCupBracketConnectorsV1038(modalRoot);
    },
    draw,
    openTournamentCreator(kind){
      if(!isArenaAdmin())return;
      if(testCompetition){try{window.showToast?.("Спочатку заверши активний турнір")}catch(_e){};return;}
      if(cupSignupPoll||leagueSignupPoll){try{window.showToast?.('Спочатку заверши активну реєстрацію турніру')}catch(_e){};return;}
      tournamentDraftKind=kind==="cup"?"cup":"league";
      tournamentDraftParticipants=[];
      tournamentDraftClubs=[];
      tournamentDraftCover="";
      tournamentDraftVoteHours=24;
      const pool=playerPool().slice().sort((a,b)=>String(a).localeCompare(String(b),'uk'));
      const cupClubs=clubDbNames().slice().sort((a,b)=>String(a).localeCompare(String(b),'uk'));
      const title=tournamentDefaultTitle(tournamentDraftKind);
      if(tournamentDraftKind==="cup"){
        if(cupSignupPoll){try{window.showToast?.("Спочатку заверши або скасуй активне голосування за Кубок")}catch(_e){};return;}
        modal(`<div class="arena-tournament-create-v996 arena-cup-poll-create-v1026"><div class="arena-tournament-create-head-v996"><div><small>ADMIN · ARENA</small><h2>СТВОРИТИ КУБОК</h2><p>Обери назву, фото й клуби Кубка. Голосування доступне всім гравцям Arena. Гравці, яких ADMIN додасть нижче, одразу вважаються підтвердженими учасниками.</p></div><button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button></div><label class="arena-tournament-title-v996"><span>НАЗВА КУБКА</span><input id="arenaTournamentTitleV996" type="text" value="${esc(title)}"></label><label class="arena-tournament-title-v996"><span>ФОТО КУБКА</span><input id="arenaTournamentCoverInputV1026" type="file" accept="image/*" onchange="ArenaV852.previewTournamentCover(this)"></label><div class="arena-cup-cover-preview-v1026" id="arenaTournamentCoverPreviewV1026"><div class="arena-cup-cover-empty-v1026">Фото кубка ще не додано</div></div><fieldset class="arena-cup-legs-v1061"><legend>ФОРМАТ ПРОТИСТОЯННЯ</legend><label><input type="radio" name="arenaCupLegsV1061" value="1" checked><span><b>ОДИН МАТЧ</b><small>Один результат визначає переможця пари</small></span></label><label><input type="radio" name="arenaCupLegsV1061" value="2"><span><b>ДВА МАТЧІ</b><small>Вдома й у гостях · переможець за сумою голів</small></span></label></fieldset><label class="arena-tournament-title-v996"><span>ТРИВАЛІСТЬ ГОЛОСУВАННЯ (ГОДИН)</span><input id="arenaTournamentVoteHoursV1026" type="number" min="1" max="168" step="1" value="24"></label><div class="arena-cup-create-section-v1028"><div class="arena-cup-create-section-head-v1028"><div><b>КЛУБИ КУБКА</b><small>Обери клуби з Бази клубів, які можуть брати участь у цьому Кубку.</small></div><div class="arena-tournament-selected-v996" id="arenaTournamentSelectedClubCountV1028">Обрано клубів: 0</div></div><div class="arena-cup-club-picker-v1028">${cupClubs.map(n=>`<label><input type="checkbox" onchange="ArenaV852.toggleTournamentClub('${jsq(n)}',this.checked)"><span class="arena-cup-club-picker-crest-v1028">${crestBadge(n,'')}</span><span class="arena-cup-club-picker-name-v1028">${esc(n)}</span></label>`).join("") || `<div class="arena-cup-club-picker-empty-v1028">У Базі клубів поки немає клубів.</div>`}</div></div><div class="arena-cup-create-section-v1028"><div class="arena-cup-create-section-head-v1028"><div><b>ДОДАТИ ГРАВЦІВ ВІД ADMIN</b><small>Необов’язково. Кожен вибраний тут гравець одразу рахується як той, хто натиснув «Беру участь», і гарантовано потрапляє до списку підтверджених. Інші гравці Arena можуть приєднатися самі через голосування.</small></div><div class="arena-tournament-selected-v996" id="arenaTournamentSelectedCountV996">Додано ADMIN: 0</div></div><div class="arena-tournament-manual-v996"><input id="arenaTournamentManualPlayerV996" type="text" placeholder="Додати нік вручну"><button class="arena-secondary-v852" type="button" onclick="ArenaV852.addTournamentParticipantManual()">＋ ДОДАТИ</button></div><div class="arena-tournament-players-v996" id="arenaTournamentPlayersV996">${pool.map(n=>`<label><input type="checkbox" data-name="${esc(n)}" onchange="ArenaV852.toggleTournamentParticipant('${jsq(n)}',this.checked)"><span>${esc(n)}</span><small>${esc(clubFor(n))}</small></label>`).join("")}</div></div><div class="arena-tournament-create-actions-v996"><button class="arena-secondary-v852" type="button" onclick="this.closest('.arena-modal-v852').remove()">СКАСУВАТИ</button><button class="arena-primary-v852" type="button" onclick="ArenaV852.startCupVotingNow()">ЗАПУСТИТИ ГОЛОСУВАННЯ</button></div></div>`);
        renderTournamentCoverPreviewV1026();
        return;
      }
      if(leagueSignupPoll){window.showToast?.('Спочатку заверши або скасуй реєстрацію Ліги');return;}
      modal(`<div class="arena-tournament-create-v996 arena-cup-poll-create-v1026 arena-league-create-v1093"><div class="arena-tournament-create-head-v996"><div><small>ADMIN · ARENA</small><h2>СТВОРИТИ ЛІГУ</h2><p>Обери назву, обкладинку, команди та формат. ADMIN може одразу додати гравців, решта зареєструються самі.</p></div><button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button></div><label class="arena-tournament-title-v996"><span>НАЗВА ЛІГИ</span><input id="arenaTournamentTitleV996" type="text" value="${esc(title)}"></label><label class="arena-tournament-title-v996"><span>ФОТО ЛІГИ</span><input id="arenaTournamentCoverInputV1026" type="file" accept="image/*" onchange="ArenaV852.previewTournamentCover(this)"></label><div class="arena-cup-cover-preview-v1026" id="arenaTournamentCoverPreviewV1026"><div class="arena-cup-cover-empty-v1026">Фото ліги ще не додано</div></div><fieldset class="arena-cup-legs-v1061 arena-league-formats-v1093"><legend>ТИП ЛІГИ</legend><label><input type="radio" name="arenaLeagueFormatV1093" value="single" checked onchange="ArenaV852.updateLeagueFormatV1093()"><span><b>ОДНЕ КОЛО</b><small>Кожна пара грає один матч</small></span></label><label><input type="radio" name="arenaLeagueFormatV1093" value="double" onchange="ArenaV852.updateLeagueFormatV1093()"><span><b>ДВА КОЛА</b><small>Матч удома та матч у гостях</small></span></label><label><input type="radio" name="arenaLeagueFormatV1093" value="top4" onchange="ArenaV852.updateLeagueFormatV1093()"><span><b>ЛІГА + ТОП-4 ПЛЕЙ-ОФ</b><small>Після таблиці: 1–4, 2–3, фінал</small></span></label><label><input type="radio" name="arenaLeagueFormatV1093" value="swiss" onchange="ArenaV852.updateLeagueFormatV1093()"><span><b>ШВЕЙЦАРСЬКА СИСТЕМА</b><small>Кожен тур з суперниками, близькими за очками</small></span></label><div id="arenaLeagueSwissOptionsV1093" hidden><label class="arena-tournament-title-v996"><span>КІЛЬКІСТЬ ТУРІВ (1–24)</span><input type="number" id="arenaLeagueSwissRoundsV1093" min="1" max="24" value="5"></label></div></fieldset><label class="arena-tournament-title-v996"><span>ТРИВАЛІСТЬ РЕЄСТРАЦІЇ (ГОДИН)</span><input id="arenaTournamentVoteHoursV1026" type="number" min="1" max="168" value="48"></label><div class="arena-cup-create-section-v1028"><div class="arena-cup-create-section-head-v1028"><div><b>КОМАНДИ ЛІГИ</b><small>Обери клуби, з яких ADMIN розподілить по одному для кожного учасника.</small></div><div class="arena-tournament-selected-v996" id="arenaTournamentSelectedClubCountV1028">Обрано клубів: 0</div></div><div class="arena-cup-club-picker-v1028">${cupClubs.map(n=>`<label><input type="checkbox" onchange="ArenaV852.toggleTournamentClub('${jsq(n)}',this.checked)"><span class="arena-cup-club-picker-crest-v1028">${crestBadge(n,'')}</span><span class="arena-cup-club-picker-name-v1028">${esc(n)}</span></label>`).join('')||'<div class="arena-cup-club-picker-empty-v1028">У Базі клубів ще немає команд.</div>'}</div></div><div class="arena-cup-create-section-v1028"><div class="arena-cup-create-section-head-v1028"><div><b>ДОДАТИ ГРАВЦІВ ВІД ADMIN</b><small>Вибрані гравці одразу підтверджені. Інші можуть самостійно зареєструватися.</small></div><div class="arena-tournament-selected-v996" id="arenaTournamentSelectedCountV996">Додано ADMIN: 0</div></div><div class="arena-tournament-manual-v996"><input id="arenaTournamentManualPlayerV996" type="text" placeholder="Додати нік вручну"><button class="arena-secondary-v852" type="button" onclick="ArenaV852.addTournamentParticipantManual()">＋ ДОДАТИ</button></div><div class="arena-tournament-players-v996" id="arenaTournamentPlayersV996">${pool.map(n=>`<label><input type="checkbox" data-name="${esc(n)}" onchange="ArenaV852.toggleTournamentParticipant('${jsq(n)}',this.checked)"><span>${esc(n)}</span><small>${esc(clubFor(n))}</small></label>`).join('')}</div></div><div class="arena-tournament-create-actions-v996"><button class="arena-secondary-v852" type="button" onclick="this.closest('.arena-modal-v852').remove()">СКАСУВАТИ</button><button class="arena-primary-v852" type="button" onclick="ArenaV852.startLeagueRegistrationV1093()">ВІДКРИТИ РЕЄСТРАЦІЮ</button></div></div>`);
      renderTournamentCoverPreviewV1026();
    },
    updateLeagueFormatV1093(){
      const swiss=document.querySelector('input[name="arenaLeagueFormatV1093"]:checked')?.value==='swiss';
      const field=document.getElementById('arenaLeagueSwissOptionsV1093');if(field)field.hidden=!swiss;
    },
    startLeagueRegistrationV1093(){
      if(!isArenaAdmin()||testCompetition||cupSignupPoll||leagueSignupPoll)return;
      const title=String(document.getElementById('arenaTournamentTitleV996')?.value||'').trim()||tournamentDefaultTitle('league');
      const allowedClubs=[...new Set(tournamentDraftClubs.map(n=>canonicalTeamName(n)).filter(Boolean))];
      if(allowedClubs.length<2){window.showToast?.('Обери щонайменше 2 клуби');return;}
      const adminAdded=[...new Set(tournamentDraftParticipants.map(n=>String(n||'').trim()).filter(Boolean))];
      const format=document.querySelector('input[name="arenaLeagueFormatV1093"]:checked')?.value||'single';
      if(format==='top4'&&adminAdded.length&&adminAdded.length<4){
        // Registration can still add players; check the minimum again when starting.
      }
      const rawHours=Number(document.getElementById('arenaTournamentVoteHoursV1026')?.value);
      if(!Number.isInteger(rawHours)||rawHours<1||rawHours>168){window.showToast?.('Вкажи тривалість реєстрації від 1 до 168 годин');return;}
      const rawRounds=Number(document.getElementById('arenaLeagueSwissRoundsV1093')?.value);
      if(format==='swiss'&&(!Number.isInteger(rawRounds)||rawRounds<1||rawRounds>24)){window.showToast?.('Вкажи 1–24 тури');return;}
      const now=Date.now();
      leagueSignupPoll={id:`league_poll_${now}`,kind:'league',title,cover:tournamentDraftCover,
        allowedClubs,participants:adminAdded,adminAdded,votes:Object.fromEntries(adminAdded.map(n=>[n,'yes'])),
        leagueFormat:format,swissRounds:format==='swiss'?rawRounds:0,
        createdAt:now,endsAt:now+rawHours*3600000,voteHours:rawHours};
      activeEvent={type:'league',route:'league',title,meta:`РЕЄСТРАЦІЯ • ${formatCupPollTimeLeft(leagueSignupPoll)}`,
        icon:'arena-icon-league-pixel.gif?v=9.15',createdAt:now,signup_poll:cloneArenaStateV1012(leagueSignupPoll)};
      saveLeagueSignupPollV1093();saveActiveEvent();
      document.querySelector('.arena-modal-v852')?.remove();
      route='league';tab='mine';draw();
      window.showToast?.('Реєстрацію Ліги відкрито');
    },
    async voteLeagueV1093(choice){
      const poll=leagueSignupPoll;
      if(!poll||poll.phase==='ready'||!cupPollStillActive(poll))return;
      const me=linkedArenaPlayerName();if(!me){window.showToast?.('Привʼяжи футболіста до акаунта');return;}
      const api=cupVoteApiV1029();
      if(!api?.isReady?.()||!api?.vote){window.showToast?.('Немає підключення для реєстрації');return;}
      try{
        await api.vote(poll.id,choice==='no'?'no':'yes');
        await refreshRemoteLeagueVotesV1093(false);
        draw();window.showToast?.('Відповідь на реєстрацію збережена');
      }catch(err){console.warn('League vote',err);window.showToast?.(err?.message||'Не вдалося зареєструватися');}
    },
    async closeLeagueRegistrationV1093(){
      if(!isArenaAdmin()||!leagueSignupPoll)return;
      await refreshRemoteLeagueVotesV1093(false);
      const confirmed=leagueConfirmedV1093(leagueSignupPoll);
      if(confirmed.length<2){window.showToast?.('Для старту ліги потрібно хоча б 2 підтверджені гравці');return;}
      if(leagueSignupPoll.leagueFormat==='top4'&&confirmed.length<4){window.showToast?.('Для плей-оф ТОП-4 потрібно хоча б 4 учасники');return;}
      leagueSignupPoll.phase='ready';leagueSignupPoll.closedAt=Date.now();
      leagueSignupPoll.endsAt=Math.min(Number(leagueSignupPoll.endsAt)||Date.now(),Date.now());
      // Leave the draw sealed until ADMIN actually launches it.
      activeEvent={type:'league',route:'league',title:leagueSignupPoll.title,
        meta:`ОЧІКУЄ ЗАПУСКУ • ${confirmed.length} УЧАСНИКІВ`,icon:'arena-icon-league-pixel.gif?v=9.15',
        createdAt:leagueSignupPoll.createdAt,signup_poll:cloneArenaStateV1012(leagueSignupPoll)};
      saveLeagueSignupPollV1093();saveActiveEvent();draw();
    },
    shuffleLeagueClubsV1093(redraw=true){
      // Legacy action: never allow a re-roll of the sealed League draw.
      if(!isArenaAdmin()||!leagueSignupPoll||leagueSignupPoll.phase==='ready'||testCompetition)return;
      const confirmed=leagueConfirmedV1093(leagueSignupPoll);
      const clubs=cupDrawClubDeckV1032(leagueSignupPoll.allowedClubs||[],confirmed.length);
      leagueSignupPoll.previewClubs=Object.fromEntries(confirmed.map((name,i)=>[name,clubs[i]]));
      if(activeEvent?.signup_poll){activeEvent.signup_poll=cloneArenaStateV1012(leagueSignupPoll);saveActiveEvent();}
      saveLeagueSignupPollV1093();
      if(redraw)draw();
    },
    async launchLeagueV1093(){
      if(!isArenaAdmin()||!leagueSignupPoll||testCompetition)return;
      const api=arenaStateApiV1012();
      if(!api?.isReady?.()||!api?.canWrite?.()||!api?.get||!api?.save){
        window.showToast?.('Потрібне підключення до Arena, щоб зберегти жеребкування для всіх');return;
      }
      // Do not invent a local-only draw: all accounts must see the SAME draw.
      let latest;
      try{latest=await api.get();}
      catch(err){window.showToast?.('Не вдалося перевірити стан Ліги. Спробуй знову');return;}
      if(latest?.active_competition){window.showToast?.('Жеребкування вже проведено');applyRemoteArenaStateV1012(latest,true);return;}
      const remotePoll=latest?.active_event?.signup_poll;
      if(remotePoll?.kind!=='league'||String(remotePoll.id)!==String(leagueSignupPoll.id)){
        window.showToast?.('Реєстрація змінилась. Онови вкладку Ліги');
        if(latest)applyRemoteArenaStateV1012(latest,true);
        return;
      }
      await refreshRemoteLeagueVotesV1093(false);
      const poll=leagueSignupPoll;
      if(!poll || (poll.phase!=='ready'&&cupPollStillActive(poll))){window.showToast?.('Спочатку заверши реєстрацію');return;}
      const confirmed=leagueConfirmedV1093(poll);
      if(confirmed.length<2){window.showToast?.('Для старту потрібно мінімум 2 учасники');return;}
      if(poll.leagueFormat==='top4'&&confirmed.length<4){window.showToast?.('Для ТОП-4 потрібно мінімум 4 учасники');return;}
      const allowed=[...new Set((poll.allowedClubs||[]).map(c=>canonicalTeamName(String(c||'').trim())).filter(Boolean))];
      if(!allowed.length){window.showToast?.('Спочатку обери клуби Ліги');return;}
      // Select participants, clubs AND the round-robin schedule only once.
      const players=secureLeagueShuffleV1095(confirmed);
      const clubDeck=[];
      while(clubDeck.length<players.length)clubDeck.push(...secureLeagueShuffleV1095(allowed));
      const clubs=Object.fromEntries(players.map((name,i)=>[name,clubDeck[i]]));
      const createdAt=Date.now();
      const competition=buildCompetition('league',players,poll.title,{leagueFormat:poll.leagueFormat,
        swissRounds:poll.swissRounds,cover:poll.cover,allowedClubs:allowed,participantClubs:clubs,voteSourceId:poll.id});
      competition.draw={kind:'league',completedAt:createdAt,
        entries:players.map(name=>({player:name,club:clubs[name]}))};
      const firstRound=competition.rounds?.[0];
      const event={type:'league',route:'league',title:competition.title,
        meta:`${players.length} УЧАСНИКІВ • ТУР ${firstRound?.round||1}/${competition.rounds.length}`,
        icon:'arena-icon-league-pixel.gif?v=9.15',createdAt:competition.createdAt};
      // Commit first; if it fails, registration remains untouched and no draw
      // is shown. The animation replays this exact stored snapshot.
      let saved;
      try{saved=await api.save({activeCompetition:competition,
        historyArchive:cloneArenaStateV1012(historyArchive||{cup:[],league:[]}),activeEvent:event});}
      catch(err){console.warn('League draw save',err);window.showToast?.('Не вдалося зберегти жеребкування. Нічого не змінено');return;}
      if(!saved?.active_competition?.draw?.entries?.length){window.showToast?.('Немає підтвердження збереження жеребкування');return;}
      applyRemoteArenaStateV1012(saved,false);
      leagueDrawAutoAttemptKeyV1095=leagueDrawViewKeyV1095();
      route='league';tab='mine';draw();
      startLeagueDrawAnimationV1095();
      window.showToast?.('Жеребкування Ліги проведено 🎲');
    },
    cancelLeagueRegistrationV1093(){
      if(!isArenaAdmin()||!leagueSignupPoll)return;
      if(!confirm('Скасувати реєстрацію на Лігу?'))return;
      leagueSignupPoll=null;remoteLeagueVotesV1093={};activeEvent=null;
      saveLeagueSignupPollV1093();saveActiveEvent();draw();
    },
    advanceLeagueRoundV1093(){
      if(!isArenaAdmin()||!leagueCanAdvanceV1093(testCompetition))return;
      if(!advanceLeagueRoundV1093())return;
      saveTestCompetition();syncActiveEventFromCompetition();tab='round';draw();
      window.showToast?.(testCompetition.champion?'Чемпіона визначено':'Наступний етап відкрито');
    },
    repairSwissRoundV1137(){
      if(!swissCanRepairRoundV1137(testCompetition)){
        window.showToast?.('Пари не можна змінити після внесення результату або заявки на результат');
        return;
      }
      const comp=testCompetition;
      const oldRound=comp.rounds.at(-1);
      if(!confirm(`Перерахувати пари туру ${oldRound.round} за очками? Попередні тури та результати не зміняться.`))return;
      // Never include this round's already credited BYE in its own seeding.
      const standingsBefore=leagueStandings(comp.rounds.length-2);
      const next=makeSwissRoundV1093(comp.participants,oldRound.round,comp.rounds.slice(0,-1),standingsBefore);
      const signature=round=>JSON.stringify({pairs:(round.matches||[]).map(m=>[m.home,m.away].sort().join('|')).sort(),byes:[...(round.byes||[])].sort()});
      if(signature(next)===signature(oldRound)){
        window.showToast?.('Пари вже відповідають очкам (повторні зустрічі дозволені)');
        return;
      }
      comp.rounds[comp.rounds.length-1]=next;
      saveTestCompetition();syncActiveEventFromCompetition();tab='round';draw();
      window.showToast?.('Пари перераховано за очками попередніх турів');
    },
    toggleTournamentClub(name,checked){
      name=canonicalTeamName(String(name||'').trim());if(!name)return;
      if(checked){if(!tournamentDraftClubs.includes(name))tournamentDraftClubs.push(name);}
      else tournamentDraftClubs=tournamentDraftClubs.filter(x=>normalizeTeamName(x)!==normalizeTeamName(name));
      updateTournamentClubCountV1028();
    },
    toggleTournamentParticipant(name,checked){
      name=String(name||"").trim();if(!name)return;
      if(checked){if(!tournamentDraftParticipants.includes(name))tournamentDraftParticipants.push(name);}
      else tournamentDraftParticipants=tournamentDraftParticipants.filter(x=>x!==name);
      updateTournamentCreatorCount();
    },
    addTournamentParticipantManual(){
      if(!isArenaAdmin())return;
      const input=document.getElementById("arenaTournamentManualPlayerV996");
      const name=String(input?.value||"").trim();if(!name)return;
      if(!customTestParticipants.includes(name))customTestParticipants.push(name);
      if(!tournamentDraftParticipants.includes(name))tournamentDraftParticipants.push(name);
      const list=document.getElementById("arenaTournamentPlayersV996");
      if(list && ![...list.querySelectorAll('input[type=checkbox]')].some(i=>String(i.dataset.name||'')===name)){
        const row=document.createElement('label');
        row.innerHTML=`<input type="checkbox" checked data-name="${esc(name)}"><span>${esc(name)}</span><small>${esc(clubFor(name))}</small>`;
        const cb=row.querySelector('input');if(cb)cb.onchange=()=>ArenaV852.toggleTournamentParticipant(name,cb.checked);
        list.prepend(row);
      }
      if(input)input.value="";
      updateTournamentCreatorCount();
    },
    async previewTournamentCover(input){
      if(!isArenaAdmin())return;
      const file=input?.files?.[0];
      if(!file)return;
      try{
        tournamentDraftCover=await readTournamentCoverFile(file);
        renderTournamentCoverPreviewV1026();
      }catch(err){
        input.value='';
        try{window.showToast?.(String(err?.message||'Не вдалося обробити фото'))}catch(_e){}
      }
    },
    async replaceTournamentCover(input,kind,scope='poll'){
      if(!isArenaAdmin())return;
      const file=input?.files?.[0];
      if(!file)return;
      const pollKind=kind==='league'?'league':'cup';
      const isLive=scope==='live';
      const original=isLive?testCompetition:(pollKind==='league'?leagueSignupPoll:cupSignupPoll);
      const originalId=String(original?.id||'');
      if(!originalId||String(original.kind)!==pollKind){
        input.value='';window.showToast?.('Цей турнір уже змінився. Онови сторінку');return;
      }
      input.disabled=true;
      try{
        const cover=await readTournamentCoverFile(file);
        const api=arenaStateApiV1012();
        if(!api?.isReady?.()||!api?.canWrite?.()||!api?.get||!api?.save){
          throw new Error('Потрібне підключення до Arena для збереження фото');
        }
        clearTimeout(remoteArenaStateSaveTimerV1012);
        await remoteArenaStateSaveInFlightV1061;
        const current=await api.get();
        if(!current)throw new Error('Не вдалося завантажити актуальний турнір');
        const event=current.active_event;
        const remotePoll=event?.signup_poll;
        const remoteComp=current.active_competition;
        const target=isLive?remoteComp:remotePoll;
        if(String(target?.id||'')!==originalId||String(target?.kind||'')!==pollKind){
          throw new Error('Турнір змінився. Онови сторінку і спробуй знову');
        }
        const updated=await api.save({
          activeCompetition:isLive?{...remoteComp,cover}:remoteComp,
          historyArchive:current.history_archive||{cup:[],league:[]},
          activeEvent:isLive?event:{...event,signup_poll:{...remotePoll,cover}}
        });
        if(!updated||updated.state_key!=='global')throw new Error('Сервер не підтвердив збереження фото');
        applyRemoteArenaStateV1012(updated,false);
        draw();
        window.showToast?.('Обкладинку замінено без скидання турніру та голосів');
      }catch(err){
        console.warn('Arena cover replacement',err);
        window.showToast?.(String(err?.message||'Не вдалося зберегти фото'));
      }finally{
        input.value='';input.disabled=false;
      }
    },
    clearTournamentCover(){
      if(!isArenaAdmin())return;
      tournamentDraftCover='';
      const input=document.getElementById('arenaTournamentCoverInputV1026');
      if(input)input.value='';
      renderTournamentCoverPreviewV1026();
    },
    startCupVotingNow(){
      if(!isArenaAdmin())return;
      if(cupSignupPoll||leagueSignupPoll){try{window.showToast?.('Інша реєстрація вже активна')}catch(_e){};return;}
      const names=[...new Set(tournamentDraftParticipants.map(x=>String(x).trim()).filter(Boolean))];
      const clubs=[...new Set(tournamentDraftClubs.map(x=>canonicalTeamName(String(x).trim())).filter(Boolean))];
      if(clubs.length<2){try{window.showToast?.('Обери мінімум 2 клуби для Кубка')}catch(_e){};return;}
      const title=String(document.getElementById('arenaTournamentTitleV996')?.value||tournamentDefaultTitle('cup')).trim()||tournamentDefaultTitle('cup');
      const voteHours=Math.max(1,Math.min(168,Number(document.getElementById('arenaTournamentVoteHoursV1026')?.value)||24));
      const matchLegs=Number(document.querySelector('input[name="arenaCupLegsV1061"]:checked')?.value)===2?2:1;
      cupSignupPoll=buildCupSignupPoll(names,title,tournamentDraftCover,voteHours,clubs,matchLegs);
      activeEvent={type:'cup',route:'cup',title:cupSignupPoll.title||'CENTURIA CUP',meta:`ГОЛОСУВАННЯ • ${formatCupPollTimeLeft(cupSignupPoll)}`,icon:'arena-icon-cup-pixel.gif?v=10.53',createdAt:cupSignupPoll.createdAt,signup_poll:cloneArenaStateV1012(cupSignupPoll)};
      saveCupSignupPoll();
      saveActiveEvent();
      document.querySelector('.arena-modal-v852')?.remove();
      route='cup'; tab='mine'; draw();
      try{window.showToast?.(names.length?`Голосування запущено • ADMIN підтвердив: ${names.length}`:'Голосування за Кубок запущено')}catch(_e){}
    },
    async voteCupSignup(choice){
      const poll=cupSignupPoll;
      if(!poll)return;
      if(!cupPollStillActive(poll)){try{window.showToast?.('Час голосування вже завершено')}catch(_e){};return;}
      const me=currentArenaViewerName();
      if(!me){try{window.showToast?.('Привʼяжи свого гравця до акаунта, щоб голосувати')}catch(_e){};return;}
      const api=cupVoteApiV1029();
      if(api?.isReady?.() && api?.vote){
        try{
          await api.vote(String(poll.id||''),choice==='no'?'no':'yes');
          await refreshRemoteCupVotesV1029(false);
          draw();
          try{window.showToast?.(choice==='no'?'Ти не береш участь у Кубку':'Участь у Кубку підтверджено')}catch(_e){}
          return;
        }catch(err){
          console.warn('Arena cup vote',err);
          try{window.showToast?.(String(err?.message||'Не вдалося зберегти голос'))}catch(_e){}
          return;
        }
      }
      poll.votes={...(poll.votes||{}),[me]:choice==='no'?'no':'yes'};
      if(!(poll.participants||[]).some(name=>sameArenaPlayer(name,me)))poll.participants=[...(poll.participants||[]),me];
      cupSignupPoll=poll;
      try{localStorage.setItem(CUP_SIGNUP_POLL_KEY,JSON.stringify(cupSignupPoll));}catch(_e){}
      draw();
      try{window.showToast?.('Голос збережено локально')}catch(_e){}
    },
    cancelCupSignupPoll(){
      if(!isArenaAdmin()||!cupSignupPoll)return;
      const ok=confirm('Скасувати поточне голосування за Кубок?');
      if(!ok)return;
      cupSignupPoll=null;
      remoteCupVotesV1029={};
      remoteCupVoteRowsV1029=[];
      activeEvent=null;
      saveCupSignupPoll();
      saveActiveEvent();
      draw();
      try{window.showToast?.('Голосування скасовано')}catch(_e){}
    },
    async finalizeCupSignupPoll(force){
      if(!isArenaAdmin()||!cupSignupPoll)return;
      await refreshRemoteCupVotesV1029(false);
      if(cupPollStillActive(cupSignupPoll) && !force){try{window.showToast?.('Голосування ще триває')}catch(_e){};return;}
      const confirmed=cupPollConfirmedPlayers(cupSignupPoll);
      if(confirmed.length<2){try{window.showToast?.('Підтвердили участь менше 2 гравців')}catch(_e){};return;}
      cupSignupPoll={...cupSignupPoll,phase:'draw_ready',closedAt:Date.now(),endsAt:Math.min(Number(cupSignupPoll.endsAt||Date.now()),Date.now())};
      activeEvent={type:'cup',route:'cup',title:cupSignupPoll.title||'CENTURIA CUP',meta:`ОЧІКУЄ ЖЕРЕБКУВАННЯ • ${confirmed.length} УЧАСНИКІВ`,icon:'arena-icon-cup-pixel.gif?v=10.53',createdAt:cupSignupPoll.createdAt,signup_poll:cloneArenaStateV1012(cupSignupPoll)};
      saveCupSignupPoll();
      saveActiveEvent();
      draw();
      try{window.showToast?.('Реєстрацію завершено. Можна проводити жеребкування')}catch(_e){}
    },
    async conductCupDraw(){
      if(!isArenaAdmin()||!cupSignupPoll)return;
      await refreshRemoteCupVotesV1029(false);
      const poll=cupSignupPoll;
      const drawReady=poll.phase==='draw_ready'||!cupPollStillActive(poll);
      if(!drawReady){try{window.showToast?.('Спочатку заверши реєстрацію')}catch(_e){};return;}
      const confirmed=cupPollConfirmedPlayers(poll);
      if(confirmed.length<2){try{window.showToast?.('Для жеребкування потрібно мінімум 2 учасники')}catch(_e){};return;}
      const clubs=[...new Set((poll.allowedClubs||[]).map(x=>canonicalTeamName(String(x||'').trim())).filter(Boolean))];
      if(!clubs.length){try{window.showToast?.('Для Кубка не вибрано жодної команди')}catch(_e){};return;}
      const players=shuffleCupDrawV1032(confirmed);
      const clubDeck=cupDrawClubDeckV1032(clubs,players.length);
      const participantClubs=Object.fromEntries(players.map((name,i)=>[name,clubDeck[i]||canonicalTeamName(clubFor(name))]));
      const firstRound=makeCupRound(players,1);
      const pairs=(firstRound.matches||[]).map(m=>({home:m.home,away:m.away,homeClub:participantClubs[m.home],awayClub:participantClubs[m.away]}));
      const byes=(firstRound.byes||[]).map(player=>({player,club:participantClubs[player]}));
      const now=Date.now();
      testCompetition={
        id:`cup_${now}`,kind:'cup',title:String(poll.title||'CENTURIA CUP'),
        participants:players,participantClubs,createdAt:now,rounds:[firstRound],champion:null,
        matchLegs:cupLegCount(poll),
        cover:String(poll.cover||''),allowedClubs:clubs,voteSourceId:String(poll.id||''),
        draw:{completedAt:now,pairs,byes}
      };
      cupSignupPoll=null;
      remoteCupVotesV1029={};
      remoteCupVoteRowsV1029=[];
      saveCupSignupPoll();
      saveTestCompetition();
      syncActiveEventFromCompetition();
      cupDrawOpenV1032=false;
      cupDrawAnimationOpenV1033=true;
      resetCupDrawAnimationStateV1033();
      cupDrawAutoAttemptKeyV1034=cupDrawViewKeyV1034();
      route='cup';tab='mine';draw();
      startCupDrawAnimationV1033();
      try{window.showToast?.('Жеребкування проведено 🎲')}catch(_e){}
    },
    createTournamentNow(){
      if(!isArenaAdmin())return;
      const names=[...new Set(tournamentDraftParticipants.map(x=>String(x).trim()).filter(Boolean))];
      if(names.length<2){try{window.showToast?.("Додай мінімум 2 учасників")}catch(_e){};return;}
      const title=String(document.getElementById("arenaTournamentTitleV996")?.value||tournamentDefaultTitle(tournamentDraftKind)).trim()||tournamentDefaultTitle(tournamentDraftKind);
      testCompetition=buildCompetition(tournamentDraftKind,names,title);
      saveTestCompetition();
      syncActiveEventFromCompetition();
      document.querySelector('.arena-modal-v852')?.remove();
      route=tournamentDraftKind;tab="mine";draw();
      try{window.showToast?.("Турнір створено")}catch(_e){}
    },
    finishCurrentTournament(){
      if(!isArenaAdmin()||!testCompetition)return;
      if(!isCompetitionCompleted(testCompetition)){try{window.showToast?.("Турнір ще не завершено")}catch(_e){};return;}
      syncHistoryArchiveFromCompetition(testCompetition);


  const activeBracketMiniWrapV1110=(title,meta,content)=>`<div class="arena-active-event-preview-v879 arena-active-event-cup-preview-v879 arena-active-event-preview-full-v1101 arena-active-event-bracket-preview-v1110"><div class="arena-active-event-preview-title-v879"><span>${esc(title)}</span><span>${esc(meta||'')}</span></div><div class="arena-active-event-bracket-body-v1110">${content||''}</div></div>`;
      testCompetition=null;
      activeEvent=null;
      saveTestCompetition();
      saveActiveEvent();
      route="home";tab="mine";draw();
      try{window.showToast?.("Турнір завершено та збережено в Історії")}catch(_e){}
    },
    openClubDatabase(){
      if(!isArenaAdmin())return;
      loadClubDatabase();
      refreshRemoteClubDatabaseV1009(false).then(()=>this.renderClubDatabase());
      modal(`<div class="arena-clubdb-modal-v945">
        <div class="arena-clubdb-head-v945"><div><small>ADMIN · ARENA</small><h2>БАЗА КЛУБІВ</h2><p>Одна назва + одна емблема. Ця база використовується у всіх полях Arena, де вибирається клуб.</p></div><button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button></div>
        <div class="arena-clubdb-scroll-v945">
          <section class="arena-clubdb-editor-v945" id="arenaClubDbEditorV945">
            <div class="arena-clubdb-section-title-v945">ДОДАТИ / ЗМІНИТИ КЛУБ</div>
            <input id="arenaClubDbOldNameV945" type="hidden" value="">
            <label><span>Назва клубу</span><input id="arenaClubDbNameV945" type="text" list="arenaClubDbNamesV945" placeholder="Наприклад, Manchester United"></label>
            <label><span>Емблема</span><input id="arenaClubDbLogoV945" type="file" accept="image/*" onchange="ArenaV852.previewClubDatabaseLogo(this)"></label>
            <div id="arenaClubDbPreviewV945" class="arena-clubdb-preview-v945"><div class="arena-clubdb-preview-empty-v945">Введи назву або додай емблему</div></div>
            <div class="arena-clubdb-editor-actions-v945"><button type="button" class="arena-primary-v852" onclick="ArenaV852.saveClubDatabaseEntry()">ЗБЕРЕГТИ КЛУБ</button><button type="button" class="arena-secondary-v852" onclick="ArenaV852.resetClubDatabaseEditor()">ОЧИСТИТИ</button></div>
            <datalist id="arenaClubDbNamesV945">${clubDbNames().map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist>
          </section>
          <section class="arena-clubdb-list-section-v945">
            <div class="arena-clubdb-list-head-v945"><div><div class="arena-clubdb-section-title-v945">ЗБЕРЕЖЕНІ КЛУБИ</div><small id="arenaClubDbCountV945">${clubDatabase.length} клубів</small></div><input id="arenaClubDbSearchV945" type="search" placeholder="Пошук клубу" oninput="ArenaV852.filterClubDatabase(this.value)"></div>
            <div id="arenaClubDbListV945" class="arena-clubdb-list-v945"></div>
          </section>
        </div>
        <div class="arena-clubdb-footer-v945"><button type="button" class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button></div>
      </div>`);
      this.renderClubDatabase();
      const nameInput=document.getElementById("arenaClubDbNameV945");
      nameInput?.addEventListener("input",()=>this.refreshClubDatabasePreview());
    },
    renderClubDatabase(filter=""){
      loadClubDatabase();
      const list=document.getElementById("arenaClubDbListV945");
      if(!list)return;
      const q=normalizeTeamName(filter||document.getElementById("arenaClubDbSearchV945")?.value||"");
      const rows=clubDatabase.filter(c=>!q||normalizeTeamName(c.name).includes(q));
      const count=document.getElementById("arenaClubDbCountV945");
      if(count)count.textContent=`${rows.length} з ${clubDatabase.length} клубів`;
      list.innerHTML=rows.length?rows.map(c=>`<article class="arena-clubdb-row-v945">
        <div class="arena-clubdb-logo-v945">${crestBadge(c.name,c.logo)}</div>
        <div class="arena-clubdb-copy-v945"><strong>${esc(c.name)}</strong><small>${c.logo?"Власна емблема":"Автоматична емблема"}</small></div>
        <div class="arena-clubdb-row-actions-v945"><button type="button" onclick="ArenaV852.editClubDatabaseEntry('${jsq(c.name)}')">ЗМІНИТИ</button><button type="button" class="danger" onclick="ArenaV852.deleteClubDatabaseEntry('${jsq(c.name)}')">ВИДАЛИТИ</button></div>
      </article>`).join(""):`<div class="arena-clubdb-empty-v945">Клубів не знайдено</div>`;
      const data=document.getElementById("arenaClubDbNamesV945");
      if(data)data.innerHTML=clubDbNames().map(n=>`<option value="${esc(n)}"></option>`).join("");
    },
    filterClubDatabase(value){this.renderClubDatabase(value)},
    refreshClubDatabasePreview(){
      const name=String(document.getElementById("arenaClubDbNameV945")?.value||"").trim();
      const preview=document.getElementById("arenaClubDbPreviewV945");
      if(!preview)return;
      const fileLogo=String(preview.dataset.logo||"");
      if(!name&&!fileLogo){preview.innerHTML='<div class="arena-clubdb-preview-empty-v945">Введи назву або додай емблему</div>';return;}
      const display=name||"Новий клуб";
      const crest=fileLogo
        ? `<button class="arena-clubdb-crop-trigger-v993" type="button" onclick="ArenaV852.openClubLogoPositionEditor()" aria-label="Налаштувати положення емблеми">${crestBadge(display,fileLogo)}<span>НАЛАШТУВАТИ</span></button>`
        : crestBadge(display,fileLogo);
      preview.innerHTML=`${crest}<div><strong>${esc(display)}</strong><small>${fileLogo?"Натисни на емблему, щоб поправити її положення":"Емблема з бази / автоматична"}</small></div>`;
    },
    async previewClubDatabaseLogo(input){
      if(!isArenaAdmin())return;
      const file=input?.files?.[0];
      if(!file)return;
      const logo=await readClubLogoFile(file);
      const preview=document.getElementById("arenaClubDbPreviewV945");
      if(preview){
        preview.dataset.logo=logo||"";
        preview.dataset.logoSource=logo||"";
      }
      this.refreshClubDatabasePreview();
    },
    resetClubDatabaseEditor(){
      const name=document.getElementById("arenaClubDbNameV945");
      const old=document.getElementById("arenaClubDbOldNameV945");
      const file=document.getElementById("arenaClubDbLogoV945");
      const preview=document.getElementById("arenaClubDbPreviewV945");
      if(name)name.value="";if(old)old.value="";if(file)file.value="";
      if(preview){preview.dataset.logo="";preview.dataset.logoSource="";preview.innerHTML='<div class="arena-clubdb-preview-empty-v945">Введи назву або додай емблему</div>';}
    },
    editClubDatabaseEntry(name){
      if(!isArenaAdmin())return;
      loadClubDatabase();
      const club=clubDbFind(name);if(!club)return;
      const input=document.getElementById("arenaClubDbNameV945");
      const old=document.getElementById("arenaClubDbOldNameV945");
      const file=document.getElementById("arenaClubDbLogoV945");
      const preview=document.getElementById("arenaClubDbPreviewV945");
      if(input)input.value=club.name;if(old)old.value=club.name;if(file)file.value="";
      if(preview){preview.dataset.logo=club.logo||"";preview.dataset.logoSource=club.logo||"";}
      this.refreshClubDatabasePreview();
      try{const target=document.getElementById('arenaClubDbEditorV945'); const scroller=target?.closest('.arena-clubdb-scroll-v945'); if(target&&scroller){const a=target.getBoundingClientRect(),b=scroller.getBoundingClientRect();scroller.scrollTop+=a.top-b.top-12}}catch(_e){}
    },
    openClubLogoPositionEditor(){
      if(!isArenaAdmin())return;
      const preview=document.getElementById("arenaClubDbPreviewV945");
      const src=String(preview?.dataset?.logoSource||preview?.dataset?.logo||"").trim();
      if(!src){try{window.showToast?.("Спочатку додай емблему")}catch(_e){};return;}
      const img=new Image();
      img.onload=()=>{
        clubLogoCropState={src,img,x:0,y:0,zoom:1};
        modal(`<div class="arena-club-logo-crop-modal-v993">
          <div class="arena-club-logo-crop-head-v993">
            <div><small>БАЗА КЛУБІВ · ЕМБЛЕМА</small><h2>РОЗТАШУВАННЯ ЕМБЛЕМИ</h2><p>Перетягни емблему пальцем. Масштаб зміни повзунком.</p></div>
            <button type="button" class="arena-player-close-v934" onclick="this.closest('.arena-modal-v852').remove()">✕</button>
          </div>
          <div class="arena-club-logo-crop-stage-v993">
            <div id="arenaClubLogoCropFrameV993" class="arena-club-logo-crop-frame-v993">
              <img id="arenaClubLogoCropImageV993" src="${esc(src)}" alt="Емблема">
              <span class="arena-club-logo-crop-guide-v993" aria-hidden="true"></span>
            </div>
            <small>КРУГ ПОКАЗУЄ, ЯК ЕМБЛЕМА БУДЕ ВИГЛЯДАТИ НА САЙТІ</small>
          </div>
          <label class="arena-club-logo-crop-zoom-v993"><span>МАСШТАБ <b id="arenaClubLogoCropZoomValueV993">100%</b></span><input id="arenaClubLogoCropZoomV993" type="range" min="60" max="240" step="1" value="100" oninput="ArenaV852.updateClubLogoCropZoom(this.value)"></label>
          <div class="arena-club-logo-crop-actions-v993">
            <button class="arena-secondary-v852" type="button" onclick="ArenaV852.resetClubLogoCrop()">СКИНУТИ</button>
            <button class="arena-primary-v852" type="button" onclick="ArenaV852.applyClubLogoCrop(this)">ЗАСТОСУВАТИ</button>
          </div>
        </div>`);
        requestAnimationFrame(()=>{renderClubLogoCropImageV993();bindClubLogoCropGesturesV993();});
      };
      img.onerror=()=>{try{window.showToast?.("Не вдалося відкрити емблему")}catch(_e){}};
      img.src=src;
    },
    updateClubLogoCropZoom(value){
      if(!clubLogoCropState)return;
      clubLogoCropState.zoom=Math.max(.6,Math.min(2.4,Number(value||100)/100));
      renderClubLogoCropImageV993();
    },
    resetClubLogoCrop(){
      if(!clubLogoCropState)return;
      clubLogoCropState.x=0;clubLogoCropState.y=0;clubLogoCropState.zoom=1;
      const range=document.getElementById("arenaClubLogoCropZoomV993");
      if(range)range.value="100";
      renderClubLogoCropImageV993();
    },
    applyClubLogoCrop(button){
      if(!clubLogoCropState?.img)return;
      const img=clubLogoCropState.img;
      const frame=document.getElementById("arenaClubLogoCropFrameV993");
      const frameSize=Math.max(1,frame?.clientWidth||240);
      const outSize=256;
      const base=Math.min(frameSize/Math.max(1,img.naturalWidth),frameSize/Math.max(1,img.naturalHeight));
      const scale=base*clubLogoCropState.zoom*(outSize/frameSize);
      const drawW=img.naturalWidth*scale;
      const drawH=img.naturalHeight*scale;
      const offX=clubLogoCropState.x*(outSize/frameSize);
      const offY=clubLogoCropState.y*(outSize/frameSize);
      const canvas=document.createElement("canvas");
      canvas.width=outSize;canvas.height=outSize;
      const ctx=canvas.getContext("2d");
      ctx.clearRect(0,0,outSize,outSize);
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(img,(outSize-drawW)/2+offX,(outSize-drawH)/2+offY,drawW,drawH);
      const result=canvas.toDataURL("image/webp",.94);
      const preview=document.getElementById("arenaClubDbPreviewV945");
      if(preview)preview.dataset.logo=result;
      button?.closest(".arena-modal-v852")?.remove();
      clubLogoCropState=null;
      this.refreshClubDatabasePreview();
      try{window.showToast?.("Положення емблеми застосовано")}catch(_e){}
    },
    async saveClubDatabaseEntry(){
      if(!isArenaAdmin())return;
      const name=String(document.getElementById("arenaClubDbNameV945")?.value||"").trim();
      const oldName=String(document.getElementById("arenaClubDbOldNameV945")?.value||"").trim();
      if(!name){try{window.showToast?.("Вкажи назву клубу")}catch(_e){};return;}
      const preview=document.getElementById("arenaClubDbPreviewV945");
      const existing=clubDbFind(oldName||name);
      const logo=String(preview?.dataset?.logo||existing?.logo||"").trim();
      upsertClubDatabase(name,logo,{renameFrom:oldName});
      try{
        const api=clubApiV1009();
        if(api?.upsert)await api.upsert({name,logo,renameFrom:oldName});
        await refreshRemoteClubDatabaseV1009(false);
      }catch(err){
        console.warn("Arena club save remote",err);
        try{window.showToast?.("Локально збережено, але синхронізація емблеми не вдалася")}catch(_e){}
        return;
      }
      this.resetClubDatabaseEditor();
      this.renderClubDatabase();
      draw();
      try{window.showToast?.("Клуб і емблему синхронізовано для всіх акаунтів")}catch(_e){}
    },
    deleteClubDatabaseEntry(name){
      if(!isArenaAdmin())return;
      const safeName=String(name||"").trim();
      if(!safeName)return;
      modal(`<div class="arena-info-modal-v919 arena-clubdb-delete-confirm-v946"><h2>ВИДАЛИТИ КЛУБ?</h2><p><b>${esc(safeName)}</b> буде прибрано з бази клубів.</p><div class="arena-info-actions-v926"><button type="button" class="arena-primary-v852 danger" onclick="ArenaV852.confirmDeleteClubDatabaseEntry('${jsq(safeName)}',this)">ВИДАЛИТИ</button><button type="button" class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">СКАСУВАТИ</button></div></div>`);
    },
    async confirmDeleteClubDatabaseEntry(name,btn){
      if(!isArenaAdmin())return;
      const safeName=String(name||"").trim();
      if(!safeName)return;
      const ok=removeClubDatabaseEntry(safeName);
      try{
        const api=clubApiV1009();
        if(api?.remove)await api.remove(safeName);
        await refreshRemoteClubDatabaseV1009(false);
      }catch(err){
        console.warn("Arena club delete remote",err);
        await refreshRemoteClubDatabaseV1009(false).catch(()=>{});
        this.renderClubDatabase();
        try{window.showToast?.("Не вдалося видалити клуб із спільної бази")}catch(_e){}
        return;
      }
      btn?.closest('.arena-modal-v852')?.remove();
      this.renderClubDatabase();
      draw();
      if(ok){try{window.showToast?.("Клуб видалено зі спільної бази")}catch(_e){}}
    },
    openArenaPlayer(name){
      const p=arenaPlayerByName(name);
      const rec=p.record||{w:0,d:0,l:0};
      const played=(rec.w||0)+(rec.d||0)+(rec.l||0);
      const trophies=arenaTrophiesForV1063(name);
      const canEditTeam=canEditArenaFavoriteTeam(name);
      const isOwnProfile=!!linkedArenaPlayerName() && sameArenaPlayer(linkedArenaPlayerName(),name);
      const teamOptions=clubDbNames();
      const options=[p.favoriteTeam,...teamOptions].filter((v,i,a)=>v&&a.indexOf(v)===i).map(team=>`<option value="${esc(team)}"></option>`).join("");
      modal(`<div class="arena-info-modal-v919 arena-player-modal-v932">
        <div class="arena-player-topbar-v934">
          <div class="arena-player-profile-kicker-v932">ARENA PLAYER PROFILE</div>
          <button class="arena-player-close-v934" type="button" onclick="this.closest('.arena-modal-v852').remove()" aria-label="Закрити">✕</button>
        </div>
        <div class="arena-player-scroll-v934">
          <div class="arena-player-hero-v932">
            ${playerCardThumb(p)}
            <div class="arena-player-hero-copy-v932">
              <div class="arena-player-rank-badge-v932">#${p.rank||"—"}</div>
              <div class="arena-player-name-row-v1066">
                <h2>${esc(p.name)}</h2>
                <div class="arena-player-trophies-total-v1063" aria-label="Усього трофеїв: ${trophies.total}"><span aria-hidden="true">🏆</span><strong>${trophies.total}</strong></div>
              </div>
              <div class="arena-player-details-v932">${p.number?`#${esc(p.number)} • `:""}${esc(p.primaryPos||p.status||"Профіль Arena")}</div>
              <div class="arena-player-mini-pills-v934"><span>Ігор: ${played}</span><span>Перемог: ${rec.w}</span><span>Нічиї: ${rec.d}</span><span>Поразки: ${rec.l}</span></div>
            </div>
          </div>
          <section class="arena-player-profile-section-v932 arena-player-profile-section-v934">
            <div class="arena-player-section-title-v932">СТАТИСТИКА ARENA</div>
            <div class="arena-player-stats-grid-v930 arena-player-stats-grid-v932"><div><small>ПЕРЕМОГИ</small><strong>${rec.w}</strong></div><div><small>НІЧИЇ</small><strong>${rec.d}</strong></div><div><small>ПОРАЗКИ</small><strong>${rec.l}</strong></div><div><small>ІГОР</small><strong>${played}</strong></div><div class="arena-player-trophy-stat-v1063"><small>🏅 ЛІГИ</small><strong>${trophies.league}</strong></div><div class="arena-player-trophy-stat-v1063"><small>🏆 КУБКИ</small><strong>${trophies.cup}</strong></div></div>
          </section>
          <section class="arena-player-profile-section-v932 arena-player-profile-section-v934 arena-player-team-section-v941">
            <div class="arena-player-team-section-head-v941"><div class="arena-player-section-title-v932">УЛЮБЛЕНА КОМАНДА</div>${canEditTeam?`<button class="arena-player-team-edit-btn-v941" type="button" onclick="ArenaV852.toggleArenaTeamEditor(true,'${jsq(name)}')">ЗМІНИТИ</button>`:""}</div>
            <div class="arena-player-team-view-v941" id="arenaPlayerTeamViewV941"><div id="arenaPlayerFavBadgeV934">${crestBadge(p.favoriteTeam,"")}</div><div><strong id="arenaPlayerFavTextV934">${esc(p.favoriteTeam)}</strong><small>${isOwnProfile?"Ти можеш сам змінити назву клубу.":isArenaAdmin()?"ADMIN може змінити назву клубу.":"Улюблена команда гравця"}</small></div></div>
            ${canEditTeam?`<div class="arena-player-team-editor-v941" id="arenaPlayerTeamEditorV941" hidden>
              <label class="arena-player-label-v930 arena-player-label-v932 arena-player-label-v934"><span>Назва улюбленого клубу</span><input id="arenaFavTeamV930" list="arenaFavTeamsV930" type="text" value="${esc(p.favoriteTeam)}" placeholder="Введи або вибери клуб із бази" oninput="ArenaV852.previewArenaTeamName(this.value)"></label>
              <label class="arena-player-label-v930 arena-player-label-v932 arena-player-label-v934"><span>АБО ОБЕРИ КЛУБ ІЗ БАЗИ</span><select id="arenaFavTeamSelectV1002" onchange="ArenaV852.pickArenaTeamName(this.value)"><option value="">— Обрати клуб із бази —</option>${[p.favoriteTeam,...teamOptions].filter((v,i,a)=>v&&a.indexOf(v)===i).map(team=>`<option value="${esc(team)}"${team===p.favoriteTeam?' selected':''}>${esc(team)}</option>`).join("")}</select></label>
              <div class="arena-club-live-preview-v1003" id="arenaFavTeamLivePreviewV1003"><div class="arena-club-live-preview-badge-v1003" id="arenaFavTeamLiveBadgeV1003">${crestBadge(p.favoriteTeam,"")}</div><div class="arena-club-live-preview-copy-v1003"><small>ПОПЕРЕДНІЙ ПЕРЕГЛЯД ЕМБЛЕМИ</small><strong id="arenaFavTeamLiveTextV1003">${esc(p.favoriteTeam)}</strong></div></div>
              <div class="arena-player-team-admin-note-v987"><b>ЕМБЛЕМА — ТІЛЬКИ ЧЕРЕЗ БАЗУ КЛУБІВ</b><small>Тут можна або вписати назву клубу вручну, або вибрати вже доданий клуб із бази. Емблема та назва нижче оновлюються одразу, ще до збереження. Після збереження новий клуб зʼявиться в базі. Емблему до нього може додати тільки ADMIN.</small></div>
              <datalist id="arenaFavTeamsV930">${options}</datalist>
              <div class="arena-player-team-editor-actions-v941"><button class="arena-primary-v852 arena-player-team-save-v1146" type="button" onclick="ArenaV852.saveArenaPlayer('${jsq(name)}')">ЗБЕРЕГТИ</button><button class="arena-secondary-v852 arena-player-team-cancel-v1147" type="button" onclick="ArenaV852.toggleArenaTeamEditor(false,'${jsq(name)}')">СКАСУВАТИ</button></div>
            </div>`:""}
          </section>
        </div>
        <div class="arena-info-actions-v926 arena-player-actions-v932 arena-player-actions-v934 arena-player-actions-view-v941"><button class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button></div>
      </div>`);
    },
    toggleArenaTeamEditor(open,name=""){
      if(!canEditArenaFavoriteTeam(name)) return;
      const editor=document.getElementById('arenaPlayerTeamEditorV941');
      const view=document.getElementById('arenaPlayerTeamViewV941');
      const btn=document.querySelector('.arena-player-team-edit-btn-v941');
      if(!editor) return;
      editor.hidden=!open;
      if(view) view.classList.toggle('is-editing',!!open);
      if(btn) btn.hidden=!!open;
      if(open){ setTimeout(()=>{ try{const scroller=editor.closest('.arena-player-scroll-v934');if(scroller){const a=editor.getBoundingClientRect(),b=scroller.getBoundingClientRect();if(a.bottom>b.bottom-12)scroller.scrollTop+=a.bottom-b.bottom+12;else if(a.top<b.top+12)scroller.scrollTop+=a.top-b.top-12}}catch(_e){} },20); }
    },
    previewArenaTeamName(value){
      const favoriteTeam=String(value||'').trim() || 'Centuria';
      const textEl=document.getElementById('arenaPlayerFavTextV934');
      const badgeEl=document.getElementById('arenaPlayerFavBadgeV934');
      const selectEl=document.getElementById('arenaFavTeamSelectV1002');
      const liveText=document.getElementById('arenaFavTeamLiveTextV1003');
      const liveBadge=document.getElementById('arenaFavTeamLiveBadgeV1003');
      if(textEl) textEl.textContent=favoriteTeam;
      if(badgeEl) badgeEl.innerHTML=crestBadge(favoriteTeam,"");
      if(liveText) liveText.textContent=favoriteTeam;
      if(liveBadge) liveBadge.innerHTML=crestBadge(favoriteTeam,"");
      if(selectEl){
        const exists=[...selectEl.options].some(opt=>opt.value===favoriteTeam);
        selectEl.value=exists?favoriteTeam:"";
      }
    },
    pickArenaTeamName(value){
      const team=String(value||'').trim();
      const input=document.getElementById('arenaFavTeamV930');
      if(input) input.value=team;
      this.previewArenaTeamName(team || input?.value || '');
    },
    previewArenaTeamPhoto(input){
      if(!isArenaAdmin()) return;
      const file=input?.files?.[0];
      const badgeEl=document.getElementById('arenaPlayerFavBadgeV934');
      const textEl=document.getElementById('arenaPlayerFavTextV934');
      const previewWrap=document.getElementById('arenaPlayerUploadPreviewV936');
      const teamName=String(document.getElementById('arenaFavTeamV930')?.value||textEl?.textContent||'Centuria').trim()||'Centuria';
      if(!file){
        if(previewWrap && !badgeEl?.dataset?.photo){ previewWrap.hidden=true; previewWrap.innerHTML=''; }
        return;
      }
      if(!/^image\//.test(file.type)){
        try{window.showToast?.('Оберіть файл зображення')}catch(_e){}
        input.value='';
        return;
      }
      const reader=new FileReader();
      reader.onload=()=>{
        const src=String(reader.result||'');
        if(badgeEl){
          badgeEl.dataset.photo=src;
          badgeEl.dataset.cleared='0';
          badgeEl.innerHTML=crestBadge(teamName,src);
        }
        if(previewWrap){
          previewWrap.hidden=false;
          previewWrap.innerHTML=`<img src="${esc(src)}" alt="${esc(teamName)}"><button class="arena-chip-btn-v936" type="button" onclick="ArenaV852.clearArenaTeamPhoto()">ПРИБРАТИ ФОТО</button>`;
        }
      };
      reader.readAsDataURL(file);
    },
    clearArenaTeamPhoto(){
      if(!isArenaAdmin()) return;
      const badgeEl=document.getElementById('arenaPlayerFavBadgeV934');
      const previewWrap=document.getElementById('arenaPlayerUploadPreviewV936');
      const fileInput=document.getElementById('arenaFavPhotoV936');
      const teamName=String(document.getElementById('arenaFavTeamV930')?.value||document.getElementById('arenaPlayerFavTextV934')?.textContent||'Centuria').trim()||'Centuria';
      if(fileInput) fileInput.value='';
      if(badgeEl){
        badgeEl.dataset.photo='';
        badgeEl.dataset.cleared='1';
        badgeEl.innerHTML=crestBadge(teamName,'');
      }
      if(previewWrap){
        previewWrap.hidden=true;
        previewWrap.innerHTML='';
      }
    },
    async saveArenaPlayer(name){
      if(!canEditArenaFavoriteTeam(name)) return;
      const input=document.getElementById('arenaFavTeamV930');
      const favoriteTeam=String(input?.value||'').trim() || clubFor(name);
      if(!favoriteTeam){
        try{window.showToast?.('Вкажи назву улюбленого клубу')}catch(_e){}
        return;
      }
      try{
        const api=prefsApiV1011();
        if(api?.isReady?.() && api?.save){
          await api.save(name,favoriteTeam);
        }
        // Register only the club name. Existing ADMIN emblem is preserved; players cannot upload/replace it here.
        upsertClubDatabase(favoriteTeam,undefined,{});
        playerArenaPrefs[name]={...(playerArenaPrefs[name]||{}),favoriteTeam,favoriteTeamPhoto:""};
        remotePlayerPrefsV1011[name]={...(remotePlayerPrefsV1011[name]||{}),favoriteTeam,favoriteTeamPhoto:""};
        savePlayerArenaPrefs();
        document.querySelector('.arena-modal-v852')?.remove();
        if(route==='players' || route==='league' || route==='cup' || route==='friendly' || route==='history' || route==='evo') draw();
        refreshRemotePlayerPrefsV1011(false);
        try{window.showToast?.('Улюблений клуб збережено для всіх акаунтів')}catch(_e){}
      }catch(err){
        console.warn('Arena favorite club save',err);
        try{window.showToast?.(err?.message||'Не вдалося зберегти улюблений клуб')}catch(_e){}
      }
    },
    modalMatch(){
      const me=currentArenaPlayerName();
      const opponents=playerPool().filter(n=>n&&n!==me).sort((a,b)=>String(a).localeCompare(String(b), 'uk'));
      const playerOptions=(opponents.length?opponents:["Volkovson","Romeo_130901","Mitsuki_one_love"]);
      const options=playerOptions.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
      const clubs=clubDbNames();
      const clubListOptions=clubs.map(n=>`<option value="${esc(n)}"></option>`).join("");
      const myInitialClub=clubFor(me);

      modal(`<div class="arena-friendly-modal-v971"><button class="arena-modal-close-v971" type="button" aria-label="Закрити" onclick="this.closest('.arena-modal-v852').remove()">✕</button><div class="arena-friendly-head-v971"><small>ARENA · ТОВАРИСЬКИЙ МАТЧ</small><h2>НОВИЙ ВИКЛИК</h2><p>Ти обираєш тільки свою команду і суперника. Свою команду суперник вибере сам уже на своєму акаунті, коли отримає виклик.</p></div><div class="arena-friendly-form-v971"><label class="arena-friendly-field-v971"><span>МІЙ КЛУБ</span><input id="arenaFriendlyMyClubV972" list="arenaFriendlyClubNamesV972" value="${esc(myInitialClub)}" placeholder="Введи або вибери клуб із бази" oninput="ArenaV852.previewFriendlyClub(this.value)"></label><label class="arena-friendly-field-v971"><span>АБО ОБЕРИ МІЙ КЛУБ ІЗ БАЗИ</span><select id="arenaFriendlyMyClubSelectV1002" onchange="ArenaV852.pickFriendlyClub(this.value)"><option value="">— Обрати клуб із бази —</option>${clubs.map(n=>`<option value="${esc(n)}"${n===myInitialClub?' selected':''}>${esc(n)}</option>`).join("")}</select></label><div class="arena-club-live-preview-v1003"><div class="arena-club-live-preview-badge-v1003" id="arenaFriendlyMineBadgeV1003">${crestBadge(myInitialClub,"")}</div><div class="arena-club-live-preview-copy-v1003"><small>МОЯ КОМАНДА</small><strong id="arenaFriendlyMineTextV1003">${esc(myInitialClub)}</strong></div></div><label class="arena-friendly-field-v971"><span>СУПЕРНИК</span><select id="arenaFriendlyOpponentV972">${options}</select></label><div class="arena-friendly-opponent-note-v1008">Команду суперника обирає <b>сам суперник</b> після отримання виклику.</div><datalist id="arenaFriendlyClubNamesV972">${clubListOptions}</datalist></div><div class="arena-friendly-note-v971"><span class="arena-friendly-status-dot-v971"></span><div><b>Виклик прийде на інший акаунт</b><small>У суперника у вкладці «Товарки» з’явиться вхідний виклик. Він вибере свою команду і підтвердить матч.</small></div></div><div class="arena-friendly-actions-v971"><button class="arena-secondary-v852 arena-friendly-cancel-v982" type="button" onclick="this.closest('.arena-modal-v852').remove()">СКАСУВАТИ</button><button class="arena-primary-v852 arena-friendly-submit-v982" type="button" onclick="ArenaV852.sendFriendlyChallenge()">НАДІСЛАТИ ВИКЛИК</button></div></div>`);
      setTimeout(()=>this.previewFriendlyClub(myInitialClub),0);
    },
    previewFriendlyClub(value){
      const team=String(value||'').trim() || 'Centuria';
      const select=document.getElementById('arenaFriendlyMyClubSelectV1002');
      const badge=document.getElementById('arenaFriendlyMineBadgeV1003');
      const textEl=document.getElementById('arenaFriendlyMineTextV1003');
      if(badge) badge.innerHTML=crestBadge(team,'');
      if(textEl) textEl.textContent=team;
      if(select){
        const exists=[...select.options].some(opt=>opt.value===team);
        select.value=exists?team:'';
      }
    },
    pickFriendlyClub(value){
      const team=String(value||'').trim();
      const input=document.getElementById('arenaFriendlyMyClubV972');
      const select=document.getElementById('arenaFriendlyMyClubSelectV1002');
      if(input) input.value=team;
      if(select) select.value=team || '';
      this.previewFriendlyClub(team);
    },
    async sendFriendlyChallenge(){
      const me=currentArenaPlayerName();
      const myClub=String(document.getElementById("arenaFriendlyMyClubV972")?.value||clubFor(me)).trim()||clubFor(me);
      const opponent=String(document.getElementById("arenaFriendlyOpponentV972")?.value||"").trim();
      if(!opponent||opponent===me){try{window.showToast?.("Оберіть суперника")}catch(_e){}return;}

      const api=friendlyApiV1007();
      if(api?.isReady?.() && api?.send){
        try{
          await api.send({recipientPlayer:opponent,senderPlayer:me,senderClub:myClub});
          upsertClubDatabase(myClub,undefined);
          document.querySelector('.arena-modal-v852')?.remove();
          await refreshRemoteFriendliesV1007(false);
          draw();
          try{window.showToast?.("Виклик надіслано — суперник має підтвердити")}catch(_e){}
          return;
        }catch(err){
          console.warn("Friendly challenge send",err);
          try{window.showToast?.(err?.message||"Не вдалося надіслати виклик")}catch(_e){}
          return;
        }
      }

      const opponentClub=clubFor(opponent);
      const match=normalizeFriendlyMatch({id:`F_${Date.now()}`,home:me,away:opponent,homeClub:myClub,awayClub:opponentClub,homeScore:null,awayScore:null,createdAt:new Date().toISOString()});
      if(!match)return;
      friendlyMatches.unshift(match);
      saveFriendlyMatches();
      document.querySelector('.arena-modal-v852')?.remove();
      draw();
      try{window.showToast?.("Локальний виклик створено")}catch(_e){}
    },

    openIncomingFriendly(challengeId){
      const row=(friendlyRemoteRowsV1007||[]).find(r=>String(r.id)===String(challengeId));
      if(!row)return;
      const clubs=clubDbNames();
      const initial=clubFor(row.recipient_player);
      const list=clubs.map(n=>`<option value="${esc(n)}"></option>`).join("");

      modal(`<div class="arena-friendly-modal-v971 arena-friendly-accept-modal-v1007"><button class="arena-modal-close-v971" type="button" aria-label="Закрити" onclick="this.closest('.arena-modal-v852').remove()">✕</button><div class="arena-friendly-head-v971"><small>⚔️ ВХІДНИЙ ВИКЛИК</small><h2>${esc(row.sender_player)} ВИКЛИКАЄ ТЕБЕ</h2><p>Суперник грає за <b>${esc(row.sender_club)}</b>. Можеш підтвердити матч або відмовитися від нього.</p></div><button class="arena-friendly-decline-top-v1013" type="button" onclick="ArenaV852.askDeclineIncomingFriendly('${jsq(row.id)}','${jsq(row.sender_player)}')">✕ ВІДМОВИТИСЯ ВІД МАТЧУ</button><div class="arena-friendly-form-v971"><div class="arena-club-live-preview-v1003"><div class="arena-club-live-preview-badge-v1003">${crestBadge(row.sender_club,"")}</div><div class="arena-club-live-preview-copy-v1003"><small>КОМАНДА СУПЕРНИКА</small><strong>${esc(row.sender_club)}</strong></div></div><label class="arena-friendly-field-v971"><span>МОЯ КОМАНДА</span><input id="arenaIncomingFriendlyClubV1007" list="arenaIncomingFriendlyClubListV1007" value="${esc(initial)}" placeholder="Введи або вибери клуб" oninput="ArenaV852.previewIncomingFriendlyClub(this.value)"></label><label class="arena-friendly-field-v971"><span>АБО ОБЕРИ ІЗ БАЗИ</span><select id="arenaIncomingFriendlyClubSelectV1007" onchange="ArenaV852.pickIncomingFriendlyClub(this.value)"><option value="">— Обрати клуб із бази —</option>${clubs.map(n=>`<option value="${esc(n)}"${n===initial?' selected':''}>${esc(n)}</option>`).join("")}</select></label><div class="arena-club-live-preview-v1003"><div class="arena-club-live-preview-badge-v1003" id="arenaIncomingFriendlyBadgeV1007">${crestBadge(initial,"")}</div><div class="arena-club-live-preview-copy-v1003"><small>МОЯ КОМАНДА</small><strong id="arenaIncomingFriendlyTextV1007">${esc(initial)}</strong></div></div><datalist id="arenaIncomingFriendlyClubListV1007">${list}</datalist></div><div class="arena-friendly-actions-v971 arena-friendly-actions-v1013"><button class="arena-secondary-v852 arena-friendly-decline-bottom-v1013" type="button" onclick="ArenaV852.askDeclineIncomingFriendly('${jsq(row.id)}','${jsq(row.sender_player)}')">ВІДМОВИТИСЯ</button><button class="arena-primary-v852" type="button" onclick="ArenaV852.confirmIncomingFriendly('${jsq(row.id)}')">ПІДТВЕРДИТИ МАТЧ</button></div></div>`);
    },

    previewIncomingFriendlyClub(value){
      const team=String(value||"").trim()||"Centuria";
      const badge=document.getElementById("arenaIncomingFriendlyBadgeV1007");
      const textEl=document.getElementById("arenaIncomingFriendlyTextV1007");
      const select=document.getElementById("arenaIncomingFriendlyClubSelectV1007");
      if(badge)badge.innerHTML=crestBadge(team,"");
      if(textEl)textEl.textContent=team;
      if(select){
        const exists=[...select.options].some(o=>o.value===team);
        select.value=exists?team:"";
      }
    },

    pickIncomingFriendlyClub(value){
      const team=String(value||"").trim();
      const input=document.getElementById("arenaIncomingFriendlyClubV1007");
      if(input)input.value=team;
      this.previewIncomingFriendlyClub(team);
    },

    async confirmIncomingFriendly(challengeId){
      const api=friendlyApiV1007();
      if(!api?.accept)return;
      const club=String(document.getElementById("arenaIncomingFriendlyClubV1007")?.value||"").trim();
      if(!club){try{window.showToast?.("Вибери команду")}catch(_e){}return;}
      try{
        await api.accept(challengeId,club);
        upsertClubDatabase(club,undefined);
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);
        draw();
        try{window.showToast?.("Товариський матч підтверджено")}catch(_e){}
      }catch(err){
        console.warn("Friendly accept",err);
        try{window.showToast?.(err?.message||"Не вдалося підтвердити")}catch(_e){}
      }
    },

    askDeclineIncomingFriendly(challengeId,senderName=""){
      const current=document.querySelector('.arena-modal-v852');
      if(current) current.remove();
      modal(`<div class="arena-info-modal-v919 arena-friendly-decline-confirm-v1013"><h2>ВІДМОВИТИСЯ ВІД МАТЧУ?</h2><p class="arena-muted-v852">${senderName?`Виклик від <b>${esc(senderName)}</b> буде відхилено.`:"Цей товариський виклик буде відхилено."}</p><div class="arena-friendly-decline-confirm-actions-v1013"><button class="arena-secondary-v852" type="button" onclick="this.closest('.arena-modal-v852').remove()">НАЗАД</button><button class="arena-primary-v852 danger arena-friendly-decline-danger-v1013" type="button" onclick="ArenaV852.declineIncomingFriendly('${jsq(challengeId)}')">ТАК, ВІДМОВИТИСЯ</button></div></div>`);
    },

    async declineIncomingFriendly(challengeId){
      const api=friendlyApiV1007();
      if(!api?.decline)return;
      try{
        await api.decline(challengeId);
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);
        draw();
        try{window.showToast?.("Виклик відхилено")}catch(_e){}
      }catch(err){
        try{window.showToast?.(err?.message||"Не вдалося відхилити")}catch(_e){}
      }
    },

    modalFriendlyResult(matchId){
      const m=getFriendlyMatchesCombinedV1007().find(x=>x.id===matchId);if(!m)return;
      const isRemote=String(matchId).startsWith("DB_");
      const row=isRemote?friendlyRemoteRowForMatchV1010(matchId):null;
      const me=friendlyRemoteMeV1007();

      if(isRemote && row){
        if(isArenaAdmin()){
          modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-friendly-result-modal-v972"><h2>ВНЕСТИ РЕЗУЛЬТАТ</h2><p class="arena-muted-v852">ADMIN може зберегти рахунок одразу — підтвердження суперника не потрібне.</p><div class="arena-result-pair-v927"><label>${esc(m.home)}<input id="arenaFriendlyResultHomeV972" type="number" min="0" inputmode="numeric" value="${friendlyIsScored(m)?m.homeScore:(Number(row.proposed_home_score)||0)}"></label><span>:</span><label>${esc(m.away)}<input id="arenaFriendlyResultAwayV972" type="number" min="0" inputmode="numeric" value="${friendlyIsScored(m)?m.awayScore:(Number(row.proposed_away_score)||0)}"></label></div>${row.result_proposal_status==='pending'?`<div class="arena-match-pending-v1067">⏳ ЧЕКАЄ ПІДТВЕРДЖЕННЯ · ${Number(row.proposed_home_score)} : ${Number(row.proposed_away_score)}</div><div class="arena-confirm-actions-v1067"><button class="arena-secondary-v852" onclick="ArenaV852.adminResolveFriendlyV1067('${jsq(m.id)}',false)">ВІДХИЛИТИ</button><button class="arena-primary-v852" onclick="ArenaV852.adminResolveFriendlyV1067('${jsq(m.id)}',true)">ПІДТВЕРДИТИ</button></div>`:''}<button class="arena-primary-v852" onclick="ArenaV852.saveFriendlyResult('${jsq(m.id)}')">ЗБЕРЕГТИ ІНШИЙ РАХУНОК</button></div>`);
          return;
        }

        if(!friendlyIsParticipantV1010(row))return;
        if(row.status!=="accepted"){
          try{window.showToast?.("Спочатку матч має бути підтверджений")}catch(_e){}
          return;
        }

        if(row.result_proposal_status==="pending"){
          const proposed=`${Number(row.proposed_home_score)||0} : ${Number(row.proposed_away_score)||0}`;
          if(row.result_proposed_by===me?.user_id){
            modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-friendly-result-modal-v972 arena-result-waiting-v1010"><h2>РАХУНОК НА ПІДТВЕРДЖЕННІ</h2><p class="arena-muted-v852">Ти запропонував цей результат. Він стане офіційним тільки після підтвердження суперником.</p><div class="arena-result-proposal-score-v1010"><span>${esc(m.home)}</span><strong>${proposed}</strong><span>${esc(m.away)}</span></div><button class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button></div>`);
            return;
          }

          modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-friendly-result-modal-v972 arena-result-confirm-v1010"><h2>ПІДТВЕРДИТИ РЕЗУЛЬТАТ?</h2><p class="arena-muted-v852">Суперник запропонував рахунок. Якщо він правильний — підтвердь. Після цього результат одразу стане офіційним.</p><div class="arena-result-proposal-score-v1010"><span>${esc(m.home)}</span><strong>${proposed}</strong><span>${esc(m.away)}</span></div><div class="arena-result-confirm-actions-v1010"><button class="arena-secondary-v852" onclick="ArenaV852.rejectFriendlyResult('${jsq(m.id)}')">ВІДХИЛИТИ</button><button class="arena-primary-v852" onclick="ArenaV852.confirmFriendlyResult('${jsq(m.id)}')">ПІДТВЕРДИТИ</button></div></div>`);
          return;
        }

        modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-friendly-result-modal-v972"><h2>ЗАПРОПОНУВАТИ РЕЗУЛЬТАТ</h2><p class="arena-muted-v852">Введи рахунок і надішли супернику. Результат зарахується тільки після його підтвердження.${row.result_proposal_status==="rejected"?" Попередню пропозицію було відхилено.":""}</p><div class="arena-result-pair-v927"><label>${esc(m.home)}<input id="arenaFriendlyResultHomeV972" type="number" min="0" inputmode="numeric" value="0"></label><span>:</span><label>${esc(m.away)}<input id="arenaFriendlyResultAwayV972" type="number" min="0" inputmode="numeric" value="0"></label></div><button class="arena-primary-v852" onclick="ArenaV852.proposeFriendlyResult('${jsq(m.id)}')">НАДІСЛАТИ НА ПІДТВЕРДЖЕННЯ</button></div>`);
        return;
      }

      if(!isArenaAdmin()){
        try{window.showToast?.("Для цього старого локального матчу результат може внести тільки ADMIN")}catch(_e){}
        return;
      }
      modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-friendly-result-modal-v972"><h2>РЕЗУЛЬТАТ ТОВАРКИ</h2><div class="arena-result-pair-v927"><label>${esc(m.home)}<input id="arenaFriendlyResultHomeV972" type="number" min="0" inputmode="numeric" value="${friendlyIsScored(m)?m.homeScore:0}"></label><span>:</span><label>${esc(m.away)}<input id="arenaFriendlyResultAwayV972" type="number" min="0" inputmode="numeric" value="${friendlyIsScored(m)?m.awayScore:0}"></label></div><button class="arena-primary-v852" onclick="ArenaV852.saveFriendlyResult('${jsq(m.id)}')">ЗБЕРЕГТИ РЕЗУЛЬТАТ</button></div>`)
    },

    async proposeFriendlyResult(matchId){
      const api=friendlyApiV1007();
      const row=friendlyRemoteRowForMatchV1010(matchId);if(!row||!api?.proposeResult)return;
      const hs=Number(document.getElementById("arenaFriendlyResultHomeV972")?.value);
      const as=Number(document.getElementById("arenaFriendlyResultAwayV972")?.value);
      if(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0){try{window.showToast?.("Введи коректний рахунок")}catch(_e){}return;}
      try{
        await api.proposeResult(String(matchId).slice(3),hs,as);
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);
        draw();
        try{window.showToast?.("Рахунок надіслано супернику на підтвердження")}catch(_e){}
      }catch(err){
        const msg=String(err?.message||"");
        try{window.showToast?.(msg.includes("opponent_proposal_waiting")?"Суперник уже запропонував рахунок — спочатку підтвердь або відхили його":(msg||"Не вдалося запропонувати результат"))}catch(_e){}
      }
    },

    async confirmFriendlyResult(matchId){
      const api=friendlyApiV1007();if(!api?.confirmResult)return;
      try{
        await api.confirmResult(String(matchId).replace(/^DB_/,""));
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);
        draw();
        try{window.showToast?.("Результат підтверджено і зараховано")}catch(_e){}
      }catch(err){
        try{window.showToast?.(err?.message||"Не вдалося підтвердити результат")}catch(_e){}
      }
    },

    async rejectFriendlyResult(matchId){
      const api=friendlyApiV1007();if(!api?.rejectResult)return;
      try{
        await api.rejectResult(String(matchId).replace(/^DB_/,""));
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);
        draw();
        try{window.showToast?.("Запропонований рахунок відхилено")}catch(_e){}
      }catch(err){
        try{window.showToast?.(err?.message||"Не вдалося відхилити результат")}catch(_e){}
      }
    },

    async saveFriendlyResult(matchId){
      const m=getFriendlyMatchesCombinedV1007().find(x=>x.id===matchId);if(!m)return;
      const hs=Number(document.getElementById("arenaFriendlyResultHomeV972")?.value);
      const as=Number(document.getElementById("arenaFriendlyResultAwayV972")?.value);
      if(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0){try{window.showToast?.("Введіть коректний рахунок")}catch(_e){}return;}

      if(String(matchId).startsWith("DB_")){
        if(!isArenaAdmin()){try{window.showToast?.("Звичайний гравець має запропонувати результат супернику")}catch(_e){}return;}
        const api=friendlyApiV1007();
        try{
          await api.saveResult(String(matchId).slice(3),hs,as);
          upsertClubDatabase(m.homeClub,undefined);
          upsertClubDatabase(m.awayClub,undefined);
          document.querySelector('.arena-modal-v852')?.remove();
          await refreshRemoteFriendliesV1007(false);
          draw();
          try{window.showToast?.("ADMIN зберіг результат одразу")}catch(_e){}
        }catch(err){
          try{window.showToast?.(err?.message||"Не вдалося зберегти результат")}catch(_e){}
        }
        return;
      }

      const local=loadFriendlyMatches().find(x=>x.id===matchId);if(!local)return;
      local.homeScore=hs;local.awayScore=as;
      upsertClubDatabase(local.homeClub,undefined);
      upsertClubDatabase(local.awayClub,undefined);
      saveFriendlyMatches();
      document.querySelector('.arena-modal-v852')?.remove();
      draw();
      try{window.showToast?.("Результат збережено")}catch(_e){}
    },

    async adminResolveFriendlyV1067(matchId,accept){
      if(!isArenaAdmin())return;
      try{
        const api=friendlyApiV1007();
        await api.adminResolveResult(String(matchId).replace(/^DB_/,''),accept);
        document.querySelector('.arena-modal-v852')?.remove();
        await refreshRemoteFriendliesV1007(false);draw();
        window.showToast?.(accept?'Результат підтверджено ADMIN':'Результат відхилено ADMIN');
      }catch(err){window.showToast?.(err.message||'Не вдалося змінити результат');}
    },
    modalResult(matchId="",mode=""){
      const match=allMatches().find(m=>m.id===matchId);
      if(!match||!canPlayerActV1067(match))return;
      const cup=testCompetition?.kind==='cup';
      const legs=cup?cupLegCount(testCompetition):1;
      const isAdmin=isArenaAdmin();
      if(cup&&cupMatchFinished(match,testCompetition)&&!isAdmin)return;
      const proposal=matchProposalV1067(match);
      if(proposal&&mode!=='override'){
        const proposedScore=`${proposal.homeScore} : ${proposal.awayScore}`;
        const game=Number(proposal.leg)===2?'МАТЧ 2':'МАТЧ 1';
        const waiting=!canConfirmMatchV1067(match);
        modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-result-confirm-v1067 arena-result-confirm-v1068"><h2>${waiting?'⏳ ЧЕКАЄ ПІДТВЕРДЖЕННЯ':'ПІДТВЕРДИТИ РАХУНОК?'}</h2><p class="arena-muted-v852">${esc(game)} · ${esc(proposal.proposedByName||'Гравець')} запропонував результат.${waiting?' Суперник або ADMIN має підтвердити.':' Перевір рахунок перед підтвердженням.'}</p><div class="arena-result-proposal-score-v1010 arena-confirm-score-v1068"><span class="arena-confirm-team-v1068">${esc(Number(proposal.leg)===2?match.away:match.home)}</span><strong class="arena-confirm-score-nums-v1068" aria-label="${esc(proposedScore)}"><span>${esc(proposal.homeScore)}</span><i aria-hidden="true">:</i><span>${esc(proposal.awayScore)}</span></strong><span class="arena-confirm-team-v1068">${esc(Number(proposal.leg)===2?match.home:match.away)}</span></div>${proposal.tiebreakWinner?`<p>Пенальті: ${esc(proposal.tiebreakWinner)}</p>`:''}${waiting?`<button class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">ЗАКРИТИ</button>`:`<div class="arena-confirm-actions-v1067"><button type="button" class="arena-secondary-v852 arena-confirm-decline-v1068" onclick="ArenaV852.resolveCompetitionResultV1067('${jsq(match.id)}',false)">ВІДХИЛИТИ</button><button type="button" class="arena-primary-v852 arena-confirm-approve-v1068" onclick="ArenaV852.resolveCompetitionResultV1067('${jsq(match.id)}',true)">ПІДТВЕРДИТИ</button></div>`}${isAdmin?`<button type="button" class="arena-secondary-v852 arena-confirm-admin-override-v1068" onclick="this.closest('.arena-modal-v852').remove();ArenaV852.modalResult('${jsq(match.id)}','override')">ВНЕСТИ ІНШИЙ РАХУНОК ЯК ADMIN</button>`:''}</div>`);
        return;
      }
      if(cup&&cupMatchFinished(match,testCompetition)&&!isAdmin)return;
      const leg=legs===2&&isScored(match)&&!cupLeg2Scored(match)?2:1;
      const first=isAdmin||leg===1?`<div class="arena-cup-game-v1061"><h3>${legs===2?'МАТЧ 1 · ВДОМА':'РАХУНОК МАТЧУ'}</h3><div class="arena-result-pair-v927"><label>${esc(match.home)}<input id="arenaResultHomeV927" type="number" min="0" max="99" inputmode="numeric" value="${isScored(match)?match.homeScore:''}" placeholder="0"></label><span>:</span><label>${esc(match.away)}<input id="arenaResultAwayV927" type="number" min="0" max="99" inputmode="numeric" value="${isScored(match)?match.awayScore:''}" placeholder="0"></label></div></div>`:'';
      const playoff=testCompetition?.kind==='league'&&match.id.startsWith('LP_');
      const second=legs===2&&(isAdmin||leg===2)?`<div class="arena-cup-game-v1061"><h3>МАТЧ 2 · ВДОМА У СУПЕРНИКА</h3><div class="arena-result-pair-v927"><label>${esc(match.away)}<input id="arenaResultLeg2HomeV1061" type="number" min="0" max="99" inputmode="numeric" value="${cupLeg2Scored(match)?match.leg2HomeScore:''}" placeholder="—"></label><span>:</span><label>${esc(match.home)}<input id="arenaResultLeg2AwayV1061" type="number" min="0" max="99" inputmode="numeric" value="${cupLeg2Scored(match)?match.leg2AwayScore:''}" placeholder="—"></label></div>${isAdmin?'<small>Можна зберегти лише перший матч. Другий результат внесеш пізніше.</small>':''}</div><label class="arena-cup-tiebreak-v1061"><span>ЗА РІВНОЇ СУМИ ГОЛІВ — ПЕРЕМОЖЕЦЬ ЗА ПЕНАЛЬТІ</span><select id="arenaCupTiebreakV1061"><option value="">Обери за потреби</option><option value="home" ${match.tiebreakWinner===match.home?'selected':''}>${esc(match.home)}</option><option value="away" ${match.tiebreakWinner===match.away?'selected':''}>${esc(match.away)}</option></select></label>`:'';
      const playoffTiebreak=playoff?`<label class="arena-cup-tiebreak-v1061"><span>ЗА НІЧИЄЇ — ХТО ПЕРЕМІГ ЗА ПЕНАЛЬТІ</span><select id="arenaCupTiebreakV1061"><option value="">Обери переможця, якщо нічия</option><option value="home" ${sameArenaPlayer(match.tiebreakWinner,match.home)?'selected':''}>${esc(match.home)}</option><option value="away" ${sameArenaPlayer(match.tiebreakWinner,match.away)?'selected':''}>${esc(match.away)}</option></select></label>`:'';
      modal(`<div class="arena-info-modal-v919 arena-result-modal-v927 arena-cup-result-modal-v1061"><h2>${isAdmin?'ВНЕСТИ РЕЗУЛЬТАТ':'ЗАПРОПОНУВАТИ РЕЗУЛЬТАТ'}</h2><p class="arena-muted-v852">${isAdmin?'ADMIN зберігає одразу без підтвердження.':`Твій результат отримає суперник. Підтвердити може також ADMIN.`}</p>${first}${second}${playoffTiebreak}<button class="arena-primary-v852" onclick="ArenaV852.${isAdmin?'saveAdminResult':'proposeCompetitionResultV1067'}('${jsq(match.id)}')">${isAdmin?'ЗБЕРЕГТИ РЕЗУЛЬТАТ':'НАДІСЛАТИ НА ПІДТВЕРДЖЕННЯ'}</button></div>`);
    },
    async competitionMatchActionV1067(payload){
      const api=arenaStateApiV1012();
      if(!api?.isReady?.()||!api?.matchAction)throw new Error('Немає зв’язку із Supabase або функція ще не опублікована');
      clearTimeout(remoteArenaStateSaveTimerV1012);
      await remoteArenaStateSaveInFlightV1061;
      const row=await api.matchAction({competitionId:testCompetition?.id,...payload});
      if(!row||row.state_key!=='global')throw new Error('Сервер не підтвердив зміну');
      applyRemoteArenaStateV1012(row,false);
      return row;
    },
    async proposeCompetitionResultV1067(matchId){
      const match=allMatches().find(m=>m.id===matchId);
      if(!match||!canPlayerActV1067(match))return;
      const cup=testCompetition?.kind==='cup';
      const leg=cup&&cupLegCount(testCompetition)===2&&isScored(match)?2:1;
      const read=id=>{const raw=document.getElementById(id)?.value?.trim?.()??'';const num=Number(raw);return raw!==''&&Number.isSafeInteger(num)&&num>=0&&num<=99?num:null;};
      const hs=read(leg===2?'arenaResultLeg2HomeV1061':'arenaResultHomeV927');
      const as=read(leg===2?'arenaResultLeg2AwayV1061':'arenaResultAwayV927');
      if(hs==null||as==null){window.showToast?.('Введи обидва коректні рахунки');return;}
      const pick=document.getElementById('arenaCupTiebreakV1061')?.value;
      const tiebreak=pick==='home'?match.home:(pick==='away'?match.away:null);
      if(match.id.startsWith('LP_')&&hs===as&&!tiebreak){window.showToast?.('За нічиєї в плей-оф обери переможця за пенальті');return;}
      try{
        await this.competitionMatchActionV1067({action:'propose',matchId,leg,homeScore:hs,awayScore:as,tiebreakWinner:tiebreak});
        document.querySelector('.arena-modal-v852')?.remove();draw();
        window.showToast?.('Результат надіслано супернику й ADMIN на підтвердження');
      }catch(err){window.showToast?.(err.message||'Результат не надіслано');}
    },
    async resolveCompetitionResultV1067(matchId,accept){
      const match=allMatches().find(m=>m.id===matchId);
      if(!match||!canConfirmMatchV1067(match))return;
      try{
        await this.competitionMatchActionV1067({action:accept?'confirm':'reject',matchId,leg:Number(match.proposal.leg)||1});
        document.querySelector('.arena-modal-v852')?.remove();draw();
        window.showToast?.(accept?'Результат підтверджено та зараховано':'Результат відхилено. Гравець може подати новий');
      }catch(err){window.showToast?.(err.message||'Не вдалося підтвердити результат');}
    },
    async saveAdminResult(matchId){
      if(!isArenaAdmin())return;
      const match=allMatches().find(m=>m.id===matchId);if(!match)return;
      const read=id=>{const raw=document.getElementById(id)?.value?.trim?.()??'';if(raw==='')return null;const value=Number(raw);return Number.isSafeInteger(value)&&value>=0&&value<=99?value:NaN;};
      const hs=read('arenaResultHomeV927'),as=read('arenaResultAwayV927');
      if(hs===null||as===null||!Number.isInteger(hs)||!Number.isInteger(as)){window.showToast?.('Введи рахунок першого матчу');return;}
      const cup=testCompetition?.kind==='cup',legs=cup?cupLegCount(testCompetition):1;
      if(cup&&legs===1&&hs===as){window.showToast?.('У Кубку з одним матчем не може бути нічиєї');return;}
      const h2=legs===2?read('arenaResultLeg2HomeV1061'):null;
      const a2=legs===2?read('arenaResultLeg2AwayV1061'):null;
      if(legs===2&&(Number.isNaN(h2)||Number.isNaN(a2)||((h2===null)!==(a2===null)))){window.showToast?.('Введи обидва рахунки другого матчу або залиш обидва порожніми');return;}
      const pick=document.getElementById('arenaCupTiebreakV1061')?.value;
      const winner=pick==='home'?match.home:(pick==='away'?match.away:null);
      if(match.id.startsWith('LP_')&&hs===as&&!winner){window.showToast?.('За нічиєї у плей-оф вкажи переможця за пенальті');return;}
      if(legs===2&&h2!==null&&hs+a2===as+h2&&!winner){window.showToast?.('Рівна сума голів. Обери переможця за пенальті');return;}
      if(legs===2&&h2===null&&cupLeg2Scored(match)){window.showToast?.('Другий матч уже збережений; не залишай його порожнім');return;}
      try{
        // Do not reset a pending second-leg proposal by pointlessly rewriting leg one.
        if(!isScored(match)||match.homeScore!==hs||match.awayScore!==as||legs===1){
          await this.competitionMatchActionV1067({action:'admin_set',matchId,leg:1,homeScore:hs,awayScore:as,tiebreakWinner:match.id.startsWith('LP_')?winner:null});
        }
        if(legs===2&&h2!==null){
          await this.competitionMatchActionV1067({action:'admin_set',matchId,leg:2,homeScore:h2,awayScore:a2,tiebreakWinner:winner});
        }
        document.querySelector('.arena-modal-v852')?.remove();draw();
        window.showToast?.(legs===2&&h2===null?'Перший матч зараховано':'ADMIN зберіг результат без підтвердження');
      }catch(err){window.showToast?.(err.message||'Не вдалося зберегти результат');}
    },
    askClearKind(kind){
      if(!isArenaAdmin()||!['cup','league'].includes(kind))return;
      const label=kind==='cup'?'КУБОК':'ЛІГУ';
      modal(`<div class="arena-info-modal-v919 arena-delete-kind-v1061"><h2>ВИДАЛИТИ ${label}?</h2><p>Будуть видалені <b>всі ${kind==='cup'?'кубки':'ліги'}</b>: активний турнір, архів, результати, пов’язані записи та їхній внесок у рейтинг EVO. Інший тип турнірів і товариські матчі залишаться.</p><p class="arena-muted-v852">Увага: Supabase спільна з основною Centuria — це видалення відбудеться для всіх користувачів і обох сайтів. Дію не можна скасувати.</p><label>Для підтвердження введи <b>ВИДАЛИТИ</b><input id="arenaDeleteKindConfirmV1061" autocomplete="off" placeholder="ВИДАЛИТИ"></label><div class="arena-info-actions-v926"><button type="button" class="arena-secondary-v852" onclick="this.closest('.arena-modal-v852').remove()">СКАСУВАТИ</button><button type="button" class="arena-primary-v852 danger" onclick="ArenaV852.confirmClearKind('${kind}',this)">ВИДАЛИТИ ${label}</button></div></div>`);
    },
    async confirmClearKind(kind,button){
      if(!isArenaAdmin()||!['cup','league'].includes(kind))return;
      const input=document.getElementById('arenaDeleteKindConfirmV1061');
      if(String(input?.value||'').trim().toUpperCase()!=='ВИДАЛИТИ'){
        try{window.showToast?.('Для підтвердження введи ВИДАЛИТИ')}catch(_e){}return;
      }
      const api=arenaStateApiV1012();
      if(!api?.isReady?.()||!api?.canWrite?.()||!api?.clearKind){
        try{window.showToast?.('Немає зв’язку із Supabase. Дані не видалені.')}catch(_e){}return;
      }
      if(button){button.disabled=true;button.textContent='ВИДАЛЕННЯ…';}
      try{
        clearTimeout(remoteArenaStateSaveTimerV1012);
        await remoteArenaStateSaveInFlightV1061;
        const updated=await api.clearKind(kind);
        if(!updated||updated.state_key!=='global')throw new Error('Сервер не підтвердив видалення');
        if(kind==='cup'){
          stopCupDrawAnimationV1033();
          cupDrawAnimationOpenV1033=false;
          document.getElementById('arenaCupDrawAnimModalV1033')?.remove();
          remoteCupVotesV1029={};remoteCupVoteRowsV1029=[];
          cupDrawAutoAttemptKeyV1034='';
        }
        applyRemoteArenaStateV1012(updated,false);
        if(kind==='cup'){
          cupSignupPoll=null;
          try{localStorage.removeItem(CUP_SIGNUP_POLL_KEY);}catch(_e){}
        }
        route='home';tab='mine';
        document.querySelector('.arena-delete-kind-v1061')?.closest('.arena-modal-v852')?.remove();
        draw();
        try{window.showToast?.(kind==='cup'?'Кубки та їхній внесок в EVO видалено':'Ліги та їхній внесок в EVO видалено')}catch(_e){}
      }catch(err){
        console.warn('Arena clear competition kind',err);
        try{window.showToast?.('Видалення не виконано: '+String(err?.message||'Помилка Supabase'))}catch(_e){}
      }finally{if(button){button.disabled=false;button.textContent=kind==='cup'?'ВИДАЛИТИ КУБОК':'ВИДАЛИТИ ЛІГУ';}}
    }

  };
  draw();
})();


/* ==========================================================
   v9.37 — Arena player modal keyboard helper (iPhone)
   ========================================================== */
(function(){
  const root=document.documentElement;
  const body=document.body;
  const vv=window.visualViewport;
  let activeInput=null;
  let baselineHeight=Math.max(vv?.height||0, window.innerHeight||0, document.documentElement.clientHeight||0);
  let pollTimer=0;
  let raf=0;

  function isArenaTypingField(el){
    return !!(el && el.closest && el.closest('.arena-modal-v852') && el.matches && el.matches('input[type="text"], input[type="search"], input[type="number"], input[type="tel"], input[type="email"], textarea, select'));
  }
  function currentViewportHeight(){
    return vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 0);
  }
  function currentViewportTop(){
    return vv ? vv.offsetTop : 0;
  }
  function refreshBaseline(){
    const h=currentViewportHeight();
    if(!body.classList.contains('arena-modal-keyboard-open') && h>baselineHeight-24){
      baselineHeight=Math.max(baselineHeight,h);
    }
  }
  function keyboardVisible(){
    if(!activeInput || !document.body.contains(activeInput)) return false;
    if(document.activeElement!==activeInput) return false;
    const lost=Math.max(0, baselineHeight-currentViewportHeight());
    return lost>110;
  }
  function setVars(){
    const current=currentViewportHeight();
    const lost=Math.max(0, baselineHeight-current);
    root.style.setProperty('--arena-modal-vv-height', Math.max(260,Math.round(current))+'px');
    root.style.setProperty('--arena-modal-vv-top', Math.max(0,Math.round(currentViewportTop()))+'px');
    root.style.setProperty('--arena-modal-keyboard-space', Math.max(180, Math.round(lost + 72))+'px');
  }
  function clearState(){
    body.classList.remove('arena-modal-keyboard-open');
    root.style.removeProperty('--arena-modal-vv-height');
    root.style.removeProperty('--arena-modal-vv-top');
    root.style.removeProperty('--arena-modal-keyboard-space');
  }
  function revealInput(){
    const input=activeInput;
    if(!input || !document.body.contains(input)) return;
    const scroller=input.closest('.arena-clubdb-scroll-v945') || input.closest('.arena-player-scroll-v934') || input.closest('.arena-modal-v852 > div') || input.closest('.arena-modal-v852');
    if(!scroller) return;
    // Do not call scrollIntoView here: on iOS it pans the document/visual viewport
    // as well as the Arena profile's own scroll container. Only change scroller.scrollTop.
    requestAnimationFrame(()=>{
      const ir=input.getBoundingClientRect();
      const sr=scroller.getBoundingClientRect();
      const current=currentViewportHeight();
      const visibleViewportBottom=currentViewportTop() + current;
      const topLimit=sr.top + 18;
      const bottomLimit=Math.min(sr.bottom, visibleViewportBottom - 14);
      if(ir.bottom>bottomLimit){
        const delta=ir.bottom - bottomLimit + 12;
        try{ scroller.scrollTop += delta; }catch(_e){}
      }else if(ir.top<topLimit){
        const delta=topLimit - ir.top + 8;
        try{ scroller.scrollTop -= delta; }catch(_e){}
      }
    });
  }
  function sync(){
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      raf=0;
      if(!activeInput || !document.body.contains(activeInput) || !activeInput.closest('.arena-modal-v852')){
        clearState();
        return;
      }
      if(!keyboardVisible()){
        clearState();
        refreshBaseline();
        return;
      }
      setVars();
      body.classList.add('arena-modal-keyboard-open');
      setTimeout(revealInput,20);
      setTimeout(revealInput,140);
      setTimeout(revealInput,320);
    });
  }
  function startPolling(){
    if(pollTimer) return;
    pollTimer=window.setInterval(()=>{
      if(activeInput || body.classList.contains('arena-modal-keyboard-open')) sync();
      else refreshBaseline();
    },120);
  }

  document.addEventListener('focusin',e=>{
    if(!isArenaTypingField(e.target)) return;
    activeInput=e.target;
    refreshBaseline();
    startPolling();
    sync();
    setTimeout(sync,50);
    setTimeout(sync,180);
    setTimeout(sync,420);
  });

  document.addEventListener('focusout',e=>{
    if(e.target!==activeInput) return;
    setTimeout(()=>{
      if(!isArenaTypingField(document.activeElement)){
        activeInput=null;
        clearState();
        setTimeout(refreshBaseline,80);
      }
    },120);
  });

  if(vv){
    vv.addEventListener('resize',sync,{passive:true});
    vv.addEventListener('scroll',sync,{passive:true});
  }
  window.addEventListener('resize',()=>{ if(!activeInput) refreshBaseline(); sync(); },{passive:true});
  document.addEventListener('click',()=>{ if(!document.querySelector('.arena-modal-v852')){ activeInput=null; clearState(); } },{passive:true});
})();


/* ==========================================================
   v9.40 — Arena modal hides bottom nav while open
   ========================================================== */
(function(){
  const body=document.body;
  if(!body) return;
  const syncModalState=()=>{
    const hasModal=!!document.querySelector('.arena-modal-v852');
    body.classList.toggle('arena-modal-open-v940', hasModal);
    if(!hasModal){
      body.classList.remove('arena-modal-keyboard-open');
      document.documentElement.style.removeProperty('--arena-modal-vv-height');
      document.documentElement.style.removeProperty('--arena-modal-vv-top');
      document.documentElement.style.removeProperty('--arena-modal-keyboard-space');
    }
  };
  syncModalState();
  const obs=new MutationObserver(()=>syncModalState());
  obs.observe(body,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(syncModalState,0),true);
  window.addEventListener('pageshow',syncModalState,{passive:true});
})();


/* ==========================================================
   v9.43 — Arena button press animation helper
   ========================================================== */
(function(){
  const selector = '#bottomNav.bottom-nav button, #screen-arena button, .arena-modal-v852 button';
  const add=(el)=>{ if(el && el.matches && el.matches(selector) && !el.disabled){ el.classList.add('ca-btn-pressing-v943'); } };
  const remove=(el)=>{ if(el && el.classList){ el.classList.remove('ca-btn-pressing-v943'); } };
  document.addEventListener('pointerdown', e=>{
    const btn=e.target && e.target.closest ? e.target.closest(selector) : null;
    if(btn) add(btn);
  }, true);
  ['pointerup','pointercancel','dragstart'].forEach(type=>{
    document.addEventListener(type, e=>{
      const btn=e.target && e.target.closest ? e.target.closest(selector) : null;
      if(btn) remove(btn);
      document.querySelectorAll('.ca-btn-pressing-v943').forEach(remove);
    }, true);
  });
  document.addEventListener('click', ()=>{
    setTimeout(()=>document.querySelectorAll('.ca-btn-pressing-v943').forEach(remove), 60);
  }, true);
})();








/* v11.41 — delegated Arena press animation: works for buttons created
   after render, in detached modals, and for the active-event card. */
(function(){
  const selector = '#screen-arena button, #screen-arena [role="button"], #screen-arena a[href], #screen-arena input[type="button"], #screen-arena input[type="submit"], #screen-arena input[type="reset"], .arena-modal-v852 button, .arena-modal-v852 [role="button"], .arena-modal-v852 a[href], .arena-modal-v852 input[type="button"], .arena-modal-v852 input[type="submit"], .arena-modal-v852 input[type="reset"]';
  let pressed=null, downX=0, downY=0;
  const find=(target)=>{
    const element=target?.closest?.(selector);
    if(!element || element.matches(':disabled,[aria-disabled="true"]') || element.closest('[inert]')) return null;
    return element;
  };
  const release=()=>{
    pressed?.classList.remove('ca-arena-pressed-v1141');
    pressed=null;
  };
  document.addEventListener('pointerdown',e=>{
    release();
    if(e.button!==undefined && e.button!==0) return;
    const element=find(e.target);
    if(!element) return;
    pressed=element;
    downX=e.clientX;
    downY=e.clientY;
    element.classList.add('ca-arena-pressed-v1141');
  },{capture:true,passive:true});
  document.addEventListener('pointermove',e=>{
    if(pressed && Math.hypot(e.clientX-downX,e.clientY-downY)>12) release();
  },{capture:true,passive:true});
  for(const eventName of ['pointerup','pointercancel','dragstart']){
    document.addEventListener(eventName,release,{capture:true,passive:true});
  }
  document.addEventListener('keydown',e=>{
    if(e.repeat || (e.key!=='Enter' && e.key!==' ')) return;
    const element=find(e.target);
    if(element){release();pressed=element;element.classList.add('ca-arena-pressed-v1141');}
  },true);
  document.addEventListener('keyup',e=>{
    if(e.key==='Enter'||e.key===' ') release();
  },true);
  document.addEventListener('click',e=>{
    const element=find(e.target);
    if(!element) return;
    release();
    element.classList.add('ca-arena-tap-v1141');
    setTimeout(()=>element.classList.remove('ca-arena-tap-v1141'),170);
  },true);
  window.addEventListener('blur',release,{passive:true});
})();
