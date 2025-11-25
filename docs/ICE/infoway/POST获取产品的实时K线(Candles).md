# POST 获取产品的实时K线(Candles)

## 接口说明

该接口是获取股票、加密货币、外汇、能源、商品等所有产品的实时K线(Candles)

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

### 股票接口：

* 基本路径：`/stock/v2/batch_kline`
* 完整路径：`https://data.infoway.io/stock/v2/batch_kline`

### 加密货币接口：

* 基本路径：`/crypto/v2/batch_kline`
* 完整路径：`https://data.infoway.io/crypto/v2/batch_kline`

### 外汇、新能源、商品、贵金属、期货等产品接口：

* 基本路径：`/common/v2/batch_kline`
* 完整路径：`https://data.infoway.io/common/v2/batch_kline`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## Request Body入参说明（JSON）

## 入参示例

```json
{
    "klineType":1, //kline类型
    "klineNum":10, //k线数量
    "codes":"TSLA.US,AAPL.US", //查询产品，逗号分隔
    "timestamp":1758553860 //最近截止时间戳
}
```

<table><thead><tr><th>参数名</th><th>类型</th><th width="111">必填</th><th width="229">描述</th><th>示例值</th></tr></thead><tbody><tr><td><code>klineType</code></td><td>int</td><td>是</td><td>kline类型。1：1分钟k；2：5分钟k；3：15分钟k；4：30分钟k；5：1小时k；6：2小时k；7：4小时k；8：日k；9：周k；10：月k；11：季k；12：年k</td><td><code>1</code></td></tr><tr><td><code>klineNum</code></td><td>int</td><td>是</td><td>查询k线的数量（单产品最大可以查询500根K线；<strong>多产品同时查询1次只能查询不同产品最近2根k</strong>）</td><td><code>500</code></td></tr><tr><td><code>codes</code></td><td>String</td><td>是</td><td>查询的产品代码，多个之间用逗号分隔(<strong>最多可同时查询100个产品K线</strong>)。可参考<a href="../basic-info/get-symbol-list">产品列表</a></td><td><code>TSLA.US,AAPL.US</code></td></tr><tr><td><code>timestamp</code></td><td>long</td><td>否</td><td><strong>只针对分钟K以及小时K，日K及以上不限制</strong><br><strong>秒时间戳</strong>，支持根据秒时间戳向前<strong>查询历史kline</strong>，不传默认查询最近的kline（可查询范围根据套餐权限决定，<strong>目前仅支持股票产品查询</strong>）</td><td>1727007864</td></tr></tbody></table>

## 返回示例

```json
{
    "ret": 200,
    "msg": "success",
    "traceId": "19814db2-42f7-4788-9b51-b2001bf17953",
    "data": [
        {
            "s": "TSLA.US",
            "respList": [
                {
                    "t": "1751372340",
                    "h": "298.620",
                    "o": "298.439",
                    "l": "298.100",
                    "c": "298.310",
                    "v": "24329",
                    "vw": "7259092.235",
                    "pc": "-0.02%",
                    "pca": "-0.070"
                },
                {
                    "t": "1751372280",
                    "h": "298.450",
                    "o": "298.090",
                    "l": "298.000",
                    "c": "298.380",
                    "v": "32214",
                    "vw": "9607344.900",
                    "pc": "0.10%",
                    "pca": "0.290"
                }
            ]
        },
        {
            "s": "01810.HK",
            "respList": [
                {
                    "t": "1751270400",
                    "h": "59.950",
                    "o": "59.950",
                    "l": "59.950",
                    "c": "59.950",
                    "v": "23669600",
                    "vw": "1418992520.000",
                    "pc": "0.50%",
                    "pca": "0.300"
                },
                {
                    "t": "1751270340",
                    "h": "59.700",
                    "o": "59.650",
                    "l": "59.650",
                    "c": "59.650",
                    "v": "829002",
                    "vw": "49466778.300",
                    "pc": "-0.08%",
                    "pca": "-0.050"
                }
            ]
        }
    ]
}
```

| 字段名        | 类型     | 必填 | 描述   | 示例值           |
| ---------- | ------ | -- | ---- | ------------- |
| `s`        | String | 是  | 标的代码 | `USDCNY`      |
| `respList` | Array  | 是  | k线列表 | 参考下面的respList |

### respList

| 字段名   | 类型     | 必填 | 描述                  | 示例值          |
| ----- | ------ | -- | ------------------- | ------------ |
| `t`   | String | 是  | 成交时间（秒时间戳，顺序从大到小排列） | `1751270340` |
| `h`   | String | 是  | 最高价                 | `18.01`      |
| `o`   | String | 是  | 开盘价                 | `18.01`      |
| `l`   | String | 是  | 最低价                 | `18.01`      |
| `c`   | String | 是  | 收盘价                 | `18.01`      |
| `v`   | String | 是  | 成交量                 | `18000`      |
| `vm`  | String | 是  | 成交额                 | `20000`      |
| `pc`  | String | 是  | 涨跌幅                 | `0.12%`      |
| `pca` | String | 是  | 涨跌额                 | `0.11`       |
