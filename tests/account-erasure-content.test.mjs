import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { drizzle } from 'drizzle-orm/d1';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
function fixture(t) {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close()); database.exec('PRAGMA foreign_keys=ON');
  const migrations = new URL('drizzle/', root);
  for (const name of readdirSync(migrations).filter(name => /^\d+.*\.sql$/.test(name)).sort()) database.exec(readFileSync(new URL(name, migrations), 'utf8'));
  database.exec(`INSERT INTO universities(id,name,short_name,city) VALUES('campus','Campus','C','City'),('outside','Outside','O','City');
    INSERT INTO faculties(id,university_id,name,short_name) VALUES('faculty','campus','Faculty','F');
    INSERT INTO departments(id,faculty_id,name) VALUES('department','faculty','Department');
    INSERT INTO courses(id,department_id,code,name) VALUES('course','department','C101','Course');
    INSERT INTO users(email,public_id,display_name,handle) VALUES('retired@example.invalid','erased-public','Silinen hesap','erased-account'),('viewer@example.invalid','viewer','Viewer','viewer'),('outside@example.invalid','outside','Outside','outside');
    INSERT INTO student_profiles(user_email,university_id,department_id,class_year,onboarding_completed) VALUES('retired@example.invalid','campus','department',1,1),('viewer@example.invalid','campus','department',1,1),('outside@example.invalid','outside','department',1,1);
    INSERT INTO notes(id,owner_email,course_id,title,description,object_key,original_file_name,content_type,byte_size,status,erased_university_id) VALUES('note','retired@example.invalid','course','Silinen not','','','','application/pdf',0,'rejected','campus');
    INSERT INTO note_comments(id,note_id,author_email,content) VALUES('note-peer-comment','note','viewer@example.invalid','My preserved note comment');
    INSERT INTO note_saves(note_id,user_email) VALUES('note','viewer@example.invalid');
    INSERT INTO posts(id,author_email,content,audience,erased_university_id) VALUES('post','retired@example.invalid','Bu gönderi silindi.','campus','campus');
    INSERT INTO post_comments(id,post_id,author_email,content) VALUES('post-peer-comment','post','viewer@example.invalid','My preserved post comment');
    DELETE FROM student_profiles WHERE user_email='retired@example.invalid';
    UPDATE users SET status='deleted' WHERE email='retired@example.invalid';`);
  let viewer = 'viewer@example.invalid';
  const DB = { prepare(sql) {
    const statement = (values = []) => ({ sql, values, bind(...bound) { return statement(bound); }, async first() { return database.prepare(sql).get(...values) ?? null; }, async all() { return { results: database.prepare(sql).all(...values) }; }, async raw() { const query = database.prepare(sql); query.setReturnArrays(true); return query.all(...values); }, async run() { return { meta: database.prepare(sql).run(...values) }; } });
    return statement();
  }, async batch(statements) { database.exec('BEGIN'); try { const results = statements.map(({ sql, values }) => ({ meta: database.prepare(sql).run(...values) })); database.exec('COMMIT'); return results; } catch (error) { database.exec('ROLLBACK'); throw error; } } };
  const FILES = { get() { throw new Error('Erased bytes must never be read'); } };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (file === 'app/chatgpt-auth.ts') return { getChatGPTUser: async () => viewer ? { email: viewer, displayName: 'Viewer', fullName: null } : null };
    if (file === 'db.ts') return { getDb: async () => drizzle(DB, { schema: load('db/schema.ts') }) };
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    runInNewContext(code, { exports, crypto, Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, DataView, Buffer, atob, btoa, console,
      require(name) {
        if (name === 'cloudflare:workers') return { env: { DB, FILES } };
        if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + '.ts');
        return require(name);
      },
    });
    return exports;
  }
  return { database, identity(email) { viewer = email; }, call(route, query = '', method = 'GET', body) {
    return load('app/api/' + route + '/route.ts')[method](new Request('https://kampira.test/api/' + route + '?' + query, { method, headers: { origin: 'https://kampira.test', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  } };
}

test('retained note is readable with peer comments but no file, new comment or cross-campus access', async (t) => {
  const f = fixture(t);
  const detail = await f.call('notes', 'id=note'); assert.equal(detail.status, 200);
  const note = (await detail.json()).note;
  assert.equal(note.status, 'erased'); assert.equal(note.fileUrl, ''); assert.equal(note.ownerId, null);
  const comments = await f.call('note-comments', 'noteId=note'); assert.equal(comments.status, 200);
  assert.equal((await comments.json()).comments[0].content, 'My preserved note comment');
  assert.equal((await f.call('note-comments', '', 'POST', { noteId: 'note', content: 'Cannot add this' })).status, 409);
  assert.equal((await f.call('notes/file', 'id=note&download=1')).status, 404);
  f.identity('outside@example.invalid');
  assert.equal((await f.call('notes', 'id=note')).status, 404);
  assert.equal((await f.call('note-comments', 'noteId=note')).status, 404);
});

test('retained post preserves exact campus visibility and peers comments without exposing an erased profile', async (t) => {
  const f = fixture(t);
  const detail = await f.call('posts', 'id=post'); assert.equal(detail.status, 200);
  const post = (await detail.json()).post;
  assert.equal(post.erased, true); assert.equal(post.authorId, undefined); assert.equal(post.media.length, 0);
  const comments = await f.call('comments', 'postId=post'); assert.equal(comments.status, 200);
  assert.equal((await comments.json()).comments[0].content, 'My preserved post comment');
  f.identity('outside@example.invalid');
  assert.equal((await f.call('posts', 'id=post')).status, 404);
  assert.equal((await f.call('comments', 'postId=post')).status, 404);
});
