import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createApp} from '../server/app.mjs';

test('dated Florida matrix and script serve through standalone CSP without source requests',async()=>{
 const app=createApp({fetcher:async()=>{throw new Error('Unexpected source request');},logSink:()=>{}});
 for(const path of ['/florida','/florida/','/florida.html']){
  const response=await app(new Request('http://localhost'+path));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/^text\/html/);
  assert.match(response.headers.get('content-security-policy'),/script-src 'self';/);
  const html=await response.text();
  assert.match(html,/<script src="\/florida.js"><\/script>/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/8 October 2026|2026-10-08/i);
 }
 const script=await app(new Request('http://localhost/florida.js'));
 assert.equal(script.status,200);
 assert.match(script.headers.get('content-type'),/^text\/javascript/);
 assert.equal(await script.text(),await readFile(new URL('../public/florida.js',import.meta.url),'utf8'));
 const head=await app(new Request('http://localhost/florida',{method:'HEAD'}));
 assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await app(new Request('http://localhost/florida',{method:'POST'}))).status,405);
});

test('matrix renders all 67 counties and retains search, source-side, family and reset controls',async()=>{
 class Element{
  constructor(){this.value='';this.children=[];this.textContent='';this.listeners={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(event,handler){this.listeners[event]=handler;}
 }
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 element('side').value='both';
 const document={getElementById:element,createElement:()=>new Element()};
 const script=await readFile(new URL('../public/florida.js',import.meta.url),'utf8');
 runInNewContext(script,{document,URL});
 assert.equal(element('count').textContent,'67 of 67 counties');
 assert.equal(element('rows').children.length,67);
 const counties=()=>element('rows').children.map(row=>row.children[0].textContent);
 assert.equal(counties()[0],'Alachua');assert.equal(counties().at(-1),'Washington');
 element('search').value='Miami-Dade';element('search').listeners.input();
 assert.deepEqual(counties(),['Miami-Dade']);
 element('reset').onclick();
 element('side').value='collector';element('family').value='Phenix FloridaTax';element('family').listeners.input();
 assert(counties().includes('Pinellas'));assert(counties().includes('Suwannee'));assert(!counties().includes('Miami-Dade'));
 element('family').value='';element('access').value='cfblock';element('access').listeners.input();
 assert(counties().includes('Alachua'));assert(!counties().includes('Bradford'));
 element('reset').onclick();
 assert.equal(element('count').textContent,'67 of 67 counties');assert.equal(element('rows').children.length,67);
 assert.equal(element('side').value,'both');
});
