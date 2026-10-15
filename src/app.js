import {CameraManager} from './camera.js';
import {FaceEngine,drawOverlay} from './face-engine.js';
import {FileRepository} from './storage.js';
import {AccessController,distance,identify} from './recognition.js';
import {$,notice,status,render,resultView,waiting,exportCSV} from './ui.js';
const camera=new CameraManager($('video')),engine=new FaceEngine(),access=new AccessController();
let repo,page='access',enrolling=false,busy=false,starting=false,session=0,timer=null,lastRecognition=0,samples=[],enrollmentIdentity='',captureDeadline=0,inferencePending=false;
try{repo=await FileRepository.open();render(repo);}catch(e){notice(e.message);document.querySelectorAll('button').forEach(b=>b.disabled=true);}
const labels={access:['Controle de Acesso','Identificação facial em tempo real, diretamente no seu navegador.'],people:['Pessoas Cadastradas','Gerencie identidades, dados faciais e permissões de acesso.'],history:['Histórico','Consulte as tentativas registradas neste navegador.'],settings:['Configurações','Ajuste os parâmetros do reconhecimento e conheça os limites do protótipo.']};
function go(next){if(busy)return;page=next;enrolling=false;samples=[];access.reset();waiting();$('enrollment').hidden=true;
 document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==next+'-page');document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===next));$('page-title').textContent=labels[next][0];$('breadcrumb').textContent=labels[next][0];$('page-description').textContent=labels[next][1];$('camera-mount').append($('camera-stage'));$('threshold').value=repo.settings.threshold;$('cooldown').value=repo.settings.cooldown;$('landmarks').checked=repo.settings.landmarks;
 if(next!=='access')stopCamera();else startCamera();render(repo);
}
function cameraUI(){const active=camera.active;$('camera-placeholder').hidden=active;$('live-badge').textContent=active?'● Câmera ativa':'● Câmera inativa';$('live-badge').classList.toggle('on',active);$('toggle-camera').textContent=active?'Parar câmera':'Iniciar câmera';status('camera',active?'Conectada':'Desconectada',active);$('camera-help').textContent=active?'Mantenha apenas uma pessoa na imagem.':'Permita o acesso à câmera para iniciar.';}
function stopCamera(){session++;clearTimeout(timer);camera.stop();if(!inferencePending)engine.clear();access.reset();samples=[];cameraUI();status('face','Aguardando câmera');status('recognition',engine.ready?'Pausado':'Não iniciado');waiting();$('overlay').getContext('2d').clearRect(0,0,$('overlay').width,$('overlay').height);}
async function startCamera(){if(starting||camera.active||!repo)return;starting=true;const token=++session;$('toggle-camera').disabled=true;notice('');
 try{await camera.start();if(token!==session||!camera.active)return;cameraUI();await engine.initialize(status);if(token!==session||!camera.active)return;lastRecognition=0;loop(token);}
 catch(e){if(token===session){stopCamera();notice(e.message);status('recognition','Erro / acesso bloqueado');if(!engine.landmarker)status('mediapipe','Erro ao carregar');}}
 finally{starting=false;$('toggle-camera').disabled=false;}
}
function invalidate(message){access.reset();samples=[];waiting(message);$('enroll-status').textContent=message;}
async function loop(token){if(token!==session||!camera.active)return;if(inferencePending){timer=setTimeout(()=>loop(token),150);return;}
 try{
  if(busy&&Date.now()>captureDeadline){finishCapture();throw new Error('Tempo de captura esgotado. Posicione apenas um rosto bem iluminado e tente novamente.');}
  if($('video').readyState>=2){const landmarks=engine.detect($('video')),canvas=$('overlay');canvas.width=$('video').videoWidth;canvas.height=$('video').videoHeight;
   // Proporção nativa e espelhamento compartilhados evitam desalinhamento do overlay.
   $('camera-stage').style.aspectRatio=canvas.width+'/'+canvas.height;drawOverlay(canvas,landmarks,repo.settings.landmarks);const count=landmarks.length;status('face',count===1?'Detectado':count>1?'Mais de um rosto':'Não detectado',count===1);
   if(count!==1){status('recognition','Aguardando rosto único');invalidate(count>1?'Detectamos mais de um rosto. Apenas uma pessoa deve aparecer na câmera.':'Rosto não detectado. Posicione-se em frente à câmera.');}
   else if((page==='access'||(enrolling&&busy))&&performance.now()-lastRecognition>=900){
    lastRecognition=performance.now();status('recognition','Processando…',true);if(page==='access')waiting('Processando identidade…');inferencePending=true;let described;try{described=await engine.describe();}finally{inferencePending=false;engine.clear();}const {descriptor,count:found}=described;if(token!==session||!camera.active)return;
    if(!descriptor){status('recognition','Dados insuficientes');invalidate(found>1?'Detectamos mais de um rosto. Apenas uma pessoa deve aparecer na câmera.':'Dados faciais insuficientes. Aproxime-se, olhe de frente e melhore a iluminação.');}
    else if(enrolling&&busy){
     if(samples.length&&distance(samples[0],descriptor)>.45){samples=[];throw new Error('O rosto mudou durante a captura. Repita com apenas uma pessoa.');}
     samples.push(descriptor);$('enroll-status').textContent=`Capturando amostras faciais: ${samples.length}/5…`;
     if(samples.length===5){const duplicate=repo.people.find(p=>p.descriptors.some(d=>distance(d,descriptor)<=repo.settings.threshold));if(duplicate)throw new Error('Este rosto já corresponde a uma pessoa cadastrada. Revise o cadastro existente.');await repo.addPerson({...JSON.parse(enrollmentIdentity),descriptors:samples,model:'face-api-1.7.15/faceRecognitionNet',createdAt:new Date().toISOString()});finishCapture();go('people');notice('Usuário salvo em banco.json com 5 amostras faciais. Acesse Controle de Acesso para identificar.');}
    }else if(page==='access'){
     const match=identify(descriptor,repo.people,repo.settings.threshold),result=access.observe(match);
     if(result){status('recognition',result.allowed?'Identificado · autorizado':'Acesso negado',result.allowed);if(access.shouldRecord(result,repo.settings.cooldown)){const entry=repo.log(result);resultView(result,entry.timestamp);render(repo);}else resultView(result,new Date().toISOString());}
     else{status('recognition','Confirmando identidade…',true);waiting('Confirmando em 3 leituras consecutivas…');}
    }
   }else if(enrolling&&!busy){$('enroll-status').textContent='Rosto detectado. Preencha os dados e capture 5 amostras.';status('recognition','Pronto para cadastro',true);}
  }
 }catch(e){if(token!==session)return;stopCamera();waiting('Erro no reconhecimento. Acesso bloqueado.');status('recognition','Erro / acesso bloqueado');notice(e.message);if(busy)finishCapture();}
 if(token===session&&camera.active)timer=setTimeout(()=>loop(token),150);
}
function finishCapture(){busy=false;samples=[];$('capture').disabled=false;$('person-form').querySelectorAll('input').forEach(i=>i.disabled=false);}
$('toggle-camera').onclick=()=>camera.active?stopCamera():startCamera();$('retry-enrollment').onclick=startCamera;
camera.onEnded=()=>{stopCamera();if(busy)finishCapture();notice('A conexão com a câmera foi encerrada. Reinicie a câmera.');};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));$('view-history').onclick=()=>go('history');
$('new-person').onclick=()=>{if(busy)return;enrolling=true;$('enrollment').hidden=false;$('person-form').reset();$('enrollment-camera').append($('camera-stage'));$('enrollment').scrollIntoView({behavior:'smooth',block:'start'});startCamera();};
$('cancel-enrollment').onclick=()=>{finishCapture();go('people');};
$('person-form').onsubmit=e=>{e.preventDefault();notice('');if(!camera.active||!engine.ready){notice('A câmera e os modelos devem estar ativos antes da captura.');startCamera();return;}const name=$('person-name').value.trim(),id=$('person-id').value.trim();if(!name||!id){notice('Informe nome e ID.');return;}if(repo.people.some(p=>p.id.toLocaleLowerCase()===id.toLocaleLowerCase())){notice('Já existe uma pessoa com este ID.');return;}enrollmentIdentity=JSON.stringify({name,id,authorized:$('person-authorized').checked});samples=[];busy=true;captureDeadline=Date.now()+45000;$('capture').disabled=true;$('person-form').querySelectorAll('input').forEach(i=>i.disabled=true);$('enroll-status').textContent='Capturando… mantenha o rosto na câmera.';};
$('people-list').onclick=async e=>{try{if(e.target.dataset.remove!==undefined){const person=repo.people[Number(e.target.dataset.remove)];if(confirm(`Remover ${person.name} e seus descritores faciais?`))await repo.removePerson(person.id);}if(e.target.dataset.toggle!==undefined)await repo.togglePerson(repo.people[Number(e.target.dataset.toggle)].id);access.reset();render(repo);}catch(error){notice('Não foi possível salvar: '+error.message);}};
$('history-search').oninput=()=>render(repo);$('export-history').onclick=()=>exportCSV(repo.history);
$('settings-form').onsubmit=e=>{e.preventDefault();try{const threshold=Number($('threshold').value),cooldown=Number($('cooldown').value);if(threshold<.3||threshold>.55||cooldown<5||cooldown>300||!Number.isFinite(threshold)||!Number.isFinite(cooldown))throw new Error('Configurações fora do intervalo permitido.');repo.configure({threshold,cooldown,landmarks:$('landmarks').checked});access.reset();notice('Configurações salvas neste navegador.');}catch(error){notice('Não foi possível salvar: '+error.message);}};
function tick(){$('clock').textContent=new Date().toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}tick();setInterval(tick,1000);
window.addEventListener('pagehide',()=>stopCamera());document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();if(busy)finishCapture();}});
$('camera-mount').append($('camera-stage'));if(repo){$('threshold').value=repo.settings.threshold;$('cooldown').value=repo.settings.cooldown;$('landmarks').checked=repo.settings.landmarks;startCamera();}




