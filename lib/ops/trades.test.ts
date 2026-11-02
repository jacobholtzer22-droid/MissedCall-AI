import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADES, clientTradeKey, normalizeTrade, tradeKey } from './trades'

test('normalizeTrade: lowercase, & to and, punctuation to spaces', () => {
  assert.equal(normalizeTrade("Brad's Lawn & Snow, LLC"), 'brads lawn and snow llc')
  assert.equal(normalizeTrade('HVAC (Heating, Ventilation & Air Conditioning)'), 'hvac heating ventilation and air conditioning')
})

test('tradeKey: synonyms land on one key', () => {
  assert.equal(tradeKey('Painting'), 'painting')
  assert.equal(tradeKey('house painter'), 'painting')
  assert.equal(tradeKey('Junk Removal'), 'junk_removal')
  assert.equal(tradeKey('hauling and demo'), 'junk_removal')
  assert.equal(tradeKey('general contracting / remodeling'), 'remodeling')
  assert.equal(tradeKey('Remodel'), 'remodeling')
  assert.equal(tradeKey('Landscaping / Lawn Care'), 'landscaping')
  assert.equal(tradeKey('lawn care'), 'landscaping')
  assert.equal(tradeKey('Power Washing'), 'pressure_washing')
  assert.equal(tradeKey('soft washing'), 'pressure_washing')
  assert.equal(tradeKey('Car Detailing / Auto Detailing'), 'detailing')
  assert.equal(tradeKey('Roofing'), 'roofing')
  assert.equal(tradeKey('windows and doors'), 'windows_doors')
  assert.equal(tradeKey('Spray Foam Insulation'), 'spray_foam')
  assert.equal(tradeKey('permanent lighting'), 'holiday_lighting')
  assert.equal(tradeKey('Christmas Lights'), 'holiday_lighting')
  assert.equal(tradeKey('Drywall'), 'drywall')
  assert.equal(tradeKey('water filtration'), 'water_filtration')
  assert.equal(tradeKey('Handyman'), 'handyman')
  assert.equal(tradeKey('land clearing'), 'tree_service')
  assert.equal(tradeKey('HVAC (Heating, Ventilation & Air Conditioning)'), 'hvac')
})

test('tradeKey: whole words only, generic values name nothing', () => {
  assert.equal(tradeKey('lawnmower parts'), null)
  assert.equal(tradeKey('Other'), null)
  assert.equal(tradeKey('Other home service'), null)
  assert.equal(tradeKey(''), null)
  assert.equal(tradeKey(null), null)
  assert.equal(tradeKey('Smith Insurance'), null)
})

test('clientTradeKey: names on the board today', () => {
  const k = (name: string, trade: string | null = 'Other', businessType: string | null = 'Other') => clientTradeKey({ name, trade, businessType }).key
  assert.equal(k('Just Junk It'), 'junk_removal')
  assert.equal(k('Southern Peach Junk Removal'), 'junk_removal')
  assert.equal(k('Houston Waste Removal'), 'junk_removal')
  assert.equal(k('Shocos Pressure Cleaning'), 'pressure_washing')
  assert.equal(k('Prestige Blinds'), 'windows_doors')
  assert.equal(k('Oliveira Drywall Services'), 'drywall')
  assert.equal(k('Yualex Painting', 'painting and drywall', null), 'painting')
  assert.equal(k('Rays Renovation Projects'), 'remodeling')
  assert.equal(k('T&M Construction Co', null), 'remodeling')
  assert.equal(k('Frontier Tree and Land', null, null), 'tree_service')
  assert.equal(k('Jaws Auto Detailing', null, null), 'detailing')
  assert.equal(k('Jaws Lawn and Snow', null, null), 'landscaping')
  assert.equal(k('Big Bear Truck Repair'), 'truck_repair')
  assert.equal(k('Handmade Electric'), 'electrical')
  // The name wins over a trade copied wrong.
  assert.equal(k('Cowboy Spray Foam', 'Car Detailing / Auto Detailing', 'Car Detailing / Auto Detailing'), 'spray_foam')
  // No trade in the name: the trade columns decide.
  assert.equal(k('CM Home Services LLC', 'Landscaping / Lawn Care', 'Landscaping / Lawn Care'), 'landscaping')
  assert.equal(k('FlowState Home Solutions LLC', 'HVAC (Heating, Ventilation & Air Conditioning)', 'HVAC (Heating, Ventilation & Air Conditioning)'), 'hvac')
})

test('clientTradeKey: intake trade first, services last, and says where it came from', () => {
  assert.deepEqual(clientTradeKey({ intakeTrade: 'Roofing', name: 'Titan Home Exteriors', trade: 'Other' }), { key: 'roofing', from: 'intake trade' })
  assert.deepEqual(clientTradeKey({ name: 'Kalights', trade: null, businessType: 'Other', services: ['Permanent lighting install'] }), { key: 'holiday_lighting', from: 'service' })
  assert.deepEqual(clientTradeKey({ name: 'Helper Property Pros', trade: 'Other home service', businessType: 'Other' }), { key: null, from: null })
})

test('TRADES: keys are unique and every row has words', () => {
  assert.equal(new Set(TRADES.map((t) => t.key)).size, TRADES.length)
  for (const t of TRADES) assert.ok(t.words.length > 0, t.key)
})
