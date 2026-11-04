// Validate pasted sign-in links without navigating or sending tokens elsewhere.
export function emailCredential(input,{url,email}){
  const value=input.trim();
  if(/^[0-9]{6,10}$/.test(value))return {email,token:value,type:'email'};
  let link;try{link=new URL(value);}catch{throw Error('Invalid sign-in link');}
  if(link.origin!==new URL(url).origin||link.pathname!=='/auth/v1/verify'||link.username||link.password)throw Error('Invalid sign-in link');
  const type=link.searchParams.get('type'),token_hash=link.searchParams.get('token');
  if(!['email','signup','magiclink'].includes(type)||!token_hash||token_hash.length>200)throw Error('Invalid sign-in link');
  return {type,token_hash};
}
