const { app, BrowserWindow, dialog, ipcMain, net } = require('electron')
const fs = require('fs')
const path = require('path')
const {
  fetchExchangeRates,
  queryHistoricalRates,
  createUploadWorkbookBuffer,
  uploadWorkbook,
  exportRatesToExcel,
} = require('./services/exchangeService')

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024
const electronFetch = (url, options) => net.fetch(url, options)

let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: '中国银行外汇牌价',
    backgroundColor: '#f5f7f4',
    icon: path.join(__dirname, 'assets/logo.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
}

ipcMain.handle('rates:fetch', async () => (
  fetchExchangeRates(electronFetch)
))

ipcMain.handle('rates:query-history', async (_event, date) => (
  queryHistoricalRates(electronFetch, date)
))

ipcMain.handle('rates:upload-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择要导入的外汇牌价 Excel',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }

  const filePath = result.filePaths[0]
  if (path.extname(filePath).toLowerCase() !== '.xlsx') throw new Error('仅支持 .xlsx 文件')

  const file = await fs.promises.stat(filePath)
  if (!file.isFile()) throw new Error('请选择有效的 Excel 文件')
  if (file.size > MAX_UPLOAD_SIZE) throw new Error('Excel 文件不能超过 5 MB')

  const response = await uploadWorkbook(electronFetch, await fs.promises.readFile(filePath), path.basename(filePath))
  return { canceled: false, response }
})

ipcMain.handle('rates:import-today', async () => {
  const rates = await fetchExchangeRates(electronFetch)
  const fileName = `中行外汇牌价_${rates.date}.xlsx`
  const buffer = createUploadWorkbookBuffer({ rates: rates.rates, unit: 100 })
  return uploadWorkbook(electronFetch, buffer, fileName)
})

ipcMain.handle('rates:export', async (_event, payload) => {
  const rates = Array.isArray(payload?.rates) ? payload.rates : []

  if (rates.length === 0) {
    throw new Error('请至少选择一个币种后再导出')
  }

  const date = payload.date || new Date().toISOString().slice(0, 10)
  const defaultName = `中行外汇牌价_${date}.xlsx`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存中国银行外汇牌价表',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const filePath = result.filePath.toLowerCase().endsWith('.xlsx')
    ? result.filePath
    : `${result.filePath}.xlsx`

  exportRatesToExcel({
    filePath,
    date,
    unit: payload.unit,
    rates,
    source: payload.source,
    fetchedAt: payload.fetchedAt,
  })

  return { canceled: false, filePath }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
