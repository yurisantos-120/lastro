import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.argv[2];
const {D1Memory}=await import(pathToFileURL(join(root,'tests/helpers/d1-memory.ts')));
const {DataOperations}=await import(pathToFileURL(join(root,'db/data-operations.ts')));
const {validatePayload}=await import(pathToFileURL(join(root,'app/api/data/validation.ts')));
const h=new D1Memory();
try{
  h.sqlite.exec("INSERT INTO users(id,glpi_user_id,name,username,role,active,created_at,updated_at) VALUES (1,11,'Operador','op','operator',1,'2026-10-23','2026-10-23'),(2,12,'Outro','outro','operator',1,'2026-10-23','2026-10-23')");
  const store=new DataOperations(h.asD1());const category={kind:'category',name:'Categoria sintética',description:'Descrição',color:'#abcdef',scope:'general'};const key=crypto.randomUUID();const a=await store.execute(1,key,'POST',validatePayload(category,'POST'));
  const slow=new Promise(resolve=>setTimeout(resolve,80)).then(()=>store.execute(1,key,'POST',validatePayload({...category,name:'Diferente'},'POST')));
  const requests=[slow,store.execute(1,key,'PUT',validatePayload({...category,id:a.entityId,revision:1},'PUT')),store.execute(2,key,'POST',validatePayload(category,'POST'))];
  for(const request of requests)await assert.rejects(request,{code:'OPERATION_KEY_CONFLICT'});
}finally{h.sqlite.close()}