export const ASTRA_LIMITS={message:60000,toolOutput:24000,event:500};

export function compactForModel(content,artifactRef,limit=ASTRA_LIMITS.message){
 const value=String(content||'');
 if(value.length<=limit)return{content:value,artifactRefs:[]};
 const marker=`\n\n[Full content: ${artifactRef}]`;
 return{content:`${value.slice(0,Math.max(0,limit-marker.length))}${marker}`,artifactRefs:[artifactRef]};
}