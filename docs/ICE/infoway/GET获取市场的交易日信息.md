# GET获取市场的交易日信息

## 接口说明

该接口是获取不同市场的交易日信息，包含全天交易日以及半天交易日

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

* 基本路径：`/common/basic/markets/trading_days`
* 完整路径：`https://data.infoway.io
  /common/basic/markets/trading_days`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## Request param入参说明

<table><thead><tr><th>参数名</th><th width="111.333251953125">类型</th><th width="98.3333740234375">必填</th><th>描述</th><th>示例值</th></tr></thead><tbody><tr><td><code>market</code></td><td>String</td><td>是</td><td>市场</td><td><code>US</code>, <code>HK</code>, <code>CN</code></td></tr><tr><td><code>beginDay</code></td><td>String</td><td>是</td><td>开始日期，使用 <code>YYYYMMDD</code> 格式</td><td><code>20230101</code></td></tr><tr><td><code>endDay</code></td><td>String</td><td>是</td><td>结束时间，使用 <code>YYYYMMDD</code> 格式</td><td><code>20230301</code></td></tr></tbody></table>

## 返回示例

```json
{
  "ret": 200,
  "msg": "success",
  "traceId": "46fbf427-a30e-48ff-8760-9fb20025c667",
  "data": {
    "trade_days": [
      "20230221",
      "20230222",
      "20230223",
      "20230224",
      "20230227",
      "20230228",
      "20230301"
    ],
    "half_trade_days": []
  }
}
```

| 字段名               | 类型   | 必填 | 描述                  | 示例值        |
| ----------------- | ---- | -- | ------------------- | ---------- |
| `trade_days`      | List | 否  | 交易日，使用 `YYYMMDD` 格式 | `20230101` |
| `half_trade_days` | List | 否  | 半日市，使用 `YYYMMDD` 格式 | `20230101` |
