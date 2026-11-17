export const ukToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function repeatRule(input={},due){
 const frequency=input.frequency||'none',interval=input.interval??1,basis=input.basis||'scheduled';
 if(!['none','daily','weekly','monthly'].includes(frequency)||!Number.isInteger(interval)||interval<1||interval>365||!['scheduled','completed'].includes(basis))throw Error('Choose a valid repeat schedule.');
 if(frequency!=='none'&&!due)throw Error('Choose the first due date for a repeating task.');
 return {frequency,interval,basis,anchor_day:due?Number(due.slice(-2)):1};
}
export function nextOccurrence(rule,scheduled,completed=ukToday()){
 if(rule.frequency==='none')return null;
 const base=rule.basis==='completed'?completed:scheduled;
 const d=new Date(base+'T00:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('Invalid repeat date.');
 if(rule.frequency==='monthly'){
  const anchor=rule.basis==='completed'?d.getUTCDate():rule.anchor_day;
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+rule.interval);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchor,last));
 }else d.setUTCDate(d.getUTCDate()+rule.interval*(rule.frequency==='weekly'?7:1));
 return d.toISOString().slice(0,10);
}
