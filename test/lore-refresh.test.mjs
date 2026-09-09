import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AstridApp,JsonFileRepository} from '../src/domain.mjs';
import {freshProfiles} from '../src/startup.mjs';
const empty=()=>({memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]});
const belief=(extra={})=>({topic:'ambition',facet:'ambition.work',text:'Work supports a life with room for making things.',summary:'Makes room for creative work outside paid employment.',status:'confirmed',strength:'prefers',readiness:'understood',evidenceIds:['old-0'],...extra});
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'astrid-lore-'));const app=new AstridApp({repository:new JsonFileRepository(join(dir,'state.json'),freshProfiles(2)),agents:{}});app.kick=()=>{};await app.init();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});await app.repo.transact(s=>{for(let i=0;i<45;i++)s.messages.push({id:`old-${i}`,chatId:'astrid-person-1',authorId:'person-1',role:'user',text:`Own story ${i}`});s.messages.push({id:'foreign',chatId:'astrid-person-2',authorId:'person-2',role:'user',text:'Private other story'});});return app;}
test('lore refresh reprocesses full allowed history, commits readiness and schedules a fresh review without changing profiles or chats',async t=>{
 const app=await setup(t);const before=await app.repo.read();
 app.agents.understand=async ctx=>{assert.equal(ctx.retrospective,true);assert.equal(ctx.messages.length,45);assert.equal(ctx.messages[0].id,'old-0');assert.equal((await app.view('person-1')).participant.understandingPending,true);return {...empty(),memories:[belief()],profileUpdates:[{field:'age',value:'99'}]};};
 assert.equal((await app.summarizeLore('person-1')).updated,1);const after=await app.repo.read();assert.deepEqual(after.messages,before.messages);assert.equal(after.participants[0].age,before.participants[0].age);assert.equal(after.memories[0].readiness,'understood');assert.equal(after.memories[0].summary,belief().summary);assert.equal(after.jobs.length,1);assert.equal(after.participants[0].revision,before.participants[0].revision+1);assert.equal(after.participants[0].understandingPending,false);
});
test('refresh respects deletion barrier, locked records, tombstones and ownership while refining surviving record evidence',async t=>{
 const app=await setup(t);await app.repo.transact(s=>{s.participants[0].contextAfterMessageCount=44;for(const [id,extra] of [['existing',{}],['locked',{userLocked:true}],['deleted',{deleted:true}]])s.memories.push({id,participantId:'person-1',...belief({text:id}),revision:1,sharing:'private',...extra});});
 app.agents.understand=async ctx=>{assert.deepEqual(ctx.messages.map(m=>m.id),['old-44']);assert.equal(ctx.memoryTombstones[0].id,'deleted');return {...empty(),memories:[belief({id:'existing'}),belief({id:'locked'}),belief({id:'deleted'}),belief({text:'Resurrect old detail'}),belief({text:'Foreign data',evidenceIds:['foreign']})]};};
 assert.equal((await app.summarizeLore('person-1')).updated,1);const s=await app.repo.read();assert.equal(s.memories.length,3);assert.equal(s.memories.find(m=>m.id==='locked').text,'locked');assert.equal(s.memories.find(m=>m.id==='deleted').deleted,true);assert.equal(s.memories.find(m=>m.id==='existing').revision,2);
});
test('failed refresh clears pending and can retry; committed tool result survives final response failure',async t=>{
 const app=await setup(t);app.agents.understand=async()=>{throw Error('provider failed');};await assert.rejects(app.summarizeLore('person-1'),/provider/);assert.equal((await app.view('person-1')).participant.understandingPending,false);assert.equal(app.busy.size,0);
 app.agents.understand=async ctx=>{const batch={...empty(),memories:[belief()]};const first=await ctx.commitUnderstanding(batch);const second=await ctx.commitUnderstanding(batch);assert.deepEqual(second,first);throw Error('acknowledgement failed');};assert.equal((await app.summarizeLore('person-1')).updated,1);assert.equal((await app.listMemories('person-1')).memories.length,1);
});
test('concurrent user corrections reject stale refresh and overlapping refreshes are blocked',async t=>{
 const app=await setup(t);app.agents.understand=async()=>{await assert.rejects(app.summarizeLore('person-1'),/already updating/);await app.profile('person-1',{name:'Corrected'});return {...empty(),memories:[belief()]};};await assert.rejects(app.summarizeLore('person-1'),/changed during/);const s=await app.repo.read();assert.equal(s.memories.length,0);assert.equal(s.participants[0].name,'Corrected');assert.equal(s.participants[0].understandingPending,false);assert.equal(app.busy.size,0);
});

test('refresh repairs classification in place, retaining evidence history and protecting ordinary writes',async t=>{
 const app=await setup(t);await app.repo.transact(s=>s.memories.push({id:'misfiled',participantId:'person-1',...belief({topic:'dating',facet:'dating.intent'}),revision:1,sharing:'private'}));
 const revised=belief({id:'misfiled'});
 await app.repo.transact(s=>assert.deepEqual(app.memoryStore.applyInTransaction(s,'person-1',[revised],new Set(['old-0'])),[]));
 app.agents.understand=async()=>({...empty(),memories:[revised]});assert.equal((await app.summarizeLore('person-1')).updated,1);
 const s=await app.repo.read();assert.equal(s.memories.length,1);assert.equal(s.memories[0].id,'misfiled');assert.equal(s.memories[0].facet,'ambition.work');assert.equal(s.memories[0].revision,2);assert.equal(s.memories[0].history[0].facet,'dating.intent');
});
