// Small Responses function-calling loop. Application capabilities stay in closures,
// never in model-supplied participant IDs or arbitrary tool names.
export async function runAgent({request,input,tools=[],validate,maxSteps=6,maxToolCalls=8,timeoutMs=120000,acceptFinal=()=>true}) {
  const history=structuredClone(input),trace=[],receipts=new Map();
  const deadline=Date.now()+timeoutMs;let calls=0;const usage={input_tokens:0,output_tokens:0,total_tokens:0};
  for(let step=0;step<maxSteps;step++) {
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Agent run timed out.');
    const result=await request({input:history,tools:tools.map(({name,description,parameters})=>({type:'function',name,description,parameters,strict:true})),timeoutMs:remaining});
    for(const key of Object.keys(usage))usage[key]+=result.usage?.[key]||0;
    const functions=(result.output||[]).filter(item=>item.type==='function_call');
    if(!functions.length){
      if(acceptFinal(result))return {...result,usage,trace,steps:step+1};
      history.push(...(result.output||[]),{role:'user',content:'The required application action has not succeeded. Use the available tool before finishing.'});continue;
    }
    history.push(...result.output);
    for(const call of functions){
      if(++calls>maxToolCalls)throw Error('Agent tool limit reached.');
      if(typeof call.call_id!=='string'||typeof call.arguments!=='string')throw Error('Invalid agent tool call.');
      const identity=JSON.stringify([call.name,call.arguments]);let output;
      if(receipts.has(call.call_id)) {
        const prior=receipts.get(call.call_id);if(prior.identity!==identity)throw Error('Conflicting agent tool call.');output=prior.output;
      } else {
        const tool=tools.find(t=>t.name===call.name);let args;
        try {args=JSON.parse(call.arguments);}catch {}
        if(!tool||!validate(args,tool.parameters))output={ok:false,error:'Unknown tool or invalid arguments. Use the supplied tool schema.'};
        else {try {output={ok:true,result:await tool.execute(args)};}catch {output={ok:false,error:'Action rejected. Check the supplied evidence, permissions and current state; do not claim success.'};}}
        receipts.set(call.call_id,{identity,output});
      }
      trace.push({step:step+1,tool:call.name,ok:output.ok});
      history.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(output)});
    }
  }
  throw Error('Agent step limit reached.');
}
