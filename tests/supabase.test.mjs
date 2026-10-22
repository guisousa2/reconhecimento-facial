import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore} from '../supabase-store.mjs';
import {FileRepository} from '../src/storage.js';
test('cliente Supabase mantém chave no header correto, traduz conflitos e valida dados',async()=>{
 const calls=[];
 const store=new SupabaseStore('https://example.supabase.co','sb_secret_test',async(url,options)=>{calls.push({url,...options});return Response.json({version:0,people:[],history:[],settings:{threshold:.45,cooldown:20,landmarks:false}});});
 await store.load();assert.equal(calls[0].headers.apikey,'sb_secret_test');assert.equal(calls[0].headers.Authorization,undefined);
 assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/rpc/accesso_load');
 await assert.rejects(store.save([{id:'invalid'}],0));assert.equal(calls.length,1);
 store.request=async()=>Response.json({message:'private info'},{status:409});
 await assert.rejects(store.save([],0),e=>e.status===409&&!e.message.includes('private info'));
 assert.throws(()=>new SupabaseStore('https://example.supabase.co','sb_publishable_test'));
});
test('repositório usa dados remotos e só altera memória após confirmação',async()=>{
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const settings={threshold:.45,cooldown:20,landmarks:false};
 try{
  globalThis.fetch=async()=>Response.json({version:0,people:[],history:[],settings,backend:'supabase'});
  const repo=await FileRepository.open();assert.equal(repo.backend,'supabase');
  globalThis.fetch=async()=>Response.json({error:'offline'},{status:503});
  await assert.rejects(repo.configure({...settings,cooldown:30}));assert.equal(repo.settings.cooldown,20);
  await assert.rejects(repo.log({person:null}));assert.equal(repo.history.length,0);
  globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/history');assert.equal(JSON.parse(options.body).personId,null);return Response.json({id:'entry',personId:null,name:'Desconhecido',allowed:false,timestamp:new Date().toISOString()});};
  const entry=await repo.log({person:null});assert.equal(entry.allowed,false);assert.equal(repo.history.length,1);
 }finally{globalThis.fetch=previousFetch;if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;}
});
