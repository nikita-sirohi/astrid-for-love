import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root } from './runtime.mjs';
import { facets, facetFor, coverageDetails, safeClarification } from './understanding.mjs';
import { FileMemoryStore } from './memory-store.mjs';
import { profileFields, profileValue, applyProfileSuggestions } from './profiles.mjs';

export const topics = [ ['dating','Dating & readiness'], ['family','Family & future'], ['ambition','Ambition & everyday life'],
  ['closeness','Closeness & privacy'], ['relationships','Friends & boundaries'], ['repair','Disagreement & repair'], ['convictions','Convictions & flexibility'] ].map(([id,label]) => ({id,label}));
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${randomUUID()}`;
export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function requireValue(condition, message, status) { if (!condition) throw new AppError(message, status); }
function textValue(value, max = 6000) { requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `Text must contain 1–${max} characters.`); return value.trim(); }
function participant(state, id) { const p = state.participants.find(p => p.id === id); requireValue(p, 'Participant not found.', 404); return p; }
function ownMemory(state, id, owner) { const m = state.memories.find(m => m.id === id && m.participantId === owner && !m.deleted); requireValue(m, 'Memory not found.', 404); return m; }
function event(state, type, detail) { state.events.push({id:uid('event'),type,detail,createdAt:now()}); state.events = state.events.slice(-300); }
function message(state, chatId, authorId, role, text) { const m = {id:uid('msg'),chatId,authorId,role,text,createdAt:now()}; state.messages.push(m); return m; }
export function coverage(state,id) {const details=coverageDetails(state,id);return Object.fromEntries(topics.map(t=>[t.id,facets.filter(f=>f.topic===t.id).every(f=>details[f.id])]));}
function publicProfile(p) { const {id,name,age,gender,pronouns,location,bio,photo,photoPosition,interests} = p; return {id,name,age,gender,pronouns,location,bio,photo,photoPosition,interests}; }
function invalidate(state, p, cause, changedTopics=[]) {
  p.revision++;
  for (const proposal of state.proposals.filter(x => x.status==='pending' && x.participantIds.includes(p.id))) proposal.status='stale';
  for (const c of state.clarifications.filter(c=>c.participantId===p.id && c.status==='queued' && (!p.matchingEnabled))) c.status='obsolete';
  event(state,'understanding_changed',`${p.name}: ${cause}`);
}
function enqueue(state, id) {
  if (!participant(state,id).matchingEnabled) return null;
  const existing=state.jobs.find(j=>j.participantId===id && j.status==='queued');
  if (existing) return existing;
  const job={id:uid('job'),kind:'matching',participantId:id,status:'queued',createdAt:now(),reviewIds:[]}; state.jobs.push(job); return job;
}
export function eligibility(a,b) {
  if (!a.matchingEnabled || !b.matchingEnabled) return 'Matching is paused.';
  if (!Number.isInteger(a.age)||!Number.isInteger(b.age)||a.age<18 || b.age<18) return 'Only adults can participate.';
  if(a.profileConflicts?.length||b.profileConflicts?.length)return 'Profile facts need confirmation.';
  if (!a.gender || !b.gender || !a.interestedIn.length || !b.interestedIn.length) return 'Dating preferences need clarification.';
  const normalized=value=>({men:'man',women:'woman'}[value.trim().toLowerCase()]||value.trim().toLowerCase());
  if (!a.interestedIn.some(g=>normalized(g)===normalized(b.gender)) || !b.interestedIn.some(g=>normalized(g)===normalized(a.gender))) return 'Stated gender preferences do not align in both directions.';
  if (a.ageRange && (b.age<a.ageRange[0] || b.age>a.ageRange[1]) || b.ageRange && (a.age<b.ageRange[0] || a.age>b.ageRange[1])) return 'Age preferences do not align.';
  if (!a.location||!b.location||a.location.trim().toLowerCase()!==b.location.trim().toLowerCase()) return 'Distance preferences have not been established.';
  return null;
}

export class JsonFileRepository {
  constructor(file=resolve(root,'.local/app/state.json'), fixture=resolve(root,'fixtures/demo.json')) { this.file=file; this.fixture=fixture; this.chain=Promise.resolve(); }
  async init() {
    await mkdir(dirname(this.file),{recursive:true,mode:0o700});
    try { this.state=JSON.parse(await readFile(this.file,'utf8')); }
    catch(e) { if(e.code!=='ENOENT') throw e; this.state=await this.seed(); await this.persist(this.state); }
    requireValue([1,2].includes(this.state.schemaVersion),'Unsupported local store version.',500);
    await this.transact(s=>{s.schemaVersion=2;for(const m of s.memories){m.history??=[];m.facet??=null;}for(const c of s.clarifications)if(!facetFor(c.facet))c.status='obsolete';for(const j of s.jobs) if(j.status==='running') j.status='queued';});
  }
  async seed() { const state=JSON.parse(await readFile(this.fixture,'utf8'));state.schemaVersion=2;return state; }
  async persist(state) { const temp=`${this.file}.${randomUUID()}.tmp`; await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600}); await rename(temp,this.file); }
  async read() { await this.chain; return clone(this.state); }
  async transact(fn) {
    const operation=this.chain.then(async()=>{ const draft=clone(this.state); const result=await fn(draft); await this.persist(draft); this.state=draft; return clone(result); });
    this.chain=operation.catch(()=>{}); return operation;
  }
  async reset() { const seed=await this.seed(); return this.transact(s=>{for(const key of Object.keys(s)) delete s[key]; Object.assign(s,seed);}); }
}

export class AstridApp {
  constructor({repository,agents,mode='live',memoryStore}) { this.repo=repository; this.memoryStore=memoryStore||new FileMemoryStore(repository); this.agents=agents; this.mode=mode; this.busy=new Set(); this.workerRunning=false; this.stopped=false; }
  async init() { await this.repo.init(); this.kick(); }
  kick() { if(!this.stopped) { clearTimeout(this.timer); this.timer=setTimeout(()=>this.drain().catch(()=>{}),50); this.timer.unref?.(); } }
  async close() { this.stopped=true; clearTimeout(this.timer); while(this.workerRunning||this.busy.size) await new Promise(done=>setTimeout(done,25)); }
  async bootstrap() { const s=await this.repo.read(); return {participants:s.participants.map(publicProfile),mode:this.mode,topics,facets,fictional:true}; }
  async view(id) {
    const s=await this.repo.read(); const p=participant(s,id);
    return {participant:p,memories:this.memoryStore.records(s,id),coverage:coverage(s,id),coverageDetails:coverageDetails(s,id),profileConflicts:p.profileConflicts||[],
      messages:s.messages.filter(m=>m.chatId===`astrid-${id}`),
      proposals:s.proposals.filter(p=>p.participantIds.includes(id)).map(p=>({...p,introductions:{[id]:p.introductions[id]},other:publicProfile(participant(s,p.participantIds.find(x=>x!==id)))})),
      chats:s.chats.filter(c=>c.participantIds.includes(id)).map(c=>({...c,other:publicProfile(participant(s,c.participantIds.find(x=>x!==id))),messages:s.messages.filter(m=>m.chatId===c.id)})),
      permissions:s.permissions.filter(p=>p.participantId===id),clarifications:s.clarifications.filter(c=>c.participantId===id).map(safeClarification).filter(Boolean),busy:this.busy.has(id)};
  }
  async presenter() { const s=await this.repo.read(); return {jobs:s.jobs,reviews:s.reviews,events:s.events,counts:{participants:s.participants.length,proposals:s.proposals.length,chats:s.chats.length},mode:this.mode}; }
  ownContext(s,id) {
    const p=participant(s,id); const privateMessages=s.messages.filter(m=>m.chatId===`astrid-${id}`);
    return {participant:p,memories:this.memoryStore.records(s,id),memoryTombstones:s.memories.filter(m=>m.participantId===id&&m.deleted).map(({id,topic,facet})=>({id,topic,facet})),
      messages:privateMessages.slice(p.contextAfterMessageCount||0).slice(-40),
      clarifications:s.clarifications.filter(c=>c.participantId===id&&c.status==='queued').map(safeClarification).filter(Boolean),
      permissionRecipients:s.participants.filter(other=>other.id!==id&&!eligibility(p,other)).map(publicProfile)};
  }
  async converse(id,text) {
    text=textValue(text); requireValue(!this.busy.has(id),'Astrid is already replying. Please wait.',409); this.busy.add(id);
    let input;
    try {
      input=await this.repo.transact(s=>{participant(s,id); return message(s,`astrid-${id}`,id,'user',text);});
      const s=await this.repo.read(); const revision=participant(s,id).revision;
      const result=await this.agents.understand(this.ownContext(s,id));
      const memoryUpdates=await this.repo.transact(d=>{
        const p=participant(d,id); requireValue(p.revision===revision,'Your understanding changed while Astrid was replying. Send another message to continue with the updated context.',409);
        const validEvidence=new Set(this.ownContext(d,id).messages.filter(m=>m.role==='user').map(m=>m.id));
        const updates=this.memoryStore.applyInTransaction(d,id,result.memories,validEvidence);
        const profileChanged=applyProfileSuggestions(p,result.profileUpdates,input.id);
        let clarificationChanged=false;
        for(const update of result.clarificationUpdates||[]) {
          const c=d.clarifications.find(c=>c.id===update.id&&c.participantId===id&&c.status==='queued');
          if(!c||!update.evidenceIds?.includes(input.id)||update.evidenceIds.some(e=>e!==input.id))continue;
          if(update.status==='answered'&&!updates.some(m=>m.facet===c.facet&&m.status==='confirmed'&&m.evidenceIds.includes(input.id)))continue;
          if(['answered','deferred','declined','obsolete'].includes(update.status)){c.status=update.status;c.answerEvidenceIds=update.evidenceIds;clarificationChanged=true;}
        }
        if(updates.length||profileChanged||clarificationChanged) {invalidate(d,p,'conversation updated understanding');enqueue(d,id);}
        return {updates,revision:p.revision};
      });
      const current=await this.repo.read(); const currentRevision=participant(current,id).revision;
      requireValue(currentRevision===memoryUpdates.revision,'Your understanding changed while Memy was recording it. Send another message to continue.',409);
      const understanding={gaps:(result.gaps||[]).filter(g=>topics.some(t=>t.id===g.topic)&&typeof g.reason==='string').slice(0,3)};
      const response=await this.agents.converse({...this.ownContext(current,id),understanding});
      return await this.repo.transact(d=>{
        requireValue(participant(d,id).revision===currentRevision,'Your understanding changed while Astrid was replying. Send another message to continue with the updated context.',409);
        for(const request of response.permissions||[]) {
          if(d.memories.some(m=>m.id===request.memoryId&&m.participantId===id&&!m.deleted)&&d.participants.some(p=>p.id===request.recipientId&&p.id!==id)) this.addPermission(d,id,request);
        }
        const reply=message(d,`astrid-${id}`,'astrid','assistant',textValue(response.reply));
        reply.metadata=response.metadata;
        reply.understandingMetadata=result.metadata;
        return {message:input,reply,memoryUpdates:memoryUpdates.updates};
      });
    } finally { this.busy.delete(id); this.kick(); }
  }
  async profile(id,patch) {
    const result=await this.repo.transact(s=>{const p=participant(s,id);p.profileFieldLocks??={};p.profileConflicts??=[];p.profileEvidence??={};
      try {for(const field of [...profileFields,'bio'])if(patch[field]!==undefined){p[field]=profileValue(field,patch[field]);p.profileFieldLocks[field]=true;p.profileConflicts=p.profileConflicts.filter(c=>c.field!==field);p.profileEvidence[field]={source:'user_edit',evidenceIds:[]};}}catch(e){throw new AppError(e.message);}
      if(patch.matchingEnabled!==undefined){requireValue(typeof patch.matchingEnabled==='boolean','Invalid matching setting.');p.matchingEnabled=patch.matchingEnabled;}
      p.contextAfterMessageCount=s.messages.filter(m=>m.chatId===`astrid-${id}`).length;
      invalidate(s,p,'profile updated');enqueue(s,id);return {participant:p};});this.kick();return result;
  }
  async listMemories(id) {await this.repo.read().then(s=>participant(s,id));return {memories:await this.memoryStore.list(id)};}
  async memoryHistory(id,memoryId) {const s=await this.repo.read();requireValue(s.memories.some(m=>m.id===memoryId&&m.participantId===id),'Memory not found.',404);return {revisions:await this.memoryStore.history(id,memoryId)};}
  async editMemory(id,memoryId,patch,remove=false) {
    const result=await this.repo.transact(s=>{
      const p=participant(s,id);if(memoryId)ownMemory(s,memoryId,id);
      let m;try {m=this.memoryStore.editInTransaction(s,id,memoryId,patch,remove);}catch(e){throw new AppError(e.message);}
      p.contextAfterMessageCount=s.messages.filter(x=>x.chatId===`astrid-${id}`).length;
      for(const permission of s.permissions.filter(x=>x.memoryId===m.id))permission.status='denied';
      for(const c of s.clarifications.filter(c=>c.participantId===id&&c.status==='queued'&&c.evidenceIds?.includes(m.id)))c.status='obsolete';
      invalidate(s,p,remove?'memory removed':'memory corrected');enqueue(s,id);return remove?{ok:true}:{memory:m};
    });this.kick();return result;
  }
  addPermission(s,id,{memoryId,recipientId}) {
    const m=ownMemory(s,memoryId,id);participant(s,recipientId);requireValue(recipientId!==id,'Choose another participant.');
    const existing=s.permissions.find(p=>p.participantId===id&&p.memoryId===memoryId&&p.recipientId===recipientId&&p.memoryRevision===m.revision);
    if(existing) return existing;
    const p={id:uid('permission'),participantId:id,memoryId,recipientId,status:'pending',text:m.text,memoryRevision:m.revision,createdAt:now()};s.permissions.push(p);return p;
  }
  async requestPermission(id,body) {return this.repo.transact(s=>({permission:this.addPermission(s,id,body)}));}
  async decidePermission(id,permissionId,decision) {
    requireValue(['granted','denied'].includes(decision),'Invalid sharing decision.');
    const r=await this.repo.transact(s=>{const p=s.permissions.find(p=>p.id===permissionId&&p.participantId===id);requireValue(p,'Permission not found.',404);const m=ownMemory(s,p.memoryId,id);requireValue(m.revision===p.memoryRevision,'This information has changed; request permission again.',409);p.status=decision;invalidate(s,participant(s,id),'sharing permission updated');enqueue(s,id);return {permission:p};});this.kick();return r;
  }
  async runMatching(id) {const result=await this.repo.transact(s=>{const p=participant(s,id);requireValue(p.matchingEnabled,'Matching is paused.');return {job:enqueue(s,id)};});this.kick();return result;}
  async drain() {
    if(this.workerRunning||this.stopped) return; this.workerRunning=true;
    try {
      while(!this.stopped) {
        const job=await this.repo.transact(s=>{const j=s.jobs.find(j=>j.status==='queued');if(j)j.status='running';return j||null;});
        if(!job) break;
        try {await this.performReview(job);await this.repo.transact(s=>{const j=s.jobs.find(j=>j.id===job.id);if(j)j.status='completed';});}
        catch(error) {await this.repo.transact(s=>{const j=s.jobs.find(j=>j.id===job.id);if(j){j.status='failed';j.error=error instanceof AppError?error.message:'The matching review failed. Retry from the presenter controls.';}event(s,'job_failed',j?.error||'Matching review failed.');});}
      }
    } finally {this.workerRunning=false;}
  }
  pairBlocked(s,ids) {return s.proposals.some(p=>ids.every(id=>p.participantIds.includes(id))&&['pending','introduced','declined','withdrawn'].includes(p.status));}
  sharedMemories(s,owner,recipient) {return s.memories.filter(m=>m.participantId===owner&&!m.deleted&&(m.sharing==='shareable'||s.permissions.some(p=>p.memoryId===m.id&&p.recipientId===recipient&&p.status==='granted'&&p.memoryRevision===m.revision)));}
  async performReview(job) {
    const start=await this.repo.read();const target=participant(start,job.participantId);if(!target.matchingEnabled)return;
    for(const other of start.participants.filter(p=>p.id!==target.id)) {
      const s=await this.repo.read();const a=participant(s,target.id),b=participant(s,other.id);const ids=[a.id,b.id];
      if(this.pairBlocked(s,ids)) continue;
      const revisions={[a.id]:a.revision,[b.id]:b.revision};let result;
      const constraint=eligibility(a,b);
      const missing=ids.flatMap(id=>Object.entries(coverageDetails(s,id)).filter(([,covered])=>!covered).map(([facet])=>({participantId:id,topic:facetFor(facet).topic,facet,evidenceIds:s.memories.filter(m=>m.participantId===id&&m.facet===facet&&!m.deleted).map(m=>m.id)})));
      if(constraint) result={decision:'withhold',reason:constraint,evidenceIds:[],clarifications:[]};
      else if(missing.length) result={decision:'needs_clarification',reason:'A basic understanding is still missing. Astrid should clarify the open topic before proposing.',evidenceIds:[],clarifications:missing.slice(0,2)};
      else result=await this.agents.review({participants:[a,b],memories:ids.flatMap(id=>this.memoryStore.records(s,id)),previousReviews:s.reviews.filter(r=>ids.every(id=>r.participantIds.includes(id)&&r.revisions?.[id]===revisions[id])).slice(-4)});
      requireValue(['propose','needs_clarification','withhold'].includes(result.decision),'Invalid matching result.',502);
      const knownEvidence=new Set(s.memories.filter(m=>ids.includes(m.participantId)&&!m.deleted).map(m=>m.id));
      requireValue((result.evidenceIds||[]).every(id=>knownEvidence.has(id)),'Matching review cited unknown evidence.',502);
      if(result.decision==='propose') requireValue(result.evidenceIds?.length>0,'A proposal needs evidence.',502);
      const intros={};
      if(result.decision==='propose') {
        for(const [recipient,person] of [[a,b],[b,a]]) {
          const intro=await this.agents.introduce({recipient:publicProfile(recipient),other:publicProfile(person),shareableMemories:this.sharedMemories(s,person.id,recipient.id).map(m=>({id:m.id,participantId:m.participantId,text:m.text,revision:m.revision}))});
          intros[recipient.id]=textValue(intro.text,2000);
        }
      }
      await this.repo.transact(d=>{
        if(ids.some(id=>participant(d,id).revision!==revisions[id])) {event(d,'stale_review','A review was discarded after an understanding changed.');return;}
        const review={id:uid('review'),participantIds:ids,decision:result.decision,reason:textValue(result.reason,8000),evidenceIds:result.evidenceIds||[],clarifications:[],revisions,createdAt:now(),metadata:result.metadata};d.reviews.push(review);d.jobs.find(j=>j.id===job.id)?.reviewIds.push(review.id);
        for(const c of result.clarifications||[]) {
          const f=facetFor(c.facet);if(!ids.includes(c.participantId)||!f||f.topic!==c.topic)continue;
          const evidenceIds=c.evidenceIds||[];
          if(evidenceIds.some(id=>!d.memories.some(m=>m.id===id&&m.participantId===c.participantId&&m.facet===f.id&&!m.deleted)))continue;
          const memoryRevisions=Object.fromEntries(evidenceIds.map(id=>[id,d.memories.find(m=>m.id===id).revision]));
          const handoff={participantId:c.participantId,topic:f.topic,facet:f.id,evidenceIds,memoryRevisions};
          review.clarifications.push(handoff);
          if(!d.clarifications.some(x=>x.participantId===c.participantId&&x.facet===f.id&&['queued','deferred','declined'].includes(x.status)))d.clarifications.push({id:uid('clarification'),...handoff,status:'queued',createdAt:now()});
        }
        if(result.decision==='propose'&&!this.pairBlocked(d,ids)&&!eligibility(participant(d,a.id),participant(d,b.id))) {
          d.proposals.push({id:uid('proposal'),participantIds:ids,status:'pending',decisions:{[a.id]:'pending',[b.id]:'pending'},introductions:intros,createdAt:now(),chatId:null,reviewId:review.id,revisions});
        }
        event(d,'review_completed',`${a.name} + ${b.name}: ${result.decision}`);
      });
    }
  }
  async decision(actor,proposalId,decision,feedback) {
    requireValue(['accepted','declined','withdrawn'].includes(decision),'Invalid proposal decision.');
    return this.repo.transact(s=>{
      const p=s.proposals.find(p=>p.id===proposalId&&p.participantIds.includes(actor));requireValue(p,'Proposal not found.',404);
      if(p.status==='introduced'&&decision==='accepted')return {proposal:p,chat:s.chats.find(c=>c.id===p.chatId)};
      requireValue(p.status==='pending','This proposal is no longer pending.',409);
      requireValue(p.participantIds.every(id=>participant(s,id).revision===p.revisions[id]),'This proposal is out of date.',409);
      requireValue(!eligibility(...p.participantIds.map(id=>participant(s,id))),'This pair is no longer eligible.',409);
      if(decision==='withdrawn') p.status='withdrawn';
      else {p.decisions[actor]=decision;if(decision==='declined')p.status='declined';}
      if(feedback?.trim())message(s,`astrid-${actor}`,actor,'user',`Private proposal feedback: ${textValue(feedback,1000)}`);
      let chat;
      if(p.participantIds.every(id=>p.decisions[id]==='accepted')) {
        chat={id:uid('chat'),participantIds:p.participantIds,astridPresent:false,createdAt:now(),proposalId:p.id};s.chats.push(chat);p.status='introduced';p.chatId=chat.id;
        const [a,b]=p.participantIds.map(id=>participant(s,id));
        message(s,chat.id,'system','system','Both of you said yes. Astrid joined to introduce you.');
        // Only public interests reach the shared opening. Audience-specific proposal copy is not reused here.
        const hook=a.interests?.[0]&&b.interests?.[0]?`${a.name}, you mentioned ${a.interests[0].toLowerCase()}; ${b.name}, yours was ${b.interests[0].toLowerCase()}. `:'';
        message(s,chat.id,'astrid','assistant',`${a.name}, meet ${b.name}. ${hook}What would you each pick for an unhurried first afternoon together? I’ll leave you two to it.`);
        message(s,chat.id,'system','system','Astrid left the conversation. This chat is just for the two of you.');
        event(s,'introduced',`${a.name} and ${b.name} both accepted.`);
      }
      return {proposal:p,chat};
    });
  }
  async chat(id,actor) {const s=await this.repo.read();const chat=s.chats.find(c=>c.id===id&&c.participantIds.includes(actor));requireValue(chat,'Chat not found.',404);return {chat,messages:s.messages.filter(m=>m.chatId===id)};}
  async chatMessage(id,actor,text) {await this.chat(id,actor);return this.repo.transact(s=>({message:message(s,id,actor,'user',textValue(text))}));}
  async checkin(id,chatId) {
    const {chat}=await this.chat(chatId,id);requireValue(!this.busy.has(id),'Astrid is already replying.',409);this.busy.add(id);
    try {const s=await this.repo.read();const p=participant(s,id);const ctx=this.ownContext(s,id);const result=await this.agents.checkin({...ctx,other:publicProfile(participant(s,chat.participantIds.find(x=>x!==id)))});
      return await this.repo.transact(d=>{requireValue(participant(d,id).revision===p.revision,'Understanding changed; retry the check-in.',409);return {reply:message(d,`astrid-${id}`,'astrid','assistant',textValue(result.reply))};});
    } finally {this.busy.delete(id);}
  }
  async reset() {requireValue(!this.busy.size&&!this.workerRunning,'Wait for active conversations and reviews before resetting.',409);await this.repo.reset();return {ok:true};}
}
