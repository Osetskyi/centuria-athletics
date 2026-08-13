
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




function canEditSite(){
  return authRole === "admin" || authRole === "editor";
}

function applyPermissions(){
  const editable = canEditSite();
  ["addPlayerBtn","addPlayerBig","saveLineupBtn","newLineupBtn","clearPlayersBtn","clearSquadsBtn","editPlayerBtn","viewDeletePlayerBtn","deletePlayerBtn"].forEach(id=>{
    const el=$(id);
    if(el) el.classList.toggle("permission-hidden", !editable);
  });

  document.body.classList.toggle("read-only", !editable);
  refreshEditOnlyVisibility();

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
  nav.classList.toggle("hidden-nav",name==="home");
  nav.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
  if(name==="players") renderPlayers();
  if(name==="tactics") renderPitch();
  if(name==="squads") renderSquads();
  if(name==="chat") openChatScreen();
  if(name==="gatherings") openGatheringsScreen();
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
    .subscribe();
}

(async function(){
  try{
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
});
