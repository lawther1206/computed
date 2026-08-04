const cheerio = require('cheerio')
const XLSX = require('xlsx')

const API_URL = 'https://www.boc.cn/sourcedb/whpj/index.html'
const SOURCE_NAME = '中国银行官网外汇牌价'

const DEFAULT_CURRENCY_CODES = [
  'AUD', 'CAD', 'CZK', 'EUR', 'GBP', 'HKD', 'JPY',
  'MXN', 'SEK', 'TRY', 'USD', 'AED', 'SAR', 'BRL',
]

const CURRENCY_CODES_BY_NAME = {
  阿联酋迪拉姆: 'AED',
  澳大利亚元: 'AUD',
  文莱元: 'BND',
  巴西雷亚尔: 'BRL',
  加拿大元: 'CAD',
  瑞士法郎: 'CHF',
  捷克克朗: 'CZK',
  丹麦克朗: 'DKK',
  欧元: 'EUR',
  英镑: 'GBP',
  港币: 'HKD',
  匈牙利福林: 'HUF',
  印尼卢比: 'IDR',
  以色列谢克尔: 'ILS',
  印度卢比: 'INR',
  日元: 'JPY',
  柬埔寨瑞尔: 'KHR',
  韩国元: 'KRW',
  科威特第纳尔: 'KWD',
  蒙古图格里克: 'MNT',
  澳门元: 'MOP',
  墨西哥比索: 'MXN',
  林吉特: 'MYR',
  挪威克朗: 'NOK',
  尼泊尔卢比: 'NPR',
  新西兰元: 'NZD',
  菲律宾比索: 'PHP',
  巴基斯坦卢比: 'PKR',
  卡塔尔里亚尔: 'QAR',
  塞尔维亚第纳尔: 'RSD',
  卢布: 'RUB',
  沙特里亚尔: 'SAR',
  瑞典克朗: 'SEK',
  新加坡元: 'SGD',
  泰国铢: 'THB',
  土耳其里拉: 'TRY',
  新台币: 'TWD',
  美元: 'USD',
  越南盾: 'VND',
  南非兰特: 'ZAR',
}

const parsePrice = (value) => {
  if (value === null || value === undefined || value.trim() === '') return null
  const price = Number(value.trim())
  return Number.isFinite(price) ? price : null
}

const normalizeUpdatedAt = (dateText, timeText) => {
  const normalizedDate = dateText.trim().replace(/\//g, '-')
  if (!normalizedDate) return ''
  if (/\d{2}:\d{2}:\d{2}/.test(normalizedDate)) return normalizedDate
  return `${normalizedDate} ${timeText.trim()}`.trim()
}

const parseBocPage = (html) => {
  if (typeof html !== 'string' || html.trim() === '') throw new Error('中国银行官网返回了空页面')

  const $ = cheerio.load(html)
  const rates = []

  $('#priceTable tr[data-currency]').each((_index, row) => {
    const cells = $(row).find('td').map((_cellIndex, cell) => $(cell).text().trim()).get()
    if (cells.length < 8) return

    const name = cells[0]
    rates.push({
      code: CURRENCY_CODES_BY_NAME[name] || '',
      name,
      unit: 100,
      exchangeBuy: parsePrice(cells[1]),
      cashBuy: parsePrice(cells[2]),
      exchangeSell: parsePrice(cells[3]),
      cashSell: parsePrice(cells[4]),
      middle: parsePrice(cells[5]),
      updatedAt: normalizeUpdatedAt(cells[6], cells[7]),
    })
  })

  if (rates.length === 0) throw new Error('未在中国银行页面中找到外汇牌价表')

  const latestUpdatedAt = rates
    .map((rate) => rate.updatedAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0]

  if (!latestUpdatedAt) throw new Error('中国银行牌价缺少发布时间')

  return {
    bank: 'BOC',
    bankName: '中国银行',
    date: latestUpdatedAt.slice(0, 10),
    updatedAt: latestUpdatedAt,
    fetchedAt: new Date().toISOString(),
    source: SOURCE_NAME,
    defaultCurrencyCodes: DEFAULT_CURRENCY_CODES,
    rates,
  }
}

const fetchExchangeRates = async (fetcher = global.fetch) => {
  if (typeof fetcher !== 'function') throw new Error('当前运行环境不支持网络请求')

  let response
  try {
    response = await fetcher(API_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(30000),
    })
  } catch (error) {
    throw new Error(`无法连接中国银行官网：${error.message}`)
  }

  if (!response.ok) throw new Error(`中国银行官网请求失败（HTTP ${response.status}）`)
  return parseBocPage(await response.text())
}

const scaleRatesToUnit = (rates, requestedUnit = 100) => {
  const unit = Number(requestedUnit)
  if (![1, 100].includes(unit)) {
    throw new Error('中行单位只能选择 1 或 100')
  }

  const priceFields = ['exchangeBuy', 'cashBuy', 'exchangeSell', 'cashSell', 'middle']
  return rates.map((rate) => {
    const baseUnit = Number(rate.unit) || 100
    const factor = unit / baseUnit
    const scaledRate = { ...rate, unit }
    for (const field of priceFields) {
      scaledRate[field] = rate[field] === null || rate[field] === undefined
        ? null
        : Number(rate[field]) * factor
    }
    return scaledRate
  })
}

const exportRatesToExcel = ({ filePath, date, unit = 100, rates, source, fetchedAt }) => {
  const title = `中国银行外汇牌价（${date}）`
  const scaledRates = scaleRatesToUnit(rates, unit)
  const displayUnit = scaledRates[0]?.unit || unit
  const rows = scaledRates.map((rate, index) => ({
    序号: index + 1,
    币种代码: rate.code,
    币种名称: rate.name,
    中行单位: rate.unit,
    现汇买入价: rate.exchangeBuy,
    现钞买入价: rate.cashBuy,
    现汇卖出价: rate.exchangeSell,
    现钞卖出价: rate.cashSell,
    中行折算价: rate.middle,
    发布时间: rate.updatedAt,
  }))

  const sheet = XLSX.utils.json_to_sheet(rows, { origin: 'A4' })
  XLSX.utils.sheet_add_aoa(sheet, [
    [title],
    [`数据来源：${source || SOURCE_NAME}（${API_URL}）`],
    [`获取时间：${fetchedAt ? new Date(fetchedAt).toLocaleString('zh-CN') : '未记录'}；牌价已按 ${displayUnit} 单位外币换算人民币`],
  ], { origin: 'A1' })

  sheet['!merges'] = [
    XLSX.utils.decode_range('A1:J1'),
    XLSX.utils.decode_range('A2:J2'),
    XLSX.utils.decode_range('A3:J3'),
  ]
  sheet['!cols'] = [
    { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 22 },
  ]
  sheet['!autofilter'] = { ref: `A4:J${rows.length + 4}` }

  for (let row = 5; row <= rows.length + 4; row += 1) {
    for (const column of ['E', 'F', 'G', 'H', 'I']) {
      if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = '0.000000'
    }
  }

  const notes = XLSX.utils.aoa_to_sheet([
    ['字段', '说明'],
    ['银行', '中国银行（BOC）'],
    ['中行单位', `${displayUnit}，牌价已由中国银行公布的 100 单位原始牌价等比例换算`],
    ['现汇买入价', '中国银行买入外汇时使用的价格'],
    ['现钞买入价', '中国银行买入外币现钞时使用的价格'],
    ['现汇卖出价', '中国银行卖出外汇时使用的价格'],
    ['现钞卖出价', '中国银行卖出外币现钞时使用的价格'],
    ['中行折算价', '中国银行公布的折算参考价格'],
    ['数据来源', `${source || SOURCE_NAME}（${API_URL}）`],
    ['提示', '牌价会随市场变化，实际交易价格以中国银行办理业务时为准。'],
  ])
  notes['!cols'] = [{ wch: 22 }, { wch: 86 }]

  const workbook = XLSX.utils.book_new()
  workbook.Props = { Title: title, Subject: '中国银行外汇牌价', Author: '中国银行外汇牌价工具' }
  XLSX.utils.book_append_sheet(workbook, sheet, '中行外汇牌价')
  XLSX.utils.book_append_sheet(workbook, notes, '字段说明')
  XLSX.writeFile(workbook, filePath, { compression: true })
}

module.exports = {
  API_URL,
  SOURCE_NAME,
  DEFAULT_CURRENCY_CODES,
  CURRENCY_CODES_BY_NAME,
  parseBocPage,
  fetchExchangeRates,
  scaleRatesToUnit,
  exportRatesToExcel,
}
