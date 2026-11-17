// Retain an operation ID until a write is acknowledged, including connection loss.
// Browser-tab memory only. Task contents are not written to persistent storage here.
class RetryWrites {
 constructor(){this.pending=new Map();}
 key(body){
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  return JSON.stringify(stable({kind:body.kind,input:body.input}));
 }
 prepare(body){const key=this.key(body),operation_id=this.pending.get(key)||body.operation_id;this.pending.set(key,operation_id);return {key,body:{...body,operation_id}};}
 acknowledge(key){this.pending.delete(key);}
}
