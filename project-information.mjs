import {z} from 'zod';

const field=z.string().trim().max(4000).refine(value=>!value.includes('\0'),'Invalid text.');
const name=field.pipe(z.string().min(1).max(500));
const link=z.string().trim().max(2000).transform((value,ctx)=>{
 try{
  const url=new URL(value);
  if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=2000)return url.href;
 }catch{}
 ctx.issues.push({code:'custom',message:'Use a web link without embedded credentials.',input:value});
 return z.NEVER;
});

export const projectInformation=z.strictObject({
 purpose:field.optional(),sponsor_or_approver:field.optional(),phase:field.optional(),
 scope_in:field.optional(),scope_out:field.optional(),success_measures:field.optional(),
 key_sources:z.array(z.strictObject({name,link})).max(10).optional()
});
