/* Centuria Analytics v13.50 — archive uses current standings columns */
(()=>{
  'use strict';

  const TABLE='centuria_analytics_leagues';
  const ROOT_ID='caAnalyticsRootV1317';
  const HOME_ROOT_ID='homeAnalyticsStandingsV1320';
  const MODAL_ID='caAnalyticsModalV1317';
  const TABLE_MODAL_ID='caAnalyticsTableModalV1319';
  const HISTORY_MODAL_ID='caAnalyticsHistoryModalV1319';
  const MATCH_STATS_MODAL_ID='caAnalyticsMatchStatsModalV1327';
  const MATCH_STATS_TABLE='centuria_analytics_match_statistics';
  const CUP_TABLE='centuria_analytics_cups';
  const CUP_MODAL_ID='caAnalyticsCupModalV1336';
  const RESULT_MODAL_ID='caAnalyticsResultModalV1336';
  const TEAM_NOTE_TABLE='centuria_analytics_team_notes';
  const TEAM_NOTE_MODAL_ID='caAnalyticsTeamNoteModalV1338';
  const TEAM_HISTORY_SEASON_MODAL_ID='caTeamHistorySeasonModalV1349';
  const SEASON_GOALS_KEY='centuria-athletics-season-goals';
  const TEAM_HISTORY_KEY='centuria-athletics-team-history';
  let leagues=[];
  let cups=[];
  let activeId='';
  let activeCupId='';
  let cupMatches=[];
  let cupsError='';
  let loading=false;
  let requestNo=0;
  let homeRequestNo=0;
  let seasonGoalsRecord=null;
  let seasonGoalsLoaded=false;
  let seasonGoalsLoading=false;
  let seasonGoalsSaving=false;
  let seasonGoalsError='';
  let teamHistoryRecord=null;
  let teamHistoryLoaded=false;
  let teamHistoryLoading=false;
  let teamHistoryError='';
  let teamHistoryClubs=[];
  const matchesByLeague=new Map();
  const cupMatchesById=new Map();
  const matchStatsByLeague=new Map();

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const clean=value=>String(value??'').trim();
  const normalize=value=>clean(value).toLocaleLowerCase('uk-UA').replace(/\s+/g,' ');
  const isCenturiaName=value=>normalize(value).replace(/[^a-z0-9]/g,'').includes('centuriaathl');
  const client=()=>{try{return typeof sb!=='undefined'?sb:null;}catch(_e){return null;}};
  const user=()=>{try{return typeof authUser!=='undefined'?authUser:null;}catch(_e){return null;}};
  const clubApi=()=>window.CenturiaArenaClubApi||null;
  const isAdmin=()=>String(window.getCenturiaAuthRole?.()||'').toLowerCase()==='admin';
  const canEditTeamNotes=()=>['admin','editor'].includes(String(window.getCenturiaAuthRole?.()||'').toLowerCase());
  const isReady=()=>!!client()&&!!user();
  const root=()=>document.getElementById(ROOT_ID);
  const toast=message=>{try{window.showToast?.(String(message||''));}catch(_e){}};
  const failMessage=error=>String(error?.message||error||'Не вдалося завантажити ліги');

  window.CenturiaAnalyticsLeagueApi={
    isReady,
    canWrite:isAdmin,
    async list(){
      const db=client();
      if(!db||!user())return [];
      const {data,error}=await db.from(TABLE)
        .select('id,name,teams,created_at,created_by')
        .order('created_at',{ascending:false});
      if(error)throw error;
      return Array.isArray(data)?data:[];
    },
    async create({name,teams}={}){
      const db=client();
      if(!db||!user())throw new Error('Увійди в акаунт, щоб створити лігу');
      if(!isAdmin())throw new Error('Створювати ліги може тільки ADMIN');
      const title=clean(name).slice(0,70);
      const chosen=(Array.isArray(teams)?teams:[])
        .map(team=>({
          normalized_name:clean(team?.normalized_name)||normalize(team?.name),
          name:clean(team?.name),
          logo:clean(team?.logo),
          country:clean(team?.country),
          league_code:clean(team?.league_code)
        }))
        .filter(team=>team.normalized_name&&team.name);
      const unique=[...new Map(chosen.map(team=>[team.normalized_name,team])).values()];
      if(!title)throw new Error('Вкажи назву ліги');
      if(unique.length<2)throw new Error('Обери щонайменше дві команди');
      const {data,error}=await db.from(TABLE)
        .insert({name:title,teams:unique})
        .select('id,name,teams,created_at,created_by')
        .single();
      if(error)throw error;
      return data;
    }
  };

  window.CenturiaAnalyticsCupApi={
    async list(){
      const db=client();if(!db||!user())return [];
      const {data,error}=await db.from(CUP_TABLE).select('id,name,teams,created_at,created_by').order('created_at',{ascending:false});
      if(error)throw error;return Array.isArray(data)?data:[];
    },
    async create({name,teams}={}){
      const db=client();if(!db||!user())throw new Error('Увійди в акаунт, щоб створити кубок');
      if(!isAdmin())throw new Error('Створювати кубок може тільки ADMIN');
      const title=clean(name).slice(0,70);
      const chosen=(Array.isArray(teams)?teams:[]).map(team=>({normalized_name:clean(team?.normalized_name)||normalize(team?.name),name:clean(team?.name),logo:clean(team?.logo),country:clean(team?.country),league_code:clean(team?.league_code)})).filter(team=>team.normalized_name&&team.name);
      const unique=[...new Map(chosen.map(team=>[team.normalized_name,team])).values()];
      if(!title)throw new Error('Вкажи назву кубка');
      if(unique.length<2)throw new Error('Обери щонайменше дві команди');
      const {data,error}=await db.from(CUP_TABLE).insert({name:title,teams:unique}).select('id,name,teams,created_at,created_by').single();
      if(error)throw error;return data;
    },
    async delete(id){
      const db=client();if(!db||!user()||!isAdmin())throw new Error('Видаляти кубок може тільки ADMIN');
      const {error}=await db.from(CUP_TABLE).delete().eq('id',id);if(error)throw error;
    }
  };

  window.CenturiaAnalyticsTeamNoteApi={
    async get(teamKey){
      const db=client();if(!db||!user())throw new Error('Увійди в акаунт, щоб переглянути примітки');
      const {data,error}=await db.from(TEAM_NOTE_TABLE).select('team_key,team_name,note,updated_at,updated_by').eq('team_key',clean(teamKey)).maybeSingle();
      if(error)throw error;return data||null;
    },
    async save({teamKey,teamName,note}={}){
      const db=client(),currentUser=user();if(!db||!currentUser)throw new Error('Увійди в акаунт, щоб зберегти примітку');
      if(!canEditTeamNotes())throw new Error('Редагувати примітки можуть тільки адміністратор і редактори');
      const key=clean(teamKey),name=clean(teamName).slice(0,120),body=String(note??'').slice(0,20000);
      if(!key||!name)throw new Error('Не вдалося визначити команду');
      const {data,error}=await db.from(TEAM_NOTE_TABLE).upsert({team_key:key,team_name:name,note:body,updated_by:currentUser.id,updated_at:new Date().toISOString()},{onConflict:'team_key'}).select('team_key,team_name,note,updated_at,updated_by').single();
      if(error)throw error;return data;
    }
  };

  const imageUrl=value=>{
    const src=clean(value);
    if(/^https:\/\/[^\s"'<>]+$/i.test(src))return src;
    if(/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(src))return src;
    return '';
  };
  const teamNoteCrestHtml=(team={},className='')=>{
    const name=clean(team.name)||'Команда';
    const key=normalize(team.normalized_name)||normalize(name);
    const logo=imageUrl(team.logo);
    return `<button type="button" class="ca-analytics-crest-v1317 ca-team-note-trigger-v1338 ${className}" data-ca-team-note="${esc(key)}" data-ca-team-note-name="${esc(name)}" data-ca-team-note-logo="${esc(logo)}" aria-label="Відкрити примітку про команду ${esc(name)}">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'⚽'}</button>`;
  };
  const leagueMeta=league=>{
    const teams=Array.isArray(league?.teams)?league.teams:[];
    const created=league?.created_at?new Date(league.created_at):null;
    const date=created&&!Number.isNaN(created.getTime())?created.toLocaleDateString('uk-UA'):'';
    return `${teams.length} КОМАНД${date?` · СТВОРЕНО ${date}`:''}`;
  };
  const clubMeta=(club,leagueNames,groupNames)=>{
    const parts=[];
    const country=groupNames.get(clean(club.country).toUpperCase())||clean(club.country);
    const league=leagueNames.get(clean(club.league_code).toUpperCase())||clean(club.league_code);
    if(country)parts.push(country);
    if(league)parts.push(league);
    return parts.join(' · ')||'Клуб із спільної бази';
  };
  const matchStatsForLeague=league=>{
    const stats=new Map((Array.isArray(league?.teams)?league.teams:[]).map(team=>[
      normalize(team?.normalized_name)||normalize(team?.name),
      {played:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,points:0}
    ]));
    for(const match of matchesByLeague.get(league?.id)||[]){
      if(match.match_kind&&match.match_kind!=='league')continue;
      const round=Number(match.round_number);
      if(!Number.isInteger(round)||round<1)continue;
      const hasResult=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
      if(!hasResult)continue;
      const home=stats.get(normalize(match.home_team_name));
      const away=stats.get(normalize(match.away_team_name));
      const homeGoals=Number(match.home_score);
      const awayGoals=Number(match.away_score);
      if(!home||!away||!Number.isFinite(homeGoals)||!Number.isFinite(awayGoals))continue;
      home.played++;away.played++;
      home.goals_for+=homeGoals;home.goals_against+=awayGoals;
      away.goals_for+=awayGoals;away.goals_against+=homeGoals;
      if(homeGoals>awayGoals){home.wins++;home.points+=3;away.losses++;}
      else if(homeGoals<awayGoals){away.wins++;away.points+=3;home.losses++;}
      else{home.draws++;away.draws++;home.points++;away.points++;}
    }
    return stats;
  };
  const computedRows=league=>{
    const useMatchResults=matchesByLeague.has(league?.id);
    const matchStats=useMatchResults?matchStatsForLeague(league):null;
    return (Array.isArray(league?.teams)?league.teams:[]).map(team=>{
      const teamKey=normalize(team?.normalized_name)||normalize(team?.name);
      const stats=useMatchResults?(matchStats.get(teamKey)||{}):(team?.stats||{});
      const gf=Number(stats.goals_for??stats.gf)||0;
      const ga=Number(stats.goals_against??stats.ga)||0;
      return {
        team,
        p:Number(stats.played??stats.p)||0,
        w:Number(stats.wins??stats.w)||0,
        d:Number(stats.draws??stats.d)||0,
        l:Number(stats.losses??stats.l)||0,
        gf,ga,gd:gf-ga,
        pts:Number(stats.points??stats.pts)||0
      };
    }).sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||clean(a.team?.name).localeCompare(clean(b.team?.name),'uk'));
  };

  const teamFormForLeague=league=>{
    const forms=new Map();
    const formLists=new Set();
    (Array.isArray(league?.teams)?league.teams:[]).forEach(team=>{
      const results=[];
      formLists.add(results);
      [...new Set([normalize(team?.normalized_name),normalize(team?.name)].filter(Boolean))]
        .forEach(key=>forms.set(key,results));
    });
    const findForm=teamName=>{
      const key=normalize(teamName);
      if(!key)return null;
      if(forms.has(key))return forms.get(key);
      let best=null,bestDifference=Infinity;
      for(const [alias,results] of forms){
        if(alias.startsWith(key)||key.startsWith(alias)){
          const difference=Math.abs(alias.length-key.length);
          if(difference<bestDifference){best=results;bestDifference=difference;}
        }
      }
      return best;
    };
    const completed=(matchesByLeague.get(league?.id)||[]).filter(match=>{
      if(match.match_kind&&match.match_kind!=='league')return false;
      const round=Number(match.round_number);
      const hasResult=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
      return Number.isInteger(round)&&round>0&&hasResult;
    }).sort((a,b)=>clean(a.match_date).localeCompare(clean(b.match_date))||clean(a.match_time).localeCompare(clean(b.match_time)));
    for(const match of completed){
      const homeForm=findForm(match.home_team_name);
      const awayForm=findForm(match.away_team_name);
      const homeGoals=Number(match.home_score);
      const awayGoals=Number(match.away_score);
      if(!homeForm||!awayForm||!Number.isFinite(homeGoals)||!Number.isFinite(awayGoals))continue;
      const homeOutcome=homeGoals>awayGoals?'win':homeGoals<awayGoals?'loss':'draw';
      const awayOutcome=awayGoals>homeGoals?'win':awayGoals<homeGoals?'loss':'draw';
      homeForm.push({outcome:homeOutcome,goalsFor:homeGoals,goalsAgainst:awayGoals,opponent:match.away_team_name});
      awayForm.push({outcome:awayOutcome,goalsFor:awayGoals,goalsAgainst:homeGoals,opponent:match.home_team_name});
    }
    for(const results of formLists)if(results.length>5)results.splice(0,results.length-5);
    return forms;
  };
  const centuriaCompletedMatches=league=>(matchesByLeague.get(league?.id)||[]).filter(match=>{
    if(match.match_kind&&match.match_kind!=='league')return false;
    const hasResult=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
    return hasResult&&(isCenturiaName(match.home_team_name)||isCenturiaName(match.away_team_name));
  }).sort((a,b)=>clean(a.match_date).localeCompare(clean(b.match_date))||clean(a.match_time).localeCompare(clean(b.match_time)));
  const averageStat=(sum,count,digits=0)=>count?Number((sum/count).toFixed(digits)).toLocaleString('uk-UA',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'';
  const summarizeCenturiaLeague=league=>{
    const matches=centuriaCompletedMatches(league);
    const summary={played:matches.length,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,statsMatches:0,metrics:{}};
    const keys=['possession_pct','expected_goals','pass_accuracy_pct','shot_accuracy_pct'];
    for(const key of keys)summary.metrics[key]={own:0,ownCount:0,opponent:0,opponentCount:0,pairDelta:0,pairCount:0};
    const saved=matchStatsByLeague.get(league?.id)||new Map();
    for(const match of matches){
      const isHome=isCenturiaName(match.home_team_name);
      const goalsFor=Number(isHome?match.home_score:match.away_score);
      const goalsAgainst=Number(isHome?match.away_score:match.home_score);
      if(!Number.isFinite(goalsFor)||!Number.isFinite(goalsAgainst))continue;
      summary.goalsFor+=goalsFor;summary.goalsAgainst+=goalsAgainst;
      if(goalsFor>goalsAgainst)summary.wins++;
      else if(goalsFor<goalsAgainst)summary.losses++;
      else summary.draws++;
      const row=saved.get(String(match.id));
      const ownStats=row?.[isHome?'home_stats':'away_stats']||{};
      const opponentStats=row?.[isHome?'away_stats':'home_stats']||{};
      let hasStats=false;
      for(const key of keys){
        const metric=summary.metrics[key];
        const own=Number(ownStats[key]),opponent=Number(opponentStats[key]);
        const hasOwn=ownStats[key]!==null&&ownStats[key]!==undefined&&ownStats[key]!==''&&Number.isFinite(own);
        const hasOpponent=opponentStats[key]!==null&&opponentStats[key]!==undefined&&opponentStats[key]!==''&&Number.isFinite(opponent);
        if(hasOwn){metric.own+=own;metric.ownCount++;hasStats=true;}
        if(hasOpponent){metric.opponent+=opponent;metric.opponentCount++;hasStats=true;}
        if(hasOwn&&hasOpponent){metric.pairDelta+=own-opponent;metric.pairCount++;}
      }
      if(hasStats)summary.statsMatches++;
    }
    return summary;
  };
  const characteristicForSummary=summary=>{
    const possession=summary.metrics.possession_pct,xg=summary.metrics.expected_goals,insights=[];
    if(possession.pairCount){
      const difference=possession.pairDelta/possession.pairCount;
      if(difference>=5)insights.push('частіше контролює м’яч');
      else if(difference<=-5)insights.push('частіше грає без м’яча');
    }
    if(xg.pairCount){
      const difference=xg.pairDelta/xg.pairCount;
      if(difference>=0.2)insights.push('створює небезпечніші моменти');
      else if(difference<=-0.2)insights.push('дозволяє суперникам створювати більше моментів');
    }
    if(!insights.length){
      if(summary.goalsFor>summary.goalsAgainst)insights.push('має позитивний баланс голів');
      else if(summary.goalsFor<summary.goalsAgainst)insights.push('потрібно покращити баланс голів');
      else insights.push('має рівний баланс голів');
    }
    return `Коротко: Центурія ${insights.slice(0,2).join(' і ')}.`;
  };
  const teamFormSummaryHtml=league=>{
    const summary=summarizeCenturiaLeague(league);
    if(!summary.played)return '<div class="ca-team-form-summary-v1332"><strong>ЗА ВСІ МАТЧІ ЛІГИ</strong><p>Завершених матчів Центурії ще немає.</p></div>';
    const metrics=[],possession=summary.metrics.possession_pct,xg=summary.metrics.expected_goals;
    const passing=summary.metrics.pass_accuracy_pct,shooting=summary.metrics.shot_accuracy_pct;
    if(possession.ownCount)metrics.push(`володіння ${averageStat(possession.own,possession.ownCount)}%`);
    if(xg.ownCount)metrics.push(`xG ${averageStat(xg.own,xg.ownCount,2)}${xg.opponentCount?`–${averageStat(xg.opponent,xg.opponentCount,2)}`:''}`);
    if(passing.ownCount)metrics.push(`точність передач ${averageStat(passing.own,passing.ownCount)}%`);
    if(shooting.ownCount)metrics.push(`точність ударів ${averageStat(shooting.own,shooting.ownCount)}%`);
    const coverage=summary.statsMatches?`Статистика внесена за ${summary.statsMatches} з ${summary.played} матчів.`:'Статистику матчів ще не внесено.';
    const statsLine=metrics.length?`Середні показники: ${metrics.join(' · ')}.`:'';
    return `<div class="ca-team-form-summary-v1332">
      <div class="ca-team-form-summary-head-v1332"><strong>ЗА ВСІ МАТЧІ ЛІГИ</strong><span>${summary.played} ${matchCountLabel(summary.played)}</span></div>
      <p class="ca-team-form-record-v1332"><b>${summary.wins} В · ${summary.draws} Н · ${summary.losses} П</b><span>Забиті: ${summary.goalsFor} · Пропущені: ${summary.goalsAgainst}</span></p>
      ${statsLine?`<p class="ca-team-form-metrics-v1332">${esc(statsLine)}</p>`:''}
      <p class="ca-team-form-insight-v1332">${esc(characteristicForSummary(summary))}</p>
      <small>${esc(coverage)}</small>
    </div>`;
  };
  const teamFormHtml=league=>{
    const rows=computedRows(league);
    const forms=teamFormForLeague(league);
    const centuria=rows.find(({team})=>normalize(`${team?.normalized_name||''} ${team?.name||''}`).includes('centuria athl'))?.team;
    let centuriaHtml='<p class="ca-team-form-empty-v1330">Centuria Athletics ще не додана до ліги.</p>';
    if(centuria){
      const logo=imageUrl(centuria.logo);
      const key=normalize(centuria.normalized_name)||normalize(centuria.name);
      const results=forms.get(key)||forms.get(normalize(centuria.name))||[];
      const teamName=clean(centuria.name)||'Centuria Athletics';
      const resultHtml=results.length?results.map(result=>{
        const label=result.outcome==='win'?'Перемога':result.outcome==='draw'?'Нічия':'Поразка';
        const short=result.outcome==='win'?'В':result.outcome==='draw'?'Н':'П';
        const title=`${label}: ${teamName} ${result.goalsFor}:${result.goalsAgainst} ${result.opponent||'суперник'}`;
        return `<span class="ca-team-form-result-v1330 is-${result.outcome}" title="${esc(title)}" aria-label="${esc(title)}">${short}</span>`;
      }).join(''):'<span class="ca-team-form-empty-v1330">Матчів ще немає</span>';
      centuriaHtml=`<div class="ca-team-form-row-v1330" data-ca-team-centuria="true"><span class="ca-team-form-club-v1330">${teamNoteCrestHtml(centuria)}<b>${esc(teamName)}</b></span><div class="ca-team-form-results-v1330" aria-label="Останні результати ${esc(teamName)}">${resultHtml}</div></div>`;
    }
    return `<section class="ca-analytics-panel-v1317 ca-team-form-panel-v1330" aria-labelledby="caTeamFormTitleV1330">
      <header class="ca-analytics-panel-head-v1317 ca-team-form-head-v1330">
        <div class="ca-analytics-panel-title-v1317"><small>${esc(league.name)}</small><h2 id="caTeamFormTitleV1330">ФОРМА КОМАНДИ</h2><p>В — ВИГРАШ · Н — НІЧИЯ · П — ПОРАЗКА · ОСТАННІЙ МАТЧ СПРАВА</p></div>
      </header>
      <div class="ca-team-form-list-v1330">${centuriaHtml}${teamFormSummaryHtml(league)}</div>
    </section>`;
  };
  const seasonGoalsValue=()=>{
    const raw=String(seasonGoalsRecord?.note||'');
    try{
      const parsed=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'&&('text' in parsed||'targetPlace' in parsed)){
        const target=Number(parsed.targetPlace);
        return {text:String(parsed.text||''),targetPlace:Number.isInteger(target)&&target>0?target:null};
      }
    }catch(_e){}
    return {text:raw,targetPlace:null};
  };
  const seasonGoalsHtml=league=>{
    const goal=seasonGoalsValue();
    const editor=canEditTeamNotes();
    const teams=Array.isArray(league?.teams)?league.teams:[];
    const maxPlace=Math.max(teams.length,1);
    const standingsRows=computedRows(league);
    const centuriaIndex=standingsRows.findIndex(row=>isCenturiaName(row.team?.normalized_name)||isCenturiaName(row.team?.name));
    const place=centuriaIndex>=0?centuriaIndex+1:null;
    const hasPlayed=standingsRows.some(row=>row.p>0);
    let rankCard='';
    if(goal.targetPlace){
      const reached=place!==null&&hasPlayed&&place<=goal.targetPlace;
      const state=place===null?'НЕ В ТАБЛИЦІ':!hasPlayed?'ОЧІКУЄ МАТЧІВ':reached?'ВИКОНАНО':'У ПРОЦЕСІ';
      const placeText=place!==null&&hasPlayed?`${place}<small> / ${teams.length}</small>`:`—<small> / ${teams.length}</small>`;
      let detail='Ціль оновиться, коли з’являться результати ліги.';
      if(place===null)detail='Додай Centuria Athletics до вибраної ліги, щоб відстежувати цю ціль.';
      else if(hasPlayed&&reached)detail=place===goal.targetPlace?'Команда досягла цільового місця.':`Центурія вже вище цілі на ${goal.targetPlace-place} ${goal.targetPlace-place===1?'позицію':goal.targetPlace-place<5?'позиції':'позицій'}.`;
      else if(hasPlayed){const remaining=place-goal.targetPlace;detail=`Потрібно піднятися ще на ${remaining} ${remaining===1?'позицію':remaining<5?'позиції':'позицій'}.`;}
      rankCard=`<article class="ca-season-goals-rank-v1346 ${reached?'is-done':'is-pending'}"><div class="ca-season-goals-rank-head-v1346"><div><small>ЦІЛЬ У ТУРНІРНІЙ ТАБЛИЦІ</small><strong>ТОП-${goal.targetPlace}</strong></div><span class="ca-season-goals-rank-status-v1346">${state}</span></div><div class="ca-season-goals-rank-body-v1346"><div><small>ПОТОЧНЕ МІСЦЕ</small><b>${placeText}</b></div><p>${esc(detail)}</p></div></article>`;
    }
    let body='';
    if(!seasonGoalsLoaded)body='<p class="ca-season-goals-state-v1343">ЗАВАНТАЖУЮ ЦІЛІ…</p>';
    else if(editor){
      const options=['<option value="">Без цілі за місцем</option>',...Array.from({length:maxPlace},(_,index)=>index+1).map(position=>`<option value="${position}" ${goal.targetPlace===position?'selected':''}>Потрапити в топ-${position}</option>`)].join('');
      body=`<form class="ca-season-goals-form-v1343 ca-season-goals-form-v1345 ca-season-goals-form-v1346" data-ca-season-goals-form><div class="ca-season-goals-field-v1346"><label for="caSeasonGoalsTextV1343">ТЕКСТОВА ЦІЛЬ</label><textarea id="caSeasonGoalsTextV1343" name="seasonGoals" maxlength="2000" placeholder="Напиши цілі команди на сезон…">${esc(goal.text)}</textarea></div><div class="ca-season-goals-field-v1346"><label for="caSeasonGoalsPlaceV1345">ЦІЛЬ У ТУРНІРНІЙ ТАБЛИЦІ</label><select id="caSeasonGoalsPlaceV1345" name="targetPlace">${options}</select></div>${rankCard||'<p class="ca-season-goals-no-rank-v1346">За бажанням обери місце, якого команда має досягти в таблиці.</p>'}<div class="ca-season-goals-foot-v1343"><small>Змінювати цілі можуть адмін і редактори.</small><button type="submit" class="ca-analytics-primary-v1317" ${seasonGoalsSaving?'disabled':''}>${seasonGoalsSaving?'ЗБЕРІГАЮ…':'ЗБЕРЕГТИ'}</button></div>${seasonGoalsError?`<p class="ca-season-goals-status-v1343" role="status">${esc(seasonGoalsError)}</p>`:''}</form>`;
    }else if(seasonGoalsError)body=`<p class="ca-season-goals-state-v1343" role="status">${esc(seasonGoalsError)}</p>`;
    else{
      const statement=goal.text?`<article class="ca-season-goals-statement-v1346"><small>ЦІЛЬ КОМАНДИ</small><p>${esc(goal.text)}</p></article>`:'<p class="ca-season-goals-no-rank-v1346">Текстову ціль команди ще не додано.</p>';
      body=`${statement}${rankCard||'<p class="ca-season-goals-no-rank-v1346">Ціль за місцем у таблиці ще не задана.</p>'}`;
    }
    return `<section class="ca-analytics-panel-v1317 ca-season-goals-panel-v1343 ca-season-goals-panel-v1346" aria-labelledby="caSeasonGoalsTitleV1343"><header class="ca-analytics-panel-head-v1317 ca-season-goals-head-v1343"><div class="ca-analytics-panel-title-v1317"><small>CENTURIA ATHLETICS</small><h2 id="caSeasonGoalsTitleV1343">ЦІЛІ НА СЕЗОН</h2><p>${editor?'Задавати текст і турнірну ціль можуть адмін та редактори.':'Цілі Centuria Athletics на поточний сезон.'}</p></div></header><div class="ca-season-goals-content-v1343 ca-season-goals-content-v1346">${body}</div></section>`;
  };
  const loadSeasonGoals=async()=>{
    if(seasonGoalsLoaded||seasonGoalsLoading||!isReady())return;
    seasonGoalsLoading=true;
    try{seasonGoalsRecord=await window.CenturiaAnalyticsTeamNoteApi.get(SEASON_GOALS_KEY);seasonGoalsError='';}
    catch(error){seasonGoalsError=failMessage(error);}
    finally{
      seasonGoalsLoaded=true;seasonGoalsLoading=false;
      if(document.getElementById('screen-analytics')?.classList.contains('active'))render();
    }
  };
  const readTeamHistory=()=>{
    try{const parsed=JSON.parse(String(teamHistoryRecord?.note||'{}'));return parsed&&Array.isArray(parsed.seasons)?parsed.seasons:[];}catch(_e){return [];}
  };
  const orderedTeamHistorySeasons=()=>readTeamHistory().slice().sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')));
  const teamHistoryRows=season=>(Array.isArray(season?.rows)?season.rows:[]).slice().sort((a,b)=>Number(b.points||0)-Number(a.points||0)||(Number(b.gd??(Number(b.gf||0)-Number(b.ga||0)))-Number(a.gd??(Number(a.gf||0)-Number(a.ga||0))))||Number(b.gf||0)-Number(a.gf||0)||String(a.team||'').localeCompare(String(b.team||''),'uk'));
  const teamHistoryLogoMap=league=>{
    const clubsByName=new Map();
    [...(Array.isArray(league?.teams)?league.teams:[]),...(Array.isArray(teamHistoryClubs)?teamHistoryClubs:[])].forEach(team=>{
      [team.normalized_name,team.name].map(normalize).filter(Boolean).forEach(key=>clubsByName.set(key,team));
    });
    return clubsByName;
  };
  const teamHistoryAliases=new Map([['centuria athl','centuria athletics'],['cfc dirty','cfc d1rty']]);
  const teamHistoryTableHtml=(season,league)=>{
    const clubsByName=teamHistoryLogoMap(league);
    const rows=teamHistoryRows(season);
    const tableRows=rows.map((row,index)=>{
      const key=normalize(row.team);
      const matched=clubsByName.get(key)||clubsByName.get(teamHistoryAliases.get(key)||'')||{};
      const logo=imageUrl(row.logo||matched.logo);
      const gf=Number(row.gf||0),ga=Number(row.ga||0);
      const diff=Number(row.gd??(gf-ga));
      return `<tr class="${row.inactive?'is-inactive':''}"><td class="ca-analytics-place-v1317">${index+1}</td><td class="ca-analytics-team-cell-v1317"><span class="ca-analytics-team-v1317"><span class="ca-analytics-crest-v1317 ca-team-history-crest-v1348">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'⚽'}</span><span class="ca-analytics-team-copy-v1317"><b>${esc(row.team||'Клуб')}</b></span></span></td><td>${Number(row.played||0)}</td><td>${Number(row.won||0)}</td><td>${Number(row.drawn||0)}</td><td>${Number(row.lost||0)}</td><td>${diff>0?'+':''}${diff}</td><td><b class="ca-analytics-points-v1317">${Number(row.points||0)}</b></td></tr>`;
    }).join('');
    return `<div class="ca-team-history-table-wrap-v1344 ca-team-history-table-fit-v1348"><table class="ca-analytics-table-v1317 ca-team-history-standings-v1349" aria-label="Турнірна таблиця ${esc(season.name||'сезону')}"><thead><tr><th>#</th><th class="ca-analytics-team-cell-v1317">КОМАНДА</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>РГ</th><th>ОЧ</th></tr></thead><tbody>${tableRows}</tbody></table></div>`;
  };
  const teamHistoryHtml=league=>{
    const seasons=orderedTeamHistorySeasons();
    let body='';
    if(!teamHistoryLoaded)body='<p class="ca-team-history-state-v1344">ЗАВАНТАЖУЮ ІСТОРІЮ…</p>';
    else if(teamHistoryError)body=`<p class="ca-team-history-state-v1344" role="status">${esc(teamHistoryError)}</p>`;
    else if(!seasons.length)body='<p class="ca-team-history-state-v1344">Архівні таблиці сезонів з’являться тут.</p>';
    else{
      body=seasons.map((season,index)=>{
        const rows=teamHistoryRows(season);
        return `<article class="ca-team-history-season-v1344 ca-team-history-season-card-v1349"><button type="button" class="ca-team-history-season-button-v1349" data-ca-open-team-history-season="${index}" aria-label="Відкрити таблицю: ${esc(season.name||'Сезон')}"><span class="ca-team-history-season-icon-v1349" aria-hidden="true">🏆</span><span class="ca-team-history-season-copy-v1349"><b>${esc(season.name||'Сезон')}</b><small>ПІДСУМКОВА ТАБЛИЦЯ · ${rows.length} КОМАНД</small></span><span class="ca-team-history-season-arrow-v1349" aria-hidden="true">›</span></button></article>`;
      }).join('');
    }
    return `<section class="ca-analytics-panel-v1317 ca-team-history-panel-v1344" aria-labelledby="caTeamHistoryTitleV1344"><header class="ca-analytics-panel-head-v1317 ca-team-history-head-v1344"><div class="ca-analytics-panel-title-v1317"><small>CENTURIA ATHLETICS</small><h2 id="caTeamHistoryTitleV1344">ІСТОРІЯ КОМАНДИ</h2><p>Перегляд підсумкових турнірних таблиць Centuria Athletics за попередні сезони.</p></div></header><div class="ca-team-history-content-v1344">${body}</div></section>`;
  };
  const openTeamHistorySeasonModal=index=>{
    const seasons=orderedTeamHistorySeasons(),season=seasons[Number(index)];
    const active=leagues.find(league=>league.id===activeId)||leagues[0];
    if(!season||!active)return;
    closeModal();
    const rows=teamHistoryRows(season);
    const overlay=document.createElement('div');
    overlay.id=TEAM_HISTORY_SEASON_MODAL_ID;
    overlay.className='ca-analytics-window-overlay-v1319 ca-team-history-overlay-v1349';
    overlay.innerHTML=`<section class="ca-analytics-window-v1319 ca-team-history-dialog-v1349" role="dialog" aria-modal="true" aria-labelledby="caTeamHistorySeasonTitleV1349"><header class="ca-analytics-window-head-v1319"><div><small>CENTURIA ATHLETICS · ІСТОРІЯ КОМАНДИ</small><h2 id="caTeamHistorySeasonTitleV1349">${esc(season.name||'Сезон')}</h2><p>Підсумкова турнірна таблиця · ${rows.length} команд</p></div><button type="button" class="ca-analytics-window-close-v1319" data-ca-close-window aria-label="Закрити таблицю сезону">×</button></header><div class="ca-analytics-window-body-v1319 ca-team-history-modal-body-v1349" role="region" tabindex="0" aria-label="Таблиця ${esc(season.name||'сезону')}">${teamHistoryTableHtml(season,active)}<p class="ca-team-history-legend-v1349">І — зіграно · РГ — різниця голів · ОЧ — очки</p></div></section>`;
    document.body.appendChild(overlay);
    document.body.classList.add('ca-analytics-modal-open-v1317');
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeModal();});
    attachWindowClose(overlay);
  };
  const loadTeamHistory=async()=>{
    if(teamHistoryLoaded||teamHistoryLoading||!isReady())return;
    teamHistoryLoading=true;
    try{
      teamHistoryRecord=await window.CenturiaAnalyticsTeamNoteApi.get(TEAM_HISTORY_KEY);
      teamHistoryError='';
      const names=readTeamHistory().flatMap(season=>(Array.isArray(season.rows)?season.rows:[]).map(row=>normalize(row.team))).filter(Boolean);
      const aliases=names.map(name=>teamHistoryAliases.get(name)).filter(Boolean);
      const keys=[...new Set([...names,...aliases])];
      const db=client();
      if(db&&keys.length){
        try{const {data,error}=await db.from('arena_clubs').select('normalized_name,name,logo').in('normalized_name',keys);if(error)throw error;teamHistoryClubs=Array.isArray(data)?data:[];}
        catch(_error){teamHistoryClubs=[];}
      }
    }
    catch(error){teamHistoryError=failMessage(error);}
    finally{teamHistoryLoaded=true;teamHistoryLoading=false;if(document.getElementById('screen-analytics')?.classList.contains('active'))render();}
  };

  const fetchCupMatches=async cup=>{
    const db=client();if(!db||!user())throw new Error('Увійди в акаунт, щоб переглянути матчі кубка');
    const {data,error}=await db.from('centuria_analytics_matches').select('id,match_date,match_time,competition_name,home_team_name,home_team_image,away_team_name,away_team_image,home_score,away_score,match_kind,round_number,match_status,cup_id').eq('cup_id',cup.id).order('round_number',{ascending:true}).order('match_date',{ascending:true});
    if(error)throw error;return Array.isArray(data)?data:[];
  };
  const cupMatchesHtml=matches=>{
    if(!matches.length)return '<div class="ca-analytics-history-empty-v1319"><span aria-hidden="true">🏆</span><b>МАТЧІВ КУБКА ЩЕ НЕ ДОДАНО</b><p>ADMIN може додати пари команд і згодом вносити рахунки.</p></div>';
    const rounds=groupedHistoryRounds(matches,historyRoundNumbers(matches));
    return rounds.map(([round,items])=>`<section class="ca-analytics-round-group-v1321"><header class="ca-analytics-round-head-v1321"><b>${round===null?'МАТЧІ':`РАУНД ${round}`}</b><span>${items.length} ${matchCountLabel(items.length)}</span></header><div class="ca-analytics-history-list-v1319">${items.map(match=>{
      const homeLogo=imageUrl(match.home_team_image),awayLogo=imageUrl(match.away_team_image),hasScore=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
      return `<article class="ca-analytics-match-v1319 ca-cup-match-v1336"><div class="ca-analytics-match-meta-v1319"><span>${esc(formattedMatchDate(match.match_date))}${clean(match.match_time)?` · ${esc(clean(match.match_time).slice(0,5))}`:''}</span><b>КУБОК</b></div><div class="ca-analytics-match-score-v1319"><span class="ca-analytics-match-team-v1319 ca-analytics-home-team-v1319">${teamNoteCrestHtml({name:match.home_team_name,logo:homeLogo})}<b>${esc(match.home_team_name)}</b></span><strong>${hasScore?`${esc(match.home_score)} : ${esc(match.away_score)}`:'— : —'}</strong><span class="ca-analytics-match-team-v1319 ca-analytics-away-team-v1319"><b>${esc(match.away_team_name)}</b>${teamNoteCrestHtml({name:match.away_team_name,logo:awayLogo})}</span></div>${isAdmin()?`<div class="ca-cup-match-actions-v1336"><button type="button" class="ca-analytics-table-toggle-v1318" data-ca-edit-cup-match="${esc(match.id)}">${hasScore?'ЗМІНИТИ МАТЧ':'ВНЕСТИ РАХУНОК'}</button></div>`:''}</article>`;
    }).join('')}</div></section>`).join('');
  };
  const cupPanelHtml=()=>{
    const cup=cups.find(item=>String(item.id)===String(activeCupId))||cups[0];
    const picker=cups.length>1?`<select class="ca-analytics-select-v1317 ca-cup-select-v1336" aria-label="Обрати кубок" data-ca-cup-select>${cups.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(cup?.id)?'selected':''}>${esc(item.name)}</option>`).join('')}</select>`:'';
    const actions=`<div class="ca-analytics-panel-actions-v1317 ca-cup-actions-v1336">${picker}${isAdmin()&&!cupsError?'<button type="button" class="ca-analytics-primary-v1317" data-ca-create-cup>＋ НОВИЙ КУБОК</button>':''}${cup&&isAdmin()?'<button type="button" class="ca-analytics-table-toggle-v1318" data-ca-add-cup-match>＋ ДОДАТИ МАТЧ</button>':''}</div>`;
    let body='';
    if(cupsError)body=`<p class="ca-analytics-note-v1317 ca-analytics-error-v1317">${esc(cupsError)}</p>`;
    else if(!cup)body='<div class="ca-analytics-cup-empty-v1336"><span aria-hidden="true">🏆</span><b>КУБОК ЩЕ НЕ СТВОРЕНО</b><p>Створи кубок для перегляду реальних матчів команди. Голосувань і реєстрації гравців тут немає.</p></div>';
    else{
      const teams=Array.isArray(cup.teams)?cup.teams:[];
      const teamStrip=teams.map(team=>`<span class="ca-cup-team-chip-v1336">${teamNoteCrestHtml(team)}<b>${esc(team.name)}</b></span>`).join('');
      body=`<div class="ca-cup-meta-v1336"><b>${esc(cup.name)}</b><span>${teams.length} КОМАНД · ${cupMatches.length} ${matchCountLabel(cupMatches.length).toLowerCase()}</span></div><div class="ca-cup-teams-v1336">${teamStrip}</div><div class="ca-cup-results-v1336">${cupMatchesHtml(cupMatches)}</div>${isAdmin()?`<div class="ca-cup-delete-v1336"><button type="button" class="ca-analytics-table-toggle-v1318" data-ca-delete-cup="${esc(cup.id)}">ВИДАЛИТИ КУБОК</button></div>`:''}`;
    }
    return `<section class="ca-analytics-panel-v1317 ca-analytics-cup-panel-v1336" aria-labelledby="caAnalyticsCupTitleV1336"><header class="ca-analytics-panel-head-v1317 ca-analytics-cup-head-v1336"><div class="ca-analytics-panel-title-v1317"><small>ТУРНІРНА СІТКА</small><h2 id="caAnalyticsCupTitleV1336">КУБОК</h2><p>Команди з бази клубів · ручне внесення матчів і рахунків</p></div>${actions}</header>${body}</section>`;
  };

  const fetchLeagueMatches=async league=>{
    const db=client();
    if(!db||!user())throw new Error('Увійди в акаунт, щоб переглянути матчі');
    const {data,error}=await db.from('centuria_analytics_matches')
      .select('id,match_date,match_time,competition_name,home_team_name,home_team_image,away_team_name,away_team_image,home_score,away_score,match_kind,round_number,match_status')
      .eq('competition_name',league.name)
      .eq('match_kind','league')
      .order('match_date',{ascending:false})
      .order('match_time',{ascending:false});
    if(error)throw error;
    return (Array.isArray(data)?data:[]).filter(match=>{
      const hasResult=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
      return hasResult||match.match_status==='postponed'||match.match_status==='scheduled';
    });
  };
  const fetchUpcomingCenturiaCalendarMatches=async league=>{
    const db=client();
    if(!db||!user())throw new Error('Увійди в акаунт, щоб переглянути календарні матчі');
    const {data,error}=await db.from('calendar_matches')
      .select('id,match_date,match_time,competition_name,home_team_name,home_team_image,away_team_name,away_team_image,home_score,away_score,match_kind,round_number,match_status')
      .eq('competition_name',league.name)
      .eq('match_kind','league')
      .order('match_date',{ascending:true})
      .order('match_time',{ascending:true});
    if(error)throw error;
    return (Array.isArray(data)?data:[]).filter(match=>{
      const hasResult=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
      return (isCenturiaName(match.home_team_name)||isCenturiaName(match.away_team_name))
        && !hasResult && match.match_status!=='played';
    });
  };
  const loadLeagueData=async league=>{
    let matches=matchesByLeague.get(league?.id);
    if(!matches){
      matches=await fetchLeagueMatches(league);
      matchesByLeague.set(league.id,matches);
    }
    if(!matchStatsByLeague.has(league.id)){
      const ids=centuriaCompletedMatches(league).map(match=>String(match.id)).filter(Boolean);
      const stats=new Map();
      try{
        const db=client();
        if(db&&user()){
          for(let index=0;index<ids.length;index+=100){
            const {data,error}=await db.from(MATCH_STATS_TABLE).select('match_id,home_stats,away_stats').in('match_id',ids.slice(index,index+100));
            if(error)throw error;
            (Array.isArray(data)?data:[]).forEach(row=>stats.set(String(row.match_id),row));
          }
          matchStatsByLeague.set(league.id,stats);
        }
      }catch(_error){}
    }
    return matches;
  };
  const formattedMatchDate=value=>{
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match)return clean(value)||'—';
    return new Date(Number(match[1]),Number(match[2])-1,Number(match[3])).toLocaleDateString('uk-UA',{day:'numeric',month:'short',year:'numeric'});
  };
  const matchCountLabel=count=>{
    const last=count%10,tail=count%100;
    if(last===1&&tail!==11)return 'МАТЧ';
    if(last>=2&&last<=4&&(tail<12||tail>14))return 'МАТЧІ';
    return 'МАТЧІВ';
  };
  const historyRoundNumbers=matches=>{
    return new Map(matches.map(match=>{
      const round=Number(match.round_number);
      return [match.id,Number.isInteger(round)&&round>0?round:null];
    }));
  };
  const groupedHistoryRounds=(matches,roundNumbers)=>{
    const rounds=new Map();
    matches.forEach(match=>{
      const round=roundNumbers.get(match.id)??null;
      if(!rounds.has(round))rounds.set(round,[]);
      rounds.get(round).push(match);
    });
    return [...rounds.entries()]
      .sort((a,b)=>a[0]===null?(b[0]===null?0:1):(b[0]===null?-1:a[0]-b[0]))
      .map(([round,roundMatches])=>[
        round,
        roundMatches.sort((a,b)=>clean(a.match_date).localeCompare(clean(b.match_date))||clean(a.match_time).localeCompare(clean(b.match_time)))
      ]);
  };
  const matchHistoryHtml=(matches,roundNumbers,emptyTitle='Завершених матчів ще немає',enableMatchStats=false)=>{
    if(!matches.length)return `<div class="ca-analytics-history-empty-v1319"><span aria-hidden="true">⚽</span><b>${esc(emptyTitle)}</b><p>Тут з’являтимуться результати матчів цієї ліги.</p></div>`;
    return groupedHistoryRounds(matches,roundNumbers).map(([round,roundMatches])=>{
      const roundTitle=round===null?'ТУР НЕ ВКАЗАНО':'ТУР '+round;
      const roundDates=[...new Set(roundMatches.map(match=>clean(match.match_date)).filter(Boolean))].sort();
      const dateSummary=roundDates.length
        ?formattedMatchDate(roundDates[0])+(roundDates.length>1?' — '+formattedMatchDate(roundDates[roundDates.length-1]):'')
        :'ДАТУ НЕ ВКАЗАНО';
      return `<section class="ca-analytics-round-group-v1321">
        <header class="ca-analytics-round-head-v1321"><b>${esc(roundTitle)}</b><span>${esc(dateSummary)} · ${roundMatches.length} ${matchCountLabel(roundMatches.length)}</span></header>
        <div class="ca-analytics-history-list-v1319">${roundMatches.map(match=>{
          const homeLogo=imageUrl(match.home_team_image);
          const awayLogo=imageUrl(match.away_team_image);
          const time=clean(match.match_time).slice(0,5);
          const kind=match.match_kind==='cup'?'КУБОК':'ЛІГА';
          const postponed=match.match_status==='postponed';
          const hasScore=match.home_score!==null&&match.home_score!==undefined&&match.away_score!==null&&match.away_score!==undefined;
          const canOpenStats=enableMatchStats&&!postponed&&hasScore&&clean(match.id);
          const statsAction=canOpenStats?` data-ca-open-match-stats="${esc(match.id)}" role="button" tabindex="0" aria-label="Відкрити статистику матчу: ${esc(match.home_team_name)} ${esc(match.home_score)} — ${esc(match.away_score)} ${esc(match.away_team_name)}"`:'';
          return `<article class="ca-analytics-match-v1319${canOpenStats?' ca-analytics-match-clickable-v1327':''}"${statsAction}>
            <div class="ca-analytics-match-meta-v1319"><span>${esc(formattedMatchDate(match.match_date))}${time?` · ${esc(time)}`:''}</span><b>${kind}</b></div>
            <div class="ca-analytics-match-score-v1319">
              <span class="ca-analytics-match-team-v1319 ca-analytics-home-team-v1319">${teamNoteCrestHtml({name:match.home_team_name||'Команда',logo:homeLogo})}<b>${esc(match.home_team_name||'Команда')}</b></span>
          <strong${postponed?' class="ca-analytics-match-postponed-v1323"':!hasScore?' class="ca-analytics-match-scheduled-v1339"':''}>${postponed?'Перенесено':hasScore?esc(match.home_score)+' : '+esc(match.away_score):'Заплановано'}</strong>
              <span class="ca-analytics-match-team-v1319 ca-analytics-away-team-v1319"><b>${esc(match.away_team_name||'Команда')}</b>${teamNoteCrestHtml({name:match.away_team_name||'Команда',logo:awayLogo})}</span>
            </div>${isAdmin()&&match.match_kind==='league'?`<div class="ca-cup-match-actions-v1336"><button type="button" class="ca-analytics-table-toggle-v1318" data-ca-edit-league-match="${esc(match.id)}">${hasScore?'ЗМІНИТИ МАТЧ':'ВНЕСТИ РАХУНОК'}</button></div>`:''}
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('');
  };
  const matchRoundsTabsHtml=(matches,roundNumbers)=>{
    if(!matches.length)return matchHistoryHtml(matches,roundNumbers);
    const groups=groupedHistoryRounds(matches,roundNumbers);
    const roundKey=round=>round===null?'unassigned':`round-${round}`;
    return `<div class="ca-analytics-round-tabs-v1326" role="tablist" aria-label="Обрати тур">
      ${groups.map(([round,roundMatches],index)=>{
        const key=roundKey(round);
        const tabId=`caHistoryRoundTabV1326_${key}`;
        const panelId=`caHistoryRoundPanelV1326_${key}`;
        const label=round===null?'БЕЗ ТУРУ':'ТУР '+round;
        return `<button type="button" id="${tabId}" class="${index===0?'active':''}" data-ca-round-tab="${key}" role="tab" aria-selected="${index===0?'true':'false'}" aria-controls="${panelId}" tabindex="${index===0?'0':'-1'}">${esc(label)}<span>${roundMatches.length}</span></button>`;
      }).join('')}
    </div>
    <div class="ca-analytics-round-pages-v1326" data-ca-round-panels>
      ${groups.map(([round,roundMatches],index)=>{
        const key=roundKey(round);
        const tabId=`caHistoryRoundTabV1326_${key}`;
        const panelId=`caHistoryRoundPanelV1326_${key}`;
        return `<section id="${panelId}" class="ca-analytics-round-page-v1326" data-ca-round-panel="${key}" role="tabpanel" aria-labelledby="${tabId}" tabindex="0" ${index===0?'':'hidden'}>${matchHistoryHtml(roundMatches,roundNumbers)}</section>`;
      }).join('')}
    </div>`;
  };

  const MATCH_STATS_TABS=[
    {key:'summary',label:'ЗВЕДЕННЯ'},
    {key:'possession',label:'ВОЛОДІННЯ'},
    {key:'shots',label:'УДАРИ'},
    {key:'passing',label:'ПЕРЕДАЧІ'},
    {key:'defense',label:'ЗАХИСТ'},
    {key:'events',label:'ПОДІЇ'}
  ];
  const MATCH_STATS_FIELDS=[
    {key:'dribble_success_pct',label:'Успішні обводки',tab:'summary',unit:'%',step:'0.1',max:100,digits:0},
    {key:'shot_accuracy_pct',label:'Точність ударів',tab:'summary',unit:'%',step:'0.1',max:100,digits:0},
    {key:'pass_accuracy_pct',label:'Точність пасів',tab:'summary',unit:'%',step:'0.1',max:100,digits:0},
    {key:'possession_pct',label:'Володіння м’ячем',tab:'possession',unit:'%',step:'0.1',max:100,digits:0},
    {key:'recovery_seconds',label:'Час повернення м’яча',tab:'possession',unit:'с',step:'0.1',digits:1},
    {key:'shots',label:'Удари',tab:'shots',step:'1',digits:0},
    {key:'expected_goals',label:'Очікувані голи (xG)',tab:'shots',step:'0.01',digits:2},
    {key:'passes',label:'Паси',tab:'passing',step:'1',digits:0},
    {key:'tackles',label:'Відбори',tab:'defense',step:'1',digits:0},
    {key:'successful_tackles',label:'Успішні відбори',tab:'defense',step:'1',digits:0},
    {key:'interceptions',label:'Перехоплення',tab:'defense',step:'1',digits:0},
    {key:'saves',label:'Сейви',tab:'defense',step:'1',digits:0},
    {key:'fouls',label:'Порушення',tab:'events',step:'1',digits:0},
    {key:'offsides',label:'Офсайди',tab:'events',step:'1',digits:0},
    {key:'corners',label:'Кутові',tab:'events',step:'1',digits:0},
    {key:'free_kicks',label:'Штрафні удари',tab:'events',step:'1',digits:0},
    {key:'penalty_shots',label:'Удари з пенальті',tab:'events',step:'1',digits:0},
    {key:'yellow_cards',label:'Жовті картки',tab:'events',step:'1',digits:0}
  ];
  const emptyMatchStats=()=>({home:{},away:{},events:[]});
  const cloneMatchStats=stats=>({home:{...(stats?.home||{})},away:{...(stats?.away||{})},events:[...(stats?.events||[])]});
  const normalizeMatchStats=row=>({
    home:row?.home_stats&&typeof row.home_stats==='object'&&!Array.isArray(row.home_stats)?row.home_stats:{},
    away:row?.away_stats&&typeof row.away_stats==='object'&&!Array.isArray(row.away_stats)?row.away_stats:{},
    events:Array.isArray(row?.events)?row.events.map(clean).filter(Boolean):[]
  });
  const formatStatValue=(field,value)=>{
    if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return '—';
    const number=Number(value);
    const formatted=number.toLocaleString('uk-UA',{minimumFractionDigits:field.digits||0,maximumFractionDigits:field.digits||0});
    return field.unit==='%'?`${formatted}%`:field.unit?`${formatted} ${field.unit}`:formatted;
  };
  const matchStatsHasValues=stats=>MATCH_STATS_FIELDS.some(field=>
    (stats.home[field.key]!==null&&stats.home[field.key]!==undefined)||
    (stats.away[field.key]!==null&&stats.away[field.key]!==undefined)
  )||stats.events.length>0;
  const matchStatInput=(field,side,stats)=>{
    const value=stats?.[side]?.[field.key];
    const numeric=value===null||value===undefined||value===''?'':String(value);
    return `<input class="ca-match-stat-input-v1327" type="number" inputmode="${field.step==='1'?'numeric':'decimal'}" min="0"${field.max!==undefined?` max="${field.max}"`:''} step="${field.step}" placeholder="—" value="${esc(numeric)}" data-match-stat-side="${side}" data-match-stat-key="${field.key}" aria-label="${esc(field.label)} — ${side==='home'?'домашня':'виїзна'} команда">`;
  };
  const matchStatRowsHtml=(fields,stats,editing)=>fields.map(field=>editing
    ?`<div class="ca-match-stat-row-v1327 is-editing"><span>${matchStatInput(field,'home',stats)}</span><b>${esc(field.label)}</b><span>${matchStatInput(field,'away',stats)}</span></div>`
    :`<div class="ca-match-stat-row-v1327"><strong>${esc(formatStatValue(field,stats.home[field.key]))}</strong><b>${esc(field.label)}</b><strong>${esc(formatStatValue(field,stats.away[field.key]))}</strong></div>`
  ).join('');
  const matchStatsPanelHtml=(tab,stats,editing,hasValues)=>{
    const fields=MATCH_STATS_FIELDS.filter(field=>field.tab===tab);
    const emptyNote=!hasValues&&!editing?'<p class="ca-match-stats-empty-v1327">Статистику цього матчу ще не внесено.</p>':'';
    if(tab==='summary'&&!editing){
      const rings=fields.map(field=>`<div class="ca-match-stat-row-v1327 ca-match-ring-row-v1327"><strong>${esc(formatStatValue(field,stats.home[field.key]))}</strong><b>${esc(field.label)}</b><strong>${esc(formatStatValue(field,stats.away[field.key]))}</strong></div>`).join('');
      return `${emptyNote}<div class="ca-match-rings-v1327"><div class="ca-match-rings-head-v1327"><span>ДОМА</span><span>ПОКАЗНИК</span><span>ВИЇЗД</span></div>${rings}</div>`;
    }
    const events=tab==='events'
      ?editing?`<label class="ca-match-events-editor-v1327">ПОДІЇ МАТЧУ — ОДНА ПОДІЯ НА РЯДОК<textarea data-match-events rows="5" placeholder="Наприклад: 24′ Гол — ім’я гравця">${esc(stats.events.join('\n'))}</textarea></label>`
        :`<div class="ca-match-events-list-v1327"><h3>ПОДІЇ МАТЧУ</h3>${stats.events.length?`<ol>${stats.events.map(item=>`<li>${esc(item)}</li>`).join('')}</ol>`:'<p>Події ще не внесено.</p>'}</div>`
      :'';
    return `${emptyNote}<div class="ca-match-stats-rows-v1327">${matchStatRowsHtml(fields,stats,editing)}</div>${events}`;
  };
  const openMatchStatsModal=async match=>{
    document.getElementById(MATCH_STATS_MODAL_ID)?.remove();
    const overlay=document.createElement('div');
    overlay.id=MATCH_STATS_MODAL_ID;
    overlay.className='ca-analytics-window-overlay-v1319 ca-analytics-match-stats-overlay-v1327';
    let stats=emptyMatchStats();
    let savedStats=cloneMatchStats(stats);
    let activeTab='summary';
    let editing=false;
    let saving=false;
    let loading=true;
    let hasRecord=false;
    let updatedAt='';
    let statusMessage='Завантажую статистику…';
    const homeLogo=imageUrl(match.home_team_image);
    const awayLogo=imageUrl(match.away_team_image);
    const round=Number(match.round_number);
    const roundText=Number.isInteger(round)&&round>0?`ТУР ${round}`:'МАТЧ ЛІГИ';
    const matchDate=esc(`${formattedMatchDate(match.match_date)}${clean(match.match_time)?` · ${clean(match.match_time).slice(0,5)}`:''}`);
    const render=()=>{
      const hasValues=matchStatsHasValues(stats);
      overlay.innerHTML=`<section class="ca-analytics-window-v1319 ca-match-stats-window-v1327" role="dialog" aria-modal="true" aria-labelledby="caMatchStatsTitleV1327">
        <header class="ca-analytics-window-head-v1319 ca-match-stats-head-v1327"><div class="ca-match-stats-head-copy-v1327"><small>${esc(roundText)} · ${esc(match.competition_name||'CENTURIA ATHLETICS')}</small><h2 id="caMatchStatsTitleV1327">СТАТИСТИКА МАТЧУ</h2><p>${matchDate}</p>
          <div class="ca-match-stats-score-v1327">
            <span class="ca-match-stats-team-v1327">${homeLogo?`<img src="${esc(homeLogo)}" alt="" referrerpolicy="no-referrer">`:''}<b>${esc(match.home_team_name||'Команда')}</b></span>
            <strong>${esc(match.home_score)} : ${esc(match.away_score)}</strong>
            <span class="ca-match-stats-team-v1327 away">${awayLogo?`<img src="${esc(awayLogo)}" alt="" referrerpolicy="no-referrer">`:''}<b>${esc(match.away_team_name||'Команда')}</b></span>
          </div>
        </div><button type="button" class="ca-analytics-window-close-v1319" data-match-stats-close aria-label="Закрити статистику">×</button></header>
        <div class="ca-match-stats-tabs-v1327" role="tablist" aria-label="Розділи статистики матчу">${MATCH_STATS_TABS.map(tab=>`<button type="button" class="${tab.key===activeTab?'active':''}" data-match-stats-tab="${tab.key}" role="tab" aria-selected="${tab.key===activeTab?'true':'false'}">${esc(tab.label)}</button>`).join('')}</div>
        <div class="ca-analytics-window-body-v1319 ca-match-stats-body-v1327" data-match-stats-panel>${loading?`<p class="ca-match-stats-empty-v1327">${esc(statusMessage)}</p>`:matchStatsPanelHtml(activeTab,stats,editing,hasValues)}</div>
        <footer class="ca-match-stats-footer-v1327">${loading?'<span></span>':editing?`<button type="button" class="ca-analytics-secondary-v1317" data-match-stats-cancel>СКАСУВАТИ</button><button type="button" class="ca-analytics-primary-v1317" data-match-stats-save ${saving?'disabled':''}>${saving?'ЗБЕРІГАЮ…':'ЗБЕРЕГТИ'}</button>`:isMatchStatsAdmin()?`<span class="ca-match-stats-updated-v1327">${hasRecord&&updatedAt?`ОНОВЛЕНО ${esc(formattedMatchDate(updatedAt.slice(0,10)))}`:''}</span><button type="button" class="ca-analytics-primary-v1317" data-match-stats-edit>${hasRecord?'РЕДАГУВАТИ':'ДОДАТИ СТАТИСТИКУ'}</button>`:'<span class="ca-match-stats-updated-v1327">Статистика матчу</span>'}</footer>
      </section>`;
    };
    const captureInputs=()=>{
      overlay.querySelectorAll('[data-match-stat-key]').forEach(input=>{
        const side=input.dataset.matchStatSide;
        const key=input.dataset.matchStatKey;
        const raw=String(input.value||'').trim();
        stats[side][key]=raw===''?null:Number(raw);
      });
      const eventInput=overlay.querySelector('[data-match-events]');
      if(eventInput)stats.events=String(eventInput.value||'').split(/\r?\n/).map(clean).filter(Boolean);
    };
    const close=()=>overlay.remove();
    const validate=()=>{
      for(const field of MATCH_STATS_FIELDS){
        for(const side of ['home','away']){
          const value=stats[side][field.key];
          if(value===null||value===undefined)continue;
          if(!Number.isFinite(Number(value))||Number(value)<0||(field.max!==undefined&&Number(value)>field.max)){
            toast(`${field.label}: введи значення від 0${field.max!==undefined?` до ${field.max}`:''}`);
            return false;
          }
        }
      }
      return true;
    };
    const save=async()=>{
      captureInputs();
      if(!validate()||saving)return;
      const db=client();
      const currentUser=user();
      if(!db||!currentUser?.id){toast('Увійди в акаунт, щоб зберегти статистику');return;}
      saving=true;render();
      try{
        const {data,error}=await db.from(MATCH_STATS_TABLE).upsert({
          match_id:match.id,home_stats:stats.home,away_stats:stats.away,events:stats.events,
          updated_by:currentUser.id,updated_at:new Date().toISOString()
        },{onConflict:'match_id'}).select('match_id,home_stats,away_stats,events,updated_at').single();
        if(error)throw error;
        stats=normalizeMatchStats(data);savedStats=cloneMatchStats(stats);hasRecord=true;editing=false;
        const leagueStats=matchStatsByLeague.get(activeId)||new Map();
        leagueStats.set(String(data.match_id),data);
        matchStatsByLeague.set(activeId,leagueStats);
        render();renderHomeStandings();
        if(data?.updated_at)updatedAt=data.updated_at;
        toast('Статистику матчу збережено');
      }catch(error){
        toast(failMessage(error));
      }finally{
        saving=false;loading=false;render();
      }
    };
    render();
    document.body.appendChild(overlay);
    overlay.addEventListener('click',event=>{
      if(event.target===overlay||event.target.closest('[data-match-stats-close]')){close();return;}
      const tab=event.target.closest('[data-match-stats-tab]');
      if(tab){captureInputs();activeTab=tab.dataset.matchStatsTab;render();return;}
      if(event.target.closest('[data-match-stats-edit]')){savedStats=cloneMatchStats(stats);editing=true;render();return;}
      if(event.target.closest('[data-match-stats-cancel]')){stats=cloneMatchStats(savedStats);editing=false;render();return;}
      if(event.target.closest('[data-match-stats-save]'))void save();
    });
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();close();return;}
      const trigger=event.target.closest?.('[data-match-stats-tab]');
      if(trigger&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
        event.preventDefault();event.stopPropagation();
        const index=MATCH_STATS_TABS.findIndex(tab=>tab.key===activeTab);
        const next=(index+(event.key==='ArrowRight'?1:-1)+MATCH_STATS_TABS.length)%MATCH_STATS_TABS.length;
        activeTab=MATCH_STATS_TABS[next].key;captureInputs();render();
        overlay.querySelector(`[data-match-stats-tab="${activeTab}"]`)?.focus();
      }
    });
    try{
      const db=client();
      if(!db||!user())throw new Error('Увійди в акаунт, щоб переглянути статистику');
      const {data,error}=await db.from(MATCH_STATS_TABLE).select('match_id,home_stats,away_stats,events,updated_at').eq('match_id',match.id).maybeSingle();
      if(error)throw error;
      if(!document.getElementById(MATCH_STATS_MODAL_ID))return;
      hasRecord=!!data;
      updatedAt=data?.updated_at||'';
      stats=normalizeMatchStats(data);
      savedStats=cloneMatchStats(stats);
      loading=false;statusMessage='';
    }catch(error){
      if(!document.getElementById(MATCH_STATS_MODAL_ID))return;
      loading=false;statusMessage=failMessage(error);
      overlay.querySelector('[data-match-stats-panel]').innerHTML=`<p class="ca-analytics-error-v1317">${esc(statusMessage)}</p>`;
      overlay.querySelector('.ca-match-stats-footer-v1327').innerHTML='<span></span>';
      return;
    }
    render();
  };
  const isMatchStatsAdmin=()=>isAdmin();

  const emptyHtml=(title='ЛІГУ ЩЕ НЕ ДОДАНО',body='Турнірна таблиця з’явиться тут після створення ліги.')=>`
    <article class="ca-analytics-empty-v1317">
      <div class="ca-analytics-empty-icon-v1317" aria-hidden="true">📊</div>
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      ${isAdmin()?'<button type="button" class="ca-analytics-primary-v1317" data-ca-create-league>＋ СТВОРИТИ ЛІГУ</button>':''}
    </article>`;

  const tableHtml=league=>{
    const rows=computedRows(league);
    const body=rows.map((row,index)=>{
      const team=row.team||{};
      const logo=imageUrl(team.logo);
      const isCenturia=normalize(team.normalized_name||team.name).includes('centuria athl');
      return `<tr${isCenturia?' class="ca-analytics-centuria-row-v1318" data-ca-centuria-row="true"':''}>
        <td class="ca-analytics-place-v1317">${index+1}</td>
        <td class="ca-analytics-team-cell-v1317"><span class="ca-analytics-team-v1317">
          ${teamNoteCrestHtml(team)}
          <span class="ca-analytics-team-copy-v1317"><b>${esc(team.name||'Клуб')}</b></span>
        </span></td>
        <td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td>
        <td>${row.gd>0?'+':''}${row.gd}</td><td><b class="ca-analytics-points-v1317">${row.pts}</b></td>
      </tr>`;
    }).join('');
    return `<table class="ca-analytics-table-v1317" aria-label="Турнірна таблиця ${esc(league.name)}">
        <thead><tr><th>#</th><th class="ca-analytics-team-cell-v1317">КОМАНДА</th><th>І</th><th>В</th><th>Н</th><th>П</th><th>РГ</th><th>ОЧ</th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  };

  const homeTableHtml=league=>{
    const rows=computedRows(league);
    if(!rows.length)return '<div class="ca-home-standings-state-v1320">У ЛІЗІ ПОКИ НЕМАЄ КОМАНД</div>';
    const centuriaIndex=rows.findIndex(row=>isCenturiaName(row.team?.normalized_name||row.team?.name));
    const previewLimit=5;
    const start=rows.length<=previewLimit?0:Math.max(0,Math.min(rows.length-previewLimit,(centuriaIndex<0?0:centuriaIndex-Math.floor(previewLimit/2))));
    const visibleRows=rows.slice(start,start+previewLimit);
    const body=visibleRows.map((row,index)=>{
      const team=row.team||{};
      const logo=imageUrl(team.logo);
      const isCenturia=normalize(team.normalized_name||team.name).includes('centuria athl');
      return `<tr${isCenturia?' class="ca-home-centuria-row-v1320" data-ca-home-centuria="true"':''}>
        <td class="ca-home-place-v1320">${start+index+1}</td>
        <td class="ca-home-team-v1320">${teamNoteCrestHtml(team,'ca-home-crest-v1320')}<b>${esc(team.name||'Клуб')}</b></td>
        <td>${row.p}</td><td class="ca-home-points-v1320">${row.pts}</td>
      </tr>`;
    }).join('');
    return `<table class="ca-home-standings-table-v1320" aria-label="Турнірна таблиця ${esc(league.name)}">
      <thead><tr><th>#</th><th>КОМАНДА</th><th>І</th><th>ОЧ</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  };

  const renderHomeStandings=(message='')=>{
    const host=document.getElementById(HOME_ROOT_ID);
    if(!host)return;
    const title=document.getElementById('homeAnalyticsLeagueNameV1320');
    const createButton=document.querySelector('#homeAnalyticsCardV1312 [data-ca-create-league]');
    if(createButton)createButton.hidden=!isAdmin();
    const active=leagues.find(league=>league.id===activeId)||leagues[0];
    if(!active){
      if(title)title.textContent='ТУРНІРНА ТАБЛИЦЯ ЛІГИ';
      host.innerHTML=`<div class="ca-home-standings-state-v1320">${esc(message||'ЛІГУ ЩЕ НЕ ДОДАНО')}</div>`;
      return;
    }
    activeId=active.id;
    if(title)title.textContent=active.name||'ТУРНІРНА ТАБЛИЦЯ';
    host.innerHTML=homeTableHtml(active);
  };

  async function refreshHomeStandings(){
    const screen=document.getElementById('screen-home');
    const host=document.getElementById(HOME_ROOT_ID);
    if(!screen?.classList.contains('active')||!host)return;
    const api=window.CenturiaAnalyticsLeagueApi;
    const thisRequest=++homeRequestNo;
    if(!api?.isReady?.()){
      host.innerHTML='<div class="ca-home-standings-state-v1320">ЗАВАНТАЖУЮ ТАБЛИЦЮ…</div>';
      return;
    }
    host.innerHTML='<div class="ca-home-standings-state-v1320">ЗАВАНТАЖУЮ ТАБЛИЦЮ…</div>';
    try{
      const data=await api.list();
      if(thisRequest!==homeRequestNo||!screen.classList.contains('active'))return;
      leagues=data;
      if(!leagues.some(league=>league.id===activeId))activeId=leagues[0]?.id||'';
      const active=leagues.find(league=>league.id===activeId)||leagues[0];
      if(active){
        try{
          await loadLeagueData(active);
          if(thisRequest!==homeRequestNo)return;
        }catch(_error){}
      }
      if(thisRequest!==homeRequestNo)return;
      renderHomeStandings();
    }catch(error){
      if(thisRequest!==homeRequestNo)return;
      renderHomeStandings(failMessage(error));
    }
  }

  const render=()=>{
    const host=root();
    if(!host)return;
    if(loading){host.innerHTML=emptyHtml('ЗАВАНТАЖЕННЯ ЛІГИ','Зачекай, відкриваємо турнірну таблицю.');return;}
    const active=leagues.find(league=>league.id===activeId)||leagues[0];
    if(!active){host.innerHTML=`${emptyHtml()}${cupPanelHtml()}`;return;}
    activeId=active.id;
    const options=leagues.length>1?`<select class="ca-analytics-select-v1317" aria-label="Обрати лігу" data-ca-league-select>${leagues.map(league=>`<option value="${esc(league.id)}" ${league.id===active.id?'selected':''}>${esc(league.name)}</option>`).join('')}</select>`:'';
    host.innerHTML=`<article class="ca-analytics-panel-v1317">
      <div class="ca-analytics-panel-head-v1317">
        <div class="ca-analytics-panel-title-v1317"><small>ТУРНІРНА ТАБЛИЦЯ</small><h2>${esc(active.name)}</h2><p>${esc(leagueMeta(active))}</p></div>
        <div class="ca-analytics-panel-actions-v1317">${options}${isAdmin()?'<button type="button" class="ca-analytics-primary-v1317" data-ca-create-league>＋ НОВА ЛІГА</button>':''}</div>
      </div>
      <div id="caAnalyticsTableWindowV1318" class="ca-analytics-table-window-v1318" data-ca-table-window tabindex="0" role="region" aria-label="Скорочена прокручувана турнірна таблиця">
        ${tableHtml(active)}
      </div>
      <div class="ca-analytics-table-controls-v1318 ca-analytics-open-actions-v1319">
        <button type="button" class="ca-analytics-table-toggle-v1318" data-ca-open-table>ВІДКРИТИ ТАБЛИЦЮ</button>
        <button type="button" class="ca-analytics-table-toggle-v1318" data-ca-open-history>ІСТОРІЯ МАТЧІВ</button>
        ${isAdmin()?'<button type="button" class="ca-analytics-table-toggle-v1318" data-ca-add-league-match>＋ ДОДАТИ МАТЧ</button>':''}
      </div>
      <p class="ca-analytics-note-v1317">Матчі та рахунки ліги додаються вручну й зібрані в окремій історії.</p>
    </article>${cupPanelHtml()}${teamFormHtml(active)}${seasonGoalsHtml(active)}${teamHistoryHtml(active)}`;
    if(!seasonGoalsLoaded&&!seasonGoalsLoading&&isReady())void loadSeasonGoals();
    if(!teamHistoryLoaded&&!teamHistoryLoading&&isReady())void loadTeamHistory();
  };

  async function refreshLeagues(){
    const host=root();
    if(!host||!document.getElementById('screen-analytics')?.classList.contains('active'))return;
    const thisRequest=++requestNo;
    loading=true;render();
    try{
      const data=await window.CenturiaAnalyticsLeagueApi.list();
      if(thisRequest!==requestNo)return;
      leagues=data;
      try{
        cups=await window.CenturiaAnalyticsCupApi.list();cupsError='';
        if(!cups.some(cup=>String(cup.id)===String(activeCupId)))activeCupId=String(cups[0]?.id||'');
        const selectedCup=cups.find(cup=>String(cup.id)===String(activeCupId));
        cupMatches=selectedCup?(cupMatchesById.get(String(selectedCup.id))||await fetchCupMatches(selectedCup)):[];
        if(selectedCup)cupMatchesById.set(String(selectedCup.id),cupMatches);
      }catch(cupError){
        cups=[];cupMatches=[];cupsError='Кубковий розділ ще не підключений до бази. Після встановлення пакета виконай SQL-міграцію v13.36.';
      }
      if(!leagues.some(league=>league.id===activeId))activeId=leagues[0]?.id||'';
      const active=leagues.find(league=>league.id===activeId);
      if(active){
        try{await loadLeagueData(active);}catch(_error){}
      }
      loading=false;render();
    }catch(error){
      if(thisRequest!==requestNo)return;
      loading=false;
      host.innerHTML=emptyHtml('НЕ ВДАЛОСЯ ЗАВАНТАЖИТИ',failMessage(error));
    }
  }

  const closeModal=()=>{
    [MODAL_ID,TABLE_MODAL_ID,HISTORY_MODAL_ID,MATCH_STATS_MODAL_ID,CUP_MODAL_ID,RESULT_MODAL_ID,TEAM_NOTE_MODAL_ID,TEAM_HISTORY_SEASON_MODAL_ID].forEach(id=>document.getElementById(id)?.remove());
    document.body.classList.remove('ca-analytics-modal-open-v1317');
  };
  const openTeamNoteModal=async({teamKey,teamName,logo}={})=>{
    const key=clean(teamKey)||normalize(teamName),name=clean(teamName)||'Команда',crest=imageUrl(logo);
    if(!key)return;
    if(!client()||!user()){toast('Увійди в акаунт, щоб переглянути примітку');return;}
    closeModal();
    const overlay=document.createElement('div');overlay.id=TEAM_NOTE_MODAL_ID;overlay.className='ca-analytics-modal-v1317 ca-team-note-overlay-v1338';
    overlay.innerHTML=`<section class="ca-analytics-dialog-v1317 ca-team-note-dialog-v1338" role="dialog" aria-modal="true" aria-labelledby="caTeamNoteTitleV1338"><header class="ca-analytics-modal-head-v1317 ca-team-note-head-v1338"><div class="ca-team-note-heading-v1338">${crest?`<img src="${esc(crest)}" alt="" referrerpolicy="no-referrer">`:''}<div><small class="ca-analytics-modal-kicker-v1317">ЦЕНТР АНАЛІТИКИ · КОМАНДА</small><h2 id="caTeamNoteTitleV1338">${esc(name)}</h2></div></div><button type="button" class="ca-analytics-close-v1317" data-ca-team-note-close aria-label="Закрити примітку">×</button></header><div class="ca-team-note-body-v1338" data-ca-team-note-body><p>Завантажую примітку…</p></div></section>`;
    document.body.appendChild(overlay);document.body.classList.add('ca-analytics-modal-open-v1317');
    overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-ca-team-note-close]'))closeModal();});
    attachWindowClose(overlay);
    let record=null,draft='',loading=true,saving=false,status='';
    const body=overlay.querySelector('[data-ca-team-note-body]');
    const paint=()=>{
      if(loading){body.innerHTML='<p class="ca-team-note-state-v1338">Завантажую примітку…</p>';return;}
      if(canEditTeamNotes()){
        body.innerHTML=`<form class="ca-team-note-form-v1338"><label for="caTeamNoteTextV1338">ПРИМІТКА ПРО КОМАНДУ</label><textarea id="caTeamNoteTextV1338" name="teamNote" maxlength="2000" placeholder="Додай інформацію про команду…" ${saving?'disabled':''}>${esc(draft)}</textarea><div class="ca-team-note-form-foot-v1338"><small>${draft.length}/2000 · Зберігати можуть адмін і редактори</small><button type="submit" class="ca-analytics-primary-v1317" ${saving?'disabled':''}>${saving?'ЗБЕРІГАЮ…':'ЗБЕРЕГТИ'}</button></div>${status?`<p class="ca-team-note-status-v1338" role="status">${esc(status)}</p>`:''}</form>`;
        const form=body.querySelector('form'),textarea=form.querySelector('textarea');
        textarea.addEventListener('input',()=>{draft=textarea.value;const count=form.querySelector('.ca-team-note-form-foot-v1338 small');if(count)count.textContent=`${draft.length}/2000 · Зберігати можуть адмін і редактори`;});
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(saving)return;draft=textarea.value;saving=true;status='';paint();
          try{record=await window.CenturiaAnalyticsTeamNoteApi.save({teamKey:key,teamName:name,note:draft});draft=String(record?.note||'');status='Примітку збережено.';toast('Примітку збережено');}
          catch(error){status=failMessage(error);toast(failMessage(error));}
          finally{saving=false;if(document.getElementById(TEAM_NOTE_MODAL_ID))paint();}
        });
      }else{
        const note=String(record?.note||'');
        body.innerHTML=note?`<div class="ca-team-note-read-v1338">${esc(note)}</div>${record?.updated_at?`<small class="ca-team-note-updated-v1338">Оновлено ${esc(new Date(record.updated_at).toLocaleDateString('uk-UA'))}</small>`:''}`:'<div class="ca-team-note-state-v1338">Примітку про цю команду ще не додано.</div>';
      }
    };
    try{record=await window.CenturiaAnalyticsTeamNoteApi.get(key);draft=String(record?.note||'');}
    catch(error){status=failMessage(error);if(canEditTeamNotes())draft='';}
    loading=false;paint();
    if(status&&!canEditTeamNotes())body.innerHTML=`<p class="ca-analytics-error-v1317">${esc(status)}</p>`;
  };
  const attachWindowClose=overlay=>overlay.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
  const openTableModal=()=>{
    const active=leagues.find(league=>league.id===activeId)||leagues[0];
    if(!active)return;
    closeModal();
    const overlay=document.createElement('div');
    overlay.id=TABLE_MODAL_ID;
    overlay.className='ca-analytics-window-overlay-v1319';
    overlay.innerHTML=`<section class="ca-analytics-window-v1319" role="dialog" aria-modal="false" aria-labelledby="caAnalyticsTableTitleV1319">
      <header class="ca-analytics-window-head-v1319"><div><small>CENTURIA ATHLETICS · АНАЛІТИКА</small><h2 id="caAnalyticsTableTitleV1319">${esc(active.name)}</h2><p>${esc(leagueMeta(active))}</p></div><button type="button" class="ca-analytics-window-close-v1319" data-ca-close-window aria-label="Закрити таблицю">×</button></header>
      <div class="ca-analytics-window-body-v1319" role="region" tabindex="0" aria-label="Повна турнірна таблиця">
        <div class="ca-analytics-full-table-scroll-v1319">${tableHtml(active)}</div>
        <p class="ca-analytics-note-v1317">Переміщуй список вбік, щоб побачити всі показники.</p>
      </div>
    </section>`;
    document.body.appendChild(overlay);
    attachWindowClose(overlay);
  };
  const openHistoryModal=async()=>{
    const active=leagues.find(league=>league.id===activeId)||leagues[0];
    if(!active)return;
    closeModal();
    const overlay=document.createElement('div');
    overlay.id=HISTORY_MODAL_ID;
    overlay.className='ca-analytics-window-overlay-v1319';
    overlay.innerHTML=`<section class="ca-analytics-window-v1319" role="dialog" aria-modal="false" aria-labelledby="caAnalyticsHistoryTitleV1319">
      <header class="ca-analytics-window-head-v1319"><div><small>${esc(active.name)} · МАТЧІ</small><h2 id="caAnalyticsHistoryTitleV1319">ІСТОРІЯ МАТЧІВ</h2><p>У «Моїх матчах» також показані заплановані і перенесені матчі Центурії з календаря.</p></div><button type="button" class="ca-analytics-window-close-v1319" data-ca-close-window aria-label="Закрити історію матчів">×</button></header>
      <div class="ca-analytics-window-body-v1319 ca-analytics-history-body-v1321">
        <div class="ca-analytics-history-tabs-v1321" role="tablist" aria-label="Фільтр матчів">
          <button type="button" id="caHistoryMineTabV1321" class="active" data-ca-history-tab="0" role="tab" aria-selected="true" aria-controls="caHistoryMinePageV1321">МОЇ МАТЧІ</button>
          <button type="button" id="caHistoryAllTabV1321" data-ca-history-tab="1" role="tab" aria-selected="false" aria-controls="caHistoryAllPageV1321">УСІ МАТЧІ</button>
        </div>
        <div class="ca-analytics-history-swipe-v1321" data-ca-history-swipe>
          <section id="caHistoryMinePageV1321" class="ca-analytics-history-page-v1321" data-ca-history-page="mine" role="tabpanel" aria-labelledby="caHistoryMineTabV1321" tabindex="0">
            <div data-ca-history-list="mine"><p>Завантажую історію…</p></div>
          </section>
          <section id="caHistoryAllPageV1321" class="ca-analytics-history-page-v1321" data-ca-history-page="all" role="tabpanel" aria-labelledby="caHistoryAllTabV1321" tabindex="0">
            <div data-ca-history-list="all"><p>Завантажую історію…</p></div>
          </section>
        </div>
      </div>
    </section>`;
    document.body.appendChild(overlay);
    attachWindowClose(overlay);
    const swipe=overlay.querySelector('[data-ca-history-swipe]');
    const tabs=[...overlay.querySelectorAll('[data-ca-history-tab]')];
    const setHistoryPage=index=>{
      const bounded=Math.max(0,Math.min(1,index));
      tabs.forEach((tab,tabIndex)=>{
        const selected=tabIndex===bounded;
        tab.classList.toggle('active',selected);
        tab.setAttribute('aria-selected',selected?'true':'false');
      });
      if(swipe)swipe.scrollTo({left:bounded*swipe.clientWidth,behavior:'smooth'});
    };
    tabs.forEach(tab=>tab.addEventListener('click',()=>setHistoryPage(Number(tab.dataset.caHistoryTab)||0)));
    let scrollFrame=0;
    swipe?.addEventListener('scroll',()=>{
      if(scrollFrame)return;
      scrollFrame=requestAnimationFrame(()=>{
        scrollFrame=0;
        const width=Math.max(1,swipe.clientWidth);
        const index=Math.max(0,Math.min(1,Math.round(swipe.scrollLeft/width)));
        tabs.forEach((tab,tabIndex)=>{
          const selected=tabIndex===index;
          tab.classList.toggle('active',selected);
          tab.setAttribute('aria-selected',selected?'true':'false');
        });
      });
    },{passive:true});
    try{
      const matches=await loadLeagueData(active);
      if(!document.getElementById(HISTORY_MODAL_ID))return;
      render();renderHomeStandings();
      const roundNumbers=historyRoundNumbers(matches);
      const mine=matches.filter(match=>normalize(`${match.home_team_name||''} ${match.away_team_name||''}`).includes('centuria athl'));
      let upcomingCalendarMatches=[];
      try{upcomingCalendarMatches=await fetchUpcomingCenturiaCalendarMatches(active);}catch(_error){toast('Не вдалося завантажити майбутні матчі з календаря');}
      const fixtureKey=match=>[clean(match.match_date),normalize(match.home_team_name),normalize(match.away_team_name)].join('|');
      const existingMineKeys=new Set(mine.map(fixtureKey));
      const myMatches=[...mine,...upcomingCalendarMatches.filter(match=>!existingMineKeys.has(fixtureKey(match)))];
      const myRoundNumbers=new Map([...roundNumbers,...historyRoundNumbers(upcomingCalendarMatches)]);
      const mineList=overlay.querySelector('[data-ca-history-list="mine"]');
      const allList=overlay.querySelector('[data-ca-history-list="all"]');
      if(mineList)mineList.innerHTML=matchHistoryHtml(myMatches,myRoundNumbers,'Матчів Centuria Athletics ще немає',true);
      if(allList){
        allList.innerHTML=matchRoundsTabsHtml(matches,roundNumbers);
        const roundTabs=[...allList.querySelectorAll('[data-ca-round-tab]')];
        const roundPanels=[...allList.querySelectorAll('[data-ca-round-panel]')];
        const activateRound=key=>{
          roundTabs.forEach(tab=>{
            const selected=tab.dataset.caRoundTab===key;
            tab.classList.toggle('active',selected);
            tab.setAttribute('aria-selected',selected?'true':'false');
            tab.tabIndex=selected?0:-1;
          });
          roundPanels.forEach(panel=>{panel.hidden=panel.dataset.caRoundPanel!==key;});
        };
        roundTabs.forEach((tab,index)=>{
          tab.addEventListener('click',()=>activateRound(tab.dataset.caRoundTab));
          tab.addEventListener('keydown',event=>{
            let next=index;
            if(event.key==='ArrowRight')next=(index+1)%roundTabs.length;
            else if(event.key==='ArrowLeft')next=(index-1+roundTabs.length)%roundTabs.length;
            else if(event.key==='Home')next=0;
            else if(event.key==='End')next=roundTabs.length-1;
            else return;
            event.preventDefault();
            roundTabs[next].focus();
            activateRound(roundTabs[next].dataset.caRoundTab);
          });
        });
      }
    }catch(error){
      overlay.querySelectorAll('[data-ca-history-list]').forEach(list=>list.innerHTML=`<p class="ca-analytics-error-v1317">${esc(failMessage(error))}</p>`);
    }
  };

  const openCupCreateModal=async()=>{
    if(!isAdmin())return;
    if(!clubApi()?.isReady?.()){toast('Увійди в акаунт, щоб обрати клуби');return;}
    closeModal();
    const overlay=document.createElement('div');overlay.id=CUP_MODAL_ID;overlay.className='ca-analytics-modal-v1317 ca-cup-create-overlay-v1337';
    overlay.innerHTML=`<div class="ca-analytics-dialog-v1317 ca-cup-create-dialog-v1337" role="dialog" aria-modal="true" aria-labelledby="caCupModalTitleV1337"><header class="ca-analytics-modal-head-v1317"><div><small class="ca-analytics-modal-kicker-v1317">CENTURIA ANALYTICS · ADMIN</small><h2 id="caCupModalTitleV1337">СТВОРИТИ КУБОК</h2><p>Спочатку обери лігу, потім команди з її бази. Це кубок для перегляду реальних матчів — без реєстрації та голосувань.</p></div><button type="button" class="ca-analytics-close-v1317" data-ca-cup-close aria-label="Закрити">×</button></header><form class="ca-analytics-form-v1317 ca-cup-create-form-v1337"><div class="ca-analytics-form-fields-v1317"><label class="ca-analytics-field-v1317">НАЗВА КУБКА<input name="cupName" type="text" maxlength="70" placeholder="Наприклад, CENTURIA CUP" required></label><label class="ca-analytics-field-v1317">1. ОБЕРИ ЛІГУ<select name="cupLeague" required><option value="" selected disabled>Спочатку обери лігу</option></select></label><label class="ca-analytics-field-v1317 ca-cup-search-field-v1337" data-ca-cup-search-wrap hidden>ПОШУК КОМАНДИ В ЦІЙ ЛІЗІ<input name="clubSearch" type="search" placeholder="Почни вводити назву команди"></label></div><div class="ca-analytics-club-list-head-v1317"><span>2. ОБЕРИ КОМАНДИ</span><b data-ca-cup-selected-count>Обрано 0 команд</b></div><div class="ca-analytics-club-list-v1317 ca-cup-create-club-list-v1337" data-ca-cup-clubs><p>Завантажую базу ліг і клубів…</p></div><footer class="ca-analytics-modal-foot-v1317 ca-cup-create-foot-v1337"><button type="button" class="ca-analytics-secondary-v1317" data-ca-cup-close>СКАСУВАТИ</button><button type="submit" class="ca-analytics-primary-v1317" data-ca-cup-submit disabled>СТВОРИТИ КУБОК</button></footer></form></div>`;
    document.body.appendChild(overlay);document.body.classList.add('ca-analytics-modal-open-v1317');
    const form=overlay.querySelector('form'),list=overlay.querySelector('[data-ca-cup-clubs]'),search=overlay.querySelector('[name="clubSearch"]'),searchWrap=overlay.querySelector('[data-ca-cup-search-wrap]'),leagueSelect=overlay.querySelector('[name="cupLeague"]'),nameField=overlay.querySelector('[name="cupName"]'),submit=overlay.querySelector('[data-ca-cup-submit]'),selectedCount=overlay.querySelector('[data-ca-cup-selected-count]'),selected=new Set();
    let clubs=[],leagueNames=new Map(),groupNames=new Map(),selectedLeague='',saving=false;
    const update=()=>{selectedCount.textContent=`Обрано ${selected.size} команд`;submit.disabled=saving||!clean(nameField.value)||selected.size<2;submit.textContent=saving?'ЗБЕРІГАЮ…':'СТВОРИТИ КУБОК';};
    const paint=()=>{
      if(!selectedLeague){list.innerHTML='<p class="ca-analytics-club-meta-v1317">Спочатку обери лігу зі списку вище.</p>';return;}
      const query=normalize(search.value),visible=clubs.filter(club=>clean(club.league_code).toUpperCase()===selectedLeague).filter(club=>normalize(club.name).includes(query));
      if(!visible.length){list.innerHTML=`<p class="ca-analytics-club-meta-v1317">${query?'У цій лізі команд за таким пошуком не знайдено.':'У цій лізі ще немає команд у базі клубів.'}</p>`;return;}
      list.innerHTML=visible.map(club=>{const key=clean(club.normalized_name)||normalize(club.name),logo=imageUrl(club.logo);return `<label class="ca-analytics-club-option-v1317"><input type="checkbox" data-ca-cup-club="${esc(key)}" ${selected.has(key)?'checked':''}><span class="ca-analytics-crest-v1317">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'⚽'}</span><span class="ca-analytics-club-meta-v1317"><b>${esc(club.name)}</b><small>${esc(clubMeta(club,leagueNames,groupNames))}</small></span></label>`;}).join('');
      list.querySelectorAll('[data-ca-cup-club]').forEach(input=>input.addEventListener('change',()=>{input.checked?selected.add(input.dataset.caCupClub):selected.delete(input.dataset.caCupClub);update();}));
    };
    overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-ca-cup-close]')){overlay.remove();document.body.classList.remove('ca-analytics-modal-open-v1317');}});
    search.addEventListener('input',paint);nameField.addEventListener('input',update);
    leagueSelect.addEventListener('change',()=>{selectedLeague=clean(leagueSelect.value).toUpperCase();search.value='';searchWrap.hidden=!selectedLeague;paint();});
    form.addEventListener('submit',async event=>{event.preventDefault();if(saving)return;const chosen=clubs.filter(club=>selected.has(clean(club.normalized_name)||normalize(club.name)));saving=true;update();try{const created=await window.CenturiaAnalyticsCupApi.create({name:nameField.value,teams:chosen});cups=[created,...cups];activeCupId=String(created.id);cupMatches=[];cupMatchesById.set(String(created.id),[]);overlay.remove();document.body.classList.remove('ca-analytics-modal-open-v1317');render();toast(`Кубок «${created.name}» створено`);}catch(error){saving=false;update();toast(failMessage(error));}});
    try{const [clubRows,leagueRows,groupRows]=await Promise.all([clubApi().list(),clubApi().listLeagues(),clubApi().listGroups()]);clubs=Array.isArray(clubRows)?clubRows:[];const availableLeagues=Array.isArray(leagueRows)?leagueRows:[];leagueNames=new Map(availableLeagues.map(row=>[clean(row.code).toUpperCase(),clean(row.name)]));groupNames=new Map((Array.isArray(groupRows)?groupRows:[]).map(row=>[clean(row.code).toUpperCase(),`${clean(row.flag)} ${clean(row.name)}`.trim()]));if(!availableLeagues.length){leagueSelect.innerHTML='<option value="" selected disabled>У базі ще немає ліг</option>';list.innerHTML='<p>У базі клубів поки немає доступних ліг.</p>';}else{leagueSelect.innerHTML='<option value="" selected disabled>Спочатку обери лігу</option>'+availableLeagues.map(row=>`<option value="${esc(clean(row.code).toUpperCase())}">${esc(row.name)}</option>`).join('');paint();}}catch(error){list.innerHTML=`<p class="ca-analytics-error-v1317">${esc(failMessage(error))}</p>`;}
    update();setTimeout(()=>nameField.focus(),50);
  };

  const openResultModal=(kind,competition,match=null)=>{
    if(!isAdmin()||!competition)return;
    closeModal();
    const teams=Array.isArray(competition.teams)?competition.teams:[];
    if(teams.length<2){toast('У турнірі мають бути щонайменше дві команди');return;}
    const localToday=()=>{const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());return now.toISOString().slice(0,10);};
    const overlay=document.createElement('div');overlay.id=RESULT_MODAL_ID;overlay.className='ca-analytics-modal-v1317';
    const homeDefault=match?.home_team_name||teams[0]?.name,awayDefault=match?.away_team_name||teams.find(team=>team.name!==homeDefault)?.name;
    const selectOptions=selected=>teams.map(team=>`<option value="${esc(team.name)}" ${team.name===selected?'selected':''}>${esc(team.name)}</option>`).join('');
    overlay.innerHTML=`<div class="ca-analytics-dialog-v1317 ca-result-dialog-v1336" role="dialog" aria-modal="true" aria-labelledby="caResultTitleV1336"><header class="ca-analytics-modal-head-v1317"><div><small class="ca-analytics-modal-kicker-v1317">${kind==='cup'?'КУБОК':'ЛІГА'} · ${esc(competition.name)}</small><h2 id="caResultTitleV1336">${match?'ЗМІНИТИ МАТЧ':'ДОДАТИ МАТЧ'}</h2><p>Матч без рахунку можна зберегти зараз, а результат внести після гри.</p></div><button type="button" class="ca-analytics-close-v1317" data-ca-result-close aria-label="Закрити">×</button></header><form class="ca-analytics-form-v1317"><div class="ca-result-fields-v1336"><label class="ca-analytics-field-v1317">РАУНД<input name="round" type="number" min="1" max="100" step="1" value="${esc(match?.round_number||1)}" required></label><label class="ca-analytics-field-v1317">ДАТА<input name="date" type="date" value="${esc(match?.match_date||localToday())}" required></label><label class="ca-analytics-field-v1317">ЧАС<input name="time" type="time" value="${esc(clean(match?.match_time).slice(0,5))}"></label><label class="ca-analytics-field-v1317">ДОМA<select name="home">${selectOptions(homeDefault)}</select></label><label class="ca-analytics-field-v1317">ВИЇЗД<select name="away">${selectOptions(awayDefault)}</select></label><label class="ca-analytics-field-v1317">РАХУНОК · ДОМA<input name="homeScore" type="number" min="0" step="1" inputmode="numeric" placeholder="—" value="${match?.home_score??''}"></label><label class="ca-analytics-field-v1317">РАХУНОК · ВИЇЗД<input name="awayScore" type="number" min="0" step="1" inputmode="numeric" placeholder="—" value="${match?.away_score??''}"></label></div><footer class="ca-analytics-modal-foot-v1317"><button type="button" class="ca-analytics-secondary-v1317" data-ca-result-close>СКАСУВАТИ</button><button type="submit" class="ca-analytics-primary-v1317" data-ca-result-save>ЗБЕРЕГТИ МАТЧ</button></footer></form></div>`;
    document.body.appendChild(overlay);document.body.classList.add('ca-analytics-modal-open-v1317');
    overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-ca-result-close]')){overlay.remove();document.body.classList.remove('ca-analytics-modal-open-v1317');}});
    overlay.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget,home=form.elements.home.value,away=form.elements.away.value,hs=clean(form.elements.homeScore.value),as=clean(form.elements.awayScore.value),round=Number(form.elements.round.value);
      if(home===away){toast('Обери дві різні команди');return;}if(!Number.isInteger(round)||round<1||round>100){toast('Раунд має бути від 1 до 100');return;}if(Boolean(hs)!==Boolean(as)){toast('Вкажи обидва голи або залиш рахунок порожнім');return;}
      const homeScore=hs===''?null:Number(hs),awayScore=as===''?null:Number(as);if([homeScore,awayScore].some(score=>score!==null&&(!Number.isInteger(score)||score<0))){toast('Рахунок має бути цілим числом від 0');return;}
      const homeTeam=teams.find(team=>team.name===home),awayTeam=teams.find(team=>team.name===away),payload={match_date:form.elements.date.value,match_time:form.elements.time.value||null,competition_name:competition.name,home_team_name:home,home_team_image:homeTeam?.logo||null,away_team_name:away,away_team_image:awayTeam?.logo||null,home_score:homeScore,away_score:awayScore,match_kind:kind,round_number:round,match_status:homeScore===null?'scheduled':'played',cup_id:kind==='cup'?competition.id:null};
      const button=form.querySelector('[data-ca-result-save]');button.disabled=true;button.textContent='ЗБЕРІГАЮ…';
      try{const db=client();if(!db||!user())throw new Error('Увійди в акаунт, щоб зберегти матч');let request=db.from('centuria_analytics_matches');request=match?request.update(payload).eq('id',match.id):request.insert(payload);const {error}=await request;if(error)throw error;overlay.remove();document.body.classList.remove('ca-analytics-modal-open-v1317');if(kind==='league'){matchesByLeague.delete(competition.id);const latest=leagues.find(item=>item.id===competition.id)||competition;await loadLeagueData(latest);}else{cupMatchesById.delete(String(competition.id));cupMatches=await fetchCupMatches(competition);cupMatchesById.set(String(competition.id),cupMatches);}render();renderHomeStandings();toast('Матч збережено');}catch(error){button.disabled=false;button.textContent='ЗБЕРЕГТИ МАТЧ';toast(failMessage(error));}
    });
  };

  const openCreateModal=async()=>{
    if(!isAdmin())return;
    if(!clubApi()?.isReady?.()){toast('Увійди в акаунт, щоб обрати клуби');return;}
    closeModal();
    const overlay=document.createElement('div');
    overlay.id=MODAL_ID;
    overlay.className='ca-analytics-modal-v1317';
    overlay.innerHTML=`<div class="ca-analytics-dialog-v1317" role="dialog" aria-modal="true" aria-labelledby="caAnalyticsModalTitleV1317">
      <header class="ca-analytics-modal-head-v1317"><div><small class="ca-analytics-modal-kicker-v1317">CENTURIA ATHLETICS · ADMIN</small><h2 id="caAnalyticsModalTitleV1317">СТВОРИТИ ЛІГУ</h2><p>Вкажи назву та вибери команди зі спільної бази клубів.</p></div><button type="button" class="ca-analytics-close-v1317" data-ca-close aria-label="Закрити">×</button></header>
      <form class="ca-analytics-form-v1317">
        <div class="ca-analytics-form-fields-v1317"><label class="ca-analytics-field-v1317">НАЗВА ЛІГИ<input name="leagueName" type="text" maxlength="70" placeholder="Наприклад, EURO FAST" autocomplete="off" required></label><label class="ca-analytics-field-v1317">ПОШУК КЛУБУ<input name="clubSearch" type="search" placeholder="Почни вводити назву команди" autocomplete="off"></label></div>
        <div class="ca-analytics-club-list-head-v1317"><span>ОБЕРИ КОМАНДИ</span><b data-ca-selected-count>Обрано 0</b></div>
        <div class="ca-analytics-club-list-v1317" data-ca-club-list aria-live="polite"><p>Завантажую базу клубів…</p></div>
        <div class="ca-analytics-modal-foot-v1317"><button type="button" class="ca-analytics-secondary-v1317" data-ca-close>СКАСУВАТИ</button><button type="submit" class="ca-analytics-primary-v1317" data-ca-submit disabled>СТВОРИТИ ЛІГУ</button></div>
      </form>
    </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('ca-analytics-modal-open-v1317');
    const form=overlay.querySelector('form');
    const list=overlay.querySelector('[data-ca-club-list]');
    const search=overlay.querySelector('[name="clubSearch"]');
    const nameField=overlay.querySelector('[name="leagueName"]');
    const submit=overlay.querySelector('[data-ca-submit]');
    const selectedCount=overlay.querySelector('[data-ca-selected-count]');
    const selected=new Set();
    let clubs=[];
    let leagueNames=new Map();
    let groupNames=new Map();
    let saving=false;

    const updateForm=()=>{
      const count=selected.size;
      selectedCount.textContent=`Обрано ${count} команд`;
      submit.disabled=saving||!clean(nameField.value)||count<2;
      submit.textContent=saving?'ЗБЕРІГАЮ…':'СТВОРИТИ ЛІГУ';
    };
    const renderClubs=()=>{
      const query=normalize(search.value);
      const visible=clubs.filter(club=>{
        const meta=clubMeta(club,leagueNames,groupNames);
        return !query||normalize(`${club.name} ${meta}`).includes(query);
      });
      if(!visible.length){list.innerHTML='<p class="ca-analytics-club-meta-v1317">Клубів за цим пошуком не знайдено.</p>';return;}
      list.innerHTML=visible.map((club,index)=>{
        const key=clean(club.normalized_name)||normalize(club.name);
        const logo=imageUrl(club.logo);
        const meta=clubMeta(club,leagueNames,groupNames);
        return `<label class="ca-analytics-club-option-v1317"><input type="checkbox" data-ca-club-key="${esc(key)}" ${selected.has(key)?'checked':''}><span class="ca-analytics-crest-v1317">${logo?`<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'⚽'}</span><span class="ca-analytics-club-meta-v1317"><b>${esc(club.name)}</b><small>${esc(meta)}</small></span></label>`;
      }).join('');
      list.querySelectorAll('[data-ca-club-key]').forEach(input=>input.addEventListener('change',()=>{
        const key=input.dataset.caClubKey;
        if(input.checked)selected.add(key);else selected.delete(key);
        updateForm();
      }));
    };

    overlay.addEventListener('click',event=>{
      if(event.target===overlay||event.target.closest('[data-ca-close]'))closeModal();
    });
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
    search.addEventListener('input',renderClubs);
    nameField.addEventListener('input',updateForm);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(saving)return;
      const chosen=clubs.filter(club=>selected.has(clean(club.normalized_name)||normalize(club.name)));
      if(chosen.length<2){toast('Обери щонайменше дві команди');return;}
      saving=true;updateForm();
      try{
        const created=await window.CenturiaAnalyticsLeagueApi.create({name:nameField.value,teams:chosen});
        leagues=[created,...leagues.filter(league=>league.id!==created.id)];
        activeId=created.id;
        matchesByLeague.delete(created.id);
        matchStatsByLeague.delete(created.id);
        closeModal();render();renderHomeStandings();
        toast(`Лігу «${created.name}» створено`);
      }catch(error){
        saving=false;updateForm();
        toast(failMessage(error));
      }
    });

    try{
      const [clubRows,leagueRows,groupRows]=await Promise.all([
        clubApi().list(),clubApi().listLeagues(),clubApi().listGroups()
      ]);
      clubs=Array.isArray(clubRows)?clubRows:[];
      leagueNames=new Map((Array.isArray(leagueRows)?leagueRows:[]).map(row=>[clean(row.code).toUpperCase(),clean(row.name)]));
      groupNames=new Map((Array.isArray(groupRows)?groupRows:[]).map(row=>[clean(row.code).toUpperCase(),`${clean(row.flag)} ${clean(row.name)}`.trim()]));
      if(!clubs.length)list.innerHTML='<p>У базі клубів ще немає команд.</p>';
      else renderClubs();
    }catch(error){
      list.innerHTML=`<p class="ca-analytics-error-v1317">${esc(failMessage(error))}</p>`;
    }
    updateForm();
    setTimeout(()=>nameField.focus(),50);
  };

  document.addEventListener('submit',event=>{
    const form=event.target.closest?.('[data-ca-season-goals-form]');
    if(!form)return;
    event.preventDefault();
    if(seasonGoalsSaving)return;
    const textarea=form.querySelector('textarea[name="seasonGoals"]');
    const targetPlace=Number(form.querySelector('select[name="targetPlace"]')?.value)||null;
    const button=form.querySelector('button[type="submit"]');
    seasonGoalsSaving=true;
    if(button){button.disabled=true;button.textContent='ЗБЕРІГАЮ…';}
    const status=()=>form.querySelector('.ca-season-goals-status-v1343');
    void (async()=>{
      try{
        seasonGoalsRecord=await window.CenturiaAnalyticsTeamNoteApi.save({teamKey:SEASON_GOALS_KEY,teamName:'Цілі Centuria Athletics на сезон',note:JSON.stringify({version:1,text:textarea?.value||'',targetPlace})});
        seasonGoalsError='';
        let message=status();
        if(!message){message=document.createElement('p');message.className='ca-season-goals-status-v1343';message.setAttribute('role','status');form.appendChild(message);}
        message.textContent='Цілі на сезон збережено.';
        seasonGoalsSaving=false;
        render();
        toast('Цілі на сезон збережено');
      }catch(error){
        seasonGoalsError=failMessage(error);
        let message=status();
        if(!message){message=document.createElement('p');message.className='ca-season-goals-status-v1343';message.setAttribute('role','status');form.appendChild(message);}
        message.textContent=seasonGoalsError;
        toast(seasonGoalsError);
      }finally{
        seasonGoalsSaving=false;
        if(button){button.disabled=false;button.textContent='ЗБЕРЕГТИ ЦІЛІ';}
      }
    })();
  });

  document.addEventListener('click',event=>{
    const homeAnalyticsCard=event.target.closest?.('#homeAnalyticsCardV1312');
    if(homeAnalyticsCard&&!event.target.closest?.('[data-nav],[data-ca-create-league],[data-ca-team-note]')){
      homeAnalyticsCard.querySelector('.ca-analytics-entry-head-v1312[data-nav="analytics"]')?.click();
      return;
    }
    const teamNoteTrigger=event.target.closest?.('[data-ca-team-note]');
    if(teamNoteTrigger){void openTeamNoteModal({teamKey:teamNoteTrigger.dataset.caTeamNote,teamName:teamNoteTrigger.dataset.caTeamNoteName,logo:teamNoteTrigger.dataset.caTeamNoteLogo});return;}
    const matchStatsTrigger=event.target.closest?.('[data-ca-open-match-stats]');
    if(matchStatsTrigger&&!event.target.closest?.('[data-ca-edit-league-match]')){
      const matchId=matchStatsTrigger.dataset.caOpenMatchStats;
      const match=(matchesByLeague.get(activeId)||[]).find(item=>String(item.id)===String(matchId));
      if(match)void openMatchStatsModal(match);
      return;
    }
    const teamHistorySeason=event.target.closest?.('[data-ca-open-team-history-season]');
    if(teamHistorySeason){openTeamHistorySeasonModal(teamHistorySeason.dataset.caOpenTeamHistorySeason);return;}
    if(event.target.closest?.('[data-ca-close-window]')){closeModal();return;}
    const createButton=event.target.closest?.('[data-ca-create-league]');
    if(createButton){openCreateModal();return;}
    const createCupButton=event.target.closest?.('[data-ca-create-cup]');
    if(createCupButton){
      if(!isAdmin())return;
      void openCupCreateModal();
      return;
    }
    if(event.target.closest?.('[data-ca-add-league-match]')){const active=leagues.find(item=>item.id===activeId);if(active)openResultModal('league',active);return;}
    if(event.target.closest?.('[data-ca-add-cup-match]')){const cup=cups.find(item=>String(item.id)===String(activeCupId))||cups[0];if(cup)openResultModal('cup',cup);return;}
    const editCup=event.target.closest?.('[data-ca-edit-cup-match]');
    if(editCup){const cup=cups.find(item=>String(item.id)===String(activeCupId))||cups[0],match=cupMatches.find(item=>String(item.id)===String(editCup.dataset.caEditCupMatch));if(cup&&match)openResultModal('cup',cup,match);return;}
    const editLeague=event.target.closest?.('[data-ca-edit-league-match]');
    if(editLeague){const league=leagues.find(item=>item.id===activeId),match=(matchesByLeague.get(activeId)||[]).find(item=>String(item.id)===String(editLeague.dataset.caEditLeagueMatch));if(league&&match)openResultModal('league',league,match);return;}
    const deleteCup=event.target.closest?.('[data-ca-delete-cup]');
    if(deleteCup){if(!isAdmin())return;const cup=cups.find(item=>String(item.id)===String(deleteCup.dataset.caDeleteCup));if(!cup)return;if(!window.confirm(`Видалити кубок «${cup.name}» разом із матчами?`))return;void (async()=>{try{await window.CenturiaAnalyticsCupApi.delete(cup.id);cups=cups.filter(item=>String(item.id)!==String(cup.id));cupMatchesById.delete(String(cup.id));if(String(activeCupId)===String(cup.id)){activeCupId=String(cups[0]?.id||'');const next=cups[0];cupMatches=next?await fetchCupMatches(next):[];if(next)cupMatchesById.set(String(next.id),cupMatches);}render();toast('Кубок видалено');}catch(error){toast(failMessage(error));}})();return;}
    if(event.target.closest?.('[data-ca-open-table]')){openTableModal();return;}
    if(event.target.closest?.('[data-ca-open-history]')){openHistoryModal();return;}
  });

  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target?.id==='homeAnalyticsCardV1312'){
      event.preventDefault();
      event.target.querySelector('.ca-analytics-entry-head-v1312[data-nav="analytics"]')?.click();
      return;
    }
    if(event.key!=='Enter'&&event.key!==' ')return;
    const trigger=event.target.closest?.('[data-ca-open-match-stats]');
    if(!trigger||event.target.closest?.('[data-ca-edit-league-match]'))return;
    event.preventDefault();
    const matchId=trigger.dataset.caOpenMatchStats;
    const match=(matchesByLeague.get(activeId)||[]).find(item=>String(item.id)===String(matchId));
    if(match)void openMatchStatsModal(match);
  });

  document.addEventListener('change',event=>{
    const select=event.target.closest?.('[data-ca-league-select]');
    if(select){
      activeId=select.value;render();
      const active=leagues.find(league=>league.id===activeId);
      if(active)loadLeagueData(active).then(()=>{if(activeId===active.id)render();if(activeId===active.id)renderHomeStandings();}).catch(()=>{});
      return;
    }
    const cupSelect=event.target.closest?.('[data-ca-cup-select]');if(!cupSelect)return;
    activeCupId=String(cupSelect.value||'');const cup=cups.find(item=>String(item.id)===activeCupId);
    if(!cup){cupMatches=[];render();return;}
    cupMatches=cupMatchesById.get(activeCupId)||[];render();
    if(!cupMatchesById.has(activeCupId))fetchCupMatches(cup).then(matches=>{if(activeCupId===String(cup.id)){cupMatches=matches;cupMatchesById.set(activeCupId,matches);render();}}).catch(error=>{cupsError='Не вдалося завантажити матчі кубка.';render();toast(failMessage(error));});
  });

  const init=()=>{
    const screen=document.getElementById('screen-analytics');
    const home=document.getElementById('screen-home');
    if(!screen||!root())return;
    if(screen.classList.contains('active'))refreshLeagues();
    if(home?.classList.contains('active'))refreshHomeStandings();
    if(window.MutationObserver){
      new MutationObserver(()=>{
        if(screen.classList.contains('active'))refreshLeagues();
      }).observe(screen,{attributes:true,attributeFilter:['class']});
      if(home)new MutationObserver(()=>{
        if(home.classList.contains('active'))refreshHomeStandings();
      }).observe(home,{attributes:true,attributeFilter:['class']});
    }
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden&&screen.classList.contains('active'))refreshLeagues();
      if(!document.hidden&&home?.classList.contains('active'))refreshHomeStandings();
    });
    try{
      const db=client();
      db?.auth?.onAuthStateChange(()=>{
        if(screen.classList.contains('active'))refreshLeagues();
        if(home?.classList.contains('active'))refreshHomeStandings();
      });
    }catch(_e){}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
