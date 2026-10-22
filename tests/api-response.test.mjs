import test from 'node:test';
import assert from 'node:assert/strict';
import {FileRepository} from '../src/storage.js';

test('respostas da API sao verificadas antes de alterar cadastros', async()=>{
 const previousFetch=globalThis.fetch;
 const previousStorage=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  globalThis.fetch=async()=>new Response('<!DOCTYPE html><html></html>',{headers:{'Content-Type':'text/html'}});
  await assert.rejects(FileRepository.open(),/node server\.mjs.*localhost:3000/);
  globalThis.fetch=async()=>Response.json({version:0,people:[]});
  const repo=await FileRepository.open();
  assert.deepEqual(repo.people,[]);
  globalThis.fetch=async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}});
  await assert.rejects(repo.savePeople([{id:'A'}]),/Servidor de cadastros/);
  assert.deepEqual(repo.people,[]);
  globalThis.fetch=async()=>Response.json({error:'Conflito de versao'},{status:409});
  await assert.rejects(repo.savePeople([]),/Conflito de vers/);
  globalThis.fetch=async()=>Response.json({people:[]});
  await assert.rejects(FileRepository.open(),/Resposta inv.lida/);
 }finally{
  globalThis.fetch=previousFetch;
  if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;
 }
});
