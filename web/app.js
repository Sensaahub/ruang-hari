import { initCloud } from './auth-cloud.js';
import { initPwa } from './pwa.js';
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const KEY = 'ruang-hari-v1';
  const categories = [
    {id:'pribadi',label:'Pribadi',color:'#9a8bbd',bg:'#f2eef9',ink:'#9683b8'},
    {id:'kerja',label:'Kerja',color:'#7e9bc8',bg:'#edf2fb',ink:'#7793bc'},
    {id:'kesehatan',label:'Kesehatan',color:'#86a99b',bg:'#edf5f0',ink:'#80a08e'},
    {id:'belajar',label:'Belajar',color:'#c5a36f',bg:'#f8f3e9',ink:'#b29970'},
    {id:'keuangan',label:'Keuangan',color:'#a6ad7e',bg:'#f3f4e9',ink:'#98a170'},
    {id:'rumah',label:'Rumah & keluarga',color:'#c59d8f',bg:'#f9efeb',ink:'#b99486'}
  ];
  const statuses = [{id:'plan',label:'Rencana',empty:'Ruang untuk rencana baru.',hint:'Tulis hal yang ingin kamu kerjakan.'},{id:'doing',label:'Dikerjakan',empty:'Satu langkah untuk mulai.',hint:'Pindahkan tugas yang sedang kamu kerjakan.'},{id:'done',label:'Selesai',empty:'Kemajuanmu akan ada di sini.',hint:'Rayakan setiap tugas yang selesai.'}];
  const priorityLabels = {high:'Penting',normal:'Biasa',low:'Santai'};
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const offsetDate = n => {const d = new Date(); d.setDate(d.getDate()+n); return localDate(d);};
  const uid = () => crypto.randomUUID();
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let tasks = [], view = 'all', categoryFilter = '', query = '', sort = 'manual', editingId = null, draftChecks = [], dragId = null, toastTimer, undoAction;
  let storageAvailable = true;
  let cloud = null, undoAccount = null, editingSnapshot = null;
  let cloudState = {user:null,locked:true,phase:'local'};
  function validDate(s) {if(s==='')return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00');return !isNaN(d)&&localDate(d)===s;}
  function validateTask(t) {return t&&typeof t.id==='string'&&t.id.length>0&&t.id.length<100&&typeof t.title==='string'&&t.title.trim().length>0&&t.title.length<=160&&typeof t.notes==='string'&&t.notes.length<=5000&&categories.some(c=>c.id===t.category)&&statuses.some(s=>s.id===t.status)&&Object.hasOwn(priorityLabels,t.priority)&&typeof t.due==='string'&&validDate(t.due)&&Array.isArray(t.checks)&&t.checks.length<=100&&t.checks.every(c=>c&&typeof c.text==='string'&&c.text.length<=200&&typeof c.done==='boolean');}
  function cleanTask(t) {return {id:t.id,title:t.title.trim(),notes:t.notes,category:t.category,status:t.status,priority:t.priority,due:t.due,checks:t.checks.map(c=>({text:c.text,done:c.done})),demo:t.demo===true};}
  function notify(message, undo) {clearTimeout(toastTimer);$('#toast-message').textContent=message;undoAction=undo;undoAccount=cloud?.accountId||'local';$('#toast-undo').hidden=!undo;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;undoAction=null;},undo?12000:6500);}
  function sync() {
    if(cloud?.active){try{cloud.save(tasks);}catch(error){tasks=cloud.tasks;render();notify(error.message);return false;}}
    else {tasks=[];render();notify('Masuk terlebih dulu untuk mengelola tugas.');return false;}
    render();return true;
  }
  function filteredTasks() {return tasks.filter(t=>(!categoryFilter||t.category===categoryFilter)&&(!query||`${t.title} ${t.notes} ${categories.find(c=>c.id===t.category).label}`.toLocaleLowerCase('id').includes(query))&&(view==='all'||(t.status!=='done'&&t.due&&(view==='today'?t.due===localDate():t.due>=localDate()&&t.due<=offsetDate(6)))));}
  function dateLabel(due) {if(due===localDate())return 'Hari ini';if(due===offsetDate(1))return 'Besok';return new Date(due+'T12:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',...(due.slice(0,4)!==String(new Date().getFullYear())?{year:'numeric'}:{})});}
  function card(t) {const c=categories.find(c=>c.id===t.category);const complete=t.checks.filter(c=>c.done).length;const overdue=t.status!=='done'&&t.due&&t.due<localDate();return `<article class="task-card" draggable="true" tabindex="0" role="button" aria-label="Buka tugas: ${esc(t.title)}" data-id="${esc(t.id)}"><div class="card-top"><span class="category-tag" style="--tag-bg:${c.bg};--tag-ink:${c.ink};--category:${c.color}"><span class="category-dot"></span>${c.label}</span><span class="card-options" aria-hidden="true">${t.status==='done'?icon('check'):'···'}</span></div><h4>${esc(t.title)}</h4>${t.notes?`<p class="card-note">${esc(t.notes)}</p>`:''}${t.checks.length?`<div class="card-steps">${icon('check')}<span>${complete}/${t.checks.length} langkah</span><div class="card-step-track"><span style="width:${complete/t.checks.length*100}%"></span></div></div>`:''}<div class="card-bottom"><span class="card-date ${overdue?'overdue':t.due===localDate()&&t.status!=='done'?'today':''}">${icon('calendar')}${t.due?`${overdue?'Lewat · ':''}${dateLabel(t.due)}`:'Tanpa tenggat'}</span><span class="priority ${t.priority}"><span></span>${priorityLabels[t.priority]}</span></div></article>`;}
  function render() {
    const active=tasks.filter(t=>t.status!=='done'), done=tasks.length-active.length;
    $('#all-count').textContent=tasks.length;$('#today-count').textContent=active.filter(t=>t.due===localDate()).length;
    $('#stat-active').textContent=active.length;$('#stat-today').textContent=active.filter(t=>t.due===localDate()).length;$('#stat-progress').textContent=`${done}/${tasks.length}`;$('#progress-bar').style.width=`${tasks.length?done/tasks.length*100:0}%`;
    $('#demo-banner').hidden=!tasks.some(t=>t.demo);
    $('#category-nav').innerHTML=categories.map(c=>`<button class="category-button ${categoryFilter===c.id?'active':''}" data-category="${c.id}" aria-pressed="${categoryFilter===c.id}" style="--category:${c.color}"><span class="category-dot"></span>${c.label}<span class="category-total">${active.filter(t=>t.category===c.id).length}</span></button>`).join('');
    $$('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
    const filtered=filteredTasks();const rank={high:0,normal:1,low:2};if(sort==='due')filtered.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));if(sort==='priority')filtered.sort((a,b)=>rank[a.priority]-rank[b.priority]);
    $('#board-title').textContent={all:'Semua tugas',today:'Hari ini',week:'7 hari ke depan'}[view];$('#result-count').textContent=`${filtered.length} tugas`;
    $('#active-filter').hidden=!categoryFilter;$('#active-filter').innerHTML=categoryFilter?`<span class="filter-chip">${categories.find(c=>c.id===categoryFilter).label}<button aria-label="Hapus filter kategori" id="clear-filter">×</button></span>`:'';
    $('#board').innerHTML=statuses.map(s=>{const cards=filtered.filter(t=>t.status===s.id);return `<section class="column ${s.id}" data-status="${s.id}" aria-label="${s.label}"><header class="column-head"><span class="status-dot"></span><h3>${s.label}</h3><span class="column-count">${cards.length}</span><button class="icon-button" data-add="${s.id}" aria-label="Tambah tugas di ${s.label}">${icon('plus')}</button></header><div class="cards">${cards.length?cards.map(card).join(''):`<div class="empty-column">${icon(s.id==='done'?'check':s.id==='doing'?'sun':'folder')}<p>${query||categoryFilter||view!=='all'?'Tidak ada tugas yang cocok.':s.empty}</p><small>${query||categoryFilter||view!=='all'?'Coba ubah pencarian atau filter.':s.hint}</small></div>`}</div><button class="add-column" data-add="${s.id}">${icon('plus')}Tambah tugas</button></section>`;}).join('');
    $('.local-status').replaceChildren(Object.assign(document.createElement('span')),document.createTextNode(cloudState.user?(cloudState.phase==='synced'?'Tersimpan di akun':'Salinan perangkat dipertahankan'):(storageAvailable?'Tersimpan di browser ini':'Belum tersimpan · unduh cadangan')));
    $('#new-task').disabled=cloudState.locked;
    $('#board').inert=cloudState.locked;
    $('#board').classList.toggle('board-locked',cloudState.locked);
  }
  function setView(next) {view=next;render();closeSidebar();}
  function closeSidebar() {$('#sidebar').classList.remove('open');$('#sidebar-scrim').classList.remove('open');$('#menu-open').setAttribute('aria-expanded','false');}
  const form=$('#task-form'), dialog=$('#task-dialog');
  function openTask(id=null,status='plan') {if(!cloud?.active||cloud.locked){notify('Tunggu sinkronisasi atau selesaikan perubahan akun terlebih dulu.');return;}editingId=id;const task=tasks.find(t=>t.id===id);editingSnapshot=task?JSON.stringify(task):null;form.reset();$('#dialog-title').textContent=task?'Detail tugas':'Tambah tugas';$('#delete-task').hidden=!task;form.elements.title.value=task?.title||'';form.elements.notes.value=task?.notes||'';form.elements.category.value=task?.category||categoryFilter||'pribadi';form.elements.status.value=task?.status||status;form.elements.priority.value=task?.priority||'normal';form.elements.due.value=task?.due||(view==='today'?localDate():'');draftChecks=task?task.checks.map(c=>({...c})):[];$('#check-new').value='';renderChecks();dialog.showModal();}
  function renderChecks() {$('#checklist-editor').innerHTML=draftChecks.map((c,i)=>`<div class="check-row ${c.done?'completed':''}"><input type="checkbox" data-check="${i}" ${c.done?'checked':''} aria-label="Tandai langkah ${i+1} selesai"><input type="text" data-check-text="${i}" value="${esc(c.text)}" maxlength="200" aria-label="Teks langkah ${i+1}"><button class="icon-button" type="button" data-remove-check="${i}" aria-label="Hapus langkah ${i+1}">${icon('close')}</button></div>`).join('');$('#check-progress').textContent=draftChecks.length?`${draftChecks.filter(c=>c.done).length}/${draftChecks.length}`:'';}
  function addCheck() {const input=$('#check-new');if(!input.value.trim())return;if(draftChecks.length>=100){notify('Maksimal 100 langkah per tugas.');return;}draftChecks.push({text:input.value.trim(),done:false});input.value='';renderChecks();input.focus();}
  $('#task-category').innerHTML=categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.elements.title.value.trim()){form.elements.title.setCustomValidity('Tulis nama tugas terlebih dulu.');form.elements.title.reportValidity();return;}const previous=tasks.find(t=>t.id===editingId);if(cloud?.locked){notify('Selesaikan sinkronisasi akun terlebih dulu.');return;}if(editingId&&JSON.stringify(previous)!==editingSnapshot){notify('Tugas ini telah berubah. Tutup detail lalu buka kembali sebelum mengedit.');return;}const t={id:editingId||uid(),title:form.elements.title.value.trim(),notes:form.elements.notes.value.trim(),category:form.elements.category.value,status:form.elements.status.value,priority:form.elements.priority.value,due:form.elements.due.value,checks:draftChecks.filter(c=>c.text.trim()).map(c=>({...c,text:c.text.trim()})),demo:false};if(!validateTask(t)){notify('Ada detail tugas yang belum valid. Periksa kembali.');return;}if(previous)tasks[tasks.indexOf(previous)]=t;else tasks.push(t);if(!sync())return;dialog.close();notify(previous?'Perubahan tugas disimpan.':'Tugas baru ditambahkan.');});
  form.elements.title.addEventListener('input',()=>form.elements.title.setCustomValidity(''));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
  $('#new-task').addEventListener('click',()=>openTask());
  $('#delete-task').addEventListener('click',()=>{const i=tasks.findIndex(t=>t.id===editingId);if(i<0)return;if(cloud?.locked||JSON.stringify(tasks[i])!==editingSnapshot){notify('Tugas berubah. Buka kembali detailnya sebelum menghapus.');return;}const [removed]=tasks.splice(i,1);if(!sync())return;dialog.close();notify('Tugas dihapus.',()=>{if(!tasks.some(t=>t.id===removed.id)){tasks.splice(Math.min(i,tasks.length),0,removed);sync();}});});
  $('#check-add').addEventListener('click',addCheck);$('#check-new').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addCheck();}});
  $('#checklist-editor').addEventListener('change',e=>{if(e.target.matches('[data-check]')){draftChecks[+e.target.dataset.check].done=e.target.checked;renderChecks();}});
  $('#checklist-editor').addEventListener('input',e=>{if(e.target.matches('[data-check-text]'))draftChecks[+e.target.dataset.checkText].text=e.target.value;});
  $('#checklist-editor').addEventListener('click',e=>{const b=e.target.closest('[data-remove-check]');if(b){draftChecks.splice(+b.dataset.removeCheck,1);renderChecks();}});
  $('#board').addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add)openTask(null,add.dataset.add);else{const card=e.target.closest('[data-id]');if(card)openTask(card.dataset.id);}});
  $('#board').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.task-card')){e.preventDefault();openTask(e.target.dataset.id);}});
  $('#board').addEventListener('dragstart',e=>{const card=e.target.closest('.task-card');if(!card)return;dragId=card.dataset.id;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
  $('#board').addEventListener('dragover',e=>{if(!dragId)return;const col=e.target.closest('.column');if(col){e.preventDefault();e.dataTransfer.dropEffect='move';$$('.column').forEach(c=>c.classList.toggle('drag-over',c===col));}});
  $('#board').addEventListener('drop',e=>{e.preventDefault();const col=e.target.closest('.column');const t=tasks.find(t=>t.id===dragId);if(!col||!t)return;const oldStatus=t.status;const oldIndex=tasks.indexOf(t);tasks.splice(oldIndex,1);t.status=col.dataset.status;t.demo=false;const target=e.target.closest('.task-card');const targetIndex=target?tasks.findIndex(x=>x.id===target.dataset.id):-1;let insertion=tasks.length;if(targetIndex>=0){const rect=target.getBoundingClientRect();insertion=targetIndex+(e.clientY>rect.top+rect.height/2?1:0);}tasks.splice(insertion,0,t);dragId=null;if(!sync())return;if(oldStatus!==t.status)notify(`Dipindahkan ke ${statuses.find(s=>s.id===t.status).label}.`,()=>{const latest=tasks.find(x=>x.id===t.id);if(latest&&latest.status===t.status){latest.status=oldStatus;sync();}});});
  $('#board').addEventListener('dragend',()=>{dragId=null;$$('.dragging').forEach(c=>c.classList.remove('dragging'));$$('.drag-over').forEach(c=>c.classList.remove('drag-over'));});
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#category-nav').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){categoryFilter=categoryFilter===b.dataset.category?'':b.dataset.category;render();closeSidebar();}});
  $('#active-filter').addEventListener('click',e=>{if(e.target.closest('#clear-filter')){categoryFilter='';render();}});
  $$('.brand').forEach(brand=>brand.addEventListener('click',e=>{e.preventDefault();categoryFilter='';query='';$('#search').value='';setView('all');}));
  $('#search').addEventListener('input',e=>{query=e.target.value.trim().toLocaleLowerCase('id');render();});
  $('#sort').addEventListener('change',e=>{sort=e.target.value;render();});
  $('#clear-demo').addEventListener('click',()=>{const removed=tasks.filter(t=>t.demo);tasks=tasks.filter(t=>!t.demo);if(!sync())return;notify('Tugas contoh dihapus. Ruangmu siap diisi.',()=>{const existing=new Set(tasks.map(t=>t.id));tasks.push(...removed.filter(t=>!existing.has(t.id)));sync();});});
  $('#toast-undo').addEventListener('click',()=>{const action=undoAction;const sameAccount=undoAccount===(cloud?.accountId||'local');$('#toast').hidden=true;undoAction=null;clearTimeout(toastTimer);if(sameAccount&&!cloud?.locked)action?.();});
  $('#toast-close').addEventListener('click',()=>{$('#toast').hidden=true;clearTimeout(toastTimer);undoAction=null;});
  $('#menu-open').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#sidebar-scrim').classList.toggle('open',open);$('#menu-open').setAttribute('aria-expanded',String(open));});
  $('#sidebar-scrim').addEventListener('click',closeSidebar);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();});
  const backupDialog=$('#backup-dialog');$('#backup-open').addEventListener('click',()=>{closeSidebar();backupDialog.showModal();});$('[data-close-backup]').addEventListener('click',()=>backupDialog.close());
  $('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'ruang-hari',version:1,exportedAt:new Date().toISOString(),tasks},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ruang-hari-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Cadangan sudah diunduh.');});
  $('#import-data').addEventListener('change',async e=>{const file=e.target.files[0],importAccount=cloud?.accountId;if(!file||!cloud?.active)return;try{if(file.size>10*1024*1024)throw Error();const data=JSON.parse(await file.text());if(!cloud?.active||cloud.accountId!==importAccount){notify('Akun berubah. Silakan pilih ulang file cadangan.');return;}if(data.app!=='ruang-hari'||data.version!==1||!Array.isArray(data.tasks)||data.tasks.length>10000||!data.tasks.every(validateTask))throw Error();const seen=new Set(tasks.map(t=>t.id));const added=[];for(const raw of data.tasks){if(!seen.has(raw.id)){seen.add(raw.id);added.push({...cleanTask(raw),demo:false});}}if(tasks.length+added.length>10000)throw Error();tasks.push(...added);if(!sync())return;backupDialog.close();notify(`${added.length} tugas berhasil diimpor.`,()=>{const ids=new Set(added.map(t=>t.id));tasks=tasks.filter(t=>!ids.has(t.id));sync();});}catch{notify('File cadangan tidak valid. Pilih file JSON dari Ruang Hari.');}finally{e.target.value='';}});
  $('#greeting-date').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  render();
  const initialGuestTasks=structuredClone(tasks);
  const readLocalTasks=()=>{try{const data=JSON.parse(localStorage.getItem(KEY));return Array.isArray(data?.tasks)&&data.tasks.every(validateTask)?data.tasks.map(cleanTask):structuredClone(initialGuestTasks);}catch{return structuredClone(initialGuestTasks);}};
  cloud=initCloud({
    validate:validateTask,notify,getTasks:()=>tasks,getLocalTasks:readLocalTasks,
    replaceTasks:incoming=>{tasks=incoming.map(cleanTask);return sync();},
    onData:incoming=>{tasks=incoming===null?[]:incoming.map(cleanTask);render();},
    onState:state=>{if((cloudState.user?.id||null)!==(state.user?.id||null)){undoAction=null;$('#toast').hidden=true;query='';$('#search').value='';}if(!state.user)tasks=[];cloudState=state;render();}
  });
  initPwa(notify);
  // Refresh date-based views after midnight or returning to a backgrounded tab.
  let currentDay=localDate();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentDay!==localDate()){currentDay=localDate();$('#greeting-date').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});render();}});
})();
