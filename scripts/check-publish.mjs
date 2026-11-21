import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const problems=[];
const company=new RegExp('fed'+'ex','i');
const identities=new RegExp(['rober'+'to','cial'+'fi','jarvis'+'-pixel','247'+'238554'].join('|'),'i');
for(const file of files){
 if(/(?:^|\/)(?:node_modules|public|data|output|\.wrangler)\//i.test(file)||/\.(?:ttf|otf|woff2?|sqlite(?:3)?(?:-.*)?|db(?:-.*)?|xlsx|xlsm|zip|pem|key)$/i.test(file)||/(?:^|\/)(?:\.env.*|\.dev\.vars.*|wrangler\.jsonc)$/i.test(file)&&file!=='tests/wrangler.jsonc')problems.push(file+': excluded asset or configuration');
 if(!/\.(?:js|mjs|css|html|svg|jsonc?|sql|py)$/i.test(file))continue;
 const text=readFileSync(path.join(root,file),'utf8');
 if(company.test(file+' '+text))problems.push(file+': company branding');
 if(identities.test(text))problems.push(file+': private identity or deployment');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}/.test(text))problems.push(file+': credential pattern');
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`PASS: ${files.length} source files checked; neutral branding and no known private assets or credential patterns.`);
