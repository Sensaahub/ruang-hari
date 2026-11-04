import test from 'node:test';
import assert from 'node:assert/strict';
import {emailCredential} from '../web/email-credential.js';
const config={url:'https://example.supabase.co',email:'owner@example.test'};
test('pasted sign-in link is verified locally against only the configured project',()=>{
  assert.deepEqual(emailCredential('https://example.supabase.co/auth/v1/verify?token=fake-hash&type=email&redirect_to=https://other.example',config),{type:'email',token_hash:'fake-hash'});
  for(const link of ['https://evil.example/auth/v1/verify?token=abc&type=email','https://example.supabase.co/auth/v1/logout?token=abc&type=email','https://example.supabase.co/auth/v1/verify?token=abc&type=recovery','https://example.supabase.co/auth/v1/verify?type=email'])assert.throws(()=>emailCredential(link,config));
});
test('supports code emails when a custom SMTP OTP template is configured',()=>{
  assert.deepEqual(emailCredential('123456',config),{email:config.email,token:'123456',type:'email'});
});
