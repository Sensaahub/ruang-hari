import {createClient} from '@supabase/supabase-js';
import {cloudConfig} from './config.js';
import {CloudStore} from './cloud-store.js';
import {emailCredential} from './email-credential.js';
import {createAuthScreen} from './auth-screen.js';
import {authView} from './auth-flow.js';

export function initCloud({validate,onData,onState,notify,getTasks,getLocalTasks,replaceTasks}){
  const $=s=>document.querySelector(s),accountDialog=$('#account-dialog'),status=$('#cloud-status');
  let client,store,channel,activeId=null,authReady=false,recovery=false;
  let current={user:null,phase:'local',locked:true,pending:false};
  const configured=!!(cloudConfig.url&&cloudConfig.key);
  const labels={local:'Masuk untuk membuka ruangmu',loading:'Memuat tugas akun…',synced:'Tersinkron dengan akun',pending:'Menyinkronkan perubahan…',offline:'Offline · perubahan menunggu',error:'Sinkronisasi perlu diperiksa',conflict:'Ada perubahan di perangkat lain'};
  const screen=createAuthScreen({getClient:()=>client,onRecovered:()=>{recovery=false;renderState({...current,locked:store?.locked??true});},notify});
  function renderState(state){
    current={...state,locked:!state.user||state.locked||recovery};
    $('#account-summary').textContent=state.user?.email||'Masuk untuk membuka papan tugasmu.';
    $('#account-trigger').textContent='Akun & sinkronisasi';
    $('#email-form').hidden=!configured||!!state.user;if(state.user)$('#otp-form').hidden=true;
    $('#signed-in-actions').hidden=!state.user;
    $('#sync-state-detail').textContent=labels[state.phase]||state.phase;
    $('#sync-error-detail').textContent=state.error?friendlyError(state.error):'';$('#sync-error-detail').hidden=!state.error;
    $('#cloud-conflict').hidden=state.phase!=='conflict';$('#conflict-banner').hidden=state.phase!=='conflict';
    $('#merge-local').disabled=current.locked;$('#merge-local-count').textContent=state.user?getLocalTasks().filter(t=>!t.demo).length:0;
    $('#cloud-state-banner').hidden=!state.user||!current.locked||state.phase==='conflict'||recovery;
    $('#cloud-state-text').textContent=labels[state.phase]||'';status.textContent=labels[state.phase]||'';status.dataset.phase=state.phase;
    const name=typeof state.user?.user_metadata?.display_name==='string'?state.user.user_metadata.display_name.trim().slice(0,40):'';
    $('#workspace-name').textContent=name?`Ruang ${name}`:'Ruang pribadi';$('#workspace-initial').textContent=name?Array.from(name)[0].toUpperCase():'R';
    screen.update({ready:authReady,user:state.user,recovery,configured});onState({...current,configured,label:labels[state.phase]});
  }
  function friendlyError(message){return /fetch|network|offline|load failed/i.test(message)?'Koneksi ke server belum tersedia. Coba lagi setelah internet kembali.':'Sinkronisasi belum selesai. Salinan di perangkat tetap dipertahankan. Coba lagi atau unduh cadangan.';}
  $('#account-trigger').addEventListener('click',()=>{if(current.user)accountDialog.showModal();});
  $('#close-account').addEventListener('click',()=>accountDialog.close());$('#open-conflict').addEventListener('click',()=>accountDialog.showModal());
  $('#sync-retry').addEventListener('click',()=>store?.refresh());$('#banner-retry').addEventListener('click',()=>store?.refresh());
  $('#local-cloud-backup').addEventListener('click',()=>{
    if(!current.user)return;const url=URL.createObjectURL(new Blob([JSON.stringify({app:'ruang-hari',version:1,tasks:getTasks()},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='ruang-hari-sebelum-konflik.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  for(const choice of ['local','remote'])$(`#use-${choice}`).addEventListener('click',()=>{try{if(!current.user)return;store.resolve(choice);notify(choice==='local'?'Versi perangkat ini dipilih. Menunggu sinkronisasi.':'Versi dari akun sudah dipakai.');}catch{notify('Tidak bisa menyimpan perubahan. Unduh cadangan terlebih dulu.');}});
  $('#merge-local').addEventListener('click',()=>{
    if(!store||!current.user||current.locked)return;const incoming=getLocalTasks().filter(t=>!t.demo),existing=new Set(getTasks().map(t=>t.id));
    const added=incoming.filter(t=>!existing.has(t.id)).map(t=>({...t,demo:false}));if(!added.length){notify('Tidak ada tugas lokal baru untuk digabungkan.');return;}
    if(replaceTasks([...getTasks(),...added]))notify(`${added.length} tugas lokal dimasukkan ke akun.`);
  });
  $('#email-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;const button=$('#send-login');button.disabled=true;$('#login-feedback').textContent='Mengirim tautan masuk…';
    try{
      const email=$('#login-email').value.trim();const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;
      $('#login-feedback').textContent='Tautan sudah dikirim. Buka tombol masuk di email, atau salin tautannya ke kolom di bawah untuk masuk langsung di PWA ini.';
      $('#otp-email').textContent=email;$('#otp-form').dataset.email=email;$('#otp-form').hidden=false;$('#login-code').focus();
    }catch(error){$('#login-feedback').textContent=/rate limit|too many/i.test(error.message)?'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.':'Tautan belum bisa dikirim. Untuk akun baru, gunakan halaman Daftar terlebih dulu.';}
    finally{button.disabled=false;}
  });
  $('#otp-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!client)return;const button=$('#verify-login');button.disabled=true;
    try{const credential=emailCredential($('#login-code').value,{email:$('#otp-form').dataset.email,url:cloudConfig.url});const {error}=await client.auth.verifyOtp(credential);if(error)throw error;$('#login-code').value='';$('#otp-form').hidden=true;notify('Sudah masuk. Tugas akun sedang dimuat.');}
    catch{$('#otp-feedback').textContent='Tautan tidak valid atau sudah kedaluwarsa. Salin tautan dari email terbaru, atau kirim ulang.';}finally{button.disabled=false;}
  });
  $('#sign-out').addEventListener('click',async()=>{if(!client)return;const {error}=await client.auth.signOut({scope:'local'});if(error){notify('Belum bisa keluar. Coba lagi.');return;}recovery=false;await switchUser(null);notify('Sudah keluar dari akun.');});
  async function switchUser(rawUser){
    const user=authView({ready:true,user:rawUser})==='app'?rawUser:null;authReady=true;
    if((user?.id||null)===activeId){renderState({...current,user,locked:store?.locked??true});return;}activeId=user?.id||null;
    if(channel){void client.removeChannel(channel);channel=null;}
    for(const dialog of document.querySelectorAll('#app-shell dialog[open]'))dialog.close();$('#task-form').reset();$('#check-new').value='';$('#login-code').value='';
    await store.connect(user);
    if(user&&activeId===user.id)channel=client.channel(`board:${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'personal_boards',filter:`user_id=eq.${user.id}`},()=>store.refresh()).subscribe();
  }
  if(configured){
    try{
    client=createClient(cloudConfig.url,cloudConfig.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'ruang-hari-auth-v2'}});
    store=new CloudStore({storage:localStorage,validate,onData,onState:renderState,transport:{
      async read(user){const {data,error}=await client.from('personal_boards').select('tasks,revision,mutation_id').eq('user_id',user.id).maybeSingle();if(error)throw error;return data||{tasks:[],revision:0,mutation_id:null};},
      async write(user,flight){const {data,error}=await client.rpc('save_personal_board',{p_expected_revision:flight.revision,p_tasks:flight.tasks,p_mutation_id:flight.id});if(error)throw error;return data;}
    }});
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY')recovery=true;
      if(event==='SIGNED_OUT'){recovery=false;authReady=true;renderState({user:null,phase:'local',locked:true,pending:false});}
      setTimeout(()=>switchUser(session?.user||null).catch(()=>{authReady=true;renderState({user:null,phase:'error',locked:true});notify('Akun belum bisa dimuat. Coba muat ulang halaman.');}),0);
    });
    client.auth.getSession().then(({data,error})=>{if(error)throw error;return switchUser(data.session?.user||null);}).catch(()=>{authReady=true;renderState({user:null,phase:'error',locked:true});notify('Sesi masuk belum bisa dimuat. Silakan masuk lagi.');});
    window.addEventListener('online',()=>store.refresh());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void store.refresh();});setInterval(()=>{if(!document.hidden&&navigator.onLine)void store.refresh();},30000);
    }catch{
      screen.update({configured:false});onState({user:null,locked:true,phase:'error',configured:false});
      return {active:false,locked:true,tasks:[],accountId:null,save(){throw Error('Layanan akun belum tersedia.');}};
    }
  }
  renderState(current);
  return {get active(){return !!current.user&&!recovery;},get locked(){return current.locked;},get label(){return labels[current.phase];},get tasks(){return store?.tasks||[];},get accountId(){return current.user?.id||null;},save:tasks=>{if(!current.user||recovery)throw Error('Masuk terlebih dulu.');store.save(tasks);}};
}
