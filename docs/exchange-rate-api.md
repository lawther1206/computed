# 中国银行外汇牌价接口文档

## 基本信息

- 正式环境地址：`http://101.35.107.105:3010`
- 数据格式：JSON
- 字符编码：UTF-8

## 1. 导入外汇牌价

上传中国银行外汇牌价 Excel 文件，并将其中的币种和汇率保存到数据库。

### 请求

- 请求地址：`POST /exchange-rate/upload`
- 完整地址：`http://101.35.107.105:3010/exchange-rate/upload`
- Content-Type：`multipart/form-data`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | `.xlsx` 格式的外汇牌价文件，最大 5 MB |

Excel 必须包含名为“中行外汇牌价”的工作表，表头必须符合以下顺序：

| 序号 | 字段 |
| --- | --- |
| 1 | 序号 |
| 2 | 币种代码 |
| 3 | 币种名称 |
| 4 | 中行单位 |
| 5 | 现汇买入价 |
| 6 | 现钞买入价 |
| 7 | 现汇卖出价 |
| 8 | 现钞卖出价 |
| 9 | 中行折算价 |
| 10 | 发布时间 |

### curl 示例

```bash
curl -X POST 'http://101.35.107.105:3010/exchange-rate/upload' \
  -F 'file=@/path/to/中行外汇牌价_2026-08-04.xlsx'
```

Windows PowerShell 示例：

```powershell
curl.exe -X POST "http://101.35.107.105:3010/exchange-rate/upload" --form "file=@C:/path/to/中行外汇牌价_2026-08-04.xlsx"
```

不要手动设置 `Content-Type` 请求头，curl 会自动生成 multipart boundary。

### 成功响应

```json
{
  "state": true,
  "message": "上传成功",
  "data": {
    "rowCount": 14,
    "publishedTimes": [
      "2026-08-04 09:39:21"
    ]
  }
}
```

### 响应字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `state` | Boolean | 请求是否成功 |
| `message` | String | 响应说明 |
| `data.rowCount` | Number | 本次导入的汇率记录数 |
| `data.publishedTimes` | String[] | 本次导入涉及的发布时间列表 |

### 数据覆盖规则

系统以 Excel 中的“发布时间”为覆盖依据。如果数据库已经存在相同发布时间的数据，会在一个数据库事务中删除该时间的全部旧记录，然后写入本次上传的数据。删除或写入失败时，整个操作会回滚。

同一个 Excel 文件中不能存在“发布时间 + 币种代码”完全相同的重复记录。现汇买入价等牌价字段可以为空，空值会保存为 `NULL`。

### 失败响应示例

未上传文件：

```json
{
  "state": false,
  "message": "请上传 Excel 文件"
}
```

文件格式错误：

```json
{
  "state": false,
  "message": "仅支持 .xlsx 文件"
}
```

## 2. 按日期查询外汇牌价

根据日期查询当天对应的全部币种和汇率数据。

### 请求

- 请求地址：`POST /exchange-rate/query`
- 完整地址：`http://101.35.107.105:3010/exchange-rate/query`
- Content-Type：`application/json`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `date` | String | 是 | 牌价日期，格式为 `YYYY-MM-DD` |

支持的日期格式：

```text
2026-08-04
```

查询会返回该日期下的全部牌价记录。

### curl 示例

使用日期字符串查询：

```bash
curl -X POST 'http://101.35.107.105:3010/exchange-rate/query' \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-04"}'
```

### 有数据响应

```json
{
  "state": true,
  "message": "查询成功",
  "data": {
    "result": [
      {
        "currencyCode": "USD",
        "currencyName": "美元",
        "bankUnit": 100,
        "spotBuyingRate": 674.5,
        "cashBuyingRate": 674.5,
        "spotSellingRate": 677.33,
        "cashSellingRate": 677.33,
        "bocConversionRate": 679.17,
        "publishedAt": "2026-08-04 09:39:21"
      }
    ]
  }
}
```

### 汇率记录字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currencyCode` | String | 币种代码 |
| `currencyName` | String | 币种名称 |
| `bankUnit` | Number | 中行单位 |
| `spotBuyingRate` | Number/null | 现汇买入价 |
| `cashBuyingRate` | Number/null | 现钞买入价 |
| `spotSellingRate` | Number/null | 现汇卖出价 |
| `cashSellingRate` | Number/null | 现钞卖出价 |
| `bocConversionRate` | Number/null | 中行折算价 |
| `publishedAt` | String | 发布时间，格式为 `YYYY-MM-DD HH:mm:ss` |

### 无数据响应

没有对应发布时间的数据时，请求仍然成功，`data.result` 返回空数组：

```json
{
  "state": true,
  "message": "查询成功",
  "data": {
    "result": []
  }
}
```

### 参数错误响应

```json
{
  "state": false,
  "message": "date 不能为空"
}
```
