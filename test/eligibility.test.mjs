import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibility } from '../src/domain.mjs';

test('eligibility requires mutual stated gender preferences without assumptions',()=>{
  const a={age:30,gender:'nonbinary',interestedIn:[' Woman '],ageRange:[25,40],location:'San Francisco',matchingEnabled:true};
  const b={age:31,gender:'woman',interestedIn:['nonbinary'],ageRange:[25,40],location:'San Francisco',matchingEnabled:true};
  assert.equal(eligibility(a,b),null);
  assert.match(eligibility(a,{...b,interestedIn:[]}),/clarification/);
  assert.match(eligibility(a,{...b,interestedIn:['man']}),/both directions/);
  assert.match(eligibility(a,{...b,gender:''}),/clarification/);
  assert.match(eligibility(a,{...b,matchingEnabled:false}),/paused/);
});
