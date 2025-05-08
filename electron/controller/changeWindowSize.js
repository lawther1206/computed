// 此页面是electron的控制页面
const { ipcMain, BrowserWindow, Notification } = require('electron')

// 最小化
ipcMain.on('window-min', (event) => {
  const webContent = event.sender
  const win = BrowserWindow.fromWebContents(webContent)
  win.minimize()
})

// 最大化
ipcMain.on('window-max', (event) => {
  const webContent = event.sender
  const win = BrowserWindow.fromWebContents(webContent)
  if (win.isMaximized()) {
    win.restore()
  } else {
    win.maximize()
  }
})

// 关闭
ipcMain.on('window-close', (event) => {
  const webContent = event.sender
  const win = BrowserWindow.fromWebContents(webContent)
  win.close()
})


// 发送消息
ipcMain.on('message-send', (event, data) => {
  const { title, body } = data
  new Notification({
    title,
    body,
  }).show()
})
