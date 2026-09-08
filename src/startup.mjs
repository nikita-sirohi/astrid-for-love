import {parseArgs} from 'node:util';

export function startupOptions(args=process.argv.slice(2),env=process.env) {
  const {values}=parseArgs({args,options:{profiles:{type:'string'},store:{type:'string'},port:{type:'string'},mode:{type:'string'},help:{type:'boolean'}}});
  const options={port:Number(values.port??env.PORT??4310),mode:values.mode??env.ASTRID_MODE??'live',file:values.store??env.ASTRID_STORE,profileCount:values.profiles===undefined?undefined:Number(values.profiles)};
  if(!Number.isInteger(options.port)||options.port<1||options.port>65534)throw Error('Port must be an integer between 1 and 65534.');
  if(options.file!==undefined&&!options.file.trim())throw Error('Provide a non-empty storage file path.');
  if(options.profileCount!==undefined&&(!Number.isInteger(options.profileCount)||options.profileCount<1||options.profileCount>12))throw Error('Profiles must be an integer between 1 and 12.');
  return {...options,help:values.help};
}
export function freshProfiles(count=4) {
  return {schemaVersion:2,participants:Array.from({length:count},(_,index)=>({id:`person-${index+1}`,name:'',age:null,gender:'',pronouns:'',interestedIn:[],location:'',bio:'',photo:'/assets/portraits/cast-illustrated.png',photoPosition:['0% 0%','100% 0%','0% 100%','100% 100%'][index%4],interests:[],matchingEnabled:true,revision:1,ageRange:null,discoverable:true,demoShell:true})),memories:[],messages:[],proposals:[],chats:[],permissions:[],clarifications:[],reviews:[],jobs:[],events:[]};
}
