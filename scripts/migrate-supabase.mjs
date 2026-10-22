import {loadEnvFile} from 'node:process';
import {readFile} from 'node:fs/promises';
import {SupabaseStore} from '../supabase-store.mjs';
import {validatePeople} from '../banco-store.mjs';
try{loadEnvFile(new URL('../.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!process.env.SUPABASE_URL||!(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY))throw new Error('Configure o .env antes da migração.');
const people=JSON.parse((await readFile(new URL('../banco.json',import.meta.url),'utf8')).replace(/^\uFEFF/,'')).people;
validatePeople(people);
const store=new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
const remote=await store.load();
if(remote.people.length||remote.version!==0)throw new Error('Migração cancelada: Supabase já contém cadastros ou alterações. Nenhum dado foi sobrescrito.');
await store.save(people,remote.version);
console.log(`${people.length} pessoa(s) migrada(s). banco.json original preservado.`);
