import {DEFAULTS} from './recognition.js';
const KEY='accesso.v1';
export class LocalRepository{
 constructor(storage=localStorage){
  this.storage=storage;const raw=storage.getItem(KEY);this.data=raw?JSON.parse(raw):{people:[],history:[],settings:{...DEFAULTS}};const d=this.data;
  if(!Array.isArray(d.people)||!Array.isArray(d.history)||!d.settings)throw new Error('Armazenamento local inválido. Não foi sobrescrito. Verifique os dados do site no navegador.');
  if(d.people.some(p=>typeof p.id!=='string'||!p.id||typeof p.name!=='string'||typeof p.authorized!=='boolean'||!Array.isArray(p.descriptors)||p.descriptors.length<5||p.descriptors.some(v=>!Array.isArray(v)||v.length!==128||!v.every(Number.isFinite))))throw new Error('Descritores locais inválidos. Reconhecimento bloqueado.');
  if(!Number.isFinite(d.settings.threshold)||d.settings.threshold<.3||d.settings.threshold>.55||!Number.isFinite(d.settings.cooldown)||d.settings.cooldown<5||d.settings.cooldown>300)throw new Error('Configurações locais inválidas. Reconhecimento bloqueado.');
 }
 commit(next){this.storage.setItem(KEY,JSON.stringify(next));this.data=next;}
 get people(){return this.data.people;}get history(){return this.data.history;}get settings(){return this.data.settings;}
 addPerson(person){if(this.people.some(p=>p.id.toLocaleLowerCase()===person.id.toLocaleLowerCase()))throw new Error('Já existe uma pessoa com este ID.');this.commit({...this.data,people:[...this.people,person]});}
 removePerson(id){this.commit({...this.data,people:this.people.filter(p=>p.id!==id)});}
 togglePerson(id){this.commit({...this.data,people:this.people.map(p=>p.id===id?{...p,authorized:!p.authorized}:p)});}
 log(result){const entry={id:crypto.randomUUID(),personId:result.person?.id??null,name:result.person?.name??'Pessoa não identificada',timestamp:new Date().toISOString(),allowed:result.allowed};this.commit({...this.data,history:[entry,...this.history].slice(0,2000)});return entry;}
 configure(settings){this.commit({...this.data,settings});}
}

// Com Supabase, todos os dados vêm do servidor; no modo local, mantém compatibilidade.
async function readPeopleResponse(response){
 if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error('Servidor de cadastros indisponível. Execute node server.mjs na pasta do projeto e abra http://localhost:3000. Não utilize Live Server nem abra index.html diretamente.');
 let data;try{data=await response.json();}catch{throw new Error('O servidor retornou JSON inválido. Confira o banco e reinicie node server.mjs.');}
 if(!response.ok)throw new Error(data?.error??'Falha ao acessar o banco.');
 if(!data||!Number.isSafeInteger(data.version)||data.version<0||!Array.isArray(data.people))throw new Error('Resposta inválida do servidor de cadastros. Confira o banco configurado.');
 return data;
}

export class FileRepository extends LocalRepository{
 static async open(){
  const response=await fetch('/api/people',{cache:'no-store'});
  const remote=await readPeopleResponse(response);
  // Dados antigos do navegador não bloqueiam nem sobrescrevem o banco remoto.
  const repo=remote.backend==='supabase'?new FileRepository({getItem:()=>null,setItem:()=>{}}):new FileRepository();
  repo.backend=remote.backend??'local';
  const previous=repo.people;repo.version=remote.version;repo.data={...repo.data,people:remote.people};
  // Migração única dos cadastros do protótipo quando o arquivo ainda está vazio.
  if(remote.version===0&&remote.people.length===0&&previous.length)await repo.savePeople(previous);
  if(repo.backend==='supabase')repo.data={...repo.data,history:remote.history,settings:remote.settings};
  repo.commit(repo.data);return repo;
 }
 commit(next){this.storage.setItem(KEY,JSON.stringify({...next,people:[]}));this.data=next;}
 async savePeople(people){
  const response=await fetch('/api/people',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:this.version,people})});
  const saved=await readPeopleResponse(response);
  this.version=saved.version;this.data={...this.data,people:saved.people};
 }
 async refresh(){const remote=await readPeopleResponse(await fetch('/api/people',{cache:'no-store'}));this.version=remote.version;this.data={...this.data,people:remote.people,...(this.backend==='supabase'?{history:remote.history,settings:remote.settings}:{})};}
 async refreshRecognition(){const response=await fetch(`/api/recognition?version=${this.version}`,{cache:'no-store'});if(!response.ok)throw new Error('Falha ao atualizar autorizações. Confira a conexão com o servidor.');const remote=await response.json();if(!remote||!Number.isSafeInteger(remote.version)||!remote.settings||!(remote.people===null||Array.isArray(remote.people)))throw new Error('Resposta de reconhecimento inválida.');this.version=remote.version;this.data={...this.data,people:remote.people??this.people,settings:remote.settings};}
 async remoteWrite(path,method,body){const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Servidor indisponível.');const data=await response.json();if(!response.ok)throw new Error(data.error??'Falha ao salvar no servidor.');return data;}
 async log(result){if(this.backend!=='supabase')return super.log(result);const entry=await this.remoteWrite('/api/history','POST',{id:crypto.randomUUID(),personId:result.person?.id??null});this.data={...this.data,history:[entry,...this.history.filter(h=>h.id!==entry.id)].slice(0,2000)};return entry;}
 async configure(settings){if(this.backend!=='supabase')return super.configure(settings);const saved=await this.remoteWrite('/api/settings','PUT',settings);this.data={...this.data,settings:saved};}
 async addPerson(person){if(this.people.some(p=>p.id.toLocaleLowerCase()===person.id.toLocaleLowerCase()))throw new Error('Já existe uma pessoa com este ID.');await this.savePeople([...this.people,person]);}
 async removePerson(id){await this.savePeople(this.people.filter(p=>p.id!==id));}
 async togglePerson(id){await this.savePeople(this.people.map(p=>p.id===id?{...p,authorized:!p.authorized}:p));}
}
