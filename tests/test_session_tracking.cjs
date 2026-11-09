const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const appSource=fs.readFileSync('static/app.js','utf8');
function staff(status) {
  const dashboard={children:['patient details'],replaceChildren(...nodes){this.children=nodes;}};
  const create=tag=>({tag,children:[],setAttribute(k,v){this[k]=v;},append(...nodes){this.children.push(...nodes);},focus(){this.focused=true;}});
  let calls=0;
  const context=vm.createContext({document:{querySelector:s=>s==='main.dashboard'?dashboard:null,createElement:create,addEventListener(){},hidden:false},location:{origin:'https://example.test'},window:{addEventListener(){}},setInterval(){},fetch:async()=>{calls++;return {status,redirected:false,ok:status===200,headers:{get:()=> 'application/json'},json:async()=>({ok:true})};}});
  vm.runInContext(appSource,context);
  return {dashboard,call:()=>context.api('/api/staff/referrals'),calls:()=>calls};
}
test('expired session clears patient UI and offers same-origin reauthentication once',async()=>{
  const c=staff(401);await assert.rejects(c.call(),/sign-in has expired/);
  const panel=c.dashboard.children[0];assert.equal(panel.tag,'section');assert.equal(panel.focused,true);
  assert.equal(panel.children[0].textContent,'Please sign in again');
  assert.match(panel.children[2].href,/^\/\.auth\/logout\?post_logout_redirect_uri=https%3A%2F%2Fexample.test%2Fstaff%2Flogin$/);
  await assert.rejects(c.call());assert.equal(c.calls(),1);
});
test('permission and service errors do not become sign-in loops',async()=>{
  for(const status of [403,503]){const c=staff(status);await assert.rejects(c.call());assert.deepEqual(c.dashboard.children,['patient details']);}
});
function tracker(type='navigate',code='office1234',visible='visible') {
  const events={},sent=[],timers=[];
  const document={visibilityState:visible,querySelector:()=>code?{dataset:{officeCode:code}}:null,addEventListener:(key,fn)=>events[key]=fn};
  const context=vm.createContext({document,performance:{getEntriesByType:()=>[{type}]},crypto:{randomUUID:()=> 'fixed-event-id'},fetch:async(path,options)=>{sent.push({path,options});return {ok:true};},setTimeout:fn=>timers.push(fn)});
  vm.runInContext(fs.readFileSync('static/tracking.js','utf8'),context);
  return {events,sent,document};
}
test('visible office navigation sends only office code and event id once',()=>{
  const c=tracker();assert.equal(c.sent.length,1);
  assert.deepEqual(JSON.parse(c.sent[0].options.body),{code:'office1234',eventId:'fixed-event-id'});
  c.events.visibilitychange();assert.equal(c.sent.length,1);
});
test('refresh, history restore and generic home do not count office opens',()=>{
  assert.equal(tracker('reload').sent.length,0);
  assert.equal(tracker('back_forward').sent.length,0);
  assert.equal(tracker('navigate','').sent.length,0);
});
test('background prerender counts only on becoming visible',()=>{
  const c=tracker('navigate','office1234','hidden');assert.equal(c.sent.length,0);
  c.document.visibilityState='visible';c.events.visibilitychange();assert.equal(c.sent.length,1);
});
