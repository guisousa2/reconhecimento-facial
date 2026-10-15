import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {JsonPeopleStore} from './banco-store.mjs';
const root=resolve(import.meta.dirname),types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript'},store=new JsonPeopleStore(resolve(root,'banco.json'));
const json=(res,status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
const server=http.createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(path==='/api/people'){
  if(req.method==='GET'){json(res,200,await store.load());return;}
  if(req.method!=='PUT'){json(res,405,{error:'Método não permitido.'});return;}
  // Escritas somente por JSON da mesma origem; nenhuma liberação de CORS.
  if(req.headers.origin!==`http://${req.headers.host}`||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'Origem ou formato não permitido.'});return;}
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16*1024*1024){json(res,413,{error:'Banco excede o tamanho permitido.'});return;}body+=chunk;}
  let data;try{data=JSON.parse(body);}catch{json(res,400,{error:'JSON inválido.'});return;}
  try{json(res,200,await store.save(data.people,data.version));}catch(e){json(res,e.status??400,{error:e.message});}return;
 }
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(root+sep)||!types[extname(file)]){res.writeHead(403).end();return;}
 const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self)','Referrer-Policy':'no-referrer'}).end(body);
}catch(e){json(res,500,{error:'Não foi possível acessar o banco ou arquivo. '+e.message});}});
await store.load();server.listen(3000,'127.0.0.1',()=>console.log('Accesso: http://localhost:3000 · usuários em banco.json'));
