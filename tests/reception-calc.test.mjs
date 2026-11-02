import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../assets/js/reception-calc.js';

test('클래식 50명은 메뉴 175만원과 출장·세팅·철수비 25만원을 합산한다',()=>{
  const q=C.quote(50);
  assert.equal(q.ok,true);
  assert.equal(q.unitPrice,35000);
  assert.equal(q.food,1750000);
  assert.equal(q.fee,250000);
  assert.equal(q.total,2000000);
});

test('100·200·300명 경계에서 비용을 중복 적용하거나 다음 구간으로 올리지 않는다',()=>{
  for(const [n,fee,total] of [[1,250000,285000],[100,250000,3750000],[101,300000,3835000],[200,300000,7300000],[201,350000,7385000],[300,350000,10850000]]){
    const q=C.quote(n);
    assert.equal(q.ok,true);
    assert.equal(q.fee,fee,`${n}명 비용`);
    assert.equal(q.total,total,`${n}명 총액`);
  }
});

test('인원을 조용히 반올림하거나 상한으로 잘라 금액을 만들지 않는다',()=>{
  for(const value of ['',null,0,-1,1.5,'50.5','1e2','<img>',Infinity,Number.MAX_SAFE_INTEGER+1]){
    const q=C.quote(value);
    assert.equal(q.ok,false,String(value));
    assert.equal(q.total,undefined);
  }
  const q=C.quote(301);
  assert.equal(q.reason,'consult');
  assert.equal(q.total,undefined);
  assert.match(C.inquiryText(301),/301명.*별도 견적/);
});

test('고객 안내문과 문의 내역에 동일한 인원·비용·부가세 확인 문구가 들어간다',()=>{
  const customer=C.customerText(50),inquiry=C.inquiryText(50);
  for(const text of [customer,inquiry]){
    assert.match(text,/50명/);
    assert.match(text,/1,750,000원/);
    assert.match(text,/250,000원/);
    assert.match(text,/2,000,000원/);
    assert.match(text,/부가세 적용 여부/);
  }
  for(const menu of C.data.course.menus) assert(customer.includes(menu),menu);
  assert.match(customer,/010-8540-1886/);
  assert.equal(C.inquiryText('<script>'),null);
});

test('세 가지 제공 방식은 금액을 바꾸지 않고 안내문과 별도 견적 요청에 전달한다',()=>{
  for(const [id,name] of [['lunchbox','도시락 케이터링'],['box','박스 케이터링'],['table','테이블 세팅 케이터링']]){
    assert.equal(C.formatLabel(id),name);
    for(const text of [C.customerText(50,id),C.inquiryText(50,id)]){
      assert(text.includes(name));
      assert.match(text,/2,000,000원/);
      assert.match(text,/포장·기물·세팅 범위 최종 협의/);
    }
    assert(C.inquiryText(301,id).includes(name));
  }
  for(const id of [null,'','constructor','__proto__','<img src=x onerror=alert(1)>']){
    assert.equal(C.formatLabel(id),'');
    assert.equal(C.inquiryText(50,id),C.inquiryText(50));
  }
});
