import test from 'node:test';import assert from 'node:assert/strict';
import {shareAllowed,shareData,shareExpiresAt} from '../lib/share-readonly.mjs';
import handler from '../api/share.mjs';
test('view key rejects missing and guessed keys',()=>{for(const key of [undefined,'','wrong','a'.repeat(300)])assert.equal(shareAllowed(key),false)});
test('viewer payload contains only allowed business fields',()=>{const data=shareData({items:[{id:'R-SP21',qty:3,secret:'hidden'}],tx:[{id:'t',qty:2,applicant_name:'A',audit:[{user:'private'}],sapPostings:[{secret:'private'}]}],members:[{email:'private'}]});assert.equal(data.items[0].qty,3);assert.equal(data.tx[0].applicant_name,'A');assert(!('secret' in data.items[0]));assert(!('audit' in data.tx[0]));assert(!('sapPostings' in data.tx[0]));assert(!('members' in data))});
test('viewer rejects writes before database access',async()=>{for(const method of ['POST','PUT','PATCH','DELETE']){let code;const res={setHeader(){},status(c){code=c;return this},json(){}};await handler({method,headers:{}},res);assert.equal(code,405)}});
test('viewer rejects missing key before database access',async()=>{let code;const res={setHeader(){},status(c){code=c;return this},json(){}};await handler({method:'GET',headers:{}},res);assert.equal(code,403)});

test('view link expires even with a key',()=>{assert.equal(shareAllowed('any-key',shareExpiresAt),false)});
