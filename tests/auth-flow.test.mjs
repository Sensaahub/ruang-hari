import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authView,authError,submitAuth} from '../web/auth-flow.js';
const verified={id:'a',email:'owner@example.test',email_confirmed_at:'2026-11-04T00:00:00Z',is_anonymous:false};
test('board stays closed during bootstrap, logout, unverified and anonymous sessions',()=>{
  assert.equal(authView({user:verified}),'loading');
  assert.equal(authView({ready:true,user:null}),'auth');
  assert.equal(authView({ready:true,user:{...verified,email_confirmed_at:null}}),'auth');
  assert.equal(authView({ready:true,user:{...verified,is_anonymous:true}}),'auth');
  assert.equal(authView({ready:true,user:verified}),'app');
  assert.equal(authView({ready:true,user:verified,recovery:true}),'recovery');
  assert.equal(authView({ready:true,user:verified,configured:false}),'unavailable');
});
test('signup sends identity and confirmation redirect, and does not open board without a session',async()=>{
  let payload;const auth={signUp:async input=>{payload=input;return {data:{user:{id:'a'},session:null},error:null};}};
  const result=await submitAuth(auth,'signup',{email:'new@example.test',password:'fake-only-in-unit-test',name:'Nama',redirectTo:'https://example.test/app/'});
  assert.equal(payload.options.data.display_name,'Nama');assert.equal(payload.options.emailRedirectTo,'https://example.test/app/');assert.equal(result.pendingConfirmation,true);
});
test('signin uses password auth and propagates failures without inventing a session',async()=>{
  const problem={code:'invalid_credentials'};
  await assert.rejects(submitAuth({signInWithPassword:async()=>({error:problem})},'signin',{email:'a@example.test',password:'fake-unit-test'}),e=>e===problem);
  assert.match(authError(problem),/Email atau password/);
});
test('password recovery returns through the configured application URL',async()=>{
  let args;await submitAuth({resetPasswordForEmail:async(...input)=>{args=input;return {error:null};}},'forgot',{email:'a@example.test',redirectTo:'https://example.test/app/'});
  assert.deepEqual(args,['a@example.test',{redirectTo:'https://example.test/app/'}]);
});
test('recovery updates only the password in the active recovery session',async()=>{
  let payload;await submitAuth({updateUser:async input=>{payload=input;return {error:null};}},'recovery',{password:'fake-password-unit-test'});assert.deepEqual(payload,{password:'fake-password-unit-test'});
});
