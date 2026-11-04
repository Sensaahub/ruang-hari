export function authView({ready=false,user=null,recovery=false,configured=true}) {
  if(!configured)return 'unavailable';
  if(!ready)return 'loading';
  if(recovery&&user)return 'recovery';
  return user?.email&&user?.email_confirmed_at&&!user.is_anonymous?'app':'auth';
}

export function authError(error,mode='signin') {
  const code=error?.code||'',message=error?.message||'';
  if(code==='invalid_credentials')return 'Email atau password belum sesuai. Periksa kembali, lalu coba lagi.';
  if(code==='email_not_confirmed')return 'Emailmu belum dikonfirmasi. Buka email pendaftaran dan klik tautan konfirmasinya.';
  if(code==='user_already_exists')return 'Akun belum bisa dibuat dengan email ini. Coba masuk atau gunakan lupa password.';
  if(code==='weak_password')return 'Gunakan password yang lebih kuat, minimal 8 karakter.';
  if(/rate_limit|over_email_send_rate_limit/.test(code)||/rate limit|too many/i.test(message))return 'Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba lagi.';
  if(/email_address_not_authorized|email_provider_disabled|unexpected_failure/.test(code)||/not authorized|sending confirmation email/i.test(message))return 'Email belum bisa dikirim. Silakan coba lagi nanti atau hubungi pengelola Ruang Hari.';
  if(/fetch|network|offline/i.test(message))return 'Koneksi belum tersedia. Periksa internetmu, lalu coba lagi.';
  return mode==='signin'?'Belum bisa masuk. Periksa email dan password, lalu coba lagi.':'Permintaan belum berhasil. Coba lagi sebentar atau hubungi pengelola Ruang Hari.';
}

export async function submitAuth(auth,mode,{email,password='',name='',redirectTo}) {
  let result;
  if(mode==='signup')result=await auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:redirectTo}});
  else if(mode==='forgot')result=await auth.resetPasswordForEmail(email,{redirectTo});
  else if(mode==='recovery')result=await auth.updateUser({password});
  else result=await auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  return {data:result.data||null,pendingConfirmation:mode==='signup'&&!result.data?.session};
}
