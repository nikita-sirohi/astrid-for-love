import test from 'node:test';
import assert from 'node:assert/strict';
import {topicUnderstanding,facets,safeClarification} from '../src/understanding.mjs';
import {createAgents} from '../src/agents.mjs';
const record=(topic,extra={})=>({id:topic,participantId:'a',topic,facet:facets.find(f=>f.topic===topic).id,status:'confirmed',text:'A concrete expectation.',...extra});
test('explicit undecided is understood; incidental slogans and tentative beliefs do not invent readiness',()=>{
 const state={memories:[record('family',{text:'I am undecided about children.',readiness:'understood'}),record('dating',{text:'Smart.',readiness:'incidental'}),record('ambition',{status:'tentative',readiness:'needs_exploration'})]};
 const result=topicUnderstanding(state,'a');
 assert.equal(result.family.status,'understood');assert.equal(result.dating.status,'not_discussed');assert.equal(result.ambition.status,'needs_exploration');assert.equal(result.repair.status,'not_discussed');
 state.memories.push(record('family',{id:'tentative-detail',status:'tentative'}));assert.equal(topicUnderstanding(state,'a').family.status,'understood');
 state.memories[0].deleted=true;assert.equal(topicUnderstanding(state,'a').family.status,'needs_exploration');
});
test('legacy confirmed records provide basic topic coverage, not sixteen-facet completion',()=>{
 const state={memories:[record('family')]};assert.equal(topicUnderstanding(state,'a').family.status,'understood');assert.deepEqual(topicUnderstanding(state,'a').family.evidenceIds,['family']);
});
test('purpose survives own-context handoff while private free text and other evidence are stripped',async()=>{
 const agents=createAgents({mode:'live',config:{key:'test',model:'test'},client:async request=>{
  const context=JSON.parse(request.input[0].content).context;
  assert.equal(context.clarifications[0].purpose,'reciprocity');assert.match(context.clarifications[0].uncertainty,/give in return/);assert.doesNotMatch(JSON.stringify(context),/COUNTERPART SECRET/);
  assert.deepEqual(context.clarifications[0].evidenceIds,['ambition']);return {data:{reply:'What would you make room for in return?',permissions:[]}};
 }});
 await agents.converse({participant:{id:'a'},memories:[record('ambition')],messages:[],clarifications:[{id:'c',participantId:'a',topic:'ambition',facet:'ambition.work',purpose:'reciprocity',status:'queued',uncertainty:'COUNTERPART SECRET',reason:'COUNTERPART SECRET',evidenceIds:['ambition','foreign']}]});
 assert.equal(safeClarification({facet:'ambition.work',purpose:'COUNTERPART SECRET'}).purpose,'baseline');
});
