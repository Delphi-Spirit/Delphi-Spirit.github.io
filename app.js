const SUPABASE_URL="https://ajxcdgneroabkgoufjor.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_KGN1SeLryFEg9n9iaoxAag_s2OuqeFJ";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const OLD_STORAGE_KEYS=["hkstp-key-desk-v3","hkstp-key-desk-v2","hkstp-key-desk-v1"];
const FLOOR_TAGS=["通匙","B/F","G/F","1/F","2/F","3/F","4/F","5/F","6/F","R/F"],norm=v=>String(v??"").toLocaleLowerCase("zh-HK").replace(/\s+/g,"");
const FLOOR_SEARCH_TAGS=new Set(FLOOR_TAGS.filter(x=>x!=="通匙").map(norm)),colorMap={黑色:"#252b31",粉紅色:"#ee78a6",黃色:"#f1c62f",藍色:"#3488d1",紅色:"#e14b4b",綠色:"#27a86d",無:"#d7e1e6",其他:"#9b72cf"};
const el=id=>document.getElementById(id);let keys=[],activeFilter="all",searchTags=[],purposeTags=[],currentUserId=null,realtimeChannel=null;
const grid=el("keyGrid"),template=el("keyCardTemplate"),dialog=el("keyDialog"),form=el("keyForm");

function setAuthMessage(message,success=false){const node=el("authMessage");node.textContent=message;node.classList.toggle("success",success)}
function setSync(message,state=""){el("syncStatus").textContent=message;el("syncStatus").parentElement.className=`sync-bar ${state}`.trim()}
function setBusy(busy){document.body.classList.toggle("is-busy",busy)}

async function handleSession(session){
  if(!session){currentUserId=null;el("authScreen").hidden=false;el("appShell").hidden=true;return}
  if(currentUserId===session.user.id)return;
  setBusy(true);
  const {data:allowed,error}=await db.rpc("is_allowed_user");
  if(error||!allowed){await db.auth.signOut();setAuthMessage("此電郵帳戶未獲批准使用本系統。請聯絡管理員。");setBusy(false);return}
  currentUserId=session.user.id;el("userEmail").textContent=session.user.email;el("authScreen").hidden=true;el("appShell").hidden=false;
  await loadCloudKeys(true);subscribeToChanges();setBusy(false);
}

async function loadCloudKeys(allowMigration=false){
  setSync("正在同步雲端資料…","syncing");
  const {data,error}=await db.from("keys").select("*").order("created_at",{ascending:true});
  if(error){setSync(`同步失敗：${error.message}`,"error");return}
  keys=(data||[]).map(mapDbRecord);
  if(!keys.length&&allowMigration){const local=readLocalKeys();if(local.length){await importLocalKeys(local);return}}
  render();setSync("已同步雲端資料庫");
}

function mapDbRecord(r){return{id:r.id,color:r.color,purposes:r.purposes||[],number:r.number,building:r.building,block:r.block||"無",floors:r.floors||[],borrowed:r.borrowed,created_at:r.created_at}}
function toDbRecord(r){return{color:r.color,purposes:r.purposes,number:r.number,building:r.building,block:r.block,floors:r.floors,borrowed:r.borrowed}}
function migrateLocal(r){let floors=r.floors;if(!Array.isArray(floors)){const s=String(r.location||"").replace(/&/g,"／");floors=FLOOR_TAGS.filter(x=>norm(s).includes(norm(x)));floors=floors.includes("通匙")?["通匙"]:floors.length?floors:["通匙"]}let purposes=r.purposes;if(!Array.isArray(purposes))purposes=String(r.purpose||"").split(/[／/、,，]+/).map(x=>x.trim()).filter(Boolean);return{color:r.color||"其他",purposes:purposes.length?purposes:["未分類"],number:String(r.number||""),building:r.building||"2E",block:["Core 1","Core 2"].includes(r.block)?r.block:"無",floors,borrowed:!!r.borrowed}}
function readLocalKeys(){for(const name of OLD_STORAGE_KEYS){try{const value=JSON.parse(localStorage.getItem(name));if(Array.isArray(value)&&value.length)return value.map(migrateLocal)}catch{}}return[]}
async function importLocalKeys(records){setSync("正在把舊紀錄遷移到雲端…","syncing");const {error}=await db.from("keys").insert(records.map(toDbRecord));if(error){setSync(`遷移失敗：${error.message}`,"error");return}OLD_STORAGE_KEYS.forEach(k=>localStorage.removeItem(k));await loadCloudKeys(false);setSync(`已遷移 ${records.length} 項紀錄到雲端`) }
function subscribeToChanges(){if(realtimeChannel)db.removeChannel(realtimeChannel);realtimeChannel=db.channel("keys-live").on("postgres_changes",{event:"*",schema:"public",table:"keys"},()=>loadCloudKeys(false)).subscribe()}

function keyMatchesTag(k,t){const n=norm(t);if(FLOOR_SEARCH_TAGS.has(n)&&k.floors.includes("通匙"))return true;return[k.color,k.number,k.building,k.block,...k.purposes,...k.floors].some(v=>norm(v).includes(n))}function matches(k){return searchTags.every(t=>keyMatchesTag(k,t))}
function makeRemovableChip(tag,onRemove){const b=document.createElement("button");b.type="button";b.className="search-chip";const s=document.createElement("span");s.textContent=tag;const x=document.createElement("b");x.textContent="×";b.append(s,x);b.onclick=onRemove;return b}
function renderSearchTags(){const c=el("searchTags");c.replaceChildren();searchTags.forEach((t,i)=>c.append(makeRemovableChip(t,()=>{searchTags.splice(i,1);render()})));el("clearSearch").hidden=!searchTags.length}function addSearchTag(){const i=el("searchInput");i.value.split(/[,，]+/).map(x=>x.trim()).filter(Boolean).forEach(t=>{if(!searchTags.some(x=>norm(x)===norm(t)))searchTags.push(t)});i.value="";render()}
function renderPurposeTags(){const c=el("purposeTags");c.replaceChildren();purposeTags.forEach((t,i)=>c.append(makeRemovableChip(t,()=>{purposeTags.splice(i,1);renderPurposeTags()})));el("purposeError").hidden=!!purposeTags.length}function addPurposeTag(){const i=el("purposeInput");i.value.split(/[,，／/、]+/).map(x=>x.trim()).filter(Boolean).forEach(t=>{if(!purposeTags.some(x=>norm(x)===norm(t)))purposeTags.push(t)});i.value="";renderPurposeTags()}
function render(){const f=keys.filter(k=>matches(k)&&(activeFilter==="all"||(activeFilter==="borrowed")===k.borrowed));grid.replaceChildren();f.forEach(k=>grid.append(createCard(k)));renderSearchTags();el("totalCount").textContent=keys.length;el("availableCount").textContent=keys.filter(k=>!k.borrowed).length;el("borrowedCount").textContent=keys.filter(k=>k.borrowed).length;el("resultNote").textContent=searchTags.length||activeFilter!=="all"?`找到 ${f.length} 項相符紀錄`:`現有 ${keys.length} 項鎖匙紀錄`;el("emptyState").hidden=!!f.length}
function addDataChips(target,values){values.forEach(v=>{const s=document.createElement("span");s.className="data-chip";s.textContent=v;target.append(s)})}
function createCard(k){const c=template.content.firstElementChild.cloneNode(true);c.classList.toggle("is-borrowed",k.borrowed);c.querySelector(".color-dot").style.background=colorMap[k.color]||colorMap.其他;c.querySelector(".building").textContent=`${k.building} 大樓`;c.querySelector(".block-name").textContent=`· ${k.block}`;c.querySelector(".number").textContent=k.number;c.querySelector(".status-pill").textContent=k.borrowed?"已借出":"未借出";addDataChips(c.querySelector(".purpose-list"),k.purposes);addDataChips(c.querySelector(".floor-list"),k.floors);const b=c.querySelector(".status-action");b.textContent=k.borrowed?"✓ 標記為已歸還":"→ 標記為已借出";b.classList.add(k.borrowed?"btn-success":"btn-warning");b.onclick=()=>toggleBorrowed(k,b);c.querySelector(".edit-action").onclick=()=>openForm(k);c.querySelector(".delete-action").onclick=()=>confirmDelete(k);return c}
async function toggleBorrowed(k,button){button.disabled=true;setSync("正在儲存狀態…","syncing");const {error}=await db.from("keys").update({borrowed:!k.borrowed}).eq("id",k.id);if(error){setSync(`儲存失敗：${error.message}`,"error");button.disabled=false;return}await loadCloudKeys(false)}

function buildFloorOptions(selected=[]){const c=el("floorOptions");c.replaceChildren();FLOOR_TAGS.forEach(f=>{const l=document.createElement("label");l.className="floor-tag";const i=document.createElement("input");i.type="checkbox";i.value=f;i.checked=selected.includes(f);i.onchange=()=>{const a=[...c.querySelectorAll("input")];if(f==="通匙"&&i.checked)a.filter(x=>x!==i).forEach(x=>x.checked=false);if(f!=="通匙"&&i.checked)a.find(x=>x.value==="通匙").checked=false;updateFloorStyles();el("floorError").hidden=true};l.append(i,document.createTextNode(f));c.append(l)});updateFloorStyles()}function updateFloorStyles(){document.querySelectorAll(".floor-tag").forEach(l=>l.classList.toggle("selected",l.querySelector("input").checked))}function selectedFloors(){return[...el("floorOptions").querySelectorAll("input:checked")].map(i=>i.value)}
function openForm(k=null){el("dialogTitle").textContent=k?"編輯鎖匙":"新增鎖匙";el("keyId").value=k?.id||"";el("tagColor").value=k?.color||"黑色";el("keyNumber").value=k?.number||"";el("building").value=k?.building||"";el("block").value=["Core 1","Core 2"].includes(k?.block)?k.block:"無";purposeTags=[...(k?.purposes||[])];renderPurposeTags();buildFloorOptions(k?.floors||[]);el("floorError").hidden=true;el("saveError").hidden=true;dialog.showModal();setTimeout(()=>el("keyNumber").focus(),0)}function closeForm(){dialog.close();form.reset();purposeTags=[]}
function confirmDelete(k){const d=el("confirmDialog");el("confirmText").textContent=`將永久刪除 ${k.building} 大樓 ${k.block} #${k.number}。此動作無法還原。`;d.showModal();d.addEventListener("close",async()=>{if(d.returnValue==="confirm"){setSync("正在刪除紀錄…","syncing");const {error}=await db.from("keys").delete().eq("id",k.id);if(error)setSync(`刪除失敗：${error.message}`,"error");else await loadCloudKeys(false)}},{once:true})}

form.addEventListener("submit",async e=>{e.preventDefault();if(el("purposeInput").value.trim())addPurposeTag();if(!form.reportValidity())return;const floors=selectedFloors();if(!purposeTags.length){el("purposeError").hidden=false;return}if(!floors.length){el("floorError").hidden=false;return}const id=el("keyId").value,record={color:el("tagColor").value,number:el("keyNumber").value.trim(),purposes:[...purposeTags],building:el("building").value,block:el("block").value,floors,borrowed:keys.find(k=>k.id===id)?.borrowed||false};el("saveKeyBtn").disabled=true;const query=id?db.from("keys").update(record).eq("id",id):db.from("keys").insert(record);const {error}=await query;el("saveKeyBtn").disabled=false;if(error){el("saveError").textContent=`儲存失敗：${error.message}`;el("saveError").hidden=false;return}closeForm();await loadCloudKeys(false)});

el("authForm").addEventListener("submit",async e=>{e.preventDefault();setAuthMessage("正在登入…",true);const {error}=await db.auth.signInWithPassword({email:el("authEmail").value.trim(),password:el("authPassword").value});if(error)setAuthMessage(`登入失敗：${error.message}`)});
el("signUpBtn").onclick=async()=>{if(!el("authForm").reportValidity())return;setAuthMessage("正在建立帳戶…",true);const {data,error}=await db.auth.signUp({email:el("authEmail").value.trim(),password:el("authPassword").value,options:{emailRedirectTo:"https://delphi-spirit.github.io/"}});if(error){setAuthMessage(`建立失敗：${error.message}`);return}if(data.session)await handleSession(data.session);else setAuthMessage("帳戶已建立，請到電郵信箱確認後再登入。",true)};
el("signOutBtn").onclick=()=>db.auth.signOut();el("addKeyBtn").onclick=()=>openForm();el("closeDialogBtn").onclick=closeForm;el("cancelBtn").onclick=closeForm;el("clearSearch").onclick=()=>{searchTags=[];render()};
el("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addSearchTag()}else if(e.key==="Backspace"&&!e.currentTarget.value&&searchTags.length){searchTags.pop();render()}});el("purposeInput").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addPurposeTag()}else if(e.key==="Backspace"&&!e.currentTarget.value&&purposeTags.length){purposeTags.pop();renderPurposeTags()}});el("purposeInput").addEventListener("blur",()=>{if(el("purposeInput").value.trim())addPurposeTag()});document.querySelectorAll(".filter").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b));render()});

db.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){currentUserId=null;el("authScreen").hidden=false;el("appShell").hidden=true}else if(session)setTimeout(()=>handleSession(session),0)});
db.auth.getSession().then(({data})=>handleSession(data.session));
