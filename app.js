
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
      .select("user_id,display_name,avatar_url,role")
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
function playerViewSlide(index){
  const slider=$("playerViewSlider");
  if(!slider)return;
  slider.style.transform=`translateX(-${index*50}%)`;
  $("playerInfoTab")?.classList.toggle("active",index===0);
  $("playerStatsTab")?.classList.toggle("active",index===1);
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
    sb.from("training_player_stats").select("rating,goals,assists,training_day_id,training_days(training_date,matches_played,gathering_id)").eq("player_id",playerId)
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
  const trMatches=training.reduce((sum,r)=>sum+(Number(r.training_days?.matches_played)||0),0);

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
}

function openPlayerModal(id=null){
  resetPlayerModal();
  if(id){
    const p=players.find(x=>x.id===id);if(!p)return;
    editPlayerId=id;
    currentCardImage=p.cardImage||"";
    fillViewMode(p);
  }
  $("playerDialog").showModal();
  refreshEditOnlyVisibility();
}

$("playerInfoTab")?.addEventListener("click",()=>playerViewSlide(0));
$("playerStatsTab")?.addEventListener("click",()=>playerViewSlide(1));
let playerSwipeStartX=null;
$("playerViewSlider")?.addEventListener("touchstart",e=>{playerSwipeStartX=e.touches?.[0]?.clientX??null},{passive:true});
$("playerViewSlider")?.addEventListener("touchend",e=>{
  if(playerSwipeStartX==null)return;
  const x=e.changedTouches?.[0]?.clientX??playerSwipeStartX;
  const dx=x-playerSwipeStartX;
  if(dx<-45)playerViewSlide(1);
  if(dx>45)playerViewSlide(0);
  playerSwipeStartX=null;
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
    players=await getAll("players");
    $("playerDialog").close();renderPlayers();renderPitch();
    showToast(editPlayerId?"Гравця оновлено":"Гравця додано");
  }catch(err){
    console.error(err);
    showToast("Не вдалося зберегти гравця");
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
  $("pickerDialog").showModal();
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
    const obj={id:uid(),name:name.trim()||"Склад",formation:formationName(currentFormation),createdAt:Date.now(),image};

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
  ctx.fillStyle="#08090b";ctx.fillRect(0,0,W,H);
  const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,"#180b0b");grad.addColorStop(.5,"#090a0b");grad.addColorStop(1,"#15100b");ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#e2bd70";ctx.font="bold 16px Arial";ctx.fillText("CENTURIA ATHLETICS",38,42);
  ctx.fillStyle="#f3e6cd";ctx.font="bold 30px Arial";ctx.fillText(name.toUpperCase(),38,82);
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
function openSavedImage(s){
  currentSavedImage=s;
  $("savedImageView").src=s.image;
  $("imageDialog").showModal();
}
$("closeImage").addEventListener("click",()=>$("imageDialog").close());
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

  const [{data:gData,error:gErr},{data:vData,error:vErr}]=await Promise.all([
    sb.from("gatherings")
      .select("id,title,gathering_date,gathering_time,note,is_closed,created_by,created_at")
      .order("gathering_date",{ascending:true})
      .order("gathering_time",{ascending:true}),
    sb.from("gathering_votes")
      .select("gathering_id,user_id,vote,updated_at")
  ]);

  if(gErr || vErr){
    console.error("Gatherings load error",gErr||vErr);
    const list=$("gatheringsList");
    if(list)list.innerHTML=`<div class="gatherings-empty">Не вдалося завантажити збори.</div>`;
    return;
  }

  gatherings=gData||[];
  gatheringVotes=vData||[];
  await loadTeamProfiles();
  renderGatherings();
  if($("screen-home")?.classList.contains("active"))loadHomeNextEvent();
}

function votesForGathering(id){
  return gatheringVotes.filter(v=>v.gathering_id===id);
}

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
    </article>`;
  }).join("");

  list.querySelectorAll("[data-vote]").forEach(btn=>{
    btn.addEventListener("click",()=>voteGathering(btn.dataset.gathering,btn.dataset.vote));
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
  return `<span class="chat-avatar chat-avatar-fallback ${extraClass}">${esc(initials(profile?.display_name))}</span>`;
}

async function loadTeamProfiles(){
  if(!sb || !authUser){
    teamProfiles=new Map();
    return;
  }
  const {data,error}=await sb.from("profiles")
    .select("user_id,display_name,avatar_url,role");
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
    return `<div class="member-row">
      ${profileAvatarHtml(p,"member-avatar")}
      <div class="member-main">
        <div class="member-nick">${esc(p.display_name||"Гравець")}</div>
        <div class="member-state ${online?"online":"offline"}">
          <span class="member-state-dot"></span>
          ${online?"ОНЛАЙН":"ОФЛАЙН"}
        </div>
      </div>
      ${p.role==="admin"?`<span class="member-role admin">ADMIN</span>`:p.role==="editor"?`<span class="member-role">EDITOR</span>`:""}
    </div>`;
  }).join("");
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
  renderHomeMvp();
}

function renderHomeMvp(){
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
$("homeMvpCard")?.addEventListener("click",openHomeMvp);

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
      <small class="rank-extra">⚽ ${r.goals||0} · 🅰 ${r.assists||0}</small>
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
      rating:document.querySelector(`[data-training-rating="${p.id}"]`)?.value||"",
      goals:document.querySelector(`[data-training-goals="${p.id}"]`)?.value||"",
      assists:document.querySelector(`[data-training-assists="${p.id}"]`)?.value||""
    })).filter(r=>r.rating!==""||r.goals!==""||r.assists!=="").map(r=>({
      training_day_id:day.id,
      player_id:r.player_id,
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
    matches=eventIds.reduce((sum,id)=>sum+(Number(trainingDays.find(d=>d.id===id)?.matches_played)||0),0);
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
    ["⭐","НАЙВИЩА ОЦІНКА",single,x=>Number(x.row.rating)||0,x=>(Number(x.row.rating)||0).toFixed(1)],
    ["⚽","НАЙБІЛЬШЕ ГОЛІВ ЗА ГРУ",single,x=>Number(x.row.goals)||0,x=>`${Number(x.row.goals)||0}`],
    ["🎯","НАЙБІЛЬШЕ АСИСТІВ ЗА ГРУ",single,x=>Number(x.row.assists)||0,x=>`${Number(x.row.assists)||0}`],
    ["🔥","НАЙДОВША ГОЛЬОВА СЕРІЯ",perPlayer,x=>x.streaks.goal.best,x=>`${x.streaks.goal.best}`],
    ["🎯","НАЙДОВША СЕРІЯ АСИСТІВ",perPlayer,x=>x.streaks.assist.best,x=>`${x.streaks.assist.best}`],
    ["🤝","НАЙДОВША РЕЗУЛЬТАТИВНА СЕРІЯ",perPlayer,x=>x.streaks.contribution.best,x=>`${x.streaks.contribution.best}`],
    ["⭐","НАЙДОВША СЕРІЯ 8.0+",perPlayer,x=>x.streaks.eight.best,x=>`${x.streaks.eight.best}`],
    ["🏆","НАЙБІЛЬШЕ MVP",perPlayer,x=>x.stats.mvp,x=>`${x.stats.mvp}`],
    ["⚽","НАЙБІЛЬШЕ ГОЛІВ",perPlayer,x=>x.stats.goals,x=>`${x.stats.goals}`],
    ["🎯","НАЙБІЛЬШЕ АСИСТІВ",perPlayer,x=>x.stats.assists,x=>`${x.stats.assists}`],
    ["👑","НАЙВИЩА СЕРЕДНЯ",perPlayer.filter(x=>x.stats.eventCount>=10),x=>x.stats.average,x=>x.stats.average.toFixed(2)]
  ];

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
    ["СЕРЕДНЯ ОЦІНКА",A.average,B.average,true],
    ["НАЙКРАЩА ОЦІНКА",A.best,B.best,true],
    ["НАЙГІРША ОЦІНКА",A.worst,B.worst,true],
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
      <small>ФОРМА ОСТАННІХ 5</small>
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
  const value=theme==="light"?"light":"dark";
  document.documentElement.dataset.siteTheme=value;
  document.documentElement.classList.toggle("light-theme",value==="light");
  document.documentElement.classList.toggle("dark-theme",value==="dark");
  if(document.body){
    document.body.dataset.siteTheme=value;
    document.body.classList.toggle("light-theme",value==="light");
    document.body.classList.toggle("dark-theme",value==="dark");
  }
  try{localStorage.setItem(SITE_THEME_KEY,value)}catch(_e){}
  document.querySelectorAll("[data-theme-value]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.themeValue===value);
  });
  // Force Safari/PWA to recalculate theme styles immediately.
  void document.documentElement.offsetHeight;
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
