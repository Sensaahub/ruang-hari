import { createClient } from '@supabase/supabase-js';
import { cloudConfig } from './config.js';
import { CloudStore } from './cloud-store.js';

export function initCloud({validate,onData,onState,notify,getTasks,getLocalTasks,replaceTasks}){
  const $=s=>document.querySelector(s);
  const accountDialog=$('#account-dialog'),status=$('#cloud-status');
  let client,store,channel,activeId=null,current={user:null,phase:'local',locked:false,pending:false};
  const configured=!!(cloudConfig.url&&cloudConfig.key);
  const labels={local:'Hanya di perangkat ini',loading:'Memuat tugas akun…',synced:'Tersinkron dengan akun',pending:'Menyinkronkan perubahan…',offline:'Offline · perubahan menunggu',error:'Sinkronisasi perlu diperiksa',conflict:'Ada perubahan di perangkat lain'};
  const renderState=state=>{
    current=state;
    $('#account-summary').textContent=state.user?state.user.email:'Masuk agar tugas di laptop dan HP terhubung.';
    $('#account-trigger').textContent=state.user?'Akun & sinkronisasi':'Masuk & sinkronkan';
    $('#email-form').hidden=!configured||!!state.user;
    $('#cloud-setup-needed').hidden=configured;
    $('#signed-in-actions').hidden=!state.user;
    $('#sync-state-detail').textContent=labels[state.phase]||state.phase;
    $('#sync-error-detail').textContent=state.error?friendlyError(state.error):'';
    $('#sync-error-detail').hidden=!state.error;
    $('#cloud-conflict').hidden=state.phase!=='conflict';
    $('#conflict-banner').hidden=state.phase!=='conflict';
    $('#merge-local').disabled=state.locked;
    $('#merge-local-count').textContent=getLocalTasks().filter(t=>!t.demo).length;
    $('#cloud-state-banner').hidden=!state.user||!state.locked||state.phase==='conflict';
    $('#cloud-state-text').textContent=labels[state.phase]||'';
    status.textContent=labels[state.phase]||'';
    status.dataset.phase=state.phase;
    onState({...state,configured,label:labels[state.phase]});
  };
  function friendlyError(message){
    if(/fetch|network|offline|load failed/i.test(message))return 'Koneksi ke server belum tersedia. Coba lagi setelah internet kembali.';
    if(/relation|function.*not|schema cache/i.test(message))return 'Database belum siap. Hubungi pengelola aplikasi untuk menyelesaikan konfigurasi.';
    return 'Sinkronisasi belum selesai. Salinan di perangkat tetap dipertahankan. Coba lagi atau unduh cadangan.';
  }
  $('#account-trigger').addEventListener('click',()=>accountDialog.showModal());
  $('#close-account').addEventListener('click',()=>accountDialog.close());
  $('#open-conflict').addEventListener('click',()=>accountDialog.showModal());
  $('#sync-retry').addEventListener('click',()=>store?.refresh());
  $('#banner-retry').addEventListener('click',()=>store?.refresh());
  $('#local-cloud-backup').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({app:'ruang-hari',version:1,tasks:getTasks()},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='ruang-hari-sebelum-konflik.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  for(const choice of ['local','remote'])$(`#use-${choice}`).addEventListener('click',()=>{try{store.resolve(choice);notify(choice==='local'?'Versi perangkat ini dipilih. Menunggu sinkronisasi.':'Versi dari akun sudah dipakai.');}catch{notify('Tidak bisa menyimpan perubahan. Unduh cadangan terlebih dulu.');}});
  $('#merge-local').addEventListener('click',()=>{
    if(!store||current.locked)return;
    const incoming=getLocalTasks().filter(t=>!t.demo),existing=new Set(getTasks().map(t=>t.id));
    const added=incoming.filter(t=>!existing.has(t.id)).map(t=>({...t,demo:false}));
    if(!added.length){notify('Tidak ada tugas lokal baru untuk digabungkan.');return;}
    if(replaceTasks([...getTasks(),...added]))notify(`${added.length} tugas lokal dimasukkan ke akun.`);
  });
  $('#email-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;const button=$('#send-login');button.disabled=true;$('#login-feedback').textContent='Mengirim tautan masuk…';
    try{
      const {error}=await client.auth.signInWithOtp({email:$('#login-email').value.trim(),options:{emailRedirectTo:new URL('./',location.href).href}});
      if(error)throw error;
      $('#login-feedback').textContent='Tautan masuk sudah dikirim. Buka email di perangkat ini, lalu klik tautannya.';
    }catch(error){$('#login-feedback').textContent=/rate limit|too many/i.test(error.message)?'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.':'Tautan belum terkirim. Periksa email dan koneksi, lalu coba lagi.';}
    finally{button.disabled=false;}
  });
  $('#sign-out').addEventListener('click',async()=>{
    if(!client)return;
    const {error}=await client.auth.signOut({scope:'local'});
    if(error){notify('Belum bisa keluar. Coba lagi.');return;}
    await switchUser(null);notify('Sudah keluar. Tugas akun disembunyikan dari papan.');
  });
  async function switchUser(user){
    if((user?.id||null)===activeId)return;
    activeId=user?.id||null;
    if(channel){void client.removeChannel(channel);channel=null;}
    // Do not carry a draft, guest board, or undo action across accounts.
    document.querySelector('#task-dialog').close();
    await store.connect(user);
    if(user&&activeId===user.id){channel=client.channel(`board:${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'personal_boards',filter:`user_id=eq.${user.id}`},()=>store.refresh()).subscribe();}
  }
  if(configured){
    client=createClient(cloudConfig.url,cloudConfig.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'ruang-hari-auth-v2'}});
    store=new CloudStore({
      storage:localStorage,validate,onData,onState:renderState,
      transport:{
        async read(user){const {data,error}=await client.from('personal_boards').select('tasks,revision,mutation_id').eq('user_id',user.id).maybeSingle();if(error)throw error;return data||{tasks:[],revision:0,mutation_id:null};},
        async write(user,flight){const {data,error}=await client.rpc('save_personal_board',{p_expected_revision:flight.revision,p_tasks:flight.tasks,p_mutation_id:flight.id});if(error)throw error;return data;}
      }
    });
    // Supabase auth callbacks must stay synchronous; work runs outside its lock.
    client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>switchUser(session?.user||null).catch(()=>notify('Akun belum bisa dimuat. Coba lagi.')),0);});
    client.auth.getSession().then(({data,error})=>{if(error){notify('Sesi masuk belum dapat dipulihkan. Silakan masuk lagi.');return;}return switchUser(data.session?.user||null);}).catch(()=>notify('Sesi masuk belum dapat dimuat.'));
    window.addEventListener('online',()=>store.refresh());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void store.refresh();});
    setInterval(()=>{if(!document.hidden&&navigator.onLine)void store.refresh();},30000);
  }
  renderState(current);
  return {get active(){return !!current.user;},get locked(){return current.locked;},get label(){return labels[current.phase];},get tasks(){return store?.tasks||[];},get accountId(){return current.user?.id||null;},save:tasks=>store.save(tasks)};
}
