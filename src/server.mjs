import http from 'node:http';
import { readFile, realpath, open, unlink, mkdir } from 'node:fs/promises';
import { extname, resolve, sep, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AstridApp, AppError, JsonFileRepository } from './domain.mjs';
import { createAgents } from './agents.mjs';
import { root } from './runtime.mjs';

async function body(req) {
  let value='';
  for await(const chunk of req) {value+=chunk;if(Buffer.byteLength(value)>100000)throw new AppError('Request is too large.',413);}
  if(!value)return {};
  try {const parsed=JSON.parse(value);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error();return parsed;}
  catch {throw new AppError('Expected a JSON object.',400);}
}
function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export function createServer(app,{participantId=null,allowPresenter=true}={}) {
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'");
    try {
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||''))throw new AppError('Local demo access only.',403);
      if(req.headers.origin&&!['http://'+req.headers.host].includes(req.headers.origin))throw new AppError('Cross-origin requests are not allowed.',403);
      const url=new URL(req.url,'http://'+req.headers.host);const path=decodeURIComponent(url.pathname);const method=req.method;
      if(path.startsWith('/api/')) {
        const suppliedActor=req.headers['x-participant-id'];
        if(participantId&&suppliedActor&&suppliedActor!==participantId)throw new AppError('This window belongs to another person.',403);
        const actor=participantId||suppliedActor;
        const scoped=id=>{if(!actor||actor!==id)throw new AppError('This conversation is private.',403);};
        const needsActor=()=>{if(typeof actor!=='string'||!actor)throw new AppError('Open your personal conversation window.',403);};
        let match,result;
        if(method==='GET'&&path==='/api/bootstrap') result={...await app.bootstrap(participantId),activeParticipantId:participantId,operator:allowPresenter};
        else if(method==='GET'&&path==='/api/presenter'){if(!allowPresenter)throw new AppError('Not found.',404);result=await app.presenter();}
        else if(method==='POST'&&path==='/api/demo/reset'){if(!allowPresenter)throw new AppError('Not found.',404);result=await app.reset();}
        else if((match=path.match(/^\/api\/participants\/([^/]+)(?:\/(.*))?$/))) {
          const [,id,rest]=match;scoped(id);
          if(method==='GET'&&!rest)result=await app.view(id);
          else if(method==='GET'&&rest==='discover')result=await app.discover(id);
          else if(method==='POST'&&/^discover\/[^/]+\/(advice|interest|discuss)$/.test(rest||'')){const [,other,action]=rest.split('/');const input=await body(req);result=action==='advice'?await app.browseAdvice(id,other):action==='discuss'?await app.discussAdvice(id,other,input.reviewId):await app.browseInterest(id,other,input.reviewId);}
          else if(method==='POST'&&rest==='clear')result=await app.clearProfile(id);
          else if(method==='POST'&&rest==='messages')result=await app.converse(id,(await body(req)).text);
          else if(method==='PATCH'&&rest==='profile')result=await app.profile(id,await body(req));
          else if(method==='POST'&&rest==='lore/refresh')result=await app.summarizeLore(id);
          else if(method==='GET'&&rest==='memories')result=await app.listMemories(id);
          else if(method==='GET'&&/^memories\/[^/]+\/history$/.test(rest||''))result=await app.memoryHistory(id,rest.split('/')[1]);
          else if(method==='POST'&&rest==='memories')result=await app.editMemory(id,null,await body(req));
          else if(rest?.startsWith('memories/')&&['PATCH','DELETE'].includes(method))result=await app.editMemory(id,rest.slice(9),method==='PATCH'?await body(req):{},method==='DELETE');
          else if(method==='GET'&&/^matching\/[^/]+$/.test(rest||''))result=await app.matchingStatus(id,rest.split('/')[1]);
          else if(method==='POST'&&rest==='matching')result=await app.runMatching(id);
          else if(method==='POST'&&rest==='permissions')result=await app.requestPermission(id,await body(req));
          else if(method==='POST'&&rest?.startsWith('permissions/'))result=await app.decidePermission(id,rest.slice(12),(await body(req)).decision);
          else if(method==='POST'&&rest==='checkin')result=await app.checkin(id,(await body(req)).chatId);
          else throw new AppError('Endpoint not found.',404);
        } else if(method==='POST'&&(match=path.match(/^\/api\/proposals\/([^/]+)\/decision$/))) {
          needsActor();const input=await body(req);result=await app.decision(actor,match[1],input.decision,input.feedback);
          result.proposal={...result.proposal,introductions:{[actor]:result.proposal.introductions[actor]}};
        } else if((match=path.match(/^\/api\/chats\/([^/]+)(\/messages)?$/))) {
          needsActor();if(method==='GET'&&!match[2])result=await app.chat(match[1],actor);
          else if(method==='POST'&&match[2])result=await app.chatMessage(match[1],actor,(await body(req)).text);
          else throw new AppError('Endpoint not found.',404);
        } else throw new AppError('Endpoint not found.',404);
        return json(res,200,result);
      }
      if(method!=='GET'&&method!=='HEAD')throw new AppError('Method not allowed.',405);
      const web=resolve(root,'web');let file=resolve(web,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(web+sep))throw new AppError('Not found.',404);
      try {file=await realpath(file);}catch{throw new AppError('Not found.',404);}
      if(!file.startsWith(web+sep))throw new AppError('Not found.',404);
      const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
      if(!types[extname(file)])throw new AppError('Not found.',404);
      const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache'});res.end(method==='HEAD'?undefined:content);
    } catch(error) {
      if(!res.headersSent)json(res,error instanceof AppError?error.status:500,{error:error instanceof AppError?error.message:'Astrid could not complete that request. Your saved conversation is safe; please try again.'});
      else res.end();
    }
  });
}

export async function start({port=Number(process.env.PORT||4310),mode=process.env.ASTRID_MODE||'live',file}={}) {
  if(!['live','offline'].includes(mode))throw new Error('ASTRID_MODE must be live or offline.');
  const repository=new JsonFileRepository(file,resolve(root,mode==='live'?'fixtures/people.json':'fixtures/demo.json'));const app=new AstridApp({repository,agents:createAgents({mode}),mode});
  // One writer process per app store. Stale locks require deliberate operator recovery.
  await mkdir(dirname(repository.file),{recursive:true,mode:0o700});const lockPath=repository.file+'.server.lock';let lock;
  try {lock=await open(lockPath,'wx',0o600);}catch {throw new Error('App store is already locked. Stop the other server, or remove its stale .server.lock after confirming that process exited.');}
  await lock.writeFile(String(process.pid));
  try {await repository.init();} catch(error){await lock.close();await unlink(lockPath);throw error;}
  app.kick();
  const people=(await repository.read()).participants;
  const servers=[];const addresses=[];
  const stopListeners=()=>Promise.all(servers.map(server=>new Promise(done=>server.close(done))));
  try {
    // Separate origins preserve independent drafts and a fixed identity, while all
    // listeners use the same application and serialized repository transaction queue.
    for(const [index,person] of [...people,null].entries()) {
      const server=createServer(app,{participantId:person?.id||null,allowPresenter:!person});
      server.requestTimeout=300000;servers.push(server);
      await new Promise((yes,no)=>{server.once('error',no);server.listen(port===0?0:port+index,'127.0.0.1',yes);});
      const address={participantId:person?.id||null,name:person?.name||'Operator',port:server.address().port};addresses.push(address);
      console.log(`${address.name} · http://127.0.0.1:${address.port}${person?'':'/?view=presenter'}`);
    }
  } catch(error){const drained=stopListeners();await app.close();await drained;await lock.close();await unlink(lockPath);throw error;}
  let closing;
  const close=()=>closing??=(async()=>{const drained=stopListeners();await app.close();await drained;await lock.close();await unlink(lockPath);})();
  return {app,server:servers[0],servers,addresses,close};

}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {const running=await start();let closing=false;const close=async()=>{if(closing)return;closing=true;await running.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
