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
  unitDropdown: document.querySelector('#unitDropdown'),
  unitValue: document.querySelector('#unitValue'),
  unitMenu: document.querySelector('#unitMenu'),
  unitOptions: [...document.querySelectorAll('.unit-option')],
  unitNotice: document.querySelector('#unitNotice'),
  updateTime: document.querySelector('#updateTime'),
  refreshButton: document.querySelector('#refreshButton'),
  refreshIcon: document.querySelector('#refreshIcon'),
  refreshLabel: document.querySelector('#refreshLabel'),
  exportButton: document.querySelector('#exportButton'),
  exportLabel: document.querySelector('#exportLabel'),
  queryDate: document.querySelector('#queryDate'),
  queryButton: document.querySelector('#queryButton'),
  queryLabel: document.querySelector('#queryLabel'),
  uploadButton: document.querySelector('#uploadButton'),
  uploadLabel: document.querySelector('#uploadLabel'),
  importTodayButton: document.querySelector('#importTodayButton'),
  importTodayLabel: document.querySelector('#importTodayLabel'),
  searchInput: document.querySelector('#searchInput'),
  filterResult: document.querySelector('#filterResult'),
  selectAll: document.querySelector('#selectAll'),
  ratesBody: document.querySelector('#ratesBody'),
  tableWrap: document.querySelector('#tableWrap'),
  emptySearch: document.querySelector('#emptySearch'),
  loadingState: document.querySelector('#loadingState'),
  loadingText: document.querySelector('#loadingText'),
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
  uploading: false,
  importing: false,
  refreshCooldown: 0,
  unit: [1, 100].includes(storedUnit)
    ? storedUnit
    : DEFAULT_UNIT,
}

let toastTimer
let refreshTimer

const getToday = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

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

const getRateKey = (rate) => `${rate.code || rate.name}|${rate.updatedAt || ''}`

const updateSelectionUi = () => {
  const visible = getVisibleRates()
  const selectedVisibleCount = visible.filter((rate) => state.selected.has(getRateKey(rate))).length
  elements.selectedCount.textContent = String(state.selected.size)
  elements.exportButton.disabled = state.loading || state.exporting || state.uploading
    || state.importing || state.selected.size === 0
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
  const hasRates = state.data.rates.length > 0
  elements.ratesBody.replaceChildren(...visible.map(createRateRow))
  elements.filterResult.textContent = `${visible.length} 个币种`
  elements.emptySearch.textContent = hasRates
    ? '未找到匹配的币种'
    : `${state.data.date} 暂无外汇牌价数据`
  elements.emptySearch.hidden = visible.length > 0
  updateSelectionUi()
}

const updateRefreshButton = () => {
  const busy = state.loading || state.uploading || state.importing
  elements.refreshButton.disabled = busy || state.refreshCooldown > 0
  elements.refreshIcon.style.animation = state.loading ? 'spin 800ms linear infinite' : ''
  elements.refreshLabel.textContent = state.refreshCooldown > 0
    ? `刷新（${state.refreshCooldown}s）`
    : '刷新'
}

const updateOperationButtons = () => {
  const busy = state.loading || state.uploading || state.importing
  const queryingToday = elements.queryDate.value === getToday()
  elements.queryButton.disabled = busy || (queryingToday && state.refreshCooldown > 0)
  elements.uploadButton.disabled = busy
  elements.importTodayButton.disabled = busy
  updateRefreshButton()
  updateSelectionUi()
}

const startRefreshCooldown = () => {
  clearInterval(refreshTimer)
  state.refreshCooldown = 10
  updateOperationButtons()
  refreshTimer = setInterval(() => {
    state.refreshCooldown -= 1
    if (state.refreshCooldown <= 0) {
      state.refreshCooldown = 0
      clearInterval(refreshTimer)
    }
    updateOperationButtons()
  }, 1000)
}

const setLoading = (loading, message = '正在获取中国银行外汇牌价…') => {
  state.loading = loading
  elements.loadingText.textContent = message
  elements.loadingState.hidden = !loading
  elements.tableWrap.hidden = loading || !state.data
  if (loading) elements.errorState.hidden = true
  updateOperationButtons()
}

const renderSummary = () => {
  const { date, updatedAt, source, rates } = state.data
  const hasRates = rates.length > 0
  const usd = rates.find((rate) => rate.code === 'USD')
  const displayUsd = usd ? scaleRateForDisplay(usd) : null
  const unitText = formatUnit(state.unit)
  elements.rateDate.textContent = formatDate(date)
  elements.rateDateHint.textContent = hasRates ? '最新一笔牌价发布时间' : '该日期暂无牌价记录'
  elements.currencyCount.textContent = String(rates.length)
  elements.usdRateLabel.textContent = `${unitText} 美元中行折算价`
  elements.usdRate.textContent = displayUsd ? `¥ ${formatPrice(displayUsd.middle)}` : '--'
  elements.unitNotice.textContent = `当前按 ${unitText} 单位外币换算人民币`
  elements.updateTime.textContent = hasRates ? `中行牌价更新时间：${updatedAt}` : `查询日期：${date}`
  elements.sourceText.textContent = source
  elements.sourceStatus.className = 'source-status ready'
}

const applyRates = (data) => {
  state.data = data
  const defaultCodes = new Set(data.defaultCurrencyCodes)
  state.selected = new Set(
    data.rates.filter((rate) => defaultCodes.has(rate.code)).map(getRateKey),
  )
  renderSummary()
  renderTable()
  elements.tableWrap.hidden = false
}

const loadRates = async (loader = () => window.exchangeApi.fetchRates(), message) => {
  setLoading(true, message)
  try {
    applyRates(await loader())
  } catch (error) {
    const message = cleanError(error)
    if (state.data) {
      showToast(`获取失败：${message}`, true)
    } else {
      elements.errorMessage.textContent = message
      elements.errorState.hidden = false
      elements.sourceText.textContent = '中行牌价获取失败'
      elements.sourceStatus.className = 'source-status error'
    }
    if (!state.data) elements.filterResult.textContent = '0 个币种'
  } finally {
    setLoading(false)
  }
}

const syncDateControls = () => {
  const today = getToday()
  elements.queryDate.max = today
  updateOperationButtons()
}

const queryRates = () => {
  const today = getToday()
  const date = elements.queryDate.value
  if (!date) {
    showToast('请选择牌价日期', true)
    elements.queryDate.focus()
    return
  }
  if (date > today) {
    showToast('只能查询今天或今天之前的数据', true)
    return
  }

  if (date === today) {
    if (state.refreshCooldown > 0) return
    startRefreshCooldown()
    loadRates(() => window.exchangeApi.fetchRates(), '正在获取今日中国银行外汇牌价…')
    return
  }

  loadRates(
    () => window.exchangeApi.queryHistoricalRates(date),
    `正在查询 ${date} 的历史牌价…`,
  )
}

const summarizeUpload = (response) => {
  const rowCount = response?.data?.rowCount
  const publishedTimes = response?.data?.publishedTimes
  const countText = Number.isFinite(Number(rowCount)) ? `，共 ${rowCount} 条` : ''
  const timeText = Array.isArray(publishedTimes) && publishedTimes.length > 0
    ? `，${publishedTimes.length} 个发布时间`
    : ''
  return `${response?.message || '导入成功'}${countText}${timeText}`
}

const uploadExcel = async () => {
  state.uploading = true
  elements.uploadLabel.textContent = '正在上传…'
  updateOperationButtons()
  try {
    const result = await window.exchangeApi.uploadExcel()
    if (!result.canceled) showToast(summarizeUpload(result.response))
  } catch (error) {
    showToast(`上传失败：${cleanError(error)}`, true)
  } finally {
    state.uploading = false
    elements.uploadLabel.textContent = '上传 Excel'
    updateOperationButtons()
  }
}

const importToday = async () => {
  state.importing = true
  elements.importTodayLabel.textContent = '正在导入…'
  updateOperationButtons()
  try {
    const response = await window.exchangeApi.importToday()
    showToast(summarizeUpload(response))
  } catch (error) {
    showToast(`导入今日数据失败：${cleanError(error)}`, true)
  } finally {
    state.importing = false
    elements.importTodayLabel.textContent = '导入今日数据'
    updateOperationButtons()
  }
}

const exportRates = async () => {
  if (!state.data || state.selected.size === 0) return
  state.exporting = true
  elements.exportLabel.textContent = '正在导出…'
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
    elements.exportLabel.textContent = '导出 Excel'
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
  elements.unitValue.textContent = String(unit)
  for (const option of elements.unitOptions) {
    const selected = Number(option.dataset.value) === unit
    option.classList.toggle('selected', selected)
    option.setAttribute('aria-selected', String(selected))
    option.tabIndex = selected ? 0 : -1
  }
  if (state.data) {
    renderSummary()
    renderTable()
  }
}

const setUnitMenuOpen = (open, focusSelected = false) => {
  elements.unitDropdown.classList.toggle('open', open)
  elements.unitInput.setAttribute('aria-expanded', String(open))
  elements.unitMenu.hidden = !open
  if (open && focusSelected) {
    elements.unitOptions.find((option) => option.getAttribute('aria-selected') === 'true')?.focus()
  }
}

const focusUnitOption = (offset) => {
  const currentIndex = elements.unitOptions.indexOf(document.activeElement)
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + offset + elements.unitOptions.length) % elements.unitOptions.length
  elements.unitOptions[nextIndex].focus()
}

updateUnit(state.unit)
elements.unitInput.addEventListener('click', () => {
  setUnitMenuOpen(elements.unitMenu.hidden)
})
elements.unitInput.addEventListener('keydown', (event) => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault()
    setUnitMenuOpen(true, true)
  } else if (event.key === 'Escape') {
    setUnitMenuOpen(false)
  }
})
for (const option of elements.unitOptions) {
  option.addEventListener('click', () => {
    updateUnit(option.dataset.value)
    setUnitMenuOpen(false)
    elements.unitInput.focus()
  })
  option.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusUnitOption(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      elements.unitOptions[event.key === 'Home' ? 0 : elements.unitOptions.length - 1].focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setUnitMenuOpen(false)
      elements.unitInput.focus()
    }
  })
}
document.addEventListener('pointerdown', (event) => {
  if (!elements.unitDropdown.contains(event.target)) setUnitMenuOpen(false)
})
document.addEventListener('focusin', (event) => {
  if (!elements.unitDropdown.contains(event.target)) setUnitMenuOpen(false)
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
  elements.queryDate.value = getToday()
  syncDateControls()
  startRefreshCooldown()
  loadRates(() => window.exchangeApi.fetchRates(), '正在刷新今日中国银行外汇牌价…')
})
elements.retryButton.addEventListener('click', () => loadRates())
elements.exportButton.addEventListener('click', exportRates)
elements.queryDate.addEventListener('change', syncDateControls)
elements.queryButton.addEventListener('click', queryRates)
elements.uploadButton.addEventListener('click', uploadExcel)
elements.importTodayButton.addEventListener('click', importToday)
elements.defaultSelectionButton.addEventListener('click', () => {
  if (!state.data) return
  const defaultCodes = new Set(state.data.defaultCurrencyCodes)
  state.selected = new Set(
    state.data.rates.filter((rate) => defaultCodes.has(rate.code)).map(getRateKey),
  )
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

elements.queryDate.value = getToday()
syncDateControls()
loadRates()
