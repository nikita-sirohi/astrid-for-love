import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { AstridApp,JsonFileRepository } from './domain.mjs';
import { createAgents } from './agents.mjs';
import { root } from './runtime.mjs';
const mode=process.argv.includes('--live')?'live':'offline';
const repository=new JsonFileRepository(resolve(root,`.local/browse-smoke/${Date.now()}/state.json`));
const app=new AstridApp({repository,agents:createAgents({mode}),mode});
app.kick=()=>{};
try {
 await app.init();
 assert.ok((await app.discover('eli')).profiles.some(p=>p.id==='elena'));
 const {assessment}=await app.browseAdvice('eli','elena');
 console.log('Astrid:',assessment.text);console.log('Assessment:',assessment.status);
 assert.ok(['promising','explore'].includes(assessment.status));assert.equal(assessment.canRequest,true);
 const {proposal}=await app.browseInterest('eli','elena',assessment.reviewId);
 assert.equal((await app.view('eli')).chats.length,0);
 const {chat}=await app.decision('elena',proposal.id,'accepted');assert.ok(chat);assert.equal(chat.astridPresent,false);
 await app.chatMessage(chat.id,'eli','Which film would you save from oblivion?');
 assert.equal((await app.chat(chat.id,'elena')).messages.at(-1).authorId,'eli');
 const held=await app.browseAdvice('eli','maya');assert.equal(held.assessment.status,'hold');assert.equal(held.assessment.canRequest,false);
 console.log(`Browse lifecycle passed (${mode}). Local state: ${repository.file}`);
} catch(error){console.error(error.message);process.exitCode=1;}
finally {await app.close();}
