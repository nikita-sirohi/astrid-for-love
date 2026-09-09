import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent} from '../src/agent-runner.mjs';
import {createAgents} from '../src/agents.mjs';
const empty={type:'object',properties:{},required:[],additionalProperties:false};
const call=(name,id='c',args='{}')=>({type:'function_call',call_id:id,name,arguments:args});
const validate=(value)=>value&&typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value).length;

test('agent sees tool receipts and encrypted reasoning before choosing its next action',async()=>{
 let turn=0;const result=await runAgent({input:[],validate,tools:[{name:'inspect',description:'inspect',parameters:empty,execute:async()=>({fact:'actual'})}],request:async({input})=>{
  if(!turn++)return {output:[{type:'reasoning',id:'r',encrypted_content:'opaque'},call('inspect')],usage:{total_tokens:5}};
  assert.ok(input.some(i=>i.encrypted_content==='opaque'));assert.equal(JSON.parse(input.at(-1).output).result.fact,'actual');return {data:{reply:'Informed'},usage:{total_tokens:3}};
 }});assert.equal(result.steps,2);assert.equal(result.usage.total_tokens,8);assert.equal(result.trace[0].ok,true);
});
test('invalid tool arguments and forbidden tools return safe errors without executing',async()=>{
 let count=0,turn=0;const result=await runAgent({input:[],validate,tools:[{name:'write',parameters:empty,execute:async()=>count++}],request:async({input})=>{
  if(!turn++)return {output:[call('forbidden'),call('write','c2','{"participantId":"other"}')]};
  assert.ok(input.filter(i=>i.type==='function_call_output').every(i=>JSON.parse(i.output).ok===false));return {data:{}};
 }});assert.equal(count,0);assert.equal(result.trace.length,2);
});
test('duplicate call IDs never execute writes twice and conflicting reuse fails',async()=>{
 let writes=0,turn=0;await runAgent({input:[],validate,tools:[{name:'write',parameters:empty,execute:async()=>++writes}],request:async()=>turn++<2?{output:[call('write')]}:{data:{}}});assert.equal(writes,1);
 turn=0;await assert.rejects(runAgent({input:[],validate,tools:[{name:'write',parameters:empty,execute:async()=>{}}],request:async()=>({output:[call(turn++?'different':'write')]})}),/Conflicting/);
});
test('step and tool budgets stop a runaway agent',async()=>{
 let turn=0;await assert.rejects(runAgent({input:[],validate,maxSteps:2,request:async()=>({output:[call('unknown',String(turn++))]})}),/step limit/);
 await assert.rejects(runAgent({input:[],validate,maxToolCalls:1,request:async()=>({output:[call('unknown','1'),call('unknown','2')]})}),/tool limit/);
 let requests=0;await assert.rejects(runAgent({input:[],validate,timeoutMs:0,request:async()=>requests++}),/timed out/);assert.equal(requests,0);
});
test('a required commit cannot be skipped by a text-only final response',async()=>{
 let requests=0;await assert.rejects(runAgent({input:[],validate,maxSteps:2,acceptFinal:()=>false,request:async()=>{requests++;return {data:{},output:[]};}}),/step limit/);assert.equal(requests,2);
});
test('Memy observes real commit receipt and cannot commit a conflicting second batch',async()=>{
 const participant={id:'a',name:'A'};let calls=0,writes=0;
 const data={memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]};
 const agents=createAgents({config:{key:'test',model:'test'},client:async({input,tools})=>{
  assert.ok(tools.some(t=>t.name==='commit_understanding'));
  if(!calls++)return {output:[call('commit_understanding','one',JSON.stringify(data))]};
  if(calls===2){assert.equal(JSON.parse(input.at(-1).output).result.revision,2);return {output:[call('commit_understanding','two',JSON.stringify({...data,gaps:[{topic:'family',reason:'A conflicting second batch'}]}))]};}
  assert.equal(JSON.parse(input.at(-1).output).ok,false);return {data,output:[]};
 }});
 const result=await agents.understand({participant,memories:[],messages:[],clarifications:[],commitUnderstanding:async()=>{writes++;return {revision:2,updates:[]};}});
 assert.equal(writes,1);assert.equal(result.metadata.toolTrace[0].tool,'commit_understanding');
});
test('Astrid can request matching and inspect results without access to another person’s private records',async()=>{
 let turn=0,queued=0;
 const agents=createAgents({config:{key:'test',model:'test'},client:async({tools,input})=>{
  assert.ok(!tools.some(t=>['commit_understanding','check_review'].includes(t.name)));
  assert.ok(!JSON.stringify(input).includes('OTHER SECRET'));
  if(!turn++)return {output:[call('request_matching')]};
  if(turn===2){assert.equal(JSON.parse(input.at(-1).output).result.status,'queued');return {output:[call('inspect_matches','second')]};}
  return {data:{reply:'What would you want to make time for together?',permissions:[]},output:[]};
 }});
 await agents.converse({participant:{id:'a',name:'A'},messages:[],memories:[{id:'foreign',participantId:'b',text:'OTHER SECRET'}],actions:{requestMatching:async()=>{queued++;return {status:'queued'};},inspectMatches:async()=>({profiles:[],clarifications:[]})}});assert.equal(queued,1);
});
test('Matchy can test a preliminary decision, observe rejection and revise to hold',async()=>{
 let turn=0;const proposal={decision:'propose',exploration:'hold',reason:'Looks promising',evidenceIds:['a1','b1'],clarifications:[]};
 const agents=createAgents({config:{key:'test',model:'test'},client:async({tools,input})=>{
  assert.ok(!tools.some(t=>t.name==='request_matching'));
  if(!turn++)return {output:[call('check_review','one',JSON.stringify(proposal))]};
  assert.equal(JSON.parse(input.at(-1).output).result.accepted,false);
  return {data:{decision:'withhold',exploration:'hold',reason:'A confirmed conflict.',evidenceIds:['a1','b1'],clarifications:[]},output:[]};
 }});
 const result=await agents.review({phase:'preliminary',participants:[{id:'a'},{id:'b'}],memories:[{id:'a1',participantId:'a',facet:'dating.intent',status:'confirmed'},{id:'b1',participantId:'b',facet:'dating.intent',status:'confirmed'}]});assert.equal(result.decision,'withhold');assert.equal(result.metadata.steps,2);
});

test('Memy empty final acknowledgement preserves the authoritative committed batch',async()=>{
 const participant={id:'a',name:'A'};let calls=0;
 const batch={memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[{topic:'family',reason:'A real unresolved practical condition.'}]};
 const agents=createAgents({config:{key:'test',model:'test'},client:async({input})=>{
  if(!calls++)return {output:[call('commit_understanding','ack-test',JSON.stringify(batch))]};
  assert.equal(JSON.parse(input.at(-1).output).result.revision,2);
  return {data:{memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]},output:[]};
 }});
 const result=await agents.understand({participant,memories:[],messages:[],clarifications:[],commitUnderstanding:async()=>({revision:2,updates:[]})});
 assert.deepEqual(result.gaps,batch.gaps);assert.equal(calls,2);
});
