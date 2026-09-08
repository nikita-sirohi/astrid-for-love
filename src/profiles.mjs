export const profileFields=['age','gender','pronouns','interestedIn','ageRange','location'];
export function profileValue(field,value) {
 if(field==='age') {if(!Number.isInteger(value)||value<0||value>120)throw Error('Age must be a whole number from 0 to 120.');return value;}
 if(field==='ageRange') {if(!Array.isArray(value)||value.length!==2||!value.every(Number.isInteger)||value[0]<18||value[1]<value[0]||value[1]>120)throw Error('Invalid adult age range.');return value;}
 if(field==='interestedIn') {if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||!v.trim()||v.length>80))throw Error('Invalid gender preferences.');return [...new Set(value.map(v=>v.trim()))];}
 if(!['gender','pronouns','location','bio'].includes(field)||typeof value!=='string'||!value.trim()||value.length>(field==='bio'?500:120))throw Error('Invalid profile value.');return value.trim();
}
export function applyProfileSuggestions(p,suggestions,latestMessageId) {
 let changed=false;p.profileConflicts??=[];p.profileEvidence??={};p.profileFieldLocks??={};
 for(const item of suggestions||[]) {
  if(!profileFields.includes(item.field)||!item.evidenceIds?.length||item.evidenceIds.some(id=>id!==latestMessageId))continue;
  let value;try {value=profileValue(item.field,JSON.parse(item.value));}catch {continue;}
  const equal=JSON.stringify(p[item.field])===JSON.stringify(value);
  if(p.profileFieldLocks[item.field]&&!equal&&item.correction!==true) {
   const conflict={field:item.field,proposedValue:value,evidenceIds:item.evidenceIds};
   const prior=p.profileConflicts.find(c=>c.field===item.field);
   if(JSON.stringify(prior)!==JSON.stringify(conflict)){p.profileConflicts=p.profileConflicts.filter(c=>c.field!==item.field);p.profileConflicts.push(conflict);changed=true;}
   continue;
  }
  const hadConflict=p.profileConflicts.some(c=>c.field===item.field);
  p.profileConflicts=p.profileConflicts.filter(c=>c.field!==item.field);
  if(!equal){p[item.field]=value;changed=true;}
  if(hadConflict)changed=true;
  p.profileEvidence[item.field]={source:'conversation',evidenceIds:item.evidenceIds};
 }
 return changed;
}
