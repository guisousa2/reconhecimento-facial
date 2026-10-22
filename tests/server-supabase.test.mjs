import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('servidor conecta RPCs, protege arquivos e mantém contrato HTTP', {timeout:15000},async()=>{
 const settings={threshold:.45,cooldown:20,landmarks:false};
 const state={version:0,people:[],history:[],settings,backend:'supabase'};
 const remote=http.createServer(async(req,res)=>{
  assert.equal(req.headers.apikey,'sb_secret_integration');
  let body='';for await(const chunk of req)body+=chunk;
  const data=JSON.parse(body);let result=state;
  if(req.url.endsWith('accesso_save_people')){
   if(data.expected_version!==state.version){res.writeHead(409,{'Content-Type':'application/json'}).end('{}');return;}
   state.people=data.new_people;state.version++;
  }else if(req.url.endsWith('accesso_recognition'))result={version:state.version,settings:state.settings,people:data.known_version===state.version?null:state.people};
  else if(req.url.endsWith('accesso_configure')){state.settings=data.new_settings;result=state.settings;}
  else if(req.url.endsWith('accesso_log')){result={id:data.entry_id,personId:data.person_id,name:'Teste',allowed:true,timestamp:new Date().toISOString()};state.history.unshift(result);}
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
 });
 remote.listen(0,'127.0.0.1');await once(remote,'listening');
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',SUPABASE_URL:`http://127.0.0.1:${remote.address().port}`,SUPABASE_SECRET_KEY:'sb_secret_integration'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>errors+=chunk);
 try{
  const port=await new Promise((resolve,reject)=>{
   child.stdout.on('data',chunk=>{const match=String(chunk).match(/localhost:(\d+)/);if(match)resolve(Number(match[1]));});
   child.once('exit',code=>reject(new Error(`Servidor saiu ${code}: ${errors}`)));
  });
  const base=`http://127.0.0.1:${port}`;
  const request=(path,method,body)=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await (await fetch(base+'/api/people')).json()).backend,'supabase');
  for(const path of ['/.env','/supabase-store.mjs','/tests/access.test.mjs','/banco.json'])assert.equal((await fetch(base+path)).status,403);
  assert.equal((await fetch(base+'/src/app.js')).status,200);
  const person={id:'A',name:'Teste',authorized:true,descriptors:Array.from({length:5},()=>Array(128).fill(.1))};
  assert.equal((await request('/api/people','PUT',{version:0,people:[person]})).status,200);
  assert.equal((await request('/api/people','PUT',{version:0,people:[]})).status,409);
  assert.equal((await (await fetch(base+'/api/recognition?version=1')).json()).people,null);
  assert.equal((await request('/api/settings','PUT',{...settings,cooldown:30})).status,200);
  assert.equal((await (await request('/api/history','POST',{id:crypto.randomUUID(),personId:'A'})).json()).allowed,true);
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 }finally{
  child.kill();if(child.exitCode===null)await once(child,'exit');
  remote.closeAllConnections();await new Promise(resolve=>remote.close(resolve));
 }
});
