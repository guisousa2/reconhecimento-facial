export const DEFAULTS={threshold:.45,cooldown:20,landmarks:false};
export function distance(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==128||b.length!==128||![...a,...b].every(Number.isFinite))return Infinity;
 return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0));
}
export function identify(descriptor,people,threshold=.45){
 if(!Number.isFinite(threshold)||threshold<.3||threshold>.55)return null;
 const matches=people.map(person=>({person,distance:Math.min(...person.descriptors.map(d=>distance(d,descriptor)))})).sort((a,b)=>a.distance-b.distance);
 const best=matches[0];
 if(!best||best.distance>threshold||(matches[1]&&matches[1].distance-best.distance<.08))return null;
 return best;
}
export class AccessController{
 constructor(){this.reset();this.lastRecords=new Map();}
 reset(){this.candidate=null;this.streak=0;}
 observe(match){const key=match?.person.id??'__unknown__';if(this.candidate===key)this.streak++;else{this.candidate=key;this.streak=1;}return this.streak>=3?{person:match?.person??null,allowed:match?.person.authorized===true,distance:match?.distance??null}:null;}
 shouldRecord(result,cooldown,now=Date.now()){const key=(result.person?.id??'__unknown__')+':'+result.allowed;if(now-(this.lastRecords.get(key)??-Infinity)<cooldown*1000)return false;this.lastRecords.set(key,now);return true;}
}
