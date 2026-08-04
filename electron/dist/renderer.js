const elements = {
  sourceStatus: document.querySelector('.source-status'),
  sourceText: document.querySelector('#sourceText'),
  rateDate: document.querySelector('#rateDate'),
  rateDateHint: document.querySelector('#rateDateHint'),
  currencyCount: document.querySelector('#currencyCount'),
  selectedCount: document.querySelector('#selectedCount'),
  usdRate: document.querySelector('#usdRate'),
  usdRateLabel: document.querySelector('#usdRateLabel'),
  unitInput: document.querySelector('#unitInput'),
  unitNotice: document.querySelector('#unitNotice'),
  updateTime: document.querySelector('#updateTime'),
  refreshButton: document.querySelector('#refreshButton'),
  refreshIcon: document.querySelector('#refreshIcon'),
  refreshLabel: document.querySelector('#refreshLabel'),
  exportButton: document.querySelector('#exportButton'),
  searchInput: document.querySelector('#searchInput'),
  filterResult: document.querySelector('#filterResult'),
  selectAll: document.querySelector('#selectAll'),
  ratesBody: document.querySelector('#ratesBody'),
  tableWrap: document.querySelector('#tableWrap'),
  emptySearch: document.querySelector('#emptySearch'),
  loadingState: document.querySelector('#loadingState'),
  errorState: document.querySelector('#errorState'),
  errorMessage: document.querySelector('#errorMessage'),
  retryButton: document.querySelector('#retryButton'),
  toast: document.querySelector('#toast'),
  defaultSelectionButton: document.querySelector('#defaultSelectionButton'),
  selectAllButton: document.querySelector('#selectAllButton'),
  clearSelectionButton: document.querySelector('#clearSelectionButton'),
}

const DEFAULT_UNIT = 100
const storedUnit = Number(localStorage.getItem('boc-unit'))

const state = {
  data: null,
  selected: new Set(),
  query: '',
  loading: false,
  exporting: false,
  refreshCooldown: 0,
  unit: [1, 100].includes(storedUnit)
    ? storedUnit
    : DEFAULT_UNIT,
}

let toastTimer
let refreshTimer

const formatPrice = (value) => {
  if (value === null || value === undefined) return '--'
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value)
}

const formatUnit = (value) => new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 4,
}).format(value)

const scaleRateForDisplay = (rate) => {
  const baseUnit = Number(rate.unit) || DEFAULT_UNIT
  const factor = state.unit / baseUnit
  const scalePrice = (value) => value === null || value === undefined ? null : value * factor
  return {
    ...rate,
    unit: state.unit,
    exchangeBuy: scalePrice(rate.exchangeBuy),
    cashBuy: scalePrice(rate.cashBuy),
    exchangeSell: scalePrice(rate.exchangeSell),
    cashSell: scalePrice(rate.cashSell),
    middle: scalePrice(rate.middle),
  }
}

const formatDate = (value) => {
  const [year, month, day] = value.split('-')
  return `${year}年${month}月${day}日`
}

const formatDateTime = (value) => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}).format(new Date(value))

const cleanError = (error) => {
  const message = error?.message || String(error)
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

const showToast = (message, isError = false) => {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.toggle('error', isError)
  elements.toast.hidden = false
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true
  }, 6000)
}

const getVisibleRates = () => {
  if (!state.data) return []
  const query = state.query.trim().toLocaleLowerCase('zh-CN')
  if (!query) return state.data.rates
  return state.data.rates.filter((rate) => (
    rate.name.toLocaleLowerCase('zh-CN').includes(query)
    || rate.code.toLowerCase().includes(query)
  ))
}

const getRateKey = (rate) => rate.code || rate.name

const updateSelectionUi = () => {
  const visible = getVisibleRates()
  const selectedVisibleCount = visible.filter((rate) => state.selected.has(getRateKey(rate))).length
  elements.selectedCount.textContent = String(state.selected.size)
  elements.exportButton.disabled = state.loading || state.exporting || state.selected.size === 0
  elements.selectAll.checked = visible.length > 0 && selectedVisibleCount === visible.length
  elements.selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visible.length
}

const appendCell = (row, text, className = '') => {
  const cell = document.createElement('td')
  cell.className = className
  cell.textContent = text
  row.appendChild(cell)
}

const createRateRow = (rate) => {
  const displayRate = scaleRateForDisplay(rate)
  const row = document.createElement('tr')
  row.title = `中国银行发布时间：${rate.updatedAt}`

  const checkboxCell = document.createElement('td')
  checkboxCell.className = 'check-cell'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = state.selected.has(getRateKey(rate))
  checkbox.setAttribute('aria-label', `选择${rate.name}`)
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.selected.add(getRateKey(rate))
    else state.selected.delete(getRateKey(rate))
    updateSelectionUi()
  })
  checkboxCell.appendChild(checkbox)
  row.appendChild(checkboxCell)

  appendCell(row, rate.name, 'currency-name')
  appendCell(row, rate.code, 'currency-code')
  appendCell(row, formatUnit(displayRate.unit), 'number-cell')
  appendCell(row, formatPrice(displayRate.exchangeBuy), 'number-cell')
  appendCell(row, formatPrice(displayRate.cashBuy), 'number-cell')
  appendCell(row, formatPrice(displayRate.exchangeSell), 'number-cell')
  appendCell(row, formatPrice(displayRate.cashSell), 'number-cell')
  appendCell(row, formatPrice(displayRate.middle), 'number-cell')
  return row
}

const renderTable = () => {
  const visible = getVisibleRates()
  elements.ratesBody.replaceChildren(...visible.map(createRateRow))
  elements.filterResult.textContent = `${visible.length} 个币种`
  elements.emptySearch.hidden = visible.length > 0
  updateSelectionUi()
}

const updateRefreshButton = () => {
  elements.refreshButton.disabled = state.loading || state.refreshCooldown > 0
  elements.refreshIcon.style.animation = state.loading ? 'spin 800ms linear infinite' : ''
  elements.refreshLabel.textContent = state.refreshCooldown > 0
    ? `刷新（${state.refreshCooldown}s）`
    : '刷新'
}

const startRefreshCooldown = () => {
  clearInterval(refreshTimer)
  state.refreshCooldown = 10
  updateRefreshButton()
  refreshTimer = setInterval(() => {
    state.refreshCooldown -= 1
    if (state.refreshCooldown <= 0) {
      state.refreshCooldown = 0
      clearInterval(refreshTimer)
    }
    updateRefreshButton()
  }, 1000)
}

const setLoading = (loading) => {
  state.loading = loading
  elements.loadingState.hidden = !loading
  elements.tableWrap.hidden = loading || !state.data
  if (loading) elements.errorState.hidden = true
  updateRefreshButton()
  updateSelectionUi()
}

const renderSummary = () => {
  const { date, updatedAt, source, rates } = state.data
  const usd = rates.find((rate) => rate.code === 'USD')
  const displayUsd = usd ? scaleRateForDisplay(usd) : null
  const unitText = formatUnit(state.unit)
  elements.rateDate.textContent = formatDate(date)
  elements.rateDateHint.textContent = '最新一笔牌价发布时间'
  elements.currencyCount.textContent = String(rates.length)
  elements.usdRateLabel.textContent = `${unitText} 美元现汇卖出价`
  elements.usdRate.textContent = displayUsd ? `¥ ${formatPrice(displayUsd.exchangeSell)}` : '--'
  elements.unitNotice.textContent = `当前按 ${unitText} 单位外币换算人民币`
  elements.updateTime.textContent = `中行牌价更新时间：${updatedAt}`
  elements.sourceText.textContent = source
  elements.sourceStatus.className = 'source-status ready'
}

const loadRates = async () => {
  setLoading(true)
  try {
    const data = await window.exchangeApi.fetchRates()
    state.data = data
    const availableCodes = new Set(data.rates.map((rate) => rate.code))
    state.selected = new Set(data.defaultCurrencyCodes.filter((code) => availableCodes.has(code)))
    renderSummary()
    renderTable()
    elements.tableWrap.hidden = false
  } catch (error) {
    const message = cleanError(error)
    if (state.data) {
      showToast(`刷新失败：${message}`, true)
    } else {
      elements.errorMessage.textContent = message
      elements.errorState.hidden = false
    }
    elements.sourceText.textContent = '中行牌价获取失败'
    elements.sourceStatus.className = 'source-status error'
    if (!state.data) elements.filterResult.textContent = '0 个币种'
  } finally {
    setLoading(false)
  }
}

const exportRates = async () => {
  if (!state.data || state.selected.size === 0) return
  state.exporting = true
  elements.exportButton.textContent = '正在导出…'
  updateSelectionUi()

  try {
    const rates = state.data.rates.filter((rate) => state.selected.has(getRateKey(rate)))
    const result = await window.exchangeApi.exportRates({
      date: state.data.date,
      unit: state.unit,
      source: state.data.source,
      fetchedAt: state.data.fetchedAt,
      rates,
    })
    if (!result.canceled) showToast(`Excel 已保存：${result.filePath}`)
  } catch (error) {
    showToast(`导出失败：${cleanError(error)}`, true)
  } finally {
    state.exporting = false
    elements.exportButton.innerHTML = '<span class="button-icon download-icon" aria-hidden="true">↓</span>导出 Excel'
    updateSelectionUi()
  }
}

elements.searchInput.addEventListener('input', (event) => {
  state.query = event.target.value
  renderTable()
})

const updateUnit = (rawValue) => {
  const unit = Number(rawValue)
  if (![1, 100].includes(unit)) return
  state.unit = unit
  localStorage.setItem('boc-unit', String(unit))
  if (state.data) {
    renderSummary()
    renderTable()
  }
}

elements.unitInput.value = String(state.unit)
elements.unitInput.addEventListener('change', (event) => {
  updateUnit(event.target.value)
})

elements.selectAll.addEventListener('change', () => {
  const visible = getVisibleRates()
  for (const rate of visible) {
    if (elements.selectAll.checked) state.selected.add(getRateKey(rate))
    else state.selected.delete(getRateKey(rate))
  }
  renderTable()
})

elements.refreshButton.addEventListener('click', () => {
  if (state.loading || state.refreshCooldown > 0) return
  startRefreshCooldown()
  loadRates()
})
elements.retryButton.addEventListener('click', loadRates)
elements.exportButton.addEventListener('click', exportRates)
elements.defaultSelectionButton.addEventListener('click', () => {
  if (!state.data) return
  state.selected = new Set(state.data.defaultCurrencyCodes)
  renderTable()
})
elements.selectAllButton.addEventListener('click', () => {
  if (!state.data) return
  state.selected = new Set(state.data.rates.map(getRateKey))
  renderTable()
})
elements.clearSelectionButton.addEventListener('click', () => {
  state.selected.clear()
  renderTable()
})

loadRates()
