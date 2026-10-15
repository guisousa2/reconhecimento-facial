const MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
const FACE='https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';
function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('FaceAPI não carregado. Verifique sua conexão e os bloqueios de CDN.'));};document.head.append(s);});}
export class FaceEngine{
 constructor(){this.ready=false;this.landmarker=null;this.lastTimestamp=0;this.snapshot=document.createElement('canvas');}
 async initialize(status){if(this.ready)return;if(this.loading)return this.loading;this.loading=this.load(status).catch(e=>{this.loading=null;throw e;});return this.loading;}
 async load(status){
  status('mediapipe','Carregando modelos…');
  try{const {FaceLandmarker,FilesetResolver}=await import(`${MP}/vision_bundle.mjs`);const files=await FilesetResolver.forVisionTasks(`${MP}/wasm`);
   this.landmarker?.close();this.landmarker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:3,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7});status('mediapipe','Ativo',true);
  }catch(e){this.landmarker=null;throw new Error('MediaPipe não carregado. Verifique sua conexão. '+e.message);}
  status('recognition','Carregando descritores…');if(!globalThis.faceapi)await loadScript(`${FACE}/dist/face-api.js`);this.api=globalThis.faceapi;await this.api.tf.ready();
  await Promise.all([this.api.nets.tinyFaceDetector.loadFromUri(`${FACE}/model`),this.api.nets.faceLandmark68Net.loadFromUri(`${FACE}/model`),this.api.nets.faceRecognitionNet.loadFromUri(`${FACE}/model`)]);this.ready=true;status('recognition','Pronto',true);
 }
 // As duas redes analisam o mesmo snapshot temporário. Nenhum pixel é persistido.
 detect(video){const c=this.snapshot;c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);this.lastTimestamp=Math.max(performance.now(),this.lastTimestamp+1);return this.landmarker.detectForVideo(c,this.lastTimestamp).faceLandmarks;}
 async describe(){const faces=await this.api.detectAllFaces(this.snapshot,new this.api.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.7})).withFaceLandmarks().withFaceDescriptors();if(faces.length!==1)return {descriptor:null,count:faces.length};const face=faces[0],box=face.detection.box;if(face.detection.score<.8||box.width<100||box.height<100)return {descriptor:null,count:1};const descriptor=Array.from(face.descriptor);return {descriptor:descriptor.length===128&&descriptor.every(Number.isFinite)?descriptor:null,count:1};}
 clear(){this.snapshot.width=0;this.snapshot.height=0;}
}
export function drawOverlay(canvas,landmarks,showPoints=false){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);for(const points of landmarks){const xs=points.map(p=>p.x*canvas.width),ys=points.map(p=>p.y*canvas.height);ctx.strokeStyle=landmarks.length===1?'#65d9a7':'#f0ad75';ctx.lineWidth=2;ctx.strokeRect(Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));if(showPoints){ctx.fillStyle='#75deb3';for(const p of points){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,1.2,0,Math.PI*2);ctx.fill();}}}}
