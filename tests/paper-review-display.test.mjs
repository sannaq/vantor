import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({URL});
vm.runInContext(fs.readFileSync(new URL('../quant.js', import.meta.url),'utf8'), ctx);
const outcome=(r,a)=>ctx.quantOutcome(r,{positions:[],pending:[],trades:[],...a},String);
const review={symbol:'X',status:'review_pass',entryStatus:'ready',review:{id:'new'}};
test('review result never borrows a different review or holding cycle',()=>{
 assert.equal(outcome(review,{trades:[{symbol:'X',reviewId:'old',side:'buy'}]}).kind,'unknown');
 assert.equal(outcome(review,{positions:[{symbol:'X',reviewId:'old'}],pending:[{symbol:'X',reviewId:'old'}]}).kind,'unknown');
 assert.equal(outcome({...review,review:{}},{pending:[{symbol:'X'}]}).kind,'unknown');
 assert.equal(outcome(review,{trades:[{symbol:'Y',reviewId:'new',side:'buy'}]}).kind,'unknown');
 const o=outcome(review,{positions:[{symbol:'X',reviewId:'new',quantity:2,entryDate:'20261102'}],trades:[{symbol:'X',side:'buy',date:'20261001',price:10,quantity:3,cost:1}]});
 assert.equal(o.kind,'bought');assert(o.text.includes('기록은 확인이 필요'));
});
test('linked fills survive complete exit and pending never counts as a buy',()=>{
 const o=outcome(review,{trades:[{symbol:'X',reviewId:'new',side:'buy',date:'20261102',price:10,quantity:3}]});
 assert.equal(o.kind,'bought');assert(o.text.includes('10 × 3주'));assert(o.text.includes('보유분은 없어요'));
 assert.equal(outcome(review,{pending:[{symbol:'X',reviewId:'new',quantity:3,entry:10}]}).kind,'pending');
});
test('terminal cancellation and rejection show recorded reasons without guessing',()=>{
 const o=outcome(review,{orderEvents:[{symbol:'X',reviewId:'new',date:'20261102',reason:'limit_not_reached'}]});
 assert.equal(o.kind,'not_bought');assert(o.text.includes('저가가 지정 매수가보다 높아'));
 assert.equal(outcome({...review,status:'risk_hold'},{}).kind,'not_bought');
 assert(outcome({...review,status:'waiting_evidence',evidenceReason:'ir_unsupported'},{}).text.includes('아직 지원하지'));
 assert(outcome({...review,entryStatus:'wait',entryReason:'drawdown_pause'},{}).text.includes('계좌 하락 한도'));
});
