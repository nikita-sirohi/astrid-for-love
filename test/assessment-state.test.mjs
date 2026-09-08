import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewRequests, assessmentIsCurrent } from '../web/assessment-state.js';

test('only the newest overlapping refresh may publish, including after a profile reset', () => {
  const requests=new ViewRequests();
  const slow=requests.begin('refresh'),fast=requests.begin('refresh');
  assert.equal(requests.current(fast),true);
  assert.equal(requests.current(slow),false);
  const advice=requests.begin('advice:maya');
  requests.reset();
  const fresh=requests.begin('refresh');
  assert.equal(requests.current(fast),false);
  assert.equal(requests.current(advice),false);
  assert.equal(requests.current(fresh),true);
});

test('advice requests are independent by person but cannot overwrite a newer take', () => {
  const requests=new ViewRequests();
  const older=requests.begin('advice:maya'),other=requests.begin('advice:eli'),newer=requests.begin('advice:maya');
  assert.equal(requests.current(older),false);
  assert.equal(requests.current(other),true);
  assert.equal(requests.current(newer),true);
  requests.begin('advice:maya'); // A matching refresh invalidates this advice.
  assert.equal(requests.current(newer),false);
});

test('assessment requires both participants current revisions and completed understanding', () => {
  const actor={id:'eli',revision:2};
  const other={id:'maya',comparison:{revisions:{eli:2,maya:5},pending:false}};
  const assessment={revisions:{eli:2,maya:5}};
  assert.equal(assessmentIsCurrent(assessment,actor,other),true);
  assert.equal(assessmentIsCurrent(assessment,{...actor,revision:3},other),false);
  assert.equal(assessmentIsCurrent(assessment,actor,{...other,comparison:{revisions:{eli:2,maya:6}}}),false);
  assert.equal(assessmentIsCurrent(assessment,actor,{...other,comparison:{revisions:{eli:3,maya:5}}}),false);
  assert.equal(assessmentIsCurrent(assessment,{...actor,understandingPending:true},other),false);
  assert.equal(assessmentIsCurrent(assessment,actor,{...other,comparison:{...other.comparison,pending:true}}),false);
  assert.equal(assessmentIsCurrent(assessment,actor,undefined),false);
  assert.equal(assessmentIsCurrent(undefined,actor,other),false);
});
