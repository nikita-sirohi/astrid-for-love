import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../src/server.mjs';

test('separate participant ports pin identity and share consent/chat state through one repository',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'astrid-ports-'));
 const running=await start({port:0,mode:'offline',file:join(dir,'state.json')});
 t.after(async()=>{await running.close();await rm(dir,{recursive:true,force:true});});
 const address=id=>`http://127.0.0.1:${running.addresses.find(a=>a.participantId===id).port}`;
 const request=(id,path,body)=>fetch(address(id)+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 for(const id of ['maya','eli','theo']) {
  const bootstrap=await (await request(id,'/api/bootstrap')).json();assert.equal(bootstrap.activeParticipantId,id);assert.equal(bootstrap.operator,false);
  assert.equal((await request(id,`/api/participants/${id}`)).status,200);
  assert.equal((await request(id,'/api/presenter')).status,404);
  assert.equal((await request(id,'/api/demo/reset',{})).status,404);
 }
 assert.equal((await request('maya','/api/participants/eli')).status,403);
 assert.equal((await fetch(address('maya')+'/api/participants/eli',{headers:{'X-Participant-Id':'eli'}})).status,403);
 assert.equal((await fetch(address('maya')+'/api/bootstrap',{headers:{Origin:address('eli')}})).status,403);
 assert.equal((await request(null,'/api/presenter')).status,200);
 await running.app.editMemory('maya','maya-family',{text:'My mother must live with me, with separate space and professional care; no partner caregiving.',status:'confirmed',strength:'requires'});
 await running.app.drain();
 while(running.app.workerRunning)await new Promise(r=>setTimeout(r,10));
 const proposal=(await running.app.view('maya')).proposals.find(p=>p.status==='pending'&&p.participantIds.includes('eli'));assert.ok(proposal);
 assert.equal((await request('maya',`/api/proposals/${proposal.id}/decision`,{decision:'accepted'})).status,200);
 assert.equal((await running.app.view('maya')).chats.length,0);
 const accepted=await (await request('eli',`/api/proposals/${proposal.id}/decision`,{decision:'accepted'})).json();assert.ok(accepted.chat);
 await request('maya',`/api/chats/${accepted.chat.id}/messages`,{text:'See you for coffee?'});
 const chat=await (await request('eli',`/api/chats/${accepted.chat.id}`)).json();assert.equal(chat.messages.at(-1).text,'See you for coffee?');
});
