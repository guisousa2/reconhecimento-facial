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

// Pessoas são persistidas pelo servidor; histórico e configurações continuam locais.
export class FileRepository extends LocalRepository{
 static async open(){
  const repo=new FileRepository();const response=await fetch('/api/people',{cache:'no-store'});
  const remote=await response.json();if(!response.ok)throw new Error(remote.error??'Não foi possível carregar banco.json.');
  const previous=repo.people;repo.version=remote.version;repo.data={...repo.data,people:remote.people};
  // Migração única dos cadastros do protótipo quando o arquivo ainda está vazio.
  if(remote.version===0&&remote.people.length===0&&previous.length)await repo.savePeople(previous);
  repo.commit(repo.data);return repo;
 }
 commit(next){this.storage.setItem(KEY,JSON.stringify({...next,people:[]}));this.data=next;}
 async savePeople(people){
  const response=await fetch('/api/people',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:this.version,people})});
  const saved=await response.json();if(!response.ok)throw new Error(saved.error??'Falha ao salvar banco.json.');
  this.version=saved.version;this.data={...this.data,people:saved.people};
 }
 async addPerson(person){if(this.people.some(p=>p.id.toLocaleLowerCase()===person.id.toLocaleLowerCase()))throw new Error('Já existe uma pessoa com este ID.');await this.savePeople([...this.people,person]);}
 async removePerson(id){await this.savePeople(this.people.filter(p=>p.id!==id));}
 async togglePerson(id){await this.savePeople(this.people.map(p=>p.id===id?{...p,authorized:!p.authorized}:p));}
}
