import {DatabaseSync} from 'node:sqlite';
export function sqliteAdapter(path){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 function prepare(sql){
  let params=[];
  return {
   sql,bind(...values){params=values;return this;},
   async first(){return sqlite.prepare(sql).get(...params)||null;},
   async all(){return this.execute(true);},
   async run(){return this.execute(false);},
   execute(read){
    const stmt=sqlite.prepare(sql);
    if(read)return {results:stmt.all(...params)};
    return {success:true,meta:{changes:Number(stmt.run(...params).changes)},results:[]};
   }
  };
 }
 return {prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push(s.execute(/^\s*(SELECT|WITH)\b/i.test(s.sql)));sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}},exec:sql=>sqlite.exec(sql),close:()=>sqlite.close()};
}
