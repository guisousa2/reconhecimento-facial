import {readFile,writeFile,rename} from 'node:fs/promises';
export function validatePeople(people){
 if(!Array.isArray(people)||people.length>1000)throw new Error('Lista de usuários inválida.');
 const ids=new Set();
 for(const p of people){
  if(!p||typeof p.id!=='string'||!p.id.trim()||p.id.length>50||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.authorized!=='boolean'||!Array.isArray(p.descriptors)||p.descriptors.length!==5||p.descriptors.some(d=>!Array.isArray(d)||d.length!==128||!d.every(Number.isFinite)))throw new Error('Dados cadastrais ou descritores faciais inválidos.');
  const id=p.id.toLocaleLowerCase();if(ids.has(id))throw new Error('Já existe uma pessoa com este ID.');ids.add(id);
 }
}
export class JsonPeopleStore{
 constructor(path){this.path=path;this.queue=Promise.resolve();}
 async load(){
  let raw;try{raw=await readFile(this.path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;try{await writeFile(this.path,JSON.stringify({version:0,people:[]},null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}raw=await readFile(this.path,'utf8');}
  const data=JSON.parse(raw.replace(/^\uFEFF/,''));validatePeople(data.people);if(!Number.isSafeInteger(data.version)||data.version<0)throw new Error('Versão do banco inválida.');return data;
 }
 save(people,version){
  const task=this.queue.then(async()=>{validatePeople(people);const current=await this.load();if(current.version!==version){const e=new Error('O banco foi alterado em outra aba. Recarregue a página antes de tentar novamente.');e.status=409;throw e;}
   const next={version:version+1,people};await writeFile(this.path+'.tmp',JSON.stringify(next,null,2)+'\n');await rename(this.path+'.tmp',this.path);return next;
  });this.queue=task.catch(()=>{});return task;
 }
}
