# GET查询产品列表

## 接口说明

该接口是获取不同市场的产品列表，方便您确认是否包含您所需的产品数据

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

* 基本路径：`/common/basic/symbols`
* 完整路径：`https://data.infoway.io
  /common/basic/symbols`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## Request param入参说明

| 参数名       | 类型     | 必填 | 描述                                               | 示例值                |
| --------- | ------ | -- | ------------------------------------------------ | ------------------ |
| `type`    | String | 是  | 标的类型，参考下面<mark style="color:blue;">type类型</mark> | `STOCK_US`         |
| `symbols` | String | 否  | 标的列表，多个用,隔开                                      | `.DJI.US,.IXIC.US` |

#### type说明

| 类型代码       | 描述   |
| ---------- | ---- |
| `STOCK_US` | 美股   |
| `STOCK_CN` | A股   |
| `STOCK_HK` | 港股   |
| `FUTURES`  | 期货   |
| `FOREX`    | 外汇   |
| `ENERGY`   | 能源   |
| `METAL`    | 金属   |
| `CRYPTO`   | 加密货币 |

## 返回示例

```json
{
  "ret": 200,
  "msg": "success",
  "traceId": "ed8a84d9-4575-4077-bc1c-31b17d0c8977",
  "data": [
    {
      "symbol": ".DJI.US",
      "name_cn": "道琼斯指数",
      "name_hk": "道瓊斯指數",
      "name_en": "Dow Jones Industrial Average"
    },
    {
      "symbol": ".IXIC.US",
      "name_cn": "纳斯达克综合指数",
      "name_hk": "納斯達克綜合指數",
      "name_en": "NASDAQ Composite Index"
    }
  ]
}
```

| 字段名       | 类型     | 必填 | 描述   | 示例值          |
| --------- | ------ | -- | ---- | ------------ |
| `symbol`  | String | 是  | 标的代码 | `AAPL.US`    |
| `name_cn` | String | 否  | 中文名称 | `苹果`         |
| `name_hk` | String | 否  | 繁体名称 | `蘋果`         |
| `name_en` | String | 否  | 英文名称 | `Apple Inc.` |
