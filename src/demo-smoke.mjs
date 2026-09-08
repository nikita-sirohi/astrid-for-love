import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { AstridApp, JsonFileRepository } from './domain.mjs';
import { createAgents } from './agents.mjs';
import { root } from './runtime.mjs';

const mode=process.argv.includes('--live')?'live':'offline';
const repository=new JsonFileRepository(resolve(root,`.local/demo-smoke/${Date.now()}/state.json`));
const app=new AstridApp({repository,agents:createAgents({mode}),mode});
try {
  await app.init();
  console.log(`Running ${mode} demo lifecycle against fictional fixtures.`);
  const reply=await app.converse('maya','To clarify what I mean: my mother must be able to live with me. I will arrange separate space and professional care. I do not expect a partner to be her caregiver. Those are my actual expectations.');
  console.log('Astrid:',reply.reply.text);
  console.log('Memories updated:',reply.memoryUpdates.map(m=>`${m.topic}:${m.status}`).join(', '));
  assert.equal((await app.view('maya')).coverage.family,true,'Family understanding should be confirmed by the explicit message.');
  await app.runMatching('maya');
  await app.drain();
  const deadline=Date.now()+480000;
  while((await repository.read()).jobs.some(j=>['queued','running'].includes(j.status))) {
    if(Date.now()>deadline)throw new Error('Matching did not settle.');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const s=await repository.read();
  assert.ok(!s.jobs.some(j=>j.status==='failed'),'Background job failed; inspect local presenter record.');
  const proposal=s.proposals.find(p=>p.participantIds.includes('maya')&&p.participantIds.includes('eli')&&p.status==='pending');
  assert.ok(proposal,'Expected Maya/Eli proposal from the compatible fictional record.');
  assert.ok(s.reviews.some(r=>r.participantIds.includes('theo')&&r.decision==='withhold'),'Theo firm conflict should be withheld.');
  console.log('Matchy:',s.reviews.map(r=>`${r.participantIds.join('+')}: ${r.decision}`).join('; '));
  console.log('Proposal:',proposal.introductions.maya);
  await app.decision('maya',proposal.id,'accepted');
  assert.equal((await repository.read()).chats.length,0);
  const {chat}=await app.decision('eli',proposal.id,'accepted');
  assert.equal(chat.astridPresent,false);
  await app.chatMessage(chat.id,'maya','Fictional private shared message — not for Astrid.');
  const checkin=await app.checkin('maya',chat.id);
  console.log('Private check-in:',checkin.reply.text);
  console.log(`Lifecycle passed. State: ${repository.file}`);
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await app.close();}
