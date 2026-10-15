import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JsonPeopleStore} from '../banco-store.mjs';
test('banco.json persiste usuários, rejeita conflitos e dados inválidos e permite remoção',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'accesso-test-')),file=join(dir,'banco.json');
 try{
  const store=new JsonPeopleStore(file);assert.deepEqual(await store.load(),{version:0,people:[]});
  const person={id:'U1',name:'Usuário de teste',authorized:true,descriptors:Array.from({length:5},()=>Array(128).fill(.1))};
  await store.save([person],0);
  assert.equal(JSON.parse(await readFile(file,'utf8')).people[0].name,person.name);
  assert.equal((await new JsonPeopleStore(file).load()).people[0].id,'U1');
  await assert.rejects(store.save([],0),e=>e.status===409);
  await assert.rejects(store.save([{...person,descriptors:[]}],1));
  assert.equal((await store.load()).people.length,1);
  await store.save([],1);assert.equal((await store.load()).people.length,0);
 }finally{await unlink(file).catch(()=>{});await unlink(file+'.tmp').catch(()=>{});await rmdir(dir);}
});
