// A fresh, unseeded personal conversation through the same Memy -> Astrid loop as the app.
import { parseArgs } from 'node:util';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AstridApp, JsonFileRepository } from './domain.mjs';
import { createAgents, applicationPrompt } from './agents.mjs';
import { root } from './runtime.mjs';
const {values}=parseArgs({options:{session:{type:'string'},message:{type:'string'},file:{type:'string'}}});
try {
 if(!/^[a-zA-Z0-9_-]+$/.test(values.session||''))throw Error('Provide a session ID using letters, numbers, dashes or underscores.');
 const text=values.file?await (await import('node:fs/promises')).readFile(values.file,'utf8'):values.message;
 if(!text?.trim())throw Error('Provide --message or --file.');
 const dir=resolve(root,'.local/memy-sessions',values.session);await mkdir(dir,{recursive:true,mode:0o700});
 const fixture=resolve(dir,'seed.json');
 try {await access(fixture);}catch {
 const seed={schemaVersion:1,participants:[{id:'tester',name:'You',age:null,gender:'',pronouns:'',location:'',bio:'',interests:[],interestedIn:[],matchingEnabled:false,revision:1}],memories:[],messages:[],proposals:[],chats:[],permissions:[],clarifications:[],reviews:[],jobs:[],events:[]};
 await writeFile(fixture,JSON.stringify(seed),{mode:0o600});
 }
 const {open,unlink}=await import('node:fs/promises');const lockPath=resolve(dir,'turn.lock');
 const lock=await open(lockPath,'wx',0o600).catch(()=>{throw Error('Session is already in use.');});
 const app=new AstridApp({repository:new JsonFileRepository(resolve(dir,'state.json'),fixture),agents:createAgents()});
 try {
 const manifestPath=resolve(dir,'prompts.json');
 const manifest=Object.fromEntries(await Promise.all(['astrid','memy'].map(async role=>[role,(await applicationPrompt(role)).hash])));
 let prior;try {prior=JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(prior&&JSON.stringify(prior)!==JSON.stringify(manifest))throw Error('Session prompts changed. Start a fresh session for this version.');
 if(!prior)await writeFile(manifestPath,JSON.stringify(manifest),{mode:0o600});
 await app.init();const result=await app.converse('tester',text);console.log(result.reply.text);console.log(`\n[Saved locally; Memy ${result.reply.understandingMetadata?.durationMs} ms; Astrid ${result.reply.metadata?.durationMs} ms]`);}
 finally {await app.close();await lock.close();await unlink(lockPath);}
} catch(error) {console.error(error.message);process.exitCode=1;}
