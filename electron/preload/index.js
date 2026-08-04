const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('exchangeApi', {
  fetchRates: () => ipcRenderer.invoke('rates:fetch'),
  exportRates: (payload) => ipcRenderer.invoke('rates:export', payload),
})
