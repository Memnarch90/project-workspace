// Local only: never deploy this GitHub identity test double.
import {createWorker} from '../worker.mjs';
import schema from '../schema.sql';
const worker=createWorker(async(url,options)=>{
 new Request(url,options);
 if(url==='https://github.com/login/oauth/access_token')return Response.json({access_token:options.body.get('code'),scope:''});
 if(url==='https://api.github.com/user')return Response.json({id:options.headers.Authorization==='Bearer owner-fixture'?100001:123});
 throw Error('Unexpected upstream');
});
export default {async fetch(request,env,ctx){await env.DB.exec(schema.replace(/\s+/g,' '));return worker.fetch(request,env,ctx);}};
