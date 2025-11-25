# GET获取市场的交易时间

## 接口说明

该接口是获取不同市场的基本交易时间

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

* 基本路径：`/common/basic/markets`
* 完整路径：`https://data.infoway.io/common/basic/markets`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## 返回示例

```json
{
  "ret": 200,
  "msg": "success",
  "traceId": "7b32f9db-852b-4234-aafb-5766f9ba385e",
  "data": [
    {
      "market": "CN",
      "remark": "A 股市场",
      "trade_schedules": [
        {
          "begin_time": "09:30:00",
          "end_time": "11:30:00",
          "type": "NormalTrade"
        },
        {
          "begin_time": "13:00:00",
          "end_time": "14:57:00",
          "type": "NormalTrade"
        }
      ]
    },
    {
      "market": "HK",
      "remark": "港股市场",
      "trade_schedules": [
        {
          "begin_time": "09:30:00",
          "end_time": "12:00:00",
          "type": "NormalTrade"
        },
        {
          "begin_time": "13:00:00",
          "end_time": "16:00:00",
          "type": "NormalTrade"
        }
      ]
    },
    {
      "market": "US",
      "remark": "美股市场",
      "trade_schedules": [
        {
          "begin_time": "04:00:00",
          "end_time": "09:30:00",
          "type": "PreTrade"
        },
        {
          "begin_time": "09:30:00",
          "end_time": "16:00:00",
          "type": "NormalTrade"
        },
        {
          "begin_time": "16:00:00",
          "end_time": "20:00:00",
          "type": "PostTrade"
        }
      ]
    }
  ]
}
```

<table><thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>描述</th><th>示例值</th></tr></thead><tbody><tr><td><code>market</code></td><td>String</td><td>是</td><td>市场</td><td><code>US</code></td></tr><tr><td><code>remark</code></td><td>String</td><td>是</td><td>备注</td><td>美股市场</td></tr><tr><td><code>trade_schedules</code></td><td>arr</td><td>是</td><td>交易时间集合</td><td></td></tr><tr><td><code>>begin_time</code></td><td>String</td><td>是</td><td>开始时间</td><td><pre><code>04:00:00
</code></pre></td></tr><tr><td><code>>end_time</code></td><td>String</td><td>是</td><td>结束时间</td><td><pre><code>09:30:00
</code></pre></td></tr><tr><td><code>type</code></td><td>String</td><td>是</td><td>时间类型</td><td><pre><code>PreTrade:盘前
</code></pre></td></tr></tbody></table>
