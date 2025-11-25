# WebSocket 服务客户端使用指南

**更新时间**: 2025-01-24  
**版本**: v0.12.1

## 📋 目录

1. [快速开始](#快速开始)
2. [连接建立](#连接建立)
3. [认证方式](#认证方式)
4. [订阅数据](#订阅数据)
5. [消息格式](#消息格式)
6. [完整示例](#完整示例)
7. [常见问题](#常见问题)

---

## 🚀 快速开始

### 1. 连接地址

```javascript
// 开发环境
ws://localhost:8080

// 生产环境（通过 Nginx 代理）
wss://www.ice-markets-app.com/infoway-websocket
```

### 2. 认证信息

客户端需要准备：
- **userAccount**: 用户账号（支持 email 或账号）
- **apiKey**: 从数据库 `i_user` 表获取的 API Key（32位以上）
- **timestamp**: 当前毫秒时间戳（字符串格式）
- **sign**: 签名（MD5 计算）

---

## 🔌 连接建立

### ⚠️ 浏览器客户端的特殊说明

**重要**：浏览器 WebSocket API **不支持自定义 Headers**（只能使用标准的 WebSocket headers），所以浏览器客户端有两种认证方式：

1. **URL 查询参数认证**（推荐）- 在连接时通过 URL 传递认证信息
2. **首次消息认证**（备选）- 连接后发送认证消息

---

### 方式 A：Headers 认证（Node.js / 支持自定义 Headers 的客户端）

```javascript
const WebSocket = require('ws');
const crypto = require('crypto');

// 1. 准备认证信息
const userAccount = 'ICE00000001';  // 或 email: 'user@example.com'
const apiKey = 'F49A5A5AE98113A6E8D9C4B3A2F1E0D9C8B7A6F5E4D3C2B1A0';
const timestamp = Date.now().toString();
const cryptoMode = 'aes';  // 或 'des', 'no'

// 2. 生成动态 API Key
const dynamicApiKey = crypto.createHash('md5')
  .update(apiKey + timestamp)
  .digest('hex')
  .toUpperCase();

// 3. 生成签名
const sign = crypto.createHash('md5')
  .update(userAccount + dynamicApiKey + timestamp)
  .digest('hex');  // ⚠️ 保持小写，不要 toUpperCase()

// 4. 建立连接（Headers 认证）
const ws = new WebSocket('wss://www.ice-markets-app.com/infoway-websocket', {
  headers: {
    'x-user-account': userAccount,
    'x-timestamp': timestamp,
    'x-sign': sign,
    'x-crypto-mode': cryptoMode
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket 连接已建立');
  // 连接成功后可以直接发送订阅消息
});

ws.on('message', (data) => {
  console.log('📨 收到消息:', data.toString());
});
```

---

### 方式 B：URL 查询参数认证（浏览器客户端推荐）⭐

**适用场景**：浏览器网页客户端

**优点**：
- ✅ 连接时即完成认证，无需等待首次消息
- ✅ 代码简单，一步到位
- ✅ 认证信息在 URL 中，便于调试

**缺点**：
- ⚠️ 认证信息会出现在浏览器地址栏（如果使用开发者工具）
- ⚠️ URL 长度限制（通常 2048 字符，足够使用）

```javascript
// 浏览器环境
// 1. 准备认证信息
const userAccount = 'ICE00000001';
const apiKey = 'YOUR_API_KEY';
const timestamp = Date.now().toString();

// 2. 生成签名（需要使用 MD5 库，如 crypto-js）
const dynamicApiKey = CryptoJS.MD5(apiKey + timestamp).toString().toUpperCase();
const sign = CryptoJS.MD5(userAccount + dynamicApiKey + timestamp).toString();

// 3. 构建 WebSocket URL（包含查询参数）
const cryptoMode = 'no';  // 浏览器推荐使用 no 模式（WSS 已加密）
const wsUrl = `wss://www.ice-markets-app.com/infoway-websocket?userAccount=${encodeURIComponent(userAccount)}&sign=${sign}&timestamp=${timestamp}&cryptoMode=${cryptoMode}`;

// 4. 建立连接
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log('✅ WebSocket 连接已建立（已认证）');
  // 可以直接发送订阅消息
  subscribeData();
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};

// 订阅数据
function subscribeData() {
  if (cryptoMode === 'no') {
    // NO 模式：直接发送对象
    ws.send(JSON.stringify({
      action: 'subscribe',
      data: {
        code: 10000,
        trace: generateUUID(),
        business: 'crypto',
        data: {
          codes: 'BTCUSDT,ETHUSDT'
        }
      }
    }));
  } else {
    // AES/DES 模式：需要加密（省略加密代码）
    // ...
  }
}
```

**⚠️ 注意事项**：
- 使用 `encodeURIComponent()` 对参数进行 URL 编码
- 推荐使用 `cryptoMode: 'no'`（WSS 外层已加密）
- 签名计算必须与服务端一致（大小写敏感）

---

### 方式 C：首次消息认证（浏览器备选方案）

**适用场景**：
- 不想在 URL 中暴露认证信息
- 需要动态生成认证信息

**流程**：
1. 先建立连接（不传认证信息）
2. 服务器发送 `auth_required` 消息
3. 客户端发送认证消息
4. 服务器确认认证成功

```javascript
// 浏览器环境
// 1. 先建立连接（不传认证信息）
const ws = new WebSocket('wss://www.ice-markets-app.com/infoway-websocket');

ws.onopen = () => {
  console.log('🔌 WebSocket 连接已建立，等待认证...');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'auth_required') {
    // 2. 服务器要求认证，发送认证消息
    console.log('📨 收到认证要求，发送认证信息...');
    
    // 生成认证信息
    const userAccount = 'ICE00000001';
    const apiKey = 'YOUR_API_KEY';
    const timestamp = Date.now().toString();
    const dynamicApiKey = CryptoJS.MD5(apiKey + timestamp).toString().toUpperCase();
    const sign = CryptoJS.MD5(userAccount + dynamicApiKey + timestamp).toString();
    
    // 发送认证消息（明文 JSON）
    ws.send(JSON.stringify({
      action: 'auth',
      userAccount: userAccount,
      sign: sign,
      timestamp: timestamp,
      cryptoMode: 'no'  // 推荐使用 no 模式
    }));
    
  } else if (message.type === 'auth_success') {
    // 3. 认证成功
    console.log('✅ 认证成功');
    console.log('📝 时间戳:', message.timestamp);  // 用于后续加密（如果使用）
    
  } else if (message.type === 'connected') {
    // 4. 连接确认，可以开始订阅
    console.log('✅ 连接确认:', message.data);
    subscribeData();
    
  } else if (message.type === 'auth_failed') {
    console.error('❌ 认证失败:', message.message);
    ws.close();
  }
};

function subscribeData() {
  // 订阅数据（NO 模式示例）
  ws.send(JSON.stringify({
    action: 'subscribe',
    data: {
      code: 10000,
      trace: generateUUID(),
      business: 'crypto',
      data: {
        codes: 'BTCUSDT,ETHUSDT'
      }
    }
  }));
}
```

**⚠️ 注意事项**：
- 认证消息必须是**明文 JSON**（即使后续使用加密模式）
- 认证成功后，后续消息根据 `cryptoMode` 决定是否加密

---

## 🔐 认证方式

### 签名算法

**步骤 1：生成动态 API Key**
```javascript
dynamicApiKey = MD5(apiKey + timestamp).toUpperCase()
```

**步骤 2：生成签名**
```javascript
sign = MD5(userAccount + dynamicApiKey + timestamp).toLowerCase()
```

**⚠️ 注意事项**：
- `dynamicApiKey` 必须**大写**
- `sign` 必须**小写**
- `timestamp` 必须是**字符串**格式
- `userAccount` 支持 email 或账号（服务端会自动转换）

### 时间戳验证

- 时间戳有效期：**5 分钟**
- 客户端和服务端时间差不能超过 5 分钟
- 建议使用 NTP 同步客户端时间

---

## 📊 订阅数据

### 订阅 Trade 数据（成交数据）

```javascript
// AES/DES 加密模式
ws.send(JSON.stringify({
  action: 'subscribe',
  data: encryptData({  // 需要加密
    code: 10000,
    trace: crypto.randomUUID(),
    business: 'crypto',  // stock/crypto/common
    data: {
      codes: 'BTCUSDT,ETHUSDT'
    }
  })
}));

// NO 模式（不加密）
ws.send(JSON.stringify({
  action: 'subscribe',
  data: {  // 直接是对象
    code: 10000,
    trace: crypto.randomUUID(),
    business: 'crypto',
    data: {
      codes: 'BTCUSDT,ETHUSDT'
    }
  }
}));
```

### 订阅 Depth 数据（盘口数据）

```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  data: {
    code: 10003,  // Depth 订阅
    trace: crypto.randomUUID(),
    business: 'crypto',
    data: {
      codes: 'BTCUSDT'
    }
  }
}));
```

### 订阅 Candles 数据（K线数据）

```javascript
ws.send(JSON.stringify({
  action: 'subscribe',
  data: {
    code: 10006,  // Candles 订阅
    trace: crypto.randomUUID(),
    business: 'crypto',
    data: {
      arr: [
        { type: 1, codes: 'BTCUSDT' },  // 1分钟K线
        { type: 5, codes: 'BTCUSDT' }   // 5分钟K线
      ]
    }
  }
}));
```

### 取消订阅

```javascript
// 取消 Trade 订阅
ws.send(JSON.stringify({
  action: 'subscribe',
  data: {
    code: 11000,  // 取消 Trade
    trace: crypto.randomUUID()
  }
}));

// 取消 Depth 订阅
ws.send(JSON.stringify({
  action: 'subscribe',
  data: {
    code: 11001,  // 取消 Depth
    trace: crypto.randomUUID()
  }
}));
```

---

## 📨 消息格式

### 客户端 → 服务器

#### 认证消息（首次消息认证）
```json
{
  "action": "auth",
  "userAccount": "ICE00000001",
  "sign": "abc123...",
  "timestamp": "1763884000000",
  "cryptoMode": "aes"
}
```

#### 订阅消息（AES/DES 模式）
```json
{
  "action": "subscribe",
  "data": "iVBORw0KGgoAAAANSUhEUgAA..."  // Base64 加密数据
}
```

#### 订阅消息（NO 模式）
```json
{
  "action": "subscribe",
  "data": {  // 明文对象
    "code": 10000,
    "trace": "uuid-1234",
    "business": "crypto",
    "data": {
      "codes": "BTCUSDT,ETHUSDT"
    }
  }
}
```

#### 心跳消息
```json
{
  "action": "ping"
}
```

### 服务器 → 客户端

#### 连接确认
```json
{
  "type": "connected",
  "code": 2000,
  "message": "WebSocket connected successfully",
  "data": {
    "sessionId": "uuid-1234",
    "serverTime": 1763884000000
  }
}
```

#### 订阅成功
```json
{
  "type": "subscribed",
  "data": {  // 解密后（NO 模式直接是对象）
    "code": 10001,
    "trace": "uuid-1234",
    "symbols": [
      {
        "symbol": "BTCUSDT",
        "status": "subscribed",
        "infowaySubId": "10000:BTCUSDT"
      }
    ],
    "subscribedAt": 1763884001000
  }
}
```

#### 实时数据推送
```json
{
  "type": "data",
  "data": {  // 解密后（NO 模式直接是对象）
    "code": 10002,  // Trade 数据推送
    "data": {
      "s": "BTCUSDT",
      "p": 50000.5,
      "v": 1.25,
      "t": 1763884000
    }
  }
}
```

#### 错误消息
```json
{
  "type": "error",
  "code": 4001,
  "message": "Authentication failed"
}
```

---

## 💻 完整示例

### Node.js 完整示例（AES 模式）

```javascript
const WebSocket = require('ws');
const crypto = require('crypto');

class WebSocketClient {
  constructor(config) {
    this.userAccount = config.userAccount;
    this.apiKey = config.apiKey;
    this.url = config.url || 'wss://www.ice-markets-app.com/infoway-websocket';
    this.cryptoMode = config.cryptoMode || 'aes';
    this.ws = null;
    this.cryptoParams = null;
  }

  // 生成签名
  generateSignature(timestamp) {
    const dynamicApiKey = crypto.createHash('md5')
      .update(this.apiKey + timestamp)
      .digest('hex')
      .toUpperCase();
    
    return crypto.createHash('md5')
      .update(this.userAccount + dynamicApiKey + timestamp)
      .digest('hex');
  }

  // 连接
  connect() {
    const timestamp = Date.now().toString();
    const sign = this.generateSignature(timestamp);

    this.ws = new WebSocket(this.url, {
      headers: {
        'x-user-account': this.userAccount,
        'x-timestamp': timestamp,
        'x-sign': sign,
        'x-crypto-mode': this.cryptoMode
      }
    });

    this.ws.on('open', () => {
      console.log('✅ WebSocket 连接已建立');
      this.onConnected();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket 错误:', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket 连接已关闭');
    });
  }

  // 处理消息
  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'connected') {
        console.log('📨 连接确认:', message.data);
      } else if (message.type === 'subscribed') {
        console.log('📨 订阅成功:', message.data);
      } else if (message.type === 'data') {
        console.log('📊 实时数据:', message.data);
      } else if (message.type === 'error') {
        console.error('❌ 错误:', message.message);
      }
    } catch (error) {
      console.error('❌ 消息解析错误:', error);
    }
  }

  // 订阅 Trade 数据
  subscribeTrade(symbols, business = 'crypto') {
    const message = {
      action: 'subscribe',
      data: {
        code: 10000,
        trace: crypto.randomUUID(),
        business: business,
        data: {
          codes: Array.isArray(symbols) ? symbols.join(',') : symbols
        }
      }
    };

    // AES/DES 模式需要加密，NO 模式直接发送
    if (this.cryptoMode === 'no') {
      this.ws.send(JSON.stringify(message));
    } else {
      // 需要实现加密逻辑
      // const encrypted = encrypt(JSON.stringify(message.data), ...);
      // this.ws.send(JSON.stringify({ action: 'subscribe', data: encrypted }));
    }
  }

  // 连接成功回调
  onConnected() {
    // 订阅 BTCUSDT 的 Trade 数据
    this.subscribeTrade('BTCUSDT', 'crypto');
  }
}

// 使用示例
const client = new WebSocketClient({
  userAccount: 'ICE00000001',
  apiKey: 'YOUR_API_KEY',
  cryptoMode: 'no'  // 或 'aes', 'des'
});

client.connect();
```

### 浏览器完整示例（URL 查询参数认证 + NO 模式）⭐ 推荐

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket 客户端示例</title>
  <!-- 引入 crypto-js 库用于 MD5 计算 -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
</head>
<body>
  <script>
    // 配置信息
    const userAccount = 'ICE00000001';
    const apiKey = 'YOUR_API_KEY';  // 从后端获取，不要硬编码
    const cryptoMode = 'no';  // 推荐使用 no 模式（WSS 已加密）

    // 生成签名
    function generateSignature(timestamp) {
      // 1. 生成动态 API Key（大写）
      const dynamicApiKey = CryptoJS.MD5(apiKey + timestamp).toString().toUpperCase();
      
      // 2. 生成签名（小写）
      const sign = CryptoJS.MD5(userAccount + dynamicApiKey + timestamp).toString();
      
      return sign;
    }

    // 建立连接（URL 查询参数认证）
    const timestamp = Date.now().toString();
    const sign = generateSignature(timestamp);
    
    // 构建 WebSocket URL（包含认证参数）
    const wsUrl = `wss://www.ice-markets-app.com/infoway-websocket?userAccount=${encodeURIComponent(userAccount)}&sign=${sign}&timestamp=${timestamp}&cryptoMode=${cryptoMode}`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket 连接已建立（已认证）');
      
      // 直接订阅数据（连接时已认证）
      subscribeData();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'connected') {
        console.log('📨 连接确认:', message.data);
      } else if (message.type === 'subscribed') {
        console.log('📨 订阅成功:', message.data);
      } else if (message.type === 'data') {
        console.log('📊 实时数据:', message.data);
        // 处理实时行情数据
        handleMarketData(message.data);
      } else if (message.type === 'error') {
        console.error('❌ 错误:', message.message);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 错误:', error);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket 连接已关闭');
    };

    // 订阅数据
    function subscribeData() {
      // NO 模式：直接发送对象
      ws.send(JSON.stringify({
        action: 'subscribe',
        data: {
          code: 10000,  // Trade 订阅
          trace: generateUUID(),  // 需要实现 UUID 生成
          business: 'crypto',
          data: {
            codes: 'BTCUSDT,ETHUSDT'
          }
        }
      }));
    }

    // 处理实时行情数据
    function handleMarketData(data) {
      if (data.code === 10002) {  // Trade 数据推送
        console.log('💰 成交数据:', {
          symbol: data.data.s,
          price: data.data.p,
          volume: data.data.v,
          time: new Date(data.data.t * 1000)
        });
      }
    }

    // 生成 UUID（简化版）
    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  </script>
</body>
</html>
```

### 浏览器完整示例（首次消息认证）

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket 客户端示例（首次消息认证）</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
</head>
<body>
  <script>
    const userAccount = 'ICE00000001';
    const apiKey = 'YOUR_API_KEY';
    const cryptoMode = 'no';

    // 先建立连接（不传认证信息）
    const ws = new WebSocket('wss://www.ice-markets-app.com/infoway-websocket');

    ws.onopen = () => {
      console.log('🔌 WebSocket 连接已建立，等待认证...');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'auth_required') {
        // 服务器要求认证
        console.log('📨 收到认证要求');
        
        // 生成认证信息
        const timestamp = Date.now().toString();
        const dynamicApiKey = CryptoJS.MD5(apiKey + timestamp).toString().toUpperCase();
        const sign = CryptoJS.MD5(userAccount + dynamicApiKey + timestamp).toString();
        
        // 发送认证消息
        ws.send(JSON.stringify({
          action: 'auth',
          userAccount: userAccount,
          sign: sign,
          timestamp: timestamp,
          cryptoMode: cryptoMode
        }));
        
      } else if (message.type === 'auth_success') {
        console.log('✅ 认证成功');
        
      } else if (message.type === 'connected') {
        console.log('✅ 连接确认:', message.data);
        
        // 订阅数据
        ws.send(JSON.stringify({
          action: 'subscribe',
          data: {
            code: 10000,
            trace: generateUUID(),
            business: 'crypto',
            data: {
              codes: 'BTCUSDT,ETHUSDT'
            }
          }
        }));
        
      } else if (message.type === 'subscribed') {
        console.log('📨 订阅成功:', message.data);
        
      } else if (message.type === 'data') {
        console.log('📊 实时数据:', message.data);
      }
    };

    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  </script>
</body>
</html>
```

---

## ❓ 常见问题

### Q1: 签名验证失败？

**检查项**：
1. ✅ `dynamicApiKey` 是否大写？
2. ✅ `sign` 是否小写？
3. ✅ `timestamp` 是否是字符串？
4. ✅ `userAccount` 是否正确？
5. ✅ `apiKey` 是否与数据库一致？
6. ✅ 时间戳是否在 5 分钟内？

### Q2: 连接成功但收不到数据？

**检查项**：
1. ✅ 是否发送了订阅消息？
2. ✅ 订阅消息格式是否正确？
3. ✅ `business` 参数是否正确？
4. ✅ 加密模式是否匹配（AES/DES vs NO）？

### Q3: 浏览器无法连接？

**原因**：浏览器 WebSocket API 不支持自定义 Headers

**解决**：
- 使用 URL 查询参数认证
- 或使用首次消息认证

### Q4: 支持哪些市场？

**支持的市场**：
- `stock`: 股票市场（A股、港股、美股）
- `crypto`: 数字币市场（BTC、ETH等）
- `common`: 外汇期货（EURUSD、GC等）

### Q5: 如何选择加密模式？

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 公网生产 | `aes` | 最高安全性 |
| 内网生产 | `no` | 性能优先 |
| WSS 生产 | `no` 或 `aes` | 外层已加密 |
| 开发调试 | `no` | 便于查看消息 |

---

## 📚 相关文档

- [WebSocket 认证示例](./websocket-auth-example.md)
- [WebSocket 加密模式](./websocket-crypto-modes.md)
- [WebSocket 测试账户](./websocket-test-accounts.md)
- [WebSocket 聚合与分发机制](./websocket-aggregation-distribution.md)

---

## 🔗 API 参考

### 协议号列表

| 协议号 | 名称 | 类型 | 方向 |
|--------|------|------|------|
| `10000` | Trade订阅请求 | 请求 | C→S |
| `10001` | Trade订阅响应 | 响应 | S→C |
| `10002` | Trade数据推送 | 推送 | S→C |
| `10003` | Depth订阅请求 | 请求 | C→S |
| `10004` | Depth订阅响应 | 响应 | S→C |
| `10005` | Depth数据推送 | 推送 | S→C |
| `10006` | Candles订阅请求 | 请求 | C→S |
| `10007` | Candles订阅响应 | 响应 | S→C |
| `10008` | Candles数据推送 | 推送 | S→C |
| `11000` | 取消Trade订阅 | 请求 | C→S |
| `11001` | 取消Depth订阅 | 请求 | C→S |
| `11002` | 取消Candles订阅 | 请求 | C→S |

---

**更新日期**: 2025-01-24  
**维护者**: ICE Markets Team

