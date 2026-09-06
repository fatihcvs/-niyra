import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const base = process.env.KAMPIRA_BASE_URL ?? 'http://127.0.0.1:5173';
const stamp = Date.now().toString();
const marker = `Global${stamp}`;
const password = `CampusQa${stamp}!`;
const accounts = {};
async function request(who, path, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await fetch(`${base}${path}`, { method, headers: {
    ...(accounts[who]?.cookie ? { cookie: accounts[who].cookie } : {}),
    ...(body && !(body instanceof FormData) ? { 'content-type':'application/json' } : {}),
  }, ...(body ? { body:body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, expected, `${who}: ${method} ${path}: ${JSON.stringify(result)}`);
  return result;
}
for (const [who, domain, displayName] of [['local','omu.edu.tr',`${marker} Deniz`], ['remote','bogazici.edu.tr',`${marker} Ece`]]) {
  const email = `global.${who}.${stamp}@${domain}`;
  const response = await fetch(`${base}/api/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,password,displayName}) });
  assert.equal(response.status,201, JSON.stringify(await response.json()));
  accounts[who] = {email,password,cookie:response.headers.get('set-cookie').split(';')[0]};
  const academic = who === 'local' ? { universityId:'omu',facultyId:'muhendislik',departmentId:'bilgisayar',classYear:3,courseIds:['bilgisayar-bil101','bilgisayar-mat101','bilgisayar-fiz101'] } : {
    universityId:'tr-bogazici-universitesi',facultyName:'Mühendislik Fakültesi',departmentName:'Bilgisayar Mühendisliği',classYear:2,
    customCourses:[{code:'CMPE 101',name:'Bilgisayar Mühendisliğine Giriş'},{code:'MATH 101',name:'Analiz I'},{code:'PHYS 101',name:'Fizik I'}],
  };
  accounts[who].profile = (await request(who,'/api/profile',academic,'PUT')).profile;
}
const peer = accounts.remote.profile;
await request('local',`/api/people?id=${peer.publicId}`,null,'GET',404);
const privatePost = (await request('remote','/api/posts',{content:`${marker} kampüse özel çalışma planı`},'POST',201)).post;
assert.equal(privatePost.audience,'campus');
await request('local',`/api/posts?id=${privatePost.id}`,null,'GET',404);
await request('remote','/api/posts',{content:'Invalid audience',audience:'everyone'},'POST',400);
await request('remote','/api/posts',{content:'Course cannot be global',audience:'platform',courseId:peer.courses[0].id},'POST',400);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const form = new FormData();
form.set('audience','platform'); form.set('content',`${marker} Farklı üniversitelerden proje arkadaşları arıyorum.`);
form.set('media',new File([png],'campus.png',{type:'image/png'}));
const globalPost = (await request('remote','/api/posts',form,'POST',201)).post;
assert.equal(globalPost.audience,'platform');
assert.equal(globalPost.course,'GENEL');
assert.equal(globalPost.media.length,1);
const ownPost = (await request('local','/api/posts',{content:`${marker} Ortak öğrenci buluşmasına merhaba!`,audience:'platform'},'POST',201)).post;
const feedIds = async (who, feed) => (await request(who,`/api/posts?feed=${feed}`)).posts.map(p=>p.id);
assert.ok((await feedIds('local','all')).includes(globalPost.id));
assert.ok(!(await feedIds('local','all')).includes(privatePost.id));
assert.ok(!(await feedIds('local','campus')).includes(globalPost.id));
assert.ok((await feedIds('remote','campus')).includes(privatePost.id));
assert.equal((await request('local','/api/follows',{targetId:peer.publicId})).active,true);
assert.deepEqual(await feedIds('local','following'),[globalPost.id]);
assert.equal((await request('local','/api/post-actions',{postId:globalPost.id,type:'like'})).active,true);
assert.equal((await request('local','/api/post-actions',{postId:globalPost.id,type:'save'})).active,true);
const comment = (await request('local','/api/post-actions',{postId:globalPost.id,type:'comment',content:'Başka bir kampüsten katılmak isterim.'},'POST',201)).comment;
assert.ok((await request('remote',`/api/comments?postId=${globalPost.id}`)).comments.some(c=>c.id===comment.id));
assert.ok((await feedIds('local','saved')).includes(globalPost.id));
await request('local','/api/post-actions',{postId:privatePost.id,type:'like'},'POST',403);
await request('local',`/api/comments?postId=${privatePost.id}`,null,'GET',404);
const shared = (await request('local',`/api/posts?id=${globalPost.id}`)).post;
assert.equal(shared.likeCount ?? shared.likes,1);
const image = await fetch(`${base}${globalPost.media[0].url}`,{headers:{cookie:accounts.local.cookie}});
assert.equal(image.status,200); assert.equal(image.headers.get('cache-control'),'private, no-store');
assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
await request('remote','/api/profile',{action:'update-details',displayName:peer.displayName,handle:peer.handle,bio:'Campus-only biography',links:[{title:'Private campus page',url:'https://example.com/campus'}]},'PUT');
for (const kind of ['avatar']) {
  const upload = new FormData(); upload.set('kind',kind); upload.set('image',new File([png],`${kind}.png`,{type:'image/png'}));
  await request('remote','/api/profile/media',upload,'POST',201);
}
const fullProfile = (await request('remote','/api/profile')).profile;
const publicProfile = (await request('local',`/api/people?id=${peer.publicId}`)).person;
assert.equal(publicProfile.sameCampus,false); assert.equal(publicProfile.bio,''); assert.deepEqual(publicProfile.links,[]);
assert.equal('bannerUrl' in publicProfile,false); assert.equal('bannerUrl' in fullProfile,false); assert.deepEqual(publicProfile.courses,[]); assert.equal(publicProfile.postCount,1);
assert.equal((await fetch(`${base}${fullProfile.avatarUrl}`,{headers:{cookie:accounts.local.cookie}})).status,200);
assert.equal((await fetch(`${base}/api/profile/media?user=${peer.publicId}&kind=banner`,{headers:{cookie:accounts.local.cookie}})).status,400);
assert.deepEqual((await request('local',`/api/profile/content?user=${peer.publicId}&tab=images`)).posts.map(p=>p.id),[globalPost.id]);
assert.deepEqual((await request('local',`/api/profile/content?user=${peer.publicId}&tab=notes`)).notes,[]);
const discovery = await request('local',`/api/people?scope=platform&q=${marker}`);
assert.ok(discovery.people.some(p=>p.publicId===peer.publicId));
assert.ok((await request('local','/api/people?scope=platform')).people.some(p=>p.publicId===peer.publicId));
assert.ok(!(await request('local',`/api/people?scope=campus&q=${marker}`)).people.some(p=>p.publicId===peer.publicId));
const search = await request('local',`/api/search?scope=platform&q=${marker}`);
assert.ok(search.posts.some(p=>p.id===globalPost.id)); assert.ok(!search.posts.some(p=>p.id===privatePost.id));
assert.ok(search.people.some(p=>p.public_id===peer.publicId));
assert.ok(!(await request('local',`/api/search?scope=campus&q=${marker}`)).posts.some(p=>p.id===globalPost.id));
await request('local','/api/safety',{action:'report',entityType:'post',entityId:globalPost.id,reason:'other',details:'Synthetic global audience QA'},'POST',201);
await request('remote','/api/safety',{action:'report',entityType:'comment',entityId:comment.id,reason:'other',details:'Synthetic cross-campus comment QA'},'POST',201);
await request('local','/api/safety',{action:'report',entityType:'post',entityId:privatePost.id,reason:'other'},'POST',404);
await request('local','/api/safety',{action:'mute',targetId:peer.publicId,active:true});
assert.ok(!(await feedIds('local','all')).includes(globalPost.id));
assert.ok(!(await request('local',`/api/search?scope=platform&q=${marker}`)).posts.some(p=>p.id===globalPost.id));
await request('local','/api/safety',{action:'mute',targetId:peer.publicId,active:false});
await request('local','/api/safety',{action:'block',targetId:peer.publicId,active:true});
assert.ok(!(await feedIds('local','all')).includes(globalPost.id));
await request('local',`/api/people?id=${peer.publicId}`,null,'GET',404);
assert.equal((await fetch(`${base}${globalPost.media[0].url}`,{headers:{cookie:accounts.local.cookie}})).status,404);
await request('local','/api/post-actions',{postId:globalPost.id,type:'like'},'POST',403);
await request('local','/api/safety',{action:'block',targetId:peer.publicId,active:false});
await request('local','/api/follows',{targetId:peer.publicId});
if (process.env.KAMPIRA_KEEP_BROWSER_FIXTURE === '1') {
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Browser fixtures may only be saved for localhost');
  await writeFile(new URL('../.wrangler/global-feed-fixtures.json',import.meta.url),JSON.stringify({base,accounts,globalPost,ownPost,privatePost,marker}));
} else {
  await request('remote','/api/posts',{id:globalPost.id},'DELETE');
  await request('remote','/api/posts',{id:privatePost.id},'DELETE');
  await request('local','/api/posts',{id:ownPost.id},'DELETE');
}
console.log('Global feed runtime passed: two universities, legacy privacy, publishing audience, following, likes, comments, saves, media, public profile, discovery, search, reports, mute and block.');
