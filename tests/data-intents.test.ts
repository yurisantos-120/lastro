import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmedDataReceipt, readDataIntents, removeDataIntent, saveDataIntent, type DataIntent, type IntentStorage } from '../lib/data-intents.ts';
import { FormSubmissionError, SubmissionGate } from '../lib/form-submission.ts';

class MemoryStorage implements IntentStorage {
  readonly values:Map<string,string>;
  constructor(values=new Map<string,string>()){this.values=values;}
  get length(){return this.values.size;}
  key(index:number){return [...this.values.keys()][index]??null;}
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
  removeItem(key:string){this.values.delete(key);}
}
const intent=():DataIntent=>({key:crypto.randomUUID(),actorId:1,method:'POST',payload:{kind:'category',name:'Categoria',description:'Descrição',color:'#abcdef',scope:'general'},fields:[['name','Categoria'],['description','Descrição']],label:'Categoria',createdAt:'2026-10-23T12:00:00Z'});
void test('reload and another tab recover the same intent and draft without executing it',()=>{
  const a=new MemoryStorage(),i=intent();saveDataIntent(a,i);
  const b=new MemoryStorage(a.values),[resumed]=readDataIntents(b,1);
  assert.deepEqual(resumed,i);saveDataIntent(b,resumed);assert.equal(a.length,1);
  assert.deepEqual(readDataIntents(a,2),[]);
});
void test('independent new intentions are allowed even with equal content; a frozen key cannot change payload',()=>{
  const s=new MemoryStorage(),a=intent();saveDataIntent(s,a);saveDataIntent(s,{...a,key:crypto.randomUUID()});assert.equal(s.length,2);
  assert.throws(()=>saveDataIntent(s,{...a,payload:{...a.payload,name:'Outra'}}));
  assert.equal(readDataIntents(s,1).find(i=>i.key===a.key)!.payload.name,'Categoria');
});
void test('invalid payloads and credentials never enter the durable outbox',()=>{
  const s=new MemoryStorage(),a=intent();
  assert.throws(()=>saveDataIntent(s,{...a,payload:{...a.payload,description:'password=segredo-sintetico'}}));
  assert.throws(()=>saveDataIntent(s,{...a,payload:{...a.payload,actorId:99}}));assert.equal(s.length,0);
});
void test('a mismatched or malformed confirmation cannot clear an unresolved intention',()=>{
  const s=new MemoryStorage(),a=intent();saveDataIntent(s,a);
  assert.throws(()=>confirmedDataReceipt({operation:{key:crypto.randomUUID()}},a));assert.equal(s.length,1);
  const receipt={key:a.key,kind:'category',method:'POST',entityId:1,revision:1,recordedAt:a.createdAt,snapshot:{id:1,revision:1,name:'Categoria',scope:'general'}};
  assert.deepEqual(confirmedDataReceipt({operation:receipt},a),receipt);
  removeDataIntent(s,1,a.key);assert.equal(s.length,0);
});
void test('uncertain submission stays blocked until an explicit retry of the same intention',async()=>{
  const gate=new SubmissionGate();let calls=0;
  await gate.run(async()=>{calls++;throw new FormSubmissionError('Incerto',0,true);});
  assert.equal((await gate.run(async()=>{calls++;})).state,'ignored');
  gate.resumeSameIntention();assert.equal((await gate.run(async()=>{calls++;})).state,'saved');assert.equal(calls,2);
});
