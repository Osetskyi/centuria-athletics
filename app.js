
const POSITIONS = [
  ["GK","ВРТ"],["LB","ЛЗ"],["CB","ЦЗ"],["RB","ПЗ"],
  ["LM","ЛП"],["CM","ЦП"],["CAM","ЦАП"],["RM","ПП"],["ST","ФРВ"]
];
const POS_LABEL = Object.fromEntries(POSITIONS);
const ARCHETYPES = [
  "Стовб","Бомбардир","Чарівник","Іскра","Мозг","Маестро","Переробка",
  "Термінатор","Мотор","Босс","Прогресор","Воротар-ліберо","Стоппер"
];
const PLAYER_PLACEHOLDER = "player-placeholder.png";
const ARCHETYPE_ICONS = {"Стовб": "archetype-target.png", "Бомбардир": "archetype-scorer.png", "Чарівник": "archetype-wizard.png", "Іскра": "archetype-spark.png", "Мозг": "archetype-brain.png", "Маестро": "archetype-maestro.png", "Переробка": "archetype-recycling.png", "Термінатор": "archetype-terminator.png", "Мотор": "archetype-motor.png", "Босс": "archetype-boss.png", "Прогресор": "archetype-progressor.png", "Воротар-ліберо": "archetype-sweeper_keeper.png", "Стоппер": "archetype-stopper.png"};

const PLAYER_STATUSES = [
  ["","Без статусу"],
  ["Капітан","Капітан"],
  ["Віце-капітан","Віце-капітан"],
  ["Перегляд","Перегляд"]
];

function decodePlayerNote(raw){
  const text=raw||"";
  if(text.startsWith("~C~")) return {status:"Капітан",note:text.slice(3)};
  if(text.startsWith("~V~")) return {status:"Віце-капітан",note:text.slice(3)};
  if(text.startsWith("~P~")) return {status:"Перегляд",note:text.slice(3)};
  return {status:"",note:text};
}
function encodePlayerNote(status,note){
  const marker=status==="Капітан"?"~C~":status==="Віце-капітан"?"~V~":status==="Перегляд"?"~P~":"";
  const maxLen=100-marker.length;
  return marker+(note||"").slice(0,maxLen);
}
const PLAYER_PLATFORMS = ["PS5","XBOX","PC"];

function platformIcon(platform){
  const src=platform==="PS5"
    ? "platform-ps5.png"
    : platform==="XBOX"
      ? "platform-xbox.png"
      : "platform-pc.png";
  return `<img src="${src}" alt="${platform}" class="platform-logo-img">`;
}

function selectPlatform(value){
  const normalized=PLAYER_PLATFORMS.includes(value)?value:"";
  const hidden=$("platformValue");
  if(hidden)hidden.value=normalized;
  const picker=$("platformPicker");
  const buttons=picker?picker.querySelectorAll(".platform-option"):document.querySelectorAll(".platform-option");
  buttons.forEach(btn=>{
    const isSelected=btn.dataset.value===normalized;
    btn.classList.remove("active");
    btn.classList.toggle("selected",isSelected);
    btn.setAttribute("aria-pressed",isSelected?"true":"false");
    btn.setAttribute("aria-checked",isSelected?"true":"false");
  });
}


const FORMATIONS = {
  "451":[
    ["ST",50,13],
    ["CAM",36,31],["CAM",64,31],
    ["LM",15,46],["CM",50,50],["RM",85,46],
    ["LB",15,73],["CB",38,78],["CB",62,78],["RB",85,73],
    ["GK",50,91]
  ],
  "352":[
    ["ST",36,14],["ST",64,14],
    ["CAM",50,36],
    ["LM",13,49],["CM",36,53],["CM",64,53],["RM",87,49],
    ["CB",25,72],["CB",50,74],["CB",75,72],
    ["GK",50,92]
  ],
  "4411":[
    ["ST",50,13],
    ["CAM",50,31],
    ["LM",15,48],["CM",39,52],["CM",61,52],["RM",85,48],
    ["LB",15,74],["CB",38,79],["CB",62,79],["RB",85,74],
    ["GK",50,92]
  ]
};

let db;
let players = [];
let squads = [];

const LOCAL_SQUADS_FALLBACK_KEY="ca_saved_squads_fallback_v780";

function getLocalFallbackSquads(){
  try{
    const raw=JSON.parse(localStorage.getItem(LOCAL_SQUADS_FALLBACK_KEY)||"[]");
    return Array.isArray(raw)?raw:[];
  }catch{
    return [];
  }
}

function setLocalFallbackSquads(items){
  try{
    localStorage.setItem(LOCAL_SQUADS_FALLBACK_KEY,JSON.stringify(items||[]));
  }catch(err){
    console.warn("Local saved-lineup fallback write failed",err);
  }
}

function upsertLocalFallbackSquad(s){
  const arr=getLocalFallbackSquads();
  const next={...s,_localOnly:true};
  const idx=arr.findIndex(v=>v.id===next.id);
  if(idx>=0)arr[idx]=next;
  else arr.unshift(next);
  setLocalFallbackSquads(arr);
  return next;
}

function removeLocalFallbackSquad(id){
  const arr=getLocalFallbackSquads().filter(v=>v.id!==id);
  setLocalFallbackSquads(arr);
}

function mergeSavedSquads(cloud,local){
  const byId=new Map();
  [...(local||[]),...(cloud||[])].forEach(s=>{
    if(s?.id)byId.set(s.id,s);
  });
  return [...byId.values()].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

function isSavedLineupFormationConstraintError(err){
  const msg=String(err?.message||"");
  return err?.code==="23514" || msg.includes("saved_lineups_formation_check");
}
const storedFormation = localStorage.getItem("ca_formation");
let currentFormation = storedFormation === "3421" ? "352" : (FORMATIONS[storedFormation] ? storedFormation : "451");
if(storedFormation !== currentFormation) localStorage.setItem("ca_formation", currentFormation);
let lineup = JSON.parse(localStorage.getItem("ca_lineup") || "{}");
let filter = "ALL";
let editPlayerId = null;
let currentCardImage = "";
let pickerSlotKey = null;
let pickerSlotPos = null;

const $ = id => document.getElementById(id);

const SUPABASE_URL = "https://tjcsdjwwfpymdvqxvydz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_j_phVep2a32cSfbqZdaG-g_Px226mbE";
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

const PUSH_VAPID_PUBLIC_KEY = "BIMWCYmu8nL2nThwPAqg0lqLpKl3FZvXymVev74PUSW0M6KdjslTVOjkBRs8x9DVS8serHq3fdsW2WzIgwLgL-E";
let pushRegistration = null;
let currentPushSubscription = null;

function base64UrlToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}

function pushSupported(){
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registerPushServiceWorker(){
  if(!pushSupported())return null;
  try{
    pushRegistration = await navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});
    await navigator.serviceWorker.ready;
    return pushRegistration;
  }catch(err){
    console.warn("Service worker registration failed",err);
    return null;
  }
}

async function savePushSubscription(subscription){
  if(!sb || !authUser || !subscription)return false;
  const j=subscription.toJSON();
  const payload={
    user_id:authUser.id,
    endpoint:j.endpoint,
    p256dh:j.keys?.p256dh||"",
    auth:j.keys?.auth||"",
    chat_enabled:$("pushChatToggle")?.checked!==false,
    gatherings_enabled:$("pushGatheringsToggle")?.checked!==false,
    user_agent:navigator.userAgent,
    updated_at:new Date().toISOString()
  };
  const {error}=await sb.from("push_subscriptions").upsert(payload,{onConflict:"endpoint"});
  if(error){
    console.warn("Push subscription save failed",error);
    return false;
  }
  return true;
}

async function refreshPushSettings(){
  const btn=$("pushToggleBtn"), status=$("pushStatus");
  const chatToggle=$("pushChatToggle"), gatheringToggle=$("pushGatheringsToggle");
  if(!btn || !status)return;

  if(!pushSupported()){
    btn.disabled=true;
    status.textContent="Цей браузер не підтримує push-сповіщення.";
    if(chatToggle)chatToggle.disabled=true;
    if(gatheringToggle)gatheringToggle.disabled=true;
    return;
  }
  if(!authUser){
    btn.disabled=true;
    btn.textContent="УВІМКНУТИ СПОВІЩЕННЯ";
    status.textContent="Увійди в акаунт, щоб увімкнути сповіщення.";
    if(chatToggle)chatToggle.disabled=true;
    if(gatheringToggle)gatheringToggle.disabled=true;
    return;
  }

  btn.disabled=false;
  const reg=pushRegistration || await registerPushServiceWorker();
  if(!reg){
    status.textContent="Не вдалося підключити сповіщення.";
    return;
  }
  currentPushSubscription=await reg.pushManager.getSubscription();

  if(Notification.permission==="denied"){
    btn.disabled=true;
    btn.textContent="СПОВІЩЕННЯ ЗАБЛОКОВАНО";
    status.textContent="Дозвіл заблоковано в налаштуваннях браузера/телефону.";
    if(chatToggle)chatToggle.disabled=true;
    if(gatheringToggle)gatheringToggle.disabled=true;
    return;
  }

  if(!currentPushSubscription){
    btn.textContent="УВІМКНУТИ СПОВІЩЕННЯ";
    status.textContent="Сповіщення вимкнені.";
    if(chatToggle)chatToggle.disabled=true;
    if(gatheringToggle)gatheringToggle.disabled=true;
    return;
  }

  btn.textContent="ВИМКНУТИ СПОВІЩЕННЯ";
  status.textContent="Сповіщення увімкнені ✅";
  if(chatToggle)chatToggle.disabled=false;
  if(gatheringToggle)gatheringToggle.disabled=false;

  const {data}=await sb.from("push_subscriptions")
    .select("chat_enabled,gatherings_enabled")
    .eq("user_id",authUser.id)
    .eq("endpoint",currentPushSubscription.endpoint)
    .maybeSingle();
  if(data){
    if(chatToggle)chatToggle.checked=data.chat_enabled!==false;
    if(gatheringToggle)gatheringToggle.checked=data.gatherings_enabled!==false;
  }else{
    await savePushSubscription(currentPushSubscription);
  }
}

async function togglePushNotifications(){
  if(!authUser){ openAuthModal(); return; }
  const reg=pushRegistration || await registerPushServiceWorker();
  if(!reg){ showToast("Сповіщення не підтримуються"); return; }
  let sub=await reg.pushManager.getSubscription();
  if(sub){
    const endpoint=sub.endpoint;
    try{ await sub.unsubscribe(); }catch(_e){}
    if(sb)await sb.from("push_subscriptions").delete().eq("user_id",authUser.id).eq("endpoint",endpoint);
    currentPushSubscription=null;
    showToast("Сповіщення вимкнено");
    await refreshPushSettings();
    return;
  }

  const permission=await Notification.requestPermission();
  if(permission!=="granted"){
    showToast("Дозвіл на сповіщення не надано");
    await refreshPushSettings();
    return;
  }
  try{
    sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:base64UrlToUint8Array(PUSH_VAPID_PUBLIC_KEY)
    });
    currentPushSubscription=sub;
    if(await savePushSubscription(sub))showToast("Сповіщення увімкнено");
    else showToast("Не вдалося зберегти підписку");
  }catch(err){
    console.warn("Push subscribe failed",err);
    showToast("Не вдалося увімкнути сповіщення");
  }
  await refreshPushSettings();
}

async function updatePushPreferences(){
  if(!currentPushSubscription || !authUser)return;
  await savePushSubscription(currentPushSubscription);
}

async function sendPushEvent(type,title,body){
  if(!sb || !authUser)return;
  try{
    const {error}=await sb.functions.invoke("send-push",{body:{type,title,body}});
    if(error)console.warn("Push send invoke failed",error);
  }catch(err){
    console.warn("Push send failed",err);
  }
}


let authUser = null;
let authRole = "viewer";
let authProfile = null;
let authAccessStatus = "guest";
let adminSiteAccessProfilesV629 = [];
let teamProfiles = new Map();
let chatMessages = [];
let chatAttachment = null;
let chatPresenceChannel = null;
let chatPollTimer = null;
let chatLastSignature = "";

/* v8.03 chat state */
let chatReplyTarget = null;
let chatEditingMessageId = null;
let chatEditingReplyLine = "";
let chatTypingTimer = null;
let chatIsTyping = false;
let chatUnreadBoundaryId = null;
let chatMessageMenuEl = null;
let chatReactionsV808 = new Map();
let chatReadsV817 = new Map();
let chatMentionsMineV817 = new Map();
let chatMentionMenuElV817 = null;

const CHAT_META_SEP = "\u2063\u2063";
const CHAT_META_NIBBLE_BASE = 0xFE00;
const CHAT_REACTION_EMOJIS = ["👍","🔥","😂","⚽","❤️"];
let voiceRecorder=null;
let voiceStream=null;
let voiceChunks=[];
let voiceStartedAt=0;
let voiceTimer=null;
let voiceSeconds=0;
let gatherings=[];
let gatheringLineupSlots=[];
let gatheringLineupPickerState=null;
let gatheringVotes=[];
let gatheringsMode="active";
let gatheringsPollTimer=null;


let homeNextEventData=null;
let homeNextEventTimer=null;
let trainingDays=[];
let trainingStats=[];
let officialMatchStats=[];
let currentTrainingDay=null;
let currentTrainingGathering=null;
let generalStatsSort="average";
let homeMvpData=null;
let calendarMatches=[];
let calendarGatherings=[];
let calendarCursor=new Date();
calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);
let calendarSelectedDate=null;
let calendarSelectedMatch=null;
let calendarDraftImages={competition:null,home:null,away:null};

let tacticalBoards=[];
let tacticalBoardId=null;
let tbSelected=null;
let tbArrowMode=false;
let tbArrowDraft=null;
let tbDrag=null;
let tbState={markers:[],ball:{x:50,y:70,visible:true},arrows:[]};





function canEditSite(){
  return authRole === "admin" || authRole === "editor";
}

function applyPermissions(){
  const editable = canEditSite();
  ["addPlayerBtn","addPlayerBig","saveLineupBtn","newLineupBtn","clearPlayersBtn","clearSquadsBtn","editPlayerBtn","viewDeletePlayerBtn","deletePlayerBtn","tbSaveBtn","tbNewBtn","tbAddOwnBtn","tbAddOpponentBtn","tbBallBtn","tbArrowBtn","tbUndoBtn","tbDeleteSelectedBtn","tbClearBtn","saveCalendarMatchBtn","editCalendarMatchBtn","transferCalendarMatchBtn","confirmTransferMatchBtn","cancelTransferMatchBtn","deleteCalendarMatchBtn","addAnotherCalendarMatchBtn","chooseMatchCompetitionImage","chooseMatchHomeImage","chooseMatchAwayImage","saveTrainingDayBtn","editTrainingDayBtn","deleteTrainingDayBtn","createTrainingFromDayBtn","createMatchFromDayBtn","editOfficialStatsBtn"].forEach(id=>{
    const el=$(id);
    if(el) el.classList.toggle("permission-hidden", !editable);
  });

  document.body.classList.toggle("read-only", !editable);
  refreshEditOnlyVisibility();
  refreshTacticalBoardPermissions();
  refreshCalendarPermissions();

  const btn=$("authBtn");
  if(btn){
    if(authUser){
      const nick=authProfile?.display_name || authUser.email?.split("@")[0] || "Акаунт";
      if(authRole==="admin"){
        btn.textContent=`АДМІН: ${nick}`;
      }else if(authRole==="editor"){
        btn.textContent=`РЕДАКТОР: ${nick}`;
      }else{
        btn.textContent=`@${nick}`;
      }
      btn.classList.toggle("is-admin", authRole==="admin");
      btn.classList.toggle("is-editor", authRole==="editor");
    }else{
      btn.textContent = "ВХІД / РЕЄСТРАЦІЯ";
      btn.classList.remove("is-admin","is-editor");
    }
  }
}

function refreshEditOnlyVisibility(){
  const editable=canEditSite();
  ["editPlayerBtn","viewDeletePlayerBtn","deletePlayerBtn","clearPlayersBtn","clearSquadsBtn"].forEach(id=>{
    const el=$(id);
    if(el) el.classList.toggle("permission-hidden", !editable);
  });
}




function refreshCalendarPermissions(){
  const editable=canEditSite();
  document.querySelectorAll(".calendar-match-edit-only").forEach(el=>el.classList.toggle("permission-hidden",!editable));
  const editing=!$("calendarMatchEdit")?.classList.contains("hidden");
  if(editing && !editable){
    $("calendarMatchEdit")?.classList.add("hidden");
    if(calendarSelectedMatch)$("calendarMatchView")?.classList.remove("hidden");
  }
}

function refreshTacticalBoardPermissions(){
  const editable=canEditSite();
  document.querySelectorAll(".tb-edit-only").forEach(el=>el.classList.toggle("permission-hidden",!editable));
  ["tbNameInput","tbCategoryInput","tbDescriptionInput"].forEach(id=>{
    const el=$(id); if(el) el.disabled=!editable;
  });
  const del=$("tbDeleteBoardBtn");
  if(del)del.classList.toggle("permission-hidden",!editable || !tacticalBoardId);
  const hint=$("tbModeHint");
  if(hint && !editable)hint.textContent="Режим перегляду. Редагування доступне admin/editor.";
}


function currentHasSiteAccessV629(){
  return !!authUser && (authRole==="admin" || authAccessStatus==="approved");
}

function renderSiteAccessGateV629(){
  const gate=$("siteAccessGate");
  if(!gate)return;

  const allowed=currentHasSiteAccessV629();
  gate.classList.toggle("hidden",allowed);
  document.body.classList.toggle("site-access-locked",!allowed);

  const title=$("siteAccessTitle");
  const text=$("siteAccessText");
  const user=$("siteAccessUser");
  const login=$("siteAccessLoginBtn");
  const check=$("siteAccessCheckBtn");
  const logout=$("siteAccessLogoutBtn");

  if(allowed)return;

  if(!authUser){
    if(title)title.textContent="ЗАКРИТИЙ ДОСТУП";
    if(text)text.textContent="Цей сайт доступний тільки учасникам, яких підтвердив адміністратор.";
    if(user){user.textContent="";user.classList.add("hidden");}
    login?.classList.remove("hidden");
    check?.classList.add("hidden");
    logout?.classList.add("hidden");
    return;
  }

  const nick=authProfile?.display_name || authUser.email || "Користувач";
  if(user){
    user.textContent=nick;
    user.classList.remove("hidden");
  }
  login?.classList.add("hidden");
  check?.classList.remove("hidden");
  logout?.classList.remove("hidden");

  if(authAccessStatus==="blocked"){
    if(title)title.textContent="ДОСТУП ЗАБЛОКОВАНО";
    if(text)text.textContent="Адміністратор закрив доступ цьому акаунту. Якщо це помилка — звернись до адміністратора.";
  }else{
    if(title)title.textContent="ОЧІКУЄ ПІДТВЕРДЖЕННЯ";
    if(text)text.textContent="Акаунт створено. ADMIN має дозволити доступ до сайту.";
  }
}

async function refreshSiteAccessOnlyV629(){
  if(!sb||!authUser)return;
  const {data,error}=await sb.from("profiles")
    .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at")
    .eq("user_id",authUser.id)
    .maybeSingle();
  if(error)return;
  const previous=authAccessStatus;
  // v6.64: never replace a complete profile with a partial access-check row.
  // avatar_url is selected explicitly and we merge defensively so the avatar
  // cannot disappear during the 12-second access refresh.
  if(data) authProfile={...(authProfile||{}),...data};
  if(data?.role)authRole=data.role;
  authAccessStatus=data?.access_status||"pending";
  renderSiteAccessGateV629();

  if(previous!==authAccessStatus){
    if(currentHasSiteAccessV629()){
      await refreshAuth();
      showToast("Доступ до сайту дозволено");
    }else if(authAccessStatus==="blocked"){
      try{ await stopChatPresence(); }catch(_e){}
    }
  }
}

async function loadAdminSiteAccessV629(){
  const card=$("adminSiteAccessCard");
  // v6.62: never force this accordion open while refreshing admin data.
  if(card){
    if(authRole!=="admin") setSiteAccessPanelV662(false);
    else setSiteAccessPanelV662(card.dataset.expanded==="true");
  }
  if(!sb||!authUser||authRole!=="admin"){
    adminSiteAccessProfilesV629=[];
    return;
  }

  const {data,error}=await sb.from("profiles")
    .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at")
    .order("created_at",{ascending:false});
  if(error){
    console.error("Access profiles load",error);
    return;
  }
  adminSiteAccessProfilesV629=data||[];
  renderAdminSiteAccessV629();
}

function accessStatusLabelV629(status){
  if(status==="approved")return "ДОЗВОЛЕНО";
  if(status==="blocked")return "ЗАБЛОКОВАНО";
  return "ОЧІКУЄ";
}

function renderAdminSiteAccessV629(){
  const box=$("adminSiteAccessList");
  const badge=$("siteAccessPendingBadge");
  if(!box)return;

  const list=[...adminSiteAccessProfilesV629].sort((a,b)=>{
    const order={pending:0,blocked:1,approved:2};
    return (order[a.access_status]??3)-(order[b.access_status]??3) ||
      String(a.display_name||"").localeCompare(String(b.display_name||""),"uk");
  });

  const pending=list.filter(p=>p.access_status==="pending").length;
  if(badge)badge.textContent=pending?String(pending):"";

  if(!list.length){
    box.innerHTML='<div class="empty-state">Акаунтів немає.</div>';
    return;
  }

  box.innerHTML=list.map(p=>{
    const self=p.user_id===authUser?.id;
    const isAdmin=p.role==="admin";
    const status=p.access_status||"pending";
    const player=p.player_id ? players.find(x=>x.id===p.player_id) : null;

    return `<div class="site-access-member ${status}">
      <div class="site-access-member-main">
        ${profileAvatarHtml(p,"member-avatar")}
        <div class="site-access-member-info">
          <strong>${esc(p.display_name||"Гравець")}</strong>
          <small>${esc(String(p.role||"viewer").toUpperCase())}${player?` · ${esc(player.name)}`:""}</small>
        </div>
        <span class="site-access-status ${status}">${accessStatusLabelV629(status)}</span>
      </div>
      <div class="site-access-member-actions">
        ${self||isAdmin
          ? `<span class="site-access-self">ГОЛОВНИЙ ADMIN</span>`
          : `
            ${status!=="approved"?`<button type="button" class="gold-btn compact" data-access-approve="${p.user_id}">ДОЗВОЛИТИ</button>`:""}
            ${status!=="blocked"?`<button type="button" class="dark-btn compact" data-access-block="${p.user_id}">ЗАБЛОКУВАТИ</button>`:""}
            <button type="button" class="danger-btn compact" data-access-delete="${p.user_id}">ВИДАЛИТИ</button>
          `}
      </div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-access-approve]").forEach(btn=>{
    btn.addEventListener("click",()=>setMemberAccessV629(btn.dataset.accessApprove,"approved"));
  });
  box.querySelectorAll("[data-access-block]").forEach(btn=>{
    btn.addEventListener("click",()=>setMemberAccessV629(btn.dataset.accessBlock,"blocked"));
  });
  box.querySelectorAll("[data-access-delete]").forEach(btn=>{
    btn.addEventListener("click",()=>deleteMemberAccountV629(btn.dataset.accessDelete));
  });
}

async function setMemberAccessV629(userId,status){
  if(!sb||authRole!=="admin")return;
  const p=adminSiteAccessProfilesV629.find(x=>x.user_id===userId);
  const verb=status==="approved"?"дозволити доступ":"заблокувати доступ";
  if(!confirm(`${verb.charAt(0).toUpperCase()+verb.slice(1)} для ${p?.display_name||"цього акаунта"}?`))return;

  const {error}=await sb.rpc("admin_set_member_access",{target_user:userId,new_status:status});
  if(error){
    console.error(error);
    alert("Не вдалося змінити доступ: "+error.message);
    return;
  }
  showToast(status==="approved"?"Доступ дозволено":"Доступ заблоковано");
  await loadAdminSiteAccessV629();
  await loadTeamProfiles();
  renderMembersList();
}

async function deleteMemberAccountV629(userId){
  if(!sb||authRole!=="admin")return;
  const p=adminSiteAccessProfilesV629.find(x=>x.user_id===userId);
  const name=p?.display_name||"цей акаунт";
  if(!confirm(`Повністю видалити ${name} із сайту?\n\nАкаунт, його повідомлення, голосування та прив’язки буде видалено. Цю дію не можна скасувати.`))return;

  const {error}=await sb.rpc("admin_delete_member",{target_user:userId});
  if(error){
    console.error(error);
    alert("Не вдалося видалити акаунт: "+error.message);
    return;
  }
  showToast("Акаунт видалено");
  await loadAdminSiteAccessV629();
  await loadTeamProfiles();
  renderMembersList();
}

async function refreshAuth(){
  if(!sb){
    applyPermissions();
    return;
  }
  const {data}=await sb.auth.getSession();
  authUser=data?.session?.user||null;
  authRole="viewer";
  authProfile=null;

  if(authUser){
    const {data:profile}=await sb.from("profiles")
      .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at")
      .eq("user_id",authUser.id)
      .maybeSingle();
    authProfile=profile||null;
    if(profile?.role) authRole=profile.role;
    authAccessStatus=profile?.access_status||"pending";
  }else{
    authAccessStatus="guest";
  }

  renderSiteAccessGateV629();
  applyPermissions();
  // v6.63: authProfile arrives asynchronously, so refresh the visible
  // Settings profile card only after the real profile has been loaded.
  try{ if(typeof syncSettingsV659==="function") syncSettingsV659(); }catch(_e){}
  try{ if(typeof syncHomeGreeting==="function") syncHomeGreeting(); }catch(_e){}

  if(!currentHasSiteAccessV629()){
    try{ await stopChatPresence(); }catch(_e){}
    if(authRole==="admin")await loadAdminSiteAccessV629();
    return;
  }

  const adminAccessPromise=authRole==="admin" ? loadAdminSiteAccessV629() : Promise.resolve();

  // v6.63: Home is the first screen, so its data must not wait behind chat,
  // push settings and other secondary requests. Start the critical requests
  // together to eliminate the several-second Home layout/content jump.
  const homeEventPromise=loadHomeNextEvent();
  const playersPromise=getAll("players").then(data=>{
    players=data||[];
    renderPlayers();
    renderPitch();
    return players;
  });
  const statsPromise=loadStatisticsData();
  const squadsPromise=getAll("squads").then(data=>{
    squads=data||[];
    renderSquads();
    return squads;
  });

  const secondaryPromise=Promise.allSettled([
    adminAccessPromise,
    refreshPushSettings(),
    refreshChatAuthState(),
    refreshGatheringsAuthState()
  ]);

  const critical=await Promise.allSettled([playersPromise,statsPromise,homeEventPromise]);
  critical.forEach(r=>{if(r.status==="rejected")console.error("Home critical refresh error",r.reason);});

  /* v7.54: once players + statistics are ready, an ADMIN/EDITOR can safely
     finalize any completed month. The routine is idempotent and skips awards
     that already exist. */
  try{
    if(typeof autoIssueCompletedMonthlyAwardsV754==="function") await autoIssueCompletedMonthlyAwardsV754();
  }catch(err){ console.warn("v7.54 automatic monthly awards",err); }

  // Statistics can finish before the players query. Repaint MVP once both
  // critical datasets have settled so the player ID can always resolve.
  try{ await loadLatestMvp(); }catch(err){ console.warn("Home MVP refresh error",err); }

  refreshTacticalBoardPermissions();
  if($("screen-tactical-board")?.classList.contains("active")){ await loadTacticalBoards(); renderTacticalBoard(); }
  if(authUser && $("screen-chat")?.classList.contains("active")){
    await maybeWeeklyChatCleanup();
  }

  const rest=await Promise.allSettled([squadsPromise,secondaryPromise]);
  rest.forEach(r=>{if(r.status==="rejected")console.error("Cloud refresh error",r.reason);});
  try{ if(typeof syncSettingsV659==="function") syncSettingsV659(); }catch(_e){}
}



window.addEventListener("error",e=>{
  console.error("Centuria error:",e.error||e.message);
  const t=document.getElementById("toast");
  if(t){
    t.textContent="Сталася помилка інтерфейсу. Онови сторінку.";
    t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"),3000);
  }
});



/* Shared Supabase data layer */
function openDB(){
  /* Kept as a no-op so the rest of the app initialization stays compatible. */
  return Promise.resolve();
}

function dataUrlToBlob(dataUrl){
  const [meta, data] = dataUrl.split(",");
  const mime = (meta.match(/data:([^;]+)/)||[])[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}


function dataUrlBytes(dataUrl){
  if(!dataUrl || !dataUrl.startsWith("data:"))return 0;
  const comma=dataUrl.indexOf(",");
  if(comma<0)return 0;
  const base64=dataUrl.slice(comma+1);
  return Math.floor(base64.length*3/4);
}

function loadDataUrlImage(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("Не вдалося підготувати прев’ю складу"));
    img.src=dataUrl;
  });
}

async function compressLineupDataUrl(dataUrl,{
  maxBytes=3.2*1024*1024,
  maxWidth=1440,
  startQuality=.92,
  minQuality=.68
}={}){
  if(!dataUrl?.startsWith("data:"))return dataUrl||"";
  if(dataUrlBytes(dataUrl)<=maxBytes)return dataUrl;

  const img=await loadDataUrlImage(dataUrl);
  const scale=Math.min(1,maxWidth/img.naturalWidth);
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));

  const ctx=canvas.getContext("2d");
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,0,0,canvas.width,canvas.height);

  let quality=startQuality;
  let out=canvas.toDataURL("image/jpeg",quality);

  while(dataUrlBytes(out)>maxBytes && quality>minQuality){
    quality=Math.max(minQuality,quality-.06);
    out=canvas.toDataURL("image/jpeg",quality);
  }

  if(dataUrlBytes(out)>maxBytes && canvas.width>1200){
    const smaller=document.createElement("canvas");
    const ratio=1200/canvas.width;
    smaller.width=1200;
    smaller.height=Math.round(canvas.height*ratio);
    const sctx=smaller.getContext("2d");
    sctx.imageSmoothingEnabled=true;
    sctx.imageSmoothingQuality="high";
    sctx.drawImage(canvas,0,0,smaller.width,smaller.height);
    out=smaller.toDataURL("image/jpeg",.82);
  }

  return out;
}

function playerFromDb(p){
  const decoded=decodePlayerNote(p.note || "");
  return {
    id:p.id,
    name:p.name || "",
    number:p.shirt_number ?? "",
    age:p.age ?? "",
    platform:p.platform || "",
    primaryPos:p.primary_position,
    extraPositions:p.extra_positions || [],
    archetype:p.archetype || "",
    status:decoded.status,
    note:decoded.note,
    cardImage:p.card_image_url || "",
    updatedAt:p.updated_at ? new Date(p.updated_at).getTime() : Date.now()
  };
}

function squadFromDb(s){
  return {
    id:s.id,
    name:s.name || "Склад",
    formation:s.formation,
    formationKey:s.formation_key || null,
    lineupSnapshot:s.lineup_snapshot || null,
    createdAt:s.created_at ? new Date(s.created_at).getTime() : Date.now(),
    image:s.image_url || "",
    _localOnly:false
  };
}

async function uploadDataImage(path,dataUrl){
  if(!sb || !dataUrl || !dataUrl.startsWith("data:")) return dataUrl || "";
  const blob=dataUrlToBlob(dataUrl);
  const {error}=await sb.storage.from("centuria-assets").upload(path,blob,{
    upsert:true,
    contentType:blob.type || "image/jpeg",
    cacheControl:"3600"
  });
  if(error) throw error;
  const {data}=sb.storage.from("centuria-assets").getPublicUrl(path);
  return data.publicUrl;
}

async function getAll(store){
  if(!sb) return [];
  if(store==="players"){
    const {data,error}=await sb.from("players")
      .select("*")
      .order("created_at",{ascending:true});
    if(error){console.error(error);showToast("Не вдалося завантажити гравців");return []}
    return (data||[]).map(playerFromDb);
  }
  if(store==="squads"){
    const local=getLocalFallbackSquads();
    const {data,error}=await sb.from("saved_lineups")
      .select("*")
      .order("created_at",{ascending:false});
    if(error){
      console.error(error);
      showToast("Не вдалося завантажити хмарні склади");
      return mergeSavedSquads([],local);
    }
    return mergeSavedSquads((data||[]).map(squadFromDb),local);
  }
  return [];
}

async function put(store,obj){
  if(!sb) throw new Error("Supabase недоступний");
  if(!canEditSite()) throw new Error("Потрібні права редактора");

  if(store==="players"){
    const previousPlayer=players.find(p=>p.id===obj.id);
    const previousCardUrl=previousPlayer?.cardImage || "";
    let cardUrl=obj.cardImage || "";

    /* v6.30: never overwrite the same Storage URL for a replaced card.
       iPhone/Safari and the Supabase CDN can keep the old image cached
       when the path stays players/{id}.png. A unique path guarantees
       that the new card appears immediately everywhere. */
    if(cardUrl.startsWith("data:")){
      const stamp=Date.now();
      cardUrl=await uploadDataImage(`players/${obj.id}-${stamp}.png`,cardUrl);
    }
    const payload={
      id:obj.id,
      name:obj.name,
      shirt_number:obj.number===""||obj.number==null ? null : Number(obj.number),
      age:obj.age===""||obj.age==null ? null : Number(obj.age),
      platform:obj.platform || null,
      primary_position:obj.primaryPos,
      extra_positions:obj.extraPositions || [],
      archetype:obj.archetype || null,
      note:encodePlayerNote(obj.status||"",obj.note||"") || null,
      card_image_url:cardUrl || null,
      created_by:authUser?.id || null
    };
    const {error}=await sb.from("players").upsert(payload,{onConflict:"id"});
    if(error) throw error;

    /* Remove the previous generated player-card file after the DB update.
       Old legacy players/{id}.png files and versioned files are both handled. */
    if(previousCardUrl && previousCardUrl!==cardUrl && previousCardUrl.includes("/storage/v1/object/public/centuria-assets/players/")){
      try{
        const marker="/storage/v1/object/public/centuria-assets/";
        const oldPath=decodeURIComponent(previousCardUrl.split(marker)[1]?.split("?")[0]||"");
        if(oldPath) await sb.storage.from("centuria-assets").remove([oldPath]);
      }catch(cleanErr){
        console.warn("Old player card cleanup skipped",cleanErr);
      }
    }
    return;
  }

  if(store==="squads"){
    let imageUrl=obj.image || "";

    if(imageUrl.startsWith("data:")){
      const storageReady=await compressLineupDataUrl(imageUrl,{
        maxBytes:3.2*1024*1024,
        maxWidth:1080,
        startQuality:.92,
        minQuality:.68
      });

      try{
        imageUrl=await uploadDataImage(`lineups/${obj.id}.jpg`,storageReady);
      }catch(storageErr){
        console.warn("Lineup Storage upload failed; using compact DB fallback",storageErr);
        imageUrl=await compressLineupDataUrl(storageReady,{
          maxBytes:650*1024,
          maxWidth:900,
          startQuality:.78,
          minQuality:.58
        });
      }
    }

    const payload={
      id:obj.id,
      name:obj.name,
      formation:obj.formation,
      image_url:imageUrl,
      created_by:authUser?.id || null
    };

    const {data,error}=await sb.from("saved_lineups")
      .upsert(payload,{onConflict:"id"})
      .select("*")
      .single();

    if(error){
      if(isSavedLineupFormationConstraintError(error)){
        /* Current production DB still accepts only the historical formation set.
           Keep update-build testing functional without mutating production schema. */
        return upsertLocalFallbackSquad({
          ...obj,
          image:imageUrl,
          _localOnly:true
        });
      }
      throw error;
    }

    if(!data?.id) throw new Error("Supabase не підтвердив збереження складу");
    removeLocalFallbackSquad(obj.id);
    return {
      ...squadFromDb(data),
      formationKey:obj.formationKey||null,
      lineupSnapshot:obj.lineupSnapshot||null
    };
  }
}

async function del(store,id){
  if(!sb) throw new Error("Supabase недоступний");
  if(!canEditSite()) throw new Error("Потрібні права редактора");

  if(store==="players"){
    const {error}=await sb.from("players").delete().eq("id",id);
    if(error) throw error;
    await sb.storage.from("centuria-assets").remove([`players/${id}.png`,`players/${id}.jpg`]);
    return;
  }
  if(store==="squads"){
    const local=getLocalFallbackSquads();
    const isLocal=local.some(s=>s.id===id);
    if(isLocal){
      removeLocalFallbackSquad(id);
      try{await sb.storage.from("centuria-assets").remove([`lineups/${id}.jpg`])}catch{}
      return;
    }
    const {error}=await sb.from("saved_lineups").delete().eq("id",id);
    if(error) throw error;
    await sb.storage.from("centuria-assets").remove([`lineups/${id}.jpg`]);
    return;
  }
}

async function clearStore(store){
  if(!sb) throw new Error("Supabase недоступний");
  if(!canEditSite()) throw new Error("Потрібні права редактора");

  if(store==="players"){
    const ids=players.map(p=>p.id);
    const {error}=await sb.from("players").delete().not("id","is",null);
    if(error) throw error;
    if(ids.length) await sb.storage.from("centuria-assets").remove(ids.flatMap(id=>[`players/${id}.png`,`players/${id}.jpg`]));
    return;
  }
  if(store==="squads"){
    const ids=squads.map(s=>s.id);
    setLocalFallbackSquads([]);
    const {error}=await sb.from("saved_lineups").delete().not("id","is",null);
    if(error) throw error;
    if(ids.length) await sb.storage.from("centuria-assets").remove(ids.map(id=>`lineups/${id}.jpg`));
    return;
  }
}
function uid(){return (crypto.randomUUID && crypto.randomUUID()) || (Date.now()+"-"+Math.random().toString(16).slice(2))}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function showToast(text){
  const t=$("toast");t.textContent=text;t.classList.add("show");
  clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove("show"),2500);
}
function formationName(k){return ({"451":"4-5-1","352":"3-5-2","4411":"4-4-1-1"})[k] || "4-5-1"}

function openArenaV664(mode=""){
  // Production v8.46: Arena is intentionally closed until the section is finished.
  showToast('Розділ «Арена» поки недоступний');
}
window.openArenaV664=openArenaV664;

function navigate(name){
  if(name==="arena"){
    openArenaV664();
    return;
  }
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $("screen-"+name).classList.add("active");
  const nav=$("bottomNav");
  nav.classList.toggle("hidden-nav",name==="home" || name==="calendar" || name==="settings" || name==="tactical-board" || name==="squads");
  nav.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.nav===(name==="tactical-board"?"tactics":name)));
  if(name==="home") loadHomeNextEvent();
  if(name==="players") renderPlayers();
  if(name==="tactics") renderPitch();
  if(name==="squads") renderSquads();
  if(name==="chat") openChatScreen();
  if(name==="gatherings") openGatheringsScreen();
  if(name==="calendar") openCalendarScreen();
  if(name==="tactical-board") openTacticalBoardScreen();
  if(name==="settings"){
    setTimeout(refreshPlayerLinkSettingsV590,0);
    setTimeout(syncSettingsV659,0);
  }
}
document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));

function setupFormOptions(){
  const primary=$("primaryPos");
  const extras=$("extraPositions");
  const archetypeMenu=$("archetypeMenu");

  if(primary){
    primary.innerHTML=POSITIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
  }

  if(extras){
    extras.innerHTML=POSITIONS.map(([v,l])=>`<label><input type="checkbox" value="${v}">${l}</label>`).join("");
    extras.addEventListener("change",e=>{
      const checked=[...extras.querySelectorAll("input:checked")];
      if(checked.length>3){e.target.checked=false;showToast("Максимум 3 додаткові позиції");}
    });
  }

  if(archetypeMenu){
    archetypeMenu.innerHTML = ARCHETYPES.map(a=>`
      <button type="button" class="archetype-option" data-value="${a}">
        <img src="${ARCHETYPE_ICONS[a]}" alt="">
        <span>${a}</span>
      </button>`).join("");
    archetypeMenu.querySelectorAll(".archetype-option").forEach(btn=>{
      btn.addEventListener("click",()=>selectArchetype(btn.dataset.value));
    });
  }

  const statusMenu=$("statusMenu");
  if(statusMenu){
    statusMenu.innerHTML=PLAYER_STATUSES.map(([value,label])=>`
      <button type="button" class="status-option ${value?"":"status-none"}" data-value="${value}">
        <span class="status-option-dot"></span>
        <span>${label}</span>
      </button>`).join("");
    statusMenu.querySelectorAll(".status-option").forEach(btn=>{
      btn.addEventListener("click",()=>selectStatus(btn.dataset.value));
    });
  }

  const platformPicker=$("platformPicker");
  if(platformPicker){
    // v7.47: keep a press animation, but drive it with an explicit class on
    // the element that was actually touched. This avoids iOS/PWA showing a
    // phantom :active state on PS5 while Xbox or PC is being pressed.
    platformPicker.setAttribute("role","radiogroup");
    platformPicker.innerHTML=PLAYER_PLATFORMS.map(platform=>`
      <div class="platform-option" data-value="${platform}" role="radio" aria-checked="false" tabindex="0">
        <span class="platform-icon">${platformIcon(platform)}</span>
        <span>${platform}</span>
      </div>`).join("");

    const clearPlatformPress=()=>{
      platformPicker.querySelectorAll(".platform-option.is-pressing").forEach(el=>el.classList.remove("is-pressing"));
    };

    platformPicker.querySelectorAll(".platform-option").forEach(btn=>{
      const pressStart=(e)=>{
        clearPlatformPress();
        btn.classList.add("is-pressing");
        if(e?.type==="pointerdown") e.preventDefault();
        selectPlatform(btn.dataset.value);
      };
      const pressEnd=()=>{
        window.setTimeout(()=>btn.classList.remove("is-pressing"),70);
      };

      btn.addEventListener("pointerdown",pressStart,{passive:false});
      btn.addEventListener("pointerup",pressEnd);
      btn.addEventListener("pointercancel",pressEnd);
      btn.addEventListener("pointerleave",pressEnd);
      btn.addEventListener("click",e=>{
        // Keyboard/legacy click fallback. Pointer taps already select on down.
        if(e.detail===0) selectPlatform(btn.dataset.value);
      });
      btn.addEventListener("keydown",e=>{
        if(e.key==="Enter" || e.key===" "){
          e.preventDefault();
          clearPlatformPress();
          btn.classList.add("is-pressing");
          selectPlatform(btn.dataset.value);
          window.setTimeout(()=>btn.classList.remove("is-pressing"),120);
        }
      });
    });
  }
}


function selectArchetype(value){
  const valueEl=$("archetypeValue");
  const textEl=$("archetypePickerText");
  const iconEl=$("archetypePickerIcon");
  const menuEl=$("archetypeMenu");
  if(valueEl)valueEl.value=value||"";
  if(textEl)textEl.textContent=value||"Обрати архетип";
  if(iconEl){
    iconEl.innerHTML=value?`<img src="${ARCHETYPE_ICONS[value]}" alt="">`:"";
  }
  if(menuEl)menuEl.classList.add("hidden");
}
if($("archetypePickerBtn") && $("archetypeMenu")){
  $("archetypePickerBtn").addEventListener("click",()=>{
    $("archetypeMenu").classList.toggle("hidden");
  });
}

function selectStatus(value){
  const valueEl=$("statusValue");
  const textEl=$("statusPickerText");
  const menuEl=$("statusMenu");
  if(valueEl)valueEl.value=value||"";
  if(textEl)textEl.textContent=value||"Без статусу";
  if(menuEl)menuEl.classList.add("hidden");
}
if($("statusPickerBtn") && $("statusMenu")){
  $("statusPickerBtn").addEventListener("click",()=>{
    $("statusMenu").classList.toggle("hidden");
  });
}


function playerGroup(pos){
  if(pos==="GK")return "GK";
  if(["LB","CB","RB"].includes(pos))return "DEF";
  if(["LM","CM","CAM","RM"].includes(pos))return "MID";
  return "ATT";
}

/* v7.54 — current Player of the Month visual title */
let currentPlayerOfMonthV754={playerId:null,awardDate:null,monthLabel:""};
function isCurrentPlayerOfMonthV754(playerId){
  return !!playerId && currentPlayerOfMonthV754.playerId===playerId;
}

function renderPlayers(){
  const q=$("playerSearch").value.trim().toLowerCase();
  let arr=players.filter(p=>(filter==="ALL"||playerGroup(p.primaryPos)===filter));
  if(q)arr=arr.filter(p=>p.name.toLowerCase().includes(q));
  $("playersCount").textContent=`${players.length} ГРАВЦІВ`;
  const grid=$("playersGrid");
  if(!arr.length){
    grid.innerHTML=`<div class="empty-state"><strong>${players.length?"НІЧОГО НЕ ЗНАЙДЕНО":"ГРАВЦІВ ЩЕ НЕМАЄ"}</strong><span>${players.length?"Зміни фільтр або пошук.":(canEditSite()?"Додай першого гравця кнопкою нижче.":"Гравців ще не додано.")}</span></div>`;
    return;
  }
  grid.innerHTML="";
  arr.forEach(p=>{
    const isPom=isCurrentPlayerOfMonthV754(p.id);
    const card=document.createElement("article");card.className=`player-card${isPom?" current-player-of-month":""}`;
    card.innerHTML=`
      <div class="img-wrap"><img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">${isPom?`<span class="player-of-month-badge">👑 ГРАВЕЦЬ МІСЯЦЯ</span>`:""}</div>
      <button class="edit-mini" aria-label="Редагувати">✎</button>
      <div class="player-meta"><strong>${esc(p.name)}</strong><span>#${esc(p.number||"—")} • ${POS_LABEL[p.primaryPos]||""}</span>${isPom&&currentPlayerOfMonthV754.monthLabel?`<em class="player-of-month-month">${esc(currentPlayerOfMonthV754.monthLabel)}</em>`:""}</div>`;
    card.querySelector(".edit-mini").addEventListener("click",()=>openPlayerModal(p.id));
    card.querySelector(".img-wrap").addEventListener("click",()=>openPlayerModal(p.id));
    grid.appendChild(card);
  });
}
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{
  filter=b.dataset.filter;
  document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));
  renderPlayers();
}));
$("playerSearch").addEventListener("input",renderPlayers);
$("searchToggle").addEventListener("click",()=>$("searchRow").classList.toggle("hidden"));


/* Player statistics */
async function playerViewSlide(index){
  const slider=$("playerViewSlider");
  if(!slider)return;
  index=Math.max(0,Math.min(2,index));
  slider.style.transform=`translateX(-${index*(100/3)}%)`;
  $("playerInfoTab")?.classList.toggle("active",index===0);
  $("playerStatsTab")?.classList.toggle("active",index===1);
  if(index===1) setTimeout(()=>setPlayerStatsMode("training"),0);
  $("playerAwardsTab")?.classList.toggle("active",index===2);

  // v7.28: only the active subpage determines modal height.
  // Statistics can be large; Information/Awards return to their compact size.
  const dialog=$("playerDialog");
  dialog?.classList.toggle("player-stats-open",index===1);
  const slides=[
    $("playerInfoSlide"),
    $("playerStatsSlide"),
    $("playerAwardsPane")
  ];
  const activeSlide=slides[index];
  const syncPlayerSliderHeight=()=>{
    if(!slider || !activeSlide)return;
    slider.style.height=`${activeSlide.scrollHeight}px`;
  };
  requestAnimationFrame(()=>{
    syncPlayerSliderHeight();
    setTimeout(syncPlayerSliderHeight,80);
  });

  if(index===2 && editPlayerId){
    await renderAwardsIntoPlayerModalV589(editPlayerId);
  }
}

function averageRating(rows){
  const vals=rows.map(r=>Number(r.rating)).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}
function fmtRating(v){return Number.isFinite(v)?v.toFixed(1):"—";}
function statFormHtml(values){
  return values.length?values.map(v=>`<span class="${v>=9?"excellent":v>=8?"good":v<7?"low":""}">${Number(v).toFixed(1)}</span>`).join(""):`<em>Немає даних</em>`;
}

function formatShortStatDate(value){
  const s=String(value||"").slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}.${m[2]}`:s||"—";
}
function formatLongStatDate(value){
  const s=String(value||"").slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?`${m[3]}.${m[2]}.${m[1].slice(2)}`:s||"—";
}
function ratingHistoryChartHtml(rows,dateGetter){
  const points=(rows||[])
    .filter(r=>Number.isFinite(Number(r.rating)))
    .slice()
    .sort((a,b)=>String(dateGetter(a)||"").localeCompare(String(dateGetter(b)||"")));

  if(!points.length)return `<div class="rating-history-empty">Немає даних</div>`;

  const ratings=points.map(r=>Number(r.rating));
  const minRating=Math.min(...ratings);
  const maxRating=Math.max(...ratings);

  // Clear whole-number levels around the player's actual range.
  const yMin=Math.max(0,Math.floor(minRating)-1);
  const yMax=Math.min(10,Math.max(yMin+3,Math.ceil(maxRating)+1));

  const left=12, right=18, top=18, bottom=42;
  const plotH=148;
  const step=72;
  const width=Math.max(360,left+right+Math.max(0,points.length-1)*step);
  const svgH=top+plotH+bottom;
  const x=i=>left+i*step;
  const y=v=>top+((yMax-v)/(yMax-yMin))*plotH;

  const ticks=[];
  for(let v=Math.ceil(yMin);v<=Math.floor(yMax);v+=1)ticks.push(v);

  const coords=points.map((r,i)=>[x(i),y(Number(r.rating))]);
  const linePath=coords.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const areaPath=`M ${coords[0][0].toFixed(1)} ${(top+plotH).toFixed(1)} `+
    coords.map(p=>`L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")+
    ` L ${coords[coords.length-1][0].toFixed(1)} ${(top+plotH).toFixed(1)} Z`;

  const grid=ticks.map(v=>{
    const yy=y(v).toFixed(1);
    return `<line class="rating-history-grid" x1="0" x2="${width}" y1="${yy}" y2="${yy}"></line>`;
  }).join("");

  // Fixed Y-axis labels live OUTSIDE the horizontal scroll container.
  const axisLabels=ticks.map(v=>{
    const topPct=((y(v)-top)/plotH)*100;
    return `<span class="rating-history-fixed-label" style="top:${topPct}%">${v.toFixed(1)}</span>`;
  }).join("");

  const circles=points.map((r,i)=>{
    const rating=Number(r.rating).toFixed(1);
    const date=String(dateGetter(r)||"");
    return `<g>
      <circle class="rating-history-point" cx="${x(i)}" cy="${y(Number(r.rating)).toFixed(1)}" r="5.2"
        data-rating="${rating}" data-date="${date}"></circle>
      <text class="rating-history-date" x="${x(i)}" y="${svgH-14}" text-anchor="middle">${formatShortStatDate(date)}</text>
    </g>`;
  }).join("");

  const latest=points[points.length-1];
  return `<div class="rating-history-card">
    <div class="rating-history-selected" data-rating-history-selected>
      ${formatLongStatDate(dateGetter(latest))} • ${Number(latest.rating).toFixed(1)}
    </div>

    <div class="rating-history-chart-shell">
      <div class="rating-history-fixed-axis" aria-hidden="true">
        <div class="rating-history-fixed-axis-inner">${axisLabels}</div>
      </div>

      <div class="rating-history-scroll" data-rating-history-scroll>
        <svg class="rating-history-svg" width="${width}" height="${svgH}" viewBox="0 0 ${width} ${svgH}" aria-label="Динаміка оцінок">
          ${grid}
          <path class="rating-history-area" d="${areaPath}"></path>
          <path class="rating-history-line" d="${linePath}"></path>
          ${circles}
        </svg>
      </div>
    </div>
  </div>`;
}

function trainingRatingChartHtml(rows){
  return ratingHistoryChartHtml(rows,r=>r.training_days?.training_date);
}
function officialRatingChartHtml(rows){
  return ratingHistoryChartHtml(rows,r=>r.calendar_matches?.match_date);
}

function bindRatingHistoryChart(hostId){
  const host=$(hostId);
  if(!host)return;
  const selected=host.querySelector("[data-rating-history-selected]");
  const scroll=host.querySelector("[data-rating-history-scroll]");
  const points=[...host.querySelectorAll(".rating-history-point")];
  if(!selected||!points.length)return;

  points.forEach(point=>{
    point.addEventListener("click",()=>{
      points.forEach(p=>p.classList.remove("is-selected"));
      point.classList.add("is-selected");
      selected.textContent=`${formatLongStatDate(point.dataset.date)} • ${Number(point.dataset.rating).toFixed(1)}`;
    });
  });

  if(scroll){
    // newest values are shown first on open; user can freely swipe through history
    requestAnimationFrame(()=>{ scroll.scrollLeft=scroll.scrollWidth-scroll.clientWidth; });
  }
}
function bindTrainingRatingChart(){ bindRatingHistoryChart("statTrainingForm"); }
function bindOfficialRatingChart(){ bindRatingHistoryChart("statOfficialForm"); }

async function loadPlayerStatistics(playerId){
  if(!sb||!playerId)return;
  const [officialRes,trainingRes]=await Promise.all([
    sb.from("official_match_player_stats").select("rating,goals,assists,match_id,calendar_matches(match_date)").eq("player_id",playerId),
    sb.from("training_player_stats").select("rating,goals,assists,matches_played,training_day_id,training_days(training_date,matches_played,gathering_id)").eq("player_id",playerId)
  ]);
  const official=(officialRes.data||[]).filter(r=>r.rating!=null || r.goals || r.assists);
  const training=(trainingRes.data||[]).filter(r=>r.rating!=null);

  official.sort((a,b)=>String(b.calendar_matches?.match_date||"").localeCompare(String(a.calendar_matches?.match_date||"")));
  training.sort((a,b)=>String(b.training_days?.training_date||"").localeCompare(String(a.training_days?.training_date||"")));

  const offAvg=averageRating(official);
  const offRatings=official.map(r=>Number(r.rating)).filter(Number.isFinite);
  const offBest=offRatings.length?Math.max(...offRatings):null;
  const offWorst=offRatings.length?Math.min(...offRatings):null;
  const trAvg=averageRating(training);
  const trRatings=training.map(r=>Number(r.rating)).filter(Number.isFinite);
  const trBest=trRatings.length?Math.max(...trRatings):null;
  const trWorst=trRatings.length?Math.min(...trRatings):null;
  const trMatches=training.reduce((sum,r)=>{
    /* New rows use each player's personal number of matches.
       Old rows remain backward-compatible and fall back to the gathering total. */
    const personal=Number(r.matches_played);
    return sum+(Number.isFinite(personal) ? personal : (Number(r.training_days?.matches_played)||0));
  },0);

  // MVP count = how many events this player's rating equals the best rating for that event.
  let officialMvp=0, trainingMvp=0;
  const officialIds=[...new Set(official.map(r=>r.match_id))];
  const trainingIds=[...new Set(training.map(r=>r.training_day_id))];

  if(officialIds.length){
    const {data}=await sb.from("official_match_player_stats").select("match_id,player_id,rating").in("match_id",officialIds);
    const grouped={};
    (data||[]).forEach(r=>(grouped[r.match_id]??=[]).push(r));
    officialIds.forEach(id=>{
      const mine=grouped[id]?.find(r=>r.player_id===playerId);
      const max=Math.max(...(grouped[id]||[]).map(r=>Number(r.rating)).filter(Number.isFinite),-1);
      if(mine && Number(mine.rating)===max)officialMvp++;
    });
  }
  if(trainingIds.length){
    const {data}=await sb.from("training_player_stats").select("training_day_id,player_id,rating,matches_played").in("training_day_id",trainingIds);
    const grouped={};
    (data||[]).forEach(r=>(grouped[r.training_day_id]??=[]).push(r));
    trainingIds.forEach(id=>{
      const dayTotal=Number(training.find(r=>r.training_day_id===id)?.training_days?.matches_played)||0;
      const eligible=trainingMvpEligibleRows({id,matches_played:dayTotal},grouped[id]||[]);
      const mine=eligible.find(r=>r.player_id===playerId);
      const max=Math.max(...eligible.map(r=>Number(r.rating)).filter(Number.isFinite),-1);
      if(mine && Number(mine.rating)===max)trainingMvp++;
    });
  }

  $("statOfficialMatches").textContent=officialIds.length;
  $("statOfficialGoals").textContent=official.reduce((s,r)=>s+(Number(r.goals)||0),0);
  $("statOfficialAssists").textContent=official.reduce((s,r)=>s+(Number(r.assists)||0),0);
  $("statOfficialAvg").textContent=fmtRating(offAvg);
  $("statOfficialBest").textContent=fmtRating(offBest);
  $("statOfficialWorst").textContent=fmtRating(offWorst);
  $("statOfficialMvp").innerHTML=`<em>MVP</em> ${officialMvp}`;
  $("statOfficialForm").innerHTML=officialRatingChartHtml(official);
  bindOfficialRatingChart();

  $("statTrainingMatches").textContent=trMatches;
  $("statTrainingGoals").textContent=training.reduce((s,r)=>s+(Number(r.goals)||0),0);
  $("statTrainingAssists").textContent=training.reduce((s,r)=>s+(Number(r.assists)||0),0);
  $("statTrainingAvg").textContent=fmtRating(trAvg);
  $("statTrainingBest").textContent=fmtRating(trBest);
  $("statTrainingWorst").textContent=fmtRating(trWorst);
  $("statTrainingMvp").innerHTML=`<em>MVP</em> ${trainingMvp}`;
  $("statTrainingForm").innerHTML=trainingRatingChartHtml(training);
  bindTrainingRatingChart();
}

function resetPlayerModal(){
  editPlayerId=null; currentCardImage="";
  $("playerModalTitle").textContent="ДОДАТИ ГРАВЦЯ";
  $("playerViewMode").classList.add("hidden");
  $("playerEditMode").classList.remove("hidden");
  $("cardPreview").innerHTML=`<span>＋</span><small>ЗАВАНТАЖИТИ ГОТОВУ КАРТКУ (НЕОБОВ’ЯЗКОВО)</small>`;
  $("nameInput").value="";$("numberInput").value="";$("ageInput").value="";$("primaryPos").value="GK";
  selectArchetype("");selectStatus("");selectPlatform("");$("noteInput").value="";
  $("extraPositions").querySelectorAll("input").forEach(x=>x.checked=false);
  if($("playerAccountLinkField"))$("playerAccountLinkField").classList.toggle("hidden",authRole!=="admin");
  if($("playerAccountSelect"))$("playerAccountSelect").value="";
  $("deletePlayerBtn").classList.add("hidden");
}

function fillViewMode(p){
  $("playerModalTitle").textContent="ГРАВЕЦЬ";
  $("playerViewMode").classList.remove("hidden");
  $("playerEditMode").classList.add("hidden");

  const isPom=isCurrentPlayerOfMonthV754(p.id);
  $("viewCardImage").classList.toggle("current-player-of-month",isPom);
  $("viewCardImage").innerHTML=`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">${isPom?`<span class="player-of-month-badge modal-badge">👑 ГРАВЕЦЬ МІСЯЦЯ</span>`:""}`;
  $("statsPlayerMiniCard").innerHTML=`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">`;
  $("statsPlayerName").textContent=p.name||"—";
  playerViewSlide(0);
  loadPlayerStatistics(p.id);

  $("viewName").textContent=p.name||"—";
  $("viewNumber").textContent=p.number!=="" && p.number!=null ? "#"+p.number : "—";
  $("viewAge").textContent=p.age!=="" && p.age!=null ? p.age : "—";
  $("viewPlatform").innerHTML=p.platform ? `<span class="view-platform"><span class="platform-icon">${platformIcon(p.platform)}</span><span>${esc(p.platform)}</span></span>` : "—";
  $("viewPrimaryPos").textContent=POS_LABEL[p.primaryPos]||"—";
  $("viewArchetype").innerHTML=p.archetype
    ? `<span class="view-archetype"><img src="${ARCHETYPE_ICONS[p.archetype]||""}" alt=""><span>${esc(p.archetype)}</span></span>`
    : "—";
  $("viewStatus").textContent=p.status||"—";
  $("viewNote").textContent=p.note||"—";

  const extras=(p.extraPositions||[]);
  $("viewExtraPositions").innerHTML=extras.length
    ? extras.map(pos=>`<span class="view-pos-chip">${POS_LABEL[pos]||pos}</span>`).join("")
    : `<span class="view-pos-empty">Немає</span>`;
}

function fillEditMode(p){
  $("playerModalTitle").textContent="РЕДАГУВАТИ ГРАВЦЯ";
  $("playerViewMode").classList.add("hidden");
  $("playerEditMode").classList.remove("hidden");

  currentCardImage=p.cardImage||"";
  $("cardPreview").innerHTML=`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="">`;
  $("nameInput").value=p.name;
  $("numberInput").value=p.number||"";
  $("ageInput").value=p.age||"";
  selectPlatform(p.platform||"");
  $("primaryPos").value=p.primaryPos;
  selectArchetype(p.archetype||"");
  selectStatus(p.status||"");
  $("noteInput").value=p.note||"";
  $("extraPositions").querySelectorAll("input").forEach(x=>x.checked=(p.extraPositions||[]).includes(x.value));
  $("deletePlayerBtn").classList.remove("hidden");
  populatePlayerAccountSelectV590(p.id);
}

function openPlayerModal(id=null){
  resetPlayerModal();
  if(id){
    const p=players.find(x=>x.id===id);if(!p)return;
    editPlayerId=id;
    currentCardImage=p.cardImage||"";
    fillViewMode(p);
    playerViewSlide(0);
    /* awards load only when the Awards tab is opened */
  }
  $("playerDialog").showModal();
  refreshEditOnlyVisibility();
  setTimeout(()=>populatePlayerAccountSelectV590(id),0);
}

$("playerInfoTab")?.addEventListener("click",()=>playerViewSlide(0));
$("playerStatsTab")?.addEventListener("click",()=>playerViewSlide(1));
function setPlayerStatsMode(mode){
  const official=mode==="official";
  $("officialStatsPanel")?.classList.toggle("hidden",!official);
  $("trainingStatsPanel")?.classList.toggle("hidden",official);
  $("showOfficialStatsBtn")?.classList.toggle("active",official);
  $("showTrainingStatsBtn")?.classList.toggle("active",!official);

  // Keep the dialog fitted to the currently visible stats panel.
  requestAnimationFrame(()=>{
    const slider=$("playerViewSlider");
    const slide=$("playerStatsSlide");
    if(slider&&slide)slider.style.height=`${slide.scrollHeight}px`;
  });
}
$("showOfficialStatsBtn")?.addEventListener("click",()=>setPlayerStatsMode("official"));
$("showTrainingStatsBtn")?.addEventListener("click",()=>setPlayerStatsMode("training"));

let playerSwipeStartX=null;
let playerSwipeStartY=null;

function currentPlayerSlideV598(){
  const tr=$("playerViewSlider")?.style.transform||"";
  if(tr.includes("66.666") || tr.includes("66.667"))return 2;
  if(tr.includes("33.333") || tr.includes("33.334"))return 1;
  return 0;
}

$("playerViewSlider")?.addEventListener("touchstart",e=>{
  if(e.target.closest?.("input,textarea,select,button,.rating-history-scroll"))return;
  const t=e.touches?.[0];
  playerSwipeStartX=t?.clientX??null;
  playerSwipeStartY=t?.clientY??null;
},{passive:true});

$("playerViewSlider")?.addEventListener("touchend",async e=>{
  if(playerSwipeStartX==null)return;
  const t=e.changedTouches?.[0];
  const dx=(t?.clientX??playerSwipeStartX)-playerSwipeStartX;
  const dy=(t?.clientY??playerSwipeStartY)-playerSwipeStartY;
  playerSwipeStartX=null;
  playerSwipeStartY=null;

  if(Math.abs(dx)<45 || Math.abs(dx)<=Math.abs(dy)*1.15)return;

  const page=currentPlayerSlideV598();
  if(dx<0 && page<2) await playerViewSlide(page+1);
  if(dx>0 && page>0) await playerViewSlide(page-1);
},{passive:true});

$("addPlayerBtn").addEventListener("click",()=>openPlayerModal());
$("addPlayerBig").addEventListener("click",()=>openPlayerModal());
$("closePlayerModal").addEventListener("click",()=>$("playerDialog").close());
$("cancelPlayerBtn").addEventListener("click",()=>$("playerDialog").close());
$("editPlayerBtn").addEventListener("click",()=>{
  if(!editPlayerId)return;
  const p=players.find(x=>x.id===editPlayerId);
  if(p)fillEditMode(p);
});
$("viewDeletePlayerBtn").addEventListener("click",async()=>{
  if(!editPlayerId)return;
  if(!confirm("Видалити цього гравця?"))return;
  await del("players",editPlayerId);
  Object.keys(lineup).forEach(k=>{if(lineup[k]===editPlayerId)delete lineup[k]});
  localStorage.setItem("ca_lineup",JSON.stringify(lineup));
  players=await getAll("players");
  $("playerDialog").close();
  renderPlayers();
  renderPitch();
  showToast("Гравця видалено");
});

$("cardImageInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  currentCardImage=await resizeImage(f,500,760,.86);
  $("cardPreview").innerHTML=`<img src="${currentCardImage}" alt="">`;
});

$("savePlayerBtn").addEventListener("click",async()=>{
  const name=$("nameInput").value.trim();
  if(!name){showToast("Введи нік або ім’я");return}

  const numberRaw=$("numberInput").value.trim();
  if(numberRaw){
    const requestedNumber=Number(numberRaw);
    if(!Number.isInteger(requestedNumber) || requestedNumber<0 || requestedNumber>99){
      showToast("Номер має бути від 0 до 99");
      $("numberInput").focus();
      return;
    }
    const occupied=occupiedShirtNumberV631(requestedNumber,editPlayerId);
    if(occupied){
      showToast(`Номер #${requestedNumber} вже зайнятий`);
      $("numberInput").focus();
      return;
    }
  }

  const ageRaw=$("ageInput").value.trim();
  if(ageRaw){
    const age=Number(ageRaw);
    if(!Number.isInteger(age) || age<10 || age>99){showToast("Вік має бути від 10 до 99 років");return}
  }
  const extra=[...$("extraPositions").querySelectorAll("input:checked")].map(x=>x.value).filter(x=>x!==$("primaryPos").value).slice(0,3);
  const obj={
    id:editPlayerId||uid(),name,number:$("numberInput").value.trim(),age:$("ageInput").value.trim(),platform:$("platformValue").value,
    primaryPos:$("primaryPos").value,extraPositions:extra,
    archetype:$("archetypeValue") ? $("archetypeValue").value : "",status:$("statusValue") ? $("statusValue").value : "",note:$("noteInput").value.trim(),
    cardImage:currentCardImage,updatedAt:Date.now()
  };
  try{
    await put("players",obj);

    if(authRole==="admin"){
      const linkedUser=$("playerAccountSelect")?.value||"";
      await savePlayerAccountLinkV590(obj.id,linkedUser||null);
    }

    players=await getAll("players");
    $("playerDialog").close();renderPlayers();renderPitch();
    if(typeof loadTeamProfiles==="function")await loadTeamProfiles();
    if(typeof loadPlayerAccountSystemV589==="function")await loadPlayerAccountSystemV589();
    showToast(editPlayerId?"Гравця оновлено":"Гравця додано");
  }catch(err){
    console.error(err);

    if(isOccupiedNumberErrorV632(err)){
      showOccupiedNumberMessageV632($("numberInput")?.value?.trim()||null);
      $("numberInput")?.focus();
      return;
    }

    const msg=err?.message||"Невідома помилка";
    showToast("Не вдалося зберегти зміни");
    alert("Не вдалося зберегти зміни.\n\n"+msg);
  }
});
$("deletePlayerBtn").addEventListener("click",async()=>{
  if(!editPlayerId)return;
  if(!confirm("Видалити цього гравця?"))return;
  await del("players",editPlayerId);
  Object.keys(lineup).forEach(k=>{if(lineup[k]===editPlayerId)delete lineup[k]});
  localStorage.setItem("ca_lineup",JSON.stringify(lineup));
  players=await getAll("players");
  $("playerDialog").close();renderPlayers();renderPitch();showToast("Гравця видалено");
});

function compatibility(p,slotPos){
  if(p.primaryPos===slotPos)return "good";
  if((p.extraPositions||[]).includes(slotPos))return "alt";
  return "bad";
}

function startTacticsRuntimeShine(){
  const shines=[...document.querySelectorAll("#screen-tactics #pitch .slot-card.filled .tactics-runtime-shine")];
  shines.forEach((shine,index)=>{
    try{
      if(shine._centuriaAnim) shine._centuriaAnim.cancel();
      if(typeof shine.animate==="function"){
        shine._centuriaAnim=shine.animate(
          [
            {transform:"translate3d(-230%,0,0) skewX(-18deg)",opacity:0,offset:0},
            {transform:"translate3d(-230%,0,0) skewX(-18deg)",opacity:0,offset:.32},
            {transform:"translate3d(-120%,0,0) skewX(-18deg)",opacity:.9,offset:.40},
            {transform:"translate3d(80%,0,0) skewX(-18deg)",opacity:1,offset:.58},
            {transform:"translate3d(330%,0,0) skewX(-18deg)",opacity:.85,offset:.76},
            {transform:"translate3d(330%,0,0) skewX(-18deg)",opacity:0,offset:.80},
            {transform:"translate3d(330%,0,0) skewX(-18deg)",opacity:0,offset:1}
          ],
          {duration:3200,iterations:Infinity,easing:"linear",delay:index*95}
        );
      }
    }catch(e){ console.warn("Tactics shine animation fallback",e); }
  });
}

function renderPitch(){
  document.querySelectorAll(".formation").forEach(b=>b.classList.toggle("active",b.dataset.formation===currentFormation));
  const pitch=$("pitch");pitch.innerHTML="";
  FORMATIONS[currentFormation].forEach(([pos,x,y],i)=>{
    const key=`${currentFormation}-${i}`;
    const p=players.find(v=>v.id===lineup[key]);
    const comp=p?compatibility(p,pos):"";
    const slot=document.createElement("div");slot.className="slot";slot.style.left=x+"%";slot.style.top=y+"%";
    slot.innerHTML=`
      ${p&&p.status?`<div class="slot-status slot-status-${p.status==="Капітан"?"captain":p.status==="Віце-капітан"?"vice":"trial"}">${esc(p.status)}</div>`:""}
      <button class="slot-card ${p?"filled":""}">${p?`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}"><span class="tactics-runtime-shine" aria-hidden="true"></span>`:"＋"}</button>
      <div class="slot-name">${p?esc(p.name):""}</div>
      <span class="slot-position ${p?comp:"empty"}">${POS_LABEL[pos]}</span>`;
    slot.querySelector(".slot-card").addEventListener("click",()=>openPicker(key,pos));
    pitch.appendChild(slot);
  });
  startTacticsRuntimeShine();
}
document.querySelectorAll(".formation").forEach(b=>b.addEventListener("click",()=>{
  currentFormation=b.dataset.formation;
  localStorage.setItem("ca_formation",currentFormation);
  renderPitch();
}));

function openPicker(key,pos){
  pickerSlotKey=key;pickerSlotPos=pos;
  $("pickerTitle").textContent=`ОБЕРИ ГРАВЦЯ — ${POS_LABEL[pos]}`;
  const list=$("pickerList");list.innerHTML="";
  if(lineup[key]){
    const clear=document.createElement("button");clear.className="picker-item picker-clear";
    clear.innerHTML=`<div></div><strong>ОЧИСТИТИ ПОЗИЦІЮ</strong><span>×</span>`;
    clear.addEventListener("click",()=>{delete lineup[key];saveLineupState();$("pickerDialog").close();renderPitch()});
    list.appendChild(clear);
  }
  if(!players.length){
    list.innerHTML+=`<div class="empty-state"><strong>ГРАВЦІВ НЕМАЄ</strong><span>Спочатку додай гравців у відповідній вкладці.</span></div>`;
  }else{
    const sorted=[...players].sort((a,b)=>{
      const order={good:0,alt:1,bad:2};
      return order[compatibility(a,pos)]-order[compatibility(b,pos)];
    });
    sorted.forEach(p=>{
      const c=compatibility(p,pos);
      const label=c==="good"?"ОСНОВНА":c==="alt"?"ДОДАТКОВА":"НЕ РІДНА";
      const btn=document.createElement("button");btn.className="picker-item";
      btn.innerHTML=`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt=""><div><strong>${esc(p.name)}</strong><small>${POS_LABEL[p.primaryPos]}${p.archetype?" • "+esc(p.archetype):""}</small></div><span class="compat ${c}">${label}</span>`;
      btn.addEventListener("click",()=>{lineup[key]=p.id;saveLineupState();$("pickerDialog").close();renderPitch()});
      list.appendChild(btn);
    });
  }
  const picker=$("pickerDialog");
  if(picker){
    const light=
      document.documentElement.dataset.siteTheme==="light" ||
      document.documentElement.classList.contains("light-theme");
    picker.classList.toggle("picker-light",light);
    picker.classList.toggle("picker-dark",!light);
    picker.showModal();
  }
}
$("closePicker").addEventListener("click",()=>$("pickerDialog").close());
function saveLineupState(){localStorage.setItem("ca_lineup",JSON.stringify(lineup))}

$("saveLineupBtn").addEventListener("click",async()=>{
  const used=FORMATIONS[currentFormation].map((_,i)=>lineup[`${currentFormation}-${i}`]).filter(Boolean);
  if(!used.length){showToast("Спочатку додай хоча б одного гравця");return}

  const name=prompt("Назва складу:","Основний склад");
  if(name===null)return;

  const saveBtn=$("saveLineupBtn");
  if(saveBtn)saveBtn.disabled=true;
  showToast("Зберігаю склад…");

  try{
    const image=await renderLineupImage(name.trim()||"Склад");
    const obj={
      id:uid(),
      name:name.trim()||"Склад",
      formation:formationName(currentFormation),
      formationKey:currentFormation,
      lineupSnapshot:Object.fromEntries(
        FORMATIONS[currentFormation].map((_,i)=>{
          const key=`${currentFormation}-${i}`;
          return [key,lineup[key]||null];
        })
      ),
      createdAt:Date.now(),
      image
    };

    const saved=await put("squads",obj);

    if(saved?.id){
      squads=[saved,...squads.filter(s=>s.id!==saved.id)];
      renderSquads();
    }

    const refreshedSquads=await getAll("squads");
    if(!refreshedSquads.some(s=>s.id===obj.id)){
      throw new Error("Склад не знайдено після збереження");
    }

    squads=refreshedSquads;
    renderSquads();
    const justSaved=squads.find(s=>s.id===obj.id);
    showToast(justSaved?._localOnly
      ?"Склад збережено на цьому пристрої ✓"
      :"Склад збережено ✓");
  }catch(err){
    console.error("Save lineup failed:",err);
    showToast(`Не вдалося зберегти склад${err?.message?": "+err.message:""}`);
  }finally{
    if(saveBtn)saveBtn.disabled=false;
  }
});

const SAVED_LINEUP_LAYOUT_V780={
  W:720,H:1080,
  /* Keep the pitch large, but start it below the title/schema line. */
  px:18,py:132,pw:684,ph:898,
  cw:72,ch:102
};

/* v7.85 — saved lineup pitch uses the same restrained 3D geometry
   as the live Tactics pitch: top edge is slightly narrower, the lower
   edge is full width, and field contents follow that perspective. */
function savedPitchPoint(localX,localY){
  const {px,py,pw,ph}=SAVED_LINEUP_LAYOUT_V780;
  const yy=Math.max(0,Math.min(ph,Number(localY)||0));
  const xx=Math.max(0,Math.min(pw,Number(localX)||0));
  const t=ph?yy/ph:0;
  const topInset=pw*.028;
  const inset=topInset*(1-t);
  const rowWidth=pw-(inset*2);
  return {
    x:px+inset+(xx/pw)*rowWidth,
    y:py+yy
  };
}

function savedPitchPointPct(xPct,yPct){
  const {pw,ph}=SAVED_LINEUP_LAYOUT_V780;
  return savedPitchPoint((Number(xPct)||0)/100*pw,(Number(yPct)||0)/100*ph);
}

function savedPitchQuadPath(ctx){
  const {pw,ph}=SAVED_LINEUP_LAYOUT_V780;
  const a=savedPitchPoint(0,0);
  const b=savedPitchPoint(pw,0);
  const c=savedPitchPoint(pw,ph);
  const d=savedPitchPoint(0,ph);
  ctx.beginPath();
  ctx.moveTo(a.x,a.y);
  ctx.lineTo(b.x,b.y);
  ctx.lineTo(c.x,c.y);
  ctx.lineTo(d.x,d.y);
  ctx.closePath();
}

function drawSaved3DPitch(ctx){
  const {pw,ph}=SAVED_LINEUP_LAYOUT_V780;

  /* Ground shadow gives the same lifted-board feel as the live pitch. */
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.30)";
  ctx.shadowBlur=18;
  ctx.shadowOffsetY=12;
  ctx.fillStyle="#17663a";
  savedPitchQuadPath(ctx);
  ctx.fill();
  ctx.restore();

  /* Clip all grass lighting/stripes to the perspective trapezoid. */
  ctx.save();
  savedPitchQuadPath(ctx);
  ctx.clip();

  const grass=ctx.createLinearGradient(0,SAVED_LINEUP_LAYOUT_V780.py,0,SAVED_LINEUP_LAYOUT_V780.py+ph);
  grass.addColorStop(0,"#26804b");
  grass.addColorStop(.48,"#197441");
  grass.addColorStop(1,"#126536");
  ctx.fillStyle=grass;
  savedPitchQuadPath(ctx);
  ctx.fill();

  for(let i=0;i<8;i++){
    const x0=(i/8)*pw;
    const x1=((i+1)/8)*pw;
    const p1=savedPitchPoint(x0,0);
    const p2=savedPitchPoint(x1,0);
    const p3=savedPitchPoint(x1,ph);
    const p4=savedPitchPoint(x0,ph);
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.lineTo(p4.x,p4.y);
    ctx.closePath();
    ctx.fillStyle=i%2?"rgba(0,0,0,.032)":"rgba(255,255,255,.028)";
    ctx.fill();
  }

  /* Soft stadium light from the top of the field. */
  const glow=ctx.createRadialGradient(
    SAVED_LINEUP_LAYOUT_V780.px+pw/2,
    SAVED_LINEUP_LAYOUT_V780.py,
    0,
    SAVED_LINEUP_LAYOUT_V780.px+pw/2,
    SAVED_LINEUP_LAYOUT_V780.py,
    pw*.62
  );
  glow.addColorStop(0,"rgba(255,240,180,.12)");
  glow.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=glow;
  ctx.fillRect(SAVED_LINEUP_LAYOUT_V780.px,SAVED_LINEUP_LAYOUT_V780.py,pw,ph);
  ctx.restore();

  /* Gold outer edge, matching the live Tactics pitch shell. */
  ctx.save();
  ctx.strokeStyle="rgba(213,177,83,.70)";
  ctx.lineWidth=2;
  savedPitchQuadPath(ctx);
  ctx.stroke();
  ctx.restore();

  /* Inner white field boundary in the same perspective plane. */
  const m=20;
  const tl=savedPitchPoint(m,m);
  const tr=savedPitchPoint(pw-m,m);
  const br=savedPitchPoint(pw-m,ph-m);
  const bl=savedPitchPoint(m,ph-m);
  ctx.strokeStyle="rgba(255,255,255,.62)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(tl.x,tl.y);
  ctx.lineTo(tr.x,tr.y);
  ctx.lineTo(br.x,br.y);
  ctx.lineTo(bl.x,bl.y);
  ctx.closePath();
  ctx.stroke();

  /* Halfway line. */
  const hl=savedPitchPoint(m,ph/2);
  const hr=savedPitchPoint(pw-m,ph/2);
  ctx.beginPath();
  ctx.moveTo(hl.x,hl.y);
  ctx.lineTo(hr.x,hr.y);
  ctx.stroke();

  /* Centre circle is slightly flattened by perspective. */
  const centre=savedPitchPoint(pw/2,ph/2);
  const midInset=pw*.028*.5;
  const midScale=(pw-midInset*2)/pw;
  ctx.beginPath();
  ctx.ellipse(centre.x,centre.y,58*midScale,54,0,0,Math.PI*2);
  ctx.stroke();
}

async function renderLineupImage(name){
  // 1.5x keeps the saved lineup sharp (1080x1620) while using much less
  // memory on iPhone/Safari than the previous 1440x2160 canvas.
  const SCALE=2,{W,H,px,py,pw,ph,cw,ch}=SAVED_LINEUP_LAYOUT_V780,canvas=document.createElement("canvas");
  canvas.width=W*SCALE;
  canvas.height=H*SCALE;
  const ctx=canvas.getContext("2d");
  ctx.scale(SCALE,SCALE);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  const lightSaved =
    document.documentElement.dataset.siteTheme==="light" ||
    document.documentElement.classList.contains("light-theme") ||
    document.body?.dataset.siteTheme==="light" ||
    document.body?.classList.contains("light-theme");

  if(lightSaved){
    ctx.fillStyle="#fffdf8";ctx.fillRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,"#fffaf0");grad.addColorStop(.5,"#fffdf8");grad.addColorStop(1,"#f7eedc");
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  }else{
    ctx.fillStyle="#08090b";ctx.fillRect(0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,"#180b0b");grad.addColorStop(.5,"#090a0b");grad.addColorStop(1,"#15100b");
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  }
  ctx.fillStyle=lightSaved?"#a97b1f":"#e2bd70";ctx.font="bold 16px Arial";ctx.fillText("CENTURIA ATHLETICS",38,42);
  ctx.fillStyle=lightSaved?"#28241e":"#f3e6cd";ctx.font="bold 30px Arial";ctx.fillText(name.toUpperCase(),38,82);
  ctx.fillStyle="#b9a98e";ctx.font="bold 14px Arial";ctx.fillText(`СХЕМА: ${formationName(currentFormation)}   •   ${new Date().toLocaleString("uk-UA")}`,38,108);

  drawSaved3DPitch(ctx);

  const slots=FORMATIONS[currentFormation];
  for(let i=0;i<slots.length;i++){
    const [pos,x,y]=slots[i],key=`${currentFormation}-${i}`,p=players.find(v=>v.id===lineup[key]);
    const projected=savedPitchPointPct(x,y);
    const cx=projected.x;
    const rawCy=projected.y;
    /* In the saved image, keep GK card + position + nickname fully inside the pitch. */
    const cy=pos==="GK" ? Math.min(rawCy,py+ph-(ch/2+52)) : rawCy;
    if(p){
      try{
        const img=await loadImg(p.cardImage||PLAYER_PLACEHOLDER);
        ctx.drawImage(img,cx-cw/2,cy-ch/2,cw,ch);
      }catch(cardErr){
        console.warn("Player card skipped in lineup image",p?.name,cardErr);
        try{
          const fallback=await loadImg(PLAYER_PLACEHOLDER);
          ctx.drawImage(fallback,cx-cw/2,cy-ch/2,cw,ch);
        }catch{}
      }
      const c=compatibility(p,pos);ctx.fillStyle=c==="good"?"#198845":c==="alt"?"#bd7119":"#a6262b";
    }else{
      ctx.fillStyle="rgba(10,8,6,.9)";roundRect(ctx,cx-cw/2,cy-ch/2,cw,ch,7,true,false);
      ctx.strokeStyle="#d9b86f";ctx.lineWidth=2;roundRect(ctx,cx-cw/2,cy-ch/2,cw,ch,7,false,true);
      ctx.fillStyle="#5d4b32";ctx.font="bold 28px Arial";ctx.textAlign="center";ctx.fillText("+",cx,cy+8);
      ctx.fillStyle="#5d4b32";
    }
    roundRect(ctx,cx-24,cy+ch/2+5,48,20,10,true,false);
    ctx.fillStyle="#fff";ctx.font="bold 10px Arial";ctx.textAlign="center";ctx.fillText(POS_LABEL[pos],cx,cy+ch/2+19);
    if(p){
      ctx.fillStyle="rgba(0,0,0,.72)";roundRect(ctx,cx-42,cy+ch/2+28,84,18,5,true,false);
      ctx.fillStyle="#f3ead8";ctx.font="bold 9px Arial";ctx.fillText(p.name.slice(0,14),cx,cy+ch/2+40);
    }
  }
  ctx.textAlign="left";
  ctx.fillStyle="#9d8d74";ctx.font="12px Arial";ctx.fillText("Centuria Athletics • Daniil Osetskyi",28,1068);
  try{
    return canvas.toDataURL("image/png");
  }catch(exportErr){
    console.error("Lineup canvas export failed",exportErr);
    throw new Error("Не вдалося створити картинку складу. Онови сторінку та спробуй ще раз.");
  }
}
function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(w<2*r)r=w/2;if(h<2*r)r=h/2;
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  if(fill)ctx.fill();if(stroke)ctx.stroke();
}
async function loadImg(src){
  if(!src)throw new Error("Порожнє джерело зображення");

  // data: and same-origin images are safe to draw directly.
  if(src.startsWith("data:") || src.startsWith("blob:") || !/^https?:/i.test(src)){
    return await new Promise((res,rej)=>{
      const i=new Image();
      i.onload=()=>res(i);
      i.onerror=()=>rej(new Error("Не вдалося завантажити зображення"));
      i.src=src;
    });
  }

  // Remote player cards come from Supabase Storage. Fetching them as Blob first
  // prevents Safari/Chrome from tainting the lineup canvas.
  try{
    const response=await fetch(src,{mode:"cors",cache:"force-cache"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const blob=await response.blob();
    const objectUrl=URL.createObjectURL(blob);
    try{
      return await new Promise((res,rej)=>{
        const i=new Image();
        i.onload=()=>res(i);
        i.onerror=()=>rej(new Error("Не вдалося прочитати картку"));
        i.src=objectUrl;
      });
    }finally{
      // revoke on a later tick so drawImage has already consumed the image
      setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
    }
  }catch(fetchErr){
    console.warn("Canvas-safe image fetch failed",fetchErr);

    // Second attempt with explicit anonymous CORS.
    return await new Promise((res,rej)=>{
      const i=new Image();
      i.crossOrigin="anonymous";
      i.onload=()=>res(i);
      i.onerror=()=>rej(fetchErr);
      i.src=src;
    });
  }
}

function renderSquads(){
  const squadsScreen=$("screen-squads");
  if(squadsScreen){
    const light=
      document.documentElement.dataset.siteTheme==="light" ||
      document.documentElement.classList.contains("light-theme");
    squadsScreen.classList.toggle("squads-light-now",light);
    squadsScreen.classList.toggle("squads-dark-now",!light);
  }

  const box=$("squadsList");
  const arr=[...squads].sort((a,b)=>b.createdAt-a.createdAt);
  if(!arr.length){box.innerHTML=`<div class="empty-state"><strong>ЩЕ НЕМАЄ ЗБЕРЕЖЕНИХ СКЛАДІВ</strong><span>Створи розстановку у вкладці «Тактика».</span></div>`;return}
  box.innerHTML="";
  arr.forEach(s=>{
    const row=document.createElement("div");row.className="squad-row";
    row.innerHTML=`
      <img class="squad-thumb" src="${s.image||"player-placeholder.png"}" alt="" onerror="this.src='player-placeholder.png'">
      <div class="squad-info"><strong>${esc(s.name)}</strong><span>СХЕМА: <b>${esc(s.formation)}</b></span><span>СТВОРЕНО: ${new Date(s.createdAt).toLocaleString("uk-UA")}</span></div>
      <button class="more-btn">⋯</button>
      <div class="squad-menu hidden">
        <button class="dark-btn open">ВІДКРИТИ</button>
        <button class="dark-btn rename">ПЕРЕЙМЕНУВАТИ</button>
        <button class="danger-btn delete">ВИДАЛИТИ</button>
      </div>`;
    row.querySelector(".more-btn").addEventListener("click",()=>row.querySelector(".squad-menu").classList.toggle("hidden"));
    row.querySelector(".squad-thumb").addEventListener("click",()=>openSavedImage(s));
    row.querySelector(".open").addEventListener("click",()=>openSavedImage(s));
    row.querySelector(".rename").addEventListener("click",async()=>{
      const n=prompt("Нова назва:",s.name);if(n===null||!n.trim())return;s.name=n.trim();await put("squads",s);squads=await getAll("squads");renderSquads()
    });
    row.querySelector(".delete").addEventListener("click",async()=>{
      if(!confirm("Видалити цей збережений склад?"))return;await del("squads",s.id);squads=await getAll("squads");renderSquads()
    });
    box.appendChild(row);
  });
}
let currentSavedImage=null;
let currentRenderedSavedImage="";

function currentSiteThemeIsLight(){
  return document.documentElement.dataset.siteTheme==="light" ||
    document.documentElement.classList.contains("light-theme") ||
    document.body?.dataset.siteTheme==="light" ||
    document.body?.classList.contains("light-theme");
}

async function rebuildLegacySavedImageForTheme(s){
  const src=s?.image||"";
  if(!src)return "";

  try{
    const im=await loadImg(src);
    /* Saved lineup canonical canvas is 720x1080. The pitch is always
       rendered at x=56,y=135,w=608,h=850. Scale coordinates to the
       actual stored image so this also works with 1.5x exports. */
    const sx=im.naturalWidth/720;
    const sy=im.naturalHeight/1080;

    const W=720,H=1080,SCALE=2;
    const c=document.createElement("canvas");
    c.width=W*SCALE;c.height=H*SCALE;
    const ctx=c.getContext("2d");
    ctx.scale(SCALE,SCALE);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";

    const light=currentSiteThemeIsLight();

    if(light){
      ctx.fillStyle="#fffdf8";ctx.fillRect(0,0,W,H);
      const g=ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,"#fffaf0");g.addColorStop(.5,"#fffdf8");g.addColorStop(1,"#f7eedc");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }else{
      ctx.fillStyle="#08090b";ctx.fillRect(0,0,W,H);
      const g=ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,"#180b0b");g.addColorStop(.5,"#090a0b");g.addColorStop(1,"#15100b");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }

    ctx.fillStyle=light?"#a97b1f":"#e2bd70";
    ctx.font="bold 16px Arial";
    ctx.fillText("CENTURIA ATHLETICS",38,42);

    ctx.fillStyle=light?"#28241e":"#f3e6cd";
    ctx.font="bold 30px Arial";
    ctx.fillText(String(s?.name||"Склад").toUpperCase(),38,82);

    ctx.fillStyle=light?"#8f826e":"#b9a98e";
    ctx.font="bold 14px Arial";
    const formation=s?.formation||"—";
    const dt=s?.createdAt ? new Date(s.createdAt).toLocaleString("uk-UA") : "";
    ctx.fillText(`СХЕМА: ${formation}${dt?"   •   "+dt:""}`,38,108);

    /* Copy ONLY the green pitch from the old saved screenshot. */
    const L=SAVED_LINEUP_LAYOUT_V780;
    ctx.drawImage(
      im,
      56*sx,135*sy,608*sx,850*sy,
      L.px,L.py,L.pw,L.ph
    );

    ctx.fillStyle=light?"#8f826e":"#b9a98e";
    ctx.font="13px Arial";
    ctx.fillText("Centuria Athletics • Daniil Osetskyi",28,1068);

    return c.toDataURL("image/png");
  }catch(err){
    console.warn("Legacy lineup theme adaptation failed",err);
    return src;
  }
}

async function renderSavedLineupInViewerTheme(s){
  /* New saved squads are fully re-rendered from formation/player data.
     Old image-only squads are rebuilt by preserving just the pitch and
     redrawing the surrounding frame in the CURRENT viewer theme. */
  const fk=savedSquadFormationKey(s);
  if(!fk || !s?.lineupSnapshot){
    return await rebuildLegacySavedImageForTheme(s);
  }

  const oldFormation=currentFormation;
  const oldLineup=lineup;

  try{
    currentFormation=fk;
    lineup={...s.lineupSnapshot};
    return await renderLineupImage(s.name||"Склад");
  }catch(err){
    console.warn("Saved lineup theme render failed",err);
    return s?.image||"";
  }finally{
    currentFormation=oldFormation;
    lineup=oldLineup;
  }
}

async function openSavedImage(s){
  currentSavedImage=s;
  const img=$("savedImageView");
  const dialog=$("imageDialog");
  if(!img||!dialog)return;

  /* Apply the viewer's theme BEFORE the dialog is painted. */
  const light=currentSiteThemeIsLight();
  dialog.classList.toggle("viewer-light",light);
  dialog.classList.toggle("viewer-dark",!light);
  dialog.classList.add("saved-image-loading");
  currentRenderedSavedImage="";

  /* Never show the author's original image as an intermediate frame.
     Keep the image hidden until the viewer-theme render is completely ready. */
  img.classList.remove("zoomed");
  img.classList.add("saved-image-pending");
  img.removeAttribute("src");
  img.dataset.savedSquadId=s.id||"";
  img.style.cursor="zoom-in";

  dialog.showModal();

  const themedImage=await renderSavedLineupInViewerTheme(s);
  if(currentSavedImage?.id!==s.id || !themedImage)return;
  currentRenderedSavedImage=themedImage;

  await new Promise(resolve=>{
    const done=()=>{
      img.removeEventListener("load",done);
      img.removeEventListener("error",done);
      resolve();
    };
    img.addEventListener("load",done,{once:true});
    img.addEventListener("error",done,{once:true});
    img.src=themedImage;
    if(img.complete) done();
  });

  if(currentSavedImage?.id===s.id){
    requestAnimationFrame(()=>{
      dialog.classList.remove("saved-image-loading");
      img.classList.remove("saved-image-pending");
    });
  }
}
$("closeImage").addEventListener("click",()=>{
  const dialog=$("imageDialog");
  const img=$("savedImageView");
  dialog?.close();
  dialog?.classList.remove("saved-image-loading");
  img?.classList.remove("saved-image-pending","zoomed");
});

$("savedImageView")?.addEventListener("click",e=>{
  /* If the click is on a player card, the existing profile-opening handler
     may consume it. Otherwise toggle a larger zoom for detailed viewing. */
  const p=typeof savedSquadPlayerAtPoint==="function"
    ? savedSquadPlayerAtPoint(currentSavedImage,e.currentTarget,e.clientX,e.clientY)
    : null;
  if(p)return;

  e.currentTarget.classList.toggle("zoomed");
});

/* Tap the dark/light area around the image to return/close. */
$("imageDialog")?.addEventListener("click",e=>{
  if(e.target===$("imageDialog"))$("imageDialog").close();
});

/* v5.77 — tap a player card inside a saved lineup image to open that player's profile */
function savedSquadFormationKey(s){
  if(s?.formationKey && FORMATIONS[s.formationKey])return s.formationKey;
  const wanted=String(s?.formation||"").trim();
  return Object.keys(FORMATIONS).find(k=>formationName(k)===wanted)||null;
}

function savedSquadPlayerAtPoint(s,img,clientX,clientY){
  if(!s||!img)return null;
  const fk=savedSquadFormationKey(s);
  if(!fk)return null;

  const rect=img.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;

  /* renderLineupImage canonical coordinates: W=720,H=1080 */
  const x=(clientX-rect.left)/rect.width*720;
  const y=(clientY-rect.top)/rect.height*1080;

  const {px,py,pw,ph,cw,ch}=SAVED_LINEUP_LAYOUT_V780;
  const slots=FORMATIONS[fk];

  let best=null;
  let bestDist=Infinity;

  slots.forEach((slot,i)=>{
    const [pos,sx,sy]=slot;
    const projected=savedPitchPointPct(sx,sy);
    const cx=projected.x;
    const rawCy=projected.y;
    const cy=pos==="GK" ? Math.min(rawCy,py+ph-(ch/2+52)) : rawCy;

    /* slightly larger than the visible card for easier finger tapping */
    const hitW=cw+34;
    const hitH=ch+34;
    if(x>=cx-hitW/2 && x<=cx+hitW/2 && y>=cy-hitH/2 && y<=cy+hitH/2){
      const d=Math.hypot(x-cx,y-cy);
      if(d<bestDist){bestDist=d;best=i;}
    }
  });

  if(best==null)return null;

  const key=`${fk}-${best}`;
  let playerId=s?.lineupSnapshot?.[key]||null;

  /* Backward-compatible fallback for older saved squads:
     use current lineup only if it uses the same formation. */
  if(!playerId && currentFormation===fk){
    playerId=lineup[key]||null;
  }

  return playerId ? players.find(p=>p.id===playerId)||null : null;
}

$("savedImageView")?.addEventListener("click",e=>{
  const p=savedSquadPlayerAtPoint(currentSavedImage,e.currentTarget,e.clientX,e.clientY);
  if(!p)return; /* tap outside a player card keeps normal image behaviour */
  e.preventDefault();
  e.stopPropagation();
  $("imageDialog")?.close();
  setTimeout(()=>openPlayerModal(p.id),60);
});

$("downloadImage").addEventListener("click",async()=>{
  if(!currentSavedImage)return;

  let src=currentRenderedSavedImage;
  if(!src){
    try{
      src=await renderSavedLineupInViewerTheme(currentSavedImage);
      currentRenderedSavedImage=src||"";
    }catch(err){
      console.error("High quality PNG render failed",err);
    }
  }
  if(!src){
    showToast("Не вдалося підготувати PNG");
    return;
  }

  const a=document.createElement("a");
  a.href=src;
  a.download=(currentSavedImage.name||"centuria-lineup")
    .replace(/[^\wа-яіїєґ-]+/gi,"_")+".png";
  a.click();
});
$("newLineupBtn").addEventListener("click",()=>navigate("tactics"));

async function resizeImage(file,maxW,maxH,quality){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const r=Math.min(maxW/img.width,maxH/img.height,1);
        const c=document.createElement("canvas");c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror=reject;img.src=reader.result;
    };
    reader.onerror=reject;reader.readAsDataURL(file);
  });
}

/* Settings */
$("langRu").addEventListener("click",()=>showToast("Державною, блять, буде!"));
$("langEn").addEventListener("click",()=>showToast("Не видумуй!"));

$("clearPlayersBtn").addEventListener("click",async()=>{
  if(!confirm("Точно видалити ВСІХ гравців? Цю дію не можна скасувати."))return;
  await clearStore("players");players=[];lineup={};saveLineupState();renderPlayers();renderPitch();showToast("Усіх гравців видалено");
});
$("clearSquadsBtn").addEventListener("click",async()=>{
  if(!confirm("Точно видалити ВСІ збережені склади?"))return;
  await clearStore("squads");squads=[];renderSquads();showToast("Усі склади видалено");
});

/* Music — v6.65: settings only, no home-screen start button */
const music=$("bgMusic"), toggle=$("musicToggle"), volume=$("volumeRange");

let audioCtx=null;
let musicSourceNode=null;
let musicGainNode=null;

async function initWebAudioVolume(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx || !music) return false;

  try{
    if(!audioCtx){
      audioCtx=new AudioCtx();
    }

    if(!musicSourceNode){
      musicSourceNode=audioCtx.createMediaElementSource(music);
      musicGainNode=audioCtx.createGain();
      musicSourceNode.connect(musicGainNode);
      musicGainNode.connect(audioCtx.destination);
    }

    if(audioCtx.state==="suspended"){
      await audioCtx.resume();
    }

    return true;
  }catch(err){
    console.warn("Web Audio init failed",err);
    return false;
  }
}

function setBackgroundVolume(value){
  if(!music)return;

  let percent=parseFloat(value);
  if(!Number.isFinite(percent)) percent=35;
  percent=Math.max(0,Math.min(100,percent));
  const level=percent/100;

  if(musicGainNode && audioCtx){
    try{
      const now=audioCtx.currentTime;
      musicGainNode.gain.cancelScheduledValues(now);
      musicGainNode.gain.setValueAtTime(level,now);
      music.volume=1;
      music.muted=false;
    }catch(e){
      console.warn("Gain volume apply failed",e);
    }
  }else{
    try{
      music.volume=level;
      music.muted=percent===0;
    }catch(e){
      console.warn("HTML media volume apply failed",e);
    }
  }

  localStorage.setItem("ca_volume",String(percent));
}

/*
  v6.65 migration: music is OFF the first time this version is opened,
  even if an older build left ca_music=on. After that, the Settings toggle
  remains the only control and the user's choice can persist normally.
*/
const musicV665MigrationKey="ca_music_v665_default_off_done";
if(localStorage.getItem(musicV665MigrationKey)!=="1"){
  localStorage.setItem("ca_music","off");
  localStorage.setItem(musicV665MigrationKey,"1");
}

if(toggle){
  toggle.checked=localStorage.getItem("ca_music")==="on";
}
if(volume){
  volume.value=localStorage.getItem("ca_volume")||"35";
}
if(music){
  music.loop=true;
  setBackgroundVolume(volume?.value||35);
  if(!toggle?.checked){
    music.pause();
  }else{
    /* Best-effort restore for users who explicitly enabled music earlier. */
    music.play().catch(()=>{});
  }
}

async function startMusicFromSettings(){
  if(!music || !toggle?.checked)return false;
  await initWebAudioVolume();
  setBackgroundVolume(volume?.value||35);
  try{
    await music.play();
    setBackgroundVolume(volume?.value||35);
    setTimeout(()=>setBackgroundVolume(volume?.value||35),60);
    return true;
  }catch(err){
    console.warn("Music playback blocked",err);
    return false;
  }
}

if(toggle){
  toggle.addEventListener("change",async()=>{
    localStorage.setItem("ca_music",toggle.checked?"on":"off");
    if(toggle.checked){
      const ok=await startMusicFromSettings();
      if(!ok){
        toggle.checked=false;
        localStorage.setItem("ca_music","off");
        showToast("Не вдалося увімкнути музику. Перевір гучність пристрою.");
      }
    }else if(music){
      music.pause();
    }
  });
}

if(volume){
  setBackgroundVolume(volume.value);

  const ensureAudioAndApply=async()=>{
    if(toggle?.checked) await initWebAudioVolume();
    setBackgroundVolume(volume.value);
  };

  volume.addEventListener("pointerdown",ensureAudioAndApply);
  volume.addEventListener("touchstart",ensureAudioAndApply,{passive:true});
  volume.addEventListener("input",ensureAudioAndApply);
  volume.addEventListener("change",ensureAudioAndApply);
  volume.addEventListener("touchend",ensureAudioAndApply,{passive:true});
  volume.addEventListener("pointerup",ensureAudioAndApply);
}

if(music){
  music.addEventListener("error",()=>{
    if(toggle){
      toggle.checked=false;
      localStorage.setItem("ca_music","off");
    }
    showToast("Не вдалося завантажити фонову музику");
  });
}

/* init */



/* Gatherings */
function formatGatheringDate(dateStr){
  if(!dateStr)return "";
  const [y,m,d]=dateStr.split("-").map(Number);
  const dt=new Date(y,m-1,d);
  return new Intl.DateTimeFormat("uk-UA",{
    weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"
  }).format(dt);
}

function gatheringIsPast(g){
  if(g.is_closed)return true;
  if(!g.gathering_date)return false;
  const time=g.gathering_time ? g.gathering_time.slice(0,5) : "23:59";
  const dt=new Date(`${g.gathering_date}T${time}:00`);
  return dt.getTime()<Date.now();
}

async function loadGatherings(){
  if(!sb || !authUser){
    gatherings=[];
    gatheringVotes=[];
    renderGatherings();
    return;
  }

  const [{data:gData,error:gErr},{data:vData,error:vErr},{data:lData,error:lErr}]=await Promise.all([
    sb.from("gatherings")
      .select("id,title,gathering_date,gathering_time,note,is_closed,created_by,created_at")
      .order("gathering_date",{ascending:true})
      .order("gathering_time",{ascending:true}),
    sb.from("gathering_votes")
      .select("gathering_id,user_id,vote,updated_at"),
    sb.from("gathering_lineup_slots")
      .select("gathering_id,slot_key,position,player_id,updated_by,updated_at")
  ]);

  if(gErr || vErr || lErr){
    console.error("Gatherings load error",gErr||vErr||lErr);
    const list=$("gatheringsList");
    if(list)list.innerHTML=`<div class="gatherings-empty">Не вдалося завантажити збори.</div>`;
    return;
  }

  gatherings=gData||[];
  gatheringVotes=vData||[];
  gatheringLineupSlots=lData||[];
  await loadTeamProfiles();
  renderGatherings();
  if($("screen-home")?.classList.contains("active"))loadHomeNextEvent();
}

function votesForGathering(id){
  return gatheringVotes.filter(v=>v.gathering_id===id);
}

function lineupForGathering(id){
  return gatheringLineupSlots.filter(s=>s.gathering_id===id);
}

function yesLinkedPlayersForGathering(id){
  const yesUserIds=new Set(
    votesForGathering(id).filter(v=>v.vote==="yes").map(v=>v.user_id)
  );
  const playerIds=new Set();
  yesUserIds.forEach(uid=>{
    const prof=teamProfiles.get(uid);
    if(prof?.player_id)playerIds.add(prof.player_id);
  });

  // «Перегляд» завжди доступний у складі на збір без голосування/акаунта.
  return players.filter(p=>playerIds.has(p.id) || p.status==="Перегляд");
}

function gatheringFormationStorageKey(gatheringId){
  return `ca_gathering_formation_${gatheringId}`;
}

function gatheringFormationFromSlotKey(slotKey){
  const key=String(slotKey||"").split("-")[0];
  return FORMATIONS[key] ? key : null;
}

function gatheringFormationKey(g){
  try{
    const stored=localStorage.getItem(gatheringFormationStorageKey(g.id));
    if(FORMATIONS[stored])return stored;
  }catch(_e){}

  const latest=[...lineupForGathering(g.id)]
    .filter(row=>gatheringFormationFromSlotKey(row.slot_key))
    .sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0];
  return gatheringFormationFromSlotKey(latest?.slot_key) || "451";
}

async function setGatheringFormation(gatheringId,formationKey){
  if(!FORMATIONS[formationKey])return;
  const g=gatherings.find(x=>x.id===gatheringId);
  if(!g || gatheringIsPast(g) || !canEditSite())return;

  try{localStorage.setItem(gatheringFormationStorageKey(gatheringId),formationKey)}catch(_e){}

  // If this formation already has saved players, refresh its timestamp so other
  // devices can infer which gathering formation was selected most recently.
  if(sb && authUser){
    try{
      await sb.from("gathering_lineup_slots")
        .update({updated_at:new Date().toISOString(),updated_by:authUser.id})
        .eq("gathering_id",gatheringId)
        .like("slot_key",`${formationKey}-%`);
    }catch(_e){}
  }

  renderGatherings();
}

function gatheringLineupSlotHtml(g,formationKey,slot,index){
  const key=`${formationKey}-${index}`;
  const row=lineupForGathering(g.id).find(s=>s.slot_key===key);
  const p=row?.player_id ? players.find(x=>x.id===row.player_id) : null;
  const editable=canEditSite()&&!gatheringIsPast(g);
  return `<div class="gathering-lineup-slot" style="left:${slot[1]}%;top:${slot[2]}%">
    ${p&&p.status?`<div class="slot-status gathering-slot-status slot-status-${p.status==="Капітан"?"captain":p.status==="Віце-капітан"?"vice":"trial"}">${esc(p.status)}</div>`:""}
    <button type="button" class="gathering-lineup-card ${p?"filled live-player-card":""}" ${editable?`data-gathering-lineup-slot="${g.id}|${key}|${slot[0]}"`:"disabled"}>
      ${p?`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">`:"<span>＋</span>"}
    </button>
    <div class="gathering-lineup-name">${p?esc(p.name):"Порожньо"}</div>
    <div class="gathering-lineup-pos">${POS_LABEL[slot[0]]||slot[0]}</div>
  </div>`;
}

function gatheringLineupHtml(g){
  const formationKey=gatheringFormationKey(g);
  const closed=gatheringIsPast(g);
  const editable=canEditSite()&&!closed;
  return `<div class="gathering-lineup-wrap">
    <div class="gathering-lineup-head">
      <div><strong>⚽ СКЛАД НА ЗБІР</strong><span>${closed?"Фінальний склад збережено в історії":"Доступні ті, хто проголосував «Буду», та гравці зі статусом «Перегляд»"}</span></div>
      ${editable?`<small>Натисни +, щоб поставити гравця</small>`:""}
    </div>
    <div class="gathering-formation-tabs" role="group" aria-label="Схема складу на збір">
      ${["451","352","4411"].map(key=>`<button type="button" class="gathering-formation-btn ${formationKey===key?"active":""}" data-gathering-formation="${g.id}|${key}" ${editable?"":"disabled"}>${formationName(key)}</button>`).join("")}
    </div>
    <div class="gathering-lineup-pitch" data-gathering-formation-key="${formationKey}">
      ${FORMATIONS[formationKey].map((slot,i)=>gatheringLineupSlotHtml(g,formationKey,slot,i)).join("")}
    </div>
  </div>`;
}

async function openGatheringLineupPickerV599(gatheringId,slotKey,position){
  if(!canEditSite())return;
  const g=gatherings.find(x=>x.id===gatheringId);
  if(!g || gatheringIsPast(g))return;

  gatheringLineupPickerState={gatheringId,slotKey,position};
  const list=$("gatheringLineupPickerList");
  const title=$("gatheringLineupPickerTitle");
  if(title)title.textContent=`ОБЕРИ ГРАВЦЯ — ${POS_LABEL[position]||position}`;
  if(!list)return;

  const eligible=yesLinkedPlayersForGathering(gatheringId);
  const lineup=lineupForGathering(gatheringId);
  const occupiedIds=new Set(lineup.filter(s=>s.slot_key!==slotKey && s.player_id).map(s=>s.player_id));
  const current=lineup.find(s=>s.slot_key===slotKey)?.player_id||null;
  const available=eligible.filter(p=>!occupiedIds.has(p.id));

  list.innerHTML=`
    ${current?`<button type="button" class="gathering-picker-player clear" data-gathering-player="">× <strong>ОЧИСТИТИ ПОЗИЦІЮ</strong></button>`:""}
    ${available.length?available.map(p=>{
      const comp=p.primaryPos===position?"good":(p.extraPositions||[]).includes(position)?"alt":"bad";
      const label=comp==="good"?"ОСНОВНА":comp==="alt"?"ДОДАТКОВА":"НЕ РІДНА";
      return `<button type="button" class="gathering-picker-player" data-gathering-player="${p.id}">
        <img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="">
        <div><strong>${esc(p.name)}</strong><small>${POS_LABEL[p.primaryPos]||p.primaryPos}${p.archetype?" • "+esc(p.archetype):""}</small></div>
        <span class="compat ${comp}">${label}</span>
      </button>`;
    }).join(""):`<div class="empty-state"><strong>НЕМАЄ ДОСТУПНИХ ГРАВЦІВ</strong><span>Гравець має проголосувати «Буду» або мати статус «Перегляд».</span></div>`}`;

  list.querySelectorAll("[data-gathering-player]").forEach(btn=>{
    btn.addEventListener("click",()=>saveGatheringLineupSlotV599(btn.dataset.gatheringPlayer||null));
  });
  $("gatheringLineupPickerModal")?.classList.remove("hidden");
}

function closeGatheringLineupPickerV599(){
  $("gatheringLineupPickerModal")?.classList.add("hidden");
  gatheringLineupPickerState=null;
}

async function saveGatheringLineupSlotV599(playerId){
  if(!canEditSite()||!gatheringLineupPickerState)return;
  const {gatheringId,slotKey,position}=gatheringLineupPickerState;

  if(playerId){
    const eligible=yesLinkedPlayersForGathering(gatheringId).some(p=>p.id===playerId);
    if(!eligible){
      showToast("Гравець недоступний: потрібен голос «Буду» або статус «Перегляд»");
      return;
    }
    const duplicate=lineupForGathering(gatheringId).find(s=>s.player_id===playerId && s.slot_key!==slotKey);
    if(duplicate){
      showToast("Цей гравець уже стоїть на полі");
      return;
    }
    const {error}=await sb.from("gathering_lineup_slots").upsert({
      gathering_id:gatheringId,
      slot_key:slotKey,
      position,
      player_id:playerId,
      updated_by:authUser.id,
      updated_at:new Date().toISOString()
    },{onConflict:"gathering_id,slot_key"});
    if(error){
      console.error("Gathering lineup save",error);
      showToast("Не вдалося змінити склад");
      return;
    }
  }else{
    const {error}=await sb.from("gathering_lineup_slots")
      .delete()
      .eq("gathering_id",gatheringId)
      .eq("slot_key",slotKey);
    if(error){
      console.error("Gathering lineup clear",error);
      showToast("Не вдалося очистити позицію");
      return;
    }
  }

  closeGatheringLineupPickerV599();
  await loadGatherings();
}

async function removeIneligiblePlayerFromGatheringV599(gatheringId,userId){
  if(!sb)return;
  const profile=teamProfiles.get(userId);
  if(!profile?.player_id)return;
  // Editors/admins can remove stale lineup spots when their own vote changes.
  // If the voter is a viewer, cleanup is also attempted; RLS safely rejects it.
  const {error}=await sb.from("gathering_lineup_slots")
    .delete()
    .eq("gathering_id",gatheringId)
    .eq("player_id",profile.player_id);
  if(error && canEditSite())console.warn("Gathering lineup cleanup",error);
}

$("closeGatheringLineupPicker")?.addEventListener("click",closeGatheringLineupPickerV599);
document.querySelectorAll("[data-close-gathering-lineup-picker]").forEach(el=>el.addEventListener("click",closeGatheringLineupPickerV599));

function memberName(userId){
  const p=teamProfiles.get(userId);
  return p?.display_name || "Гравець";
}

function renderVoteNames(votes,type){
  const people=votes.filter(v=>v.vote===type);
  if(!people.length)return `<div class="gathering-vote-names empty">—</div>`;
  return `<div class="gathering-vote-names">${
    people.map(v=>`<span>${esc(memberName(v.user_id))}</span>`).join("")
  }</div>`;
}

function renderGatherings(){
  const list=$("gatheringsList");
  if(!list)return;

  const filtered=gatherings.filter(g=>{
    const past=gatheringIsPast(g);
    return gatheringsMode==="history" ? past : !past;
  });

  if(!filtered.length){
    list.innerHTML=`<div class="gatherings-empty">${
      gatheringsMode==="history"
        ?"Історія зборів поки порожня."
        :"Активних зборів зараз немає."
    }</div>`;
    return;
  }

  const sorted=[...filtered].sort((a,b)=>{
    const ad=`${a.gathering_date} ${a.gathering_time||"23:59"}`;
    const bd=`${b.gathering_date} ${b.gathering_time||"23:59"}`;
    return gatheringsMode==="history" ? bd.localeCompare(ad) : ad.localeCompare(bd);
  });

  list.innerHTML=sorted.map(g=>{
    const votes=votesForGathering(g.id);
    const yes=votes.filter(v=>v.vote==="yes").length;
    const no=votes.filter(v=>v.vote==="no").length;
    const maybe=votes.filter(v=>v.vote==="maybe").length;
    const mine=votes.find(v=>v.user_id===authUser?.id)?.vote||"";
    const closed=gatheringIsPast(g);

    return `<article class="gathering-card ${closed?"closed":""}" data-gathering-id="${g.id}">
      <div class="gathering-card-head">
        <div>
          <div class="gathering-date">${esc(formatGatheringDate(g.gathering_date))}${g.gathering_time?` · ${esc(g.gathering_time.slice(0,5))}`:""}</div>
          <h3>${esc(g.title)}</h3>
        </div>
        <div class="gathering-head-actions">
          ${closed?`<span class="gathering-closed-badge">ЗАКРИТО</span>`:""}
          ${canEditSite()&&!closed?`<button type="button" class="gathering-close-btn" data-close-gathering-id="${g.id}">ЗАКРИТИ</button>`:""}
          ${canEditSite()?`<button type="button" class="gathering-delete-btn" data-delete-gathering-id="${g.id}">×</button>`:""}
        </div>
      </div>

      ${g.note?`<div class="gathering-note">${esc(g.note)}</div>`:""}

      <div class="gathering-stats">
        <div class="gathering-stat yes"><strong>${yes}</strong><span>БУДУ</span></div>
        <div class="gathering-stat maybe"><strong>${maybe}</strong><span>ПІД ПИТАННЯМ</span></div>
        <div class="gathering-stat no"><strong>${no}</strong><span>НЕ БУДУ</span></div>
      </div>

      ${!closed?`<div class="gathering-vote-buttons">
        <button type="button" class="gathering-vote-btn yes ${mine==="yes"?"selected":""}" data-vote="yes" data-gathering="${g.id}">✓ Буду</button>
        <button type="button" class="gathering-vote-btn maybe ${mine==="maybe"?"selected":""}" data-vote="maybe" data-gathering="${g.id}">? Під питанням</button>
        <button type="button" class="gathering-vote-btn no ${mine==="no"?"selected":""}" data-vote="no" data-gathering="${g.id}">× Не буду</button>
      </div>`:""}

      <div class="gathering-voters">
        <div class="gathering-voter-group">
          <div class="gathering-voter-title yes">БУДУ</div>
          ${renderVoteNames(votes,"yes")}
        </div>
        <div class="gathering-voter-group">
          <div class="gathering-voter-title maybe">ПІД ПИТАННЯМ</div>
          ${renderVoteNames(votes,"maybe")}
        </div>
        <div class="gathering-voter-group">
          <div class="gathering-voter-title no">НЕ БУДУ</div>
          ${renderVoteNames(votes,"no")}
        </div>
      </div>

      ${gatheringLineupHtml(g)}
    </article>`;
  }).join("");

  list.querySelectorAll("[data-vote]").forEach(btn=>{
    btn.addEventListener("click",()=>voteGathering(btn.dataset.gathering,btn.dataset.vote));
  });
  list.querySelectorAll("[data-gathering-formation]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const [gatheringId,formationKey]=btn.dataset.gatheringFormation.split("|");
      setGatheringFormation(gatheringId,formationKey);
    });
  });
  list.querySelectorAll("[data-gathering-lineup-slot]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const [gatheringId,slotKey,position]=btn.dataset.gatheringLineupSlot.split("|");
      openGatheringLineupPickerV599(gatheringId,slotKey,position);
    });
  });
  list.querySelectorAll("[data-close-gathering-id]").forEach(btn=>{
    btn.addEventListener("click",()=>closeGathering(btn.dataset.closeGatheringId));
  });
  list.querySelectorAll("[data-delete-gathering-id]").forEach(btn=>{
    btn.addEventListener("click",()=>deleteGathering(btn.dataset.deleteGatheringId));
  });
}

async function voteGathering(gatheringId,vote){
  if(!sb || !authUser){openAuthModal();return}
  const g=gatherings.find(x=>x.id===gatheringId);
  if(!g || gatheringIsPast(g)){showToast("Цей збір уже закритий");return}

  const payload={
    gathering_id:gatheringId,
    user_id:authUser.id,
    vote,
    updated_at:new Date().toISOString()
  };
  const {error}=await sb.from("gathering_votes").upsert(payload,{
    onConflict:"gathering_id,user_id"
  });
  if(error){
    console.error(error);
    showToast("Не вдалося зберегти голос");
    return;
  }

  if(vote!=="yes"){
    await removeIneligiblePlayerFromGatheringV599(gatheringId,authUser.id);
  }
  await loadGatherings();
}

function openGatheringModal(){
  if(!canEditSite())return;
  const now=new Date();
  const tomorrow=new Date(now.getTime()+86400000);
  const y=tomorrow.getFullYear();
  const m=String(tomorrow.getMonth()+1).padStart(2,"0");
  const d=String(tomorrow.getDate()).padStart(2,"0");
  $("gatheringTitleInput").value="Тренування";
  $("gatheringDateInput").value=`${y}-${m}-${d}`;
  $("gatheringTimeInput").value="21:00";
  $("gatheringNoteInput").value="";
  $("gatheringModalStatus").textContent="";
  $("gatheringModal").classList.remove("hidden");
  document.body.classList.add("auth-open");
}

function closeGatheringModal(){
  $("gatheringModal")?.classList.add("hidden");
  document.body.classList.remove("auth-open");
}

async function saveGathering(){
  if(!sb || !authUser || !canEditSite())return;
  const title=$("gatheringTitleInput").value.trim();
  const date=$("gatheringDateInput").value;
  const time=$("gatheringTimeInput").value;
  const note=$("gatheringNoteInput").value.trim();

  if(!title || !date){
    $("gatheringModalStatus").textContent="Вкажи назву та дату збору.";
    return;
  }

  $("saveGatheringBtn").disabled=true;
  $("gatheringModalStatus").textContent="Створення…";

  const {error}=await sb.from("gatherings").insert({
    title,
    gathering_date:date,
    gathering_time:time||null,
    note:note||null,
    created_by:authUser.id
  });

  $("saveGatheringBtn").disabled=false;

  if(error){
    console.error(error);
    $("gatheringModalStatus").textContent="Не вдалося створити збір.";
    return;
  }

  const prettyDate=date.split("-").reverse().join(".");
  const gatheringPushText=`${title} — ${prettyDate}${time ? ` о ${time}` : ""}`;
  sendPushEvent("gathering","Новий збір Centuria Athletics",gatheringPushText);

  closeGatheringModal();
  await loadGatherings();
  showToast("Збір створено");
}

async function closeGathering(id){
  if(!canEditSite() || !confirm("Закрити голосування цього збору?"))return;
  const {error}=await sb.from("gatherings").update({is_closed:true}).eq("id",id);
  if(error){showToast("Не вдалося закрити збір");return}
  await loadGatherings();
}

async function deleteGathering(id){
  if(!canEditSite() || !confirm("Повністю видалити цей збір і всі голоси?"))return;
  const {error}=await sb.from("gatherings").delete().eq("id",id);
  if(error){showToast("Не вдалося видалити збір");return}
  await loadGatherings();
}

function setGatheringsMode(mode){
  gatheringsMode=mode;
  $("activeGatheringsTab")?.classList.toggle("active",mode==="active");
  $("historyGatheringsTab")?.classList.toggle("active",mode==="history");
  renderGatherings();
}

async function refreshGatheringsAuthState(){
  const gate=$("gatheringsGate");
  const panel=$("gatheringsPanel");
  const createBtn=$("createGatheringBtn");
  if(!gate || !panel)return;

  if(authUser){
    gate.classList.add("hidden");
    panel.classList.remove("hidden");
    createBtn?.classList.toggle("hidden",!canEditSite());
    await loadGatherings();
  }else{
    gate.classList.remove("hidden");
    panel.classList.add("hidden");
    createBtn?.classList.add("hidden");
  }
}

async function openGatheringsScreen(){
  setGatheringsMode("active");
  await refreshGatheringsAuthState();

  if(!gatheringsPollTimer){
    gatheringsPollTimer=setInterval(()=>{
      if(authUser && $("screen-gatherings")?.classList.contains("active")){
        loadGatherings();
      }
    },4000);
  }
}

$("gatheringsLoginBtn")?.addEventListener("click",openAuthModal);
$("createGatheringBtn")?.addEventListener("click",openGatheringModal);
$("closeGatheringModal")?.addEventListener("click",closeGatheringModal);
document.querySelectorAll("[data-close-gathering]").forEach(el=>el.addEventListener("click",closeGatheringModal));
$("saveGatheringBtn")?.addEventListener("click",saveGathering);
$("activeGatheringsTab")?.addEventListener("click",()=>setGatheringsMode("active"));
$("historyGatheringsTab")?.addEventListener("click",()=>setGatheringsMode("history"));



/* Team chat */
function initials(name){
  const clean=(name||"?").trim();
  return clean ? clean.slice(0,1).toUpperCase() : "?";
}

function profileAvatarHtml(profile,extraClass=""){
  if(profile?.avatar_url){
    return `<span class="chat-avatar ${extraClass}"><img src="${profile.avatar_url}" alt=""></span>`;
  }
  if(profile?.player_id){
    const linked=players.find(x=>x.id===profile.player_id);
    if(linked?.cardImage){
      return `<span class="chat-avatar ${extraClass} linked-player-avatar"><img src="${linked.cardImage}" alt=""></span>`;
    }
  }
  return `<span class="chat-avatar chat-avatar-fallback ${extraClass}">${esc(initials(profile?.display_name))}</span>`;
}

async function loadTeamProfiles(){
  if(!sb || !authUser){
    teamProfiles=new Map();
    return;
  }
  const {data,error}=await sb.from("profiles")
    .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at");
  if(error){
    console.error("Profiles load error",error);
    return;
  }
  teamProfiles=new Map((data||[]).map(p=>[p.user_id,p]));
  renderMembersList();
}

function encodeChatMetaV803(meta){
  try{
    const clean={};
    if(meta?.pinned)clean.pinned=true;
    if(meta?.reactions && Object.keys(meta.reactions).length)clean.reactions=meta.reactions;
    if(!Object.keys(clean).length)return "";

    const bytes=new TextEncoder().encode(JSON.stringify(clean));
    let out="";
    for(const b of bytes){
      out+=String.fromCharCode(CHAT_META_NIBBLE_BASE+(b>>4));
      out+=String.fromCharCode(CHAT_META_NIBBLE_BASE+(b&15));
    }
    return out;
  }catch(_e){
    return "";
  }
}

function decodeChatMetaV803(encoded){
  try{
    if(!encoded || encoded.length%2)return {};
    const bytes=[];
    for(let i=0;i<encoded.length;i+=2){
      const hi=encoded.charCodeAt(i)-CHAT_META_NIBBLE_BASE;
      const lo=encoded.charCodeAt(i+1)-CHAT_META_NIBBLE_BASE;
      if(hi<0||hi>15||lo<0||lo>15)return {};
      bytes.push((hi<<4)|lo);
    }
    const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
    return meta && typeof meta==="object" ? meta : {};
  }catch(_e){
    return {};
  }
}

function chatAuthorPartsV803(raw){
  const value=String(raw||"");
  const i=value.indexOf(CHAT_META_SEP);
  if(i<0)return {nick:value,meta:{}};
  return {
    nick:value.slice(0,i),
    meta:decodeChatMetaV803(value.slice(i+CHAT_META_SEP.length))
  };
}

function buildChatAuthorNickV803(nick,meta={}){
  const visible=String(nick||"Гравець").trim()||"Гравець";
  const encoded=encodeChatMetaV803(meta);
  return encoded ? visible+CHAT_META_SEP+encoded : visible;
}

function chatMetaV803(message){
  const legacy=chatAuthorPartsV803(message?.author_nick).meta||{};
  const liveReactions=message?.id ? chatReactionsV808.get(message.id) : null;
  const pinned=typeof message?.is_pinned==="boolean" ? message.is_pinned : !!legacy.pinned;
  return {
    ...legacy,
    pinned,
    reactions:liveReactions || legacy.reactions || {}
  };
}

function chatVisibleAuthorV803(message){
  return chatAuthorPartsV803(message?.author_nick).nick||"Гравець";
}

function chatRoleLabelV803(profile){
  if(profile?.role==="admin")return "ADMIN";
  if(profile?.role==="editor")return "CAPTAIN";
  return "PLAYER";
}

function chatRoleClassV803(profile){
  if(profile?.role==="admin")return "admin";
  if(profile?.role==="editor")return "captain";
  return "player";
}

function parseChatStoredTextV803(raw){
  const text=String(raw||"");
  if(text.startsWith("↪ ")){
    const split=text.indexOf("\\n\\n");
    if(split>2){
      return {
        replyLine:text.slice(2,split).trim(),
        body:text.slice(split+2)
      };
    }
  }
  return {replyLine:"",body:text};
}

function buildChatStoredTextV803(body,replyLine=""){
  const cleanBody=String(body||"").trim();
  const cleanReply=String(replyLine||"").trim();
  return cleanReply ? `↪ ${cleanReply}\\n\\n${cleanBody}` : cleanBody;
}

function chatMessagePreviewV803(message,max=92){
  if(!message)return "Повідомлення";
  const parsed=parseChatStoredTextV803(message.text);
  let text=(parsed.body||"").replace(/\\s+/g," ").trim();
  if(!text){
    if(message.media_type==="audio")text="🎙 Голосове повідомлення";
    else if(message.media_type==="gif")text="GIF";
    else if(message.media_url)text="📷 Фото";
    else text="Повідомлення";
  }
  return text.length>max ? text.slice(0,max-1)+"…" : text;
}

function chatLastSeenKeyV803(){
  return `ca_chat_last_seen_v803_${authUser?.id||"guest"}`;
}

function getChatLastSeenV803(){
  try{return Number(localStorage.getItem(chatLastSeenKeyV803())||0)||0}
  catch(_e){return 0}
}

function markChatSeenV803(){
  if(!authUser || !chatMessages.length)return;
  const last=chatMessages[chatMessages.length-1];
  const ts=Math.max(Date.now(),new Date(last.created_at).getTime()||0);
  try{localStorage.setItem(chatLastSeenKeyV803(),String(ts))}catch(_e){}
  updateChatUnreadBadgeV803();
}

function ensureChatNavBadgeV803(){
  const btn=document.querySelector('.bottom-nav button[data-nav="chat"]');
  if(!btn)return null;
  let badge=btn.querySelector(".chat-nav-unread-v803");
  if(!badge){
    badge=document.createElement("span");
    badge.className="chat-nav-unread-v803 hidden";
    btn.appendChild(badge);
  }
  return badge;
}

function updateChatUnreadBadgeV803(){
  const badge=ensureChatNavBadgeV803();
  if(!badge)return;

  const seen=getChatLastSeenV803();
  const active=$("screen-chat")?.classList.contains("active") &&
    !$("chatTabPane")?.classList.contains("hidden");

  const unread=chatMessages.filter(m=>
    m.user_id!==authUser?.id &&
    (new Date(m.created_at).getTime()||0)>seen
  ).length;

  if(active && unread){
    /* Current active chat is considered read, but leave the "НОВІ"
       divider already rendered in this frame. */
    markChatSeenV803();
    return;
  }

  badge.textContent="";
  badge.setAttribute("aria-label",unread>0?`Непрочитаних повідомлень: ${unread}`:"");
  badge.classList.toggle("hidden",unread<1);
}


function chatMentionTokenV817(name){
  return String(name||"")
    .trim()
    .replace(/\s+/g,"_")
    .replace(/[^\p{L}\p{N}_.-]/gu,"");
}

function chatEscapeRegExpV817(value){
  return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function chatMentionedProfilesV817(body){
  const text=String(body||"");
  const out=[];
  teamProfiles.forEach(profile=>{
    if(!profile?.user_id || profile.user_id===authUser?.id)return;
    const token=chatMentionTokenV817(profile.display_name||"");
    if(!token)return;
    const re=new RegExp(`(^|\\s)@${chatEscapeRegExpV817(token)}(?=$|[\\s,.;:!?])`,"iu");
    if(re.test(text))out.push(profile);
  });
  return out;
}

function renderChatTextV817(text){
  const myToken=chatMentionTokenV817(authProfile?.display_name||"").toLocaleLowerCase("uk-UA");
  return esc(String(text||""))
    .replace(/(@[\p{L}\p{N}_.-]+)/gu,token=>{
      const raw=token.slice(1).toLocaleLowerCase("uk-UA");
      return `<span class="chat-mention-token ${raw===myToken?"me":""}">${token}</span>`;
    })
    .replace(/\n/g,"<br>");
}

function ensureChatMentionNavBadgeV817(){
  const btn=document.querySelector('.bottom-nav button[data-nav="chat"]');
  if(!btn)return null;
  let badge=btn.querySelector('.chat-nav-mention-v817');
  if(!badge){
    badge=document.createElement('span');
    badge.className='chat-nav-mention-v817 hidden';
    badge.textContent='@';
    btn.appendChild(badge);
  }
  return badge;
}

function updateChatMentionBadgeV817(){
  const badge=ensureChatMentionNavBadgeV817();
  if(!badge)return;
  const active=$("screen-chat")?.classList.contains("active") && !$("chatTabPane")?.classList.contains("hidden");
  const unread=[...chatMentionsMineV817.values()].filter(x=>!x?.read_at).length;
  badge.classList.toggle('hidden',active || unread<1);
  badge.setAttribute('aria-label',unread?`Непрочитаних згадок: ${unread}`:'');
}

function renderChatReadReceiptV817(message){
  if(message?.user_id!==authUser?.id)return '';
  const readers=[...(chatReadsV817.get(message.id)||new Set())].filter(id=>id!==authUser?.id);
  if(!readers.length)return `<span class="chat-read-receipt sent" title="Надіслано">✓</span>`;
  const names=readers.map(id=>teamProfiles.get(id)?.display_name).filter(Boolean);
  const title=names.length?`Прочитали: ${names.join(', ')}`:`Прочитано: ${readers.length}`;
  return `<span class="chat-read-receipt read" title="${esc(title)}">✓✓${readers.length>1?` <b>${readers.length}</b>`:''}</span>`;
}

async function markChatMessagesReadV817(){
  if(!sb || !authUser)return;
  const active=$("screen-chat")?.classList.contains("active") && !$("chatTabPane")?.classList.contains("hidden");
  if(!active)return;

  const unreadIds=chatMessages
    .filter(m=>m.user_id!==authUser.id && !(chatReadsV817.get(m.id)||new Set()).has(authUser.id))
    .map(m=>m.id);
  if(unreadIds.length){
    const rows=unreadIds.map(message_id=>({message_id,user_id:authUser.id,read_at:new Date().toISOString()}));
    const {error}=await sb.from('message_reads').upsert(rows,{onConflict:'message_id,user_id'});
    if(!error){
      unreadIds.forEach(id=>{
        if(!chatReadsV817.has(id))chatReadsV817.set(id,new Set());
        chatReadsV817.get(id).add(authUser.id);
      });
    }else console.warn('Chat read receipt update failed',error);
  }

  const unreadMentionIds=[...chatMentionsMineV817.entries()].filter(([,v])=>!v?.read_at).map(([id])=>id);
  if(unreadMentionIds.length){
    const now=new Date().toISOString();
    const {error}=await sb.from('message_mentions')
      .update({read_at:now})
      .eq('user_id',authUser.id)
      .in('message_id',unreadMentionIds);
    if(!error){
      unreadMentionIds.forEach(id=>{
        const prev=chatMentionsMineV817.get(id)||{};
        chatMentionsMineV817.set(id,{...prev,read_at:now});
      });
    }else console.warn('Mention read update failed',error);
  }
  updateChatMentionBadgeV817();
}

async function syncMessageMentionsV817(messageId,body){
  if(!sb || !authUser || !messageId)return;
  const {error:deleteError}=await sb.from('message_mentions')
    .delete()
    .eq('message_id',messageId)
    .eq('mentioned_by',authUser.id);
  if(deleteError){
    console.warn('Mention cleanup failed',deleteError);
    return;
  }
  const profiles=chatMentionedProfilesV817(body);
  if(!profiles.length)return;
  const rows=profiles.map(p=>({message_id:messageId,user_id:p.user_id,mentioned_by:authUser.id}));
  const {error}=await sb.from('message_mentions').insert(rows);
  if(error)console.warn('Mention insert failed',error);
}

function closeChatMentionMenuV817(){
  if(chatMentionMenuElV817){
    chatMentionMenuElV817.classList.add('hidden');
    chatMentionMenuElV817.innerHTML='';
  }
}

function updateChatMentionMenuV817(){
  const input=$("chatInput");
  const menu=$("chatMentionMenu");
  chatMentionMenuElV817=menu||null;
  if(!input||!menu){return}
  const caret=input.selectionStart??input.value.length;
  const before=input.value.slice(0,caret);
  const match=before.match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
  if(!match){closeChatMentionMenuV817();return}
  const q=(match[1]||'').toLocaleLowerCase('uk-UA');
  const profiles=[...teamProfiles.values()]
    .filter(p=>p?.user_id && p.user_id!==authUser?.id && (p.access_status==='approved'||p.role==='admin'))
    .filter(p=>{
      const token=chatMentionTokenV817(p.display_name||'').toLocaleLowerCase('uk-UA');
      return !q || token.includes(q);
    })
    .slice(0,6);
  if(!profiles.length){closeChatMentionMenuV817();return}
  menu.innerHTML=profiles.map(p=>`<button type="button" data-mention-user="${p.user_id}" data-viewer-allowed="true">${profileAvatarHtml(p,'chat-mention-avatar')}<span><b>${esc(p.display_name||'Гравець')}</b><small>@${esc(chatMentionTokenV817(p.display_name||''))}</small></span></button>`).join('');
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-mention-user]').forEach(btn=>btn.addEventListener('pointerdown',e=>{
    e.preventDefault();
    const p=teamProfiles.get(btn.dataset.mentionUser);
    if(!p)return;
    const token='@'+chatMentionTokenV817(p.display_name||'');
    const start=before.lastIndexOf('@');
    input.value=input.value.slice(0,start)+token+' '+input.value.slice(caret);
    const pos=start+token.length+1;
    input.setSelectionRange(pos,pos);
    closeChatMentionMenuV817();
    input.focus();
    scheduleChatTypingV803();
  }));
}

function getUnreadBoundaryIdV803(messages){
  const seen=getChatLastSeenV803();
  const found=messages.find(m=>
    m.user_id!==authUser?.id &&
    (new Date(m.created_at).getTime()||0)>seen
  );
  return found?.id||null;
}

async function loadChatMessages(forceScroll=false){
  if(!sb || !authUser)return;

  const {data,error}=await sb.from("messages")
    .select("id,user_id,text,media_url,media_type,created_at,author_nick,is_pinned,pinned_at,pinned_by")
    .order("created_at",{ascending:false})
    .limit(100);

  if(error){
    console.error("Chat load error",error);
    const box=$("chatMessages");
    if(box)box.innerHTML=`<div class="chat-empty">Не вдалося завантажити чат.</div>`;
    return;
  }

  const next=(data||[]).reverse();
  const ids=next.map(m=>m.id);
  chatReactionsV808=new Map();
  chatReadsV817=new Map();
  chatMentionsMineV817=new Map();
  let reactionSignature="";
  let readSignature="";
  let mentionSignature="";

  if(ids.length){
    const {data:reactionRows,error:reactionError}=await sb.from("message_reactions")
      .select("message_id,user_id,emoji,created_at")
      .in("message_id",ids);

    if(reactionError){
      console.error("Chat reactions load error",reactionError);
    }else{
      const sorted=[...(reactionRows||[])].sort((a,b)=>
        String(a.message_id).localeCompare(String(b.message_id)) ||
        String(a.emoji).localeCompare(String(b.emoji)) ||
        String(a.user_id).localeCompare(String(b.user_id))
      );
      reactionSignature=sorted.map(r=>`${r.message_id}:${r.emoji}:${r.user_id}`).join("|");
      for(const row of sorted){
        if(!CHAT_REACTION_EMOJIS.includes(row.emoji))continue;
        if(!chatReactionsV808.has(row.message_id))chatReactionsV808.set(row.message_id,{});
        const grouped=chatReactionsV808.get(row.message_id);
        if(!Array.isArray(grouped[row.emoji]))grouped[row.emoji]=[];
        if(!grouped[row.emoji].includes(row.user_id))grouped[row.emoji].push(row.user_id);
      }
    }
  }

  if(ids.length){
    const [{data:readRows,error:readError},{data:mentionRows,error:mentionError}]=await Promise.all([
      sb.from("message_reads").select("message_id,user_id,read_at").in("message_id",ids),
      sb.from("message_mentions").select("message_id,user_id,mentioned_by,created_at,read_at").eq("user_id",authUser.id).in("message_id",ids)
    ]);
    if(readError)console.warn("Chat reads load error",readError);
    else{
      const sorted=[...(readRows||[])].sort((a,b)=>String(a.message_id).localeCompare(String(b.message_id))||String(a.user_id).localeCompare(String(b.user_id)));
      readSignature=sorted.map(r=>`${r.message_id}:${r.user_id}:${r.read_at||""}`).join("|");
      sorted.forEach(r=>{
        if(!chatReadsV817.has(r.message_id))chatReadsV817.set(r.message_id,new Set());
        chatReadsV817.get(r.message_id).add(r.user_id);
      });
    }
    if(mentionError)console.warn("Chat mentions load error",mentionError);
    else{
      const sorted=[...(mentionRows||[])].sort((a,b)=>String(a.message_id).localeCompare(String(b.message_id)));
      mentionSignature=sorted.map(r=>`${r.message_id}:${r.read_at||""}`).join("|");
      sorted.forEach(r=>chatMentionsMineV817.set(r.message_id,r));
    }
  }

  const signature=next.map(m=>[
    m.id,m.text||"",m.author_nick||"",m.media_url||"",m.is_pinned?"1":"0"
  ].join("~")).join("|")+"#"+reactionSignature+"#"+readSignature+"#"+mentionSignature;

  const changed=signature!==chatLastSignature;
  if(changed){
    chatUnreadBoundaryId=getUnreadBoundaryIdV803(next);
  }

  chatMessages=next;
  chatLastSignature=signature;

  if(changed || forceScroll){
    await loadTeamProfiles();
    renderChatMessages(forceScroll);
  }else{
    updateChatUnreadBadgeV803();
    updateChatMentionBadgeV817();
  }

  if($("screen-chat")?.classList.contains("active") && !$("chatTabPane")?.classList.contains("hidden")){
    markChatMessagesReadV817();
  }else{
    updateChatMentionBadgeV817();
  }
}

function renderChatReactionsV803(message){
  const reactions=chatMetaV803(message).reactions||{};
  const parts=[];

  CHAT_REACTION_EMOJIS.forEach(emoji=>{
    const users=Array.isArray(reactions[emoji])?reactions[emoji]:[];
    if(!users.length)return;
    const mine=users.includes(authUser?.id);
    parts.push(`
      <button type="button"
        class="chat-reaction-chip ${mine?"mine":""}"
        data-chat-react="${message.id}"
        data-chat-emoji="${emoji}"
        data-viewer-allowed="true">
        <span>${emoji}</span><b>${users.length}</b>
      </button>
    `);
  });

  return parts.length
    ? `<div class="chat-reactions">${parts.join("")}</div>`
    : "";
}

function renderVoicePlayerV803(url){
  return `<div class="chat-voice-player" data-voice-player>
    <button type="button" class="chat-voice-play" data-voice-play aria-label="Відтворити" data-viewer-allowed="true">▶</button>
    <input type="range" class="chat-voice-progress" data-voice-progress min="0" max="1000" value="0" aria-label="Прогрес голосового">
    <span class="chat-voice-time" data-voice-time>0:00</span>
    <audio data-voice-audio preload="metadata" playsinline src="${url}"></audio>
  </div>`;
}

function renderPinnedMessageV803(){
  const banner=$("chatPinnedBanner");
  const text=$("chatPinnedText");
  if(!banner||!text)return;

  const pinned=[...chatMessages].reverse().find(m=>chatMetaV803(m).pinned);
  if(!pinned){
    banner.classList.add("hidden");
    banner.dataset.messageId="";
    return;
  }

  const profile=teamProfiles.get(pinned.user_id);
  const nick=profile?.display_name||chatVisibleAuthorV803(pinned);
  text.textContent=`${nick}: ${chatMessagePreviewV803(pinned,72)}`;
  banner.dataset.messageId=pinned.id;
  banner.classList.remove("hidden");
}

function initChatVoicePlayersV803(){
  document.querySelectorAll("[data-voice-player]").forEach(player=>{
    if(player.dataset.bound==="1")return;
    player.dataset.bound="1";

    const audio=player.querySelector("[data-voice-audio]");
    const play=player.querySelector("[data-voice-play]");
    const range=player.querySelector("[data-voice-progress]");
    const time=player.querySelector("[data-voice-time]");
    if(!audio||!play||!range||!time)return;

    const fmt=seconds=>{
      const s=Math.max(0,Math.floor(Number(seconds)||0));
      return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
    };

    const sync=()=>{
      const duration=Number.isFinite(audio.duration)?audio.duration:0;
      const current=Number.isFinite(audio.currentTime)?audio.currentTime:0;
      range.value=duration ? String(Math.round((current/duration)*1000)) : "0";
      time.textContent=audio.paused
        ? (current>0?`${fmt(current)} / ${fmt(duration)}`:fmt(duration))
        : `${fmt(current)} / ${fmt(duration)}`;
      play.textContent=audio.paused?"▶":"❚❚";
    };

    audio.addEventListener("loadedmetadata",sync);
    audio.addEventListener("timeupdate",sync);
    audio.addEventListener("play",()=>{
      document.querySelectorAll("[data-voice-audio]").forEach(other=>{
        if(other!==audio)other.pause();
      });
      sync();
    });
    audio.addEventListener("pause",sync);
    audio.addEventListener("ended",()=>{audio.currentTime=0;sync()});

    play.addEventListener("click",()=>{
      if(audio.paused)audio.play().catch(()=>showToast("Не вдалося відтворити голосове"));
      else audio.pause();
    });

    range.addEventListener("input",()=>{
      if(Number.isFinite(audio.duration) && audio.duration>0){
        audio.currentTime=(Number(range.value)/1000)*audio.duration;
      }
    });

    sync();
  });
}

function bindChatMessageGesturesV803(){
  const box=$("chatMessages");
  if(!box)return;

  box.querySelectorAll(".chat-message").forEach(row=>{
    let startX=0,startY=0,longTimer=null,longOpened=false,pointerActive=false;

    row.addEventListener("pointerdown",e=>{
      /* Interactive controls keep their own tap behavior and must not trigger reply. */
      if(e.target.closest("button,input,audio,img,a,.chat-reactions-v803,.voice-player-v803")){
        pointerActive=false;
        return;
      }
      pointerActive=true;
      startX=e.clientX;
      startY=e.clientY;
      longOpened=false;
      clearTimeout(longTimer);
      longTimer=setTimeout(()=>{
        if(!pointerActive)return;
        longOpened=true;
        const id=row.dataset.messageId;
        const anchor=row.querySelector(".chat-more-btn")||row;
        openChatMessageMenuV803(id,anchor);
      },520);
    });

    const finish=e=>{
      clearTimeout(longTimer);
      if(!pointerActive){
        pointerActive=false;
        return;
      }
      pointerActive=false;
      if(longOpened)return;

      const dx=e.clientX-startX;
      const dy=e.clientY-startY;
      const absX=Math.abs(dx);
      const absY=Math.abs(dy);

      /* Keep the existing swipe-to-reply shortcut. */
      if(absX>58 && absX>absY*1.35){
        startChatReplyV803(row.dataset.messageId);
        return;
      }

      /* v8.09: one normal tap on the message immediately starts a reply. */
      if(absX<14 && absY<14){
        startChatReplyV803(row.dataset.messageId);
      }
    };

    row.addEventListener("pointerup",finish);
    row.addEventListener("pointercancel",()=>{
      pointerActive=false;
      clearTimeout(longTimer);
    });
  });
}

function renderChatMessages(forceScroll=false){
  const box=$("chatMessages");
  if(!box)return;

  const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;

  if(!chatMessages.length){
    box.innerHTML=`<div class="chat-empty">Поки що повідомлень немає.<br>Напиши першим.</div>`;
    renderPinnedMessageV803();
    updateChatUnreadBadgeV803();
    return;
  }

  box.innerHTML=chatMessages.map(m=>{
    const authorParts=chatAuthorPartsV803(m.author_nick);
    const profile=teamProfiles.get(m.user_id)||{
      display_name:authorParts.nick||"Гравець",
      avatar_url:null,
      role:"viewer"
    };

    const own=authUser?.id===m.user_id;
    const canEdit=own;
    const canDelete=own || authRole==="admin";
    const canPin=authRole==="admin" || authRole==="editor";
    const meta=authorParts.meta||{};
    const mentionedMe=chatMentionsMineV817.has(m.id);

    const dt=new Date(m.created_at);
    const time=dt.toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
    const day=dt.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"});
    const parsed=parseChatStoredTextV803(m.text);

    let media="";
    if(m.media_url){
      if(m.media_type==="audio"){
        media=renderVoicePlayerV803(m.media_url);
      }else{
        media=`<img class="chat-media ${m.media_type==="gif"?"is-gif":""}" src="${m.media_url}" alt="Вкладення">`;
      }
    }

    const reply=parsed.replyLine
      ? `<div class="chat-reply-preview"><span>↩</span><b>${esc(parsed.replyLine)}</b></div>`
      : "";

    const divider=m.id===chatUnreadBoundaryId
      ? `<div class="chat-new-divider"><span>НОВІ ПОВІДОМЛЕННЯ</span></div>`
      : "";

    return `${divider}<div class="chat-message ${own?"own":""} ${mentionedMe?"mentioned-me":""}" data-message-id="${m.id}">
      ${profileAvatarHtml(profile)}
      <div class="chat-message-main">
        <div class="chat-message-meta">
          <div class="chat-author-line">
            <strong>${esc(profile.display_name||"Гравець")}</strong>
            <span class="chat-role-pill ${chatRoleClassV803(profile)}">${chatRoleLabelV803(profile)}</span>
          </div>
          <span class="chat-time">${day} · ${time}${meta.pinned?" · 📌":""}</span>
          ${mentionedMe?`<span class="chat-mentioned-me-badge">@ ТЕБЕ</span>`:""}
          ${renderChatReadReceiptV817(m)}
          <button class="chat-more-btn" type="button" data-chat-more="${m.id}" aria-label="Дії" data-viewer-allowed="true">•••</button>
        </div>
        <div class="chat-bubble">
          ${reply}
          ${parsed.body?`<div class="chat-text">${renderChatTextV817(parsed.body)}</div>`:""}
          ${media}
        </div>
        ${renderChatReactionsV803(m)}
      </div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-chat-more]").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      openChatMessageMenuV803(btn.dataset.chatMore,btn);
    });
  });

  box.querySelectorAll("[data-chat-react]").forEach(btn=>{
    btn.addEventListener("click",()=>toggleChatReactionV803(
      btn.dataset.chatReact,
      btn.dataset.chatEmoji
    ));
  });

  initChatVoicePlayersV803();
  bindChatMessageGesturesV803();
  renderPinnedMessageV803();
  updateChatUnreadBadgeV803();
  updateChatMentionBadgeV817();

  if(forceScroll || nearBottom){
    requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight});
  }
}

function closeChatMessageMenuV803(){
  if(chatMessageMenuEl){
    chatMessageMenuEl.remove();
    chatMessageMenuEl=null;
  }
}

function openChatMessageMenuV803(id,anchor){
  closeChatMessageMenuV803();

  const msg=chatMessages.find(m=>m.id===id);
  if(!msg)return;

  const own=msg.user_id===authUser?.id;
  const canDelete=own || authRole==="admin";
  const canEdit=own;
  const canPin=authRole==="admin"||authRole==="editor";
  const pinned=!!chatMetaV803(msg).pinned;

  const menu=document.createElement("div");
  menu.className="chat-message-menu-v803";
  menu.innerHTML=`
    <div class="chat-message-menu-actions">
      <button type="button" data-action="reply">↩ ВІДПОВІСТИ</button>
      ${canEdit?`<button type="button" data-action="edit">✎ РЕДАГУВАТИ</button>`:""}
      ${canPin?`<button type="button" data-action="pin">📌 ${pinned?"ВІДКРІПИТИ":"ЗАКРІПИТИ"}</button>`:""}
      ${canDelete?`<button type="button" class="danger" data-action="delete">🗑 ВИДАЛИТИ</button>`:""}
    </div>
    <div class="chat-message-menu-reactions">
      ${CHAT_REACTION_EMOJIS.map(e=>`<button type="button" data-reaction="${e}">${e}</button>`).join("")}
    </div>
  `;

  document.body.appendChild(menu);
  chatMessageMenuEl=menu;

  const r=anchor.getBoundingClientRect();
  const mw=Math.min(330,window.innerWidth-20);
  menu.style.width=mw+"px";

  requestAnimationFrame(()=>{
    const mr=menu.getBoundingClientRect();
    let left=Math.max(10,Math.min(window.innerWidth-mr.width-10,r.left+r.width-mr.width));
    let top=r.bottom+6;
    if(top+mr.height>window.innerHeight-10)top=Math.max(10,r.top-mr.height-6);
    menu.style.left=left+"px";
    menu.style.top=top+"px";
  });

  const closeOnOutside=e=>{
    if(!menu.contains(e.target)){
      closeChatMessageMenuV803();
      document.removeEventListener("pointerdown",closeOnOutside,true);
    }
  };
  setTimeout(()=>document.addEventListener("pointerdown",closeOnOutside,true),0);

  menu.querySelector('[data-action="reply"]')?.addEventListener("click",()=>{
    closeChatMessageMenuV803();
    startChatReplyV803(id);
  });

  menu.querySelector('[data-action="edit"]')?.addEventListener("click",()=>{
    closeChatMessageMenuV803();
    startChatEditV803(id);
  });

  menu.querySelector('[data-action="pin"]')?.addEventListener("click",async()=>{
    closeChatMessageMenuV803();
    await toggleChatPinV803(id);
  });

  menu.querySelector('[data-action="delete"]')?.addEventListener("click",()=>{
    closeChatMessageMenuV803();
    deleteChatMessage(id);
  });

  menu.querySelectorAll("[data-reaction]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const emoji=btn.dataset.reaction;
      closeChatMessageMenuV803();
      await toggleChatReactionV803(id,emoji);
    });
  });
}

function renderChatComposerContextV803(){
  const bar=$("chatComposerContext");
  if(!bar)return;

  if(chatEditingMessageId){
    const msg=chatMessages.find(m=>m.id===chatEditingMessageId);
    $("chatComposerContextTitle").textContent="РЕДАГУВАННЯ";
    $("chatComposerContextText").textContent=chatMessagePreviewV803(msg,95);
    bar.classList.remove("hidden");
    return;
  }

  if(chatReplyTarget){
    $("chatComposerContextTitle").textContent=`ВІДПОВІДЬ · ${chatReplyTarget.nick}`;
    $("chatComposerContextText").textContent=chatReplyTarget.preview;
    bar.classList.remove("hidden");
    return;
  }

  bar.classList.add("hidden");
}

function clearChatComposerContextV803(){
  chatReplyTarget=null;
  chatEditingMessageId=null;
  chatEditingReplyLine="";
  renderChatComposerContextV803();
}

function startChatReplyV803(id){
  const msg=chatMessages.find(m=>m.id===id);
  if(!msg)return;

  const profile=teamProfiles.get(msg.user_id);
  const nick=profile?.display_name||chatVisibleAuthorV803(msg);
  chatEditingMessageId=null;
  chatEditingReplyLine="";
  chatReplyTarget={
    id,
    nick,
    preview:chatMessagePreviewV803(msg,100)
  };

  renderChatComposerContextV803();
  $("chatInput")?.focus();
}

function startChatEditV803(id){
  const msg=chatMessages.find(m=>m.id===id);
  if(!msg || msg.user_id!==authUser?.id)return;

  const parsed=parseChatStoredTextV803(msg.text);
  chatReplyTarget=null;
  chatEditingMessageId=id;
  chatEditingReplyLine=parsed.replyLine||"";
  if($("chatInput"))$("chatInput").value=parsed.body||"";

  renderChatComposerContextV803();
  $("chatInput")?.focus();
}

async function updateChatMessageAuthorMetaV803(message,meta){
  const visible=chatVisibleAuthorV803(message);
  const author_nick=buildChatAuthorNickV803(visible,meta);
  const {error}=await sb.from("messages")
    .update({author_nick})
    .eq("id",message.id);

  if(error){
    console.error("Chat meta update failed",error);
    showToast("Не вдалося оновити повідомлення");
    return false;
  }
  return true;
}

async function toggleChatReactionV803(id,emoji){
  if(!sb||!authUser||!CHAT_REACTION_EMOJIS.includes(emoji))return;
  const msg=chatMessages.find(m=>m.id===id);
  if(!msg)return;

  const reactions=chatMetaV803(msg).reactions||{};
  const alreadyMine=Array.isArray(reactions[emoji]) && reactions[emoji].includes(authUser.id);

  /* One reaction per user/message: tapping the same emoji removes it;
     tapping a different emoji replaces the previous reaction. */
  const {error:deleteError}=await sb.from("message_reactions")
    .delete()
    .eq("message_id",id)
    .eq("user_id",authUser.id);

  if(deleteError){
    console.error("Chat reaction delete failed",deleteError);
    showToast("Не вдалося змінити реакцію");
    return;
  }

  if(!alreadyMine){
    const {error:insertError}=await sb.from("message_reactions")
      .insert({message_id:id,user_id:authUser.id,emoji});
    if(insertError){
      console.error("Chat reaction insert failed",insertError);
      showToast("Не вдалося додати реакцію");
      return;
    }
  }

  await loadChatMessages();
}

async function toggleChatPinV803(id){
  if(!sb||!authUser||!(authRole==="admin"||authRole==="editor"))return;

  const target=chatMessages.find(m=>m.id===id);
  if(!target)return;

  const {error}=await sb.rpc("toggle_message_pin",{p_message_id:id});
  if(error){
    console.error("Chat pin failed",error);
    showToast("Не вдалося закріпити повідомлення");
    return;
  }

  await loadChatMessages(true);
}

async function deleteChatMessage(id){
  if(!sb || !authUser)return;
  const msg=chatMessages.find(m=>m.id===id);
  if(!msg)return;
  if(msg.user_id!==authUser.id && authRole!=="admin")return;
  if(!confirm("Видалити це повідомлення?"))return;

  const {error}=await sb.from("messages").delete().eq("id",id);
  if(error){
    showToast("Не вдалося видалити повідомлення");
    return;
  }

  if(chatEditingMessageId===id || chatReplyTarget?.id===id){
    clearChatComposerContextV803();
  }

  await loadChatMessages();
}

async function prepareChatMedia(file){
  if(!file)return null;
  const isGif=file.type==="image/gif";

  if(isGif){
    if(file.size>1.2*1024*1024){
      throw new Error("GIF має бути не більше 1.2 МБ");
    }
    const url=await readFileDataUrl(file);
    return {url,type:"gif",name:file.name};
  }

  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    throw new Error("Підтримуються JPG, PNG, WEBP або GIF");
  }

  const url=await resizeChatImage(file,1000,0.78);
  if(url.length>1.5*1024*1024){
    throw new Error("Фото вийшло завеликим. Обери менше зображення");
  }
  return {url,type:"image",name:file.name};
}

function readFileDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function resizeChatImage(file,maxSide=1000,quality=.78){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.naturalWidth,h=img.naturalHeight;
        const scale=Math.min(1,maxSide/Math.max(w,h));
        w=Math.max(1,Math.round(w*scale));
        h=Math.max(1,Math.round(h*scale));
        const canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL("image/webp",quality));
      };
      img.onerror=()=>reject(new Error("Не вдалося прочитати фото"));
      img.src=reader.result;
    };
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview(){
  const box=$("chatAttachmentPreview");
  if(!box)return;
  if(!chatAttachment){
    box.classList.add("hidden");
    box.innerHTML="";
    return;
  }
  box.innerHTML=`<div class="attachment-card ${chatAttachment.type==="audio"?"audio-attachment":""}">
    ${chatAttachment.type==="audio"
      ? `<span class="attachment-audio-icon">🎙</span><audio controls playsinline preload="metadata" src="${chatAttachment.url}"></audio>`
      : `<img src="${chatAttachment.url}" alt="">`}
    <span>${esc(chatAttachment.name||"Вкладення")}</span>
    <button id="removeChatAttachment" type="button" data-viewer-allowed="true">×</button>
  </div>`;
  box.classList.remove("hidden");
  $("removeChatAttachment")?.addEventListener("click",()=>{
    chatAttachment=null;
    $("chatMediaInput").value="";
    renderAttachmentPreview();
  });
}


function formatVoiceTime(seconds){
  const s=Math.max(0,Math.floor(seconds));
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

function updateVoiceRecordUi(){
  const btn=$("voiceRecordBtn");
  const hint=$("chatHint");
  if(!btn)return;

  const recording=voiceRecorder && voiceRecorder.state==="recording";
  btn.classList.toggle("recording",!!recording);
  btn.textContent=recording?"■":"🎙";
  btn.title=recording?"Зупинити запис":"Записати голосове";

  if(hint){
    hint.textContent=recording
      ? `● ЗАПИС ${formatVoiceTime(voiceSeconds)} · натисни ■ щоб зупинити`
      : "Фото до ~1 МБ · GIF до 1.2 МБ · голосові до 60 сек";
    hint.classList.toggle("recording",!!recording);
  }
}

function cleanupVoiceStream(){
  if(voiceTimer){
    clearInterval(voiceTimer);
    voiceTimer=null;
  }
  if(voiceStream){
    voiceStream.getTracks().forEach(track=>track.stop());
    voiceStream=null;
  }
}

function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function startVoiceRecording(){
  if(!authUser){
    openAuthModal();
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){
    showToast("Цей браузер не підтримує запис голосових");
    return;
  }
  if(chatAttachment){
    showToast("Спочатку видали поточне вкладення");
    return;
  }

  try{
    voiceStream=await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true,
        channelCount:1
      }
    });
    voiceChunks=[];

    let options={};
    const isiPhone=/iPhone|iPod/.test(navigator.userAgent);

    // Safari/iPhone handles MP4 voice recordings more reliably than WebM.
    const preferredTypes=isiPhone
      ? ["audio/mp4","audio/mp4;codecs=mp4a.40.2","audio/webm;codecs=opus","audio/webm"]
      : ["audio/webm;codecs=opus","audio/webm","audio/mp4"];

    const supported=preferredTypes.find(type=>MediaRecorder.isTypeSupported?.(type));
    if(supported)options.mimeType=supported;
    options.audioBitsPerSecond=64000;

    voiceRecorder=new MediaRecorder(voiceStream,options);

    voiceRecorder.ondataavailable=e=>{
      if(e.data && e.data.size>0)voiceChunks.push(e.data);
    };

    voiceRecorder.onstop=async()=>{
      try{
        const mime=voiceRecorder?.mimeType || voiceChunks[0]?.type || "audio/webm";
        const blob=new Blob(voiceChunks,{type:mime});

        if(blob.size<800){
          showToast("Голосове не записалось. Спробуй ще раз і перевір доступ до мікрофона");
          return;
        }

        // Keep base64 payload within a reasonable size for chat messages.
        if(blob.size>1.4*1024*1024){
          showToast("Голосове завелике. Запиши коротше");
          return;
        }

        const url=await blobToDataUrl(blob);
        chatAttachment={
          url,
          type:"audio",
          name:`Голосове ${formatVoiceTime(voiceSeconds)}`
        };
        renderAttachmentPreview();
      }catch(err){
        console.error("Voice processing failed",err);
        showToast("Не вдалося обробити голосове");
      }finally{
        cleanupVoiceStream();
        voiceRecorder=null;
        voiceChunks=[];
        updateVoiceRecordUi();
      }
    };

    voiceRecorder.onerror=e=>{
      console.error("Voice recorder error",e);
      cleanupVoiceStream();
      voiceRecorder=null;
      voiceChunks=[];
      updateVoiceRecordUi();
      showToast("Помилка запису голосового");
    };

    voiceRecorder.start();
    voiceStartedAt=Date.now();
    voiceSeconds=0;
    updateVoiceRecordUi();

    voiceTimer=setInterval(()=>{
      voiceSeconds=Math.floor((Date.now()-voiceStartedAt)/1000);
      updateVoiceRecordUi();
      if(voiceSeconds>=60){
        stopVoiceRecording();
      }
    },500);

  }catch(err){
    console.error("Microphone permission error",err);
    cleanupVoiceStream();
    voiceRecorder=null;
    updateVoiceRecordUi();
    showToast("Дозволь Safari доступ до мікрофона для цього сайту");
  }
}

function stopVoiceRecording(){
  if(voiceRecorder && voiceRecorder.state==="recording"){
    voiceSeconds=Math.max(1,Math.floor((Date.now()-voiceStartedAt)/1000));
    voiceRecorder.stop();
  }
}

function toggleVoiceRecording(){
  if(voiceRecorder && voiceRecorder.state==="recording"){
    stopVoiceRecording();
  }else{
    startVoiceRecording();
  }
}

$("voiceRecordBtn")?.addEventListener("click",toggleVoiceRecording);


async function sendChatMessage(){
  if(voiceRecorder && voiceRecorder.state==="recording"){
    stopVoiceRecording();
    showToast("Голосове збережено — натисни відправити ще раз");
    return;
  }
  if(!sb || !authUser){
    openAuthModal();
    return;
  }

  const input=$("chatInput");
  const body=(input?.value||"").trim();

  /* Editing uses the existing media attachment of that message. */
  if(chatEditingMessageId){
    const msg=chatMessages.find(m=>m.id===chatEditingMessageId);
    if(!msg || msg.user_id!==authUser.id){
      clearChatComposerContextV803();
      return;
    }

    if(!body && !msg.media_url){
      showToast("Повідомлення не може бути порожнім");
      return;
    }

    const stored=buildChatStoredTextV803(body,chatEditingReplyLine);

    const btn=$("sendMessageBtn");
    if(btn)btn.disabled=true;
    const {error}=await sb.from("messages")
      .update({text:stored||null,edited_at:new Date().toISOString()})
      .eq("id",chatEditingMessageId);
    if(btn)btn.disabled=false;

    if(error){
      console.error("Chat edit failed",error);
      showToast("Не вдалося відредагувати повідомлення");
      return;
    }

    await syncMessageMentionsV817(chatEditingMessageId,body);
    if(input)input.value="";
    closeChatMentionMenuV817();
    clearChatComposerContextV803();
    await loadChatMessages();
    return;
  }

  if(!body && !chatAttachment)return;

  let replyLine="";
  if(chatReplyTarget){
    replyLine=`${chatReplyTarget.nick}: ${chatReplyTarget.preview}`;
  }
  const storedText=buildChatStoredTextV803(body,replyLine);

  const btn=$("sendMessageBtn");
  if(btn)btn.disabled=true;

  const visibleNick=authProfile?.display_name||
    authUser.email?.split("@")[0]||
    "Гравець";

  const payload={
    user_id:authUser.id,
    text:storedText||null,
    media_url:chatAttachment?.url||null,
    media_type:chatAttachment?.type||null,
    author_nick:buildChatAuthorNickV803(visibleNick,{})
  };

  const {data:inserted,error}=await sb.from("messages").insert(payload).select("id").single();
  if(btn)btn.disabled=false;

  if(error){
    console.error("Send error",error);
    showToast("Не вдалося відправити повідомлення");
    return;
  }

  if(inserted?.id)await syncMessageMentionsV817(inserted.id,body);

  const senderNick=visibleNick;
  let pushBody=body;
  if(!pushBody && chatAttachment?.type==="audio")pushBody="🎙 Голосове повідомлення";
  if(!pushBody && chatAttachment?.type==="gif")pushBody="GIF";
  if(!pushBody && chatAttachment?.type)pushBody="📷 Фото";

  /* Existing Edge Function already routes chat pushes to /?open=chat. */
  sendPushEvent("chat",`${senderNick} — Чат`,pushBody||"Нове повідомлення");

  if(input)input.value="";
  closeChatMentionMenuV817();
  chatAttachment=null;
  if($("chatMediaInput"))$("chatMediaInput").value="";
  renderAttachmentPreview();
  clearChatComposerContextV803();
  setChatTypingV803(false);
  await loadChatMessages(true);
}


async function syncChatPresenceTrackV803(typing=false){
  if(!chatPresenceChannel || !authUser || !authProfile)return;
  try{
    await chatPresenceChannel.track({
      user_id:authUser.id,
      nick:authProfile?.display_name||"Гравець",
      avatar:authProfile?.avatar_url||null,
      online_at:new Date().toISOString(),
      typing:!!typing,
      typing_at:typing?Date.now():null
    });
  }catch(_e){}
}

function setChatTypingV803(value){
  const typing=!!value;
  if(chatIsTyping===typing && typing)return;
  chatIsTyping=typing;
  syncChatPresenceTrackV803(typing);
}

function scheduleChatTypingV803(){
  if(!authUser || !$("screen-chat")?.classList.contains("active"))return;
  setChatTypingV803(true);
  clearTimeout(chatTypingTimer);
  chatTypingTimer=setTimeout(()=>setChatTypingV803(false),1400);
}

function renderChatTypingIndicatorV803(){
  const box=$("chatTypingIndicator");
  if(!box)return;

  if(!chatPresenceChannel){
    box.classList.add("hidden");
    return;
  }

  const now=Date.now();
  const names=[];
  const state=chatPresenceChannel.presenceState();

  Object.values(state).forEach(entries=>{
    (entries||[]).forEach(p=>{
      if(
        p?.user_id &&
        p.user_id!==authUser?.id &&
        p.typing===true &&
        (!p.typing_at || now-Number(p.typing_at)<5000)
      ){
        const name=p.nick||"Гравець";
        if(!names.includes(name))names.push(name);
      }
    });
  });

  if(!names.length){
    box.classList.add("hidden");
    box.textContent="";
    return;
  }

  box.textContent=names.length===1
    ? `${names[0]} друкує…`
    : `${names.slice(0,2).join(", ")} друкують…`;
  box.classList.remove("hidden");
}

function getOnlineUserIds(){
  const ids=new Set();
  if(!chatPresenceChannel)return ids;
  const state=chatPresenceChannel.presenceState();
  Object.values(state).forEach(entries=>{
    (entries||[]).forEach(p=>{
      if(p?.user_id)ids.add(p.user_id);
    });
  });
  return ids;
}

function renderMembersList(){
  const list=$("membersList");
  const badge=$("membersCountBadge");
  const summary=$("membersSummary");
  if(!list)return;

  const profiles=[...teamProfiles.values()]
    .filter(p=>p?.user_id && (p.access_status==="approved" || p.role==="admin"))
    .sort((a,b)=>(a.display_name||"").localeCompare(b.display_name||"","uk"));

  const onlineIds=getOnlineUserIds();

  if(badge)badge.textContent=String(profiles.length);
  if(summary)summary.textContent=`Зареєстровано: ${profiles.length} · Онлайн: ${onlineIds.size}`;

  if(!profiles.length){
    list.innerHTML=`<div class="members-empty">Ще немає зареєстрованих учасників.</div>`;
    return;
  }

  list.innerHTML=profiles.map(p=>{
    const online=onlineIds.has(p.user_id);
    const linked=!!(p.player_id && players.some(x=>x.id===p.player_id));
    return `<div class="member-row ${linked?"has-linked-player":""}" data-member-user="${p.user_id}" ${linked?`data-member-player="${p.player_id}"`:""}>
      ${profileAvatarHtml(p,"member-avatar")}
      <div class="member-main">
        ${linked
          ? `<button type="button" class="member-nick member-player-link" data-open-member-player="${p.player_id}" data-viewer-allowed="true">${esc(p.display_name||"Гравець")}</button>`
          : `<div class="member-nick">${esc(p.display_name||"Гравець")}</div>`}
        <div class="member-state ${online?"online":"offline"}">
          <span class="member-state-dot"></span>
          ${online?"ОНЛАЙН":"ОФЛАЙН"}${linked?' · ГРАВЕЦЬ КОМАНДИ ✓':""}
        </div>
      </div>
      ${p.role==="admin"?`<span class="member-role admin">ADMIN</span>`:p.role==="editor"?`<span class="member-role">EDITOR</span>`:""}
    </div>`;
  }).join("");

  list.querySelectorAll("[data-open-member-player]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const id=btn.dataset.openMemberPlayer;
      if(id && players.some(p=>p.id===id))openPlayerModal(id);
    });
  });
}

function setChatSection(section){
  const isMembers=section==="members";
  $("chatTabBtn")?.classList.toggle("active",!isMembers);
  $("membersTabBtn")?.classList.toggle("active",isMembers);
  $("chatTabPane")?.classList.toggle("hidden",isMembers);
  $("membersTabPane")?.classList.toggle("hidden",!isMembers);

  if(isMembers){
    renderMembersList();
  }else{
    requestAnimationFrame(()=>{
      const box=$("chatMessages");
      if(box)box.scrollTop=box.scrollHeight;
      if(authUser){markChatSeenV803();markChatMessagesReadV817();}
    });
  }
}

$("chatTabBtn")?.addEventListener("click",()=>setChatSection("chat"));
$("membersTabBtn")?.addEventListener("click",async()=>{
  await loadTeamProfiles();
  setChatSection("members");
});

function renderOnlinePresence(){
  const count=$("onlineCount");
  const list=$("onlinePeople");
  if(!chatPresenceChannel){
    if(count)count.textContent="ОНЛАЙН: 0";
    if(list)list.innerHTML="";
    if($("homeOnlineCount"))$("homeOnlineCount").textContent="0";
    if($("homeOnlineBadge"))$("homeOnlineBadge").classList.remove("has-online");
    return;
  }
  const state=chatPresenceChannel.presenceState();
  const people=[];
  Object.values(state).forEach(entries=>{
    (entries||[]).forEach(p=>{
      if(!people.some(x=>x.user_id===p.user_id))people.push(p);
    });
  });
  if(count)count.textContent=`ОНЛАЙН: ${people.length}`;
  const homeCount=$("homeOnlineCount");
  const homeBadge=$("homeOnlineBadge");
  if(homeCount)homeCount.textContent=String(people.length);
  if(homeBadge){
    homeBadge.classList.toggle("has-online",people.length>0);
    homeBadge.title=`Онлайн: ${people.length}`;
  }
  if(list){
    list.innerHTML=people.slice(0,12).map(p=>`
      <div class="online-person" title="${esc(p.nick||"Гравець")}">
        ${p.avatar?`<span class="online-avatar"><img src="${p.avatar}" alt=""></span>`:`<span class="online-avatar online-avatar-fallback">${esc(initials(p.nick))}</span>`}
        <span>${esc(p.nick||"Гравець")}</span>
      </div>`).join("");
  }
  renderMembersList();
  renderChatTypingIndicatorV803();
}

async function stopChatPresence(){
  if(chatPresenceChannel && sb){
    try{await chatPresenceChannel.untrack();}catch(e){}
    try{await sb.removeChannel(chatPresenceChannel);}catch(e){}
  }
  chatPresenceChannel=null;
  renderOnlinePresence();
}

async function startChatPresence(){
  if(!sb || !authUser || !authProfile)return;
  await stopChatPresence();
  chatPresenceChannel=sb.channel("centuria-chat-presence",{
    config:{presence:{key:authUser.id}}
  });

  chatPresenceChannel
    .on("presence",{event:"sync"},renderOnlinePresence)
    .on("presence",{event:"join"},renderOnlinePresence)
    .on("presence",{event:"leave"},renderOnlinePresence);

  chatPresenceChannel.subscribe(async status=>{
    if(status==="SUBSCRIBED"){
      await syncChatPresenceTrackV803(false);
      renderOnlinePresence();
    }
  });
}

async function refreshChatAuthState(){
  const gate=$("chatGate"),panel=$("chatPanel"),profileBtn=$("profileBtn");
  if(!gate || !panel)return;
  if(authUser){
    gate.classList.add("hidden");
    panel.classList.remove("hidden");
    if(profileBtn)profileBtn.classList.remove("hidden");
    await loadTeamProfiles();
    await startChatPresence();
    await loadChatMessages(true);
    if(!chatPollTimer){
      chatPollTimer=setInterval(()=>{
        if(authUser && $("screen-chat")?.classList.contains("active")){
          loadChatMessages();
        }
      },2500);
    }
  }else{
    gate.classList.remove("hidden");
    panel.classList.add("hidden");
    if(profileBtn)profileBtn.classList.add("hidden");
    await stopChatPresence();
    chatMessages=[];
    chatReadsV817=new Map();
    chatMentionsMineV817=new Map();
    chatLastSignature="";
    updateChatMentionBadgeV817();
  }
}


function warsawTodayInfo(){
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Warsaw",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    weekday:"short"
  }).formatToParts(new Date());

  const get=type=>parts.find(p=>p.type===type)?.value||"";
  return {
    date:`${get("year")}-${get("month")}-${get("day")}`,
    weekday:get("weekday")
  };
}

async function maybeWeeklyChatCleanup(){
  if(!sb || !authUser || authRole!=="admin")return false;

  const today=warsawTodayInfo();
  if(today.weekday!=="Sun")return false;

  const key="ca_chat_cleanup_"+today.date;
  if(localStorage.getItem(key)==="done")return false;

  try{
    const {error}=await sb.from("messages").delete().not("id","is",null);
    if(error)throw error;

    localStorage.setItem(key,"done");
    chatMessages=[];
    chatLastSignature="";
    renderChatMessages(true);
    showToast("Щотижневе очищення чату виконано");
    return true;
  }catch(err){
    console.error("Weekly chat cleanup failed",err);
    return false;
  }
}

async function openChatScreen(){
  setChatSection("chat");
  await refreshChatAuthState();
  if(authUser){
    await maybeWeeklyChatCleanup();
    await loadChatMessages(true);
    /* Keep the divider from the previous last-seen point on screen,
       but reset the nav badge after the user actually opens Chat. */
    markChatSeenV803();
  }
}

async function avatarFileToDataUrl(file){
  if(!file)return null;
  const allowed=["image/jpeg","image/png","image/webp","image/heic","image/heif"];
  if(file.type && !allowed.includes(file.type)){
    throw new Error("Оберіть фотографію JPG, PNG, WEBP або HEIC");
  }
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const size=180;
        const canvas=document.createElement("canvas");
        canvas.width=size;canvas.height=size;
        const ctx=canvas.getContext("2d");
        const side=Math.min(img.naturalWidth,img.naturalHeight);
        const sx=(img.naturalWidth-side)/2;
        const sy=(img.naturalHeight-side)/2;
        ctx.drawImage(img,sx,sy,side,side,0,0,size,size);
        resolve(canvas.toDataURL("image/webp",.78));
      };
      img.onerror=()=>reject(new Error("Не вдалося прочитати аватар"));
      img.src=reader.result;
    };
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(file);
  });
}

let pendingAvatarData=null;

function renderProfilePreview(){
  const box=$("profileAvatarPreview");
  if(!box)return;
  const url=pendingAvatarData||authProfile?.avatar_url;
  if(url){
    box.innerHTML=`<img src="${url}" alt="">`;
  }else{
    box.innerHTML=`<span>${esc(initials(authProfile?.display_name||authUser?.email))}</span>`;
  }
}

function openProfileModal(){
  if(!authUser){openAuthModal();return}
  pendingAvatarData=null;
  $("profileNickInput").value=authProfile?.display_name||"";
  if($("profileStatus"))$("profileStatus").textContent="";
  renderProfilePreview();
  $("profileModal")?.classList.remove("hidden");
  document.body.classList.add("auth-open");
}

function closeProfileModal(){
  $("profileModal")?.classList.add("hidden");
  document.body.classList.remove("auth-open");
  pendingAvatarData=null;
}

async function saveProfile(){
  if(!sb || !authUser)return;
  const nick=$("profileNickInput")?.value.trim();
  if(!nick || nick.length<2){
    $("profileStatus").textContent="Нік має містити мінімум 2 символи.";
    return;
  }
  $("profileStatus").textContent="Збереження…";
  const payload={display_name:nick};
  if(pendingAvatarData)payload.avatar_url=pendingAvatarData;
  const {data:updated,error}=await sb.from("profiles")
    .update(payload)
    .eq("user_id",authUser.id)
    .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at")
    .maybeSingle();
  if(error || !updated){
    console.error(error||new Error("Profile update returned no row"));
    $("profileStatus").textContent="Не вдалося зберегти профіль.";
    return;
  }
  // Paint the saved avatar immediately; refreshAuth then confirms the server state.
  authProfile=updated;
  renderProfilePreview();
  try{ if(typeof syncSettingsV659==="function") syncSettingsV659(); }catch(_e){}
  await refreshAuth();
  try{ if(typeof syncSettingsV659==="function") syncSettingsV659(); }catch(_e){}
  $("profileStatus").textContent="Профіль збережено.";
  setTimeout(closeProfileModal,350);
}

$("chatLoginBtn")?.addEventListener("click",openAuthModal);
$("profileBtn")?.addEventListener("click",openProfileModal);
$("closeProfileModal")?.addEventListener("click",closeProfileModal);
document.querySelectorAll("[data-close-profile]").forEach(el=>el.addEventListener("click",closeProfileModal));
$("chooseAvatarBtn")?.addEventListener("click",()=>$("profileAvatarInput")?.click());
$("profileAvatarInput")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    pendingAvatarData=await avatarFileToDataUrl(file);
    renderProfilePreview();
  }catch(err){
    showToast(err.message||"Не вдалося обробити аватар");
  }
});
$("saveProfileBtn")?.addEventListener("click",saveProfile);

$("chatMediaBtn")?.addEventListener("click",()=>$("chatMediaInput")?.click());
$("chatMediaInput")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    chatAttachment=await prepareChatMedia(file);
    renderAttachmentPreview();
  }catch(err){
    e.target.value="";
    showToast(err.message||"Не вдалося додати файл");
  }
});
$("sendMessageBtn")?.addEventListener("click",sendChatMessage);

$("chatInput")?.addEventListener("input",()=>{
  scheduleChatTypingV803();
  updateChatMentionMenuV817();
  const input=$("chatInput");
  if(input){
    input.style.height="auto";
    input.style.height=Math.min(120,input.scrollHeight)+"px";
  }
});

$("chatInput")?.addEventListener("keydown",e=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    sendChatMessage();
  }
});

$("chatInput")?.addEventListener("blur",()=>{
  clearTimeout(chatTypingTimer);
  setChatTypingV803(false);
  setTimeout(closeChatMentionMenuV817,120);
});

$("chatComposerContextClose")?.addEventListener("click",()=>{
  clearChatComposerContextV803();
  if($("chatInput"))$("chatInput").value="";
});

$("chatPinnedBanner")?.addEventListener("click",()=>{
  const id=$("chatPinnedBanner")?.dataset.messageId;
  if(!id)return;
  const row=$("chatMessages")?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  if(row){
    row.scrollIntoView({behavior:"smooth",block:"center"});
    row.classList.add("chat-message-flash-v803");
    setTimeout(()=>row.classList.remove("chat-message-flash-v803"),900);
  }
});



$("pushToggleBtn")?.addEventListener("click",togglePushNotifications);
$("pushChatToggle")?.addEventListener("change",updatePushPreferences);
$("pushGatheringsToggle")?.addEventListener("change",updatePushPreferences);






/* Home — nearest event */
function homeEventDate(dateStr,timeStr){
  if(!dateStr)return null;
  const time=(timeStr||"23:59").slice(0,5);
  const d=new Date(`${dateStr}T${time}:00`);
  return Number.isNaN(d.getTime())?null:d;
}

function homeEventDateLabel(dateStr,timeStr){
  const eventDate=homeEventDate(dateStr,timeStr);
  if(!eventDate)return "";
  const now=new Date();
  const sameDay=
    eventDate.getFullYear()===now.getFullYear() &&
    eventDate.getMonth()===now.getMonth() &&
    eventDate.getDate()===now.getDate();

  const time=timeStr?timeStr.slice(0,5):"";
  if(sameDay)return `СЬОГОДНІ${time?` • ${time}`:""}`;

  const date=new Intl.DateTimeFormat("uk-UA",{day:"2-digit",month:"2-digit"}).format(eventDate);
  return `${date}${time?` • ${time}`:""}`;
}

function homeCountdownLabel(target){
  if(!target)return "";
  let ms=target.getTime()-Date.now();
  if(ms<=0)return "ЗАРАЗ";

  const totalMinutes=Math.ceil(ms/60000);
  const days=Math.floor(totalMinutes/1440);
  const hours=Math.floor((totalMinutes%1440)/60);
  const minutes=totalMinutes%60;

  if(days>0){
    if(hours>0)return `ЧЕРЕЗ ${days} Д ${hours} ГОД`;
    return `ЧЕРЕЗ ${days} Д`;
  }
  if(hours>0){
    if(minutes>0)return `ЧЕРЕЗ ${hours} ГОД ${minutes} ХВ`;
    return `ЧЕРЕЗ ${hours} ГОД`;
  }
  return `ЧЕРЕЗ ${Math.max(1,minutes)} ХВ`;
}

function homeShortTeamName(name){
  const value=(name||"").trim();
  if(!value)return "КОМАНДА";
  return value.length>14?value.slice(0,13)+"…":value;
}

function setHomeEventLogo(id,src,name){
  const img=$(id);
  if(!img)return;
  const wrap=img.closest(".home-next-logo");
  if(src){
    img.src=src;
    img.classList.remove("hidden");
    wrap?.classList.add("has-image");
    wrap?.style.setProperty("--fallback-text","''");
  }else{
    img.removeAttribute("src");
    img.classList.add("hidden");
    wrap?.classList.remove("has-image");
    if(wrap)wrap.dataset.fallback=(name||"?").trim().charAt(0).toUpperCase()||"?";
  }
}

function renderHomeNextEvent(){
  const empty=$("homeNextEmpty");
  const gatheringBox=$("homeNextGathering");
  const matchBox=$("homeNextMatch");
  if(!empty||!gatheringBox||!matchBox)return;

  const event=homeNextEventData;
  empty.classList.toggle("hidden",!!event);
  gatheringBox.classList.add("hidden");
  matchBox.classList.add("hidden");

  if(!event)return;

  if(event.type==="gathering"){
    gatheringBox.classList.remove("hidden");
    $("homeNextGatheringTitle").textContent=event.title||"Збір команди";
    $("homeNextGatheringDate").textContent=homeEventDateLabel(event.date,event.time);
    $("homeNextGatheringCountdown").textContent=homeCountdownLabel(event.when);
  }else{
    matchBox.classList.remove("hidden");
    $("homeNextHomeName").textContent=homeShortTeamName(event.homeName||"Centuria Athletics");
    $("homeNextAwayName").textContent=homeShortTeamName(event.awayName||"Суперник");
    $("homeNextMatchDate").textContent=homeEventDateLabel(event.date,event.time);
    $("homeNextMatchCountdown").textContent=homeCountdownLabel(event.when);
    setHomeEventLogo("homeNextHomeLogo",event.homeImage,event.homeName);
    setHomeEventLogo("homeNextAwayLogo",event.awayImage,event.awayName);
  }
}

async function loadHomeNextEvent(){
  if(!sb){
    homeNextEventData=null;
    renderHomeNextEvent();
    return;
  }

  const matchPromise=sb.from("calendar_matches")
    .select("id,match_date,match_time,home_team_name,home_team_image,away_team_name,away_team_image,competition_name")
    .order("match_date",{ascending:true});

  const gatheringPromise=authUser
    ? sb.from("gatherings")
        .select("id,title,gathering_date,gathering_time,is_closed")
        .eq("is_closed",false)
        .order("gathering_date",{ascending:true})
    : Promise.resolve({data:[],error:null});

  try{
    const [{data:matches,error:mErr},{data:gathers,error:gErr}]=await Promise.all([matchPromise,gatheringPromise]);
    if(mErr)console.warn("Home next match load failed",mErr);
    if(gErr)console.warn("Home next gathering load failed",gErr);

    const now=Date.now();
    const candidates=[];

    (matches||[]).forEach(m=>{
      const when=homeEventDate(m.match_date,m.match_time);
      if(when && when.getTime()>=now-60000){
        candidates.push({
          type:"match",
          id:m.id,
          date:m.match_date,
          time:m.match_time,
          when,
          homeName:m.home_team_name||"Centuria Athletics",
          homeImage:m.home_team_image||null,
          awayName:m.away_team_name||"Суперник",
          awayImage:m.away_team_image||null
        });
      }
    });

    (gathers||[]).forEach(g=>{
      const when=homeEventDate(g.gathering_date,g.gathering_time);
      if(when && when.getTime()>=now-60000){
        candidates.push({
          type:"gathering",
          id:g.id,
          title:g.title||"Збір команди",
          date:g.gathering_date,
          time:g.gathering_time,
          when
        });
      }
    });

    candidates.sort((a,b)=>a.when-b.when);
    homeNextEventData=candidates[0]||null;
    renderHomeNextEvent();
  }catch(err){
    console.warn("Home next event error",err);
    homeNextEventData=null;
    renderHomeNextEvent();
  }

  if(!homeNextEventTimer){
    homeNextEventTimer=setInterval(()=>{
      if(homeNextEventData && homeNextEventData.when.getTime()<Date.now()-60000){
        loadHomeNextEvent();
      }else{
        renderHomeNextEvent();
      }
    },30000);
  }
}

async function openHomeNextEvent(){
  const event=homeNextEventData;
  if(!event)return;

  if(event.type==="gathering"){
    navigate("gatherings");
    return;
  }

  navigate("calendar");
  await loadCalendarData();
  const match=calendarMatches.find(m=>m.id===event.id);
  if(match){
    $("calendarMatchModal")?.classList.remove("hidden");
    showCalendarMatchView(match);
  }else{
    openCalendarDay(event.date);
  }
}

$("homeNextEvent")?.addEventListener("click",openHomeNextEvent);



/* Training days, official stats and MVP */
async function loadStatisticsData(){
  if(!sb||!authUser)return;
  const [td,ts,os]=await Promise.all([
    sb.from("training_days").select("*").order("training_date",{ascending:true}),
    sb.from("training_player_stats").select("*"),
    sb.from("official_match_player_stats").select("*")
  ]);
  if(!td.error)trainingDays=td.data||[];
  if(!ts.error)trainingStats=ts.data||[];
  if(!os.error)officialMatchStats=os.data||[];
  renderCalendar();
  await loadLatestMvp();
}

function trainingForDate(date){return trainingDays.find(t=>t.training_date===date)||null;}
function trainingForGathering(gatheringId){return trainingDays.find(t=>t.gathering_id===gatheringId)||null;}
function statsForTraining(id){return trainingStats.filter(s=>s.training_day_id===id && s.rating!=null);}
function statsForMatch(id){return officialMatchStats.filter(s=>s.match_id===id);}

/* MVP збору: з 01.09.2026 претендент має зіграти щонайменше 50% матчів збору.
   Правило застосовується ретроактивно до всіх вересневих зборів і до всіх наступних. */
const FAIR_TRAINING_MVP_FROM_DATE="2026-09-01";
function fairTrainingMvpRuleApplies(day){
  const resolvedDate=day?.training_date||trainingDays.find(d=>d.id===day?.id)?.training_date||"";
  return Boolean(resolvedDate)&&String(resolvedDate)>=FAIR_TRAINING_MVP_FROM_DATE;
}
function trainingMvpEligibleRows(day,rows=statsForTraining(day?.id)){
  const source=rows||[];
  if(!fairTrainingMvpRuleApplies(day))return source;
  const total=Math.max(0,Number(day?.matches_played)||Number(trainingDays.find(d=>d.id===day?.id)?.matches_played)||0);
  if(!total)return source;
  const minimum=Math.ceil(total/2);
  return source.filter(r=>{
    const raw=r?.matches_played;
    const played=(raw===null||raw===undefined||raw==='')?total:Number(raw);
    return Number.isFinite(played)&&played>=minimum;
  });
}

function trainingMvp(day){
  const rows=trainingMvpEligibleRows(day);
  if(!rows.length)return null;
  const max=Math.max(...rows.map(r=>Number(r.rating)).filter(Number.isFinite));
  const row=rows.find(r=>Number(r.rating)===max);
  const player=players.find(p=>p.id===row?.player_id);
  return row&&player?{player,row,rating:max}:null;
}
function officialMvp(match){
  const rows=statsForMatch(match.id).filter(r=>r.rating!=null);
  if(!rows.length)return null;
  const max=Math.max(...rows.map(r=>Number(r.rating)).filter(Number.isFinite));
  const row=rows.find(r=>Number(r.rating)===max);
  const player=players.find(p=>p.id===row?.player_id);
  return row&&player?{player,row,rating:max}:null;
}

async function loadLatestMvp(){
  if(!players.length)return;
  const candidates=[];
  trainingDays.forEach(day=>{
    const m=trainingMvp(day);
    if(m)candidates.push({type:"training",date:day.training_date,entity:day,...m});
  });
  calendarMatches.forEach(match=>{
    const m=officialMvp(match);
    if(m)candidates.push({type:"match",date:match.match_date,entity:match,...m});
  });
  candidates.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  homeMvpData=candidates[0]||null;
  renderHomeVip();
}

function renderHomeVip(){
  const box=$("homeMvpCard");if(!box)return;
  if(!homeMvpData){box.classList.add("hidden");return;}
  box.classList.remove("hidden");
  $("homeMvpName").textContent=homeMvpData.player.name;
  $("homeMvpRating").textContent=Number(homeMvpData.rating).toFixed(1);
  $("homeMvpMeta").textContent=`${homeMvpData.date.split("-").reverse().join(".")} • ${homeMvpData.type==="training"?"збір":"матч"}`;
  const mvpPhoto=$("homeMvpPhoto");
  if(mvpPhoto){
    mvpPhoto.src=homeMvpData.player.cardImage||PLAYER_PLACEHOLDER;
    mvpPhoto.classList.remove("hidden");
  }
}

async function openHomeMvp(){
  if(!homeMvpData)return;
  navigate("calendar");
  await loadCalendarData();
  if(homeMvpData.type==="training"){
    openTrainingDay(homeMvpData.entity);
  }else{
    const match=calendarMatches.find(m=>m.id===homeMvpData.entity.id)||homeMvpData.entity;
    $("calendarMatchModal")?.classList.remove("hidden");
    showCalendarMatchView(match);
  }
}
$("homeMvpCard")?.addEventListener("click",e=>{
  if(!homeMvpData?.player?.id)return;
  e.preventDefault();
  e.stopPropagation();
  openPlayerModal(homeMvpData.player.id);
});

function closeDayActionModal(){$("calendarDayActionModal")?.classList.add("hidden");}
function showDayActionModal(dateKey){
  calendarSelectedDate=dateKey;
  $("calendarDayActionDate").textContent=formatCalendarDate(dateKey);
  $("calendarDayActionTitle").textContent="ПОДІЇ ДНЯ";
  const list=$("calendarDayExistingEvents");
  const matches=calendarMatches.filter(m=>m.match_date===dateKey);
  const gathers=calendarGatherings.filter(g=>g.gathering_date===dateKey);
  const items=[];
  matches.forEach(m=>items.push(`<button type="button" class="day-existing-event match" data-open-match="${m.id}">⚽ ${esc(m.home_team_name||"Centuria")} — ${esc(m.away_team_name||"Суперник")} <b>${m.match_time?m.match_time.slice(0,5):""}</b></button>`));
  gathers.forEach(g=>{
    const day=trainingForGathering(g.id);
    items.push(`<button type="button" class="day-existing-event gathering" data-open-gathering-stats="${g.id}">✓ ${esc(g.title||"Збір")} <b>${day?"📊":"＋ СТАТА"}</b></button>`);
  });
  list.innerHTML=items.join("");
  list.querySelectorAll("[data-open-match]").forEach(b=>b.addEventListener("click",()=>{const m=calendarMatches.find(x=>x.id===b.dataset.openMatch);closeDayActionModal();$("calendarMatchModal").classList.remove("hidden");showCalendarMatchView(m);}));
  list.querySelectorAll("[data-open-gathering-stats]").forEach(b=>b.addEventListener("click",()=>{const g=calendarGatherings.find(x=>x.id===b.dataset.openGatheringStats);closeDayActionModal();openGatheringStats(g);}));
  $("calendarDayActionModal").classList.remove("hidden");
  refreshCalendarPermissions();
}

function renderTrainingInputs(day=null){
  const box=$("trainingPlayerInputs");if(!box)return;
  const existing=day?statsForTraining(day.id):[];
  box.innerHTML=players.map(p=>{
    const row=existing.find(r=>r.player_id===p.id)||{};
    return `<div class="training-player-row extended">
      <span><img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt=""><b>${esc(p.name)}</b></span>
      <input type="number" min="0" max="${Math.max(0,Number(day?.matches_played||$("trainingMatchesInput")?.value||99))}" data-training-player-matches="${p.id}" value="${row.matches_played??(row.rating!=null ? (day?.matches_played||"") : "")}" placeholder="матчі">
      <input type="number" step="0.1" min="0" max="10" inputmode="decimal" data-training-rating="${p.id}" value="${row.rating??""}" placeholder="оцінка">
      <input type="number" min="0" max="99" data-training-goals="${p.id}" value="${row.goals||""}" placeholder="голи">
      <input type="number" min="0" max="99" data-training-assists="${p.id}" value="${row.assists||""}" placeholder="асисти">
    </div>`;
  }).join("");
}

function showTrainingEdit(day=null,gathering=null){
  if(!canEditSite())return;
  currentTrainingDay=day||null;
  currentTrainingGathering=gathering||currentTrainingGathering;
  $("trainingDayView").classList.add("hidden");
  $("trainingDayEdit").classList.remove("hidden");
  $("trainingDayModalTitle").textContent=day?"РЕДАГУВАННЯ СТАТИСТИКИ":"СТАТИСТИКА ЗБОРУ";
  $("trainingGatheringTitle").textContent=currentTrainingGathering?.title||"Збір";
  $("trainingGatheringDate").textContent=currentTrainingGathering?formatCalendarDate(currentTrainingGathering.gathering_date):"—";
  $("trainingMatchesInput").value=day?.matches_played||1;
  $("trainingDayStatus").textContent="";
  renderTrainingInputs(day);
}

function openGatheringStats(gathering){
  if(!gathering)return;
  currentTrainingGathering=gathering;
  const day=trainingForGathering(gathering.id);
  $("trainingDayModal").classList.remove("hidden");
  if(day)renderTrainingView(day);
  else if(canEditSite())showTrainingEdit(null,gathering);
  else{
    $("trainingDayView").classList.remove("hidden");
    $("trainingDayEdit").classList.add("hidden");
    $("trainingDayModalTitle").textContent=gathering.title||"ЗБІР";
    $("trainingViewDate").textContent=formatCalendarDate(gathering.gathering_date);
    $("trainingViewMatches").textContent="—";
    $("trainingViewMvp").textContent="Статистики ще немає";
    $("trainingViewMvpRating").textContent="—";
    $("trainingViewTeamAvg").textContent="—";
    $("trainingViewRanking").innerHTML='<div class="empty-state"><strong>СТАТИСТИКИ ЩЕ НЕМАЄ</strong><span>Редактор додасть її після збору.</span></div>';
  }
}

function renderTrainingView(day){
  currentTrainingDay=day;
  $("trainingDayEdit").classList.add("hidden");
  $("trainingDayView").classList.remove("hidden");
  $("trainingDayModalTitle").textContent=currentTrainingGathering?.title||day.title||"ЗБІР";
  $("trainingViewDate").textContent=formatCalendarDate(day.training_date);
  $("trainingViewMatches").textContent=day.matches_played||0;

  const rows=statsForTraining(day.id).sort((a,b)=>Number(b.rating)-Number(a.rating));
  const avg=averageRating(rows);
  const eligibleMvpRows=trainingMvpEligibleRows(day,rows);
  const topRating=eligibleMvpRows.length?Math.max(...eligibleMvpRows.map(r=>Number(r.rating)).filter(Number.isFinite)):null;
  const mvpRows=topRating==null?[]:eligibleMvpRows.filter(r=>Math.abs(Number(r.rating)-topRating)<0.000001);
  const mvpNames=mvpRows.map(r=>players.find(p=>p.id===r.player_id)?.name).filter(Boolean);
  $("trainingViewMvp").textContent=mvpNames.length?mvpNames.join(" • "):"—";
  $("trainingViewMvpRating").textContent=topRating!=null?fmtRating(topRating):"—";
  $("trainingViewTeamAvg").textContent=fmtRating(avg);

  const totalMatches=Math.max(0,Number(day.matches_played)||0);
  const minimumMvpMatches=totalMatches?Math.ceil(totalMatches/2):0;
  const fairMvpRule=fairTrainingMvpRuleApplies(day);
  $("trainingViewRanking").innerHTML=rows.length?rows.map((r,i)=>{
    const p=players.find(x=>x.id===r.player_id);
    const rawPlayed=r?.matches_played;
    const played=(rawPlayed===null||rawPlayed===undefined||rawPlayed==='')?totalMatches:Number(rawPlayed);
    const mvpEligible=!fairMvpRule || !totalMatches || (Number.isFinite(played)&&played>=minimumMvpMatches);
    const isMvp=topRating!=null && mvpEligible && Math.abs(Number(r.rating)-topRating)<0.000001;
    const eligibilityNote=fairMvpRule&&!mvpEligible
      ?`<small class="mvp-ineligible-note">⏱️ Недостатньо матчів · ${Number.isFinite(played)?played:0}/${totalMatches} · мін. ${minimumMvpMatches}</small>`
      :(isMvp?`<small class="mvp-eligible-note">🏆 MVP</small>`:"");
    return `<div class="training-rank-row ${isMvp?"mvp":""} ${!mvpEligible?"mvp-ineligible":""}">
      <span class="rank-place">${i+1}</span>
      <span class="rank-player"><img src="${p?.cardImage||PLAYER_PLACEHOLDER}" alt=""><b>${esc(p?.name||"Гравець")}</b>${eligibilityNote}</span>
      <small class="rank-extra">🎮 ${Number.isFinite(played)?played:(day.matches_played||0)} · ⚽ ${r.goals||0} · 🅰 ${r.assists||0}</small>
      <strong>${fmtRating(Number(r.rating))}</strong>
    </div>`;
  }).join(""):`<div class="empty-state"><strong>СТАТИСТИКИ ЩЕ НЕМАЄ</strong><span>Редактор може внести оцінки.</span></div>`;
  refreshCalendarPermissions();
}

function openTrainingDay(day){
  if(!day)return;
  $("trainingDayModal").classList.remove("hidden");
  renderTrainingView(day);
}
function closeTrainingDayModal(){$("trainingDayModal")?.classList.add("hidden");currentTrainingDay=null;}

async function saveTrainingDay(){
  if(!sb||!authUser||!canEditSite()||!currentTrainingGathering)return;
  const date=currentTrainingGathering.gathering_date;
  const matches=Number($("trainingMatchesInput").value||0);
  if(matches<1){$("trainingDayStatus").textContent="Вкажи кількість матчів.";return;}
  const btn=$("saveTrainingDayBtn");btn.disabled=true;
  try{
    let day,error;
    const payload={
      training_date:date,
      title:currentTrainingGathering.title||"Збір",
      matches_played:matches,
      gathering_id:currentTrainingGathering.id
    };
    if(currentTrainingDay){
      ({data:day,error}=await sb.from("training_days").update(payload).eq("id",currentTrainingDay.id).select("*").single());
    }else{
      ({data:day,error}=await sb.from("training_days").insert({...payload,created_by:authUser.id}).select("*").single());
    }
    if(error)throw error;

    const rows=players.map(p=>({
      player_id:p.id,
      matches_played:document.querySelector(`[data-training-player-matches="${p.id}"]`)?.value||"",
      rating:document.querySelector(`[data-training-rating="${p.id}"]`)?.value||"",
      goals:document.querySelector(`[data-training-goals="${p.id}"]`)?.value||"",
      assists:document.querySelector(`[data-training-assists="${p.id}"]`)?.value||""
    })).filter(r=>r.matches_played!==""||r.rating!==""||r.goals!==""||r.assists!=="").map(r=>({
      training_day_id:day.id,
      player_id:r.player_id,
      matches_played:r.matches_played===""?matches:Math.min(matches,Math.max(0,Number(r.matches_played)||0)),
      rating:r.rating===""?null:Number(r.rating),
      goals:Number(r.goals||0),
      assists:Number(r.assists||0)
    }));
    await sb.from("training_player_stats").delete().eq("training_day_id",day.id);
    if(rows.length){
      const {error:statsErr}=await sb.from("training_player_stats").insert(rows);
      if(statsErr)throw statsErr;
    }
    await loadStatisticsData();
    currentTrainingDay=trainingDays.find(t=>t.id===day.id)||day;
    renderTrainingView(currentTrainingDay);
    showToast("Статистику збору збережено ✓");
  }catch(err){
    console.error(err);
    $("trainingDayStatus").textContent="Не вдалося зберегти статистику збору.";
  }finally{btn.disabled=false;}
}

async function deleteTrainingDay(){
  if(!currentTrainingDay||!canEditSite()||!confirm("Видалити статистику цього збору? Сам збір залишиться."))return;
  const {error}=await sb.from("training_days").delete().eq("id",currentTrainingDay.id);
  if(error){showToast("Не вдалося видалити тренування");return;}
  closeTrainingDayModal();
  await loadStatisticsData();
  showToast("Статистику збору видалено");
}

async function loadOfficialStatsForMatch(match){
  if(!match)return;
  const rows=statsForMatch(match.id).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0));
  const score=$("officialMatchScore");
  if(match.home_score!=null && match.away_score!=null){
    score.classList.remove("hidden");
    score.textContent=`${match.home_team_name||"Centuria"} ${match.home_score} : ${match.away_score} ${match.away_team_name||"Суперник"}`;
  }else score.classList.add("hidden");

  const list=$("officialMatchStatsList");
  list.innerHTML=rows.length?rows.map((r,i)=>{
    const p=players.find(x=>x.id===r.player_id);
    return `<div class="official-stat-row ${i===0?"mvp":""}">
      <span>${i===0?"🏆 ":""}${esc(p?.name||"Гравець")}</span>
      <small>${r.goals?`⚽ ${r.goals}`:""} ${r.assists?`🅰 ${r.assists}`:""}</small>
      <b>${r.rating!=null?fmtRating(Number(r.rating)):"—"}</b>
    </div>`;
  }).join(""):`<span class="muted">Статистику ще не внесено.</span>`;
}

function renderOfficialInputs(match){
  $("officialHomeScoreInput").value=match?.home_score??"";
  $("officialAwayScoreInput").value=match?.away_score??"";
  const existing=match?statsForMatch(match.id):[];
  $("officialPlayerInputs").innerHTML=players.map(p=>{
    const r=existing.find(x=>x.player_id===p.id)||{};
    return `<div class="official-player-row">
      <span><img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt=""><b>${esc(p.name)}</b></span>
      <input data-official-rating="${p.id}" type="number" step="0.1" min="0" max="10" placeholder="оцінка" value="${r.rating??""}">
      <input data-official-goals="${p.id}" type="number" min="0" max="20" placeholder="голи" value="${r.goals||""}">
      <input data-official-assists="${p.id}" type="number" min="0" max="20" placeholder="асисти" value="${r.assists||""}">
    </div>`;
  }).join("");
}

async function saveOfficialStats(matchId){
  if(!matchId||!canEditSite())return;
  const match=calendarMatches.find(m=>m.id===matchId);if(!match)return;
  const homeScore=$("officialHomeScoreInput").value===""?null:Number($("officialHomeScoreInput").value);
  const awayScore=$("officialAwayScoreInput").value===""?null:Number($("officialAwayScoreInput").value);
  const {error:matchErr}=await sb.from("calendar_matches").update({home_score:homeScore,away_score:awayScore}).eq("id",matchId);
  if(matchErr)throw matchErr;

  const rows=players.map(p=>({
    player_id:p.id,
    rating:document.querySelector(`[data-official-rating="${p.id}"]`)?.value,
    goals:document.querySelector(`[data-official-goals="${p.id}"]`)?.value,
    assists:document.querySelector(`[data-official-assists="${p.id}"]`)?.value
  })).filter(r=>r.rating!==""||r.goals!==""||r.assists!=="").map(r=>({
    match_id:matchId,player_id:r.player_id,
    rating:r.rating===""?null:Number(r.rating),
    goals:Number(r.goals||0),assists:Number(r.assists||0)
  }));
  await sb.from("official_match_player_stats").delete().eq("match_id",matchId);
  if(rows.length){
    const {error}=await sb.from("official_match_player_stats").insert(rows);
    if(error)throw error;
  }
  await Promise.all([loadCalendarData(),loadStatisticsData()]);
}


/* Calendar */
const CALENDAR_MONTHS=["СІЧЕНЬ","ЛЮТИЙ","БЕРЕЗЕНЬ","КВІТЕНЬ","ТРАВЕНЬ","ЧЕРВЕНЬ","ЛИПЕНЬ","СЕРПЕНЬ","ВЕРЕСЕНЬ","ЖОВТЕНЬ","ЛИСТОПАД","ГРУДЕНЬ"];
function calendarDateKey(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function calendarTodayKey(){const d=new Date();return calendarDateKey(d.getFullYear(),d.getMonth(),d.getDate());}
function formatCalendarDate(key){
  if(!key)return "—";const [y,m,d]=key.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(y,m-1,d));
}

async function loadCalendarData(){
  if(!sb)return;
  const matchQuery=sb.from("calendar_matches").select("*").order("match_date",{ascending:true});
  const gathersQuery=authUser
    ? sb.from("gatherings").select("id,title,gathering_date,gathering_time,note,is_closed").order("gathering_date",{ascending:true})
    : Promise.resolve({data:[],error:null});
  const [{data:mData,error:mErr},{data:gData,error:gErr}]=await Promise.all([matchQuery,gathersQuery]);
  if(mErr)console.error("Calendar matches load",mErr);
  if(gErr)console.error("Calendar gatherings load",gErr);
  if(!mErr)calendarMatches=mData||[];
  if(!gErr)calendarGatherings=gData||[];
  renderCalendar();
  if($("screen-home")?.classList.contains("active"))loadHomeNextEvent();
}

function renderCalendar(){
  const grid=$("calendarGrid");if(!grid)return;
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  $("calendarMonthTitle").textContent=CALENDAR_MONTHS[m];
  $("calendarYearTitle").textContent=String(y);
  const first=new Date(y,m,1);
  const offset=(first.getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const prevDays=new Date(y,m,0).getDate();
  const today=calendarTodayKey();
  const cells=[];
  for(let i=0;i<42;i++){
    let cy=y,cm=m,day=i-offset+1,outside=false;
    if(day<1){cm=m-1;if(cm<0){cm=11;cy=y-1}day=prevDays+day;outside=true;}
    else if(day>days){day-=days;cm=m+1;if(cm>11){cm=0;cy=y+1}outside=true;}
    const key=calendarDateKey(cy,cm,day);
    const dayMatches=calendarMatches.filter(v=>v.match_date===key);
    const gathers=calendarGatherings.filter(v=>v.gathering_date===key && !v.is_closed);
    cells.push(`<button type="button" class="calendar-day ${outside?"outside":""} ${key===today?"today":""} ${dayMatches.length?"has-match":""}" data-calendar-date="${key}" data-viewer-allowed="true">
      <span class="calendar-day-number">${day}</span>
      <span class="calendar-day-events">
        ${dayMatches.length?`<span class="calendar-event-badge match">⚽ <b>${dayMatches.length>1?`МАТЧІ ${dayMatches.length}`:"МАТЧ"}</b></span>`:""}
        ${gathers.length?`<span class="calendar-event-badge gathering">✓ <b>${gathers.length>1?`ЗБОРИ ${gathers.length}`:"ЗБІР"}</b></span>`:""}
      </span>
    </button>`);
  }
  grid.innerHTML=cells.join("");
  grid.querySelectorAll("[data-calendar-date]").forEach(btn=>btn.addEventListener("click",()=>openCalendarDay(btn.dataset.calendarDate)));
}

async function openCalendarScreen(){
  await loadCalendarData();
}

function showCalendarMatchView(match){
  calendarSelectedMatch=match;
  calendarSelectedDate=match.match_date;
  $("calendarDayMatchesPane")?.classList.add("hidden");
  $("calendarMatchEdit").classList.add("hidden");
  $("calendarTransferBox")?.classList.add("hidden");
  $("calendarMatchView").classList.remove("hidden");
  const compWrap=$("matchViewCompetition");
  const hasComp=Boolean(match.competition_image||match.competition_name);
  compWrap.classList.toggle("hidden",!hasComp);
  const compImg=$("matchViewCompetitionImg");
  if(match.competition_image){compImg.src=match.competition_image;compImg.classList.remove("hidden");}else{compImg.removeAttribute("src");compImg.classList.add("hidden");}
  $("matchViewCompetitionName").textContent=match.competition_name||"";
  setCalendarViewLogo("matchViewHomeImg",match.home_team_image);
  setCalendarViewLogo("matchViewAwayImg",match.away_team_image);
  $("matchViewHomeName").textContent=match.home_team_name||"Centuria Athletics";
  $("matchViewAwayName").textContent=match.away_team_name||"Суперник";
  $("matchViewTime").textContent=match.match_time?match.match_time.slice(0,5):"ЧАС НЕ ВКАЗАНО";
  $("matchViewDate").textContent=formatCalendarDate(match.match_date);
  $("calendarMatchTitle").textContent="МАТЧ";
  loadOfficialStatsForMatch(match);
  refreshCalendarPermissions();
}

function setCalendarViewLogo(id,src){
  const img=$(id);if(!img)return;
  if(src){img.src=src;img.classList.remove("hidden");img.parentElement?.classList.add("has-image");}
  else{img.removeAttribute("src");img.classList.add("hidden");img.parentElement?.classList.remove("has-image");}
}

function setMatchPreview(id,src,label){
  const box=$(id);if(!box)return;
  box.innerHTML=src?`<img src="${src}" alt="">`:`<span>${label}</span>`;
}

function showCalendarMatchEdit(match,dateKey){
  if(!canEditSite()){if(match)showCalendarMatchView(match);return;}
  $("calendarDayMatchesPane")?.classList.add("hidden");
  $("calendarTransferBox")?.classList.add("hidden");
  calendarSelectedMatch=match||null;
  calendarSelectedDate=dateKey || match?.match_date || calendarTodayKey();
  calendarDraftImages={competition:match?.competition_image||null,home:match?.home_team_image||null,away:match?.away_team_image||null};
  $("calendarMatchView").classList.add("hidden");
  $("calendarMatchEdit").classList.remove("hidden");
  $("calendarMatchTitle").textContent=match?"РЕДАГУВАННЯ МАТЧУ":"НОВИЙ МАТЧ";
  $("matchCompetitionName").value=match?.competition_name||"";
  $("matchHomeName").value=match?.home_team_name||"Centuria Athletics";
  $("matchAwayName").value=match?.away_team_name||"";
  $("matchDateInput").value=calendarSelectedDate;
  $("matchTimeInput").value=match?.match_time?match.match_time.slice(0,5):"21:00";
  $("calendarMatchStatus").textContent="";
  setMatchPreview("matchCompetitionPreview",calendarDraftImages.competition,"ЛОГО ЛІГИ");
  setMatchPreview("matchHomePreview",calendarDraftImages.home,"КОМАНДА 1");
  setMatchPreview("matchAwayPreview",calendarDraftImages.away,"КОМАНДА 2");
  renderOfficialInputs(match);
  refreshCalendarPermissions();
}

function renderCalendarDayMatches(dateKey){
  calendarSelectedDate=dateKey;
  calendarSelectedMatch=null;

  const pane=$("calendarDayMatchesPane");
  const list=$("calendarDayMatchesList");
  if(!pane||!list)return;

  $("calendarMatchView")?.classList.add("hidden");
  $("calendarMatchEdit")?.classList.add("hidden");
  $("calendarTransferBox")?.classList.add("hidden");

  const matches=calendarMatches
    .filter(v=>v.match_date===dateKey)
    .sort((a,b)=>(a.match_time||"99:99").localeCompare(b.match_time||"99:99"));

  $("calendarMatchTitle").textContent=matches.length>1?`МАТЧІ — ${matches.length}`:"МАТЧ";
  $("calendarDayMatchesDate").textContent=formatCalendarDate(dateKey);
  list.innerHTML="";

  matches.forEach(match=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="calendar-day-match-choice";
    btn.dataset.viewerAllowed="true";

    const time=match.match_time?match.match_time.slice(0,5):"—";
    const league=match.competition_name||"Матч";
    btn.innerHTML=`
      <span class="calendar-day-match-time">${esc(time)}</span>
      <span class="calendar-day-match-copy">
        <small>${esc(league)}</small>
        <strong>${esc(match.home_team_name||"Centuria Athletics")} <b>VS</b> ${esc(match.away_team_name||"Суперник")}</strong>
      </span>
      <span class="calendar-day-match-open">›</span>`;
    btn.addEventListener("click",()=>showCalendarMatchView(match));
    list.appendChild(btn);
  });

  pane.classList.remove("hidden");
  refreshCalendarPermissions();
}

function openCalendarDay(dateKey){
  calendarSelectedDate=dateKey;
  const matches=calendarMatches.filter(v=>v.match_date===dateKey);
  const gathers=calendarGatherings.filter(v=>v.gathering_date===dateKey && !v.is_closed);
  const eventCount=matches.length+gathers.length;

  if(eventCount===1 && matches.length===1){
    $("calendarMatchModal").classList.remove("hidden");
    showCalendarMatchView(matches[0]);
    return;
  }
  if(eventCount===1 && gathers.length===1){
    openGatheringStats(gathers[0]);
    return;
  }
  if(eventCount===0 && !canEditSite()){
    showToast("На цей день подій немає");
    return;
  }
  showDayActionModal(dateKey);
}

function closeCalendarMatchModal(){
  $("calendarMatchModal")?.classList.add("hidden");
  $("calendarDayMatchesPane")?.classList.add("hidden");
  $("calendarTransferBox")?.classList.add("hidden");
  calendarDraftImages={competition:null,home:null,away:null};
}

async function chooseCalendarImage(inputId,kind,previewId,label){
  const input=$(inputId);if(!input)return;
  input.value="";input.click();
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){showToast("Потрібне JPG, PNG або WEBP");return;}
    try{
      const data=await resizeImage(file,420,420,.9);
      calendarDraftImages[kind]=data;
      setMatchPreview(previewId,data,label);
    }catch(err){console.error(err);showToast("Не вдалося завантажити зображення");}
  };
}


function openCalendarMatchTransfer(){
  if(!calendarSelectedMatch || !canEditSite())return;
  const box=$("calendarTransferBox");
  if(!box)return;
  $("transferMatchDateInput").value=calendarSelectedMatch.match_date||calendarSelectedDate||calendarTodayKey();
  $("calendarTransferStatus").textContent="";
  box.classList.remove("hidden");
  setTimeout(()=>$("transferMatchDateInput")?.focus(),50);
}

function closeCalendarMatchTransfer(){
  $("calendarTransferBox")?.classList.add("hidden");
  if($("calendarTransferStatus"))$("calendarTransferStatus").textContent="";
}

async function confirmCalendarMatchTransfer(){
  if(!sb||!authUser||!calendarSelectedMatch||!canEditSite())return;
  const newDate=$("transferMatchDateInput")?.value;
  if(!newDate){
    $("calendarTransferStatus").textContent="Вибери нову дату.";
    return;
  }
  if(newDate===calendarSelectedMatch.match_date){
    $("calendarTransferStatus").textContent="Це вже поточна дата матчу.";
    return;
  }

  const btn=$("confirmTransferMatchBtn");
  if(btn)btn.disabled=true;
  $("calendarTransferStatus").textContent="Перенесення…";

  try{
    const {data,error}=await sb.from("calendar_matches")
      .update({match_date:newDate})
      .eq("id",calendarSelectedMatch.id)
      .select("*")
      .single();

    if(error)throw error;

    calendarSelectedMatch=data;
    calendarSelectedDate=data.match_date;

    const [y,m]=newDate.split("-").map(Number);
    calendarCursor=new Date(y,m-1,1);

    await loadCalendarData();
    closeCalendarMatchTransfer();
    showCalendarMatchView(data);
    showToast("Матч перенесено ✓");
  }catch(err){
    console.error(err);
    $("calendarTransferStatus").textContent="Не вдалося перенести матч.";
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function saveCalendarMatch(){
  if(!sb||!authUser||!canEditSite()){showToast("Потрібні права редактора");return;}
  const date=$("matchDateInput").value;
  const home=$("matchHomeName").value.trim()||"Centuria Athletics";
  const away=$("matchAwayName").value.trim();
  if(!date||!away){$("calendarMatchStatus").textContent="Вкажи дату та назву суперника.";return;}
  const payload={
    match_date:date,
    match_time:$("matchTimeInput").value||null,
    competition_name:$("matchCompetitionName").value.trim()||null,
    competition_image:calendarDraftImages.competition,
    home_team_name:home,
    home_team_image:calendarDraftImages.home,
    away_team_name:away,
    away_team_image:calendarDraftImages.away
  };
  const btn=$("saveCalendarMatchBtn");btn.disabled=true;$("calendarMatchStatus").textContent="Збереження…";
  try{
    let data,error;
    if(calendarSelectedMatch){
      ({data,error}=await sb.from("calendar_matches").update(payload).eq("id",calendarSelectedMatch.id).select("*").single());
    }else{
      ({data,error}=await sb.from("calendar_matches").insert({...payload,created_by:authUser.id}).select("*").single());
    }
    if(error)throw error;
    calendarSelectedMatch=data;calendarSelectedDate=data.match_date;
    await saveOfficialStats(data.id);
    const refreshed=calendarMatches.find(m=>m.id===data.id)||data;
    showCalendarMatchView(refreshed);showToast("Матч збережено ✓");
  }catch(err){
    console.error(err);
    $("calendarMatchStatus").textContent="Не вдалося зберегти матч.";
  }finally{btn.disabled=false;}
}

async function deleteCalendarMatch(){
  if(!sb||!calendarSelectedMatch||!canEditSite())return;
  if(!confirm("Видалити цей матч із календаря?"))return;
  const {error}=await sb.from("calendar_matches").delete().eq("id",calendarSelectedMatch.id);
  if(error){console.error(error);showToast("Не вдалося видалити матч");return;}
  const deletedDate=calendarSelectedMatch.match_date;
  calendarSelectedMatch=null;
  await loadCalendarData();
  const remaining=calendarMatches.filter(v=>v.match_date===deletedDate);
  if(remaining.length>1){
    renderCalendarDayMatches(deletedDate);
  }else if(remaining.length===1){
    showCalendarMatchView(remaining[0]);
  }else{
    closeCalendarMatchModal();
  }
  showToast("Матч видалено");
}

$("calendarBackHomeBtn")?.addEventListener("click",()=>navigate("home"));
$("playersBackHomeBtn")?.addEventListener("click",()=>navigate("home"));
$("calendarPrevBtn")?.addEventListener("click",()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();});
$("calendarNextBtn")?.addEventListener("click",()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();});
$("closeCalendarMatchModal")?.addEventListener("click",closeCalendarMatchModal);
document.querySelectorAll("[data-close-calendar-match]").forEach(el=>el.addEventListener("click",closeCalendarMatchModal));
$("editCalendarMatchBtn")?.addEventListener("click",()=>showCalendarMatchEdit(calendarSelectedMatch,calendarSelectedDate));
$("editOfficialStatsBtn")?.addEventListener("click",()=>{
  if(!calendarSelectedMatch||!canEditSite())return;
  showCalendarMatchEdit(calendarSelectedMatch,calendarSelectedDate);
  $("officialStatsDetails")?.setAttribute("open","");
  setTimeout(()=>$("officialStatsDetails")?.scrollIntoView({behavior:"smooth",block:"center"}),50);
});
$("addAnotherCalendarMatchBtn")?.addEventListener("click",()=>showCalendarMatchEdit(null,calendarSelectedDate));
$("transferCalendarMatchBtn")?.addEventListener("click",openCalendarMatchTransfer);
$("cancelTransferMatchBtn")?.addEventListener("click",closeCalendarMatchTransfer);
$("confirmTransferMatchBtn")?.addEventListener("click",confirmCalendarMatchTransfer);
$("deleteCalendarMatchBtn")?.addEventListener("click",deleteCalendarMatch);
$("saveCalendarMatchBtn")?.addEventListener("click",saveCalendarMatch);
$("chooseMatchCompetitionImage")?.addEventListener("click",()=>chooseCalendarImage("matchCompetitionImageInput","competition","matchCompetitionPreview","ЛОГО ЛІГИ"));
$("chooseMatchHomeImage")?.addEventListener("click",()=>chooseCalendarImage("matchHomeImageInput","home","matchHomePreview","КОМАНДА 1"));
$("chooseMatchAwayImage")?.addEventListener("click",()=>chooseCalendarImage("matchAwayImageInput","away","matchAwayPreview","КОМАНДА 2"));


/* Tactical board */
function cloneTacticalState(state){
  try{return JSON.parse(JSON.stringify(state||{}));}catch(_e){return {markers:[],ball:{x:50,y:70,visible:true},arrows:[]};}
}

function defaultTacticalState(){
  const ownPositions=[
    [50,91],[18,77],[39,80],[61,80],[82,77],
    [22,58],[42,60],[58,60],[78,58],[38,35],[62,35]
  ];
  return {
    markers:ownPositions.map((p,i)=>({id:uid(),type:"own",n:i+1,x:p[0],y:p[1]})),
    ball:{x:50,y:69,visible:true},
    arrows:[]
  };
}

function clampTbStoredPoint(x,y){
  /* Minimal universal edge protection only.
     Every marker can otherwise use the whole tactical pitch. */
  return {
    x:Math.max(2.4,Math.min(97.6,Number(x)||50)),
    y:Math.max(1.8,Math.min(98.2,Number(y)||50))
  };
}

function tbDragBoundsForElement(el,pitchRect){
  const w=Math.max(1,pitchRect?.width||1);
  const h=Math.max(1,pitchRect?.height||1);
  const ew=Math.max(29,el?.offsetWidth||30);
  const eh=Math.max(29,el?.offsetHeight||30);
  /* One extra pixel prevents clipping from borders/outline rounding. */
  const mx=Math.min(12,Math.max(1.5,((ew/2+1)/w)*100));
  const my=Math.min(12,Math.max(1.5,((eh/2+1)/h)*100));
  return {minX:mx,maxX:100-mx,minY:my,maxY:100-my};
}

function clampTbPointToBounds(x,y,bounds){
  return {
    x:Math.max(bounds.minX,Math.min(bounds.maxX,Number(x)||50)),
    y:Math.max(bounds.minY,Math.min(bounds.maxY,Number(y)||50))
  };
}

function normalizeTacticalState(raw){
  const s=cloneTacticalState(raw);
  if(!Array.isArray(s.markers))s.markers=[];
  if(!Array.isArray(s.arrows))s.arrows=[];
  if(!s.ball)s.ball={x:50,y:69,visible:true};
  s.markers=s.markers.filter(m=>m&&Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))).map((m,i)=>({
    id:m.id||uid(), type:m.type==="opponent"?"opponent":"own", n:Number(m.n)||i+1,
    label:String(m.label||"").trim().slice(0,5),
    ...clampTbStoredPoint(m.x,m.y)
  }));
  s.arrows=s.arrows.filter(a=>a&&[a.x1,a.y1,a.x2,a.y2].every(v=>Number.isFinite(Number(v)))).map(a=>({
    id:a.id||uid(),x1:Number(a.x1),y1:Number(a.y1),x2:Number(a.x2),y2:Number(a.y2)
  }));
  const safeBall=clampTbStoredPoint(s.ball.x,s.ball.y);
  s.ball={x:safeBall.x,y:safeBall.y,visible:s.ball.visible!==false};
  return s;
}

/* ==========================================================
   v7.99 — Tactical Board 2.0
   Complete rebuild of pitch interaction.

   No old tacticalPitch / tb-marker / ghost / auto-scroll code is used.
   One system only: Pointer Events + Pointer Capture + frozen pitch rect.
   ========================================================== */

function tb2GetObject(kind,id){
  if(kind==="marker"){
    return (tbState.markers||[]).find(m=>m.id===id)||null;
  }
  if(!tbState.ball)tbState.ball={x:50,y:69,visible:true};
  return tbState.ball;
}

function tb2BoundsForElement(el,pitchRect){
  const w=Math.max(1,pitchRect?.width||1);
  const h=Math.max(1,pitchRect?.height||1);
  const er=el?.getBoundingClientRect?.();
  const ew=Math.max(30,er?.width||34);
  const eh=Math.max(30,er?.height||34);

  const mx=Math.max(1.5,((ew/2+2)/w)*100);
  const my=Math.max(1.2,((eh/2+2)/h)*100);

  return {
    minX:Math.min(12,mx),
    maxX:100-Math.min(12,mx),
    minY:Math.min(8,my),
    maxY:100-Math.min(8,my)
  };
}

function tb2Clamp(x,y,bounds){
  return {
    x:Math.max(bounds.minX,Math.min(bounds.maxX,Number(x)||50)),
    y:Math.max(bounds.minY,Math.min(bounds.maxY,Number(y)||50))
  };
}

function tb2PointFromClient(clientX,clientY,pitchRect,bounds){
  const rawX=((clientX-pitchRect.left)/pitchRect.width)*100;
  const rawY=((clientY-pitchRect.top)/pitchRect.height)*100;
  return tb2Clamp(rawX,rawY,bounds);
}

function tb2SetSelected(kind,id=null){
  tbSelected={kind,id};

  document.querySelectorAll("#tb2MarkerLayer .tb2-marker.selected")
    .forEach(el=>el.classList.remove("selected"));

  if(kind==="marker" && id){
    document
      .querySelector(`#tb2MarkerLayer [data-tb2-marker-id="${CSS.escape(String(id))}"]`)
      ?.classList.add("selected");
  }

  $("tb2Ball")?.classList.toggle("selected",kind==="ball");
}

function editTbMarkerLabel(id){
  if(!canEditSite())return;
  const marker=(tbState.markers||[]).find(m=>m.id===id);
  if(!marker)return;

  const current=String(marker.label||"");
  const value=window.prompt(
    "Підпис гравця (наприклад: ЛЗ, ЦЗ, ПЗ, ЦП, ЦАП, ФРВ).\nЗалиш порожнім, щоб знову показувати номер.",
    current
  );
  if(value===null)return;

  marker.label=String(value).trim().toUpperCase().slice(0,5);
  renderTacticalBoard();
}

function renderTacticalArrows(){
  const group=$("tb2ArrowGroup");
  if(!group)return;

  const arrows=[...(tbState.arrows||[])];
  if(tbArrowDraft)arrows.push({...tbArrowDraft,id:"draft",draft:true});

  group.innerHTML=arrows.map(a=>`
    <line
      class="tb2-arrow-line ${a.draft?"draft":""}"
      x1="${a.x1}" y1="${a.y1}"
      x2="${a.x2}" y2="${a.y2}"
      marker-end="url(#tb2ArrowHead)">
    </line>
  `).join("");
}

function tb2BindDraggable(el,kind,id){
  if(el.dataset.tb2DragBound==="1")return;
  el.dataset.tb2DragBound="1";

  let drag=null;

  el.addEventListener("pointerdown",e=>{
    if(!canEditSite() || tbArrowMode)return;
    if(e.pointerType==="mouse" && e.button!==0)return;

    const pitch=$("tb2Pitch");
    const object=tb2GetObject(kind,id);
    if(!pitch||!object)return;

    const rect=pitch.getBoundingClientRect();
    if(!rect.width||!rect.height)return;

    e.preventDefault();
    e.stopPropagation();

    drag={
      pointerId:e.pointerId,
      pitchRect:{
        left:rect.left,
        top:rect.top,
        width:rect.width,
        height:rect.height
      },
      bounds:tb2BoundsForElement(el,rect),
      screen:$("screen-tactical-board"),
      scrollTop:$("screen-tactical-board")?.scrollTop||0,
      startClientX:e.clientX,
      startClientY:e.clientY,
      moved:false
    };

    tb2SetSelected(kind,id);
    el.classList.add("dragging");
    pitch.classList.add("tb2-dragging");

    try{el.setPointerCapture(e.pointerId)}catch(_e){}
  },{passive:false});

  el.addEventListener("pointermove",e=>{
    if(!drag || drag.pointerId!==e.pointerId)return;

    e.preventDefault();

    if(drag.screen && Math.abs(drag.screen.scrollTop-drag.scrollTop)>.5){
      drag.screen.scrollTop=drag.scrollTop;
    }

    const dist=Math.hypot(
      e.clientX-drag.startClientX,
      e.clientY-drag.startClientY
    );

    if(!drag.moved && dist<3)return;
    drag.moved=true;

    const p=tb2PointFromClient(
      e.clientX,e.clientY,
      drag.pitchRect,
      drag.bounds
    );

    const object=tb2GetObject(kind,id);
    if(!object)return;

    object.x=p.x;
    object.y=p.y;

    /* Visible point and stored state always use the same x/y. */
    el.style.left=p.x+"%";
    el.style.top=p.y+"%";
  },{passive:false});

  const finish=e=>{
    if(!drag || drag.pointerId!==e.pointerId)return;

    e.preventDefault();
    e.stopPropagation();

    const wasTap=kind==="marker"&&!drag.moved;

    if(drag.screen)drag.screen.scrollTop=drag.scrollTop;

    try{
      if(el.hasPointerCapture?.(e.pointerId)){
        el.releasePointerCapture(e.pointerId);
      }
    }catch(_e){}

    el.classList.remove("dragging");
    $("tb2Pitch")?.classList.remove("tb2-dragging");

    /* NO drop conversion and NO re-render after drag.
       The point stays exactly where the finger left it. */
    drag=null;

    if(wasTap)setTimeout(()=>editTbMarkerLabel(id),30);
  };

  el.addEventListener("pointerup",finish,{passive:false});
  el.addEventListener("pointercancel",finish,{passive:false});
  el.addEventListener("lostpointercapture",()=>{
    if(!drag)return;
    el.classList.remove("dragging");
    $("tb2Pitch")?.classList.remove("tb2-dragging");
    drag=null;
  });
}

function renderTacticalBoard(){
  const pitch=$("tb2Pitch");
  const layer=$("tb2MarkerLayer");
  if(!pitch||!layer)return;

  const rect=pitch.getBoundingClientRect();
  layer.innerHTML="";

  (tbState.markers||[]).forEach(m=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className=`tb2-marker ${m.type}`;
    btn.dataset.tb2MarkerId=m.id;
    btn.dataset.viewerAllowed="true";

    const markerText=String(m.label||"").trim()||String(m.n);
    btn.textContent=markerText;
    btn.classList.toggle("has-label",!!String(m.label||"").trim());
    btn.setAttribute(
      "aria-label",
      m.type==="own"
        ? `Свій гравець ${markerText}`
        : `Суперник ${markerText}`
    );

    layer.appendChild(btn);

    const safe=tb2Clamp(
      m.x,m.y,
      tb2BoundsForElement(btn,rect)
    );
    m.x=safe.x;
    m.y=safe.y;

    btn.style.left=m.x+"%";
    btn.style.top=m.y+"%";
    btn.classList.toggle(
      "selected",
      tbSelected?.kind==="marker"&&tbSelected?.id===m.id
    );

    tb2BindDraggable(btn,"marker",m.id);
  });

  const ball=$("tb2Ball");
  if(ball){
    const safe=tb2Clamp(
      tbState.ball?.x??50,
      tbState.ball?.y??69,
      tb2BoundsForElement(ball,rect)
    );

    tbState.ball.x=safe.x;
    tbState.ball.y=safe.y;

    ball.style.left=safe.x+"%";
    ball.style.top=safe.y+"%";
    ball.classList.toggle("hidden",tbState.ball?.visible===false);
    ball.classList.toggle("selected",tbSelected?.kind==="ball");

    tb2BindDraggable(ball,"ball",null);
  }

  renderTacticalArrows();
  $("tbArrowBtn")?.classList.toggle("active",!!tbArrowMode);
  pitch.classList.toggle("arrow-mode",!!tbArrowMode);
  refreshTacticalBoardPermissions();
}

function tb2PointForArrow(e,rect){
  return {
    x:Math.max(0,Math.min(100,((e.clientX-rect.left)/rect.width)*100)),
    y:Math.max(0,Math.min(100,((e.clientY-rect.top)/rect.height)*100))
  };
}

function nextTbNumber(type){
  const nums=tbState.markers.filter(m=>m.type===type).map(m=>Number(m.n)||0);
  for(let n=1;n<=99;n++)if(!nums.includes(n))return n;
  return nums.length+1;
}

function addTbMarker(type){
  if(!canEditSite())return;
  const n=nextTbNumber(type);
  const count=tbState.markers.filter(m=>m.type===type).length;
  const offset=(count%6)*5;
  const spawn=clampTbStoredPoint(type==="own"?35+offset:65-offset,type==="own"?72:28);
  const m={id:uid(),type,n,label:"",x:spawn.x,y:spawn.y};
  tbState.markers.push(m);tbSelected={kind:"marker",id:m.id};renderTacticalBoard();
}

function newTacticalBoard(){
  if(!canEditSite())return;
  tacticalBoardId=null;
  tbState=defaultTacticalState();
  tbSelected=null;tbArrowMode=false;tbArrowDraft=null;
  if($("tbNameInput"))$("tbNameInput").value="";
  if($("tbCategoryInput"))$("tbCategoryInput").value="Кутові";
  if($("tbDescriptionInput"))$("tbDescriptionInput").value="";
  setTacticalTab("board");
  renderTacticalBoard();
  refreshTacticalBoardPermissions();
}

function setTacticalTab(tab){
  const board=tab==="board";
  $("tbBoardPane")?.classList.toggle("hidden",!board);
  $("tbSavedPane")?.classList.toggle("hidden",board);
  $("tbBoardTab")?.classList.toggle("active",board);
  $("tbSavedTab")?.classList.toggle("active",!board);
  if(!board)renderSavedTacticalBoards();
}

async function loadTacticalBoards(){
  if(!sb)return [];
  const {data,error}=await sb.from("tactical_boards").select("*").order("updated_at",{ascending:false});
  if(error){console.error("Load tactical boards",error);showToast("Не вдалося завантажити тактики");return tacticalBoards;}
  tacticalBoards=data||[];
  renderSavedTacticalBoards();
  return tacticalBoards;
}

function categoryIcon(category){
  if(category==="Кутові")return "◩";
  if(category==="Штрафні")return "◎";
  if(category==="Аути")return "↗";
  if(category==="Пресинг")return "⇈";
  if(category==="Оборона")return "◇";
  if(category==="Атака")return "▲";
  if(category==="Розіграш від воріт")return "▱";
  return "⌁";
}

function renderSavedTacticalBoards(){
  const list=$("tbSavedList");if(!list)return;
  const filter=$("tbSavedFilter")?.value||"ALL";
  const items=tacticalBoards.filter(b=>filter==="ALL"||b.category===filter);
  if(!items.length){
    list.innerHTML=`<div class="empty-state"><strong>ЗБЕРЕЖЕНИХ ТАКТИК НЕМАЄ</strong><span>${canEditSite()?"Створи першу схему на тактичній дошці.":"Редактори команди ще не додали тактики."}</span></div>`;
    return;
  }
  list.innerHTML="";
  items.forEach(b=>{
    const card=document.createElement("button");
    card.type="button";card.className="tb-saved-card";card.dataset.viewerAllowed="true";
    const date=b.updated_at?new Date(b.updated_at).toLocaleDateString("uk-UA"):"";
    card.innerHTML=`
      <span class="tb-saved-icon">${categoryIcon(b.category)}</span>
      <span class="tb-saved-copy">
        <span class="tb-saved-category">${esc(b.category||"Інше")}</span>
        <strong>${esc(b.name||"Без назви")}</strong>
        <small>${esc((b.description||"").slice(0,110) || "Без опису")}</small>
      </span>
      <span class="tb-saved-date">${date}</span>`;
    card.addEventListener("click",()=>openTacticalBoardRecord(b));
    list.appendChild(card);
  });
}

function openTacticalBoardRecord(record){
  tacticalBoardId=record.id;
  tbState=normalizeTacticalState(record.board_state);
  tbSelected=null;tbArrowMode=false;tbArrowDraft=null;
  $("tbNameInput").value=record.name||"";
  $("tbCategoryInput").value=record.category||"Інше";
  $("tbDescriptionInput").value=record.description||"";
  setTacticalTab("board");
  renderTacticalBoard();
  refreshTacticalBoardPermissions();
}

async function saveTacticalBoard(){
  if(!sb||!authUser||!canEditSite()){showToast("Потрібні права редактора");return;}
  const name=$("tbNameInput")?.value.trim();
  if(!name){showToast("Вкажи назву тактики");return;}
  const payload={
    name,
    category:$("tbCategoryInput")?.value||"Інше",
    description:$("tbDescriptionInput")?.value.trim()||"",
    board_state:cloneTacticalState(tbState)
  };
  const btn=$("tbSaveBtn");if(btn)btn.disabled=true;
  try{
    let data,error;
    if(tacticalBoardId){
      ({data,error}=await sb.from("tactical_boards").update(payload).eq("id",tacticalBoardId).select("*").single());
    }else{
      ({data,error}=await sb.from("tactical_boards").insert({...payload,created_by:authUser.id}).select("*").single());
    }
    if(error)throw error;
    tacticalBoardId=data.id;
    await loadTacticalBoards();
    refreshTacticalBoardPermissions();
    showToast("Тактику збережено ✓");
  }catch(err){console.error(err);showToast("Не вдалося зберегти тактику");}
  finally{if(btn)btn.disabled=false;}
}

async function deleteTacticalBoard(){
  if(!sb||!tacticalBoardId||!canEditSite())return;
  if(!confirm("Видалити цю тактику?"))return;
  const {error}=await sb.from("tactical_boards").delete().eq("id",tacticalBoardId);
  if(error){console.error(error);showToast("Не вдалося видалити тактику");return;}
  await loadTacticalBoards();newTacticalBoard();showToast("Тактику видалено");
}

function deleteTbSelected(){
  if(!canEditSite()||!tbSelected)return;
  if(tbSelected.kind==="marker")tbState.markers=tbState.markers.filter(m=>m.id!==tbSelected.id);
  if(tbSelected.kind==="ball")tbState.ball.visible=false;
  tbSelected=null;renderTacticalBoard();
}

function clearTacticalBoard(){
  if(!canEditSite())return;
  if(!confirm("Очистити всі крапки, м'яч і стрілки з дошки?"))return;
  tbState={markers:[],ball:{x:50,y:69,visible:false},arrows:[]};
  tbSelected=null;tbArrowDraft=null;renderTacticalBoard();
}

function openTacticalBoardScreen(){
  loadTacticalBoards();
  if(!tacticalBoardId && !(tbState.markers||[]).length)tbState=defaultTacticalState();
  if(!canEditSite() && tacticalBoards.length===0)setTacticalTab("saved");
  renderTacticalBoard();
  refreshTacticalBoardPermissions();
}

$("openTacticalBoardBtn")?.addEventListener("click",()=>navigate("tactical-board"));
$("backToTacticsBtn")?.addEventListener("click",()=>navigate("tactics"));
$("tbBoardTab")?.addEventListener("click",()=>setTacticalTab("board"));
$("tbSavedTab")?.addEventListener("click",async()=>{await loadTacticalBoards();setTacticalTab("saved")});
$("tbSavedFilter")?.addEventListener("change",renderSavedTacticalBoards);
$("tbNewBtn")?.addEventListener("click",newTacticalBoard);
$("tbAddOwnBtn")?.addEventListener("click",()=>addTbMarker("own"));
$("tbAddOpponentBtn")?.addEventListener("click",()=>addTbMarker("opponent"));
$("tbBallBtn")?.addEventListener("click",()=>{if(!canEditSite())return;tbState.ball.visible=true;tbSelected={kind:"ball",id:null};renderTacticalBoard()});
$("tbArrowBtn")?.addEventListener("click",()=>{if(!canEditSite())return;tbArrowMode=!tbArrowMode;tbSelected=null;renderTacticalBoard();$("tbModeHint").textContent=tbArrowMode?"Режим стрілки: проведи пальцем по полю.":"Перетягуй крапки та м'яч пальцем.";});
$("tbUndoBtn")?.addEventListener("click",()=>{if(!canEditSite())return;if(tbState.arrows.length)tbState.arrows.pop();renderTacticalBoard();});
$("tbDeleteSelectedBtn")?.addEventListener("click",deleteTbSelected);
$("tbClearBtn")?.addEventListener("click",clearTacticalBoard);
$("tbSaveBtn")?.addEventListener("click",saveTacticalBoard);
$("tbDeleteBoardBtn")?.addEventListener("click",deleteTacticalBoard);

/* Tactical Board 2.0 — arrow drawing */
let tb2ArrowGesture=null;

$("tb2Pitch")?.addEventListener("pointerdown",e=>{
  if(!canEditSite() || !tbArrowMode)return;
  if(e.target.closest(".tb2-marker,.tb2-ball"))return;
  if(e.pointerType==="mouse" && e.button!==0)return;

  const pitch=$("tb2Pitch");
  const rect=pitch.getBoundingClientRect();
  if(!rect.width||!rect.height)return;

  e.preventDefault();

  const p=tb2PointForArrow(e,rect);
  tb2ArrowGesture={
    pointerId:e.pointerId,
    rect:{
      left:rect.left,
      top:rect.top,
      width:rect.width,
      height:rect.height
    }
  };

  tbArrowDraft={
    x1:p.x,y1:p.y,
    x2:p.x,y2:p.y,
    pointerId:e.pointerId
  };

  try{pitch.setPointerCapture(e.pointerId)}catch(_e){}
  renderTacticalArrows();
},{passive:false});

$("tb2Pitch")?.addEventListener("pointermove",e=>{
  if(!tbArrowDraft || !tb2ArrowGesture ||
     tb2ArrowGesture.pointerId!==e.pointerId)return;

  e.preventDefault();

  const p=tb2PointForArrow(e,tb2ArrowGesture.rect);
  tbArrowDraft.x2=p.x;
  tbArrowDraft.y2=p.y;
  renderTacticalArrows();
},{passive:false});

const finishTb2Arrow=e=>{
  if(!tbArrowDraft || !tb2ArrowGesture ||
     tb2ArrowGesture.pointerId!==e.pointerId)return;

  e.preventDefault();

  const a=tbArrowDraft;
  tbArrowDraft=null;
  tb2ArrowGesture=null;

  const dist=Math.hypot(a.x2-a.x1,a.y2-a.y1);
  if(dist>3){
    tbState.arrows.push({
      id:uid(),
      x1:a.x1,y1:a.y1,
      x2:a.x2,y2:a.y2
    });
  }

  renderTacticalArrows();
};

$("tb2Pitch")?.addEventListener("pointerup",finishTb2Arrow,{passive:false});
$("tb2Pitch")?.addEventListener("pointercancel",e=>{
  if(tb2ArrowGesture?.pointerId!==e.pointerId)return;
  tbArrowDraft=null;
  tb2ArrowGesture=null;
  renderTacticalArrows();
},{passive:false});



$("closeCalendarDayActionModal")?.addEventListener("click",closeDayActionModal);
document.querySelectorAll("[data-close-calendar-day-action]").forEach(el=>el.addEventListener("click",closeDayActionModal));
$("createMatchFromDayBtn")?.addEventListener("click",()=>{closeDayActionModal();$("calendarMatchModal").classList.remove("hidden");showCalendarMatchEdit(null,calendarSelectedDate);});

$("closeTrainingDayModal")?.addEventListener("click",closeTrainingDayModal);
document.querySelectorAll("[data-close-training-day]").forEach(el=>el.addEventListener("click",closeTrainingDayModal));
$("editTrainingDayBtn")?.addEventListener("click",()=>showTrainingEdit(currentTrainingDay,currentTrainingGathering));
$("deleteTrainingDayBtn")?.addEventListener("click",deleteTrainingDay);
$("saveTrainingDayBtn")?.addEventListener("click",saveTrainingDay);



/* General statistics center — v5.26 */
let generalStatsSlide=0;
let generalStatsMode="official";
generalStatsSort="average";
let generalAwardsMonthCursor=new Date();
const GENERAL_TITLES=["ГРАВЦІ КОМАНДИ","СЕРІЇ","РЕКОРДИ","НАГОРОДИ","ПОРІВНЯННЯ"];

function generalPlayerRows(playerId){
  if(generalStatsMode==="official"){
    return officialMatchStats
      .filter(r=>r.player_id===playerId)
      .map(r=>({...r,event_date:calendarMatches.find(m=>m.id===r.match_id)?.match_date||null,event_id:r.match_id}))
      .sort((a,b)=>String(a.event_date||"").localeCompare(String(b.event_date||"")));
  }
  return trainingStats
    .filter(r=>r.player_id===playerId)
    .map(r=>({...r,event_date:trainingDays.find(d=>d.id===r.training_day_id)?.training_date||null,event_id:r.training_day_id}))
    .sort((a,b)=>String(a.event_date||"").localeCompare(String(b.event_date||"")));
}

function generalEventMvpMap(){
  const source=generalStatsMode==="official"?officialMatchStats:trainingStats;
  const key=generalStatsMode==="official"?"match_id":"training_day_id";
  const grouped={};
  source.forEach(r=>{
    if(r.rating==null)return;
    (grouped[r[key]]??=[]).push(r);
  });
  const result={};
  Object.entries(grouped).forEach(([id,rows])=>{
    const eligibleRows=generalStatsMode==="training"
      ?trainingMvpEligibleRows(trainingDays.find(d=>d.id===id)||{id},rows)
      :rows;
    const max=Math.max(...eligibleRows.map(r=>Number(r.rating)).filter(Number.isFinite),-1);
    result[id]=new Set(eligibleRows.filter(r=>Number(r.rating)===max).map(r=>r.player_id));
  });
  return result;
}

function generalAggregatePlayer(player){
  const rows=generalPlayerRows(player.id);
  const ratings=rows.map(r=>Number(r.rating)).filter(Number.isFinite);
  const mvpMap=generalEventMvpMap();
  const eventKey=generalStatsMode==="official"?"match_id":"training_day_id";
  const eventIds=[...new Set(rows.map(r=>r[eventKey]))];
  const mvp=eventIds.reduce((sum,id)=>sum+(mvpMap[id]?.has(player.id)?1:0),0);

  let matches=eventIds.length;
  if(generalStatsMode==="training"){
    matches=rows.reduce((sum,r)=>{
      const personal=Number(r.matches_played);
      return sum+(Number.isFinite(personal)
        ? personal
        : (Number(trainingDays.find(d=>d.id===r.training_day_id)?.matches_played)||0));
    },0);
  }

  return {
    matches,
    eventCount:eventIds.length,
    goals:rows.reduce((s,r)=>s+(Number(r.goals)||0),0),
    assists:rows.reduce((s,r)=>s+(Number(r.assists)||0),0),
    average:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0,
    best:ratings.length?Math.max(...ratings):0,
    worst:ratings.length?Math.min(...ratings):0,
    mvp,
    form:ratings.slice(-5)
  };
}

function generalStreak(rows,test){
  let current=0,best=0;
  rows.forEach(r=>{
    if(test(r)){current++;best=Math.max(best,current)}
    else current=0;
  });
  let active=0;
  for(let i=rows.length-1;i>=0;i--){
    if(test(rows[i]))active++;
    else break;
  }
  return {active,best};
}

function generalPlayerStreaks(player){
  const rows=generalPlayerRows(player.id);
  const mvpMap=generalEventMvpMap();
  const eventKey=generalStatsMode==="official"?"match_id":"training_day_id";
  return {
    goal:generalStreak(rows,r=>(Number(r.goals)||0)>0),
    assist:generalStreak(rows,r=>(Number(r.assists)||0)>0),
    seven:generalStreak(rows,r=>Number(r.rating)>=7),
    eight:generalStreak(rows,r=>Number(r.rating)>=8),
    mvp:generalStreak(rows,r=>mvpMap[r[eventKey]]?.has(player.id)),
    contribution:generalStreak(rows,r=>(Number(r.goals)||0)>0||(Number(r.assists)||0)>0)
  };
}

function setGeneralStatsSlide(index){
  generalStatsSlide=Math.max(0,Math.min(4,index));
  $("generalStatsTrack").style.transform=`translateX(-${generalStatsSlide*20}%)`;
  $("generalStatsSlideTitle").textContent=GENERAL_TITLES[generalStatsSlide];
  document.querySelectorAll("#generalStatsDots i").forEach((d,i)=>d.classList.toggle("active",i===generalStatsSlide));
  renderGeneralStats();
}

function generalModeEventDate(row){
  if(generalStatsMode==="official")return calendarMatches.find(m=>m.id===row.match_id)?.match_date||null;
  return trainingDays.find(d=>d.id===row.training_day_id)?.training_date||null;
}

function generalTeamMatches(monthDate=null){
  const monthKey=monthDate?generalMonthKey(monthDate):null;
  if(generalStatsMode==="official"){
    const ids=new Set();
    officialMatchStats.forEach(r=>{
      const date=calendarMatches.find(m=>m.id===r.match_id)?.match_date||null;
      if(!date)return;
      if(monthKey && generalMonthKey(new Date(`${date}T12:00:00`))!==monthKey)return;
      ids.add(r.match_id);
    });
    return ids.size;
  }

  const dayIds=new Set();
  trainingStats.forEach(r=>{
    const day=trainingDays.find(d=>d.id===r.training_day_id);
    const date=day?.training_date||null;
    if(!date)return;
    if(monthKey && generalMonthKey(new Date(`${date}T12:00:00`))!==monthKey)return;
    dayIds.add(r.training_day_id);
  });

  return [...dayIds].reduce((sum,id)=>{
    const day=trainingDays.find(d=>d.id===id);
    const declared=Number(day?.matches_played);
    if(Number.isFinite(declared)&&declared>0)return sum+declared;
    const fallback=Math.max(0,...trainingStats.filter(r=>r.training_day_id===id).map(r=>Number(r.matches_played)||0));
    return sum+fallback;
  },0);
}

function generalMinMatches(teamMatches){
  return teamMatches>0?Math.max(1,Math.ceil(teamMatches*.30)):1;
}

function generalAdjustedRating(stats,teamMatches){
  const avg=Number(stats?.average)||0;
  const matches=Number(stats?.matches)||0;
  if(!(avg>0)||!(teamMatches>0)||!(matches>0))return 0;
  const participation=Math.min(1,matches/teamMatches);
  return Math.max(0,avg-(.20*(1-participation)));
}

function renderGeneralPlayers(){
  const teamMatches=generalTeamMatches();
  const minMatches=generalMinMatches(teamMatches);
  const rows=players.map(p=>{
    const stats=generalAggregatePlayer(p);
    return {player:p,stats,eligible:stats.matches>=minMatches,adjusted:generalAdjustedRating(stats,teamMatches)};
  });

  rows.sort((a,b)=>{
    if(generalStatsSort==="average"){
      if(a.eligible!==b.eligible)return a.eligible?-1:1;
      if(a.eligible&&b.eligible)return (b.adjusted-a.adjusted)||(b.stats.average-a.stats.average)||(b.stats.matches-a.stats.matches);
      return (b.stats.average-a.stats.average)||(b.stats.matches-a.stats.matches);
    }
    const diff=(b.stats[generalStatsSort]||0)-(a.stats[generalStatsSort]||0);
    return diff || b.stats.average-a.stats.average;
  });

  $("generalPlayersSummary").textContent=teamMatches
    ?`Гравців: ${players.length} • Матчів: ${teamMatches} • Мін. ${minMatches}`
    :`Гравців: ${players.length}`;

  let ratedPlace=0;
  $("generalPlayersRanking").innerHTML=rows.length?rows.map((x,i)=>{
    const ratingMode=generalStatsSort==="average";
    const hasPlace=!ratingMode||x.eligible;
    const place=hasPlace?(ratingMode?++ratedPlace:i+1):"—";
    const placeClass=typeof place==="number"&&place<=3?`top-${place}`:"";
    const value=ratingMode
      ?(x.eligible&&x.adjusted?x.adjusted.toFixed(2):"—")
      :x.stats[generalStatsSort];
    const detail=ratingMode&&!x.eligible
      ?`Недостатньо матчів • потрібно ${minMatches}`
      :`Ср. ${x.stats.average?x.stats.average.toFixed(2):"—"} • MVP ${x.stats.mvp}`;
    return `<button type="button" class="general-player-full-row ${ratingMode&&!x.eligible?"rating-ineligible":""}" data-general-player="${x.player.id}" data-viewer-allowed="true">
      <span class="general-place ${placeClass}">${place}</span>
      <img src="${x.player.cardImage||PLAYER_PLACEHOLDER}" alt="">
      <span class="general-player-info">
        <strong>${esc(x.player.name)}</strong>
        <small>Матчі ${x.stats.matches} • Голи ${x.stats.goals} • Асисти ${x.stats.assists}</small>
        <small>${detail}</small>
      </span>
      <b>${value}</b>
    </button>`;
  }).join(""):`<div class="empty-state"><strong>СТАТИСТИКИ ЩЕ НЕМАЄ</strong></div>`;

  document.querySelectorAll("[data-general-player]").forEach(btn=>btn.addEventListener("click",()=>{
    closeGeneralStats();
    openPlayerModal(btn.dataset.generalPlayer);
    setTimeout(()=>playerViewSlide(1),80);
  }));
}

function renderGeneralStreaks(){
  const cards=[];
  players.forEach(player=>{
    const s=generalPlayerStreaks(player);
    const active=[
      ["⚽","Гольова серія",s.goal],
      ["🎯","Серія асистів",s.assist],
      ["⭐","Оцінка 7.0+",s.seven],
      ["🔥","Топ-форма 8.0+",s.eight],
      ["🏆","MVP-серія",s.mvp],
      ["🤝","Гол або асист",s.contribution]
    ].filter(x=>x[2].active>=2);
    if(active.length)cards.push({player,active,max:Math.max(...active.map(x=>x[2].active))});
  });
  cards.sort((a,b)=>b.max-a.max);

  $("generalStreaksList").innerHTML=cards.length?cards.map((c,i)=>`
    <div class="general-streak-card ${i===0?"best":""}">
      ${i===0?`<span class="general-best-streak">🔥 НАЙКРАЩА СЕРІЯ</span>`:""}
      <div class="general-streak-player"><img src="${c.player.cardImage||PLAYER_PLACEHOLDER}" alt=""><strong>${esc(c.player.name)}</strong></div>
      ${c.active.map(x=>`<div class="general-streak-line"><span>${x[0]} ${x[1]}</span><b>${x[2].active}</b><small>Рекорд ${x[2].best}</small></div>`).join("")}
    </div>`).join(""):`<div class="empty-state"><strong>АКТИВНИХ СЕРІЙ НЕМАЄ</strong><span>Серія з’являється від 2 подій поспіль.</span></div>`;
}

function recordWinners(items,valueFn){
  if(!items.length)return [];
  const max=Math.max(...items.map(valueFn));
  if(!(max>0))return [];
  return items.filter(x=>valueFn(x)===max);
}

function renderGeneralRecords(){
  const perPlayer=players.map(player=>({player,stats:generalAggregatePlayer(player),streaks:generalPlayerStreaks(player)}));
  const single=[];
  players.forEach(player=>generalPlayerRows(player.id).forEach(row=>single.push({player,row})));

  const specs=[
    [
      "⭐",
      generalStatsMode==="training"?"НАЙВИЩА ОЦІНКА ЗА ЗБІР":"НАЙВИЩА ОЦІНКА",
      single,
      x=>Number(x.row.rating)||0,
      x=>(Number(x.row.rating)||0).toFixed(1)
    ]
  ];

  /* "Найбільше голів за гру" is valid only when one row = one match.
     Official stats have that granularity. Training stats currently store
     one aggregated row per gathering, so using row.goals there would falsely
     show total goals for the whole gathering as a one-game record. */
  if(generalStatsMode==="official"){
    specs.push([
      "⚽","НАЙБІЛЬШЕ ГОЛІВ ЗА ГРУ",
      single,
      x=>Number(x.row.goals)||0,
      x=>`${Number(x.row.goals)||0}`
    ]);
  }

  specs.push(
    ["🔥","НАЙДОВША ГОЛЬОВА СЕРІЯ",perPlayer,x=>x.streaks.goal.best,x=>`${x.streaks.goal.best}`],
    ["🎯","НАЙДОВША СЕРІЯ АСИСТІВ",perPlayer,x=>x.streaks.assist.best,x=>`${x.streaks.assist.best}`],
    ["🤝","НАЙДОВША РЕЗУЛЬТАТИВНА СЕРІЯ",perPlayer,x=>x.streaks.contribution.best,x=>`${x.streaks.contribution.best}`],
    ["⭐","НАЙДОВША СЕРІЯ 8.0+",perPlayer,x=>x.streaks.eight.best,x=>`${x.streaks.eight.best}`],
    ["🏆","НАЙБІЛЬШЕ MVP",perPlayer,x=>x.stats.mvp,x=>`${x.stats.mvp}`],
    ["⚽","НАЙБІЛЬШЕ ГОЛІВ",perPlayer,x=>x.stats.goals,x=>`${x.stats.goals}`],
    ["🎯","НАЙБІЛЬШЕ АСИСТІВ",perPlayer,x=>x.stats.assists,x=>`${x.stats.assists}`],
    ["👑","НАЙВИЩА СЕРЕДНЯ",perPlayer.filter(x=>x.stats.eventCount>=10),x=>x.stats.average,x=>x.stats.average.toFixed(2)]
  );

  const cards=[];
  specs.forEach(([icon,title,items,val,fmt])=>{
    const winners=recordWinners(items,val);
    if(!winners.length)return;
    cards.push(`<div class="general-record-card"><small>${icon} ${title}</small>
      ${winners.map(w=>{
        const p=w.player;
        const date=w.row?.event_date;
        return `<div class="general-record-winner">
          <img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="">
          <span><strong>${esc(p.name)}</strong><b>${fmt(w)}</b>${date?`<em>${formatCalendarDate(date)}</em>`:""}</span>
        </div>`;
      }).join("")}
    </div>`);
  });

  $("generalRecordsList").innerHTML=cards.join("")||`<div class="empty-state"><strong>НЕДОСТАТНЬО ДАНИХ</strong></div>`;
}

function generalMonthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function generalMonthAggregate(player,date){
  const key=generalMonthKey(date);
  const rows=generalPlayerRows(player.id).filter(r=>{
    if(!r.event_date)return false;
    const d=new Date(`${r.event_date}T12:00:00`);
    return generalMonthKey(d)===key;
  });
  const ratings=rows.map(r=>Number(r.rating)).filter(Number.isFinite);
  const mvpMap=generalEventMvpMap();
  const eventKey=generalStatsMode==="official"?"match_id":"training_day_id";
  const eventIds=[...new Set(rows.map(r=>r[eventKey]))];
  let matches=eventIds.length;
  if(generalStatsMode==="training"){
    matches=rows.reduce((sum,r)=>{
      const personal=Number(r.matches_played);
      if(Number.isFinite(personal))return sum+personal;
      return sum+(Number(trainingDays.find(d=>d.id===r.training_day_id)?.matches_played)||0);
    },0);
  }
  return {
    events:eventIds.length,
    matches,
    goals:rows.reduce((s,r)=>s+(Number(r.goals)||0),0),
    assists:rows.reduce((s,r)=>s+(Number(r.assists)||0),0),
    average:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0,
    mvp:eventIds.reduce((s,id)=>s+(mvpMap[id]?.has(player.id)?1:0),0)
  };
}

let generalMonthlyMvpWinners=[];
let generalMonthlyMvpIndex=0;
let generalMonthlyMvpTimer=null;
let generalMonthlyMvpTouchX=null;

function generalAwardMetricPart(value,max,weight){
  return max>0?((Number(value)||0)/max)*weight:0;
}

function generalAwardComposite(x,maxima,weights){
  return ((Number(x.adjusted)||0)/10)*weights.rating
    +generalAwardMetricPart(x.stats.goals,maxima.goals,weights.goals||0)
    +generalAwardMetricPart(x.stats.assists,maxima.assists,weights.assists||0)
    +generalAwardMetricPart(x.stats.mvp,maxima.mvp,weights.mvp||0);
}

function generalPickByScore(arr,scoreFn){
  if(!arr.length)return null;
  return arr.map(x=>({...x,awardScore:scoreFn(x)}))
    .sort((a,b)=>b.awardScore-a.awardScore||b.adjusted-a.adjusted||b.stats.matches-a.stats.matches)[0];
}

function generalPickCountingAward(arr,key){
  if(!arr.length)return null;
  const sorted=arr.slice().sort((a,b)=>(b.stats[key]||0)-(a.stats[key]||0)||(a.stats.matches||0)-(b.stats.matches||0)||(b.adjusted||0)-(a.adjusted||0));
  return (sorted[0]?.stats[key]||0)>0?sorted[0]:null;
}

function paintGeneralMonthlyMvp(){
  const card=document.querySelector("[data-monthly-mvp-card]");
  if(!card||!generalMonthlyMvpWinners.length)return;
  generalMonthlyMvpIndex=((generalMonthlyMvpIndex%generalMonthlyMvpWinners.length)+generalMonthlyMvpWinners.length)%generalMonthlyMvpWinners.length;
  const x=generalMonthlyMvpWinners[generalMonthlyMvpIndex];
  const img=card.querySelector("img"),name=card.querySelector("strong"),value=card.querySelector("b"),counter=card.querySelector(".general-award-counter"),dots=card.querySelector(".general-award-dots");
  if(img)img.src=x.player.cardImage||PLAYER_PLACEHOLDER;
  if(name)name.textContent=x.player.name||"Гравець";
  if(value)value.textContent=`${x.stats.mvp} MVP`;
  if(counter)counter.textContent=generalMonthlyMvpWinners.length>1?`${generalMonthlyMvpIndex+1}/${generalMonthlyMvpWinners.length}`:"";
  if(dots)dots.innerHTML=generalMonthlyMvpWinners.length>1?generalMonthlyMvpWinners.map((_,i)=>`<i class="${i===generalMonthlyMvpIndex?"active":""}"></i>`).join(""):"";
}

function restartGeneralMonthlyMvp(){
  clearInterval(generalMonthlyMvpTimer);
  if(generalMonthlyMvpWinners.length>1){
    generalMonthlyMvpTimer=setInterval(()=>{
      generalMonthlyMvpIndex=(generalMonthlyMvpIndex+1)%generalMonthlyMvpWinners.length;
      paintGeneralMonthlyMvp();
    },5000);
  }
}

function bindGeneralMonthlyMvp(){
  const card=document.querySelector("[data-monthly-mvp-card]");
  if(!card)return;
  card.addEventListener("touchstart",e=>{generalMonthlyMvpTouchX=e.changedTouches?.[0]?.clientX??null;},{passive:true});
  card.addEventListener("touchend",e=>{
    if(generalMonthlyMvpTouchX===null||generalMonthlyMvpWinners.length<2)return;
    const x=e.changedTouches?.[0]?.clientX??generalMonthlyMvpTouchX;
    const dx=x-generalMonthlyMvpTouchX;
    generalMonthlyMvpTouchX=null;
    if(Math.abs(dx)<35)return;
    generalMonthlyMvpIndex=(generalMonthlyMvpIndex+(dx<0?1:-1)+generalMonthlyMvpWinners.length)%generalMonthlyMvpWinners.length;
    paintGeneralMonthlyMvp();
    restartGeneralMonthlyMvp();
  },{passive:true});
}

function renderGeneralAwards(){
  const now=new Date();
  $("generalAwardsMonth").textContent=generalAwardsMonthCursor.toLocaleDateString("uk-UA",{month:"long",year:"numeric"}).toUpperCase();
  const current=generalMonthKey(now)===generalMonthKey(generalAwardsMonthCursor);

  const teamMatches=generalTeamMatches(generalAwardsMonthCursor);
  const minMatches=generalMinMatches(teamMatches);
  $("generalAwardsState").textContent=teamMatches
    ?`${current?"ПОТОЧНІ ЛІДЕРИ":"ФІНАЛЬНІ НАГОРОДИ"} • МІНІМУМ ${minMatches} МАТЧІВ`
    :(current?"ПОТОЧНІ ЛІДЕРИ":"ФІНАЛЬНІ НАГОРОДИ");

  const data=players.map(player=>{
    const stats=generalMonthAggregate(player,generalAwardsMonthCursor);
    return {player,stats,adjusted:generalAdjustedRating(stats,teamMatches)};
  }).filter(x=>x.stats.events>0||x.stats.matches>0);
  const eligible=data.filter(x=>x.stats.matches>=minMatches);

  const maxima={
    goals:Math.max(0,...eligible.map(x=>x.stats.goals||0)),
    assists:Math.max(0,...eligible.map(x=>x.stats.assists||0)),
    mvp:Math.max(0,...eligible.map(x=>x.stats.mvp||0))
  };

  const playerOfMonth=generalPickByScore(eligible,x=>generalAwardComposite(x,maxima,{rating:60,goals:15,assists:15,mvp:10}));
  const scorer=generalPickCountingAward(eligible,"goals");
  const assistant=generalPickCountingAward(eligible,"assists");

  const defenders=eligible.filter(x=>["LB","CB","RB"].includes(String(x.player.primaryPos||"").toUpperCase()));
  const defenderMaxima={
    goals:Math.max(0,...defenders.map(x=>x.stats.goals||0)),
    assists:Math.max(0,...defenders.map(x=>x.stats.assists||0)),
    mvp:Math.max(0,...defenders.map(x=>x.stats.mvp||0))
  };
  const defenderOfMonth=generalPickByScore(defenders,x=>generalAwardComposite(x,defenderMaxima,{rating:75,goals:5,assists:5,mvp:15}));

  const goalkeepers=eligible.filter(x=>String(x.player.primaryPos||"").toUpperCase()==="GK");
  const goalkeeperMaxima={goals:0,assists:0,mvp:Math.max(0,...goalkeepers.map(x=>x.stats.mvp||0))};
  const goalkeeperOfMonth=generalPickByScore(goalkeepers,x=>generalAwardComposite(x,goalkeeperMaxima,{rating:90,mvp:10}));

  const maxMvp=Math.max(0,...eligible.map(x=>x.stats.mvp||0));
  generalMonthlyMvpWinners=maxMvp>0?eligible.filter(x=>(x.stats.mvp||0)===maxMvp):[];
  generalMonthlyMvpIndex=0;
  clearInterval(generalMonthlyMvpTimer);

  const card=(icon,title,x,value,main=false)=>x?`<div class="general-award-card ${main?"main":""}">
      <small>${icon} ${title}</small>
      <img src="${x.player.cardImage||PLAYER_PLACEHOLDER}" alt="">
      <strong>${esc(x.player.name)}</strong>
      <b>${value}</b>
    </div>`:"";

  const awardCards=[];
  if(playerOfMonth)awardCards.push(card("👑","ГРАВЕЦЬ МІСЯЦЯ",playerOfMonth,playerOfMonth.adjusted.toFixed(2),true));
  if(scorer)awardCards.push(card("⚽","БОМБАРДИР",scorer,`${scorer.stats.goals}`));
  if(assistant)awardCards.push(card("🎯","АСИСТЕНТ",assistant,`${assistant.stats.assists}`));
  if(defenderOfMonth)awardCards.push(card("🛡️","ЗАХИСНИК МІСЯЦЯ",defenderOfMonth,defenderOfMonth.adjusted.toFixed(2)));
  if(goalkeeperOfMonth)awardCards.push(card("🧤","ВОРОТАР МІСЯЦЯ",goalkeeperOfMonth,goalkeeperOfMonth.adjusted.toFixed(2)));
  if(generalMonthlyMvpWinners.length){
    const first=generalMonthlyMvpWinners[0];
    awardCards.push(`<div class="general-award-card general-monthly-mvp-card" data-monthly-mvp-card>
      <small>🏆 MVP МІСЯЦЯ <em class="general-award-counter"></em></small>
      <img src="${first.player.cardImage||PLAYER_PLACEHOLDER}" alt="">
      <strong>${esc(first.player.name)}</strong>
      <b>${first.stats.mvp} MVP</b>
      <span class="general-award-dots"></span>
    </div>`);
  }

  $("generalAwardsList").innerHTML=data.length
    ?(awardCards.join("")||`<div class="empty-state"><strong>НЕМАЄ ГРАВЦІВ, ЯКІ ЗІГРАЛИ 30% МАТЧІВ</strong><span>Потрібно мінімум ${minMatches} матчів.</span></div>`)
    :`<div class="empty-state"><strong>У ЦЬОМУ МІСЯЦІ СТАТИСТИКИ НЕМАЄ</strong></div>`;

  if(generalMonthlyMvpWinners.length){paintGeneralMonthlyMvp();bindGeneralMonthlyMvp();restartGeneralMonthlyMvp();}
  $("generalAwardsNext").disabled=generalMonthKey(generalAwardsMonthCursor)>=generalMonthKey(now);
}


/* ==========================================================
   v7.54 — automatic monthly awards + reigning Player of Month
   ========================================================== */
let autoMonthlyAwardsRunningV754=false;

function awardModeLabelV754(mode){
  return mode==="official"?"Офіційні матчі":"Тренування";
}

function awardMonthLastDateV754(monthDate){
  const last=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0);
  return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,"0")}-${String(last.getDate()).padStart(2,"0")}`;
}

function awardMonthLabelV754(dateString){
  if(!dateString)return "";
  const d=new Date(`${dateString}T12:00:00`);
  return d.toLocaleDateString("uk-UA",{month:"long",year:"numeric"}).toUpperCase();
}

function syncCurrentPlayerOfMonthV754(){
  const rows=(playerAwardsV589||[])
    .filter(a=>String(a.title||"").trim().toLowerCase()==="гравець місяця" && a.player_id && a.award_date)
    .slice()
    .sort((a,b)=>String(b.award_date).localeCompare(String(a.award_date))||String(b.created_at||"").localeCompare(String(a.created_at||"")));

  let chosen=null;
  if(rows.length){
    const newestDate=rows[0].award_date;
    const newest=rows.filter(a=>a.award_date===newestDate);
    /* When both modes eventually exist, the training title is the visual
       reigning card by default because that is the team's continuous monthly
       competition. If there is no training award, use the official one. */
    chosen=newest.find(a=>String(a.note||"").startsWith("Тренування"))||newest[0];
  }

  const next={
    playerId:chosen?.player_id||null,
    awardDate:chosen?.award_date||null,
    monthLabel:chosen?.award_date?awardMonthLabelV754(chosen.award_date):""
  };
  const changed=next.playerId!==currentPlayerOfMonthV754.playerId || next.awardDate!==currentPlayerOfMonthV754.awardDate;
  currentPlayerOfMonthV754=next;
  if(changed){
    try{renderPlayers();}catch(_e){}
  }
}

function calculateMonthlyAwardsV754(monthDate,mode){
  const previousMode=generalStatsMode;
  generalStatsMode=mode;
  try{
    const teamMatches=generalTeamMatches(monthDate);
    const minMatches=generalMinMatches(teamMatches);
    if(!teamMatches)return {teamMatches,minMatches,awards:[]};

    const data=players.map(player=>{
      const stats=generalMonthAggregate(player,monthDate);
      return {player,stats,adjusted:generalAdjustedRating(stats,teamMatches)};
    }).filter(x=>x.stats.events>0||x.stats.matches>0);
    const eligible=data.filter(x=>x.stats.matches>=minMatches);
    if(!eligible.length)return {teamMatches,minMatches,awards:[]};

    const maxima={
      goals:Math.max(0,...eligible.map(x=>x.stats.goals||0)),
      assists:Math.max(0,...eligible.map(x=>x.stats.assists||0)),
      mvp:Math.max(0,...eligible.map(x=>x.stats.mvp||0))
    };
    const playerOfMonth=generalPickByScore(eligible,x=>generalAwardComposite(x,maxima,{rating:60,goals:15,assists:15,mvp:10}));
    const scorer=generalPickCountingAward(eligible,"goals");
    const assistant=generalPickCountingAward(eligible,"assists");

    const defenders=eligible.filter(x=>["LB","CB","RB"].includes(String(x.player.primaryPos||"").toUpperCase()));
    const defenderMaxima={
      goals:Math.max(0,...defenders.map(x=>x.stats.goals||0)),
      assists:Math.max(0,...defenders.map(x=>x.stats.assists||0)),
      mvp:Math.max(0,...defenders.map(x=>x.stats.mvp||0))
    };
    const defenderOfMonth=generalPickByScore(defenders,x=>generalAwardComposite(x,defenderMaxima,{rating:75,goals:5,assists:5,mvp:15}));

    const goalkeepers=eligible.filter(x=>String(x.player.primaryPos||"").toUpperCase()==="GK");
    const goalkeeperMaxima={goals:0,assists:0,mvp:Math.max(0,...goalkeepers.map(x=>x.stats.mvp||0))};
    const goalkeeperOfMonth=generalPickByScore(goalkeepers,x=>generalAwardComposite(x,goalkeeperMaxima,{rating:90,mvp:10}));

    const maxMvp=Math.max(0,...eligible.map(x=>x.stats.mvp||0));
    const mvpWinners=maxMvp>0?eligible.filter(x=>(x.stats.mvp||0)===maxMvp):[];
    const modeLabel=awardModeLabelV754(mode);
    const awards=[];
    const push=(x,title,icon,note)=>{if(x?.player?.id)awards.push({player_id:x.player.id,title,icon,note});};

    push(playerOfMonth,"Гравець місяця","👑",`${modeLabel} • ${Number(playerOfMonth?.awardScore||0).toFixed(1)} бала`);
    push(scorer,"Бомбардир місяця","⚽",`${modeLabel} • ${scorer?.stats?.goals||0} голів`);
    push(assistant,"Асистент місяця","🎯",`${modeLabel} • ${assistant?.stats?.assists||0} асистів`);
    push(defenderOfMonth,"Захисник місяця","🛡️",`${modeLabel} • ${Number(defenderOfMonth?.awardScore||0).toFixed(1)} бала`);
    push(goalkeeperOfMonth,"Воротар місяця","🧤",`${modeLabel} • ${Number(goalkeeperOfMonth?.awardScore||0).toFixed(1)} бала`);
    mvpWinners.forEach(x=>push(x,"MVP місяця","🏆",`${modeLabel} • ${x.stats.mvp||0} MVP`));

    return {teamMatches,minMatches,awards};
  }finally{
    generalStatsMode=previousMode;
  }
}

function completedAwardMonthsV754(){
  const now=new Date();
  const currentKey=generalMonthKey(now);
  const found=new Map();

  trainingDays.forEach(d=>{
    if(!d?.training_date)return;
    const date=new Date(`${d.training_date}T12:00:00`);
    const key=generalMonthKey(date);
    if(key<currentKey)found.set(`training:${key}`,{mode:"training",date:new Date(date.getFullYear(),date.getMonth(),1)});
  });
  calendarMatches.forEach(m=>{
    if(!m?.match_date)return;
    const date=new Date(`${m.match_date}T12:00:00`);
    const key=generalMonthKey(date);
    if(key<currentKey)found.set(`official:${key}`,{mode:"official",date:new Date(date.getFullYear(),date.getMonth(),1)});
  });
  return [...found.values()].sort((a,b)=>a.date-b.date||a.mode.localeCompare(b.mode));
}

async function autoIssueCompletedMonthlyAwardsV754(){
  if(autoMonthlyAwardsRunningV754||!sb||!authUser||!["admin","editor"].includes(authRole))return;
  autoMonthlyAwardsRunningV754=true;
  try{
    /* Official award calculations need match dates. They are not always loaded
       on the Home screen, so fetch them only when official player stats exist. */
    if(officialMatchStats.length && !calendarMatches.length){
      const {data,error}=await sb.from("calendar_matches").select("*").order("match_date",{ascending:true});
      if(!error)calendarMatches=data||[];
    }

    const months=completedAwardMonthsV754();
    if(!months.length){syncCurrentPlayerOfMonthV754();return;}

    const {data:existing,error:existingError}=await sb.from("player_awards")
      .select("id,player_id,title,award_date,note,icon,created_by,created_at");
    if(existingError){console.warn("v7.54 award duplicate check",existingError);return;}
    const known=existing||[];
    const inserts=[];

    months.forEach(({mode,date})=>{
      const calculated=calculateMonthlyAwardsV754(date,mode);
      if(!calculated.awards.length)return;
      const awardDate=awardMonthLastDateV754(date);
      const modeLabel=awardModeLabelV754(mode);
      calculated.awards.forEach(a=>{
        const exists=known.some(x=>
          x.player_id===a.player_id &&
          String(x.title||"").trim().toLowerCase()===String(a.title||"").trim().toLowerCase() &&
          x.award_date===awardDate &&
          String(x.note||"").startsWith(modeLabel)
        );
        if(exists)return;
        inserts.push({...a,award_date:awardDate,created_by:authUser.id});
      });
    });

    if(inserts.length){
      const {data,error}=await sb.from("player_awards").insert(inserts).select("*");
      if(error){console.warn("v7.54 automatic awards insert",error);return;}
      const fresh=data||[];
      playerAwardsV589=[...known,...fresh];
      syncCurrentPlayerOfMonthV754();
      showToast(`Автоматично видано нагород: ${fresh.length}`);
      try{if(typeof renderPlayerAccountSettingsV589==="function")renderPlayerAccountSettingsV589();}catch(_e){}
    }else{
      playerAwardsV589=known;
      syncCurrentPlayerOfMonthV754();
    }
  }finally{
    autoMonthlyAwardsRunningV754=false;
  }
}

function fillGeneralCompare(){
  const selects=[$("generalCompareA"),$("generalCompareB")];
  selects.forEach((select,i)=>{
    const current=select.value;
    select.innerHTML=players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    if(players.some(p=>p.id===current))select.value=current;
    else if(players[i])select.value=players[i].id;
  });
}

function generalCompareRow(label,a,b,decimals=false){
  return `<div class="general-compare-row"><b class="${a>b?"win":""}">${decimals?a.toFixed(2):a}</b><span>${label}</span><b class="${b>a?"win":""}">${decimals?b.toFixed(2):b}</b></div>`;
}

function renderGeneralCompare(){
  const aPlayer=players.find(p=>p.id===$("generalCompareA").value)||players[0];
  const bPlayer=players.find(p=>p.id===$("generalCompareB").value)||players[1];
  if(!aPlayer||!bPlayer){
    $("generalCompareContent").innerHTML=`<div class="empty-state"><strong>ПОТРІБНО ДВА ГРАВЦІ</strong></div>`;
    return;
  }

  const A=generalAggregatePlayer(aPlayer), B=generalAggregatePlayer(bPlayer);
  const rows=[
    ["МАТЧІ",A.matches,B.matches,false],
    ["ГОЛИ",A.goals,B.goals,false],
    ["АСИСТИ",A.assists,B.assists,false],
    [generalStatsMode==="training"?"СЕРЕДНЯ ОЦІНКА ЗА ЗБІР":"СЕРЕДНЯ ОЦІНКА",A.average,B.average,true],
    [generalStatsMode==="training"?"НАЙКРАЩА ОЦІНКА ЗА ЗБІР":"НАЙКРАЩА ОЦІНКА",A.best,B.best,true],
    [generalStatsMode==="training"?"НАЙГІРША ОЦІНКА ЗА ЗБІР":"НАЙГІРША ОЦІНКА",A.worst,B.worst,true],
    ["MVP",A.mvp,B.mvp,false]
  ];

  let aWins=0,bWins=0;
  rows.forEach(r=>{if(r[1]>r[2])aWins++;else if(r[2]>r[1])bWins++;});

  $("generalCompareContent").innerHTML=`
    <div class="general-compare-hero">
      <div><img src="${aPlayer.cardImage||PLAYER_PLACEHOLDER}" alt=""><strong>${esc(aPlayer.name)}</strong></div>
      <b>VS</b>
      <div><img src="${bPlayer.cardImage||PLAYER_PLACEHOLDER}" alt=""><strong>${esc(bPlayer.name)}</strong></div>
    </div>
    <div class="general-compare-table">${rows.map(r=>generalCompareRow(...r)).join("")}</div>
    <div class="general-compare-form">
      <span>${A.form.map(x=>x.toFixed(1)).join(" • ")||"—"}</span>
      <small>${generalStatsMode==="training"?"ФОРМА ОСТАННІХ 5 ЗБОРІВ":"ФОРМА ОСТАННІХ 5 МАТЧІВ"}</small>
      <span>${B.form.map(x=>x.toFixed(1)).join(" • ")||"—"}</span>
    </div>
    <div class="general-compare-score"><small>ПЕРЕВАГА ЗА ПОКАЗНИКАМИ</small><strong>${esc(aPlayer.name)} ${aWins} : ${bWins} ${esc(bPlayer.name)}</strong></div>`;
}

function renderGeneralStats(){
  document.querySelectorAll("[data-general-mode]").forEach(btn=>btn.classList.toggle("active",btn.dataset.generalMode===generalStatsMode));
  if(generalStatsSlide===0)renderGeneralPlayers();
  if(generalStatsSlide===1)renderGeneralStreaks();
  if(generalStatsSlide===2)renderGeneralRecords();
  if(generalStatsSlide===3)renderGeneralAwards();
  if(generalStatsSlide===4){fillGeneralCompare();renderGeneralCompare();}
}

function openGeneralStats(){
  $("generalStatsModal")?.classList.remove("hidden");
  generalAwardsMonthCursor=new Date();
  setGeneralStatsSlide(0);
}
function closeGeneralStats(){$("generalStatsModal")?.classList.add("hidden");}

$("openGeneralStatsBtn")?.addEventListener("click",openGeneralStats);
$("closeGeneralStatsModal")?.addEventListener("click",closeGeneralStats);
document.querySelectorAll("[data-close-general-stats]").forEach(el=>el.addEventListener("click",closeGeneralStats));

document.querySelectorAll("[data-general-mode]").forEach(btn=>btn.addEventListener("click",()=>{
  generalStatsMode=btn.dataset.generalMode;
  renderGeneralStats();
}));
document.querySelectorAll("[data-general-sort]").forEach(btn=>btn.addEventListener("click",()=>{
  generalStatsSort=btn.dataset.generalSort;
  document.querySelectorAll("[data-general-sort]").forEach(b=>b.classList.toggle("active",b===btn));
  renderGeneralPlayers();
}));

$("generalAwardsPrev")?.addEventListener("click",()=>{
  generalAwardsMonthCursor=new Date(generalAwardsMonthCursor.getFullYear(),generalAwardsMonthCursor.getMonth()-1,1);
  renderGeneralAwards();
});
$("generalAwardsNext")?.addEventListener("click",()=>{
  const next=new Date(generalAwardsMonthCursor.getFullYear(),generalAwardsMonthCursor.getMonth()+1,1);
  if(generalMonthKey(next)<=generalMonthKey(new Date())){
    generalAwardsMonthCursor=next;
    renderGeneralAwards();
  }
});
$("generalCompareA")?.addEventListener("change",renderGeneralCompare);
$("generalCompareB")?.addEventListener("change",renderGeneralCompare);

let generalStatsTouchX=null;
$("generalStatsViewport")?.addEventListener("touchstart",e=>{
  generalStatsTouchX=e.touches?.[0]?.clientX??null;
},{passive:true});
$("generalStatsViewport")?.addEventListener("touchend",e=>{
  if(generalStatsTouchX==null)return;
  const x=e.changedTouches?.[0]?.clientX??generalStatsTouchX;
  const dx=x-generalStatsTouchX;
  generalStatsTouchX=null;
  if(Math.abs(dx)>45)setGeneralStatsSlide(generalStatsSlide+(dx<0?1:-1));
},{passive:true});


/* Theme */
const SITE_THEME_KEY="centuria_theme";

function applySiteTheme(theme){
  if(typeof window.setCenturiaTheme==="function"){
    window.setCenturiaTheme(theme);
    return;
  }
  const value=theme==="light"?"light":"dark";
  document.documentElement.dataset.siteTheme=value;
  document.documentElement.classList.toggle("light-theme",value==="light");
  document.documentElement.classList.toggle("dark-theme",value==="dark");
}

function initSiteTheme(){
  let value="dark";
  try{value=localStorage.getItem(SITE_THEME_KEY)||"dark"}catch(_e){}
  applySiteTheme(value);
}

$("themeDarkBtn")?.addEventListener("click",()=>applySiteTheme("dark"));
$("themeLightBtn")?.addEventListener("click",()=>applySiteTheme("light"));


/* Supabase Auth */
const authModal=$("authModal");
const authStatus=$("authStatus");
let authRecoveryMode=false;

function setAuthModalMode(mode="login"){
  const recovery=mode==="recovery";
  authRecoveryMode=recovery;

  $("authLoginPanel")?.classList.toggle("hidden",recovery);
  $("authRecoveryPanel")?.classList.toggle("hidden",!recovery);

  if($("authTitle")){
    $("authTitle").textContent=recovery ? "НОВИЙ ПАРОЛЬ" : "ВХІД";
  }
  if($("authNote")){
    $("authNote").textContent=recovery
      ? "Введи новий пароль для свого акаунта Centuria Athletics."
      : "Увійди у свій акаунт або створи новий акаунт учасника Centuria Athletics.";
  }
}

function closeAuthModal(){
  authModal?.classList.add("hidden");
  document.body.classList.remove("auth-open");
  if(authStatus) authStatus.textContent="";
}

function openPasswordRecoveryModal(){
  setAuthModalMode("recovery");
  authModal?.classList.remove("hidden");
  document.body.classList.add("auth-open");
  if(authStatus)authStatus.textContent="";
  setTimeout(()=>$("authNewPassword")?.focus(),60);
}

async function openAuthModal(){
  /* If the user opened a password-recovery link and closed the modal,
     opening Account again must return to NEW PASSWORD, not offer logout. */
  if(authRecoveryMode){
    openPasswordRecoveryModal();
    return;
  }

  if(authUser){
    const ok=confirm(`Вийти з акаунта ${authUser.email}?`);
    if(ok && sb){
      if(voiceRecorder && voiceRecorder.state==="recording")stopVoiceRecording();
      cleanupVoiceStream();
      await stopChatPresence();
      await sb.auth.signOut();
      await refreshAuth();
    }
    return;
  }

  setAuthModalMode("login");
  authModal?.classList.remove("hidden");
  document.body.classList.add("auth-open");
  setTimeout(()=>$("authEmail")?.focus(),50);
}

$("authBtn")?.addEventListener("click",openAuthModal);
$("closeAuthModal")?.addEventListener("click",closeAuthModal);
document.querySelectorAll("[data-close-auth]").forEach(el=>el.addEventListener("click",closeAuthModal));

$("forgotPasswordBtn")?.addEventListener("click",async()=>{
  if(!sb)return;

  const email=$("authEmail")?.value.trim();
  if(!email){
    authStatus.textContent="Спочатку введи email свого акаунта.";
    $("authEmail")?.focus();
    return;
  }

  authStatus.textContent="Надсилаю лист для скидання пароля...";

  /* v8.05:
     Password recovery from the test build must always return to the
     dedicated test site, never to the production Site URL. */
  const redirectUrl="https://centuria-tests.vercel.app/?password_recovery=1";

  const {error}=await sb.auth.resetPasswordForEmail(email,{
    redirectTo:redirectUrl
  });

  if(error){
    console.error("Password reset email error",error);
    authStatus.textContent="Не вдалося надіслати лист: "+error.message;
    return;
  }

  /* Generic success text avoids revealing whether an email is registered. */
  authStatus.textContent="Якщо цей email зареєстрований, на нього надіслано лист для скидання пароля.";
});

$("saveNewPasswordBtn")?.addEventListener("click",async()=>{
  if(!sb)return;

  const password=$("authNewPassword")?.value||"";
  const confirmPassword=$("authNewPasswordConfirm")?.value||"";

  if(password.length<6){
    authStatus.textContent="Новий пароль має містити мінімум 6 символів.";
    return;
  }
  if(password!==confirmPassword){
    authStatus.textContent="Паролі не співпадають.";
    return;
  }

  authStatus.textContent="Зберігаю новий пароль...";

  const {error}=await sb.auth.updateUser({password});
  if(error){
    console.error("Password update error",error);
    authStatus.textContent="Не вдалося змінити пароль: "+error.message;
    return;
  }

  authRecoveryMode=false;
  $("authNewPassword").value="";
  $("authNewPasswordConfirm").value="";

  /* Remove recovery markers/tokens from the visible URL after success. */
  try{
    const clean=new URL(location.href);
    clean.searchParams.delete("password_recovery");
    clean.hash="";
    history.replaceState(null,"",clean.pathname+clean.search);
  }catch(_e){}

  await refreshAuth();
  authStatus.textContent="Пароль змінено ✓";
  setTimeout(()=>{
    setAuthModalMode("login");
    closeAuthModal();
  },700);
});

$("signInBtn")?.addEventListener("click",async()=>{
  if(!sb)return;
  const email=$("authEmail")?.value.trim();
  const password=$("authPassword")?.value||"";
  if(!email||!password){
    authStatus.textContent="Введи email і пароль.";
    return;
  }
  authStatus.textContent="Вхід...";
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){
    authStatus.textContent=error.message;
    return;
  }
  await refreshAuth();
  authStatus.textContent="Вхід виконано.";
  setTimeout(closeAuthModal,350);
});

$("signUpBtn")?.addEventListener("click",async()=>{
  if(!sb)return;
  const email=$("authEmail")?.value.trim();
  const password=$("authPassword")?.value||"";
  const nick=$("authNick")?.value.trim();
  if(!nick || nick.length<2){
    authStatus.textContent="Введи нік мінімум 2 символи.";
    return;
  }
  if(!email||password.length<6){
    authStatus.textContent="Введи email і пароль мінімум 6 символів.";
    return;
  }
  authStatus.textContent="Створення акаунта...";
  const {data,error}=await sb.auth.signUp({
    email,
    password,
    options:{data:{display_name:nick}}
  });
  if(error){
    authStatus.textContent=error.message;
    return;
  }
  if(data?.session){
    await refreshAuth();
    authStatus.textContent="Акаунт створено. Очікуй підтвердження ADMIN.";
    setTimeout(closeAuthModal,350);
  }else{
    authStatus.textContent="Акаунт створено. Підтвердь пошту, потім ADMIN має дозволити доступ.";
  }
});

if(sb){
  sb.auth.onAuthStateChange((event)=>{
    /* Supabase emits PASSWORD_RECOVERY after a valid recovery email link.
       Open the new-password form in the SAME auth modal. */
    if(event==="PASSWORD_RECOVERY"){
      setTimeout(()=>openPasswordRecoveryModal(),0);
    }
    if(event==="SIGNED_OUT"){
      authRecoveryMode=false;
      setAuthModalMode("login");
    }

    /* Avoid doing additional Supabase calls synchronously inside
       onAuthStateChange. */
    setTimeout(()=>refreshAuth().catch(console.error),0);
  });

  sb.channel("centuria-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"players"},async()=>{
      players=await getAll("players");
      renderPlayers();
      renderPitch();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"saved_lineups"},async()=>{
      squads=await getAll("squads");
      renderSquads();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"tactical_boards"},async()=>{
      await loadTacticalBoards();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"calendar_matches"},async()=>{
      await loadCalendarData();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"training_days"},async()=>{await loadStatisticsData();})
    .on("postgres_changes",{event:"*",schema:"public",table:"training_player_stats"},async()=>{await loadStatisticsData();})
    .on("postgres_changes",{event:"*",schema:"public",table:"official_match_player_stats"},async()=>{await loadStatisticsData();})
    .on("postgres_changes",{event:"*",schema:"public",table:"player_awards"},async()=>{
      if(typeof loadPlayerAccountSystemV589==="function")await loadPlayerAccountSystemV589();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"gatherings"},async()=>{
      if($("screen-calendar")?.classList.contains("active"))await loadCalendarData();
    })
    .subscribe();
}

(async function(){
  try{
    initSiteTheme();
    setupFormOptions();
    await openDB();
    // v6.63: service-worker readiness can take seconds on iOS/PWA.
    // Do not block the first Home data paint behind it.
    const pushWorkerPromise=registerPushServiceWorker();
    await refreshAuth();

    /* Fallback for browsers where the PASSWORD_RECOVERY event fires before
       the page listener is ready. The reset email points back with this flag. */
    const recoveryFlag=new URLSearchParams(location.search).get("password_recovery")==="1";
    const recoveryHash=location.hash.includes("type=recovery");
    if(recoveryFlag || recoveryHash){
      openPasswordRecoveryModal();
      if(!authUser && authStatus){
        authStatus.textContent="Відкрий це посилання саме з листа для скидання пароля.";
      }
    }

    await pushWorkerPromise;
    const openTarget=new URLSearchParams(location.search).get("open");
    if(["players","tactics","squads","chat","gatherings"].includes(openTarget)){
      navigate(openTarget);
    }
  }catch(err){
    console.error(err);
    showToast("Помилка запуску сайту. Перезавантаж сторінку.");
  }
})();

/* CENTURIA_PERMISSION_GUARD */
document.addEventListener("click",e=>{
  if(canEditSite()) return;
  const button=e.target.closest("button");
  if(!button) return;
  if(button.dataset.viewerAllowed==="true") return;
  const text=(button.textContent||"").toUpperCase();
  const protectedWords=["ДОДАТИ","РЕДАГУВАТИ","ВИДАЛИТИ","ЗБЕРЕГТИ","ПЕРЕЙМЕНУВАТИ","ОЧИСТИТИ"];
  if(protectedWords.some(word=>text.includes(word))){
    e.preventDefault();
    e.stopImmediatePropagation();
    if(typeof showToast==="function") showToast("Потрібні права редактора");
  }
},true);

/* AUTH_ESCAPE_CLOSE */
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && authModal && !authModal.classList.contains("hidden")){
    closeAuthModal();
  }
  if(e.key==="Escape" && $("profileModal") && !$("profileModal").classList.contains("hidden")){
    closeProfileModal();
  }
  if(e.key==="Escape" && $("gatheringModal") && !$("gatheringModal").classList.contains("hidden")){
    closeGatheringModal();
  }
  if(e.key==="Escape" && $("calendarMatchModal") && !$("calendarMatchModal").classList.contains("hidden")){
    closeCalendarMatchModal();
  }
});


/* v5.28 — resilient theme fallback */
document.addEventListener("click",e=>{
  const btn=e.target.closest?.("[data-theme-value]");
  if(!btn)return;
  applySiteTheme(btn.dataset.themeValue);
});


/* v5.34 — Home VIP is always visible in both themes */
function renderHomeVip(){
  const card=document.getElementById("homeMvpCard");
  if(!card)return;

  const img=document.getElementById("homeMvpPhoto");
  const name=document.getElementById("homeMvpName");
  const rating=document.getElementById("homeMvpRating");

  // Default visible state even when there is no statistics yet.
  card.classList.remove("hidden");
  if(name) name.textContent="MVP ДНЯ";
  if(rating) rating.textContent="—";
  if(img){
    img.src=(typeof PLAYER_PLACEHOLDER!=="undefined"&&PLAYER_PLACEHOLDER)?PLAYER_PLACEHOLDER:"player-placeholder.png";
    img.alt="MVP дня";
  }

  try{
    const events=[];

    // Training statistics
    if(Array.isArray(trainingDays)&&Array.isArray(trainingStats)){
      trainingDays.forEach(day=>{
        const rows=trainingStats.filter(r=>r.training_day_id===day.id && Number.isFinite(Number(r.rating)));
        if(!rows.length)return;
        const max=Math.max(...rows.map(r=>Number(r.rating)));
        const winner=rows.find(r=>Number(r.rating)===max);
        if(winner) events.push({
          date:day.training_date||day.date||"",
          rating:max,
          playerId:winner.player_id,
          type:"training"
        });
      });
    }

    // Official match statistics
    if(Array.isArray(calendarMatches)&&Array.isArray(officialMatchStats)){
      calendarMatches.forEach(match=>{
        const rows=officialMatchStats.filter(r=>r.match_id===match.id && Number.isFinite(Number(r.rating)));
        if(!rows.length)return;
        const max=Math.max(...rows.map(r=>Number(r.rating)));
        const winner=rows.find(r=>Number(r.rating)===max);
        if(winner) events.push({
          date:match.match_date||match.date||"",
          rating:max,
          playerId:winner.player_id,
          type:"official"
        });
      });
    }

    events.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    const latest=events[0];
    if(!latest)return;

    const player=Array.isArray(players)?players.find(p=>p.id===latest.playerId):null;
    if(!player)return;

    if(name) name.textContent=player.name||"MVP ДНЯ";
    if(rating) rating.textContent=Number(latest.rating).toFixed(1);
    if(img){
      img.src=player.cardImage||player.card_image||
        ((typeof PLAYER_PLACEHOLDER!=="undefined"&&PLAYER_PLACEHOLDER)?PLAYER_PLACEHOLDER:"player-placeholder.png");
      img.alt=player.name||"MVP дня";
    }

    card.dataset.eventType=latest.type;
    card.dataset.eventDate=latest.date||"";
  }catch(err){
    console.warn("Home VIP render failed",err);
  }
}

document.addEventListener("DOMContentLoaded",()=>setTimeout(renderHomeVip,160));
window.addEventListener("load",()=>setTimeout(renderHomeVip,160));
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)setTimeout(renderHomeVip,100);
});
window.addEventListener("centuria-theme-change",()=>setTimeout(renderHomeVip,50));
/* v5.33 — dedicated home background for light theme */
function applyHomeBackgroundForTheme(theme){
  const img=document.getElementById("homeBackgroundImage");
  if(!img)return;
  const isLight=theme==="light";
  const wanted=isLight?"home-screen-light-v666.jpg":"home-screen-clean.jpg";
  if(!img.src.endsWith(wanted)) img.src=wanted;
  img.dataset.themeBackground=isLight?"light-v666":"dark-clean";
}

window.addEventListener("centuria-theme-change",e=>{
  applyHomeBackgroundForTheme(e.detail?.theme||"dark");
});

document.addEventListener("DOMContentLoaded",()=>{
  let theme=document.documentElement.getAttribute("data-site-theme")||"dark";
  applyHomeBackgroundForTheme(theme);
});

window.addEventListener("load",()=>{
  let theme=document.documentElement.getAttribute("data-site-theme")||"dark";
  applyHomeBackgroundForTheme(theme);
});

/* v5.37 — safe home refresh without changing page geometry */
window.addEventListener("centuria-theme-change",()=>{
  setTimeout(()=>{
    try{ if(typeof renderHomeVip==="function") renderHomeVip(); }catch(_e){}
  },60);
});

/* v5.38 — fix player profile average / best / worst ratings */
function fixPlayerProfileRatingLabels(){
  try{
    const modal=document.getElementById("profileModal")||document.getElementById("playerModal");
    if(!modal || modal.classList.contains("hidden"))return;

    const pid=modal.dataset.playerId ||
      (typeof selectedPlayerId!=="undefined"?selectedPlayerId:null) ||
      (typeof activePlayerId!=="undefined"?activePlayerId:null);
    if(!pid)return;

    function calc(rows){
      const vals=rows.map(r=>Number(r.rating)).filter(Number.isFinite);
      return {
        average:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,
        best:vals.length?Math.max(...vals):null,
        worst:vals.length?Math.min(...vals):null
      };
    }

    const official=calc(Array.isArray(officialMatchStats)?officialMatchStats.filter(r=>r.player_id===pid):[]);
    const training=calc(Array.isArray(trainingStats)?trainingStats.filter(r=>r.player_id===pid):[]);

    const sections=[...modal.querySelectorAll(".player-stats-column, .player-stats-columns section")];
    function setStat(section,label,value){
      if(!section)return;
      const line=[...section.querySelectorAll(".stat-line")].find(el=>(el.textContent||"").toUpperCase().includes(label));
      const b=line?.querySelector("b");
      if(b)b.textContent=value==null?"—":value.toFixed(1);
    }

    if(sections.length>=2){
      setStat(sections[0],"СЕРЕДНЯ",official.average);
      setStat(sections[0],"НАЙКРАЩА",official.best);
      setStat(sections[0],"НАЙГІРША",official.worst);
      setStat(sections[1],"СЕРЕДНЯ",training.average);
      setStat(sections[1],"НАЙКРАЩА",training.best);
      setStat(sections[1],"НАЙГІРША",training.worst);
    }
  }catch(e){console.warn("Profile rating fix",e);}
}
document.addEventListener("click",e=>{
  if(e.target.closest?.(".player-card,.player-view-tab,[data-player-id]")){
    setTimeout(fixPlayerProfileRatingLabels,120);
  }
});

/* v5.41 — tag remaining dynamically rendered gathering controls */
function markGatheringLightTargets(){
  try{
    const root=document.getElementById("screen-gatherings");
    if(!root)return;
    const els=[...root.querySelectorAll("button,div,span")];
    els.forEach(el=>{
      const t=(el.textContent||"").trim().replace(/\s+/g," ");
      if(!t)return;
      if(/^(АКТИВНІ|ІСТОРІЯ)$/i.test(t)) el.classList.add("g541-light-control");
      if(/^(ЗАКРИТИ|×)$/i.test(t)) el.classList.add("g541-light-control");
      if(/^\d+\s*(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ)$/i.test(t) && el.children.length<=2)
        el.classList.add("g541-light-counter");
      if(/^volkovson$/i.test(t)) el.classList.add("g541-light-pill");
    });
  }catch(e){}
}
document.addEventListener("click",()=>setTimeout(markGatheringLightTargets,80));
document.addEventListener("DOMContentLoaded",()=>setTimeout(markGatheringLightTargets,150));

/* v5.42 — exact dynamic targeting for remaining gathering controls */
function fixGatheringsLightDom(){
  try{
    const root=document.getElementById("screen-gatherings");
    if(!root)return;

    const all=[...root.querySelectorAll("button,div,span")];

    // close / x
    all.forEach(el=>{
      const t=(el.textContent||"").trim().replace(/\s+/g," ");
      if((t==="ЗАКРИТИ"||t==="×") && (el.tagName==="BUTTON" || el.children.length===0)){
        el.classList.add("g542-light-action");
      }
    });

    // Find compact boxes that consist of number + one attendance label.
    all.forEach(el=>{
      const t=(el.textContent||"").trim().replace(/\s+/g," ").toUpperCase();
      if(/^\d+\s*(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ)$/.test(t) && el.children.length<=3){
        el.classList.add("g542-light-counter");
      }
    });

    // Nickname chips in the three bottom voter columns.
    root.querySelectorAll("span,div").forEach(el=>{
      const t=(el.textContent||"").trim();
      if(!t || el.children.length>0)return;
      const parentText=(el.parentElement?.parentElement?.textContent||"").toUpperCase();
      if(parentText.includes("БУДУ")||parentText.includes("ПІД ПИТАННЯМ")||parentText.includes("НЕ БУДУ")){
        if(!/^(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ|—)$/i.test(t) && t.length<40){
          el.classList.add("g542-light-chip");
        }
      }
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(fixGatheringsLightDom,150));
document.addEventListener("click",()=>setTimeout(fixGatheringsLightDom,100));

/* v5.43 — exact cleanup after gatherings render */
function gatheringV543Cleanup(){
  try{
    const root=document.getElementById("screen-gatherings");
    if(!root)return;
    root.querySelectorAll(".gathering-vote-names,.gathering-voters,.gathering-voter-group,.gathering-voter-title")
      .forEach(el=>{
        el.classList.remove("g541-light-control","g541-light-counter","g542-light-counter","g542-light-chip");
      });
    root.querySelectorAll(".gathering-voter-group").forEach(group=>{
      [...group.querySelectorAll("span,div")].forEach(el=>{
        const t=(el.textContent||"").trim();
        if(t && el.children.length===0 && !/^(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ|—)$/i.test(t)){
          if(t.length<50) el.classList.add("g543-voter-nick");
        }
      });
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(gatheringV543Cleanup,180));
document.addEventListener("click",()=>setTimeout(gatheringV543Cleanup,120));

/* v5.44 — identify only dark nickname pills in the lower voter lists */
function gatheringV544NickPills(){
  try{
    const root=document.getElementById("screen-gatherings");
    if(!root)return;
    const ignore=/^(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ|—)$/i;
    root.querySelectorAll(".gathering-card span,.gathering-card div").forEach(el=>{
      const text=(el.textContent||"").trim();
      if(!text || el.children.length!==0 || ignore.test(text) || text.length>=50)return;
      const cs=getComputedStyle(el);
      const nums=(cs.backgroundColor||"").match(/\d+/g);
      if(!nums || nums.length<3)return;
      const r=+nums[0],g=+nums[1],b=+nums[2];
      if(r<65 && g<65 && b<65 && parseFloat(cs.borderRadius)>5){
        el.classList.add("v544-voter-nick");
      }
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(gatheringV544NickPills,220));
document.addEventListener("click",()=>setTimeout(gatheringV544NickPills,140));

/* v5.45 — persist light voter pills after every gathering rerender */
(function(){
  function applyGatheringVoterPills(){
    try{
      const root=document.getElementById("screen-gatherings");
      if(!root)return;

      const isLight=
        document.documentElement.dataset.siteTheme==="light" ||
        document.documentElement.classList.contains("light-theme") ||
        document.body?.dataset.siteTheme==="light" ||
        document.body?.classList.contains("light-theme");

      if(!isLight)return;

      const ignore=/^(БУДУ|ПІД ПИТАННЯМ|НЕ БУДУ|—)$/i;

      root.querySelectorAll(".gathering-voter-group").forEach(group=>{
        group.querySelectorAll("span,div").forEach(el=>{
          const text=(el.textContent||"").trim();
          if(!text || el.children.length!==0 || ignore.test(text) || text.length>=50)return;

          const cs=getComputedStyle(el);
          const nums=(cs.backgroundColor||"").match(/\d+/g);
          const darkBg=nums && nums.length>=3 && (+nums[0]<80 && +nums[1]<80 && +nums[2]<80);
          const pillLike=parseFloat(cs.borderRadius)>5 || cs.display==="inline-flex" || cs.display==="inline-block";

          if(darkBg || pillLike){
            el.classList.add("v545-voter-pill");
          }
        });
      });
    }catch(e){}
  }

  window.applyGatheringVoterPills=applyGatheringVoterPills;

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(applyGatheringVoterPills,200);

    const root=document.getElementById("screen-gatherings");
    if(!root)return;

    const observer=new MutationObserver(()=>{
      requestAnimationFrame(()=>applyGatheringVoterPills());
    });

    observer.observe(root,{
      childList:true,
      subtree:true,
      characterData:true
    });
  });

  document.addEventListener("click",()=>{
    setTimeout(applyGatheringVoterPills,80);
    setTimeout(applyGatheringVoterPills,250);
  });

  window.addEventListener("centuria-theme-change",()=>{
    setTimeout(applyGatheringVoterPills,80);
  });
})();

/* v5.47 — persistent light styling for dynamically rendered Chat participants */
(function(){
  function paintChatParticipantsLight(){
    try{
      const root=document.getElementById("screen-chat");
      if(!root)return;
      const isLight=
        document.documentElement.dataset.siteTheme==="light" ||
        document.documentElement.classList.contains("light-theme") ||
        document.body?.dataset.siteTheme==="light" ||
        document.body?.classList.contains("light-theme");
      if(!isLight)return;

      const textHints=["УЧАСНИКИ КОМАНДИ","Зареєстровано:"];
      root.querySelectorAll("section,div").forEach(el=>{
        const t=(el.textContent||"").trim();
        if(!t || t.length>2500)return;
        if(textHints.some(h=>t.includes(h))){
          const cs=getComputedStyle(el);
          const nums=(cs.backgroundColor||"").match(/\d+/g);
          if(nums && nums.length>=3 && +nums[0]<140 && +nums[1]<140 && +nums[2]<140){
            el.classList.add("v547-chat-light-panel");
          }
        }
      });

      root.querySelectorAll(".v547-chat-light-panel").forEach(panel=>{
        panel.querySelectorAll("div,span,strong,b").forEach(el=>{
          const t=(el.textContent||"").trim();
          if(!t || el.children.length!==0)return;
          if(/^(ОНЛАЙН|ОФЛАЙН|ADMIN|EDITOR)$/i.test(t))return;
          el.classList.add("v547-chat-dark-text");
        });
      });
    }catch(e){}
  }

  window.paintChatParticipantsLight=paintChatParticipantsLight;
  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(paintChatParticipantsLight,220);
    const root=document.getElementById("screen-chat");
    if(root){
      new MutationObserver(()=>requestAnimationFrame(paintChatParticipantsLight))
        .observe(root,{childList:true,subtree:true,characterData:true});
    }
  });
  document.addEventListener("click",()=>{
    setTimeout(paintChatParticipantsLight,80);
    setTimeout(paintChatParticipantsLight,250);
  });
})();

/* v5.48 — keep light chat bubbles after dynamic rerenders */
(function(){
  function applyLightChatBubbles(){
    try{
      const root=document.getElementById("screen-chat");
      if(!root)return;
      const isLight=
        document.documentElement.dataset.siteTheme==="light" ||
        document.documentElement.classList.contains("light-theme") ||
        document.body?.dataset.siteTheme==="light" ||
        document.body?.classList.contains("light-theme");
      if(!isLight)return;

      root.querySelectorAll(".chat-message,.message-bubble").forEach(el=>{
        el.classList.add("v548-light-bubble");
      });
    }catch(e){}
  }

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(applyLightChatBubbles,180);
    const root=document.getElementById("screen-chat");
    if(root){
      new MutationObserver(()=>requestAnimationFrame(applyLightChatBubbles))
        .observe(root,{childList:true,subtree:true});
    }
  });

  document.addEventListener("click",()=>setTimeout(applyLightChatBubbles,100));
  window.addEventListener("centuria-theme-change",()=>setTimeout(applyLightChatBubbles,80));
})();

/* v5.54 — mark participants count badge in light theme */
function markChatParticipantsCount(){
  try{
    const root=document.getElementById("screen-chat");
    if(!root)return;
    const tabs=[...root.querySelectorAll(".chat-tab")];
    const participants=tabs.find(el=>(el.textContent||"").toUpperCase().includes("УЧАСНИКИ"));
    if(!participants)return;
    [...participants.querySelectorAll("span,b,strong,div")].forEach(el=>{
      const t=(el.textContent||"").trim();
      if(/^\d+$/.test(t) && el.children.length===0){
        el.classList.add("v554-members-count");
      }
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(markChatParticipantsCount,160));
document.addEventListener("click",()=>setTimeout(markChatParticipantsCount,80));



/* v5.63 — mark dynamically rendered saved-squad UI in light theme */
function markSavedSquadLightUI(){
  try{
    const isLight =
      document.documentElement.dataset.siteTheme==="light" ||
      document.documentElement.classList.contains("light-theme") ||
      document.body?.dataset.siteTheme==="light" ||
      document.body?.classList.contains("light-theme");
    if(!isLight)return;

    document.querySelectorAll("article,section,div").forEach(el=>{
      const t=(el.textContent||"").trim().replace(/\s+/g," ");
      if(!t || t.length>1200)return;

      if(t.includes("СХЕМА:") && t.includes("СТВОРЕНО:") && !el.closest(".pitch")){
        el.classList.add("v563-saved-light");
      }

      if(t.includes("ЗБЕРЕГТИ PNG") && t.includes("НАЗАД") && !el.closest(".pitch")){
        el.classList.add("v563-saved-modal-light");
      }
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(markSavedSquadLightUI,180));
document.addEventListener("click",()=>setTimeout(markSavedSquadLightUI,120));

/* v5.64 — exact light styling tags for saved squad preview */
function markSavedSquadV564(){
  try{
    const isLight =
      document.documentElement.dataset.siteTheme==="light" ||
      document.documentElement.classList.contains("light-theme") ||
      document.body?.dataset.siteTheme==="light" ||
      document.body?.classList.contains("light-theme");
    if(!isLight)return;

    // Saved list card
    document.querySelectorAll(".squad-info").forEach(el=>el.classList.add("v564-squad-card-light"));
    document.querySelectorAll(".squad-menu").forEach(el=>el.classList.add("v564-squad-menu-light"));

    // Open preview: identify by buttons and scheme/title text
    [...document.querySelectorAll("div,section,article")].forEach(el=>{
      const t=(el.textContent||"").replace(/\s+/g," ").trim();
      if(!t || t.length>3000)return;
      if(t.includes("ЗБЕРЕГТИ PNG") && t.includes("НАЗАД") && t.includes("СХЕМА:")){
        el.classList.add("v564-saved-preview-shell");
        // Tag dark descendants around pitch but do not tag .pitch
        el.querySelectorAll("div,section,article").forEach(ch=>{
          if(ch.classList.contains("pitch") || ch.closest(".pitch"))return;
          const cs=getComputedStyle(ch);
          const nums=(cs.backgroundColor||"").match(/\d+/g);
          if(nums && nums.length>=3 && +nums[0]<45 && +nums[1]<45 && +nums[2]<45){
            ch.classList.add("v564-light-dark-panel");
          }
        });
      }
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(markSavedSquadV564,220));
document.addEventListener("click",()=>setTimeout(markSavedSquadV564,140));

/* v5.64 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  ["siteVersion","appVersion","versionText"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.textContent="5.64";
  });
  document.querySelectorAll(".site-version,.app-version,.version-value").forEach(el=>{
    el.textContent="5.64";
  });
});

/* v5.65 — always show current site version in Settings */
document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector(".settings-version strong");
  if(el)el.textContent="v5.65";
});

/* v5.66 — current settings version */
document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector(".settings-version strong");
  if(el)el.textContent="v5.66";
});

/* v5.67 — current settings version */
document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector(".settings-version strong");
  if(el)el.textContent="v5.67";
});

/* v5.68 — mark gathering answer buttons by their visible labels */
function markGatheringAnswerColors(){
  try{
    const root=document.getElementById("screen-gatherings");
    if(!root)return;
    root.querySelectorAll("button,div").forEach(el=>{
      const t=(el.textContent||"").trim().replace(/\s+/g," ").toLowerCase();
      if(el.children.length>5)return;
      if(t==="✓ буду" || t==="буду") el.classList.add("v568-vote-yes");
      if(t==="? під питанням" || t==="під питанням") el.classList.add("v568-vote-maybe");
      if(t==="× не буду" || t==="не буду") el.classList.add("v568-vote-no");
    });
  }catch(e){}
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(markGatheringAnswerColors,180));
document.addEventListener("click",()=>setTimeout(markGatheringAnswerColors,100));

/* v5.68 — current settings version */
document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector(".settings-version strong");
  if(el)el.textContent="v5.68";
});

/* v5.69 — current settings version */
document.addEventListener("DOMContentLoaded",()=>{
  const el=document.querySelector(".settings-version strong");
  if(el)el.textContent="v5.69";
});

/* v5.70 settings version */
document.addEventListener("DOMContentLoaded",()=>document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.70"));

/* v5.71 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.71");
});

/* v5.72 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.72");
});

/* v5.73 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.73");
});

/* v5.74 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.74");
});

/* v5.75 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.75");
});

/* ==========================================================
   v5.76 — Fullscreen image viewer
   ========================================================== */
(function(){
  const viewer=()=>document.getElementById("fullscreenImageViewer");
  const target=()=>document.getElementById("fullscreenImageTarget");

  function openFullscreenImage(src){
    if(!src)return;
    const v=viewer(), img=target();
    if(!v||!img)return;
    img.src=src;
    v.classList.remove("hidden");
    v.setAttribute("aria-hidden","false");
    document.documentElement.style.overflow="hidden";
    document.body.style.overflow="hidden";
  }

  function closeFullscreenImage(){
    const v=viewer(), img=target();
    if(!v||!img)return;
    v.classList.add("hidden");
    v.setAttribute("aria-hidden","true");
    img.removeAttribute("src");
    document.documentElement.style.overflow="";
    document.body.style.overflow="";
  }

  window.openFullscreenImage=openFullscreenImage;
  window.closeFullscreenImage=closeFullscreenImage;

  document.addEventListener("click",function(e){
    const close=e.target.closest && e.target.closest("#fullscreenImageClose");
    if(close){ e.preventDefault(); closeFullscreenImage(); return; }

    const v=e.target.closest && e.target.closest("#fullscreenImageViewer");
    if(v && e.target.id==="fullscreenImageViewer"){ closeFullscreenImage(); return; }

    const img=e.target.closest && e.target.closest("img");
    if(!img)return;

    /* v5.81: saved squads are handled by openSavedImage, never generic fullscreen. */
    if(img.closest?.("#screen-squads,.squad-row,.squad-card,.saved-squad-card,.saved-lineup-card,.squad-thumb")){
      return;
    }

    /* The saved lineup preview has its own player-card hit testing.
       Do not force fullscreen before that handler gets the click. */
    if(img.id==="savedImageView" && typeof savedSquadPlayerAtPoint==="function"){
      const p=savedSquadPlayerAtPoint(currentSavedImage,img,e.clientX,e.clientY);
      if(p)return;
    }

    /* Chat images */
    const inChat=img.closest(
      ".chat-message,.chat-message-main,.chat-card,.message,.chat-attachment,.chat-image-wrap"
    );

    /* Saved squad thumbnails use their OWN viewer (openSavedImage).
       Do not let the generic image viewer intercept those clicks. */
    const inSaved=img.closest(
      "#screen-squads,.squad-row,.squad-card,.saved-squad-card,.saved-lineup-card,.saved-squad-preview,.saved-lineup-preview"
    );
    if(inSaved)return;

    if(inChat){
      /* Avoid tiny avatars/icons in chat; open only actual message images or larger images */
      const rect=img.getBoundingClientRect();
      const likelyPhoto = inSaved || rect.width>=120 || rect.height>=120 ||
        img.classList.contains("chat-image") ||
        img.closest(".chat-attachment");

      if(likelyPhoto){
        e.preventDefault();
        e.stopPropagation();
        openFullscreenImage(img.currentSrc || img.src);
      }
    }
  },true);

  document.addEventListener("keydown",function(e){
    if(e.key==="Escape")closeFullscreenImage();
  });

  /* Close by tapping dark area around the image */
  document.addEventListener("click",function(e){
    if(e.target && e.target.classList && e.target.classList.contains("fullscreen-image-stage")){
      closeFullscreenImage();
    }
  });
})();

/* v5.76 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.76");
});

/* ==========================================================
   v5.77 — Open player details from HOME MVP and saved squad cards
   ========================================================== */
(function(){
  function norm(v){ return String(v||"").trim().toLowerCase(); }

  function findPlayerByLooseHint(hint){
    hint=norm(hint);
    if(!hint || !Array.isArray(window.players || players)) return null;
    const list=(window.players || players);
    return list.find(p=>{
      const candidates=[
        p.id,p.name,p.nick,p.nickname,p.eaId,p.ea_id
      ].map(norm).filter(Boolean);
      return candidates.some(v=>v===hint || hint.includes(v) || v.includes(hint));
    })||null;
  }

  function playerFromElement(el){
    if(!el)return null;

    // Strong hints from data attributes.
    const dataHints=[
      el.dataset?.playerId,
      el.dataset?.player,
      el.dataset?.nick,
      el.dataset?.nickname
    ];
    for(const h of dataHints){
      const p=findPlayerByLooseHint(h);
      if(p)return p;
    }

    // Walk up a little and inspect nearby data/text.
    let node=el;
    for(let i=0;i<5 && node;i++,node=node.parentElement){
      const hints=[
        node.dataset?.playerId,
        node.dataset?.player,
        node.dataset?.nick,
        node.dataset?.nickname
      ];
      for(const h of hints){
        const p=findPlayerByLooseHint(h);
        if(p)return p;
      }

      const txt=(node.textContent||"").replace(/\s+/g," ").trim();
      if(txt && txt.length<220){
        const p=findPlayerByLooseHint(txt);
        if(p)return p;
      }

      const img=node.querySelector?.("img");
      if(img){
        const src=(img.getAttribute("src")||"").split("/").pop()||"";
        const alt=img.getAttribute("alt")||"";
        for(const h of [alt,src.replace(/\.[^.]+$/,"")]){
          const p=findPlayerByLooseHint(h);
          if(p)return p;
        }
      }
    }
    return null;
  }

  function openPlayerDetailsFromAnywhere(p){
    if(!p)return false;

    /* This site's actual player details function. */
    try{
      if(typeof openPlayerModal==="function"){ openPlayerModal(p.id); return true; }
    }catch(e){}

    // Preferred existing site handlers.
    if(typeof window.showPlayer==="function"){ window.showPlayer(p.id); return true; }
    if(typeof window.openPlayer==="function"){ window.openPlayer(p.id); return true; }
    if(typeof window.openPlayerView==="function"){ window.openPlayerView(p.id); return true; }
    if(typeof window.showPlayerDetails==="function"){ window.showPlayerDetails(p.id); return true; }

    // Common internal functions that may not be exported to window.
    try{
      if(typeof showPlayer==="function"){ showPlayer(p.id); return true; }
    }catch(e){}
    try{
      if(typeof openPlayer==="function"){ openPlayer(p.id); return true; }
    }catch(e){}
    try{
      if(typeof openPlayerView==="function"){ openPlayerView(p.id); return true; }
    }catch(e){}
    try{
      if(typeof showPlayerDetails==="function"){ showPlayerDetails(p.id); return true; }
    }catch(e){}

    return false;
  }

  document.addEventListener("click",function(e){
    /* HOME MVP: clicking the visible player/photo/card opens player details. */
    const homeMvp=e.target.closest && e.target.closest("#homeMvpCard");
    if(homeMvp){
      const p=playerFromElement(homeMvp);
      if(p && openPlayerDetailsFromAnywhere(p)){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    /* Saved squad preview: only player cards/portraits, not empty slots or pitch. */
    const savedCard=e.target.closest && e.target.closest(
      ".saved-squad-preview .slot-card.filled,"+
      ".saved-lineup-preview .slot-card.filled,"+
      ".v564-saved-preview-shell .slot-card.filled,"+
      ".saved-squad-preview [data-player-id],"+
      ".saved-lineup-preview [data-player-id],"+
      ".v564-saved-preview-shell [data-player-id]"
    );

    if(savedCard){
      const p=playerFromElement(savedCard);
      if(p && openPlayerDetailsFromAnywhere(p)){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
  },true);
})();

/* v5.77 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.77");
});

/* v5.78 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.78");
});

/* v5.79 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.79");
});

/* v5.80 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.80");
});

/* v5.81 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.81");
});

/* v5.83 — keep saved-squads screen theme class synchronized immediately */
function syncSquadsThemeV583(){
  const s=document.getElementById("screen-squads");
  if(!s)return;
  const light=
    document.documentElement.dataset.siteTheme==="light" ||
    document.documentElement.classList.contains("light-theme");
  s.classList.toggle("squads-light-now",light);
  s.classList.toggle("squads-dark-now",!light);
}
document.addEventListener("DOMContentLoaded",syncSquadsThemeV583);
window.addEventListener("centuria-theme-change",syncSquadsThemeV583);
document.addEventListener("click",e=>{
  if(e.target.closest?.("[data-nav='squads']")) syncSquadsThemeV583();
});

/* v5.83 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.83");
});

/* v5.84 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.84");
});

/* v5.85 — keep tactics picker synced with current theme */
window.addEventListener("centuria-theme-change",()=>{
  const picker=document.getElementById("pickerDialog");
  if(!picker)return;
  const light=
    document.documentElement.dataset.siteTheme==="light" ||
    document.documentElement.classList.contains("light-theme");
  picker.classList.toggle("picker-light",light);
  picker.classList.toggle("picker-dark",!light);
});

/* v5.85 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.85");
});

/* v5.86 — MVP visibility must not depend on light/dark theme */
function syncHomeMvpV586(){
  const selectors=[
    ".home-mvp",".mvp-home",".mvp-card",
    "#mvpHome","#homeMvp","#homeMVP","#homeMvpCard","#dailyMvp","#dailyMVP"
  ];
  document.querySelectorAll(selectors.join(",")).forEach(el=>{
    /* Respect genuine no-MVP state represented by hidden attribute.
       Otherwise theme is never allowed to conceal the card. */
    if(!el.hasAttribute("hidden")){
      el.style.visibility="visible";
      el.style.opacity="1";
    }
  });
}
document.addEventListener("DOMContentLoaded",syncHomeMvpV586);
window.addEventListener("centuria-theme-change",()=>requestAnimationFrame(syncHomeMvpV586));
document.addEventListener("click",e=>{
  if(e.target.closest?.("[data-theme],[data-site-theme],.theme-option,.theme-toggle")){
    requestAnimationFrame(syncHomeMvpV586);
  }
});

/* v5.86 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.86");
});

/* v5.87 — refresh actual MVP DATA in both themes, not only the card shell */
async function refreshHomeMvpV587(){
  try{
    if(typeof loadLatestMvp==="function"){
      await loadLatestMvp();
    }else if(typeof renderHomeVip==="function"){
      renderHomeVip();
    }
  }catch(e){
    console.warn("v5.87 MVP refresh",e);
    try{ if(typeof renderHomeVip==="function") renderHomeVip(); }catch(_e){}
  }
}

window.addEventListener("centuria-theme-change",()=>{
  setTimeout(refreshHomeMvpV587,80);
  setTimeout(refreshHomeMvpV587,300);
});

document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(refreshHomeMvpV587,450);
});

window.addEventListener("load",()=>{
  setTimeout(refreshHomeMvpV587,250);
});

/* When HOME becomes active again, refresh from the loaded statistics. */
document.addEventListener("click",e=>{
  if(e.target.closest?.("[data-nav='home']")){
    setTimeout(refreshHomeMvpV587,100);
  }
});

/* v5.87 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.87");
});

/* ==========================================================
   v5.89 — Visible account↔player system, approvals, awards
   ========================================================== */
let accountProfilesV589=[];
let playerChangeRequestsV589=[];
let playerAwardsV589=[];
let currentAwardsPlayerIdV589=null;

function isAdminV589(){ return authRole==="admin"; }
function linkedPlayerForProfileV589(profile){
  return profile?.player_id ? players.find(p=>p.id===profile.player_id)||null : null;
}
function myLinkedPlayerV589(){ return linkedPlayerForProfileV589(authProfile); }

async function loadPlayerAccountSystemV589(){
  if(!sb||!authUser){
    accountProfilesV589=[];playerChangeRequestsV589=[];playerAwardsV589=[];
    renderPlayerAccountSettingsV589();return;
  }

  const profileQuery=sb.from("profiles").select("user_id,display_name,avatar_url,role,player_id,access_status,created_at").order("display_name",{ascending:true});
  const awardsQuery=sb.from("player_awards").select("*").order("award_date",{ascending:false});
  const tasks=[profileQuery,awardsQuery];

  if(isAdminV589() || authRole==="editor"){
    tasks.push(sb.from("player_change_requests").select("*").order("created_at",{ascending:false}));
  }else{
    tasks.push(sb.from("player_change_requests").select("*").eq("user_id",authUser.id).order("created_at",{ascending:false}));
  }

  const [pr,aw,rq]=await Promise.all(tasks);
  if(!pr.error)accountProfilesV589=pr.data||[];
  if(!aw.error)playerAwardsV589=aw.data||[];
  if(!rq.error)playerChangeRequestsV589=rq.data||[];
  if(typeof syncCurrentPlayerOfMonthV754==="function")syncCurrentPlayerOfMonthV754();
  renderPlayerAccountSettingsV589();

  // Keep chat profiles in sync with linked player IDs.
  if(accountProfilesV589.length){
    teamProfiles=new Map(accountProfilesV589.map(p=>[p.user_id,p]));
    if($("membersList"))renderMembersList();
  }
}

function setSiteAccessPanelV662(open,{scroll=false}={}){
  const panel=$("adminSiteAccessCard");
  const btn=$("settingsAccessJumpBtn");
  if(!panel)return;
  const canOpen=!!open && isAdminV589();
  panel.dataset.expanded=canOpen?"true":"false";
  panel.classList.toggle("hidden",!canOpen);
  panel.hidden=!canOpen;
  panel.setAttribute("aria-hidden",canOpen?"false":"true");
  if(btn){
    btn.setAttribute("aria-expanded",canOpen?"true":"false");
    btn.classList.toggle("is-expanded",canOpen);
    const arrow=btn.querySelector("i");
    if(arrow)arrow.textContent=canOpen?"⌄":"›";
  }
  if(canOpen && scroll){
    requestAnimationFrame(()=>panel.scrollIntoView({behavior:"smooth",block:"start"}));
  }
}

function setPlayerLinksPanelV661(open,{scroll=false}={}){
  const panel=$("adminPlayerLinksCard");
  const btn=$("settingsPlayerLinksBtn");
  if(!panel)return;
  const canOpen=!!open && isAdminV589();
  panel.dataset.expanded=canOpen?"true":"false";
  panel.classList.toggle("hidden",!canOpen);
  panel.hidden=!canOpen;
  panel.setAttribute("aria-hidden",canOpen?"false":"true");
  if(btn){
    btn.setAttribute("aria-expanded",canOpen?"true":"false");
    btn.classList.toggle("is-expanded",canOpen);
    const arrow=btn.querySelector("i");
    if(arrow)arrow.textContent=canOpen?"⌄":"›";
  }
  if(canOpen && scroll){
    requestAnimationFrame(()=>panel.scrollIntoView({behavior:"smooth",block:"start"}));
  }
}

function renderPlayerAccountSettingsV589(){
  const mine=$("myPlayerSettingsCard");
  const links=$("adminPlayerLinksCard");
  const requests=$("playerRequestsSettingsCard");
  if(mine)mine.classList.toggle("hidden",!authUser);
  if(links)setPlayerLinksPanelV661(links.dataset.expanded==="true");
  if(requests)requests.classList.toggle("hidden",!(isAdminV589()||authRole==="editor"));

  const myStatus=$("myPlayerLinkStatus");
  if(myStatus && authUser){
    const p=myLinkedPlayerV589();
    myStatus.textContent=p?`Прив’язано: ${p.name}`:"Акаунт ще не прив’язаний до картки гравця.";
  }

  const count=playerChangeRequestsV589.filter(r=>r.status==="pending").length;
  if($("playerRequestCountBadge"))$("playerRequestCountBadge").textContent=count?String(count):"";

  if(isAdminV589())renderAdminPlayerLinksV589();
}

function renderAdminPlayerLinksV589(){
  const box=$("adminPlayerLinksList");if(!box)return;
  if(authRole==="admin" && !players.length){
    box.innerHTML='<div class="settings-hint">Завантаження гравців…</div>';
    getAll("players").then(data=>{
      players=data||[];
      renderAdminPlayerLinksV589();
    });
    return;
  }
  if(!accountProfilesV589.length){
    box.innerHTML='<div class="empty-state">Зареєстрованих акаунтів немає.</div>';return;
  }
  const opts=['<option value="">— НЕ ПРИВ’ЯЗАНО —</option>']
    .concat(players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`)).join("");
  box.innerHTML=accountProfilesV589.map(p=>`
    <div class="account-link-row">
      <div class="account-link-user">
        ${profileAvatarHtml(p,"member-avatar")}
        <div><strong>${esc(p.display_name||"Гравець")}</strong><small>${esc(String(p.role||"viewer").toUpperCase())}</small></div>
      </div>
      <select data-link-account="${p.user_id}">${opts}</select>
    </div>`).join("");
  box.querySelectorAll("[data-link-account]").forEach(sel=>{
    const prof=accountProfilesV589.find(p=>p.user_id===sel.dataset.linkAccount);
    sel.value=prof?.player_id||"";
    sel.addEventListener("change",()=>saveAccountPlayerLinkV589(sel.dataset.linkAccount,sel.value||null));
  });
}

async function saveAccountPlayerLinkV589(userId,playerId){
  if(!isAdminV589())return;
  try{
    const profile=(accountProfilesV589||[]).find(p=>p.user_id===userId);
    const oldPlayerId=profile?.player_id||null;

    // If selecting a new player, use the same verified linkage path as player edit form.
    if(playerId){
      await savePlayerAccountLinkV590(playerId,userId);
      // If account was linked to another player, it is already cleared by the helper.
    }else if(oldPlayerId){
      await savePlayerAccountLinkV590(oldPlayerId,null);
    }

    showToast(playerId?"Акаунт прив’язано":"Прив’язку видалено");
    await refreshAuth();
    await loadPlayerAccountSystemV589();
    await loadTeamProfiles();
  }catch(err){
    console.error("v5.91 settings link",err);
    const msg=err?.message||"Невідома помилка";
    showToast("Помилка прив’язки: "+msg);
    alert("Не вдалося змінити прив’язку.\n\n"+msg);
    await refreshPlayerLinkSettingsV590?.();
  }
}

function fieldLabelV589(k){
  return ({
    name:"Нік / ім’я",shirt_number:"Номер",age:"Вік",platform:"Платформа",
    primary_position:"Основна позиція",extra_positions:"Додаткові позиції",
    archetype:"Архетип",status:"Статус",note:"Примітка",card_image_url:"Картка"
  })[k]||k;
}

function awardsForPlayerV589(pid){
  return playerAwardsV589.filter(a=>a.player_id===pid);
}
async function renderAwardsIntoPlayerModalV589(pid){
  currentAwardsPlayerIdV589=pid;
  const box=$("playerAwardsList");if(!box)return;

  box.innerHTML='<div class="empty-state"><strong>ЗАВАНТАЖЕННЯ НАГОРОД…</strong></div>';

  let rows=[];
  if(sb && authUser){
    const {data,error}=await sb.from("player_awards")
      .select("id,player_id,title,award_date,note,icon,created_at")
      .eq("player_id",pid)
      .order("award_date",{ascending:false})
      .order("created_at",{ascending:false});
    if(error){
      console.error("v5.93 player awards load",error);
      box.innerHTML='<div class="empty-state"><strong>НЕ ВДАЛОСЯ ЗАВАНТАЖИТИ НАГОРОДИ</strong></div>';
      return;
    }
    rows=data||[];

    // Keep the shared cache synchronized for "Мій гравець".
    const rest=(playerAwardsV589||[]).filter(a=>a.player_id!==pid);
    playerAwardsV589=[...rest,...rows];
  }else{
    rows=awardsForPlayerV589(pid);
  }

  box.innerHTML=rows.length?rows.map(a=>`
    <div class="player-award-card">
      <div class="player-award-icon">${esc(a.icon||"🏅")}</div>
      <strong>${esc(a.title||"Нагорода")}</strong>
      <span>${a.award_date?new Date(a.award_date+"T00:00:00").toLocaleDateString("uk-UA",{month:"long",year:"numeric"}):""}</span>
      ${a.note?`<small>${esc(a.note)}</small>`:""}
      ${authRole==="admin"?`<button type="button" class="award-delete-btn" data-delete-award="${a.id}">ВИДАЛИТИ</button>`:""}
    </div>`).join(""):'<div class="empty-state"><strong>НАГОРОД ПОКИ НЕМАЄ</strong></div>';

  {
    const pane=$("playerAwardsPane");
    const adminBox=$("playerAwardAdminBox");
    const addTrigger=$("openAddAwardBtn");
    const adminOnly=authRole==="admin";

    if(adminBox) adminBox.classList.add("hidden");
    if(pane) pane.classList.remove("award-add-open");
    if(addTrigger){
      addTrigger.classList.toggle("hidden",!adminOnly);
      addTrigger.textContent="＋ ДОДАТИ НАГОРОДУ";
      addTrigger.setAttribute("aria-expanded","false");
    }
  }
  box.querySelectorAll("[data-delete-award]").forEach(btn=>btn.onclick=()=>deletePlayerAwardV589(btn.dataset.deleteAward));
  syncAwardsAddButtonV739();
}

async function showPlayerAwardsV589(){
  if(!editPlayerId)return;
  await playerViewSlide(2);
}
function returnPlayerSlidesV589(slide=0){
  playerViewSlide(slide);
}
$("playerAwardsTab")?.addEventListener("click",showPlayerAwardsV589);
$("playerInfoTab")?.addEventListener("click",()=>returnPlayerSlidesV589(0));
$("playerStatsTab")?.addEventListener("click",()=>returnPlayerSlidesV589(1));

async function addPlayerAwardV589(){
  if(authRole!=="admin"||!currentAwardsPlayerIdV589)return;
  const title=$("awardTitleInput")?.value.trim();
  const date=$("awardDateInput")?.value||new Date().toISOString().slice(0,10);
  const icon=$("awardIconInput")?.value.trim()||"🏅";
  const note=$("awardNoteInput")?.value.trim()||null;
  if(!title){showToast("Введи назву нагороди");return;}
  const {error}=await sb.from("player_awards").insert({
    player_id:currentAwardsPlayerIdV589,title,award_date:date,icon,note,created_by:authUser.id
  });
  if(error){console.error(error);showToast("Не вдалося додати нагороду");return;}
  $("awardTitleInput").value="";$("awardNoteInput").value="";
  await loadPlayerAccountSystemV589();
  await renderAwardsIntoPlayerModalV589(currentAwardsPlayerIdV589);
  showToast("Нагороду додано");
}
async function deletePlayerAwardV589(id){
  if(authRole!=="admin")return;
  if(!confirm("Видалити цю нагороду?"))return;
  const {error}=await sb.from("player_awards").delete().eq("id",id);
  if(error){showToast("Не вдалося видалити нагороду");return;}
  await loadPlayerAccountSystemV589();
  await renderAwardsIntoPlayerModalV589(currentAwardsPlayerIdV589);
}
$("addPlayerAwardBtn")?.addEventListener("click",addPlayerAwardV589);

function openMyPlayerModalV589(){
  const modal=$("myPlayerModal"),box=$("myPlayerModalBody");
  if(!modal||!box)return;
  const p=myLinkedPlayerV589();
  if(!p){
    box.innerHTML='<div class="empty-state"><strong>АКАУНТ ЩЕ НЕ ПРИВ’ЯЗАНИЙ</strong><span>Адміністратор має прив’язати твій акаунт до картки гравця.</span></div>';
    modal.classList.remove("hidden");return;
  }
  const pending=playerChangeRequestsV589.some(r=>r.player_id===p.id&&r.user_id===authUser.id&&r.status==="pending");
  const posOptions=POSITIONS.map(([v,l])=>`<option value="${v}" ${p.primaryPos===v?"selected":""}>${l}</option>`).join("");
  const arcOptions=['<option value="">Без архетипу</option>'].concat(ARCHETYPES.map(a=>`<option ${p.archetype===a?"selected":""}>${a}</option>`)).join("");
  const statOptions=PLAYER_STATUSES.map(([v,l])=>`<option value="${v}" ${p.status===v?"selected":""}>${l}</option>`).join("");
  const platOptions=['<option value="">Не вибрано</option>'].concat(PLAYER_PLATFORMS.map(v=>`<option ${p.platform===v?"selected":""}>${v}</option>`)).join("");
  box.innerHTML=`
    <div class="my-player-summary"><img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt=""><div><strong>${esc(p.name)}</strong><span>${POS_LABEL[p.primaryPos]||p.primaryPos} · #${p.number||"—"}</span></div></div>
    ${pending?'<div class="pending-request">⏳ Є запит, який очікує підтвердження.</div>':""}
    <form id="myPlayerRequestForm" class="my-player-edit-grid">
      <label>НІК / ІМ’Я<input name="name" value="${esc(p.name||"")}" required></label>
      <label>НОМЕР<input name="shirt_number" type="number" min="0" max="99" value="${p.number??""}"></label>
      <label>ВІК<input name="age" type="number" min="10" max="99" value="${p.age??""}"></label>
      <label>ПЛАТФОРМА<select name="platform">${platOptions}</select></label>
      <label>ОСНОВНА ПОЗИЦІЯ<select name="primary_position">${posOptions}</select></label>
      <label>ДОДАТКОВІ ПОЗИЦІЇ<input name="extra_positions" value="${esc((p.extraPositions||[]).join(", "))}" placeholder="CB, RB"></label>
      <label>АРХЕТИП<select name="archetype">${arcOptions}</select></label>
      <label>СТАТУС<select name="status">${statOptions}</select></label>
      <label class="wide">ПРИМІТКА<textarea name="note" maxlength="100">${esc(p.note||"")}</textarea></label>
      <label class="wide">КАРТКА ГРАВЦЯ<input id="myPlayerCardFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <button type="submit" class="gold-btn wide">НАДІСЛАТИ ЗМІНИ НА ПІДТВЕРДЖЕННЯ</button>
    </form>
    <div class="my-player-awards-title">🏅 НАГОРОДИ</div>
    <div class="player-awards-grid">${awardsForPlayerV589(p.id).length?awardsForPlayerV589(p.id).map(a=>`<div class="player-award-card"><div class="player-award-icon">${esc(a.icon||"🏅")}</div><strong>${esc(a.title)}</strong><span>${esc(a.award_date||"")}</span></div>`).join(""):'<div class="empty-state">Нагород поки немає.</div>'}</div>`;
  modal.classList.remove("hidden");

  $("myPlayerRequestForm")?.addEventListener("submit",submitMyPlayerRequestV589);
}



function isOccupiedNumberErrorV632(err){
  const msg=String(err?.message||"").toLowerCase();
  const details=String(err?.details||"").toLowerCase();
  const hint=String(err?.hint||"").toLowerCase();
  return err?.code==="23505" ||
    msg.includes("shirt_number") ||
    msg.includes("players_shirt") ||
    details.includes("shirt_number") ||
    hint.includes("shirt_number");
}

function showOccupiedNumberMessageV632(number=null){
  const n=number===null||number===""?null:Number(number);
  if(n!==null && !Number.isNaN(n)){
    showToast(`Номер #${n} вже зайнятий`);
  }else{
    showToast("Цей номер уже зайнятий");
  }
}

function occupiedShirtNumberV631(number,excludePlayerId=null){
  if(number===null || number==="" || Number.isNaN(Number(number)))return null;
  const n=Number(number);
  return players.find(p=>
    p.id!==excludePlayerId &&
    p.number!=="" &&
    p.number!==null &&
    p.number!==undefined &&
    Number(p.number)===n
  ) || null;
}

async function submitMyPlayerRequestV589(e){
  e.preventDefault();
  const p=myLinkedPlayerV589();if(!p)return;
  const fd=new FormData(e.currentTarget);

  const numberRaw=String(fd.get("shirt_number")??"").trim();
  const requestedNumber=numberRaw===""?null:Number(numberRaw);
  if(requestedNumber!==null){
    if(!Number.isInteger(requestedNumber) || requestedNumber<0 || requestedNumber>99){
      showToast("Номер має бути від 0 до 99");
      e.currentTarget.querySelector('[name="shirt_number"]')?.focus();
      return;
    }
    const occupied=occupiedShirtNumberV631(requestedNumber,p.id);
    if(occupied){
      showToast(`Номер #${requestedNumber} вже зайнятий`);
      e.currentTarget.querySelector('[name="shirt_number"]')?.focus();
      return;
    }
  }

  let cardUrl=p.cardImage||null;
  const file=$("myPlayerCardFile")?.files?.[0];
  if(file){
    try{
      const data=await resizeImage(file,500,760,.86);
      cardUrl=await uploadDataImage(`player-requests/${authUser.id}-${Date.now()}.png`,data);
    }catch(err){showToast("Не вдалося завантажити картку");return;}
  }
  const rawStatus=String(fd.get("status")||"");
  const proposed={
    name:String(fd.get("name")||"").trim(),
    shirt_number:requestedNumber,
    age:fd.get("age")===""?null:Number(fd.get("age")),
    platform:String(fd.get("platform")||"")||null,
    primary_position:String(fd.get("primary_position")||""),
    extra_positions:String(fd.get("extra_positions")||"").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,3),
    archetype:String(fd.get("archetype")||"")||null,
    status:rawStatus,
    note:String(fd.get("note")||"").trim(),
    card_image_url:cardUrl
  };
  const {error}=await sb.from("player_change_requests").insert({player_id:p.id,user_id:authUser.id,proposed_data:proposed});
  if(error){
    console.error(error);
    if(isOccupiedNumberErrorV632(error) || String(error.message||"").toLowerCase().includes("зайнятий")){
      showOccupiedNumberMessageV632(requestedNumber);
      e.currentTarget.querySelector('[name="shirt_number"]')?.focus();
    }else{
      showToast("Не вдалося надіслати зміни");
    }
    return;
  }
  showToast("Зміни надіслано адміністратору");
  await loadPlayerAccountSystemV589();
  openMyPlayerModalV589();
}

function closeMyPlayerModalV589(){$("myPlayerModal")?.classList.add("hidden")}
$("openMyPlayerBtn")?.addEventListener("click",openMyPlayerModalV589);
$("closeMyPlayerModal")?.addEventListener("click",closeMyPlayerModalV589);
document.querySelectorAll("[data-close-my-player]").forEach(x=>x.addEventListener("click",closeMyPlayerModalV589));

function renderPlayerRequestsV589(){
  const box=$("playerRequestsBody");if(!box)return;
  const canReview=(isAdminV589()||authRole==="editor");
  const rows=playerChangeRequestsV589.filter(r=>r.status==="pending");
  if(!rows.length){box.innerHTML='<div class="empty-state"><strong>НОВИХ ЗАПИТІВ НЕМАЄ</strong></div>';return;}
  box.innerHTML=rows.map(r=>{
    const p=players.find(x=>x.id===r.player_id);
    const prof=accountProfilesV589.find(x=>x.user_id===r.user_id);
    const d=r.proposed_data||{};
    const diffs=Object.entries(d).map(([k,v])=>{
      let oldv="";
      if(k==="name")oldv=p?.name;
      else if(k==="shirt_number")oldv=p?.number;
      else if(k==="age")oldv=p?.age;
      else if(k==="platform")oldv=p?.platform;
      else if(k==="primary_position")oldv=p?.primaryPos;
      else if(k==="extra_positions")oldv=(p?.extraPositions||[]).join(", ");
      else if(k==="archetype")oldv=p?.archetype;
      else if(k==="status")oldv=p?.status;
      else if(k==="note")oldv=p?.note;
      else if(k==="card_image_url")oldv=p?.cardImage?"Поточна картка":"Немає";
      const nv=Array.isArray(v)?v.join(", "):(k==="card_image_url"?(v?"Нова картка":"Немає"):String(v??"—"));
      return `<div class="request-diff"><span>${fieldLabelV589(k)}</span><small>${esc(String(oldv??"—"))}</small><b>→ ${esc(nv)}</b></div>`;
    }).join("");
    return `<div class="player-request-card">
      <div class="request-head"><strong>${esc(prof?.display_name||p?.name||"Гравець")}</strong><span>${new Date(r.created_at).toLocaleString("uk-UA")}</span></div>
      ${diffs}
      ${canReview?`<div class="request-actions player-request-actions">
        <button type="button" class="gold-btn request-approve-btn" data-approve-request="${r.id}">ПІДТВЕРДИТИ</button>
        <button type="button" class="danger-btn request-reject-btn" data-reject-request="${r.id}">ВІДХИЛИТИ</button>
      </div>`:""}
    </div>`;
  }).join("");
  box.querySelectorAll("[data-approve-request]").forEach(b=>b.onclick=()=>reviewPlayerRequestV589(b.dataset.approveRequest,true));
  box.querySelectorAll("[data-reject-request]").forEach(b=>b.onclick=()=>reviewPlayerRequestV589(b.dataset.rejectRequest,false));
}
function openPlayerRequestsV589(){
  applyPermissions?.();
  renderPlayerRequestsV589();
  $("playerRequestsModal")?.classList.remove("hidden");
}
$("openPlayerRequestsBtn")?.addEventListener("click",openPlayerRequestsV589);
$("closePlayerRequestsModal")?.addEventListener("click",()=>$("playerRequestsModal")?.classList.add("hidden"));
document.querySelectorAll("[data-close-player-requests]").forEach(x=>x.addEventListener("click",()=>$("playerRequestsModal")?.classList.add("hidden")));

async function reviewPlayerRequestV589(id,approve){
  if(!(isAdminV589()||authRole==="editor"))return;
  const r=playerChangeRequestsV589.find(x=>x.id===id);if(!r)return;
  if(approve){
    const d=r.proposed_data||{};
    const note=encodePlayerNote(d.status||"",d.note||"");
    const payload={
      name:d.name,
      shirt_number:d.shirt_number,
      age:d.age,
      platform:d.platform,
      primary_position:d.primary_position,
      extra_positions:d.extra_positions||[],
      archetype:d.archetype,
      note:note||null,
      card_image_url:d.card_image_url||null,
      updated_at:new Date().toISOString()
    };
    const {error}=await sb.from("players").update(payload).eq("id",r.player_id);
    if(error){
      console.error(error);
      if(isOccupiedNumberErrorV632(error)){
        showOccupiedNumberMessageV632(d.shirt_number);
      }else{
        showToast("Не вдалося застосувати зміни");
      }
      return;
    }
  }
  const {error}=await sb.from("player_change_requests").update({
    status:approve?"approved":"rejected",reviewed_by:authUser.id,reviewed_at:new Date().toISOString()
  }).eq("id",id);
  if(error){showToast("Не вдалося закрити запит");return;}
  players=await getAll("players");
  renderPlayers();renderPitch();
  await loadPlayerAccountSystemV589();
  renderPlayerRequestsV589();
  showToast(approve?"Зміни підтверджено":"Зміни відхилено");
}

// Refresh visible system after normal auth finishes.
document.addEventListener("DOMContentLoaded",()=>setTimeout(loadPlayerAccountSystemV589,1200));
window.addEventListener("load",()=>setTimeout(loadPlayerAccountSystemV589,700));

/* v5.89 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.89");
});

/* ==========================================================
   v5.90 — account link inside player create/edit
   ========================================================== */
async function getAccountProfilesV590(){
  if(!sb||!authUser)return [];
  const {data,error}=await sb.from("profiles")
    .select("user_id,display_name,avatar_url,role,player_id,access_status,created_at")
    .order("display_name",{ascending:true});
  if(error){
    console.error("v5.90 profiles",error);
    return [];
  }
  if(typeof accountProfilesV589!=="undefined")accountProfilesV589=data||[];
  if(typeof teamProfiles!=="undefined")teamProfiles=new Map((data||[]).map(p=>[p.user_id,p]));
  return data||[];
}

async function populatePlayerAccountSelectV590(playerId=null){
  const field=$("playerAccountLinkField");
  const select=$("playerAccountSelect");
  if(!field||!select)return;

  const isAdmin=authRole==="admin";
  field.classList.toggle("hidden",!isAdmin);
  if(!isAdmin)return;

  const profiles=await getAccountProfilesV590();
  const current=profiles.find(p=>p.player_id===playerId)||null;

  // Accounts already linked to another player are excluded.
  const available=profiles.filter(p=>!p.player_id || p.player_id===playerId);
  select.innerHTML='<option value="">— НЕ ПРИВ’ЯЗАНО —</option>'+
    available.map(p=>`<option value="${p.user_id}">${esc(p.display_name||"Гравець")}${p.role==="admin"?" · ADMIN":p.role==="editor"?" · EDITOR":""}</option>`).join("");
  select.value=current?.user_id||"";
}

async function savePlayerAccountLinkV590(playerId,userId){
  if(authRole!=="admin"||!sb){
    throw new Error("Прив’язку може змінювати тільки адміністратор");
  }

  const profiles=await getAccountProfilesV590();

  // Validate before touching the database.
  const selectedUser=userId ? profiles.find(p=>p.user_id===userId) : null;
  if(userId && !selectedUser){
    throw new Error("Обраний акаунт не знайдено");
  }

  const otherOwner=profiles.find(p=>p.player_id===playerId && p.user_id!==userId);
  if(otherOwner){
    // Explicitly unlink only the previous owner of THIS player.
    const {data:unlinked,error:unlinkError}=await sb.from("profiles")
      .update({player_id:null})
      .eq("user_id",otherOwner.user_id)
      .select("user_id,player_id")
      .maybeSingle();
    if(unlinkError){
      console.error("v5.91 unlink previous owner",unlinkError);
      throw new Error(unlinkError.message||"Не вдалося відв’язати попередній акаунт");
    }
  }

  if(userId){
    // If this account is linked elsewhere, unlink only this specific account first.
    if(selectedUser?.player_id && selectedUser.player_id!==playerId){
      const {error:clearError}=await sb.from("profiles")
        .update({player_id:null})
        .eq("user_id",userId);
      if(clearError){
        console.error("v5.91 clear selected account",clearError);
        throw new Error(clearError.message||"Не вдалося очистити стару прив’язку");
      }
    }

    const {data:linked,error:linkError}=await sb.from("profiles")
      .update({player_id:playerId})
      .eq("user_id",userId)
      .select("user_id,display_name,role,player_id,access_status")
      .maybeSingle();

    if(linkError){
      console.error("v5.91 link account",linkError);
      throw new Error(linkError.message||"Supabase відхилив прив’язку");
    }
    if(!linked || linked.player_id!==playerId){
      throw new Error("База не підтвердила прив’язку акаунта");
    }
  }else{
    // Unlink only the current owner of this player.
    const currentOwner=profiles.find(p=>p.player_id===playerId);
    if(currentOwner){
      const {error:unlinkError}=await sb.from("profiles")
        .update({player_id:null})
        .eq("user_id",currentOwner.user_id);
      if(unlinkError){
        console.error("v5.91 unlink",unlinkError);
        throw new Error(unlinkError.message||"Не вдалося прибрати прив’язку");
      }
    }
  }

  await getAccountProfilesV590();
  if(typeof renderAdminPlayerLinksV589==="function")renderAdminPlayerLinksV589();
  if(typeof renderMembersList==="function")renderMembersList();
}

async function refreshPlayerLinkSettingsV590(){
  if(authRole!=="admin")return;
  // Make sure players exist before building dropdowns.
  try{ players=await getAll("players"); }catch(_e){}
  await getAccountProfilesV590();
  if(typeof renderAdminPlayerLinksV589==="function")renderAdminPlayerLinksV589();
}

/* v5.90 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.90");
});

/* v5.91 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.91");
});

/* v5.92 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.92");
});

/* v5.93 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.93");
});

/* v5.94 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.94");
});

/* v5.95 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.95");
});



/* v5.97 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.97");
});

/* v5.98 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.98");
});

/* v5.99 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v5.99");
});

/* v6.00 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.00");
});

/* v6.10 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.10");
});

/* v6.11 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.11");
});

/* v6.12 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.12");
});

/* v6.13 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.13");
});

/* v6.14 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.14");
});

/* v6.15 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.15");
});

/* v6.16 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.16");
});


/* v6.19 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.19");
});

/* v6.20 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.20");
});

/* v6.21 — version only; no layout/visual changes */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.21");
});

/* v6.22 — settings version */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.22");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.27");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.28");
});


/* ==========================================================
   v6.29 — private site gate events
   ========================================================== */
$("siteAccessLoginBtn")?.addEventListener("click",()=>openAuthModal());
$("siteAccessCheckBtn")?.addEventListener("click",async()=>{
  await refreshSiteAccessOnlyV629();
  if(!currentHasSiteAccessV629())showToast("Доступ ще не підтверджено");
});
$("siteAccessLogoutBtn")?.addEventListener("click",async()=>{
  if(sb)await sb.auth.signOut();
  await refreshAuth();
});

setInterval(()=>{
  if(sb&&authUser)refreshSiteAccessOnlyV629().catch(()=>{});
},12000);

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.29");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.30");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.31");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.32");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.33");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.34");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.35");
});

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.36");
});


/* v6.43 — MULTI VIP + MULTI MVP FIX */
let homeVipPlayers=[];
let homeVipIndex=0;
let homeVipTimer=null;
let homeVipTouchX=null;

function latestVipEventV642(){
  const events=[];
  (trainingDays||[]).forEach(day=>{
    const rows=trainingMvpEligibleRows(day,(trainingStats||[]).filter(r=>r.training_day_id===day.id && Number.isFinite(Number(r.rating))));
    if(!rows.length)return;
    const max=Math.max(...rows.map(r=>Number(r.rating)));
    events.push({date:day.training_date||"",type:"training",rating:max,winners:rows.filter(r=>Math.abs(Number(r.rating)-max)<0.000001)});
  });
  (calendarMatches||[]).forEach(match=>{
    const rows=(officialMatchStats||[]).filter(r=>r.match_id===match.id && Number.isFinite(Number(r.rating)));
    if(!rows.length)return;
    const max=Math.max(...rows.map(r=>Number(r.rating)));
    events.push({date:match.match_date||"",type:"match",rating:max,winners:rows.filter(r=>Math.abs(Number(r.rating)-max)<0.000001)});
  });
  events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return events[0]||null;
}

function paintHomeVipV642(){
  const card=$("homeMvpCard");
  if(!card||!homeVipPlayers.length)return;
  homeVipIndex=((homeVipIndex%homeVipPlayers.length)+homeVipPlayers.length)%homeVipPlayers.length;
  const item=homeVipPlayers[homeVipIndex], p=item.player;
  card.classList.remove("hidden");
  $("homeMvpName").textContent=p.name||"VIP ДНЯ";
  $("homeMvpRating").textContent=Number(item.rating).toFixed(2);
  $("homeMvpMeta").textContent=`${String(item.date).split("-").reverse().join(".")} • ${item.type==="training"?"збір":"матч"}`;
  const img=$("homeMvpPhoto"); if(img){img.src=p.cardImage||PLAYER_PLACEHOLDER;img.classList.remove("hidden");}
  card.dataset.playerId=p.id||"";
  let dots=card.querySelector(".home-vip-dots");
  if(!dots){dots=document.createElement("span");dots.className="home-vip-dots";card.appendChild(dots);}
  dots.innerHTML=homeVipPlayers.length>1?homeVipPlayers.map((_,i)=>`<i class="${i===homeVipIndex?"active":""}"></i>`).join(""):"";
}

function restartHomeVipV642(){
  clearInterval(homeVipTimer);
  if(homeVipPlayers.length>1)homeVipTimer=setInterval(()=>{homeVipIndex=(homeVipIndex+1)%homeVipPlayers.length;paintHomeVipV642();},5000);
}

function renderHomeVip(){
  const card=$("homeMvpCard");if(!card)return;
  const latest=latestVipEventV642();
  homeVipPlayers=[];
  if(latest){
    latest.winners.forEach(w=>{
      const p=(players||[]).find(x=>x.id===w.player_id);
      if(p)homeVipPlayers.push({player:p,rating:Number(w.rating),date:latest.date,type:latest.type});
    });
  }
  if(!homeVipPlayers.length){
    // v6.63: keep the MVP shell at its final size from the first paint.
    // Hiding the second grid item while cloud data loads made Home visibly
    // pop/reflow a moment later on iPhone/PWA.
    card.classList.remove("hidden");
    card.dataset.playerId="";
    const n=$("homeMvpName"), meta=$("homeMvpMeta"), rating=$("homeMvpRating"), img=$("homeMvpPhoto");
    if(n)n.textContent="MVP";
    if(meta)meta.textContent="ЗАВАНТАЖЕННЯ…";
    if(rating)rating.textContent="—";
    if(img){img.src=PLAYER_PLACEHOLDER;img.classList.remove("hidden");}
    const dots=card.querySelector(".home-vip-dots");if(dots)dots.innerHTML="";
    clearInterval(homeVipTimer);
    return;
  }
  if(homeVipIndex>=homeVipPlayers.length)homeVipIndex=0;
  paintHomeVipV642();restartHomeVipV642();
}

function loadLatestMvp(){
  if(!players.length){homeMvpData=null;renderHomeVip();return Promise.resolve();}
  const latest=latestVipEventV642();
  if(latest&&latest.winners.length){
    const w=latest.winners[0], p=players.find(x=>x.id===w.player_id);
    homeMvpData=p?{type:latest.type,date:latest.date,player:p,row:w,rating:Number(w.rating)}:null;
  }else homeMvpData=null;
  renderHomeVip();
  return Promise.resolve();
}

(function bindVipV642(){
  const bind=()=>{
    const card=$("homeMvpCard");if(!card||card.dataset.vip642)return;
    card.dataset.vip642="1";
    card.addEventListener("touchstart",e=>{homeVipTouchX=e.changedTouches?.[0]?.clientX??null;},{passive:true});
    card.addEventListener("touchend",e=>{
      if(homeVipTouchX===null||homeVipPlayers.length<2)return;
      const x=e.changedTouches?.[0]?.clientX??homeVipTouchX,dx=x-homeVipTouchX;homeVipTouchX=null;
      if(Math.abs(dx)<35)return;
      homeVipIndex=(homeVipIndex+(dx<0?1:-1)+homeVipPlayers.length)%homeVipPlayers.length;
      paintHomeVipV642();restartHomeVipV642();
    },{passive:true});
  };
  document.addEventListener("DOMContentLoaded",bind);setTimeout(bind,400);
})();

document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.42");});


document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.43");});

// v6.45 home greeting
function syncHomeGreeting(){
  const el=document.getElementById('homeGreetingNick');
  if(el) el.textContent=authProfile?.display_name || authUser?.email?.split('@')[0] || 'Гравець';
}
setInterval(syncHomeGreeting,1200);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncHomeGreeting()});


/* v6.48 exact interactive home */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.48");
  const currentTheme=document.documentElement.getAttribute("data-site-theme")||"dark";
  applyHomeBackgroundForTheme(currentTheme);
});


/* ==========================================================
   v6.59 — SETTINGS REDESIGN BEHAVIOR
   ========================================================== */
/* ==========================================================
   v8.02 — themed logout confirmation + automatic version
   ========================================================== */
function getCenturiaRuntimeVersionV802(){
  try{
    const script=[...document.scripts].find(s=>
      /(?:^|\/)app\.js(?:\?|$)/.test(s.src||"")
    );
    if(script?.src){
      const raw=new URL(script.src,location.href).searchParams.get("v")||"";
      const match=raw.match(/^(\d+\.\d+)/);
      if(match)return "v"+match[1];
    }
  }catch(_e){}
  return "v8.09";
}

function syncCenturiaVersionV802(){
  const version=getCenturiaRuntimeVersionV802();
  document.querySelectorAll(".settings-version strong").forEach(el=>{
    el.textContent=version;
  });
}

function askSettingsLogoutV802(){
  return new Promise(resolve=>{
    const overlay=document.getElementById("settingsLogoutConfirmV802");
    const approve=document.getElementById("settingsLogoutApproveV802");
    const cancel=document.getElementById("settingsLogoutCancelV802");
    if(!overlay||!approve||!cancel){
      resolve(false);
      return;
    }

    let done=false;

    const finish=value=>{
      if(done)return;
      done=true;
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden","true");
      approve.removeEventListener("click",yes);
      cancel.removeEventListener("click",no);
      overlay.removeEventListener("click",backdrop);
      document.removeEventListener("keydown",key);
      resolve(value);
    };

    const yes=()=>finish(true);
    const no=()=>finish(false);
    const backdrop=e=>{
      if(e.target===overlay)finish(false);
    };
    const key=e=>{
      if(e.key==="Escape")finish(false);
    };

    approve.addEventListener("click",yes);
    cancel.addEventListener("click",no);
    overlay.addEventListener("click",backdrop);
    document.addEventListener("keydown",key);

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden","false");
    setTimeout(()=>cancel.focus(),30);
  });
}

document.addEventListener("DOMContentLoaded",()=>{
  /* Registered late in app.js so it wins over all legacy version labels. */
  syncCenturiaVersionV802();
});

function syncSettingsV659(){
  const nick=authProfile?.display_name || authUser?.email?.split("@")[0] || "Гравець";
  const role=String(authRole||"viewer").toUpperCase();
  const nickEl=document.getElementById("settingsProfileNick");
  const roleEl=document.getElementById("settingsProfileRole");
  const avatar=document.getElementById("settingsProfileAvatar");
  const admin=document.getElementById("settingsAdminPanelV659");
  if(nickEl) nickEl.textContent=nick;
  if(roleEl) roleEl.textContent=role;
  if(avatar){
    if(authProfile?.avatar_url){
      avatar.innerHTML=`<img src="${esc(authProfile.avatar_url)}" alt="">`;
    }else{
      avatar.innerHTML=`<span>${esc(String(nick).trim().slice(0,2).toUpperCase()||"CA")}</span>`;
    }
  }
  if(admin) admin.classList.toggle("hidden",authRole!=="admin");
  if(authRole!=="admin"){
    setSiteAccessPanelV662(false);
    setPlayerLinksPanelV661(false);
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.62");
  syncSettingsV659();
  setSiteAccessPanelV662(false);
  setPlayerLinksPanelV661(false);

  document.getElementById("settingsEditProfileBtn")?.addEventListener("click",()=>{
    if(typeof openProfileModal==="function") openProfileModal();
  });

  document.getElementById("settingsLogoutBtn")?.addEventListener("click",async()=>{
    if(!sb || !authUser)return;

    const ok=await askSettingsLogoutV802();
    if(!ok)return;

    const btn=document.getElementById("settingsLogoutBtn");
    if(btn){
      btn.disabled=true;
      btn.textContent="ВИХІД...";
    }

    try{
      if(voiceRecorder && voiceRecorder.state==="recording")stopVoiceRecording();
      cleanupVoiceStream();
      await stopChatPresence();
      await sb.auth.signOut();
      await refreshAuth();
      showToast("Ви вийшли з акаунта");
      goScreen("home");
    }catch(err){
      console.error("Settings logout error",err);
      showToast("Не вдалося вийти з акаунта");
    }finally{
      if(btn){
        btn.disabled=false;
        btn.textContent="ВИЙТИ";
      }
    }
  });
  document.getElementById("settingsArenaAdminBtn")?.addEventListener("click",()=>{
    openArenaV664("test-admin");
  });
  document.getElementById("settingsAccessJumpBtn")?.addEventListener("click",()=>{
    const panel=document.getElementById("adminSiteAccessCard");
    if(!panel)return;
    const willOpen=panel.dataset.expanded!=="true";
    setSiteAccessPanelV662(willOpen,{scroll:willOpen});
    if(willOpen && typeof renderAdminSiteAccessV629==="function")renderAdminSiteAccessV629();
  });
  document.getElementById("settingsPlayerLinksBtn")?.addEventListener("click",()=>{
    const panel=document.getElementById("adminPlayerLinksCard");
    if(!panel)return;
    const willOpen=panel.dataset.expanded!=="true";
    setPlayerLinksPanelV661(willOpen,{scroll:willOpen});
    if(willOpen && typeof renderAdminPlayerLinksV589==="function")renderAdminPlayerLinksV589();
  });
});

document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncSettingsV659();});
setInterval(()=>{
  if(document.getElementById("screen-settings")?.classList.contains("active")) syncSettingsV659();
},1500);


/* ==========================================================
   v6.63 — PROFILE AVATAR SYNC + STABLE/FAST HOME FIRST PAINT
   ========================================================== */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.63");
  try{ renderHomeVip(); }catch(_e){}
});


/* ==========================================================
   v6.64 — PERSISTENT PROFILE AVATAR + HOME-FIRST PWA LAUNCH
   ========================================================== */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.64");
});


/* ==========================================================
   v6.66 — APPROVED LIGHT HOME + LIGHT SETTINGS
   ========================================================== */
document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".settings-version strong").forEach(el=>el.textContent="v6.66");
  const currentTheme=document.documentElement.getAttribute("data-site-theme")||"dark";
  applyHomeBackgroundForTheme(currentTheme);
});
window.addEventListener("centuria-theme-change",e=>{
  applyHomeBackgroundForTheme(e.detail?.theme||"dark");
});


/* v6.87 — force visible Home button press animation on iOS PWA */
(function(){
  const selector = [
    "#screen-home .home-v645-btn",
    "#screen-home .home-v645-square",
    "#screen-home .home-v645-arena",
    "#screen-home .home-next-event",
    "#screen-home .home-mvp-card"
  ].join(",");

  function press(el){
    if(!el) return;
    el.classList.remove("centuria-press");
    /* restart keyframe even on rapid repeated taps */
    void el.offsetWidth;
    el.classList.add("centuria-press");
    clearTimeout(el.__centuriaPressTimer);
    const pressDuration = el.classList.contains("home-v645-arena") ? 135 : 260;
    el.__centuriaPressTimer=setTimeout(function(){
      el.classList.remove("centuria-press");
    },pressDuration);
  }

  document.addEventListener("pointerdown",function(e){
    const el=e.target && e.target.closest ? e.target.closest(selector) : null;
    if(el) press(el);
  },{capture:true,passive:true});

  /* Fallback for older iOS WebKit */
  document.addEventListener("touchstart",function(e){
    const t=e.target;
    const el=t && t.closest ? t.closest(selector) : null;
    if(el && !el.classList.contains("centuria-press")) press(el);
  },{capture:true,passive:true});
})();


/* v6.92 — visible Calendar tap animation on iOS PWA */
(function(){
  const selector = "#screen-calendar button, #screen-calendar .calendar-month-arrow";
  function animateCalendarButton(el){
    if(!el) return;
    el.classList.remove("calendar-press");
    void el.offsetWidth;
    el.classList.add("calendar-press");
    clearTimeout(el.__calendarPressTimer);
    el.__calendarPressTimer=setTimeout(function(){
      el.classList.remove("calendar-press");
    },250);
  }
  document.addEventListener("pointerdown",function(e){
    const el=e.target && e.target.closest ? e.target.closest(selector) : null;
    if(el) animateCalendarButton(el);
  },{capture:true,passive:true});
  document.addEventListener("touchstart",function(e){
    const el=e.target && e.target.closest ? e.target.closest(selector) : null;
    if(el && !el.classList.contains("calendar-press")) animateCalendarButton(el);
  },{capture:true,passive:true});
})();


/* v6.99 — keep Arena emblem src in sync with theme without delayed CSS content swap */
(function(){
  function sync(){
    var img=document.getElementById("homeArenaEmblem");
    if(!img) return;
    var root=document.documentElement;
    var light=root.getAttribute("data-site-theme")==="light" || root.classList.contains("light-theme");
    var src=light ? "arena-emblem-light.png" : "arena-emblem.png";
    if(img.getAttribute("src")!==src) img.src=src;
  }
  document.addEventListener("DOMContentLoaded",sync);
  window.addEventListener("centuria-theme-change",function(){ sync(); });
  window.addEventListener("pageshow",sync);
})();


/* v7.23 — reliable press animation for Players back/+ buttons on iOS PWA */
(function(){
  function bindPlayersTopPressAnimation(){
    ["addPlayerBtn","playersBackHomeBtn"].forEach(function(id){
      var el=document.getElementById(id);
      if(!el || el.dataset.caPressBound==="1") return;
      el.dataset.caPressBound="1";

      var down=function(){ el.classList.add("ca-pressing"); };
      var up=function(){ el.classList.remove("ca-pressing"); };

      el.addEventListener("pointerdown",down,{passive:true});
      el.addEventListener("pointerup",up,{passive:true});
      el.addEventListener("pointercancel",up,{passive:true});
      el.addEventListener("pointerleave",up,{passive:true});

      el.addEventListener("touchstart",down,{passive:true});
      el.addEventListener("touchend",function(){
        setTimeout(up,70);
      },{passive:true});
      el.addEventListener("touchcancel",up,{passive:true});
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bindPlayersTopPressAnimation);
  }else{
    bindPlayersTopPressAnimation();
  }
})();


/* v7.24 — reliable press animation in Player information modal on iOS/PWA */
(function(){
  function bindPlayerInfoPressAnimations(){
    [
      "closePlayerModal",
      "playerInfoTab",
      "playerStatsTab",
      "playerAwardsTab",
      "viewDeletePlayerBtn",
      "editPlayerBtn"
    ].forEach(function(id){
      var el=document.getElementById(id);
      if(!el || el.dataset.caPlayerPressBound==="1") return;
      el.dataset.caPlayerPressBound="1";

      var down=function(){ el.classList.add("ca-player-press"); };
      var up=function(){ el.classList.remove("ca-player-press"); };

      el.addEventListener("pointerdown",down,{passive:true});
      el.addEventListener("pointerup",function(){ setTimeout(up,55); },{passive:true});
      el.addEventListener("pointercancel",up,{passive:true});
      el.addEventListener("pointerleave",up,{passive:true});

      el.addEventListener("touchstart",down,{passive:true});
      el.addEventListener("touchend",function(){ setTimeout(up,70); },{passive:true});
      el.addEventListener("touchcancel",up,{passive:true});
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bindPlayerInfoPressAnimations);
  }else{
    bindPlayerInfoPressAnimations();
  }
})();


/* v7.26 — chart horizontal swipe must never trigger player slide navigation */
(function(){
  function protectRatingCharts(){
    document.querySelectorAll("#playerDialog .rating-history-scroll").forEach(function(el){
      if(el.dataset.caSwipeProtected==="1")return;
      el.dataset.caSwipeProtected="1";
      ["touchstart","touchmove","touchend"].forEach(function(type){
        el.addEventListener(type,function(e){ e.stopPropagation(); },{passive:true});
      });
    });
  }
  const obs=new MutationObserver(protectRatingCharts);
  if(document.getElementById("playerDialog")){
    obs.observe(document.getElementById("playerDialog"),{childList:true,subtree:true});
  }
  protectRatingCharts();
})();















/* ==========================================================
   v7.39 — Awards button deterministic visibility
   ========================================================== */
function syncAwardsAddButtonV739(){
  const pane=$("playerAwardsPane");
  const btn=$("openAddAwardBtn");
  const box=$("playerAwardAdminBox");
  const slider=$("playerViewSlider");
  if(!pane||!btn||!box)return;

  const admin=(authRole==="admin");
  btn.classList.toggle("hidden",!admin);

  if(!admin){
    box.classList.add("hidden");
    pane.classList.remove("award-add-open");
    btn.textContent="＋ ДОДАТИ НАГОРОДУ";
    btn.setAttribute("aria-expanded","false");
  }

  requestAnimationFrame(()=>{
    if(slider && pane && $("playerAwardsTab")?.classList.contains("active")){
      slider.style.height=`${pane.scrollHeight}px`;
    }
  });
}

/* ==========================================================
   v7.34 — Awards add menu: single clean controller
   ========================================================== */
(function(){
  function fitAwardsSlide(){
    const pane=$("playerAwardsPane");
    const slider=$("playerViewSlider");
    if(!pane||!slider)return;
    requestAnimationFrame(()=>{
      slider.style.height=`${pane.scrollHeight}px`;
    });
  }

  function syncAwardsAddUI(){
    syncAwardsAddButtonV739();
    const pane=$("playerAwardsPane");
    const btn=$("openAddAwardBtn");
    const box=$("playerAwardAdminBox");
    if(!pane||!btn||!box)return;

    const admin=authRole==="admin";
    btn.classList.toggle("hidden",!admin);

    if(!admin){
      box.classList.add("hidden");
      pane.classList.remove("award-add-open");
      btn.textContent="＋ ДОДАТИ НАГОРОДУ";
      btn.setAttribute("aria-expanded","false");
    }
  }

  function bindAwardsAddUI(){
    const pane=$("playerAwardsPane");
    const btn=$("openAddAwardBtn");
    const box=$("playerAwardAdminBox");
    if(!pane||!btn||!box)return;

    if(btn.dataset.awardMenuBound==="1"){
      syncAwardsAddUI();
      return;
    }
    btn.dataset.awardMenuBound="1";

    btn.addEventListener("click",()=>{
      if(authRole!=="admin")return;

      const opening=box.classList.contains("hidden");
      box.classList.toggle("hidden",!opening);
      pane.classList.toggle("award-add-open",opening);

      btn.textContent=opening
        ?"× ЗАКРИТИ ДОДАВАННЯ"
        :"＋ ДОДАТИ НАГОРОДУ";
      btn.setAttribute("aria-expanded",opening?"true":"false");

      fitAwardsSlide();
    });

    syncAwardsAddUI();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bindAwardsAddUI);
  }else{
    bindAwardsAddUI();
  }

  $("playerAwardsTab")?.addEventListener("click",()=>{
    setTimeout(()=>{
      bindAwardsAddUI();
      fitAwardsSlide();
    },30);
  });
})();


/* v7.38 — keep Arena emblem visible and synced to theme */
(function(){
  function syncHomeArenaEmblemV738(){
    const img=document.getElementById("homeArenaEmblem");
    if(!img)return;

    const root=document.documentElement;
    const light=
      root.classList.contains("light-theme") ||
      root.getAttribute("data-site-theme")==="light";

    const wanted=light ? "arena-emblem-light.png" : "arena-emblem.png";
    if(img.getAttribute("src")!==wanted){
      img.setAttribute("src",wanted);
    }

    img.style.removeProperty("display");
    img.style.removeProperty("visibility");
    img.style.removeProperty("opacity");
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",syncHomeArenaEmblemV738);
  }else{
    syncHomeArenaEmblemV738();
  }

  const mo=new MutationObserver(syncHomeArenaEmblemV738);
  mo.observe(document.documentElement,{
    attributes:true,
    attributeFilter:["class","data-site-theme"]
  });

  document.addEventListener("click",function(){
    setTimeout(syncHomeArenaEmblemV738,0);
  },{passive:true});
})();


/* v7.39 — Awards tab: resync before and after rendering/transitions */
(function(){
  function resyncAwardsV739(){
    syncAwardsAddButtonV739();
    setTimeout(syncAwardsAddButtonV739,0);
    setTimeout(syncAwardsAddButtonV739,60);
    setTimeout(syncAwardsAddButtonV739,180);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",resyncAwardsV739);
  }else{
    resyncAwardsV739();
  }

  $("playerAwardsTab")?.addEventListener("click",resyncAwardsV739);

  // When player modal opens, role/profile/render may complete a moment later.
  $("playerDialog")?.addEventListener("toggle",resyncAwardsV739);
})();

/* ==========================================================
   v7.49 — six-button bottom-nav press animation + safe state sync
   ========================================================== */
(function(){
  const nav=document.getElementById("bottomNav");
  if(!nav)return;

  const buttons=[...nav.querySelectorAll("button[data-nav]")];
  let pressed=null;
  let releaseTimer=0;

  function clearPressed(){
    if(releaseTimer){ clearTimeout(releaseTimer); releaseTimer=0; }
    buttons.forEach(btn=>btn.classList.remove("nav-pressing"));
    pressed=null;
  }

  function press(btn){
    clearPressed();
    pressed=btn;
    btn.classList.add("nav-pressing");
  }

  function releaseSoon(){
    if(!pressed)return;
    const target=pressed;
    releaseTimer=setTimeout(()=>{
      target.classList.remove("nav-pressing");
      if(pressed===target)pressed=null;
      releaseTimer=0;
    },85);
  }

  buttons.forEach(btn=>{
    btn.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0)return;
      press(btn);
    },{passive:true});
    btn.addEventListener("pointerup",releaseSoon,{passive:true});
    btn.addEventListener("pointercancel",clearPressed,{passive:true});
    btn.addEventListener("pointerleave",e=>{
      if(e.pointerType==="mouse")clearPressed();
    },{passive:true});
  });

  window.addEventListener("blur",clearPressed,{passive:true});
  document.addEventListener("visibilitychange",()=>{ if(document.hidden)clearPressed(); });
})();

/* ==========================================================
   v7.50 — Players: iOS top rubber-band guard
   ========================================================== */
(function(){
  const screen=document.getElementById("screen-players");
  if(!screen)return;

  let startY=0;

  screen.addEventListener("touchstart",e=>{
    if(e.touches.length!==1)return;
    startY=e.touches[0].clientY;
  },{passive:true});

  screen.addEventListener("touchmove",e=>{
    if(e.touches.length!==1)return;
    const y=e.touches[0].clientY;
    const pullingDown=(y-startY)>0;

    /* At the very top only upward finger travel (content moves up) is valid.
       Prevent the iOS pull-down/rubber-band without affecting normal scroll. */
    if(screen.classList.contains("active") && screen.scrollTop<=0 && pullingDown){
      if(e.cancelable)e.preventDefault();
      screen.scrollTop=0;
    }
  },{passive:false});

  screen.addEventListener("scroll",()=>{
    if(screen.scrollTop<0)screen.scrollTop=0;
  },{passive:true});
})();


/* ==========================================================
   v7.67 — reliable press feedback for Tactical Board launcher
   ========================================================== */
(function(){
  const btn=document.getElementById("openTacticalBoardBtn");
  if(!btn)return;

  const clear=()=>btn.classList.remove("press-feedback");
  btn.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse" && e.button!==0)return;
    btn.classList.add("press-feedback");
  },{passive:true});
  btn.addEventListener("pointerup",()=>setTimeout(clear,90),{passive:true});
  btn.addEventListener("pointercancel",clear,{passive:true});
  btn.addEventListener("pointerleave",e=>{
    if(e.pointerType==="mouse")clear();
  },{passive:true});
})();


/* v8.02 — absolute final version sync after all legacy version handlers */
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",syncCenturiaVersionV802);
}else{
  syncCenturiaVersionV802();
}

/* ==========================================================
   v8.15 TEST — iPhone keyboard detection by real viewport height
   ========================================================== */
(function(){
  const chatScreen=document.getElementById('screen-chat');
  const chatInput=document.getElementById('chatInput');
  if(!chatScreen || !chatInput) return;

  const root=document.documentElement;
  const body=document.body;
  const vv=window.visualViewport;
  let raf=0;
  let pollTimer=0;
  let baselineHeight=Math.max(
    vv ? vv.height : 0,
    window.innerHeight || 0,
    document.documentElement.clientHeight || 0
  );

  function isChatActive(){
    return chatScreen.classList.contains('active');
  }

  function inputHasFocus(){
    return document.activeElement===chatInput;
  }

  function currentViewportHeight(){
    return vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 0);
  }

  function currentViewportTop(){
    return vv ? vv.offsetTop : 0;
  }

  function refreshBaseline(){
    const h=currentViewportHeight();
    /* Baseline may grow after orientation/PWA chrome changes, but must never
       be learned while the keyboard layout is active. */
    if(!body.classList.contains('ca-chat-keyboard-open') && h>baselineHeight-24){
      baselineHeight=Math.max(baselineHeight,h);
    }
  }

  function keyboardIsPhysicallyVisible(){
    if(!isChatActive() || !inputHasFocus()) return false;
    const h=currentViewportHeight();
    const lost=Math.max(0,baselineHeight-h);
    /* iPhone keyboards remove hundreds of px. 110px leaves room for small
       Safari/PWA chrome changes without falsely keeping keyboard mode alive. */
    return lost>110;
  }

  function setViewportVars(){
    root.style.setProperty('--ca-chat-vv-height',Math.max(240,Math.round(currentViewportHeight()))+'px');
    root.style.setProperty('--ca-chat-vv-top',Math.max(0,Math.round(currentViewportTop()))+'px');
  }

  function clearKeyboardLayout(){
    body.classList.remove('ca-chat-keyboard-open');
    root.style.removeProperty('--ca-chat-vv-height');
    root.style.removeProperty('--ca-chat-vv-top');

    /* v8.16: iOS can keep a stale composited geometry for the Chat screen
       after the keyboard closes. Clear every temporary geometry property,
       reset document scroll and force a repaint without navigating away. */
    [
      'position','left','right','top','bottom','width','height','min-height',
      'max-height','z-index','overflow','padding-top','padding-bottom','transform'
    ].forEach(prop=>chatScreen.style.removeProperty(prop));

    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    window.scrollTo(0,0);

    body.classList.add('ca-chat-layout-reset');
    void chatScreen.offsetHeight;

    requestAnimationFrame(()=>{
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
      window.scrollTo(0,0);
      void chatScreen.offsetHeight;
      requestAnimationFrame(()=>{
        body.classList.remove('ca-chat-layout-reset');
        document.documentElement.scrollTop=0;
        document.body.scrollTop=0;
        window.scrollTo(0,0);
      });
    });
  }

  function scrollMessagesToBottom(){
    const messages=document.getElementById('chatMessages');
    if(!messages) return;
    requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;});
  }

  function syncKeyboardState(){
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      raf=0;
      if(!isChatActive()){
        clearKeyboardLayout();
        refreshBaseline();
        return;
      }

      if(!keyboardIsPhysicallyVisible()){
        /* Critical v8.15 behavior: closing the iPhone keyboard wins even if
           the textarea remains focused and still shows a caret. */
        clearKeyboardLayout();
        refreshBaseline();
        return;
      }

      setViewportVars();
      body.classList.add('ca-chat-keyboard-open');
      window.scrollTo(0,0);
      scrollMessagesToBottom();
    });
  }

  function startPolling(){
    if(pollTimer) return;
    pollTimer=window.setInterval(()=>{
      /* iOS sometimes dismisses the keyboard without a final blur/resize.
         Poll the real visual viewport while the textarea is focused. */
      if(inputHasFocus() || body.classList.contains('ca-chat-keyboard-open')){
        syncKeyboardState();
      }else{
        refreshBaseline();
      }
    },120);
  }

  chatInput.addEventListener('focus',()=>{
    refreshBaseline();
    startPolling();
    setTimeout(syncKeyboardState,40);
    setTimeout(syncKeyboardState,180);
    setTimeout(syncKeyboardState,420);
  });

  chatInput.addEventListener('blur',()=>{
    clearKeyboardLayout();
    setTimeout(()=>{
      refreshBaseline();
      clearKeyboardLayout();
    },80);
  });

  if(vv){
    vv.addEventListener('resize',syncKeyboardState,{passive:true});
    vv.addEventListener('scroll',syncKeyboardState,{passive:true});
  }
  window.addEventListener('resize',()=>{
    if(!inputHasFocus()) refreshBaseline();
    syncKeyboardState();
  },{passive:true});

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) clearKeyboardLayout();
    else {refreshBaseline(); syncKeyboardState();}
  });

  document.getElementById('bottomNav')?.addEventListener('click',e=>{
    const btn=e.target.closest?.('button[data-nav]');
    if(btn && btn.dataset.nav!=='chat') clearKeyboardLayout();
  },true);

  window.addEventListener('pageshow',()=>{
    clearKeyboardLayout();
    baselineHeight=Math.max(baselineHeight,currentViewportHeight());
  },{passive:true});

  window.addEventListener('orientationchange',()=>{
    clearKeyboardLayout();
    setTimeout(()=>{
      baselineHeight=currentViewportHeight();
      refreshBaseline();
    },350);
  },{passive:true});

  clearKeyboardLayout();
  startPolling();
})();;


/* v8.17 TEST — typing indicator + durable read receipts + @mentions. */


/* v8.18 TEST — admin/editor full-screen site announcements. */
(()=>{
  const ANNOUNCEMENT_SESSION_START_V818=new Date().toISOString();
  let announcementQueueV818=[];
  let currentAnnouncementV818=null;
  let announcementsCheckedForUserV818=null;
  let selectedAnnouncementFileV818=null;

  function canCreateAnnouncementV818(){return authRole==='admin'||authRole==='editor'}
  function activeAnnouncementThemeV821(){
    const root=document.documentElement;
    const body=document.body;
    const stored=String(root?.getAttribute('data-site-theme')||body?.getAttribute('data-site-theme')||'').toLowerCase();
    if(stored==='light'||root?.classList.contains('light-theme')||body?.classList.contains('light-theme'))return 'light';
    return 'dark';
  }
  function syncAnnouncementThemeV821(){
    const theme=activeAnnouncementThemeV821();
    document.getElementById('announcementCreateModalV818')?.setAttribute('data-announcement-theme',theme);
    document.getElementById('siteAnnouncementOverlayV818')?.setAttribute('data-announcement-theme',theme);
    const toast=document.getElementById('toast');
    if(toast)toast.setAttribute('data-site-toast-theme',theme);
  }
  function syncAnnouncementCreatorV818(){
    document.getElementById('settingsAnnouncementCreatorV818')?.classList.toggle('hidden',!canCreateAnnouncementV818());
  }
  function openAnnouncementEditorV818(){
    if(!canCreateAnnouncementV818())return;
    const modal=document.getElementById('announcementCreateModalV818');
    syncAnnouncementThemeV821();
    modal?.classList.remove('hidden');modal?.setAttribute('aria-hidden','false');
    document.body.classList.add('ca-announcement-editor-open');
    setTimeout(()=>document.getElementById('announcementTextV818')?.focus(),80);
  }
  function closeAnnouncementEditorV818(){
    const modal=document.getElementById('announcementCreateModalV818');
    modal?.classList.add('hidden');modal?.setAttribute('aria-hidden','true');
    document.body.classList.remove('ca-announcement-editor-open');
  }
  function resetAnnouncementEditorV818(){
    const text=document.getElementById('announcementTextV818');if(text)text.value='';
    const input=document.getElementById('announcementImageV818');if(input)input.value='';
    selectedAnnouncementFileV818=null;
    document.getElementById('announcementImagePreviewWrapV818')?.classList.add('hidden');
    const img=document.getElementById('announcementImagePreviewV818');if(img)img.removeAttribute('src');
    const status=document.getElementById('announcementEditorStatusV818');if(status)status.textContent='';
  }
  function announcementExtV818(file){
    const type=String(file?.type||'').toLowerCase();
    if(type.includes('png'))return 'png';if(type.includes('webp'))return 'webp';if(type.includes('heic'))return 'heic';
    return 'jpg';
  }
  async function uploadAnnouncementImageV818(file){
    if(!file)return '';
    if(file.size>10*1024*1024)throw new Error('Фото завелике. Максимум 10 МБ.');
    const path=`announcements/${authUser.id}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}.${announcementExtV818(file)}`;
    const {error}=await sb.storage.from('centuria-assets').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg',cacheControl:'3600'});
    if(error)throw error;
    const {data}=sb.storage.from('centuria-assets').getPublicUrl(path);
    return data?.publicUrl||'';
  }
  async function sendAnnouncementV818(){
    if(!sb||!authUser||!canCreateAnnouncementV818())return;
    const text=String(document.getElementById('announcementTextV818')?.value||'').trim();
    const status=document.getElementById('announcementEditorStatusV818');
    const btn=document.getElementById('announcementSendBtnV818');
    if(!text){if(status)status.textContent='Напиши текст сповіщення.';return}
    btn.disabled=true;if(status)status.textContent='Відправлення…';
    try{
      const imageUrl=selectedAnnouncementFileV818?await uploadAnnouncementImageV818(selectedAnnouncementFileV818):'';
      const {error}=await sb.from('site_announcements').insert({created_by:authUser.id,body:text,image_url:imageUrl||null});
      if(error)throw error;
      resetAnnouncementEditorV818();closeAnnouncementEditorV818();
      showToast('Сповіщення відправлено · з’явиться при наступному вході');
    }catch(err){console.error('Announcement send',err);if(status)status.textContent=err?.message||'Не вдалося відправити сповіщення';}
    finally{btn.disabled=false}
  }
  function authorNameV818(id){
    if(id===authUser?.id)return authProfile?.display_name||'Ви';
    return teamProfiles.get(id)?.display_name||'Centuria Athletics';
  }
  function showNextAnnouncementV818(){
    if(currentAnnouncementV818||!announcementQueueV818.length)return;
    currentAnnouncementV818=announcementQueueV818.shift();
    const a=currentAnnouncementV818;
    const overlay=document.getElementById('siteAnnouncementOverlayV818');
    syncAnnouncementThemeV821();
    const txt=document.getElementById('siteAnnouncementTextV818');if(txt)txt.textContent=a.body||'';
    const author=document.getElementById('siteAnnouncementAuthorV818');if(author)author.textContent=`Від: ${authorNameV818(a.created_by)}`;
    const wrap=document.getElementById('siteAnnouncementImageWrapV818');
    const img=document.getElementById('siteAnnouncementImageV818');
    if(a.image_url&&img&&wrap){img.src=a.image_url;wrap.classList.remove('hidden')}else{if(img)img.removeAttribute('src');wrap?.classList.add('hidden')}
    overlay?.classList.remove('hidden');overlay?.setAttribute('aria-hidden','false');
    document.body.classList.add('ca-announcement-open');
  }
  async function acknowledgeAnnouncementV818(){
    if(!currentAnnouncementV818||!authUser)return;
    const a=currentAnnouncementV818;
    const btn=document.getElementById('siteAnnouncementAcknowledgeV818');if(btn)btn.disabled=true;
    try{
      const {error}=await sb.from('site_announcement_reads').upsert({announcement_id:a.id,user_id:authUser.id,seen_at:new Date().toISOString()},{onConflict:'announcement_id,user_id'});
      if(error)throw error;
      document.getElementById('siteAnnouncementOverlayV818')?.classList.add('hidden');
      document.getElementById('siteAnnouncementOverlayV818')?.setAttribute('aria-hidden','true');
      document.body.classList.remove('ca-announcement-open');
      currentAnnouncementV818=null;
      setTimeout(showNextAnnouncementV818,180);
    }catch(err){console.error('Announcement acknowledge',err);showToast('Не вдалося підтвердити сповіщення');}
    finally{if(btn)btn.disabled=false}
  }
  async function loadUnreadAnnouncementsV818(){
    if(!sb||!authUser||!currentHasSiteAccessV629())return;
    if(announcementsCheckedForUserV818===authUser.id)return;
    announcementsCheckedForUserV818=authUser.id;
    try{
      const [{data:items,error:e1},{data:reads,error:e2}]=await Promise.all([
        sb.from('site_announcements').select('id,created_by,body,image_url,created_at').eq('is_active',true).lte('created_at',ANNOUNCEMENT_SESSION_START_V818).order('created_at',{ascending:true}),
        sb.from('site_announcement_reads').select('announcement_id').eq('user_id',authUser.id)
      ]);
      if(e1)throw e1;if(e2)throw e2;
      const seen=new Set((reads||[]).map(x=>x.announcement_id));
      announcementQueueV818=(items||[]).filter(x=>!seen.has(x.id));
      if(announcementQueueV818.length)setTimeout(showNextAnnouncementV818,450);
    }catch(err){announcementsCheckedForUserV818=null;console.error('Announcement load',err)}
  }

  const originalRefreshAuthV818=refreshAuth;
  refreshAuth=async function(...args){
    const prevUser=authUser?.id||null;
    const result=await originalRefreshAuthV818.apply(this,args);
    syncAnnouncementCreatorV818();
    if(!authUser){announcementsCheckedForUserV818=null;announcementQueueV818=[];currentAnnouncementV818=null;return result}
    if(prevUser&&prevUser!==authUser.id)announcementsCheckedForUserV818=null;
    setTimeout(loadUnreadAnnouncementsV818,80);
    return result;
  };

  document.addEventListener('DOMContentLoaded',()=>{
    syncAnnouncementCreatorV818();
    syncAnnouncementThemeV821();
    new MutationObserver(syncAnnouncementThemeV821).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-site-theme']});
    document.getElementById('createAnnouncementBtnV818')?.addEventListener('click',openAnnouncementEditorV818);
    document.querySelectorAll('[data-announcement-editor-close]').forEach(el=>el.addEventListener('click',closeAnnouncementEditorV818));
    document.getElementById('announcementSendBtnV818')?.addEventListener('click',sendAnnouncementV818);
    document.getElementById('announcementImageRemoveV818')?.addEventListener('click',()=>{
      selectedAnnouncementFileV818=null;const input=document.getElementById('announcementImageV818');if(input)input.value='';
      document.getElementById('announcementImagePreviewWrapV818')?.classList.add('hidden');
    });
    document.getElementById('announcementImageV818')?.addEventListener('change',e=>{
      const file=e.target.files?.[0]||null;selectedAnnouncementFileV818=file;if(!file)return;
      if(file.size>10*1024*1024){selectedAnnouncementFileV818=null;e.target.value='';showToast('Фото завелике · максимум 10 МБ');return}
      const img=document.getElementById('announcementImagePreviewV818');const wrap=document.getElementById('announcementImagePreviewWrapV818');
      const url=URL.createObjectURL(file);if(img)img.src=url;wrap?.classList.remove('hidden');
    });
    document.getElementById('siteAnnouncementAcknowledgeV818')?.addEventListener('click',acknowledgeAnnouncementV818);
    if(authUser)setTimeout(loadUnreadAnnouncementsV818,500);
  });
})();

/* ==========================================================
   v8.31 TEST — RELIABLE PRESS FEEDBACK FOR EVERY BUTTON
   ========================================================== */
(()=>{
  const CLASS='ca-global-press-v831';
  const timers=new WeakMap();

  function getButton(target){
    const btn=target?.closest?.('button');
    return btn && !btn.disabled ? btn : null;
  }

  function press(btn){
    if(!btn) return;
    const old=timers.get(btn);
    if(old) clearTimeout(old);
    btn.classList.add(CLASS);
  }

  function release(btn,delay=75){
    if(!btn) return;
    const old=timers.get(btn);
    if(old) clearTimeout(old);
    const timer=setTimeout(()=>{
      btn.classList.remove(CLASS);
      timers.delete(btn);
    },delay);
    timers.set(btn,timer);
  }

  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    press(getButton(e.target));
  },{capture:true,passive:true});

  document.addEventListener('pointerup',e=>release(getButton(e.target)),{capture:true,passive:true});
  document.addEventListener('pointercancel',e=>release(getButton(e.target),0),{capture:true,passive:true});

  /* Touch fallback for older iOS/PWA event paths. */
  document.addEventListener('touchstart',e=>press(getButton(e.target)),{capture:true,passive:true});
  document.addEventListener('touchend',e=>release(getButton(e.target),90),{capture:true,passive:true});
  document.addEventListener('touchcancel',e=>release(getButton(e.target),0),{capture:true,passive:true});

  window.addEventListener('blur',()=>{
    document.querySelectorAll('button.'+CLASS).forEach(btn=>btn.classList.remove(CLASS));
  });
})();

/* v8.31 — keep the textarea itself visible after iOS finishes keyboard layout. */
(()=>{
  const input=document.getElementById('chatInput');
  const messages=document.getElementById('chatMessages');
  if(!input) return;

  function revealComposer(){
    if(!document.body.classList.contains('ca-chat-keyboard-open')) return;
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    if(messages) messages.scrollTop=messages.scrollHeight;
  }

  input.addEventListener('focus',()=>{
    setTimeout(revealComposer,220);
    setTimeout(revealComposer,480);
  });
  input.addEventListener('input',()=>requestAnimationFrame(revealComposer),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>setTimeout(revealComposer,30),{passive:true});
})();


/* v8.32 — keep keyboard dock and @ mention chooser inside the visible viewport. */
(()=>{
  const input=document.getElementById('chatInput');
  const dock=document.querySelector('#screen-chat .chat-input-dock-v832');
  const menu=document.getElementById('chatMentionMenu');
  const messages=document.getElementById('chatMessages');
  if(!input || !dock) return;

  function keepDockVisible(){
    if(!document.body.classList.contains('ca-chat-keyboard-open')) return;
    // Reflow after iOS changes VisualViewport or after mention menu appears.
    void dock.offsetHeight;
    if(messages) messages.scrollTop=messages.scrollHeight;
  }

  input.addEventListener('focus',()=>{
    setTimeout(keepDockVisible,80);
    setTimeout(keepDockVisible,260);
    setTimeout(keepDockVisible,520);
  });
  input.addEventListener('input',()=>{
    requestAnimationFrame(()=>{
      keepDockVisible();
      if(menu && !menu.classList.contains('hidden')) menu.scrollTop=0;
    });
  });
  window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(keepDockVisible),{passive:true});
  window.visualViewport?.addEventListener('scroll',()=>requestAnimationFrame(keepDockVisible),{passive:true});
})();


/* ==========================================================
   v8.35 — lower Chat input dock closer to the iOS accessory strip.
   visualViewport.height stops at the keyboard, but iOS may draw the
   previous/next/done strip over the bottom part of that visible area.
   ========================================================== */
(()=>{
  const input=document.getElementById('chatInput');
  const dock=document.querySelector('#screen-chat .chat-input-dock-v832');
  const menu=document.getElementById('chatMentionMenu');
  const messages=document.getElementById('chatMessages');
  if(!input || !dock) return;

  const root=document.documentElement;
  const vv=window.visualViewport;
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);

  function viewportBottom(){
    if(vv) return Math.round(vv.offsetTop + vv.height);
    return Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
  }

  function accessoryGap(){
    // The iPhone input assistant visible in the user's screenshot is about
    // one compact control row high. Keep a small safety margin as well.
    return isiOS ? 12 : 6;
  }

  function placeDock(){
    if(!document.body.classList.contains('ca-chat-keyboard-open')){
      root.style.removeProperty('--ca-chat-dock-anchor-y');
      return;
    }

    const y=Math.max(150, viewportBottom()-accessoryGap());
    root.style.setProperty('--ca-chat-dock-anchor-y', y+'px');

    requestAnimationFrame(()=>{
      if(messages) messages.scrollTop=messages.scrollHeight;
      if(menu && !menu.classList.contains('hidden')) menu.scrollTop=0;
    });
  }

  input.addEventListener('focus',()=>{
    setTimeout(placeDock,60);
    setTimeout(placeDock,180);
    setTimeout(placeDock,360);
    setTimeout(placeDock,620);
  });

  input.addEventListener('input',()=>requestAnimationFrame(placeDock),{passive:true});
  input.addEventListener('keyup',()=>requestAnimationFrame(placeDock),{passive:true});
  input.addEventListener('blur',()=>{
    setTimeout(()=>root.style.removeProperty('--ca-chat-dock-anchor-y'),80);
  });

  vv?.addEventListener('resize',()=>requestAnimationFrame(placeDock),{passive:true});
  vv?.addEventListener('scroll',()=>requestAnimationFrame(placeDock),{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(placeDock,180),{passive:true});

  // Mention menu can be rendered asynchronously after the textarea input
  // event, so watch only this small node and re-anchor when it changes.
  if(menu && 'MutationObserver' in window){
    new MutationObserver(()=>requestAnimationFrame(placeDock)).observe(menu,{
      attributes:true,
      attributeFilter:['class'],
      childList:true
    });
  }
})();




/* ==========================================================
   v8.39 — CHAT WINDOW ENDS AT THE REAL COMPOSER
   One geometry source only: the actual rendered top of the floating input
   dock/composer. This replaces the conflicting v8.36/v8.38 shrink passes.
   ========================================================== */
(()=>{
  const input=document.getElementById('chatInput');
  const messages=document.getElementById('chatMessages');
  const pane=document.getElementById('chatTabPane');
  const composer=document.querySelector('#screen-chat .chat-composer');
  const dock=document.querySelector('#screen-chat .chat-input-dock-v832');
  const menu=document.getElementById('chatMentionMenu');
  const context=document.getElementById('chatComposerContext');
  const attachment=document.getElementById('chatAttachmentPreview');
  if(!input || !messages || !composer) return;

  let raf=0;
  let timers=[];

  function clearTimers(){ timers.forEach(clearTimeout); timers=[]; }

  function reset(){
    clearTimers();
    if(pane){
      ['height','max-height','min-height','flex','overflow'].forEach(k=>pane.style.removeProperty(k));
    }
    ['height','max-height','min-height','flex','overflow-y','overflow-x','padding-bottom','box-sizing'].forEach(k=>messages.style.removeProperty(k));
  }

  function sizeToComposer(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      if(!document.body.classList.contains('ca-chat-keyboard-open')){
        reset();
        return;
      }

      // IMPORTANT: measure the composer itself after all fixed-position / transform
      // rules have been applied. Do not infer its location from visualViewport.
      const m=messages.getBoundingClientRect();
      const c=composer.getBoundingClientRect();
      if(!Number.isFinite(m.top) || !Number.isFinite(c.top)) return;

      // v8.40: user requested the visible black chat window to be roughly
      // twice as tall while the iOS keyboard is open. Use a deliberate
      // fixed keyboard-mode height instead of another fragile viewport
      // inference. This makes the change visually deterministic.
      const h=280;

      // Undo old pane hard-shrink geometry. The visible rounded surface is
      // chatMessages, so only it needs the exact height.
      if(pane){
        pane.style.setProperty('height','auto','important');
        pane.style.setProperty('max-height','none','important');
        pane.style.setProperty('min-height','0','important');
        pane.style.setProperty('flex','1 1 auto','important');
        pane.style.setProperty('overflow','visible','important');
      }

      messages.style.setProperty('flex','0 0 '+h+'px','important');
      messages.style.setProperty('height',h+'px','important');
      messages.style.setProperty('max-height',h+'px','important');
      messages.style.setProperty('min-height','0','important');
      messages.style.setProperty('overflow-y','auto','important');
      messages.style.setProperty('overflow-x','hidden','important');
      messages.style.setProperty('padding-bottom','12px','important');
      messages.style.setProperty('box-sizing','border-box','important');

      messages.scrollTop=messages.scrollHeight;
    });
  }

  function settle(){
    clearTimers();
    sizeToComposer();
    [50,120,220,360,520,760,1050,1400].forEach(ms=>timers.push(setTimeout(sizeToComposer,ms)));
  }

  input.addEventListener('focus',settle);
  input.addEventListener('input',sizeToComposer,{passive:true});
  input.addEventListener('keyup',sizeToComposer,{passive:true});
  input.addEventListener('blur',()=>timers.push(setTimeout(reset,160)));
  window.visualViewport?.addEventListener('resize',settle,{passive:true});
  window.visualViewport?.addEventListener('scroll',sizeToComposer,{passive:true});
  window.addEventListener('resize',settle,{passive:true});
  window.addEventListener('orientationchange',()=>timers.push(setTimeout(settle,180)),{passive:true});

  if('ResizeObserver' in window){
    const ro=new ResizeObserver(()=>sizeToComposer());
    ro.observe(composer);
    if(dock) ro.observe(dock);
  }
  if('MutationObserver' in window){
    const mo=new MutationObserver(()=>settle());
    [menu,context,attachment].filter(Boolean).forEach(n=>mo.observe(n,{attributes:true,attributeFilter:['class','style'],childList:true}));
  }
})();
