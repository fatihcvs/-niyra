import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, deferred, png } from './helpers/phase5-api-fixture.mjs';

test('retired profile covers cannot be read or changed while avatar upload and removal keep working',async t=>{
  const f=fixture(t);
  f.database.prepare("INSERT INTO profile_media(user_email,kind,object_key,original_file_name,content_type,byte_size) VALUES('actor@test.local','banner','profiles/legacy-banner.png','legacy.png','image/png',?)").run(png.length);
  const avatar=await f.upload('profile');assert.equal(avatar.status,201);
  const avatarUrl=(await avatar.json()).media.url;assert.equal(new URL(avatarUrl,'https://kampira.test').searchParams.get('kind'),'avatar');
  const before=f.database.prepare('SELECT * FROM profile_media ORDER BY kind').all();
  const operations=f.count('media_upload_operations');const files=f.objects.size;
  const form=new FormData();form.set('kind','banner');form.set('image',new File([png],'cover.png',{type:'image/png'}));
  assert.equal((await f.request('profile/media','POST',form)).status,400);
  assert.equal((await f.request('profile/media','DELETE',{kind:'banner'})).status,400);
  const media=f.modules.get('app/api/profile/media/route.ts');
  assert.equal((await media.GET(new Request('https://kampira.test/api/profile/media?user=actor&kind=banner'))).status,400);
  assert.deepEqual(f.database.prepare('SELECT * FROM profile_media ORDER BY kind').all(),before);
  assert.equal(f.count('media_upload_operations'),operations);assert.equal(f.objects.size,files);
  assert.equal(f.modules.get('lib/profile.ts').profileMediaUrl('actor','banner','now'),null);
  assert.equal((await f.request('profile/media','DELETE',{kind:'avatar'})).status,200);
  assert.equal(f.count('profile_media',"kind='avatar'"),0);assert.equal(f.count('profile_media',"kind='banner'"),1);
});

for(const kind of ['notes','profile','pulse']) {
  test(`${kind}: actual upload stores exact bytes and settled generation before publishing`,async t=>{
    const f=fixture(t);const response=await f.upload(kind);assert.equal(response.status,201,JSON.stringify(await response.json()));
    const row=f.database.prepare('SELECT * FROM media_upload_operations').get();assert.equal(row.kind,kind);assert.equal(row.owner_public_id,'actor');assert.equal(row.state,'settled');assert.ok(row.settled_at);assert.equal(f.objects.size,1);
  });
  for(const boundary of ['freeze','changeGeneration'])test(`${kind}: ${boundary} during real deferred PUT cannot publish after settlement`,async t=>{
    const f=fixture(t),entered=deferred(),release=deferred();f.beforePut(async()=>{entered.resolve();await release.promise;});
    const pending=f.upload(kind);await entered.promise;assert.equal(f.count('media_upload_operations',"state='putting'"),1);f[boundary]();release.resolve();
    const response=await pending;assert.equal(response.status,409,JSON.stringify(await response.json()));assert.equal(f.count('media_upload_operations',"state='settled' AND owner_public_id='actor'"),1);
    assert.equal(f.count(kind==='notes'?'notes':kind==='profile'?'profile_media':'campus_pulse_posts',kind==='notes'?"status='published'":'1=1'),0);
  });
  test(`${kind}: lost PUT acknowledgement preserves exact unknown object evidence`,async t=>{
    const f=fixture(t);f.afterPut(()=>{throw new Error('PUT acknowledgement lost after bytes');});assert.equal((await f.upload(kind)).status,503);
    assert.equal(f.count('media_upload_operations',"state='unknown' AND settled_at IS NULL"),1);assert.equal(f.objects.size,1);assert.deepEqual(f.deletes,[]);
  });
  test(`${kind}: generation change after PUT check is still fenced by publication SQL`,async t=>{
    const f=fixture(t);let changed=false;
    f.beforeSql(sql=>{if(!changed&&(kind==='notes'?sql.includes("UPDATE notes SET status = 'published'"):kind==='profile'?sql.includes('INSERT INTO profile_media'):sql.includes('INSERT INTO campus_pulse_posts'))){changed=true;assert.equal(f.count('media_upload_operations',"state='settled'"),1);f.changeGeneration();}});
    assert.equal((await f.upload(kind)).status,409);assert.ok(changed);assert.equal(f.count(kind==='notes'?'notes':kind==='profile'?'profile_media':'campus_pulse_posts',kind==='notes'?"status='published'":'1=1'),0);
  });
}

test('notes: stale generation cannot reserve processing metadata before starting a PUT',async t=>{
  const f=fixture(t);let changed=false;f.beforeSql(sql=>{if(!changed&&sql.includes('INSERT INTO notes')){changed=true;f.changeGeneration();}});
  assert.equal((await f.upload('notes')).status,409);assert.equal(f.count('notes'),0);assert.equal(f.count('media_upload_operations'),0);assert.equal(f.objects.size,0);
});

test('generic registry survives user cascade and rejects stale generation before any real PUT',async t=>{
  const f=fixture(t),helper=f.modules.get('lib/media-upload-operations.ts');
  const owner={ownerEmail:'actor@test.local',ownerPublicId:'actor',kind:'profile',objectKey:'profiles/synthetic/exact.png'};
  await helper.putOwnedMedia(f.DB,f.FILES,owner,png);f.database.exec("DELETE FROM users WHERE email='actor@test.local'");
  assert.equal(f.count('media_upload_operations'),1);assert.equal(f.objects.size,1);
  f.database.exec("INSERT INTO users(email,public_id,display_name,handle) VALUES('actor@test.local','new-actor','New','new-actor')");
  await assert.rejects(helper.putOwnedMedia(f.DB,f.FILES,{...owner,objectKey:'profiles/synthetic/stale.png'},png),e=>e.code==='MEDIA_ACCOUNT_CHANGED');assert.equal(f.objects.size,1);assert.equal(f.count('media_upload_operations'),1);
});

test('unknown DB acknowledgement after fulfilled settlement cannot rewrite settled evidence',async t=>{
  const f=fixture(t);let fault=true;f.afterSql(sql=>{if(fault&&sql.includes("SET state = 'settled'")){fault=false;throw new Error('Settlement ACK lost');}});
  assert.equal((await f.upload('notes')).status,503);assert.equal(f.count('media_upload_operations',"state='settled'"),1);assert.equal(f.objects.size,1);
});

test('failed settlement SQL remains putting and never publishes despite fulfilled PUT',async t=>{
  const f=fixture(t);f.beforeSql(sql=>{if(sql.includes("SET state = 'settled'"))throw new Error('Settlement unavailable');});
  assert.equal((await f.upload('notes')).status,503);assert.equal(f.count('media_upload_operations',"state='putting'"),1);assert.equal(f.count('notes',"status='published'"),0);
});

test('a second owner cannot reuse another operation object key or overwrite its bytes',async t=>{
  const f=fixture(t),helper=f.modules.get('lib/media-upload-operations.ts');const owner={ownerEmail:'actor@test.local',ownerPublicId:'actor',kind:'profile',objectKey:'profiles/synthetic/exact.png'};
  await helper.putOwnedMedia(f.DB,f.FILES,owner,png);
  await assert.rejects(helper.putOwnedMedia(f.DB,f.FILES,{...owner,ownerEmail:'other@test.local',ownerPublicId:'other'},new Uint8Array([1,2])));
  assert.deepEqual(f.objects.get(owner.objectKey),png);assert.equal(f.count('media_upload_operations'),1);
});
