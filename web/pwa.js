export function initPwa(notify){
  let promptEvent;
  const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog');
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;});
  button.addEventListener('click',async()=>{
    if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){notify('Ruang Hari sudah terbuka sebagai aplikasi.');return;}
    if(promptEvent){await promptEvent.prompt();const result=await promptEvent.userChoice;if(result.outcome==='accepted')notify('Ruang Hari dipasang di perangkatmu.');promptEvent=null;}
    else dialog.showModal();
  });
  document.querySelector('#close-install').addEventListener('click',()=>dialog.close());
  window.addEventListener('appinstalled',()=>{promptEvent=null;notify('Ruang Hari berhasil dipasang.');});
  if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./'}).catch(()=>notify('Mode offline belum tersedia. Kamu tetap bisa memakai webnya.'));});
}
