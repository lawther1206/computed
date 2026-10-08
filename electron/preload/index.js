const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('exchangeApi', {
  fetchRates: () => ipcRenderer.invoke('rates:fetch'),
  queryHistoricalRates: (date) => ipcRenderer.invoke('rates:query-history', date),
  uploadExcel: () => ipcRenderer.invoke('rates:upload-file'),
  importToday: () => ipcRenderer.invoke('rates:import-today'),
  exportRates: (payload) => ipcRenderer.invoke('rates:export', payload),
})
