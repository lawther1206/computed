const { app, BrowserWindow, screen } = require('electron')
const path = require('path')

require('./controller/changeWindowSize')


const createWindow = (base) => {
  const { winWidth, winHeight, x, y } = base
  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    transparent: true, //背景透明
    alwaysOnTop: true,
    hasShadow: false,// 去掉阴影
    // 不使用原生窗口
    frame: false,
    icon: path.join(__dirname, './assets/logo.png'),
    webPreferences: {
      nodeIntegration: true, //在渲染进程使用 Node.js API
      backgroundThrottling: false, // 防止透明背景被节流
      preload: path.join(__dirname, './preload/index.js')
    }
  })
  const indexHtml = path.join(__dirname, '/dist/index.html')
  win.loadFile(indexHtml);
  // 下面的url为自己启动vite项目的url。
  // win.loadURL('http://localhost:5173/')
  // 打开electron的开发者工具
  // win.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize //
  // 窗口尺寸
  const winWidth = 210
  const winHeight = 210

  // 计算右下角坐标（留 10px 边距）
  const x = width - winWidth - 10
  const y = height - winHeight - 10

  createWindow({ winWidth, winHeight, x, y })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
