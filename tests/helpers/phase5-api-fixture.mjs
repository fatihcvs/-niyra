import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const migrations = await Promise.all((await readdir(new URL('drizzle/', root))).filter(name => /^\d+.*\.sql$/.test(name)).sort().map(name => readFile(new URL(`drizzle/${name}`, root), 'utf8')));
const paths = ['lib/server-api.ts', 'lib/profile.ts', 'lib/search-query.ts', 'lib/media-upload-operations.ts', 'lib/active-actor.ts',
  ...['notes', 'profile/media', 'campus-pulse', 'communities', 'community-events', 'campus-guide', 'library-occupancy', 'safety', 'social-match'].map(name => `app/api/${name}/route.ts`)];
const sources = new Map(await Promise.all(paths.map(async path => [path, ts.transpileModule(await readFile(new URL(path, root), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText])));
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=', 'base64');
export const pdf = Buffer.from('%PDF-1.7\nSynthetic owned media\n%%EOF');
export const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

export function fixture(t) {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  database.exec('PRAGMA foreign_keys=ON'); migrations.forEach(sql => database.exec(sql));
  database.exec(`INSERT INTO universities(id,name,short_name,city) VALUES('campus','Campus','UNI','City');
    INSERT INTO departments(id,name) VALUES('department','Department');
    INSERT INTO courses(id,department_id,code,name) VALUES('course','department','CS1','Course');`);
  for (const id of ['actor','other','creator']) {
    database.prepare('INSERT INTO users(email,public_id,display_name,handle) VALUES(?,?,?,?)').run(`${id}@test.local`,id,id,id);
    database.prepare("INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES(?,'campus','department',1,1)").run(`${id}@test.local`);
    database.prepare("INSERT INTO student_courses(user_email,course_id) VALUES(?,'course')").run(`${id}@test.local`);
  }
  let identity = 'actor', beforeSql = null, beforePut = null, afterPut = null, afterSql = null;
  const objects = new Map(), deletes = [], errors = [];
  const prepared = (sql, values=[]) => ({ sql, values, bind(...next) { return prepared(sql,next); },
    async first() { if(beforeSql)await beforeSql(sql,values,'first'); const row=database.prepare(sql).get(...values)??null; if(afterSql)await afterSql(sql,values,'first'); return row; },
    async all() { if(beforeSql)await beforeSql(sql,values,'all'); return {results:database.prepare(sql).all(...values)}; },
    async run() { if(beforeSql)await beforeSql(sql,values,'run'); const meta=database.prepare(sql).run(...values); if(afterSql)await afterSql(sql,values,'run'); return {success:true,meta}; },
  });
  const DB = { prepare:prepared, async batch(statements) {
    if(beforeSql)await beforeSql('BATCH',statements,'batch');
    database.exec('BEGIN'); try { const results=statements.map(s=>({success:true,meta:database.prepare(s.sql).run(...s.values)})); database.exec('COMMIT'); return results; }
    catch(error) { database.exec('ROLLBACK'); throw error; }
  }};
  const FILES = {
    async put(key, bytes) {
      assert.equal(database.prepare('SELECT state FROM media_upload_operations WHERE object_key=?').get(key)?.state,'putting','Real PUT must have a durable putting entry');
      if(beforePut)await beforePut(key); objects.set(key,Buffer.from(bytes)); if(afterPut)await afterPut(key);
    },
    async delete(key) { deletes.push(key);objects.delete(key); },
  };
  const modules=new Map();
  for(const [path,source] of sources) {
    const exports={}; runInNewContext(source,{exports,crypto,Response,Request,Headers,FormData,File,Blob,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Date,
      require(name) {
        if(name==='cloudflare:workers')return {env:{DB,FILES}};
        if(name.endsWith('/chatgpt-auth'))return {getChatGPTUser:async()=>({email:`${identity}@test.local`,displayName:identity})};
        if(name.endsWith('/app-auth'))return {sameOriginRequest:()=>true};
        if(name.endsWith('/platform-settings'))return {getBooleanPlatformSetting:async()=>true};
        if(name.endsWith('/campus-place-catalog'))return {getCuratedCampusPlaces:()=>[]};
        if(name.endsWith('/file-response'))return {fileContentDisposition:()=>''};
        const key=`lib/${name.split('/').at(-1)}.ts`; if(modules.has(key))return modules.get(key);
        throw new Error(`Unexpected import ${path} ${name}`);
      }});
    if(path==='lib/server-api.ts') {
      exports.getRuntime=async()=>({DB,FILES}); exports.enforceRateLimit=async()=>({allowed:true});
      exports.unavailableResponse=(error)=>{errors.push(error);return Response.json({error:error.message},{status:503});};
    }
    modules.set(path,exports);
  }
  return {database,DB,FILES,objects,deletes,errors,modules,
    identity(id){identity=id;}, beforeSql(value){beforeSql=value;},afterSql(value){afterSql=value;},beforePut(value){beforePut=value;},afterPut(value){afterPut=value;},
    freeze(){database.exec(`UPDATE users SET status='deleting' WHERE email='actor@test.local'`);},
    changeGeneration(){database.exec(`UPDATE users SET public_id='actor-new-generation' WHERE email='actor@test.local'`);},
    count(table,where='1=1'){return database.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n;},
    request(route,method,payload){return modules.get(`app/api/${route}/route.ts`)[method](new Request(`https://kampira.test/api/${route}`,{method,
      headers:payload instanceof FormData?{}:{'content-type':'application/json'},body:payload instanceof FormData?payload:JSON.stringify(payload)}));},
    upload(kind) {
      const form=new FormData();
      if(kind==='notes'){form.set('file',new File([pdf],'course.pdf',{type:'application/pdf'}));form.set('title','Synthetic course note');form.set('courseId','course');}
      else {form.set('image',new File([png],'campus.png',{type:'image/png'}));form.set('kind',kind==='profile'?'avatar':'live');form.set('content','Synthetic campus live image');form.set('durationHours','6');}
      return this.request(kind==='profile'?'profile/media':kind==='pulse'?'campus-pulse':'notes','POST',form);
    },
  };
}
