import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startupOptions,freshProfiles} from '../src/startup.mjs';
import {start} from '../src/server.mjs';

test('startup flags select profile count, local target and port; malformed input fails',()=>{
 assert.deepEqual(startupOptions(['--profiles','2','--store','/tmp/astrid/state.json','--port','5100'],{}),{port:5100,mode:'live',file:'/tmp/astrid/state.json',profileCount:2,help:undefined});
 for(const args of [['--profiles','0'],['--profiles','2.5'],['--profiles','13'],['--port','NaN'],['--store','']])assert.throws(()=>startupOptions(args,{}));
 const seed=freshProfiles(3);assert.equal(seed.participants.length,3);assert.ok(seed.participants.every(p=>p.name===''&&p.age===null));assert.deepEqual(seed.memories,[]);
});
test('configurable stores resume profiles and reject count/mode changes without replacing people',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'astrid-startup-'));const file=join(dir,'state.json');t.after(()=>rm(dir,{recursive:true,force:true}));
 let running=await start({file,profileCount:2,port:0,mode:'offline'});
 assert.equal(running.addresses.length,3);await running.app.profile('person-1',{name:'Kept'});await running.close();
 await assert.rejects(start({file,profileCount:3,port:0,mode:'offline'}),/different profile count/);
 await assert.rejects(start({file,port:0,mode:'live'}),/different mode/);
 running=await start({file,port:0,mode:'offline'});try {assert.equal((await running.app.view('person-1')).participant.name,'Kept');assert.equal(running.addresses.length,3);}finally {await running.close();}
});
