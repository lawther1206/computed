const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const XLSX = require('xlsx')
const {
  API_URL,
  QUERY_URL,
  UPLOAD_URL,
  DEFAULT_CURRENCY_CODES,
  CURRENCY_CODES_BY_NAME,
  parseBocPage,
  fetchExchangeRates,
  normalizeDatabaseResult,
  queryHistoricalRates,
  scaleRatesToUnit,
  createUploadWorkbookBuffer,
  uploadWorkbook,
  exportRatesToExcel,
} = require('../electron/services/exchangeService')

const sampleHtml = `
  <table id="priceTable">
    <thead><tr><th>货币名称</th></tr></thead>
    <tr data-currency="美元">
      <td>美元</td><td>674.08</td><td>670.00</td><td>676.91</td>
      <td>677.00</td><td>678.98</td><td class="pjrq">2026/08/03 18:24:17</td><td>18:24:17</td>
    </tr>
    <tr data-currency="巴西雷亚尔">
      <td>巴西雷亚尔</td><td></td><td>126.52</td><td></td>
      <td>141.02</td><td>133.10</td><td class="pjrq">2026/08/03 18:23:17</td><td>18:23:17</td>
    </tr>
  </table>
`

test('default selection contains the requested 14 currencies', () => {
  assert.deepEqual(
    DEFAULT_CURRENCY_CODES,
    ['AUD', 'CAD', 'CZK', 'EUR', 'GBP', 'HKD', 'JPY', 'MXN', 'SEK', 'TRY', 'USD', 'AED', 'SAR', 'BRL'],
  )
})

test('currency map covers all 40 currencies on the BOC page', () => {
  assert.equal(Object.keys(CURRENCY_CODES_BY_NAME).length, 40)
  assert.equal(CURRENCY_CODES_BY_NAME.沙特里亚尔, 'SAR')
  assert.equal(CURRENCY_CODES_BY_NAME.泰国铢, 'THB')
})

test('parseBocPage maps BOC table cells and preserves missing prices', () => {
  const result = parseBocPage(sampleHtml)

  assert.equal(result.bank, 'BOC')
  assert.equal(result.date, '2026-08-03')
  assert.equal(result.rates.length, 2)
  assert.deepEqual(result.rates[0], {
    code: 'USD',
    name: '美元',
    unit: 100,
    exchangeBuy: 674.08,
    cashBuy: 670,
    exchangeSell: 676.91,
    cashSell: 677,
    middle: 678.98,
    updatedAt: '2026-08-03 18:24:17',
  })
  assert.equal(result.rates[1].exchangeBuy, null)
  assert.equal(result.rates[1].exchangeSell, null)
})

test('parseBocPage rejects pages without the official quote table', () => {
  assert.throws(() => parseBocPage('<html><body>维护中</body></html>'), /未在中国银行页面中找到/)
})

test('fetchExchangeRates requests the official BOC page once', async () => {
  let requestCount = 0
  const result = await fetchExchangeRates(async (url, options) => {
    requestCount += 1
    assert.equal(url, API_URL)
    assert.equal(options.method, 'GET')
    return { ok: true, text: async () => sampleHtml }
  })

  assert.equal(requestCount, 1)
  assert.equal(result.rates.length, 2)
})

test('scaleRatesToUnit converts prices from the original 100 unit quote', () => {
  const parsed = parseBocPage(sampleHtml)
  const scaled = scaleRatesToUnit(parsed.rates, 1)

  assert.equal(scaled[0].unit, 1)
  assert.equal(scaled[0].exchangeBuy, 6.7408)
  assert.equal(scaled[0].exchangeSell, 6.7691)
  assert.equal(scaled[1].exchangeBuy, null)
  assert.throws(() => scaleRatesToUnit(parsed.rates, 10), /只能选择 1 或 100/)
})

test('normalizeDatabaseResult maps API records and preserves nullable prices', () => {
  const result = normalizeDatabaseResult({
    state: true,
    data: {
      result: [{
        currencyCode: 'USD',
        currencyName: '美元',
        bankUnit: 100,
        spotBuyingRate: 674.5,
        cashBuyingRate: null,
        spotSellingRate: 677.33,
        cashSellingRate: '',
        bocConversionRate: 679.17,
        publishedAt: '2026-08-04 09:39:21',
      }],
    },
  }, '2026-08-04 09:39:21')

  assert.equal(result.source, '外汇牌价历史数据库')
  assert.equal(result.date, '2026-08-04')
  assert.deepEqual(result.rates[0], {
    code: 'USD',
    name: '美元',
    unit: 100,
    exchangeBuy: 674.5,
    cashBuy: null,
    exchangeSell: 677.33,
    cashSell: null,
    middle: 679.17,
    updatedAt: '2026-08-04 09:39:21',
  })
})

test('normalizeDatabaseResult keeps an empty successful query as table data', () => {
  const result = normalizeDatabaseResult({
    state: true,
    message: '查询成功',
    data: { result: [] },
  }, '2026-08-03')

  assert.equal(result.date, '2026-08-03')
  assert.equal(result.updatedAt, '2026-08-03')
  assert.deepEqual(result.rates, [])
})

test('queryHistoricalRates posts a historical date', async () => {
  const date = '2026-08-04'
  const result = await queryHistoricalRates(async (url, options) => {
    assert.equal(url, QUERY_URL)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), { date: '2026-08-04' })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        state: true,
        data: {
          result: [{
            currencyCode: 'EUR',
            currencyName: '欧元',
            bankUnit: 100,
            spotBuyingRate: 780,
            cashBuyingRate: 780,
            spotSellingRate: 785,
            cashSellingRate: 785,
            bocConversionRate: 783,
            publishedAt: '2026-08-04 09:39:21',
          }],
        },
      }),
    }
  }, date)

  assert.equal(result.rates[0].code, 'EUR')
  await assert.rejects(
    queryHistoricalRates(async () => assert.fail('should not request'), '2026-08-04 09:39:21'),
    /YYYY-MM-DD/,
  )
})

test('createUploadWorkbookBuffer uses the API sheet and header layout', () => {
  const parsed = parseBocPage(sampleHtml)
  const buffer = createUploadWorkbookBuffer({ rates: parsed.rates, unit: 100 })
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets['中行外汇牌价']

  assert.deepEqual(workbook.SheetNames, ['中行外汇牌价'])
  assert.equal(sheet.A1.v, '序号')
  assert.equal(sheet.B1.v, '币种代码')
  assert.equal(sheet.J1.v, '发布时间')
  assert.equal(sheet.B2.v, 'USD')
  assert.equal(sheet.J2.v, '2026-08-03 18:24:17')
})

test('uploadWorkbook sends an xlsx multipart file', async () => {
  const response = await uploadWorkbook(async (url, options) => {
    assert.equal(url, UPLOAD_URL)
    assert.equal(options.method, 'POST')
    const file = options.body.get('file')
    assert.equal(file.name, '中行外汇牌价_2026-08-04.xlsx')
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from('workbook'))
    return {
      ok: true,
      status: 200,
      json: async () => ({ state: true, message: '上传成功', data: { rowCount: 1 } }),
    }
  }, Buffer.from('workbook'), '中行外汇牌价_2026-08-04.xlsx')

  assert.equal(response.state, true)
  await assert.rejects(
    uploadWorkbook(async () => assert.fail('should not request'), Buffer.from('x'), 'rates.xls'),
    /仅支持 \.xlsx/,
  )
})

test('exportRatesToExcel writes readable BOC quote and notes sheets', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'computed-rates-'))
  const filePath = path.join(tempDir, 'rates.xlsx')
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const parsed = parseBocPage(sampleHtml)

  exportRatesToExcel({
    filePath,
    date: parsed.date,
    unit: 1,
    source: parsed.source,
    fetchedAt: parsed.fetchedAt,
    rates: parsed.rates,
  })

  const workbook = XLSX.readFile(filePath)
  assert.deepEqual(workbook.SheetNames, ['中行外汇牌价', '字段说明'])
  const sheet = workbook.Sheets['中行外汇牌价']
  assert.equal(sheet.A1.v, '中国银行外汇牌价（2026-08-03）')
  assert.equal(sheet.B5.v, 'USD')
  assert.equal(sheet.C5.v, '美元')
  assert.equal(sheet.D5.v, 1)
  assert.equal(sheet.E5.v, 6.7408)
  assert.equal(sheet.G5.v, 6.7691)
  assert.equal(sheet.J5.v, '2026-08-03 18:24:17')
})
