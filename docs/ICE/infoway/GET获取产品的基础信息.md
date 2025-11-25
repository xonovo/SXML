# GET获取产品的基础信息

## 接口说明

该接口是获取不同产品的基础信息，包括名称、交易所、币种、股数等数据

## 请求频率

跟其他接口请求频率使用同一个频率限制。具体每秒请求次数根据套餐决定。可以参考[接口限制说明](HTTP接口限制.md/WebSocket限制.md)

## 错误码说明

参考[HTTP错误码说明](HTTP错误码.md)

## 接口地址

* 基本路径：`/common/basic/symbols/info`
* 完整路径：`https://data.infoway.io/common/basic/symbols/info`

## 请求头

| 参数       | 类型     | 必填 | 描述           |
| -------- | ------ | -- | ------------ |
| `apiKey` | String | 是  | 您套餐中的API Key |

## Request param入参说明

| 参数名       | 类型     | 必填 | 描述                                               | 示例值                  |
| --------- | ------ | -- | ------------------------------------------------ | -------------------- |
| `type`    | String | 是  | 标的类型，参考下面<mark style="color:blue;">type类型</mark> | `STOCK_US`           |
| `symbols` | String | 是  | 标的列表，多个用,隔开，最大支持500个                             | `000001.SZ,00076.HK` |

#### Type说明

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
  "traceId": "52327ed3-e96a-4e9a-a591-e910a0fcc563",
  "data": [
    {
      "symbol": "000001.SZ",
      "market": "CN",
      "name_cn": "平安银行",
      "name_en": "PAB",
      "name_hk": "平安銀行",
      "exchange": "SZSE",
      "currency": "CNY",
      "lot_size": 100,
      "total_shares": 19405918198,
      "circulating_shares": 19405762053,
      "hk_shares": 0,
      "eps": "2.2935271367158012",
      "eps_ttm": "2.2504474951615995",
      "bps": "22.4755662447835698",
      "dividend_yield": "0.9649999999963929",
      "stock_derivatives": "",
      "board": "SZMainConnect"
    },
    {
      "symbol": "000002.SZ",
      "market": "CN",
      "name_cn": "万科A",
      "name_en": "Vanke",
      "name_hk": "萬科A",
      "exchange": "SZSE",
      "currency": "CNY",
      "lot_size": 100,
      "total_shares": 11930709471,
      "circulating_shares": 9724196533,
      "hk_shares": 0,
      "eps": "-4.147148946357911",
      "eps_ttm": "-4.6403502137102706",
      "bps": "16.4892858366243256",
      "dividend_yield": "0",
      "stock_derivatives": "",
      "board": "SZMainConnect"
    }
  ]
}
```

| 字段名                  | 类型       | 必填 | 描述          | 示例值/可选值                                                      |
| -------------------- | -------- | -- | ----------- | ------------------------------------------------------------ |
| `symbol`             | string   | 是  | 标的代码        | `AAPL.US`                                                    |
| `name_cn`            | string   | 否  | 中文简体标的名称    | `苹果`                                                         |
| `name_en`            | string   | 否  | 英文标的名称      | `Apple`                                                      |
| `name_hk`            | string   | 否  | 中文繁体标的名称    | `蘋果`                                                         |
| `exchange`           | string   | 否  | 标的所属交易所     | `NASD`, `SSE`, `SZSE`, `SEHK`, `NYSE`, `AMEX`, `OTC`, `NYSD` |
| `currency`           | string   | 否  | 交易币种        | `USD`, `CNY`, `HKD`, `EUR`, `SGD`, `JPY`, `AUD`, `GBP`       |
| `lot_size`           | int32    | 否  | 每手股数        | `100`                                                        |
| `total_shares`       | int64    | 否  | 总股本         | `1000000000`                                                 |
| `circulating_shares` | int64    | 否  | 流通股本        | `800000000`                                                  |
| `hk_shares`          | int64    | 否  | 港股股本 (仅港股)  | `500000000`                                                  |
| `eps`                | string   | 否  | 每股盈利        | `5.25`                                                       |
| `eps_ttm`            | string   | 否  | 每股盈利 (TTM)  | `5.50`                                                       |
| `bps`                | string   | 否  | 每股净资产       | `120.50`                                                     |
| `dividend_yield`     | string   | 否  | 股息          | `3.5`                                                        |
| `stock_derivatives`  | int32\[] | 否  | 可提供的衍生品行情类型 | `[1, 2]` (1 - 期权, 2 - 轮证)                                    |
| `board`              | string   | 否  | 标的所属板块      | 参考下面的说明                                                      |

### Borad

| 板块代码               | 描述                  |
| ------------------ | ------------------- |
| `USMain`           | 美股主板                |
| `USPink`           | 粉单市场                |
| `USDJI`            | 道琼斯指数               |
| `USNSDQ`           | 纳斯达克指数              |
| `USSector`         | 美股行业概念              |
| `USOption`         | 美股期权                |
| `USOptionS`        | 美股特殊期权（收盘时间为 16:15） |
| `HKEquity`         | 港股股本证券              |
| `HKPreIPO`         | 港股暗盘                |
| `HKWarrant`        | 港股轮证                |
| `HKHS`             | 恒生指数                |
| `HKSector`         | 港股行业概念              |
| `SHMainConnect`    | 上证主板 - 互联互通         |
| `SHMainNonConnect` | 上证主板 - 非互联互通        |
| `SHSTAR`           | 科创板                 |
| `CNIX`             | 沪深指数                |
| `CNSector`         | 沪深行业概念              |
| `SZMainConnect`    | 深证主板 - 互联互通         |
| `SZMainNonConnect` | 深证主板 - 非互联互通        |
| `SZGEMConnect`     | 创业板 - 互联互通          |
| `SZGEMNonConnect`  | 创业板 - 非互联互通         |
