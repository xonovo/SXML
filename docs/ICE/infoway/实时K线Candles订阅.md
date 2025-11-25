# 实时K线（Candles）订阅

## API说明

该WebSocket是获取K线的实时推送           &#x20;

## 请求频率

同一个Websocket连接，所有的请求（订阅、取消订阅、心跳）限制为**1分钟60次**，如果超出请求频率限制将会自动断连。如果断连次数过多被系统判定为恶意请求，将会封禁API Key。请在使用过程中注意调用逻辑。

## 错误码说明

参考[Websocket错误码说明](WebSocket错误码.md)

## 接口地址

请参考[Websocket订阅地址](Websocket订阅地址说明.md)

## 请求数量

不同的套餐对应的单WebSocket订阅的产品数量不一样，具体参考[Websocket限制说明](WebSocket限制.md)

## 请求（协议号：10006）

```json
{
    "code": 10006,
    "trace": "423afec425004bd8a5e02e1ba5f9b2b0",
    "data": {
        "arr": [
            {
                "type": 1,
                "codes": "BTCUSDT"
            }
        ]
    }
}
```

<table><thead><tr><th width="115">参数名</th><th width="130">类型</th><th width="103">必填</th><th>描述</th><th>示例值</th></tr></thead><tbody><tr><td><code>code</code></td><td>Integer</td><td>是</td><td>请求的协议号</td><td>K线请求协议号：<code>10006</code></td></tr><tr><td><code>trace</code></td><td>String</td><td>是</td><td>可追溯ID（随机字符串）</td><td><code>423afec425004bd8a5e02e1ba5f9b2b0</code></td></tr><tr><td><code>data</code></td><td>JsonObject</td><td>是</td><td>订阅数据</td><td></td></tr><tr><td><code>&#x3C;arr</code></td><td>JsonArray</td><td>是</td><td>多个订阅实体类</td><td></td></tr><tr><td><code>&#x3C;&#x3C;type</code></td><td>Integer</td><td>是</td><td>kline类型：1:一分钟，2:五分钟，3:十五分钟，4:三十分钟，5:一小时，6:二小时，7:四小时，8:一日，9:一周，10:一月，11:一季，12:一年</td><td><code>1</code></td></tr><tr><td><code>&#x3C;&#x3C;codes</code></td><td>String</td><td>是</td><td>订阅产品，多个用逗号分隔</td><td><code>BTCUSDT</code></td></tr></tbody></table>

## 应答（协议号：10007）

```json
{
    "code": 10007,
    "trace": "423afec425004bd8a5e02e1ba5f9b2b0",
    "msg": "ok"
}
```

| 字段名     | 类型      | 必填 | 描述          | 示例值                                |
| ------- | ------- | -- | ----------- | ---------------------------------- |
| `code`  | Integer | 是  | 响应协议号       | 订阅成功响应协议号：`10007`                  |
| `trace` | String  | 是  | 订阅传入参数可追溯id | `423afec425004bd8a5e02e1ba5f9b2b0` |
| `msg`   | String  | 是  | 响应          | `ok`                               |

## 推送（协议号：10008）

```json
{
    "code": 10008,
    "data": {
        "c": "103478.27",
        "h": "103478.27",
        "l": "103478.26",
        "o": "103478.26",
        "pca": "0.00",
        "pfr": "0.00%",
        "s": "BTCUSDT",
        "t": 1747550640,
        "ty": 1,
        "v": "0.34716",
        "vw": "35923.5149678"
    }
}
```

| 字段名    | 类型      | 必填 | 描述          | 示例值             |
| ------ | ------- | -- | ----------- | --------------- |
| `code` | Integer | 是  | Kline线推送协议号 | 10008           |
| `data` | JSON    | 是  | Kline线推送实体  |                 |
| `<s`   | String  | 是  | 标的名称        | `BTCUSDT`       |
| `<c`   | String  | 是  | 收盘价         | `103478.27`     |
| `<h`   | String  | 是  | 最高价         | `103478.27`     |
| `<l`   | String  | 是  | 最低价         | `103478.26`     |
| `<o`   | String  | 是  | 开盘价         | `103478.26`     |
| `<pca` | String  | 是  | 涨跌额         | `0.00`          |
| `<pfr` | String  | 是  | 涨跌幅         | `0.00%`         |
| `<t`   | Long    | 是  | K线时间（秒时间戳）  | `1747550640`    |
| `<ty`  | Integer | 是  | K线类型，参考入参   | `1`             |
| `<v`   | String  | 是  | 成交量         | `0.34716`       |
| `<vw`  | String  | 是  | 成交额         | `35923.5149678` |
