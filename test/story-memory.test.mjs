import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp,JsonFileRepository } from '../src/domain.mjs';
import { coverageDetails } from '../src/understanding.mjs';
import { createAgents } from '../src/agents.mjs';
const base=()=>({memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]});
const story=()=>({id:null,storyType:'passion',text:'Restores discarded radios and names each one after a storm.',status:'confirmed',evidenceIds:['u']});
const person={id:'maya',name:'Maya',interestedIn:[],revision:1};
const context={participant:person,memories:[],messages:[{id:'u',chatId:'astrid-maya',authorId:'maya',role:'user',text:story().text}]};
const adapter=(data,inspect=()=>{})=>createAgents({config:{key:'fake',model:'fake'},client:async request=>{inspect(JSON.parse(request.input[0].content).context);return {data:structuredClone(data)};}});
test('story extraction requires supported fresh own evidence and valid category, never assistant/fabricated evidence',async()=>{
 assert.equal((await adapter({...base(),stories:[story()]}).understand(context)).stories.length,1);
 for(const bad of [{...story(),evidenceIds:['assistant']},{...story(),storyType:'diagnosis'},{...story(),facet:'dating.intent'}])await assert.rejects(adapter({...base(),stories:[bad]}).understand(context),/Invalid agent/);
 const old={...context,messages:[{...context.messages[0],id:'old'},context.messages[0]]};
 await assert.rejects(adapter({...base(),stories:[{...story(),evidenceIds:['old']}]}).understand(old),/Invalid agent/);
});
test('story identity cannot revise a relationship belief, locked note or tombstone',async()=>{
 for(const record of [{id:'s',kind:'story',userLocked:true},{id:'s',facet:'dating.intent'}])await assert.rejects(adapter({...base(),stories:[{...story(),id:'s'}]}).understand({...context,memories:[{...record,participantId:'maya'}]}),/Invalid agent/);
 await assert.rejects(adapter({...base(),stories:[{...story(),id:'s'}]}).understand({...context,memoryTombstones:[{id:'s',kind:'story'}]}),/Invalid agent/);
});
test('stories persist before Astrid replies, stay private and outside readiness; permissions are recipient/version scoped',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'astrid-stories-'));const file=join(dir,'state.json');const repo=new JsonFileRepository(file);
 const app=new AstridApp({repository:repo,agents:{understand:async ctx=>({...base(),stories:[{...story(),evidenceIds:[ctx.messages.at(-1).id]}]}),converse:async ctx=>{assert.equal(ctx.memories.filter(m=>m.kind==='story').length,1);return {reply:'What drew you to old radios?',permissions:[]};}}});app.kick=()=>{};await app.init();
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 await repo.transact(s=>{s.memories=[];});
 await app.converse('maya',story().text);let state=await repo.read();const record=state.memories[0];
 assert.equal(record.kind,'story');assert.equal(record.facet,null);assert.equal(record.sharing,'private');assert.ok(Object.values(coverageDetails(state,'maya')).every(v=>!v));
 assert.deepEqual(app.sharedMemories(state,'maya','eli'),[]);
 const permission=await repo.transact(s=>app.addPermission(s,'maya',{memoryId:record.id,recipientId:'eli'}));
 await app.decidePermission('maya',permission.id,'granted');state=await repo.read();
 assert.equal(app.sharedMemories(state,'maya','eli').length,1);assert.equal(app.sharedMemories(state,'maya','theo').length,0);
 await adapter({text:'Ask Maya about the radios.'},ctx=>{assert.equal(ctx.shareableMemories[0].kind,'story');assert.equal(ctx.shareableMemories[0].text,record.text);}).introduce({recipient:{id:'eli'},other:person,shareableMemories:app.sharedMemories(state,'maya','eli')});
 await app.editMemory('maya',record.id,{text:'Repairs radios, but does not name them.'});state=await repo.read();assert.equal(app.sharedMemories(state,'maya','eli').length,0);
 const reopened=new JsonFileRepository(file);await reopened.init();assert.equal((await reopened.read()).memories[0].userLocked,true);
 await app.editMemory('maya',record.id,{},true);state=await repo.read();assert.equal((await app.listMemories('maya')).memories.length,0);assert.ok(!JSON.stringify(app.ownContext(state,'maya')).includes('Restores discarded'));
 const updates=await repo.transact(s=>app.memoryStore.applyInTransaction(s,'maya',[{...record,text:'Resurrected',evidenceIds:['u']}],new Set(['u'])));assert.equal(updates.length,0);
});
test('Matchy can inspect private stories as evidence without counting them as readiness',async()=>{
 const memories=[{...story(),id:'s',kind:'story',participantId:'maya',facet:null}];
 await adapter({decision:'needs_clarification',exploration:'hold',reason:'This chosen activity may reveal priorities, not a settled requirement.',evidenceIds:['s'],clarifications:[{participantId:'maya',topic:'ambition',facet:'ambition.work',purpose:'priority',evidenceIds:[]}]},ctx=>{assert.equal(ctx.memories[0].id,'s');assert.ok(Object.values(ctx.topicUnderstanding.maya).every(t=>t.status==='not_discussed'));}).review({participants:[person,{id:'eli'}],memories});
 await adapter({reply:'How did radio restoration start?',permissions:[]},ctx=>assert.equal(ctx.memories[0].kind,'story')).converse({...context,memories});
});
