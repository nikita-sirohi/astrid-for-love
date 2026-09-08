import { randomUUID } from 'node:crypto';
import { facetFor } from './understanding.mjs';
const copy=value=>structuredClone(value);
const clean=text=>typeof text==='string'&&text.trim()&&text.length<=6000;
export const storyTypes=['passion','anecdote','humor'];
const statuses=['confirmed','tentative'],strengths=['requires','prefers','accepts','unknown'];
function snapshot(m) {const {history,...record}=m;return copy(record);}
function archive(m) {m.history??=[];m.history.push(snapshot(m));}
// The repository owns the serialized file transaction. Memory writes participate in the
// same commit as profile revisions and consent invalidation; no cross-file partial commit.
export class FileMemoryStore {
 constructor(repository) {this.repository=repository;}
 async list(owner,{includeDeleted=false}={}) {const s=await this.repository.read();return this.records(s,owner,{includeDeleted});}
 records(state,owner,{includeDeleted=false}={}) {return state.memories.filter(m=>m.participantId===owner&&(includeDeleted||!m.deleted)).map(m=>{const {history,...record}=m;return copy(record);});}
 async history(owner,id) {const s=await this.repository.read();const m=s.memories.find(m=>m.id===id&&m.participantId===owner);if(!m)throw Error('Memory not found.');return copy([...(m.history||[]),snapshot(m)]);}
 applyInTransaction(state,owner,candidates,evidenceIds) {
 const updates=[];
 for(const candidate of (candidates||[]).slice(0,20)) {
  const story=candidate.kind==='story';const facet=facetFor(candidate.facet);
  if(!clean(candidate.text)||!statuses.includes(candidate.status))continue;
  if(story?(!storyTypes.includes(candidate.storyType)||candidate.facet!=null||candidate.topic!=='story'):(!facet||facet.topic!==candidate.topic||!strengths.includes(candidate.strength)))continue;
  if(!candidate.evidenceIds?.length||candidate.evidenceIds.some(id=>!evidenceIds.has(id)))continue;
  const existing=candidate.id?state.memories.find(m=>m.id===candidate.id&&m.participantId===owner):null;
  if(candidate.id&&(!existing||existing.deleted||existing.userLocked||existing.facet!==candidate.facet||(existing.kind==='story')!==story))continue;
  // No topic-based upsert: each new statement gets an independent identity.
  if(!existing&&state.memories.some(m=>m.participantId===owner&&!m.deleted&&m.facet===candidate.facet&&m.text.trim()===candidate.text.trim()))continue;
  const patch={...(story?{kind:'story',storyType:candidate.storyType,topic:'story',facet:null}:{topic:facet.topic,facet:facet.id}),text:candidate.text.trim(),...(!story?{readiness:['understood','needs_exploration','incidental'].includes(candidate.readiness)?candidate.readiness:null}:{}),summary:typeof candidate.summary==='string'&&candidate.summary.trim().length<=110?candidate.summary.trim():null,status:candidate.status,strength:story?'unknown':candidate.strength,evidenceIds:[...new Set(candidate.evidenceIds)]};
  if(existing&&existing.text===patch.text&&existing.readiness===patch.readiness&&existing.summary===patch.summary&&existing.status===patch.status&&existing.strength===patch.strength&&existing.storyType===patch.storyType&&JSON.stringify(existing.evidenceIds)===JSON.stringify(patch.evidenceIds))continue;
  let memory=existing;
  if(memory){archive(memory);Object.assign(memory,patch,{revision:memory.revision+1,sharing:'private'});}
  else {memory={id:`memory-${randomUUID()}`,participantId:owner,...patch,sharing:'private',revision:1,deleted:false,history:[]};state.memories.push(memory);}
  updates.push(snapshot(memory));
 }
 return updates;
 }
 editInTransaction(state,owner,id,patch,remove=false) {
 let m=id?state.memories.find(m=>m.id===id&&m.participantId===owner&&!m.deleted):null;
 if(id&&!m)throw Error('Memory not found.');
 if(!m)m={id:`memory-${randomUUID()}`,participantId:owner,revision:0,sharing:'private',status:'confirmed',strength:'prefers',evidenceIds:[],deleted:false,history:[]};
 if(!remove){
  const next={...m,...patch};const facet=facetFor(next.facet);
  if(id&&(m.kind==='story')!==(next.kind==='story'))throw Error('Memory kind cannot change.');
  if(!clean(next.text)||(next.kind==='story'?(!storyTypes.includes(next.storyType)||next.topic!=='story'||next.facet!==null):(!facet||facet.topic!==next.topic))||!statuses.includes(next.status)||!strengths.includes(next.strength)||!['private','shareable'].includes(next.sharing))throw Error('Valid memory text, facet, status and strength are required.');
 }
 if(id)archive(m);
 if(remove)m.deleted=true;
 else for(const key of ['kind','storyType','text','topic','facet','status','strength','sharing'])if(patch[key]!==undefined)m[key]=key==='text'?patch[key].trim():patch[key];
 if(patch.text!==undefined||patch.status!==undefined)m.readiness=null;
 if(['text','status','strength'].some(key=>patch[key]!==undefined))m.summary=null;
 if(m.kind==='story')m.strength='unknown';
 m.revision++;m.userLocked=true;if(!id)state.memories.push(m);return snapshot(m);
 }
}
