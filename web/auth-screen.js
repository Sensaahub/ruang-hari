import {authView,authError,submitAuth} from './auth-flow.js';

export function createAuthScreen({getClient,onRecovered,notify}) {
  const $=s=>document.querySelector(s),form=$('#auth-form');
  let mode='signin',busy=false,state={ready:false,user:null,recovery:false,configured:true};
  function feedback(text,error=false){const el=$('#auth-feedback');el.textContent=text;el.hidden=!text;el.classList.toggle('auth-error',error);}
  function setMode(next){
    if(busy)return;mode=next;feedback('');$('#auth-confirmation').hidden=true;
    $('#auth-name-field').hidden=mode!=='signup';
    $('#auth-email-field').hidden=mode==='recovery';$('#auth-email').required=mode!=='recovery';
    $('#auth-password-field').hidden=mode==='forgot';
    $('#auth-confirm-field').hidden=!['signup','recovery'].includes(mode);
    $('#auth-tabs').hidden=['forgot','recovery'].includes(mode);
    $('#auth-forgot').hidden=mode!=='signin';
    $('#auth-magic-open').hidden=mode!=='signin';
    $('#auth-magic-details').hidden=mode!=='signin';$('#auth-magic-details').open=false;
    $('#auth-back').hidden=!['forgot','recovery'].includes(mode);
    $('#auth-back').textContent=mode==='recovery'?'Keluar dari pemulihan':'Kembali ke Masuk';
    $('#auth-name').required=mode==='signup';
    $('#auth-password').required=mode!=='forgot';
    $('#auth-password').minLength=['signup','recovery'].includes(mode)?8:1;
    $('#auth-password').autocomplete=mode==='signin'?'current-password':'new-password';
    $('#auth-password-confirm').required=['signup','recovery'].includes(mode);
    $('#auth-password-confirm').setCustomValidity('');
    $('#auth-password').value='';$('#auth-password-confirm').value='';
    $('#auth-password').type='password';$('#toggle-auth-password').setAttribute('aria-label','Tampilkan password');$('#toggle-auth-password').setAttribute('aria-pressed','false');
    const titles={signin:['Selamat datang kembali.','Masuk dan lanjutkan langkah kecilmu.','Masuk ke ruangmu'],signup:['Buat ruang untuk dirimu.','Daftar untuk menyimpan tugasmu di semua perangkat.','Buat akun'],forgot:['Kembali ke ruangmu.','Kami akan mengirim tautan untuk mengatur ulang password.','Kirim tautan pemulihan'],recovery:['Buat password baru.','Gunakan minimal 8 karakter yang belum pernah kamu pakai di sini.','Simpan password baru']}[mode];
    $('#auth-title').textContent=titles[0];$('#auth-description').textContent=titles[1];$('#auth-submit-label').textContent=titles[2];
    $('#auth-password-hint').hidden=!['signup','recovery'].includes(mode);
    for(const button of document.querySelectorAll('[data-auth-mode]')){const selected=button.dataset.authMode===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));}
  }
  function update(next){
    state={...state,...next};const view=authView(state),allowed=view==='app';
    $('#app-shell').hidden=!allowed;$('#app-shell').inert=!allowed;
    $('#auth-screen').hidden=allowed;document.body.classList.toggle('auth-locked',!allowed);
    $('#auth-loading').hidden=view!=='loading';$('#auth-content').hidden=['loading','unavailable'].includes(view);
    $('#auth-unavailable').hidden=view!=='unavailable';
    if(!allowed){for(const dialog of document.querySelectorAll('#app-shell dialog[open]'))dialog.close();}
    if(view==='recovery'&&mode!=='recovery')setMode('recovery');
    if(view==='auth'&&mode==='recovery')setMode('signin');
    if(allowed){form.reset();$('#auth-password').value='';$('#auth-password-confirm').value='';}
  }
  for(const button of document.querySelectorAll('[data-auth-mode]'))button.addEventListener('click',()=>setMode(button.dataset.authMode));
  $('#auth-forgot').addEventListener('click',()=>setMode('forgot'));
  $('#auth-back').addEventListener('click',async()=>{if(mode==='recovery'){const client=getClient();const {error}=await client.auth.signOut({scope:'local'});if(error){feedback(authError(error),true);return;}onRecovered();}setMode('signin');});
  $('#toggle-auth-password').addEventListener('click',()=>{const input=$('#auth-password'),show=input.type==='password';input.type=show?'text':'password';$('#toggle-auth-password').setAttribute('aria-label',show?'Sembunyikan password':'Tampilkan password');$('#toggle-auth-password').setAttribute('aria-pressed',String(show));});
  $('#auth-password-confirm').addEventListener('input',()=>$('#auth-password-confirm').setCustomValidity(''));
  $('#auth-password').addEventListener('input',()=>$('#auth-password-confirm').setCustomValidity(''));
  $('#auth-reload').addEventListener('click',()=>location.reload());
  $('#auth-magic-open').addEventListener('click',()=>{$('#auth-magic-details').open=true;$('#login-email').value=$('#auth-email').value;$('#login-email').focus();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;const client=getClient();if(!client){feedback('Layanan akun belum siap. Coba muat ulang halaman.',true);return;}
    if(['signup','recovery'].includes(mode)&&$('#auth-password').value!==$('#auth-password-confirm').value){$('#auth-password-confirm').setCustomValidity('Kedua password harus sama.');$('#auth-password-confirm').reportValidity();return;}
    busy=true;$('#auth-submit').disabled=true;$('#auth-submit').setAttribute('aria-busy','true');for(const b of document.querySelectorAll('[data-auth-mode]'))b.disabled=true;feedback('');
    const submittedMode=mode;
    try{
      const result=await submitAuth(client.auth,mode,{email:$('#auth-email').value.trim(),password:$('#auth-password').value,name:$('#auth-name').value.trim(),redirectTo:new URL('./',location.href).href});
      if(mode==='signup'&&result.pendingConfirmation){$('#auth-confirmation').hidden=false;feedback('Periksa inbox dan folder spam. Konfirmasikan email untuk mengaktifkan akun, lalu masuk.');$('#auth-password').value='';$('#auth-password-confirm').value='';}
      else if(mode==='forgot')feedback('Jika email ini terdaftar, tautan pemulihan akan dikirim. Periksa inbox dan folder spam.');
      else if(mode==='recovery'){onRecovered();notify('Password berhasil diperbarui.');}
      else notify(mode==='signup'?'Akun berhasil dibuat. Membuka papan…':'Sudah masuk. Membuka papan…');
    }catch(error){feedback(authError(error,submittedMode),true);}
    finally{busy=false;$('#auth-submit').disabled=false;$('#auth-submit').removeAttribute('aria-busy');for(const b of document.querySelectorAll('[data-auth-mode]'))b.disabled=false;}
  });
  setMode('signin');update(state);
  return {update};
}
