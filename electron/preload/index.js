// 此页面接收vue的消息传递
const { contextBridge, ipcRenderer } = require('electron')

const handleWindowMaximize = () => {
  ipcRenderer.send('window-max')
}

const handleWindowMinimize = () => {
  ipcRenderer.send('window-min')
}
const handleWindowClose = () => {
  ipcRenderer.send('window-close')
}

const handleUploadFile = (data) => {
  ipcRenderer.send('upload-file', data)
}

const handleSendMessage = (data) => {
  ipcRenderer.send('message-send', data)
}

contextBridge.exposeInMainWorld('myApi', {
  handleWindowMaximize,
  handleWindowMinimize,
  handleWindowClose,
  handleUploadFile,
  handleSendMessage
})
