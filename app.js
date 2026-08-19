
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
      ? "platform-xbox.jpg"
      : "platform-pc.png";
  return `<img src="${src}" alt="${platform}" class="platform-logo-img">`;
}

function selectPlatform(value){
  const hidden=$("platformValue");
  if(hidden)hidden.value=value||"";
  document.querySelectorAll(".platform-option").forEach(btn=>{
    btn.classList.toggle("selected",btn.dataset.value===value);
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
  "3421":[
    ["ST",50,12],
    ["CAM",35,31],["CAM",65,31],
    ["LM",13,51],["CM",39,55],["CM",61,55],["RM",87,51],
    ["CB",25,77],["CB",50,82],["CB",75,77],
    ["GK",50,92]
  ]
};

let db;
let players = [];
let squads = [];
let currentFormation = localStorage.getItem("ca_formation") || "451";
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
    pushRegistration = await navigator.serviceWorker.register("/service-worker.js",{scope:"/"});
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
let teamProfiles = new Map();
let chatMessages = [];
let chatAttachment = null;
let chatPresenceChannel = null;
let chatPollTimer = null;
let chatLastSignature = "";
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
      .select("user_id,display_name,avatar_url,role,player_id")
      .eq("user_id",authUser.id)
      .maybeSingle();
    authProfile=profile||null;
    if(profile?.role) authRole=profile.role;
  }
  applyPermissions();
  await refreshPushSettings();
  await refreshChatAuthState();
  await refreshGatheringsAuthState();
  await loadStatisticsData();
  await loadHomeNextEvent();
  refreshTacticalBoardPermissions();
  if($("screen-tactical-board")?.classList.contains("active")){ await loadTacticalBoards(); renderTacticalBoard(); }
  if(authUser && $("screen-chat")?.classList.contains("active")){
    await maybeWeeklyChatCleanup();
  }
  try{
    players=await getAll("players");
    squads=await getAll("squads");
    renderPlayers();
    renderPitch();
    renderSquads();
  }catch(err){
    console.error("Cloud refresh error",err);
  }
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
    createdAt:s.created_at ? new Date(s.created_at).getTime() : Date.now(),
    image:s.image_url || ""
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
    const {data,error}=await sb.from("saved_lineups")
      .select("*")
      .order("created_at",{ascending:false});
    if(error){console.error(error);showToast("Не вдалося завантажити склади");return []}
    return (data||[]).map(squadFromDb);
  }
  return [];
}

async function put(store,obj){
  if(!sb) throw new Error("Supabase недоступний");
  if(!canEditSite()) throw new Error("Потрібні права редактора");

  if(store==="players"){
    let cardUrl=obj.cardImage || "";
    if(cardUrl.startsWith("data:")){
      cardUrl=await uploadDataImage(`players/${obj.id}.png`,cardUrl);
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

    if(error) throw error;
    if(!data?.id) throw new Error("Supabase не підтвердив збереження складу");
    return squadFromDb(data);
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
function formationName(k){return k==="451"?"4-5-1":"3-4-2-1"}

function navigate(name){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $("screen-"+name).classList.add("active");
  const nav=$("bottomNav");
  nav.classList.toggle("hidden-nav",name==="home" || name==="calendar");
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
    platformPicker.innerHTML=PLAYER_PLATFORMS.map(platform=>`
      <button type="button" class="platform-option" data-value="${platform}">
        <span class="platform-icon">${platformIcon(platform)}</span>
        <span>${platform}</span>
      </button>`).join("");
    platformPicker.querySelectorAll(".platform-option").forEach(btn=>{
      btn.addEventListener("click",()=>selectPlatform(btn.dataset.value));
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
    const card=document.createElement("article");card.className="player-card";
    card.innerHTML=`
      <div class="img-wrap"><img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}"></div>
      <button class="edit-mini" aria-label="Редагувати">✎</button>
      <div class="player-meta"><strong>${esc(p.name)}</strong><span>#${esc(p.number||"—")} • ${POS_LABEL[p.primaryPos]||""}</span></div>`;
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
  $("playerAwardsTab")?.classList.toggle("active",index===2);

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
    const {data}=await sb.from("training_player_stats").select("training_day_id,player_id,rating").in("training_day_id",trainingIds);
    const grouped={};
    (data||[]).forEach(r=>(grouped[r.training_day_id]??=[]).push(r));
    trainingIds.forEach(id=>{
      const mine=grouped[id]?.find(r=>r.player_id===playerId);
      const max=Math.max(...(grouped[id]||[]).map(r=>Number(r.rating)).filter(Number.isFinite),-1);
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
  $("statOfficialForm").innerHTML=statFormHtml(official.slice(0,5).map(r=>r.rating));

  $("statTrainingMatches").textContent=trMatches;
  $("statTrainingGoals").textContent=training.reduce((s,r)=>s+(Number(r.goals)||0),0);
  $("statTrainingAssists").textContent=training.reduce((s,r)=>s+(Number(r.assists)||0),0);
  $("statTrainingAvg").textContent=fmtRating(trAvg);
  $("statTrainingBest").textContent=fmtRating(trBest);
  $("statTrainingWorst").textContent=fmtRating(trWorst);
  $("statTrainingMvp").innerHTML=`<em>MVP</em> ${trainingMvp}`;
  $("statTrainingForm").innerHTML=statFormHtml(training.slice(0,5).map(r=>r.rating));
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

  $("viewCardImage").innerHTML=`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">`;
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
let playerSwipeStartX=null;
let playerSwipeStartY=null;

function currentPlayerSlideV598(){
  const tr=$("playerViewSlider")?.style.transform||"";
  if(tr.includes("66.666") || tr.includes("66.667"))return 2;
  if(tr.includes("33.333") || tr.includes("33.334"))return 1;
  return 0;
}

$("playerViewSlider")?.addEventListener("touchstart",e=>{
  if(e.target.closest?.("input,textarea,select,button"))return;
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
    const msg=err?.message||"Невідома помилка";
    showToast("Не вдалося зберегти: "+msg);
    alert("Помилка збереження / прив’язки:\n\n"+msg);
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
      <button class="slot-card ${p?"filled":""}">${p?`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">`:"＋"}</button>
      <div class="slot-name">${p?esc(p.name):"Порожньо"}</div>
      <span class="slot-position ${p?comp:"empty"}">${POS_LABEL[pos]}</span>`;
    slot.querySelector(".slot-card").addEventListener("click",()=>openPicker(key,pos));
    pitch.appendChild(slot);
  });
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

    const cloudSquads=await getAll("squads");
    if(!cloudSquads.some(s=>s.id===obj.id)){
      throw new Error("Склад не знайдено в Supabase після збереження");
    }

    squads=cloudSquads;
    renderSquads();
    showToast("Склад збережено ✓");
  }catch(err){
    console.error("Save lineup failed:",err);
    showToast(`Не вдалося зберегти склад${err?.message?": "+err.message:""}`);
  }finally{
    if(saveBtn)saveBtn.disabled=false;
  }
});

async function renderLineupImage(name){
  // 1.5x keeps the saved lineup sharp (1080x1620) while using much less
  // memory on iPhone/Safari than the previous 1440x2160 canvas.
  const SCALE=1.5,W=720,H=1080,canvas=document.createElement("canvas");
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

  const px=56,py=135,pw=608,ph=850;
  ctx.fillStyle="#1f7144";ctx.fillRect(px,py,pw,ph);
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?"rgba(0,0,0,.035)":"rgba(255,255,255,.025)";ctx.fillRect(px+i*pw/8,py,pw/8,ph)}
  ctx.strokeStyle="rgba(255,255,255,.6)";ctx.lineWidth=2;ctx.strokeRect(px+20,py+20,pw-40,ph-40);
  ctx.beginPath();ctx.moveTo(px+20,py+ph/2);ctx.lineTo(px+pw-20,py+ph/2);ctx.stroke();
  ctx.beginPath();ctx.arc(px+pw/2,py+ph/2,58,0,Math.PI*2);ctx.stroke();

  const slots=FORMATIONS[currentFormation];
  for(let i=0;i<slots.length;i++){
    const [pos,x,y]=slots[i],key=`${currentFormation}-${i}`,p=players.find(v=>v.id===lineup[key]);
    const cx=px+(x/100)*pw,cy=py+(y/100)*ph;
    const cw=68,ch=96;
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
  ctx.fillStyle="#9d8d74";ctx.font="12px Arial";ctx.fillText("Centuria Athletics • Daniil Osetskyi",38,1040);
  try{
    return canvas.toDataURL("image/jpeg",.92);
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

    const W=720,H=1080,SCALE=1.5;
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
    ctx.drawImage(
      im,
      56*sx,135*sy,608*sx,850*sy,
      56,135,608,850
    );

    ctx.fillStyle=light?"#8f826e":"#b9a98e";
    ctx.font="13px Arial";
    ctx.fillText("Centuria Athletics • Daniil Osetskyi",38,1038);

    return c.toDataURL("image/jpeg",0.94);
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

  const px=56,py=135,pw=608,ph=850,cw=68,ch=96;
  const slots=FORMATIONS[fk];

  let best=null;
  let bestDist=Infinity;

  slots.forEach((slot,i)=>{
    const [pos,sx,sy]=slot;
    const cx=px+(sx/100)*pw;
    const cy=py+(sy/100)*ph;

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

$("downloadImage").addEventListener("click",()=>{
  if(!currentSavedImage)return;
  const a=document.createElement("a");a.href=currentSavedImage.image;a.download=(currentSavedImage.name||"centuria-lineup").replace(/[^\wа-яіїєґ-]+/gi,"_")+".jpg";a.click();
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

/* Music */
const music=$("bgMusic"), toggle=$("musicToggle"), volume=$("volumeRange"), musicStartBtn=$("musicStartBtn");

let audioCtx=null;
let musicSourceNode=null;
let musicGainNode=null;

async function initWebAudioVolume(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx) return false;

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


const savedMusic=localStorage.getItem("ca_music");
toggle.checked=savedMusic!=="off";
volume.value=localStorage.getItem("ca_volume")||"35";
music.loop=true;
music.volume=Math.max(0,Math.min(1,Number(volume.value)/100));
music.muted=Number(volume.value)===0;



let musicStarted=false;

async function startMusicFromGesture(){
  if(!toggle.checked)return false;
  await initWebAudioVolume();
  setBackgroundVolume(volume.value);
  try{
    await music.play();
    setBackgroundVolume(volume.value);
    setTimeout(()=>setBackgroundVolume(volume.value),60);
    musicStarted=true;
    musicStartBtn.classList.add("hidden");
    return true;
  }catch(err){
    musicStarted=false;
    musicStartBtn.classList.remove("hidden");
    return false;
  }
}

async function gestureStarter(){
  if(!toggle.checked)return;
  await initWebAudioVolume();
  setBackgroundVolume(volume.value);
  if(music.paused){
    startMusicFromGesture();
  }
}

/* Try once on load; browsers may reject this, which is normal. */
music.play().then(()=>{
  if(toggle.checked){
    musicStarted=true;
    musicStartBtn.classList.add("hidden");
  }else{
    music.pause();
  }
}).catch(()=>{
  if(toggle.checked) musicStartBtn.classList.remove("hidden");
});

/* Keep listeners active until music actually starts. */
document.addEventListener("pointerdown",gestureStarter);
document.addEventListener("touchstart",gestureStarter,{passive:true});
document.addEventListener("click",gestureStarter);
document.addEventListener("keydown",gestureStarter);

musicStartBtn.addEventListener("click",async e=>{
  e.stopPropagation();
  const ok=await startMusicFromGesture();
  if(!ok)showToast("Браузер не дозволив запустити звук. Перевір гучність пристрою.");
});

toggle.addEventListener("change",async()=>{
  localStorage.setItem("ca_music",toggle.checked?"on":"off");
  if(toggle.checked){
      const ok=await startMusicFromGesture();
    if(!ok)musicStartBtn.classList.remove("hidden");
  }else{
    music.pause();
    musicStarted=false;
    musicStartBtn.classList.add("hidden");
  }
});




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

if(volume){
  volume.value=localStorage.getItem("ca_volume")||"35";
  setBackgroundVolume(volume.value);

  const ensureAudioAndApply=async()=>{
    await initWebAudioVolume();
    setBackgroundVolume(volume.value);
  };

  volume.addEventListener("pointerdown",ensureAudioAndApply);
  volume.addEventListener("touchstart",ensureAudioAndApply,{passive:true});
  volume.addEventListener("input",ensureAudioAndApply);
  volume.addEventListener("change",ensureAudioAndApply);
  volume.addEventListener("touchend",ensureAudioAndApply,{passive:true});
  volume.addEventListener("pointerup",ensureAudioAndApply);
}

music.addEventListener("error",()=>{
  musicStartBtn.classList.remove("hidden");
  showToast("Не вдалося завантажити фонову музику");
});

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
  return players.filter(p=>playerIds.has(p.id));
}

function gatheringLineupSlotHtml(g,slot,index){
  const key=`451-${index}`;
  const row=lineupForGathering(g.id).find(s=>s.slot_key===key);
  const p=row?.player_id ? players.find(x=>x.id===row.player_id) : null;
  const editable=canEditSite()&&!gatheringIsPast(g);
  return `<div class="gathering-lineup-slot" style="left:${slot[1]}%;top:${slot[2]}%">
    <button type="button" class="gathering-lineup-card ${p?"filled live-player-card":""}" ${editable?`data-gathering-lineup-slot="${g.id}|${key}|${slot[0]}"`:"disabled"}>
      ${p?`<img src="${p.cardImage||PLAYER_PLACEHOLDER}" alt="${esc(p.name)}">`:"<span>＋</span>"}
    </button>
    <div class="gathering-lineup-name">${p?esc(p.name):"Порожньо"}</div>
    <div class="gathering-lineup-pos">${POS_LABEL[slot[0]]||slot[0]}</div>
  </div>`;
}

function gatheringLineupHtml(g){
  return `<div class="gathering-lineup-wrap">
    <div class="gathering-lineup-head">
      <div><strong>⚽ СКЛАД НА ЗБІР</strong><span>${gatheringIsPast(g)?"Фінальний склад збережено в історії":"Показуються тільки ті, хто проголосував «Буду»"}</span></div>
      ${!gatheringIsPast(g)&&canEditSite()?`<small>Натисни +, щоб поставити гравця</small>`:""}
    </div>
    <div class="gathering-lineup-pitch">
      ${FORMATIONS["451"].map((slot,i)=>gatheringLineupSlotHtml(g,slot,i)).join("")}
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
    }).join(""):`<div class="empty-state"><strong>НЕМАЄ ДОСТУПНИХ ГРАВЦІВ</strong><span>Спочатку гравець має проголосувати «Буду» та мати прив’язаний акаунт.</span></div>`}`;

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
      showToast("Цей гравець не проголосував «Буду»");
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
    .select("user_id,display_name,avatar_url,role,player_id");
  if(error){
    console.error("Profiles load error",error);
    return;
  }
  teamProfiles=new Map((data||[]).map(p=>[p.user_id,p]));
  renderMembersList();
}

async function loadChatMessages(forceScroll=false){
  if(!sb || !authUser)return;
  const {data,error}=await sb.from("messages")
    .select("id,user_id,text,media_url,media_type,created_at,author_nick")
    .order("created_at",{ascending:false})
    .limit(100);
  if(error){
    console.error("Chat load error",error);
    const box=$("chatMessages");
    if(box) box.innerHTML=`<div class="chat-empty">Не вдалося завантажити чат.</div>`;
    return;
  }

  const next=(data||[]).reverse();
  const signature=next.map(m=>m.id).join("|");
  const changed=signature!==chatLastSignature;
  chatMessages=next;
  chatLastSignature=signature;

  if(changed || forceScroll){
    await loadTeamProfiles();
    renderChatMessages(forceScroll);
  }
}

function renderChatMessages(forceScroll=false){
  const box=$("chatMessages");
  if(!box)return;
  const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;

  if(!chatMessages.length){
    box.innerHTML=`<div class="chat-empty">Поки що повідомлень немає.<br>Напиши першим.</div>`;
    return;
  }

  box.innerHTML=chatMessages.map(m=>{
    const profile=teamProfiles.get(m.user_id)||{
      display_name:m.author_nick||"Гравець",
      avatar_url:null
    };
    const own=authUser?.id===m.user_id;
    const canDelete=own || authRole==="admin";
    const time=new Date(m.created_at).toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
    const day=new Date(m.created_at).toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"});
    let media="";
    if(m.media_url){
      if(m.media_type==="audio"){
        media=`<div class="voice-message">
          <span class="voice-icon">🎙</span>
          <audio class="chat-audio" controls playsinline preload="metadata" src="${m.media_url}"></audio>
        </div>`;
      }else{
        media=`<img class="chat-media ${m.media_type==="gif"?"is-gif":""}" src="${m.media_url}" alt="Вкладення">`;
      }
    }
    return `<div class="chat-message ${own?"own":""}" data-message-id="${m.id}">
      ${profileAvatarHtml(profile)}
      <div class="chat-message-main">
        <div class="chat-message-meta">
          <strong>${esc(profile.display_name||"Гравець")}</strong>
          <span>${day} · ${time}</span>
          ${canDelete?`<button class="chat-delete" type="button" data-delete-message="${m.id}" data-viewer-allowed="true">×</button>`:""}
        </div>
        <div class="chat-bubble">
          ${m.text?`<div class="chat-text">${esc(m.text).replace(/\n/g,"<br>")}</div>`:""}
          ${media}
        </div>
      </div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-delete-message]").forEach(btn=>{
    btn.addEventListener("click",()=>deleteChatMessage(btn.dataset.deleteMessage));
  });

  if(forceScroll || nearBottom){
    requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight;});
  }
}

async function deleteChatMessage(id){
  if(!sb || !authUser)return;
  const msg=chatMessages.find(m=>m.id===id);
  if(!msg)return;
  if(msg.user_id!==authUser.id && authRole!=="admin")return;
  if(!confirm("Видалити це повідомлення?"))return;
  const {error}=await sb.from("messages").delete().eq("id",id);
  if(error){showToast("Не вдалося видалити повідомлення");return}
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
  const text=(input?.value||"").trim();
  if(!text && !chatAttachment)return;

  const btn=$("sendMessageBtn");
  if(btn)btn.disabled=true;
  const payload={
    user_id:authUser.id,
    text:text||null,
    media_url:chatAttachment?.url||null,
    media_type:chatAttachment?.type||null,
    author_nick:authProfile?.display_name||authUser.email?.split("@")[0]||"Гравець"
  };
  const {error}=await sb.from("messages").insert(payload);
  if(btn)btn.disabled=false;
  if(error){
    console.error("Send error",error);
    showToast("Не вдалося відправити повідомлення");
    return;
  }
  const senderNick=payload.author_nick||"Гравець";
  let pushBody=text;
  if(!pushBody && chatAttachment?.type==="voice")pushBody="🎙 Голосове повідомлення";
  if(!pushBody && chatAttachment?.type==="gif")pushBody="GIF";
  if(!pushBody && chatAttachment?.type)pushBody="📷 Фото";
  sendPushEvent("chat",`${senderNick} — Чат`,pushBody||"Нове повідомлення");

  if(input)input.value="";
  chatAttachment=null;
  if($("chatMediaInput"))$("chatMediaInput").value="";
  renderAttachmentPreview();
  await loadChatMessages(true);
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
    .filter(p=>p?.user_id)
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
      await chatPresenceChannel.track({
        user_id:authUser.id,
        nick:authProfile?.display_name||"Гравець",
        avatar:authProfile?.avatar_url||null,
        online_at:new Date().toISOString()
      });
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
    chatLastSignature="";
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
  }
}

async function avatarFileToDataUrl(file){
  if(!file)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    throw new Error("Аватар має бути JPG, PNG або WEBP");
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
  const {error}=await sb.from("profiles").update(payload).eq("user_id",authUser.id);
  if(error){
    console.error(error);
    $("profileStatus").textContent="Не вдалося зберегти профіль.";
    return;
  }
  await refreshAuth();
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
$("chatInput")?.addEventListener("keydown",e=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    sendChatMessage();
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

function trainingMvp(day){
  const rows=statsForTraining(day.id);
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
  const mvp=trainingMvp(day);
  $("trainingViewMvp").textContent=mvp?.player?.name||"—";
  $("trainingViewMvpRating").textContent=mvp?fmtRating(mvp.rating):"—";
  $("trainingViewTeamAvg").textContent=fmtRating(avg);

  $("trainingViewRanking").innerHTML=rows.length?rows.map((r,i)=>{
    const p=players.find(x=>x.id===r.player_id);
    return `<div class="training-rank-row ${i===0?"mvp":""}">
      <span class="rank-place">${i+1}</span>
      <span class="rank-player"><img src="${p?.cardImage||PLAYER_PLACEHOLDER}" alt=""><b>${esc(p?.name||"Гравець")}</b>${i===0?`<small>🏆 MVP</small>`:""}</span>
      <small class="rank-extra">🎮 ${r.matches_played??day.matches_played??0} · ⚽ ${r.goals||0} · 🅰 ${r.assists||0}</small>
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

function normalizeTacticalState(raw){
  const s=cloneTacticalState(raw);
  if(!Array.isArray(s.markers))s.markers=[];
  if(!Array.isArray(s.arrows))s.arrows=[];
  if(!s.ball)s.ball={x:50,y:69,visible:true};
  s.markers=s.markers.filter(m=>m&&Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))).map((m,i)=>({
    id:m.id||uid(), type:m.type==="opponent"?"opponent":"own", n:Number(m.n)||i+1,
    x:Math.max(2,Math.min(98,Number(m.x))), y:Math.max(2,Math.min(98,Number(m.y)))
  }));
  s.arrows=s.arrows.filter(a=>a&&[a.x1,a.y1,a.x2,a.y2].every(v=>Number.isFinite(Number(v)))).map(a=>({
    id:a.id||uid(),x1:Number(a.x1),y1:Number(a.y1),x2:Number(a.x2),y2:Number(a.y2)
  }));
  s.ball={x:Math.max(2,Math.min(98,Number(s.ball.x)||50)),y:Math.max(2,Math.min(98,Number(s.ball.y)||69)),visible:s.ball.visible!==false};
  return s;
}

function tacticalPointFromEvent(e){
  const pitch=$("tacticalPitch");
  const r=pitch.getBoundingClientRect();
  return {
    x:Math.max(1,Math.min(99,((e.clientX-r.left)/r.width)*100)),
    y:Math.max(1,Math.min(99,((e.clientY-r.top)/r.height)*100))
  };
}

function setTbSelected(kind,id=null){
  tbSelected={kind,id};
  renderTacticalBoard();
}

function renderTacticalArrows(){
  const group=$("tbArrowGroup");
  if(!group)return;
  const arrows=[...(tbState.arrows||[])];
  if(tbArrowDraft)arrows.push({...tbArrowDraft,id:"draft",draft:true});
  group.innerHTML=arrows.map(a=>`<line class="tb-arrow-line ${a.draft?"draft":""}" x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" marker-end="url(#tbArrowHead)"></line>`).join("");
}

function bindTbDrag(el,kind,id){
  el.addEventListener("pointerdown",e=>{
    if(!canEditSite())return;
    e.preventDefault();e.stopPropagation();
    tbSelected={kind,id};
    tbDrag={kind,id,pointerId:e.pointerId};
    try{el.setPointerCapture(e.pointerId)}catch(_e){}
    renderTacticalBoard();
  });
  el.addEventListener("pointermove",e=>{
    if(!canEditSite()||!tbDrag||tbDrag.pointerId!==e.pointerId||tbDrag.kind!==kind||tbDrag.id!==id)return;
    e.preventDefault();
    const p=tacticalPointFromEvent(e);
    if(kind==="marker"){
      const m=tbState.markers.find(v=>v.id===id);if(m){m.x=p.x;m.y=p.y;}
    }else if(kind==="ball"){
      tbState.ball.x=p.x;tbState.ball.y=p.y;
    }
    renderTacticalBoard(false);
  });
  const end=e=>{
    if(tbDrag&&tbDrag.pointerId===e.pointerId){tbDrag=null;renderTacticalBoard();}
  };
  el.addEventListener("pointerup",end);
  el.addEventListener("pointercancel",end);
}

function renderTacticalBoard(full=true){
  const layer=$("tbMarkerLayer");
  if(!layer)return;
  if(full){
    layer.innerHTML="";
    (tbState.markers||[]).forEach(m=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className=`tb-marker ${m.type} ${tbSelected?.kind==="marker"&&tbSelected?.id===m.id?"selected":""}`;
      btn.style.left=m.x+"%";btn.style.top=m.y+"%";
      btn.textContent=m.n;
      btn.dataset.viewerAllowed="true";
      btn.setAttribute("aria-label",m.type==="own"?`Свій гравець ${m.n}`:`Суперник ${m.n}`);
      bindTbDrag(btn,"marker",m.id);
      layer.appendChild(btn);
    });
    const ball=$("tbBallObject");
    if(ball){
      ball.classList.toggle("hidden",tbState.ball?.visible===false);
      ball.classList.toggle("selected",tbSelected?.kind==="ball");
      ball.style.left=(tbState.ball?.x??50)+"%";
      ball.style.top=(tbState.ball?.y??69)+"%";
      if(!ball.dataset.dragBound){bindTbDrag(ball,"ball",null);ball.dataset.dragBound="1";}
    }
  }else{
    (tbState.markers||[]).forEach(m=>{
      const nodes=[...layer.children];
      const node=nodes.find(n=>n.textContent==String(m.n)&&n.classList.contains(m.type));
      if(node){node.style.left=m.x+"%";node.style.top=m.y+"%";}
    });
    const ball=$("tbBallObject");
    if(ball){ball.style.left=(tbState.ball?.x??50)+"%";ball.style.top=(tbState.ball?.y??69)+"%";}
  }
  renderTacticalArrows();
  const arrowBtn=$("tbArrowBtn");
  if(arrowBtn)arrowBtn.classList.toggle("active",tbArrowMode);
  refreshTacticalBoardPermissions();
}

function nextTbNumber(type){
  const nums=tbState.markers.filter(m=>m.type===type).map(m=>Number(m.n)||0);
  for(let n=1;n<=99;n++)if(!nums.includes(n))return n;
  return nums.length+1;
}

function addTbMarker(type){
  if(!canEditSite())return;
  const n=nextTbNumber(type);
  const offset=(tbState.markers.filter(m=>m.type===type).length%6)*5;
  const m={id:uid(),type,n,x:type==="own"?35+offset:65-offset,y:type==="own"?72:28};
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

$("tacticalPitch")?.addEventListener("pointerdown",e=>{
  if(!canEditSite()||!tbArrowMode)return;
  if(e.target.closest(".tb-marker,.tb-ball-object"))return;
  e.preventDefault();
  const p=tacticalPointFromEvent(e);
  tbArrowDraft={x1:p.x,y1:p.y,x2:p.x,y2:p.y,pointerId:e.pointerId};
  try{$("tacticalPitch").setPointerCapture(e.pointerId)}catch(_e){}
  renderTacticalArrows();
});
$("tacticalPitch")?.addEventListener("pointermove",e=>{
  if(!tbArrowDraft||tbArrowDraft.pointerId!==e.pointerId)return;
  e.preventDefault();const p=tacticalPointFromEvent(e);tbArrowDraft.x2=p.x;tbArrowDraft.y2=p.y;renderTacticalArrows();
});
const finishTbArrow=e=>{
  if(!tbArrowDraft||tbArrowDraft.pointerId!==e.pointerId)return;
  const a=tbArrowDraft;tbArrowDraft=null;
  const dist=Math.hypot(a.x2-a.x1,a.y2-a.y1);
  if(dist>3)tbState.arrows.push({id:uid(),x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2});
  renderTacticalBoard();
};
$("tacticalPitch")?.addEventListener("pointerup",finishTbArrow);
$("tacticalPitch")?.addEventListener("pointercancel",()=>{tbArrowDraft=null;renderTacticalArrows();});



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
    const max=Math.max(...rows.map(r=>Number(r.rating)).filter(Number.isFinite),-1);
    result[id]=new Set(rows.filter(r=>Number(r.rating)===max).map(r=>r.player_id));
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

function renderGeneralPlayers(){
  const rows=players.map(p=>({player:p,stats:generalAggregatePlayer(p)}));
  rows.sort((a,b)=>{
    const diff=(b.stats[generalStatsSort]||0)-(a.stats[generalStatsSort]||0);
    return diff || b.stats.average-a.stats.average;
  });

  $("generalPlayersSummary").textContent=`Гравців: ${players.length}`;

  $("generalPlayersRanking").innerHTML=rows.length?rows.map((x,i)=>{
    const value=generalStatsSort==="average"?(x.stats.average?x.stats.average.toFixed(2):"—"):x.stats[generalStatsSort];
    return `<button type="button" class="general-player-full-row" data-general-player="${x.player.id}" data-viewer-allowed="true">
      <span class="general-place ${i<3?`top-${i+1}`:""}">${i+1}</span>
      <img src="${x.player.cardImage||PLAYER_PLACEHOLDER}" alt="">
      <span class="general-player-info">
        <strong>${esc(x.player.name)}</strong>
        <small>Матчі ${x.stats.matches} • Голи ${x.stats.goals} • Асисти ${x.stats.assists}</small>
        <small>Ср. ${x.stats.average?x.stats.average.toFixed(1):"—"} • MVP ${x.stats.mvp}</small>
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
  return {
    events:eventIds.length,
    goals:rows.reduce((s,r)=>s+(Number(r.goals)||0),0),
    assists:rows.reduce((s,r)=>s+(Number(r.assists)||0),0),
    average:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0,
    mvp:eventIds.reduce((s,id)=>s+(mvpMap[id]?.has(player.id)?1:0),0)
  };
}

function renderGeneralAwards(){
  const now=new Date();
  $("generalAwardsMonth").textContent=generalAwardsMonthCursor.toLocaleDateString("uk-UA",{month:"long",year:"numeric"}).toUpperCase();
  const current=generalMonthKey(now)===generalMonthKey(generalAwardsMonthCursor);
  $("generalAwardsState").textContent=current?"ПОТОЧНІ ЛІДЕРИ":"ФІНАЛЬНІ НАГОРОДИ";

  const data=players.map(player=>({player,stats:generalMonthAggregate(player,generalAwardsMonthCursor)})).filter(x=>x.stats.events>0);
  const maxEvents=Math.max(0,...data.map(x=>x.stats.events));
  const eligible=data.filter(x=>x.stats.events>=Math.max(1,Math.ceil(maxEvents*.5)));
  const pick=(arr,key)=>arr.length?arr.slice().sort((a,b)=>b.stats[key]-a.stats[key])[0]:null;

  const awards=[
    ["👑","ГРАВЕЦЬ МІСЯЦЯ",pick(eligible,"average"),"average"],
    ["⚽","БОМБАРДИР",pick(data,"goals"),"goals"],
    ["🎯","АСИСТЕНТ",pick(data,"assists"),"assists"],
    ["🏆","MVP",pick(data,"mvp"),"mvp"]
  ];

  $("generalAwardsList").innerHTML=data.length?awards.map((a,i)=>{
    const x=a[2]; if(!x)return "";
    const val=a[3]==="average"?x.stats.average.toFixed(2):x.stats[a[3]];
    return `<div class="general-award-card ${i===0?"main":""}">
      <small>${a[0]} ${a[1]}</small>
      <img src="${x.player.cardImage||PLAYER_PLACEHOLDER}" alt="">
      <strong>${esc(x.player.name)}</strong>
      <b>${val}</b>
    </div>`;
  }).join(""):`<div class="empty-state"><strong>У ЦЬОМУ МІСЯЦІ СТАТИСТИКИ НЕМАЄ</strong></div>`;

  $("generalAwardsNext").disabled=generalMonthKey(generalAwardsMonthCursor)>=generalMonthKey(now);
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

function closeAuthModal(){
  authModal?.classList.add("hidden");
  document.body.classList.remove("auth-open");
  if(authStatus) authStatus.textContent="";
}

async function openAuthModal(){
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
  authModal?.classList.remove("hidden");
  document.body.classList.add("auth-open");
  setTimeout(()=>$("authEmail")?.focus(),50);
}

$("authBtn")?.addEventListener("click",openAuthModal);
$("closeAuthModal")?.addEventListener("click",closeAuthModal);
document.querySelectorAll("[data-close-auth]").forEach(el=>el.addEventListener("click",closeAuthModal));

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
    authStatus.textContent="Акаунт створено.";
    setTimeout(closeAuthModal,350);
  }else{
    authStatus.textContent="Акаунт створено. Перевір пошту для підтвердження.";
  }
});

if(sb){
  sb.auth.onAuthStateChange(()=>refreshAuth());

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
    await registerPushServiceWorker();
    await refreshAuth();
    const openTarget=new URLSearchParams(location.search).get("open");
    if(openTarget==="chat" || openTarget==="gatherings")switchScreen(openTarget);
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
  const light=theme==="light";
  const wanted=light?"home-screen-light.jpg":"home-screen.jpg";
  if(!img.src.endsWith(wanted)) img.src=wanted;
  img.dataset.themeBackground=light?"light":"dark";
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

  const profileQuery=sb.from("profiles").select("user_id,display_name,avatar_url,role,player_id").order("display_name",{ascending:true});
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
  renderPlayerAccountSettingsV589();

  // Keep chat profiles in sync with linked player IDs.
  if(accountProfilesV589.length){
    teamProfiles=new Map(accountProfilesV589.map(p=>[p.user_id,p]));
    if($("membersList"))renderMembersList();
  }
}

function renderPlayerAccountSettingsV589(){
  const mine=$("myPlayerSettingsCard");
  const links=$("adminPlayerLinksCard");
  const requests=$("playerRequestsSettingsCard");
  if(mine)mine.classList.toggle("hidden",!authUser);
  if(links)links.classList.toggle("hidden",!isAdminV589());
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
      ${(isAdminV589()||authRole==="editor")?`<button type="button" class="award-delete-btn" data-delete-award="${a.id}">ВИДАЛИТИ</button>`:""}
    </div>`).join(""):'<div class="empty-state"><strong>НАГОРОД ПОКИ НЕМАЄ</strong></div>';

  $("playerAwardAdminBox")?.classList.toggle("hidden",!(isAdminV589()||authRole==="editor"));
  box.querySelectorAll("[data-delete-award]").forEach(btn=>btn.onclick=()=>deletePlayerAwardV589(btn.dataset.deleteAward));
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
  if(!(isAdminV589()||authRole==="editor")||!currentAwardsPlayerIdV589)return;
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
  if(!(isAdminV589()||authRole==="editor"))return;
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

async function submitMyPlayerRequestV589(e){
  e.preventDefault();
  const p=myLinkedPlayerV589();if(!p)return;
  const fd=new FormData(e.currentTarget);
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
    shirt_number:fd.get("shirt_number")===""?null:Number(fd.get("shirt_number")),
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
  if(error){console.error(error);showToast("Не вдалося надіслати зміни");return;}
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
    if(error){console.error(error);showToast("Не вдалося застосувати зміни");return;}
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
    .select("user_id,display_name,avatar_url,role,player_id")
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
      .select("user_id,display_name,role,player_id")
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
