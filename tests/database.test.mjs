import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database enforces ownership, version checks, idempotency and payload validation',async()=>{
  const db=new PGlite();
  const A='00000000-0000-4000-a000-000000000001',B='00000000-0000-4000-a000-000000000002';
  const M1='00000000-0000-4000-b000-000000000001',M2='00000000-0000-4000-b000-000000000002';
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create publication supabase_realtime; insert into auth.users values('${A}'),('${B}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611040001_personal_boards.sql',import.meta.url),'utf8'));
  const task={id:'one',title:'Private task',notes:'',category:'pribadi',status:'plan',priority:'normal',due:'',checks:[],demo:false};
  const asUser=async(role,id)=>{await db.exec(`reset role; set role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);};
  const save=(rev,tasks,mutation)=>db.query('select public.save_personal_board($1,$2::jsonb,$3::uuid) as board',[rev,JSON.stringify(tasks),mutation]);
  try{
    await asUser('authenticated',A);let row=(await save(0,[task],M1)).rows[0].board;assert.equal(row.revision,1);
    row=(await save(0,[task],M1)).rows[0].board;assert.equal(row.revision,1);
    await assert.rejects(save(0,[task],M2),e=>e.code==='40001');
    await assert.rejects(save(1,[task,task],M2),e=>e.code==='22023');
    await assert.rejects(save(1,[{...task,checks:[{text:'bad',done:'true'}]}],M2),e=>e.code==='22023');
    await assert.rejects(db.query('update public.personal_boards set tasks=\'[]\'::jsonb'),e=>e.code==='42501');
    await asUser('authenticated',B);assert.equal((await db.query('select * from public.personal_boards')).rows.length,0);
    row=(await save(0,[{...task,title:'B task'}],M2)).rows[0].board;assert.equal(row.user_id,B);
    assert.equal((await db.query('select * from public.personal_boards')).rows.length,1);
    await asUser('anon','');await assert.rejects(db.query('select * from public.personal_boards'),e=>e.code==='42501');
    await assert.rejects(save(0,[],M1),e=>e.code==='42501');
    await asUser('authenticated','');await assert.rejects(save(0,[],M1),e=>e.code==='42501');
  }finally{await db.close();}
});
