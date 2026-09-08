import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { AstridApp,JsonFileRepository } from '../src/domain.mjs';
import { createAgents } from '../src/agents.mjs';
import { createServer } from '../src/server.mjs';

test('HTTP API enforces private actors, rejects foreign origins, hides secrets, and completes consent',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'astrid-http-'));const repo=new JsonFileRepository(resolve(directory,'state.json'));
  const app=new AstridApp({repository:repo,agents:createAgents({mode:'offline'}),mode:'offline'});await repo.init();
  const server=createServer(app);await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  const url=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,actor,method='GET',body)=>{const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(actor?{'X-Participant-Id':actor}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try {
    assert.equal((await request('/api/participants/maya','eli')).status,403);
    assert.equal((await request('/api/participants/maya')).status,403);
    assert.equal((await fetch(url+'/api/demo/reset',{method:'POST',headers:{Origin:'https://foreign.example'}})).status,403);
    assert.equal((await fetch(url+'/.env')).status,404);
    assert.equal((await fetch(url+'/index.html')).status,200);
    assert.equal((await request('/api/bootstrap')).data.fictional,true);
    assert.equal((await request('/api/participants/maya/memories/maya-family','eli','PATCH',{text:'overwrite'})).status,403);
    const memory=await request('/api/participants/maya/memories/maya-family','maya','PATCH',{text:'My mother must live with me, with separate space and professional care; no partner caregiving.',status:'confirmed',strength:'requires'});
    assert.equal(memory.status,200);await app.drain();
    const proposal=(await request('/api/participants/maya','maya')).data.proposals.find(p=>p.status==='pending');assert.ok(proposal);
    const single=await request(`/api/proposals/${proposal.id}/decision`,'maya','POST',{decision:'accepted'});assert.equal(single.status,200);assert.equal(single.data.chat,undefined);assert.deepEqual(Object.keys(single.data.proposal.introductions),['maya']);
    const both=await request(`/api/proposals/${proposal.id}/decision`,'eli','POST',{decision:'accepted'});assert.equal(both.status,200);assert.equal(both.data.chat.astridPresent,false);
    const id=both.data.chat.id;assert.equal((await request(`/api/chats/${id}`,'theo')).status,404);
    const sent=await request(`/api/chats/${id}/messages`,'maya','POST',{text:'Hi Eli!'});assert.equal(sent.data.message.authorId,'maya');
    assert.equal((await request(`/api/chats/${id}`,'eli')).data.messages.at(-1).text,'Hi Eli!');
  } finally {await app.close();await new Promise(done=>server.close(done));await rm(directory,{recursive:true,force:true});}
});
