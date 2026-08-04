const { app, BrowserWindow, dialog, ipcMain, net } = require('electron')
const path = require('path')
const { fetchExchangeRates, exportRatesToExcel } = require('./services/exchangeService')

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
  fetchExchangeRates((url, options) => net.fetch(url, options))
))

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
