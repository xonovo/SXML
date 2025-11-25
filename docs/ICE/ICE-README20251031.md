# ICE-Markets-App 服务

## 概览

本项目提供统一的动态 SQL 执行接口，通过元数据驱动的方式安全执行数据库操作，支持 SELECT / DML / CALL 等多种 SQL 类型，内置 AES 加解密与签名鉴权机制。

> 🚀 **生产就绪**：完整的容器化部署方案，支持开发/生产环境一键切换，包含 Nginx 反向代理、SSL 证书自动申请、系统安全加固等企业级特性。

## 核心特性

### 🔧 技术特性
- **统一入口**：POST `/supper-interface` 接口处理所有数据库操作
- **元数据驱动**：通过 `interface` 表配置 SQL 模板与参数校验规则
- **智能兼容**：自动检测表结构，支持简化模式（仅 interfaceId + interfaceSql）
- **参数校验**：基于 JSON Schema 的强类型参数验证
- **性能优化**：连接池 + 参数绑定 + 分页保护
- **实时推送**：WebSocket 支持，实时数据推送与订阅管理
- **文件上传**：支持文件上传、临时令牌下载、MD5 校验
- **Trade 监控 v3.0**：动态订阅管理，调用存储过程处理业务逻辑（止损止盈等）

### 🔒 安全机制
- **AES 加解密**：请求/响应数据全程加密传输
- **签名鉴权**：基于 MD5(interfaceId + apiKey) 验证请求合法性
- **权限控制**：用户-接口细粒度权限管理
- **SQL 注入防护**：命名参数绑定（仅支持 `#{param}` 语法）
- **危险操作拦截**：拒绝 DROP/ALTER/TRUNCATE 等危险操作
- **分页保护**：SELECT 自动追加 LIMIT，防止大查询
- **超时控制**：可配置的执行超时时间
- **审计日志**：记录用户、接口、耗时等关键信息

### 🚀 部署特性
- **容器化部署**：Docker Compose 一键部署开发/生产环境
- **环境隔离**：开发/生产环境完全分离，支持同时运行
- **企业级部署**：Nginx 反向代理 + Let's Encrypt SSL + 系统安全加固
- **运维自动化**：一键部署脚本 + SSL 自动续期
- **监控友好**：结构化日志 + 错误追踪 + 性能指标
- **开发友好**：快速构建开发环境 + 完整的测试工具 + 详细文档

## 目录结构

```
ice-markets-app/
├── setup-vps-complete.sh      # VPS 完整初始化脚本（系统/MySQL/Nginx）
├── setup-nginx-ssl.sh         # Nginx + SSL 一键配置脚本
├── setup-sftp-static.sh       # SFTP + 静态文件服务部署脚本
├── fix-nginx-413.sh           # 修复Nginx 413错误（文件大小限制）
├── nginx.conf.template        # Nginx 配置模板
├── schema.sql                 # 核心数据库表结构与存储过程
├── schema-files.sql           # 文件上传相关表结构
├── schema-websocket.sql       # WebSocket 相关表结构
├── schema-trade-monitor.sql   # Trade 监控系统表结构（v3.0）
├── init-trade-subscriptions-customer-a.sql  # 客户A初始化示例（外汇）
├── init-trade-subscriptions-customer-b.sql  # 客户B初始化示例（加密货币）
├── Dockerfile                 # 统一的应用镜像构建（开发和生产共用）
├── docker-compose.yml         # 统一的容器编排配置（dev/prod通过.env区分）
├── start-dev.sh               # 开发环境一键启动脚本
├── start-prod.sh              # 生产环境一键启动脚本
├── run-tests.sh               # 测试脚本运行器
├── verify-deployment.sh       # 部署验证脚本
├── update-version.sh          # 版本更新脚本
├── package.json               # 项目依赖配置
├── CHANGELOG.md               # 版本变更日志
├── websocket-test.html        # WebSocket 测试页面
├── src/
│   ├── server.js              # HTTP + WebSocket 服务入口
│   ├── db.js                  # MySQL 数据库连接池
│   ├── sqlExecutor.js         # SQL 安全执行器
│   ├── validator.js           # 参数校验
│   ├── handlers/
│   │   └── fileHandlers.js    # 文件上传处理器
│   ├── utils/
│   │   ├── crypto.js          # AES/DES 加解密工具
│   │   ├── userAuth.js        # 用户鉴权工具（统一用户查询）
│   │   ├── fileUtils.js       # 文件处理工具（MD5/令牌/路径）
│   │   └── schemaDetector.js  # 表结构智能检测
│   ├── middleware/
│   │   ├── decrypt.js         # 请求解密中间件
│   │   ├── authenticate.js    # 鉴权中间件
│   │   └── encrypt.js         # 响应加密中间件
│   ├── websocket/             # WebSocket 模块
│   │   ├── server.js          # WebSocket 服务器
│   │   ├── authHandler.js     # 连接鉴权
│   │   ├── connectionManager.js # 连接管理
│   │   ├── subscriptionManager.js # 订阅管理
│   │   ├── dataForwarder.js   # 数据转发
│   │   └── infowayClient.js   # Infoway 数据源客户端
│   └── services/
│       └── tradeDataMonitor.js # Trade 数据监控服务（v3.0）
└── tests/
    ├── test-crypto.js         # 加密功能测试
    ├── test-crypto-compatibility.js # 加密兼容性测试
    ├── test-register.js       # 用户注册测试
    ├── test-file-upload.js    # 文件上传测试
    ├── test-infoway-protocol.js # Infoway 协议测试
    ├── test-pagination.js     # 分页功能测试
    └── test-all-queries.js    # 综合查询测试
```

## API 文档

### 🚀 超级接口请求流程

```
客户端 → [加密请求] → 解密中间件 → 鉴权中间件 → 业务逻辑 → 加密中间件 → [加密响应] → 客户端
```

### 请求格式

**HTTP Headers**
```
x-user-account: test_user
x-crypto-mode: aes-gcm
x-timestamp: 1696118400000
Content-Type: application/json
```

> **注意**：`x-crypto-mode` 现已固定为 `aes-gcm`，请勿再使用旧的 `aes` / `des` / `no` 取值。

**请求体（加密前）**
```json
{
  "data": {
    "interfaceId": "user_by_id",
    "sign": "a1b2c3d4e5f6...",
    "params": {
      "userId": 1
    }
  } 
}
```

**请求体（加密后）**
```json
{
  "data": "wJwTBIyeOMlBLCffxKrN41t6gNCGWy1BeHPNrUxaKxOXmFzuidQGJdQfOyPFOv24="
}
```

### 加密说明

#### 加密模式支持
- **AES-GCM（当前版本唯一支持）**：`x-crypto-mode` 固定为 `aes-gcm`，采用 GCM 模式与 96bit IV；旧版的 `aes`/`des`/`no` 已废弃，仅作为历史文档留存。

#### 请求解密
1. 从 Header 获取 `x-user-account` 和  `x-timestamp`
2. 查询 `i_user` 表获取 `apiKey`，并对 apiKey 进行处理：apiKey=MD5(apiKey+timestamp)
3. 从请求头中获取 `x-crypto-mode` 参数（固定为 `aes-gcm`），否则使用环境变量 `CRYPTO_MODE`
4. 根据 AES-GCM 要求派生 96bit IV（详见 `sapi.js` 实现），使用相同动态密钥完成解密
5. 使用 AES-GCM 算法解密 `data` 字段

#### 响应加密
1. 使用同一 `apiKey` 和 `x-crypto-mode: aes-gcm`, 以及 `x-timestamp`，派生响应专用 IV
2. 仅加密响应中的 `data` 字段

### 签名生成

```javascript
// 1. 生成动态 API Key
const timestamp = Date.now().toString();
const dynamicApiKey = MD5(apiKey + timestamp).toUpperCase();

// 2. 生成签名
const sign = MD5(interfaceId + dynamicApiKey + timestamp);

// 示例：
// timestamp = "1760090000000"
// dynamicApiKey = MD5("F49A5A5AE98113A6..." + "1760090000000").toUpperCase()
// sign = MD5("user_by_id" + dynamicApiKey + "1760090000000")
```

### 鉴权流程

调用存储过程 `interface_authentication(userAccount, interfaceId, sign)`

**返回码**：
- `2000`：鉴权成功，继续执行
- `4001`：权限不足或接口不存在
- `4002`：签名错误

### 响应格式

**成功响应（SELECT - 单行数据）**
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "timestamp",
  "meta": {
    "kind": "select",
    "count": 1,
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "hasMore": false
  }
}
```

**解密后 data 内容（单行自动展开）**：

```json
{
  "id": 1,
  "name": "Alice", 
  "email": "alice@example.com"
}
```

**成功响应（SELECT - 多行数据）**
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "timestamp",
  "meta": {
    "kind": "select",
    "count": 2,
    "page": 1,
    "pageSize": 50,
    "total": 2,
    "hasMore": false
  }
}
```

**解密后 data 内容（多行保持数组）**：

```json
{
  "rows": [
    {
      "id": 1,
      "name": "Alice", 
      "email": "alice@example.com"
    },
    {
      "id": 2,
      "name": "Bob",
      "email": "bob@example.com"
    }
  ]
}
```

> **💡 智能展开规则**：
> - **单行数据**：SELECT/CALL 返回 1 行时，自动去掉 `rows` 包装，直接返回对象
> - **多行数据**：返回 2 行及以上时，保持 `{ rows: [...] }` 格式
> - **客户端处理**：需要判断 `data.rows` 是否存在来区分单行/多行
> - **适用场景**：适合"根据ID查询单条记录"等明确返回单行的接口

**成功响应（DML）**
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "timestamp",
  "meta": {
    "kind": "dml",
    "count": 0
  }
}
```

**解密后 data 内容**：
```json
{
  "affectedRows": 1,
  "insertId": 123
}
```

**成功响应（CALL - 单行返回）**
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "timestamp",
  "meta": {
    "kind": "call",
    "count": 1
  }
}
```

**解密后 data 内容（单行自动展开）**：
```json
{
  "userId": 10,
  "apiKey": "23B2704C5F251653712F50DDE21965D1",
  "message": "Registration successful"
}
```

**成功响应（CALL - 多行返回）**
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "timestamp",
  "meta": {
    "kind": "call",
    "count": 3
  }
}
```

**解密后 data 内容（多行保持数组）**：
```json
{
  "rows": [
    {
      "userId": 10,
      "apiKey": "23B2704C5F251653712F50DDE21965D1",
      "message": "Registration successful"
    },
    {
      "userId": 11,
      "apiKey": "A1B2C3D4E5F6...",
      "message": "Another record"
    }
  ]
}
```

> **💡 CALL 存储过程说明**：
> - **单行**：存储过程 SELECT 返回 1 行时，自动展开为对象
> - **多行**：返回 2 行及以上时，保持 `{ rows: [...] }` 格式
> - **executeInfo**：如果存储过程返回多个结果集，会包含执行状态信息
> - 客户端处理：优先使用展开后的字段，多行时访问 `data.rows[0]`

**错误响应**
```json
{
  "status": 0,
  "code": "PERMISSION_DENIED | INVALID_SIGNATURE | INTERFACE_NOT_FOUND | ...",
  "message": "错误描述",
  "details": "堆栈信息（仅开发环境）",
  "traceId": "optional"
}
```

### 错误码说明

| 错误码 | 说明 | HTTP状态码 |
|--------|------|-----------|
| `MISSING_USER_ACCOUNT` | Header 缺少 x-user-account | 400 |
| `MISSING_TIMESTAMP` | Header 缺少 x-timestamp | 400 |
| `MISSING_ENCRYPTED_DATA` | 请求体缺少 data 字段 | 400 |
| `USER_NOT_FOUND` | 用户不存在或已禁用 | 401 |
| `DECRYPTION_FAILED` | 解密失败（密钥错误或数据损坏） | 400 |
| `MISSING_INTERFACE_ID` | 缺少 interfaceId | 400 |
| `MISSING_SIGNATURE` | 缺少 sign | 400 |
| `PERMISSION_DENIED` | 权限不足（用户无接口访问权限） | 403 |
| `INVALID_SIGNATURE` | 签名错误（鉴权失败） | 401 |
| `INTERFACE_NOT_FOUND` | 接口不存在 | 404 |
| `INTERFACE_DISABLED` | 接口已禁用 | 403 |
| `INVALID_PARAMS` | 参数校验失败（不符合JSON Schema） | 400 |
| `SQL_REJECTED` | SQL 包含危险操作（DROP/ALTER等） | 403 |
| `SQL_EXEC_TIMEOUT` | SQL 执行超时 | 504 |
| `SQL_EXEC_ERROR` | SQL 执行错误（语法错误等） | 500 |
| `INTERNAL_ERROR` | 服务端内部错误 | 500 |

### 🆕 用户注册流程

#### 1. 注册接口说明

**本质就是用一个公共账户和固定接口完成创建用户的过程，以下为示例，客户可以自定义自己的注册接口。**

**接口ID**: `I00001`  
**公共账户**: `public_user`  
**公共KEY**: `070143E3A2777BB093A58318A963B0EE`（绑定公共账户）

> ⚠️ **重要提示**：注册接口使用公共 KEY，所有人都可以使用此 KEY 调用注册接口。注册成功后，系统会返回用户专属的 `apiKey`。

#### 2. 注册请求示例

```javascript
// 请求体
const requestBody = {
  interfaceId: 'I00001',
  sign: sign,
  params: {
    email: email,
    password: hashedPassword  // 32位 MD5 hash
  }
};

// 发送请求
fetch('https://your-domain.com/supper-interface', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-account': 'public_user',
  'x-crypto-mode': 'aes-gcm',
    'x-timestamp': timestamp
  },
  body: JSON.stringify({ data: encryptedBody })
});
```

#### 3. 注册响应示例

**成功响应（data解密后）**:
```json
{
  "userId": 10,
  "apiKey": "23B2704C5F251653712F50DDE21965D1",
  "message": "Registration successful"
}
```

**邮箱已存在（data解密后）**:
```json
{
  "userId": null,
  "apiKey": null,
  "message": "Email already registered"
}
```

#### 4. 测试注册流程

```bash
# 在 Docker 容器中运行注册测试
docker exec ice-markets-app-dev node tests/test-register.js
```

## 数据库结构

### 核心表

#### 1. `interface` - 接口元数据表

**完整模式**（所有字段）：
```sql
interfaceId     VARCHAR(128)  # 接口ID（主键）⭐必需
interfaceSql    TEXT          # SQL 模板（支持 #{param} 占位符）⭐必需
result_type     ENUM          # 'select'|'dml'|'call'|'auto'
enabled         TINYINT(1)    # 是否启用
param_schema    JSON          # 参数 JSON Schema
timeout_ms      INT           # 超时时间（毫秒）
max_rows        INT           # 最大返回行数
max_page_size   INT           # 最大分页大小
...
```

**简化模式**（客户环境兼容）：
```sql
interfaceId     VARCHAR(128)  # 接口ID（主键）⭐必需
interfaceSql    TEXT          # SQL 模板 ⭐必需
```

> 💡 **智能兼容**：系统启动时自动检测表结构，缺失字段将使用安全的默认值：
> - `result_type` → `'auto'`（自动判断 SQL 类型）
> - `enabled` → `1`（默认启用）
> - `param_schema` → `null`（跳过参数校验）
> - `timeout_ms` → 使用环境变量 `DEFAULT_TIMEOUT_MS`
> - `max_rows` → `null`（无限制）
> - `max_page_size` → `100`

#### 2. `i_user` - 用户表

**完整模式**：
```sql
userAccount     VARCHAR(128)  # 用户账号（唯一）⭐必需
apiKey          VARCHAR(64)   # 32位以上，用于AES加解密与签名 ⭐必需
enabled         TINYINT(1)    # 是否启用
description     VARCHAR(512)  # 描述
created_at      TIMESTAMP     # 创建时间
updated_at      TIMESTAMP     # 更新时间
```

**简化模式**（客户环境兼容）：
```sql
userAccount     VARCHAR(128)  # 用户账号（唯一）⭐必需
apiKey          VARCHAR(64)   # 32位以上 ⭐必需
```

> 💡 **智能兼容**：缺少 `enabled` 字段时，所有用户默认启用

#### 3. `i_user_interface` - 用户权限映射表
```sql
userAccount     VARCHAR(128)  # 用户账号
interfaceId     VARCHAR(128)  # 接口ID
enabled         TINYINT(1)    # 是否启用
...
```

### 存储过程

#### `interface_authentication(userAccount, interfaceId, sign)`
验证用户权限与签名，返回鉴权结果码。

## 配置说明

### 环境文件配置

项目使用 `.env.xxx` 文件来管理不同环境的配置，参见：

> 文件：`.env.dev`

> 文件：`.env.prod`

## 使用示例

### 新增接口

```sql
-- 参考 schema.sql
```

### 授权用户访问接口

```sql
-- 参考 schema.sql
```

## 兼容模式说明

### 完整模式 vs 简化模式

#### interface 表对比

| 特性 | 完整模式 | 简化模式 |
|------|---------|---------|
| 必需字段 | interfaceId, interfaceSql | interfaceId, interfaceSql |
| 参数校验 | ✅ 支持 JSON Schema | ❌ 跳过 |
| 接口开关 | ✅ enabled 字段 | ✅ 默认启用 |
| 超时控制 | ✅ timeout_ms | ✅ 使用全局默认 |
| 分页限制 | ✅ max_rows, max_page_size | ✅ 默认 100 |
| SQL 类型 | ✅ result_type | ✅ 自动判断 |

#### i_user 表对比

| 特性 | 完整模式 | 简化模式 |
|------|---------|---------|
| 必需字段 | userAccount, apiKey | userAccount, apiKey |
| 用户开关 | ✅ enabled 字段 | ✅ 默认启用 |
| 适用场景 | 内部完整控制 | 客户自定义表结构 |

> ⚠️ **重要说明**：`i_user` 表是用户认证表（生产环境），用于系统登录和 API 鉴权。`users` 表是测试数据表，仅用于测试超级接口的查询功能（如 `SELECT * FROM users WHERE id = ?`），不是认证表。

### 客户环境部署

如果客户有自己的表结构（仅包含必需字段）：

**interface 表**（仅 `interfaceId` + `interfaceSql`）：
```sql
CREATE TABLE interface (
  interfaceId VARCHAR(128) PRIMARY KEY,
  interfaceSql TEXT NOT NULL
);
```

**i_user 表**（仅 `userAccount` + `apiKey`）：
```sql
CREATE TABLE i_user (
  userAccount VARCHAR(128) PRIMARY KEY,
  apiKey VARCHAR(64) NOT NULL
);
```

**部署步骤**：
1. **无需修改代码**：系统自动检测并切换到简化模式
2. **启动日志确认**：
```json
{"msg": "Interface table schema detected: simplified mode", "mode": "simplified", "fields": 2}
```
```json
{"msg": "User table schema detected: simplified mode", "mode": "simplified", "fields": 2}
```

3. **功能说明**：
- 参数校验：跳过（建议在 SQL 或存储过程中做校验）
- 超时/分页：使用全局默认值
- 用户/接口：默认全部启用

### 客户自定义鉴权函数

客户可以重写 `interface_authentication()` 函数实现自己的鉴权逻辑，只需：
- 函数签名保持一致：`interface_authentication(userAccount, interfaceId, sign)`
- 返回约定的状态码：`2000` (成功) / `4001` (权限不足) / `4002` (签名错误)

---

### 📁 文件上传功能

#### 1. 功能概述

- **存储方式**: 本地文件系统（明文存储）
- **文件类型**: 支持任意类型
- **文件大小**: 单文件最大 15MB
- **上传方式**: 二进制流（multipart/form-data）
- **鉴权方式**: 开箱即用（无需数据库配置） ✨
- **访问方式**: 临时访问令牌（可配置有效期）
- **存储路径**: `/app/uploads/{userAccount}/{YYYYMM}/{fileId}.{ext}`

> ✨ **开箱即用**：文件上传接口（`file_upload` 和 `generate_file_token`）跳过数据库鉴权，无需在 `interface` 表和 `i_user_interface` 表中配置。只需确保 `public_user` 存在于 `i_user` 表（用于加解密）即可使用。

#### 2. 文件上传接口

**请求方式**: `POST /file`  
**Content-Type**: `multipart/form-data`

**Headers**:
```
x-user-account: user@example.com
x-timestamp: 1760090000000
x-crypto-mode: aes-gcm
```

**FormData 字段**:
- `file`: 文件二进制流
- `data`: 加密的 JSON 字符串

**data 字段内容（加密前）**:
```json
{
  "fileMd5": "${文件MD5}",
  "sign": "MD5(fileName + dynamicApiKey + timestamp)",
  "params": {
    "fileName": "document.pdf",
    "description": "项目文档",
    "tags": ["project", "2025"]
  }
}
```

**签名生成**:
```javascript
const timestamp = Date.now().toString();
const dynamicApiKey = MD5(apiKey + timestamp).toUpperCase();
const sign = MD5(fileName + dynamicApiKey + timestamp);
```

**响应（外层）**:
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "1760090000000",
  "meta": {
    "kind": "file",
    "count": 1
  }
}
```

**解密后 data 内容**:
```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "document.pdf",
  "fileSize": 1024000,
  "fileMd5": "D41D8CD98F00B204E9800998ECF8427E",
  "uploadTime": 1760090001000,
  "downloadUrl": "http://your-domain.com/files/550e8400-...?token=eyJ..."
}
```

#### 3. 生成临时访问令牌

**请求方式**: `POST /file-token`  
**Content-Type**: `application/json`

**Headers**:
```
x-user-account: user@example.com
x-timestamp: 1760090000000
x-crypto-mode: aes-gcm
```

**请求（加密前）**:
```json
{
  "sign": "MD5(fileId + dynamicApiKey + timestamp)",
  "params": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "expiresIn": 3600
  }
}
```

**签名生成**:
```javascript
const timestamp = Date.now().toString();
const dynamicApiKey = MD5(apiKey + timestamp).toUpperCase();
const sign = MD5(fileId + dynamicApiKey + timestamp);
```

**响应（外层）**:
```json
{
  "status": 1,
  "code": "success",
  "data": "加密后的Base64字符串",
  "timestamp": "1760090000000",
  "meta": {
    "kind": "file",
    "count": 1
  }
}
```

**解密后 data 内容**:
```json
{
  "token": "eyJmaWxlSWQiOiI1NTBlODQwMC...",
  "expiresAt": 1760093600000,
  "downloadUrl": "http://your-domain.com/files/550e8400-...?token=eyJ..."
}
```

#### 4. 文件下载

**请求方式**: `GET /files/{fileId}?token={临时令牌}`

**响应**: 文件流（不加密）

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="document.pdf"
Content-Length: 1024000
```

#### 5. 测试文件上传

```bash
# 在 Docker 容器中运行文件上传测试
docker exec ice-markets-app-dev node tests/test-file-upload.js
```

#### 6. 部署要求

文件上传功能**开箱即用**，只需满足以下条件：

1. **`i_user` 表中存在 `public_user`**（用于获取 `apiKey` 进行加解密）
2. **`files` 表已创建**（用于存储文件元数据，见 `schema.sql`）

**无需额外配置**：
- ❌ 不需要在 `interface` 表中定义 `file_upload` 和 `generate_file_token`
- ❌ 不需要在 `i_user_interface` 表中授权
- ❌ 不需要客户实现 `interface_authentication()` 函数中的文件接口鉴权逻辑

> 💡 **生产环境友好**：文件接口跳过所有数据库鉴权，客户无需配置即可使用。

#### 7. 配置说明

在 `.env` 文件中配置：

```bash
# 文件令牌有效期（秒）
FILE_TOKEN_EXPIRES_IN=3600

# API 基础 URL（用于生成下载链接）
API_BASE_URL=http://your-domain.com
```

### 文件管理错误码说明

| 错误码 | 说明 | HTTP状态码 |
|--------|------|-----------|
| `NO_FILE_UPLOADED` | 未上传文件 | 400 |
| `FILE_TOO_LARGE` | 文件超过15MB限制 | 413 |
| `FILE_MD5_MISMATCH` | 文件MD5校验失败（数据损坏） | 400 |
| `INVALID_SIGNATURE` | 签名验证失败 | 401 |
| `FILE_NOT_FOUND` | 文件不存在 | 404 |
| `ACCESS_DENIED` | 访问被拒绝（非文件所有者） | 403 |
| `TOKEN_REQUIRED` | 缺少访问令牌 | 401 |
| `INVALID_TOKEN` | 令牌无效或过期 | 401 |
| `TOKEN_MISMATCH` | 令牌与文件不匹配 | 403 |
| `INTERNAL_ERROR` | 服务端内部错误 | 500 |

---

### 🔌 WebSocket 实时推送功能

#### 1. 功能概述

- **协议支持**: WebSocket (ws:// / wss://)
- **鉴权方式**: MD5 签名验证 *（**不**复用超级接口鉴权机制）* 
- **消息加密**: 支持 AES/DES 双向加密
- **连接管理**: 自动心跳保活、断线重连、会话管理
- **订阅模型**: 市场/产品/数据类型灵活订阅
- **权限控制**: 简化版（已鉴权用户可订阅任意市场）✨
- **数据转发**: 自动聚合订阅、智能数据分发

> ✨ **开箱即用**：WebSocket 功能只做用户身份验证，不做细粒度的市场/产品权限控制，无需配置 `ws_subscription_permission` 表。

#### 2. 架构设计

```
客户端 WebSocket
    ↓ [带签名的握手]
authHandler (身份验证)
    ↓ [签名、时间戳、用户查询]
connectionManager (连接管理)
    ↓ [subscribe/unsubscribe/ping]
subscriptionManager (订阅管理)
    ↓ [去重、聚合]
infowayClient (外部数据源)
    ↓ [实时行情数据]
dataForwarder (数据分发)
    ↓ [加密推送]
客户端 WebSocket
```

#### 3. 连接建立

**WebSocket 连接地址**:
```
# 开发环境
ws://localhost:8080

# 生产环境（通过 Nginx 代理）
wss://your-domain.com/infoway-websocket
```

**握手 Headers**:
```
x-user-account: test_user
x-timestamp: 1760090000000
x-sign: MD5(userAccount + dynamicApiKey + timestamp)
x-crypto-mode: aes-gcm
```

**签名生成**:
```javascript
const timestamp = Date.now().toString();
const dynamicApiKey = MD5(apiKey + timestamp).toUpperCase();
const sign = MD5(userAccount + dynamicApiKey + timestamp);
```

**JavaScript 连接示例**:
```javascript
const WebSocket = require('ws');
const crypto = require('crypto');

const userAccount = 'test_user';
const apiKey = 'YOUR_API_KEY_32_CHARS_OR_MORE';
const timestamp = Date.now().toString();

// 生成动态 apiKey
const dynamicApiKey = crypto.createHash('md5')
  .update(apiKey + timestamp)
  .digest('hex')
  .toUpperCase();

// 生成签名：MD5(userAccount + dynamicApiKey + timestamp)
const sign = crypto.createHash('md5')
  .update(userAccount + dynamicApiKey + timestamp)
  .digest('hex');

const ws = new WebSocket('ws://your-domain.com:8080', {
  headers: {
    'x-user-account': userAccount,
    'x-timestamp': timestamp,
    'x-sign': sign,
  'x-crypto-mode': 'aes-gcm'
  }
});

ws.on('open', () => {
  console.log('WebSocket 连接已建立');
});

ws.on('message', (data) => {
  console.log('收到消息:', data.toString());
});
```

#### 4. 消息格式（Infoway 协议透传）

**客户端 → 服务器（请求）**:
```json
{
  "action": "subscribe",
  "data": "加密后的Base64字符串"
}
```

**data 解密后内容（Infoway 原始协议）**:
```json
{
  "code": 10000,           // Infoway 协议号（10000=Trade, 10003=Depth, 10006=Candles）
  "trace": "uuid",         // 请求追踪ID
  "business": "crypto",    // ⭐ 市场类型（stock/crypto/common，默认crypto）
  "data": {                // Infoway 数据格式
    "codes": "BTCUSDT,ETHUSDT"
  }
}
```

**订阅类协议 (100xx 系列)**

| 协议号 | 名称 | 类型 | 方向 | 说明 |
|--------|------|------|------|------|
| `10000` | Trade订阅请求 | 请求 | C→S | 订阅成交数据 |
| `10001` | Trade订阅响应 | 响应 | S→C | 订阅成功确认 |
| `10002` | Trade数据推送 | 推送 | S→C | 实时成交数据 |
| `10003` | Depth订阅请求 | 请求 | C→S | 订阅盘口数据 |
| `10004` | Depth订阅响应 | 响应 | S→C | 订阅成功确认 |
| `10005` | Depth数据推送 | 推送 | S→C | 实时盘口数据 |
| `10006` | Candles订阅请求 | 请求 | C→S | 订阅K线数据 |
| `10007` | Candles订阅响应 | 响应 | S→C | 订阅成功确认 |
| `10008` | Candles数据推送 | 推送 | S→C | 实时K线数据 |
| `10010` | 心跳请求 | 请求 | C→S | 保持连接活跃 |
| `10011` | 心跳响应 | 响应 | S→C | 心跳确认 |

**取消订阅类协议 (110xx 系列)**

| 协议号 | 名称 | 类型 | 方向 | 说明 |
|--------|------|------|------|------|
| `11000` | 取消Trade订阅 | 请求 | C→S | 取消该连接上**所有**Trade订阅 |
| `11001` | 取消Depth订阅 | 请求 | C→S | 取消该连接上**所有**Depth订阅 |
| `11002` | 取消Candles订阅 | 请求 | C→S | 取消该连接上**所有**Candles订阅 |
| `11010` | 取消订阅响应 | 响应 | S→C | 取消订阅成功确认 |

**多市场支持**:
| 市场类型 | business | 说明 | 产品示例 |
|---------|----------|------|----------|
| 股票市场 | `stock` | A股、港股、美股 | `000001.SZ`, `00700.HK`, `AAPL.US` |
| 数字币市场 | `crypto` | BTC、ETH等 | `BTCUSDT`, `ETHUSDT` |
| 外汇期货 | `common` | 外汇、期货等 | `EURUSD`, `GC` |

> 💡 **提示**：
> - 客户端可在每个订阅请求中指定不同的 `business`
> - 服务器会按需创建对应市场的 Infoway 连接
> - 不传 `business` 时默认使用 `crypto`（向后兼容）

**服务器 → 客户端（响应）**:
```json
{
  "type": "subscribed",
  "data": "加密后的Base64字符串"
}
```

**data 解密后（Infoway 透传格式）**:
```json
{
  "code": 10001,           // 订阅成功响应码
  "trace": "uuid",         // 与请求对应
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "status": "subscribed",
      "infowaySubId": "sub_12345"
    }
  ],
  "subscribedAt": 1760090001000
}
```

**实时数据推送（完全透传 Infoway 数据）**:
```json
{
  "type": "data",
  "data": "加密后的Base64字符串"
}
```

**data 解密后（Infoway 原始推送格式）**:
```json
{
  "code": 20000,           // Infoway 推送码
  "data": {
    "s": "BTCUSDT",        // symbol
    "p": 50000.5,          // price
    "v": 1.25,             // volume
    "t": 1760090000        // timestamp
  }
}
```

> ⚠️ **重要**：实时数据是 **完全透传** Infoway 的原始格式，客户端可直接参考 [Infoway 官方文档](https://docs.infoway.io) 解析数据结构。

#### 5. 消息类型说明

| 类型 | 方向 | 说明 | 数据加密 |
|-----|------|------|---------|
| `auth` | 客户端→服务器 | 首次消息认证（浏览器兼容模式） | ❌ 明文 |
| `auth_required` | 服务器→客户端 | 要求客户端认证 | ❌ 明文 |
| `auth_success` | 服务器→客户端 | 认证成功 | ❌ 明文 |
| `auth_failed` | 服务器→客户端 | 认证失败 | ❌ 明文 |
| `connected` | 服务器→客户端 | 连接建立成功，返回 sessionId | ✅ 加密 |
| `subscribe` | 客户端→服务器 | 订阅指定市场/产品（Infoway协议） | ✅ 加密 |
| `subscribed` | 服务器→客户端 | 订阅成功确认 | ✅ 加密 |
| `unsubscribe` | 客户端→服务器 | 取消订阅 | ✅ 加密 |
| `unsubscribed` | 服务器→客户端 | 取消订阅确认 | ✅ 加密 |
| `data` | 服务器→客户端 | 实时数据推送（Infoway原始数据） | ✅ 加密 |
| `ping` | 客户端→服务器 | 心跳检测 | ✅ 加密 |
| `pong` | 服务器→客户端 | 心跳响应 | ✅ 加密 |
| `error` | 服务器→客户端 | 错误消息 | ❌ 明文 |

> 💡 **说明**：认证相关消息为明文传输，认证成功后的所有消息均加密传输。

#### 6. WebSocket 错误码说明

| 错误码 | 说明 | 触发场景 |
|-------|------|---------|
| `4000` | 无效的消息格式 | JSON解析失败或缺少必需字段 |
| `4001` | 鉴权失败 | 用户不存在、签名错误、时间戳过期 |
| `4002` | 签名验证失败 | MD5签名不匹配 |
| `4003` | 订阅数量超限 | 超过最大订阅数（当前未启用） |
| `4004` | 无活跃订阅 | 尝试取消不存在的订阅 |
| `5000` | 服务器内部错误 | 系统异常或Infoway连接失败 |

> 💡 **说明**：错误消息为明文传输，便于客户端调试。

#### 7. 完整使用示例（Infoway 协议 + 多市场）

详见 [websocket-test.html](./websocket-test.html)

#### 8. 测试 WebSocket 功能

```bash
# 测试 Infoway 协议透传
docker exec ice-markets-app-dev node tests/test-infoway-protocol.js
```

#### 9. 部署要求

WebSocket 功能**开箱即用**，只需满足以下条件：

1. **`i_user` 表中存在测试用户**（用于身份验证）
2. **WebSocket 数据库表已创建**（见 `schema-websocket.sql`）
3. **配置 Infoway API Key**（用于接入真实数据）

**初始化数据库表**：
```bash
# 开发环境
docker exec -i ice-markets-db-dev mysql -uroot -pP@ssw0rd ice_markets < schema-websocket.sql

# 生产环境（外部 MySQL）
mysql -h your-db-host -u root -p your_database < schema-websocket.sql
```

**无需额外配置**：
- ❌ 不需要配置 `ws_subscription_permission` 表（简化版）
- ✅ 所有已鉴权用户可订阅任意市场/产品
- ✅ 不限制订阅数量
- ✅ 支持多市场（stock/crypto/common）按需连接

> 💡 **生产环境友好**：WebSocket 只做用户身份验证，不做细粒度权限控制，降低客户配置成本。

#### 10. 配置说明

在 `.env` 文件中配置：

```bash
# WebSocket 服务端口
WS_PORT=8080

# Infoway 外部数据源配置
INFOWAY_API_KEY=your_infoway_api_key
```

**Infoway 数据源说明**：
- **用途**：接入真实行情数据（股票、数字币、外汇期货）
- **API Key**：从 [Infoway 官网](https://www.infoway.io) 获取
- **统一地址**：`wss://data.infoway.io/ws`（无需配置）
- **多市场支持**：通过 URL 参数 `business` 区分不同市场
  - `business=stock` - 股票市场
  - `business=crypto` - 数字币市场
  - `business=common` - 外汇期货市场
- **自动连接**：服务器根据客户端订阅请求，按需创建对应市场的连接
- **开发环境**：如未配置 API Key，订阅会成功但收不到实际数据推送

**多市场使用示例**：
```javascript
// 订阅数字币市场
{
  "code": 10000,
  "trace": "uuid",
  "business": "crypto",  // 指定数字币市场
  "data": { "codes": "BTCUSDT" }
}

// 订阅股票市场
{
  "code": 10000,
  "trace": "uuid",
  "business": "stock",   // 指定股票市场
  "data": { "codes": "000001.SZ" }
}

// 订阅外汇市场
{
  "code": 10000,
  "trace": "uuid",
  "business": "common",  // 指定外汇期货市场
  "data": { "codes": "EURUSD" }
}
```

#### 11. 生产环境配置（SSL）

**Nginx 配置示例**:
```nginx
# WebSocket 代理（SSL）
location /infoway-websocket {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

**客户端连接（SSL）**:
```javascript
const ws = new WebSocket('wss://your-domain.com/infoway-websocket', { headers });
```

#### 12. 数据库表结构

WebSocket 功能使用以下数据库表：

| 表名 | 用途 | 是否必需 |
|-----|------|---------|
| `ws_connection_logs` | 连接日志 | ✅ |
| `ws_active_subscriptions` | 活跃订阅 | ✅ |
| `ws_infoway_subscriptions` | Infoway 订阅聚合 | ✅ |
| `ws_subscription_permission` | 订阅权限控制 | ❌（简化版不使用） |

**创建表**：见 `schema-websocket.sql`

#### 13. 性能优化

- **订阅聚合**：多个客户端订阅同一产品时，只向 Infoway 发起一次订阅
- **智能分发**：根据订阅关系，精准推送数据到对应客户端
- **心跳保活**：自动检测连接状态，清理僵尸连接
- **断线重连**：客户端需实现断线重连逻辑
- **多市场按需连接**：根据实际订阅动态创建 Infoway 连接，节省资源
- **订阅键优化**：`business:code:symbol` 格式避免不同市场产品冲突

---

## 📦 版本管理

### 当前版本
- **版本号**: `0.4.0`
- **版本类型**: 功能版本（Infoway 多市场支持）
- **更新日期**: 2025-10-12

### 版本更新规则
- **PATCH版本** (0.1.0 → 0.1.1): Bug修复
- **MINOR版本** (0.1.0 → 0.2.0): 新功能添加
- **MAJOR版本** (0.1.0 → 1.0.0): 重大架构变更

### 版本更新方法
```bash
# 查看当前版本
./update-version.sh show

# 更新版本
./update-version.sh patch   # 修复版本 (0.1.1 → 0.1.2)
./update-version.sh minor   # 功能版本 (0.1.1 → 0.2.0)
./update-version.sh major   # 重大版本 (0.1.1 → 1.0.0)
```

### 版本历史
详见 [CHANGELOG.md](./CHANGELOG.md)

## 环境配置

### 🔧 开发环境 vs 生产环境

| 特性 | 开发环境 | 生产环境 |
|------|---------|---------|
| **启动方式** | `./restart-dev.sh` | `./restart-prod.sh` |
| **配置文件** | `docker-compose.yml --env-file .env.dev` | `docker-compose.yml --env-file .env.prod` |
| **Dockerfile** | `Dockerfile` (统一) | `Dockerfile` (统一) |
| **环境变量** | `.env.dev` | `.env.prod` |
| **代码更新** | rebuild镜像 (~5-10秒) | rebuild镜像 (~5-10秒) |
| **依赖安装** | 完整依赖 | 完整依赖 |
| **日志级别** | debug | info |
| **数据库** | Docker MySQL容器 | 外部MySQL |

### 🔧 开发环境管理

**推荐使用一键启动脚本**：
```bash
# 一键启动开发环境
./start-dev.sh
```

**手动启动开发环境**：
```bash
# 启动开发环境
docker compose --env-file .env.dev up -d --build

# 查看日志（实时监控）
docker compose --env-file .env.dev logs -f db
docker compose --env-file .env.dev logs -f app

# 停止开发环境
docker compose --env-file .env.dev down
```

**修改代码后**：
```bash
# 重新构建并启动（约5-10秒）
docker compose --env-file .env.dev up -d --build
```

**开发环境特性**：
- ✅ 统一的Dockerfile，与生产环境一致
- ✅ 内置MySQL容器，无需外部数据库
- ✅ 快速构建（利用Docker缓存，~5-10秒）
- ✅ 完整的测试套件

### 🧪 测试功能

**容器内测试**：
```bash
# 基础功能测试
docker exec ice-markets-app-dev node tests/test-crypto.js
```

测试工具会验证：
- ✅ 服务健康状态（/health 接口）
- ✅ 数据库连接状态
- ✅ 加解密功能正确性
- ✅ 接口调用和响应解密
- ✅ 生成可用的 curl 测试命令

## 生产环境部署

### 1. 服务器初始化
执行 `setup-vps-complete.sh` 完成系统安全加固、MySQL 8.0 安装与调优。

### 2. 准备数据库
```bash
# 在生产 MySQL 执行
mysql -u root -p < schema.sql
```

### 3. 快速开始
```bash
# 启动
docker compose --env-file .env.prod up --build -d
# 查看日志
docker compose --env-file .env.prod logs -f app
# 停止
docker compose --env-file .env.prod down
```

### 4. 配置域名与 SSL
```bash
# 1. 将域名 A 记录指向服务器 IP
# 2. 运行配置脚本
./setup-nginx-ssl.sh your-domain.com your-email@example.com
```

### 5. 测试服务（域名）
```bash
# 容器内测试
docker exec ice-markets-app-prod node tests/test-crypto.js --endpoint 'https://api.your-domain.com' --userAccount 'ICE00000001' --apiKey 'CE7AE5AB11B23D16F55FF1C64FAD4E3E' --interfaceId 'I00001' --params '{}' --sign 'HJGFD'
```

## VPS维护
```bash
#!/bin/sh
set -e
set -x

#删除未使用的镜像
docker image prune -a
#删除未使用的容器
docker container prune
#删除未使用的卷和网络
docker volume prune
docker network prune
#清理未使用的镜像、容器、卷和网络
docker system prune -a --volumes -f

# 设置自动清理
crontab -e
# 0 3 * * * /usr/bin/docker system prune -a --volumes -f > ~/docker-system-prune.log 2>&1
/usr/bin/docker system prune -a --volumes -f > ~/docker-system-prune.log 2>&1
cat ~/docker-system-prune.log
```

## SFTP 静态文件服务

### 功能特性

提供安全的SFTP文件上传和HTTP静态文件访问服务：

- **SFTP上传**：通过SFTP客户端上传文件到指定目录
- **HTTP访问**：通过HTTPS访问上传的静态文件
- **目录支持**：支持多级子目录结构
- **安全限制**：禁止执行脚本，只允许静态文件访问
- **SSL加密**：全站HTTPS访问，自动SSL证书管理

### 部署方法

```bash
# 部署SFTP静态文件服务
./setup-sftp-static.sh sftp.your-domain.com
```

### 服务配置

**SFTP连接信息**：
- 服务器：`sftp.your-domain.com`
- 用户名：`sftpuser`
- 密码：`Sftp2024!Secure#Files`
- 上传目录：`/uploads/`

**HTTP访问地址**：
- 基础URL：`https://sftp.your-domain.com/uploads/`
- 示例：上传 `abc.html` → 访问 `https://sftp.your-domain.com/uploads/abc.html`
- 子目录：上传 `images/logo.png` → 访问 `https://sftp.your-domain.com/uploads/images/logo.png`

### 使用示例

#### 1. SFTP连接
```bash
# 命令行连接
sftp sftpuser@sftp.your-domain.com

# 上传文件
put localfile.html /uploads/
put image.png /uploads/images/

# 创建目录
mkdir /uploads/docs
mkdir /uploads/images/icons
```

#### 2. 文件访问
```bash
# 直接访问文件
curl https://sftp.your-domain.com/uploads/test.html

# 访问子目录文件
curl https://sftp.your-domain.com/uploads/images/logo.png
```

### 安全特性

- **用户隔离**：SFTP用户被限制在指定目录，无法访问系统文件
- **脚本禁止**：禁止执行 `.php`, `.pl`, `.py`, `.jsp`, `.asp`, `.sh`, `.cgi` 等脚本
- **隐藏文件保护**：禁止访问以 `.` 开头的隐藏文件
- **SSL加密**：全站HTTPS，自动证书续期
- **访问日志**：记录所有访问请求

### 管理命令

```bash
# 查看上传文件
ls -la /var/www/sftp-files/uploads/

# 重启SSH服务
sudo systemctl restart ssh

# 重载Nginx配置
sudo systemctl reload nginx

# 查看SSL证书
sudo certbot certificates

# 手动续期证书
sudo certbot renew
```

## 技术栈

- **运行时**：Node.js 18+ (ES Modules)
- **框架**：Express.js + 中间件架构
- **实时通信**：WebSocket (ws 库)
- **数据库**：MySQL 8.0 + mysql2 驱动
- **文件上传**：Multer + UUID
- **安全**：AES-128-CBC + MD5 签名 + 参数绑定
- **容器化**：Docker + Docker Compose
- **代理**：Nginx + Let's Encrypt SSL
- **日志**：Pino 结构化日志
- **校验**：AJV JSON Schema

## 运维操作指南

### 🔄 开发环境管理

#### 启动开发环境

**方式一：使用启动脚本（推荐用于干净启动）**
```bash
./start-dev.sh
```
- 停止现有容器
- 完全重新构建镜像（`--no-cache`）
- 启动新容器并显示状态
- 适合：依赖更新、Dockerfile 修改、排查缓存问题

**方式二：直接使用 docker compose（推荐用于日常开发）**
```bash
docker compose --env-file .env.dev up -d --build
```
- 利用缓存，构建速度快（~5秒 vs ~25秒）
- 增量构建，只重建变化的层
- 适合：代码小改动、快速重启

#### 开发环境特性

**统一的Dockerfile**：
- 开发和生产环境使用相同的Dockerfile
- 确保环境一致性，避免"我这里能跑，生产不行"
- 包含完整依赖（测试工具等）

**修改代码后**：
```bash
# 快速重建（利用Docker缓存，约5-10秒）
docker compose --env-file .env.dev up -d --build
```

**查看实时日志**：
```bash
docker compose --env-file .env.dev logs -f app
```

**停止开发环境**：
```bash
docker compose --env-file .env.dev down
```

---

### 🚀 生产环境管理

#### 方案对比

| 操作方式 | 命令 | 中断时间 | 应用代码 | 使用场景 |
|---------|------|---------|---------|---------|
| **快速重启** | `restart app` | 3-5秒 | ❌ | 环境变量修改、容器异常 |
| **重新部署** ⭐ | `up -d --build` | 5-15秒 | ✅ | 代码更新、日常发布 |
| **完全重建** | `down + build --no-cache` | 25-35秒 | ✅ | 缓存问题、重大升级 |

#### 1️⃣ 快速重启（仅重启容器）

```bash
docker compose --env-file .env.prod restart app
```

**执行流程：**
1. 发送 SIGTERM 信号给容器
2. 等待容器优雅关闭（10秒超时）
3. 重新启动同一个容器

**适用场景：**
- ✅ 修改了环境变量（`.env.prod`）
- ✅ 容器状态异常需要重启
- ✅ 内存泄漏需要清理
- ❌ 代码有更新
- ❌ 依赖有变化

**影响：**
- ✅ 保留所有数据（Volume 不变）
- ✅ 容器 ID 不变
- ✅ 网络配置不变
- ❌ 服务中断 3-5 秒
- ❌ 所有活跃连接断开

---

#### 2️⃣ 重新部署（推荐用于代码更新）⭐

```bash
# 拉取最新代码
git pull

# 重新部署
docker compose --env-file .env.prod up -d --build

# 观察启动情况
docker logs -f ice-markets-app-prod 

# 验证部署
./verify-deployment.sh
```

**执行流程：**
1. 检查代码变化
2. 如有变化，重新构建镜像（利用缓存）
3. 停止旧容器
4. 删除旧容器
5. 创建新容器并启动

**适用场景：**
- ✅ 代码有更新（**最常用**）
- ✅ 版本升级部署
- ✅ Dockerfile 修改
- ✅ 依赖更新（`package.json`）
- ✅ 常规发布流程

**耗时：**
- 无代码变化：~5-8 秒
- 有代码变化：~10-15 秒
- 依赖更新：~20-30 秒

**影响：**
- ✅ 保留所有数据（Volume 不变）
- ✅ 应用最新代码
- ✅ 支持滚动更新（如配置多副本）
- ❌ 服务中断 5-15 秒
- ❌ 所有活跃连接断开
- ❌ 容器 ID 改变

---

#### 3️⃣ 完全重建（用于排查问题）

```bash
# 停止并删除容器
docker compose --env-file .env.prod down

# 完全重新构建（不使用缓存）
docker compose --env-file .env.prod build --no-cache

# 启动容器
docker compose --env-file .env.prod up -d

# 查看日志
docker logs -f ice-markets-app-prod
```

**适用场景：**
- ✅ 遇到缓存导致的异常
- ✅ 版本发布前最终验证
- ✅ 环境不一致需要修复
- ✅ 重大版本升级
- ❌ 日常部署（太慢）
- ❌ 热修复（中断时间长）

**影响：**
- ✅ 保留所有数据（Volume 不变）
- ✅ 完全干净的环境
- ❌ 服务中断 25-35 秒
- ❌ 所有活跃连接断开
- ❌ 构建耗时较长

---

### 📊 部署验证

每次部署后，运行验证脚本确保环境一致：

```bash
./verify-deployment.sh
```

**验证内容：**
- ✅ 版本号一致性（本地/Dev/生产）
- ✅ 文件哈希对比（25个核心文件）
- ✅ Git 提交信息
- ✅ Docker 镜像构建时间
- ✅ 容器运行状态

---

### ⚠️ 重要提醒

#### 数据安全
- ✅ **Volume 数据永远保留**（除非明确删除）
- ✅ 数据库文件在 Volume 中
- ✅ 上传文件在 `ice-markets-uploads-prod` 中

#### 服务中断
- ⚠️ 任何操作都会导致服务短暂中断
- ⚠️ 中断期间所有请求会失败
- ⚠️ 客户端需要实现重试机制

#### 生产最佳实践
- 📅 在维护窗口期执行
- 📢 提前通知用户
- 🔙 准备回滚方案
- 📊 监控服务恢复情况
- 💾 保持镜像备份

#### 零停机部署（进阶方案）
如需实现零停机部署，需要：
- 使用多副本 + 负载均衡
- 实现蓝绿部署或金丝雀发布
- 使用滚动更新策略
- 需要额外的基础设施支持

---

### 🔍 常用运维命令

#### 查看容器状态
```bash
# 查看所有容器
docker ps

# 查看开发环境
docker compose --env-file .env.dev ps

# 查看生产环境
docker compose --env-file .env.prod ps
```

#### 查看日志
```bash
# 实时日志（开发）
docker compose --env-file .env.dev logs -f app

# 实时日志（生产）
docker logs -f ice-markets-app

# 最近 100 行日志
docker logs --tail 100 ice-markets-app
```

#### 进入容器
```bash
# 开发环境
docker exec -it ice-markets-app-dev sh

# 生产环境
docker exec -it ice-markets-app-prod sh
```

#### 数据备份
```bash
# 备份开发环境上传文件
docker run --rm -v ice-markets-uploads-dev:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-dev-backup-$(date +%Y%m%d).tar.gz /data

# 备份生产环境上传文件
docker run --rm -v ice-markets-uploads-prod:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-prod-backup-$(date +%Y%m%d).tar.gz /data
```

#### 数据恢复
```bash
# 创建新 volume（如果不存在）
docker volume create ice-markets-uploads-prod

# 恢复数据
docker run --rm -v ice-markets-uploads-prod:/data -v $(pwd):/backup alpine \
  tar xzf /backup/uploads-prod-backup-20251011.tar.gz -C /
```

#### 清理资源
```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的卷
docker volume prune

# 完全清理（谨慎使用）
docker system prune -a --volumes
```

#### WebSocket 状态监控
```bash
# 使用脚本查询（推荐）
./check-websocket-status.sh dev   # 开发环境
./check-websocket-status.sh prod  # 生产环境

# 直接 API 调用
curl http://localhost:3000/infoway-ws-status | jq .  # 开发环境
curl http://localhost:3001/infoway-ws-status | jq .  # 生产环境
```

**返回信息包括：**
- **服务器统计**：总连接数、活跃连接、总消息数、错误数、运行时间
- **Infoway客户端状态**：各市场类型的连接状态和订阅数
- **连接详情**：每个用户的会话ID、连接时间、消息数、订阅数
- **订阅详情**：每个订阅的产品代码、市场类型、客户端数量
- **用户订阅汇总**：按用户汇总的订阅产品列表和统计信息

**示例输出：**
```json
{
  "status": "ok",
  "timestamp": "2025-10-13T02:45:39.177Z",
  "connections": {
    "total": 2,
    "list": [
      {
        "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        "userAccount": "user123",
        "connectedAt": 1760323400000,
        "messageCount": 45,
        "subscriptions": 3,
        "isAlive": true
      }
    ]
  },
  "subscriptions": {
    "total": 2,
    "totalSessions": 2,
    "list": [
      {
        "key": "10001:BTCUSDT",
        "business": "crypto",
        "code": 10001,
        "symbol": "BTCUSDT",
        "clients": 2,
        "infowaySubId": "10001:BTCUSDT"
      }
    ]
  },
  "userSubscriptions": [
    {
      "userAccount": "user123",
      "products": ["BTCUSDT", "ETHUSDT"],
      "productCount": 2,
      "sessionCount": 1,
      "totalMessages": 45,
      "connectedAt": 1760323400000
    }
  ]
}
```

---

## 后续路线图

### ✅ 已完成功能 (v0.6.2)

**核心功能**:
- ✅ 超级接口（元数据驱动SQL执行）
- ✅ 文件管理（上传/下载/临时令牌/MD5校验）
- ✅ WebSocket实时推送（Infoway协议透传，多市场支持）
- ✅ AES/DES双向加密
- ✅ MD5签名鉴权
- ✅ 参数校验（JSON Schema）
- ✅ 用户注册与权限管理

**开发运维**:
- ✅ Docker容器化部署
- ✅ 统一Dockerfile（开发生产一致）
- ✅ 完整测试套件（7个测试脚本）
- ✅ 结构化日志（Pino）
- ✅ 部署验证脚本
- ✅ WebSocket测试页面

**安全机制**:
- ✅ 时间戳验证（防重放攻击）
- ✅ SQL注入防护（参数绑定）
- ✅ 危险操作拦截（DROP/ALTER等）
- ✅ 分页保护（自动LIMIT）

### 🎯 近期规划 (v0.7.x)

**性能优化**:
- [ ] Redis缓存层（热点数据缓存）
- [ ] API限流与熔断（令牌桶算法）
- [ ] 响应压缩（gzip）
- [ ] 连接池监控与自动扩容

**监控增强**:
- [ ] Prometheus + Grafana集成
- [ ] WebSocket连接监控面板
- [ ] 分布式链路追踪（Jaeger/Zipkin）
- [ ] 审计日志持久化

### 🚀 中期规划 (v1.0.x)

**功能扩展**:
- [ ] 管理后台（Web界面）
- [ ] 多数据源路由（读写分离）
- [ ] 批量操作支持
- [ ] 数据导出（CSV/Excel）
- [ ] GraphQL网关

**安全加固**:
- [ ] AES-256-GCM升级
- [ ] API访问频率限制（用户/IP级别）
- [ ] JWT令牌支持
- [ ] 多因子认证（TOTP）

**开发体验**:
- [ ] Swagger API文档自动生成
- [ ] 接口Mock工具
- [ ] 性能分析工具

### 📝 优化建议

**当前系统已满足以下场景**:
- ✅ 企业级API网关
- ✅ 实时数据推送系统
- ✅ 安全的文件存储服务
- ✅ 多租户SaaS应用后端

**适合扩展的方向**:
- 📊 数据分析与报表系统
- 🔄 ETL数据处理平台
- 🎮 实时游戏后端
- 💬 即时通讯系统

---

## 📊 Trade 数据监控系统 v3.0

### 1. 功能概述

Trade 监控系统提供自动化的市场价格监控能力，支持动态订阅管理和客户自定义业务逻辑。

**核心特性**：
- ✅ **动态订阅管理**：通过数据库表配置，无需重启服务
- ✅ **增量检查**：每1秒检查订阅变更，实时生效
- ✅ **存储过程驱动**：业务逻辑完全由客户自定义
- ✅ **共享 Infoway 连接**：与 WebSocket 服务共享连接，自动聚合订阅
- ✅ **开箱即用**：提供默认存储过程，可直接使用或重写

### 2. 架构设计

```
Trade Monitor（虚拟用户）
    ↓
subscriptionManager（订阅聚合）
    ↓
Infoway 连接（共享）
    ↓
dataForwarder（数据回调）
    ↓
handleTradeData（处理逻辑）
    ↓
sp_process_trade_data（存储过程）
    ↓
客户业务逻辑（止损止盈、开平仓等）
```

**关键设计**：
- 作为 `sessionId='TRADE_MONITOR'` 虚拟用户接入系统
- 复用现有的 `subscriptionManager` 订阅聚合能力
- 通过 `dataForwarder` 的监听器接收数据回调
- 支持增量检查（`updated_at > lastCheckTime`）

### 3. 数据库设计

#### 3.1 trade_subscriptions（订阅配置表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT | 订阅ID |
| `symbol` | VARCHAR(32) | 品种代码（如 EURUSD, XAUUSD） |
| `business` | VARCHAR(16) | 市场类型（common/crypto/stock） |
| `enabled` | TINYINT(1) | 启用状态（1=监控中, 0=已停止） |
| `description` | VARCHAR(200) | 订阅描述 |
| `notes` | TEXT | 备注信息 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间（增量检查关键字段） |

**索引**：
- `UNIQUE(symbol)` - 一个品种一条记录
- `INDEX(enabled)` - 快速查询
- `INDEX(updated_at)` - 增量检查

#### 3.2 trade_ticks（逐笔数据表）

| 字段 | 类型 | 说明 | Infoway 对应 |
|------|------|------|-------------|
| `id` | BIGINT | 主键 | - |
| `symbol` | VARCHAR(32) | 品种代码 | data.s |
| `price` | DECIMAL(20,8) | 成交价格 | data.p |
| `volume` | DECIMAL(20,8) | 成交量 | data.v |
| `direction` | TINYINT | 方向（1=买, 2=卖） | data.td |
| `trade_time` | BIGINT | Infoway时间戳（秒） | data.t |
| `received_at` | TIMESTAMP(3) | 本地接收时间 | - |

**自动清理**：5小时前的数据自动删除

#### 3.3 sp_process_trade_data（存储过程）

**标准签名**（客户必须遵守）：
```sql
CREATE PROCEDURE sp_process_trade_data(
  IN p_symbol VARCHAR(32),
  IN p_price DECIMAL(20,8)
)
```

**默认实现**：
- 保存到 `trade_ticks` 表
- 自动清理 5 小时前的数据

**客户可重写**：
```sql
-- 示例：止损止盈监控
CREATE PROCEDURE sp_process_trade_data(
  IN p_symbol VARCHAR(32),
  IN p_price DECIMAL(20,8)
)
BEGIN
  -- 查询持仓信息
  SELECT pId, stopLoss, takeProfit
  INTO @position_id, @stop_loss, @take_profit
  FROM i_positions
  WHERE itemId = p_symbol AND deleted = 0
  LIMIT 1;
  
  -- 止损判断
  IF @stop_loss IS NOT NULL AND p_price <= @stop_loss THEN
    -- 触发止损逻辑
    UPDATE i_positions SET deleted = 1 
    WHERE pId = @position_id;
  END IF;
  
  -- 止盈判断
  IF @take_profit IS NOT NULL AND p_price >= @take_profit THEN
    -- 触发止盈逻辑
    UPDATE i_positions SET deleted = 1 
    WHERE pId = @position_id;
  END IF;
END;
```

### 4. 部署流程

#### 步骤 1：系统初始化

```bash
# 开发环境（已自动执行）
docker exec -i ice-markets-db-dev mysql -uroot -proot_password ice_markets < schema-trade-monitor.sql

# 生产环境（外部 MySQL）
mysql -h your-db-host -u root -p ice_markets < schema-trade-monitor.sql
```

#### 步骤 2：客户定制

```bash
# Customer A（外汇客户）
mysql -u root -p ice_markets < init-trade-subscriptions-customer-a.sql

# Customer B（加密货币客户）
mysql -u root -p ice_markets < init-trade-subscriptions-customer-b.sql
```

#### 步骤 3：验证

```bash
# 查看订阅配置
mysql -u root -p ice_markets -e "SELECT * FROM trade_subscriptions WHERE enabled = 1;"

# 查询监控状态
curl http://localhost:3001/trade-monitor-status | jq .
```

### 5. 使用指南

#### 5.1 添加新订阅

```sql
INSERT INTO trade_subscriptions (symbol, business, enabled, description) 
VALUES ('GBPUSD', 'common', 1, '英镑/美元');
```
→ 1秒内自动生效，无需重启

#### 5.2 禁用订阅

```sql
UPDATE trade_subscriptions 
SET enabled = 0 
WHERE symbol = 'EURUSD';
```
→ 1秒内自动取消订阅

#### 5.3 重新启用

```sql
UPDATE trade_subscriptions 
SET enabled = 1 
WHERE symbol = 'EURUSD';
```
→ 1秒内自动重新订阅

#### 5.4 查询最新价格

```sql
-- 查询最新 100 条 Trade 数据
SELECT * FROM trade_ticks 
ORDER BY received_at DESC 
LIMIT 100;

-- 查询特定品种的最新价格
SELECT * FROM trade_ticks 
WHERE symbol = 'EURUSD' 
ORDER BY received_at DESC 
LIMIT 10;
```

### 6. API 监控端点

**GET /trade-monitor-status**

返回示例：
```json
{
  "status": 1,
  "code": "success",
  "data": {
    "startTime": 1761112051032,
    "totalReceived": 48819,
    "totalProcessed": 48818,
    "totalErrors": 0,
    "totalChecks": 3600,
    "lastReceivedTime": 1761115777210,
    "lastProcessedSymbol": "XAUUSD",
    "lastPrice": "4156.06",
    "uptime": 3726191,
    "uptimeFormatted": "1h 2m 6s",
    "symbols": ["EURUSD", "EURGBP", "XAUUSD", "XTIUSD"],
    "symbolCount": 4,
    "successRate": "100.00%",
    "errorRate": "0.00%",
    "avgProcessingRate": "13.10 msg/s"
  }
}
```

### 7. 测试

```bash
# 在 Docker 容器中运行测试
docker exec ice-markets-app-dev node tests/test-trade-monitor.js
```

### 8. v3.0 优化要点

| 特性 | v1.0（旧版） | v3.0（当前）✅ |
|------|-------------|---------------|
| **数据源** | `i_item_type`（客户表） | `trade_subscriptions`（系统表） |
| **表名** | - | 简洁（18字符） |
| **动态管理** | ❌ 需重启 | ✅ 增量检查（1秒） |
| **数据表** | - | `trade_ticks`（行业标准） |
| **Infoway匹配** | 部分 | ✅ 完整（含 trade_time） |
| **自动清理** | 1小时 | 5小时 |
| **存储过程** | (symbol, price) | (symbol, price) |

**优势**：
1. ✅ 表结构更简洁（8个字段）
2. ✅ 完全独立于客户表
3. ✅ 支持动态订阅管理
4. ✅ 完整匹配 Infoway 数据格式
5. ✅ 向后兼容 v1.0 存储过程签名

**详细文档**：
- 📚 `docs/trade-monitor-design-v3.md` - 完整设计文档
- 📚 `docs/trade-monitor-versions.md` - 版本对比

---

## License

本项目为示例代码，请根据组织策略添加适当的 License。
