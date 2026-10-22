import {validatePeople} from './banco-store.mjs';
export class SupabaseStore {
 constructor(url,key,request=fetch){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' && !['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('SUPABASE_URL deve usar HTTPS.');
  if(!key.startsWith('sb_secret_')){
   try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='service_role')throw Error();}
   catch{throw new Error('Use SUPABASE_SECRET_KEY ou uma chave service_role, nunca anon/publishable.');}
  }
  this.url=parsed.origin;this.key=key;this.request=request;
 }
 async rpc(name,body={}){
  const headers={'Content-Type':'application/json',apikey:this.key};
  if(!this.key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.key}`;
  let response;
  try{response=await this.request(`${this.url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('Supabase indisponível. Confira a conexão e SUPABASE_URL.');}
  if(!response.ok){const error=new Error(response.status===409?'O banco foi alterado em outra aba. Recarregue a página.':`Supabase retornou ${response.status}. Confira a chave, a Data API e execute supabase/schema.sql completo.`);error.status=response.status===409?409:502;throw error;}
  let data;try{data=await response.json();}catch{throw new Error('Resposta inválida do Supabase.');}return data;
 }
 async load(){const data=await this.rpc('accesso_load');if(!data||!Number.isSafeInteger(data.version)||data.version<0||!data.settings||!Array.isArray(data.history))throw new Error('Esquema Supabase incompleto. Execute supabase/schema.sql.');validatePeople(data.people);return data;}
 async save(people,version){validatePeople(people);if(!Number.isSafeInteger(version)||version<0)throw new Error('Versão inválida.');return this.rpc('accesso_save_people',{expected_version:version,new_people:people});}
 async recognition(version){if(!Number.isSafeInteger(version)||version<0)throw new Error('Versão inválida.');const data=await this.rpc('accesso_recognition',{known_version:version});if(!data||!Number.isSafeInteger(data.version)||!data.settings)throw new Error('Resposta de reconhecimento inválida.');if(data.people!==null)validatePeople(data.people);return data;}
 async log(entry){if(!entry||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)||!(entry.personId===null||typeof entry.personId==='string'))throw new Error('Registro inválido.');return this.rpc('accesso_log',{entry_id:entry.id,person_id:entry.personId});}
 async configure(settings){if(!settings||!Number.isFinite(settings.threshold)||settings.threshold<.3||settings.threshold>.55||!Number.isFinite(settings.cooldown)||settings.cooldown<5||settings.cooldown>300||typeof settings.landmarks!=='boolean')throw new Error('Configurações inválidas.');return this.rpc('accesso_configure',{new_settings:settings});}
}
