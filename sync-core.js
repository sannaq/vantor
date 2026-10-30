/* Shared by the browser and regression tests. The worker accepts at most 300 KB. */
(function(root){
  'use strict';
  var LIMIT=260000, enc=new TextEncoder();
  function bytes(x){return enc.encode(JSON.stringify(x)).length;}
  async function hash(x){var b=await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(x)));return Array.from(new Uint8Array(b),function(v){return v.toString(16).padStart(2,'0');}).join('');}
  async function pack(code,data){
    var d=Object.assign({},data), chunks=[], removed=[];
    var blob={ver:2,ts:Date.now(),data:d};
    for(var key of Object.keys(d).sort(function(a,b){return bytes(d[b])-bytes(d[a]);})){
      if(bytes(blob)<=LIMIT-12000)break;
      if(typeof d[key]!=='string')throw new Error('설정 형식 오류: '+key);
      var value=d[key], n=Math.max(1,Math.ceil(value.length/32000));
      delete d[key];removed.push(key);
      // 32K UTF-16 units stay below the limit even when JSON escapes every unit.
      for(var i=0;i<n;i++)chunks.push([key,i,n,value.slice(i*32000,(i+1)*32000)]);
    }
    var groups=[], current=[];
    chunks.forEach(function(p){if(bytes({ver:2,parts:current.concat([p])})>LIMIT&&current.length){groups.push(current);current=[];}current.push(p);});
    if(current.length)groups.push(current);
    var parts=[];
    for(var g of groups){var body={ver:2,parts:g}, h=await hash(body);parts.push({key:code+'-P'+h.slice(0,32),hash:h,body:body});}
    if(parts.length)d._chunks=parts.map(function(p){return {key:p.key,hash:p.hash};});
    if(bytes(blob)>LIMIT||parts.some(function(p){return bytes(p.body)>LIMIT;}))throw new Error('동기화 용량 한도 초과');
    return {blob:blob,parts:parts,removed:removed};
  }
  function assemble(data,groups){
    var d=Object.assign({},data), buf=Object.create(null);
    groups.forEach(function(group){if(!Array.isArray(group))throw new Error('설정 조각 형식 오류');group.forEach(function(q){
      if(!Array.isArray(q)||q.length!==4||typeof q[0]!=='string'||!Number.isInteger(q[1])||!Number.isInteger(q[2])||q[2]<1||q[2]>1000||q[1]<0||q[1]>=q[2]||typeof q[3]!=='string'||['__proto__','constructor','prototype'].includes(q[0]))throw new Error('설정 조각 형식 오류');
      var b=buf[q[0]]||(buf[q[0]]={n:q[2],p:[]});
      if(b.n!==q[2]||b.p[q[1]]!==undefined)throw new Error('설정 조각 충돌');b.p[q[1]]=q[3];
    });});
    Object.keys(buf).forEach(function(k){var b=buf[k];for(var i=0;i<b.n;i++)if(b.p[i]===undefined)throw new Error('설정 조각 누락');d[k]=b.p.join('');});
    delete d._chunks;delete d._x;delete d._xh;return d;
  }
  var api={pack:pack,hash:hash,bytes:bytes,assemble:assemble,LIMIT:LIMIT};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VantorSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
