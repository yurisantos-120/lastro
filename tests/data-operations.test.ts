import assert from 'node:assert/strict';
import test from 'node:test';
import { D1Memory } from './helpers/d1-memory.ts';
import { DataOperations } from '../db/data-operations.ts';
import { validatePayload } from '../app/api/data/validation.ts';
import { createDataHandlers } from '../app/api/data/handlers.ts';

const category = {kind:'category',name:'Categoria sintética',description:'Descrição',color:'#abcdef',scope:'general'};
function fixture() {
  const h = new D1Memory();
  h.sqlite.exec(`INSERT INTO users(id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES
    (1,11,'Operador','op','operator',1,'2026-10-23','2026-10-23'),
    (2,12,'Outro','outro','operator',1,'2026-10-23','2026-10-23'),
    (3,13,'Consulta','consulta','viewer',1,'2026-10-23','2026-10-23');`);
  return {h,store:new DataOperations(h.asD1())};
}
const count = (h:D1Memory,table:string) => Number(h.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);

void test('same intention replays exact receipt despite later edits; different intent may share content',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID(),payload=validatePayload(category,'POST');
    const a=await store.execute(1,key,'POST',payload);
    await store.execute(1,crypto.randomUUID(),'PUT',validatePayload({...category,id:a.entityId,revision:1,name:'Nova revisão'},'PUT'));
    assert.deepEqual(await store.execute(1,key,'POST',payload),a);
    assert.deepEqual(await store.recover(1,key),a);
    await store.execute(1,crypto.randomUUID(),'POST',payload);
    assert.equal(count(h,'categories'),2);
    assert.equal(count(h,'data_operations'),3);
  }finally{h.sqlite.close();}
});
void test('concurrent tabs with same create key commit once and return the same receipt',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID(),payload=validatePayload(category,'POST');
    const receipts=await Promise.all([store.execute(1,key,'POST',payload),store.execute(1,key,'POST',payload)]);
    assert.deepEqual(receipts[0],receipts[1]);assert.equal(count(h,'categories'),1);assert.equal(count(h,'data_operations'),1);
  }finally{h.sqlite.close();}
});
void test('concurrent edits replay once while different intentions retain revision conflicts',async()=>{
  const {h,store}=fixture();try{
    const a=await store.execute(1,crypto.randomUUID(),'POST',validatePayload(category,'POST'));
    const payload=validatePayload({...category,id:a.entityId,revision:1,name:'Editada'},'PUT'),key=crypto.randomUUID();
    const [x,y]=await Promise.all([store.execute(1,key,'PUT',payload),store.execute(1,key,'PUT',payload)]);
    assert.deepEqual(x,y);assert.equal(x.revision,2);
    await assert.rejects(store.execute(1,crypto.randomUUID(),'PUT',payload),{code:'REVISION_CONFLICT'});
    assert.equal(count(h,'data_operations'),3);
  }finally{h.sqlite.close();}
});
void test('key binding rejects changed payload, method, target and operator without disclosing another receipt',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID();const a=await store.execute(1,key,'POST',validatePayload(category,'POST'));
    for(const request of [
      () => store.execute(1,key,'POST',validatePayload({...category,name:'Diferente'},'POST')),
      () => store.execute(1,key,'PUT',validatePayload({...category,id:a.entityId,revision:1},'PUT')),
      () => store.execute(2,key,'POST',validatePayload(category,'POST')),
    ]) await assert.rejects(request(),{code:'OPERATION_KEY_CONFLICT'});
    assert.equal(await store.recover(2,key),null);assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});
void test('normalization and key order produce the same fingerprint',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID();const a=await store.execute(1,key,'POST',validatePayload({...category,name:'  Categoria sintética  '},'POST'));
    assert.deepEqual(await store.execute(1,key,'POST',validatePayload({scope:'general',color:'#abcdef',description:'Descrição',name:'Categoria sintética',kind:'category'},'POST')),a);
  }finally{h.sqlite.close();}
});
void test('all record kinds support repeated creation and editing with one revision increment',async()=>{
  const {h,store}=fixture();try{
    for(const kind of ['general','vlan','camera','point'] as const){
      const c=await store.execute(1,crypto.randomUUID(),'POST',validatePayload({...category,scope:kind},'POST'));
      const details=kind==='general'?{}:kind==='vlan'?{vlanNumber:'12',neighborhood:'Centro'}:kind==='camera'?{camera:'Câmera',neighborhood:'Centro',address:'Rua'}:{location:'Ponto',partner:'Empresa',address:'Rua'};
      const title=kind==='general'?'Rota':kind==='vlan'?'VLAN 12 — Centro':kind==='camera'?'Câmera':'Ponto';
      const raw={kind:'record',recordType:kind,title,categoryId:c.entityId,responsible:kind==='general'?'NOC':'',details};
      const key=crypto.randomUUID();const a=await store.execute(1,key,'POST',validatePayload(raw,'POST'));
      assert.deepEqual(await store.execute(1,key,'POST',validatePayload(raw,'POST')),a);
      const edit=validatePayload({...raw,id:a.entityId,revision:1,notes:'Editada'},'PUT'),editKey=crypto.randomUUID();
      const b=await store.execute(1,editKey,'PUT',edit);assert.equal(b.revision,2);assert.deepEqual(await store.execute(1,editKey,'PUT',edit),b);
    }
    assert.equal(count(h,'information'),4);assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{h.sqlite.close();}
});
void test('receipt failure rolls back mutation but preserves the immutable intent binding',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID();h.beforeRun=(sql)=>{if(sql.startsWith('UPDATE data_operations'))throw Error('Simulated I/O failure');};
    await assert.rejects(store.execute(1,key,'POST',validatePayload(category,'POST')));
    assert.equal(count(h,'categories'),0);assert.equal(count(h,'data_operations'),1);
    assert.equal(await store.recover(1,key),null);
    await assert.rejects(store.execute(1,key,'POST',validatePayload({...category,name:'Outra intenção'},'POST')),{code:'OPERATION_KEY_CONFLICT'});
    h.beforeRun=null;await store.execute(1,key,'POST',validatePayload(category,'POST'));assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});
void test('category constraints and missing records retain only unconfirmed bindings',async()=>{
  const {h,store}=fixture();try{
    await assert.rejects(store.execute(1,crypto.randomUUID(),'POST',validatePayload({kind:'record',recordType:'general',title:'Rota',categoryId:999,responsible:'NOC',details:{}},'POST')),{code:'CATEGORY_NOT_FOUND'});
    await assert.rejects(store.execute(1,crypto.randomUUID(),'PUT',validatePayload({...category,id:999,revision:1},'PUT')),{code:'CATEGORY_NOT_FOUND_FOR_UPDATE'});
    assert.equal(count(h,'data_operations'),2);assert.equal(count(h,'information'),0);
    assert.equal(h.sqlite.prepare("SELECT count(*) n FROM data_operations WHERE response_json<>'null'").get()!.n,0);
  }finally{h.sqlite.close();}
});
void test('lost D1 response after commit is recovered by the durable receipt',async()=>{
  const {h,store}=fixture();try{
    const batch=h.batch.bind(h);h.batch=async statements=>{const result=await batch(statements);void result;throw Error('Response lost after commit');};
    const key=crypto.randomUUID();const a=await store.execute(1,key,'POST',validatePayload(category,'POST'));
    assert.deepEqual(await store.recover(1,key),a);assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});
void test('authorization is checked again atomically and missing schema never creates tables',async()=>{
  const {h,store}=fixture();try{
    await assert.rejects(store.execute(3,crypto.randomUUID(),'POST',validatePayload(category,'POST')),{status:403});
    const batch=h.batch.bind(h);h.batch=async statements=>{h.sqlite.exec('UPDATE users SET active=0 WHERE id=1');return batch(statements);};
    await assert.rejects(store.execute(1,crypto.randomUUID(),'POST',validatePayload(category,'POST')),{status:403});assert.equal(count(h,'categories'),0);
    h.sqlite.exec('DROP TABLE data_operations');
    await assert.rejects(store.execute(2,crypto.randomUUID(),'POST',validatePayload(category,'POST')),{code:'DATA_SCHEMA_REQUIRED',status:503});
    assert.equal(h.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE name='data_operations'").get()!.n,0);
  }finally{h.sqlite.close();}
});
void test('API receipt does not depend on a second list read; keys and forged identities are validated',async()=>{
  const {h,store}=fixture();try{
    const api=createDataHandlers({read:async()=>{throw Error('Read unavailable');},execute:(...a)=>store.execute(...a),recover:(...a)=>store.recover(...a)},1);
    const request=(body:unknown,key:string|null=crypto.randomUUID())=>new Request('http://local/api/data',{method:'POST',headers:key?{'Idempotency-Key':key}:{},body:JSON.stringify(body)});
    const key=crypto.randomUUID();const response=await api.POST(request(category,key));assert.equal(response.status,201);
    assert.deepEqual(await response.json(),await (await api.RECOVER(key)).json());
    assert.equal((await api.POST(request(category,null))).status,400);
    assert.equal((await api.POST(request({...category,actorId:2}))).status,400);
    assert.equal((await api.POST(request(category,'invalid-key'))).status,400);
    assert.equal((await api.GET(new Request('http://local/api/data?resource=records'))).status,500);assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});
void test('trigger accounting does not change the top-level write receipt condition',async()=>{
  const {h,store}=fixture();try{
    h.includeTriggerChanges=true;h.sqlite.exec('CREATE TRIGGER category_test AFTER INSERT ON categories BEGIN UPDATE categories SET description=description WHERE id=NEW.id; END;');
    const a=await store.execute(1,crypto.randomUUID(),'POST',validatePayload(category,'POST'));assert.equal(a.revision,1);assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});

void test('failed edit rolls back its revision and receipt, and target changes cannot reuse a committed edit key',async()=>{
  const {h,store}=fixture();try{
    const a=await store.execute(1,crypto.randomUUID(),'POST',validatePayload(category,'POST'));
    const b=await store.execute(1,crypto.randomUUID(),'POST',validatePayload(category,'POST'));
    const key=crypto.randomUUID(),payload=validatePayload({...category,id:a.entityId,revision:1,name:'Editada'},'PUT');
    h.beforeRun=(sql)=>{if(sql.startsWith('UPDATE data_operations'))throw Error('Receipt failure');};
    await assert.rejects(store.execute(1,key,'PUT',payload));
    assert.equal(h.sqlite.prepare('SELECT revision FROM categories WHERE id=?').get(a.entityId)!.revision,1);assert.equal(count(h,'data_operations'),3);
    h.beforeRun=null;await store.execute(1,key,'PUT',payload);
    await assert.rejects(store.execute(1,key,'PUT',validatePayload({...category,id:b.entityId,revision:1,name:'Editada'},'PUT')),{code:'OPERATION_KEY_CONFLICT'});
    assert.equal(h.sqlite.prepare('SELECT revision FROM categories WHERE id=?').get(b.entityId)!.revision,1);
  }finally{h.sqlite.close();}
});

void test('an inconsistent stored receipt never confirms or repeats a mutation',async()=>{
  const {h,store}=fixture();try{
    const key=crypto.randomUUID(),payload=validatePayload(category,'POST');await store.execute(1,key,'POST',payload);
    h.sqlite.prepare("UPDATE data_operations SET response_json='{}' WHERE operation_key=?").run(key);
    await assert.rejects(store.execute(1,key,'POST',payload),{code:'RECEIPT_UNAVAILABLE'});
    const api=createDataHandlers({read:async()=>null,execute:(...a)=>store.execute(...a),recover:(...a)=>store.recover(...a)},1);
    const response=await api.RECOVER(key);assert.equal(response.status,503);assert.equal((await response.json() as {outcome:string}).outcome,'unknown');assert.equal(count(h,'categories'),1);
  }finally{h.sqlite.close();}
});
