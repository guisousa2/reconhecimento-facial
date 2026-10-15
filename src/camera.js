export class CameraManager{
 constructor(video){this.video=video;this.stream=null;this.pending=false;this.generation=0;}
 get active(){return !!this.stream?.getVideoTracks().some(t=>t.readyState==='live');}
 async start(){
  if(this.active||this.pending)return;
  if(!window.isSecureContext)throw new Error('A câmera exige HTTPS ou http://localhost.');
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador não disponibiliza a câmera. Use Chrome ou Edge em localhost.');
  this.pending=true;const generation=++this.generation;
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;this.video.srcObject=stream;await this.video.play();stream.getVideoTracks()[0].addEventListener('ended',()=>{this.stop();this.onEnded?.();},{once:true});
  }catch(error){this.stop();const messages={NotAllowedError:'Permissão negada. Permita a câmera nas configurações deste site.',NotFoundError:'Nenhuma câmera encontrada. Conecte uma webcam.',NotReadableError:'Câmera indisponível. Feche aplicativos que estejam utilizando a webcam.',OverconstrainedError:'A câmera não suporta a configuração solicitada.'};throw new Error(messages[error.name]??error.message);}finally{this.pending=false;}
 }
 stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.srcObject=null;}
}
