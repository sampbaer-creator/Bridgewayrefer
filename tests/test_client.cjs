const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('static/app.js', 'utf8');
function client(response) {
  let sent;
  const context = vm.createContext({document: {querySelector: () => null}, fetch: async (path, options) => {
    sent = {path, options};
    return response;
  }});
  vm.runInContext(source, context);
  return {call: (options) => context.api('/api/staff/doctors', options), sent: () => sent};
}
function response(status, type, body) {
  return {status, ok: status >= 200 && status < 300, redirected: false,
    headers: {get: () => type}, json: async () => body};
}
test('signed-in writes preserve same-origin referrer and credentials', async () => {
  const c = client(response(201, 'application/json', {code: 'fictional'}));
  assert.equal((await c.call({method: 'POST', body: '{}'})).code, 'fictional');
  assert.equal(c.sent().options.credentials, 'same-origin');
  assert.equal(c.sent().options.referrerPolicy, 'same-origin');
});
test('Azure HTML rejection reports HTTP status without parsing or exposing HTML', async () => {
  const r = response(403, 'text/html', null);
  r.json = async () => {throw Error('should never parse this');};
  await assert.rejects(client(r).call(), /HTTP 403/);
});
test('expired login asks for sign-in, including followed HTML redirects', async () => {
  await assert.rejects(client(response(401, 'application/json', {})).call(), /sign-in has expired/);
  const r = response(200, 'text/html', null); r.redirected = true;
  await assert.rejects(client(r).call(), /sign-in has expired/);
});
test('malformed JSON gives a useful message instead of Safari parser error', async () => {
  const r = response(502, 'application/json', null);
  r.json = async () => {throw new SyntaxError('The string did not match the expected pattern.');};
  await assert.rejects(client(r).call(), /unreadable response \(HTTP 502\)/);
});
test('application validation errors remain visible', async () => {
  await assert.rejects(client(response(400, 'application/json', {error:'Please check the form.'})).call(), /Please check the form/);
});
