// ===========================================
// /admin/ops domain helper tests
// ===========================================
// Run: npm test.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dnsInstruction, normalizeDomain, onVercelDns, readRdap, registrarLabel } from './domains'

test('normalizeDomain strips scheme, www, path and case', () => {
  assert.equal(normalizeDomain('https://www.Example-Painting.com/contact?x=1'), 'example-painting.com')
  assert.equal(normalizeDomain('yualexpainting.com.'), 'yualexpainting.com')
  assert.throws(() => normalizeDomain('not a domain'))
})

test('registrarLabel names the registrars we know', () => {
  assert.equal(registrarLabel('NameCheap, Inc.'), 'Namecheap')
  assert.equal(registrarLabel('GoDaddy.com, LLC'), 'GoDaddy')
  assert.equal(registrarLabel('Squarespace Domains II LLC'), 'Squarespace (formerly Google Domains)')
  assert.equal(registrarLabel('Cloudflare, Inc.'), 'Cloudflare')
  assert.equal(registrarLabel('Tucows Domains Inc.'), null)
  assert.equal(registrarLabel(null), null)
})

test('readRdap pulls the registrar and nameservers', () => {
  const r = readRdap({
    entities: [
      { roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Someone']]] },
      { roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'NameCheap, Inc.']]] },
    ],
    nameservers: [{ ldhName: 'DNS1.REGISTRAR-SERVERS.COM' }, { ldhName: 'dns2.registrar-servers.com.' }],
  })
  assert.deepEqual(r, { registrarRaw: 'NameCheap, Inc.', registrar: 'Namecheap', nameservers: ['dns1.registrar-servers.com', 'dns2.registrar-servers.com'] })
  assert.deepEqual(readRdap(null), { registrarRaw: null, registrar: null, nameservers: [] })
})

test('the Namecheap instruction is one nameserver change, records as the alternative', () => {
  const text = dnsInstruction({
    domain: 'example-painting.com',
    registrar: 'Namecheap',
    records: [
      { type: 'A', name: '@', value: '76.76.21.21' },
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
    ],
  })
  assert.match(text, /^At Namecheap, set the nameservers for example-painting\.com to ns1\.vercel-dns\.com and ns2\.vercel-dns\.com\./)
  assert.match(text, /instead: A @ 76\.76\.21\.21; CNAME www cname\.vercel-dns\.com\.$/)
  assert.doesNotMatch(text, /—/)
  assert.match(dnsInstruction({ domain: 'x.com', registrar: null, records: [] }), /^At your registrar,/)
})

test('a domain already on Vercel DNS needs nothing at the registrar', () => {
  assert.equal(onVercelDns(['ns1.vercel-dns.com', 'ns2.vercel-dns.com']), true)
  assert.equal(onVercelDns([]), false)
  assert.match(dnsInstruction({ domain: 'x.com', registrar: 'Vercel', records: [], nameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] }), /nothing to change/)
})
