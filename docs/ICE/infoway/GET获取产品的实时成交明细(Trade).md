# GET获取产品的实时成交明细(Trade)

## 接口说明

该接口是获取股票、加密货币、外汇、能源、商品等所有产品的实时成交明细

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

### 股票接口：

* 基本路径：`/stock/batch_trade/{codes}`
* 完整路径：`https://data.infoway.io
  /stock/batch_trade/{codes}`

### 加密货币接口：

* 基本路径：`/crypto/batch_trade/{codes}`
* 完整路径：`https://data.infoway.io/crypto/batch_trade/{codes}`

### 外汇、新能源、商品、贵金属、期货等产品接口：

* 基本路径：`/common/batch_trade/{codes}`
* 完整路径：`https://data.infoway.io
  /common/batch_trade/{codes}`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## 入参说明

| 参数名     | 类型     | 必填 | 描述                                                                                      | 示例值               |
| ------- | ------ | -- | --------------------------------------------------------------------------------------- | ----------------- |
| `codes` | String | 是  | 查询的产品代码，多个之间用,分隔。可参考[产品列表](https://docs.infoway.io/rest-api/basic-info/get-symbol-list) | `TSLA.US,AAPL.US` |

## 返回示例

```json
{
  "ret": 200,
  "msg": "success",
  "traceId": "27bdafb1-c735-4499-aad1-553820284895",
  "data": [
    {
      "s": "XAUAUD",
      "t": 1750177346523,
      "p": "5188.211",
      "v": "3.0",
      "vw": "15564.6330",
      "td": 0
    },
    {
      "s": "USDCNY",
      "t": 1750175583124,
      "p": "7.184",
      "v": "1.0",
      "vw": "7.1840",
      "td": 0
    }
  ]
}
```

| 字段名  | 类型     | 必填 | 描述   | 示例值                         |
| ---- | ------ | -- | ---- | --------------------------- |
| `s`  | String | 是  | 标的名称 | `USDCNY`                    |
| `t`  | Long   | 是  | 交易时间 | `1747382898892`             |
| `p`  | String | 是  | 价格   | `34.650`                    |
| `v`  | String | 是  | 成交量  | `439000`                    |
| `vw` | String | 是  | 成交额  | `15211350.000`              |
| `td` | Int    | 是  | 交易方向 | `[0,1,2]`0为默认值，1为Buy，2为SELL |
