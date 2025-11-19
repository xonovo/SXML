/**
 * Super API Interface
 * 依赖: jQuery.js, aes.js (提供 Encrypt/Decrypt 异步函数), md5.js (提供 hex_md5_utf 或 md5)
 * 说明: 需要在页面中先加载 md5.js 与 aes.js；基础 APIKey 存储在 sessionStorage['k']（32 字节），
 * 动态加密 Key = MD5(APIKey + x-timestamp).toUpperCase()
 * IV 从基础 APIKey 中按当天星期几(0-6)偏移取 12 字节（若不足则循环拼接取够长度）
 * 2025-10-31
 */

// API配置
const SAPI_CONFIG = {
    // 基础域名配置（优先使用 config.js 中的 API_CONFIG.BASE_URL）
    BASE_URL: (typeof window !== 'undefined' && window.API_CONFIG && window.API_CONFIG.BASE_URL)
        ? window.API_CONFIG.BASE_URL
        : '',
    // 统一接口路径
    API_PATH: '/supper-interface',
    // 请求超时时间（毫秒）
    TIMEOUT: 30000,
    // 重试次数
    RETRY_TIMES: 2,
    // 重试延迟（毫秒）
    RETRY_DELAY: 1000
};

// 请求计数器
let requestCounter = 0;

/**
 * 生成请求头
 * @param {string} userAccount - 用户账号
 * @returns {Object} 请求头对象
 */
function generateHeaders(userAccount, timestamp) {
    // timestamp 由调用方传入，保证加密 key 与头部使用同一时间
    return {
        'x-user-account': userAccount || '',
        'x-crypto-mode': 'aes-gcm',
        'x-timestamp': timestamp || Date.now().toString(),
        'Content-Type': 'application/json'
    };
}

/**
 * AES加密数据
 * @param {Object|string} data - 需要加密的数据
 * @param {string} key - 加密密钥
 * @returns {Promise<string>} 加密后的数据
 */
async function encryptData(data, key, iv) {
    try {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        // 使用 aes.js 中的异步 Encrypt 函数，传入 iv
        return await Encrypt(jsonString, key, iv);
    } catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Data encryption failed');
    }
}

/**
 * AES解密数据
 * @param {string} encryptedData - 加密的数据
 * @param {string} key - 解密密钥
 * @returns {Promise<Object|string>} 解密后的数据
 */
async function decryptData(encryptedData, key, iv) {
    try {
        // 使用 aes.js 中的异步 Decrypt 函数
        const decrypted = await Decrypt(encryptedData, key, iv);
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption failed:', error);
        throw new Error('Data Decryption failed');
    }
}

/**
 * 请求重试处理
 * @param {Function} requestFn - 请求函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试延迟
 * @returns {Promise} 请求Promise
 */
async function retryRequest(requestFn, maxRetries = SAPI_CONFIG.RETRY_TIMES, delay = SAPI_CONFIG.RETRY_DELAY) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (i === maxRetries) break;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * 超级API类
 */
class SuperAPI {
    /**
     * 构造函数
     * @param {string} userAccount - 用户账号
     * @param {string} encryptKey - 加密密钥
     */
    constructor(userAccount, encryptKey) {
        this.userAccount = userAccount;
        this.encryptKey = encryptKey;
        this.baseUrl = SAPI_CONFIG.BASE_URL;
        this.requestId = 0;
    }

    /**
     * 设置基础URL
     * @param {string} url - 新的基础URL
     */
    setBaseUrl(url) {
        this.baseUrl = url;
    }

    /**
     * 生成请求ID
     * @returns {string} 请求ID
     */
    generateRequestId() {
        return `REQ_${Date.now()}_${++requestCounter}`;
    }

    /**
     * 发送请求
     * 新签名（推荐）：request(interfaceId, params, endpoint?, options?)
     * 兼容旧签名（已废弃）：request(interfaceId, sign, params, endpoint?, options?)
     * @param {string} interfaceId - 超级API接口路由ID
     * @param {Object|string} paramsOrSign - 新签名：params 对象；旧签名：sign 字符串
     * @param {string|Object} [endpointOrParams] - 新签名：endpoint；旧签名：params 对象
     * @param {Object} [options] - 额外的请求选项（新签名第四参 | 旧签名第五参）
     * @returns {Promise} 请求Promise
     */
    async request(interfaceId, paramsOrSign, endpointOrParams = null, options = {}) {
        const requestId = this.generateRequestId();

        // 参数验证
        if (!interfaceId || typeof interfaceId !== 'string') {
            const err = new Error('interfaceId is required and must be a string');
            if (typeof ShowToast === 'function') ShowToast(err.message, 'confirm');
            return Promise.reject(err);
        }

        // 解析参数，兼容旧签名
        let params = null;
        let endpoint = null;
        let localOptions = options || {};

        if (typeof paramsOrSign === 'object' && paramsOrSign !== null) {
            // 新签名：request(interfaceId, params, endpoint?, options?)
            params = paramsOrSign;
            if (typeof endpointOrParams === 'string' || endpointOrParams === null) {
                endpoint = endpointOrParams || null;
            } else if (typeof endpointOrParams === 'object' && endpointOrParams !== null) {
                // 支持用户把 options 作为第三个参数传入
                localOptions = endpointOrParams;
            }
        } else {
            // 旧签名：request(interfaceId, sign, params, endpoint?, options?)
            // 第三个参数必须是 params 对象
            params = endpointOrParams;
            // 第四参数可能是 endpoint
            const maybeEndpoint = arguments[3];
            const maybeOptions = arguments[4];
            endpoint = (typeof maybeEndpoint === 'string') ? maybeEndpoint : null;
            if (maybeOptions && typeof maybeOptions === 'object') localOptions = maybeOptions;
            // 不再使用传入的 sign，统一从 config 映射获取
            if (console && console.warn) console.warn('[SuperAPI] Deprecated: sign parameter is ignored. Sign is now resolved via config mapping.');
        }

        if (!params || typeof params !== 'object') {
            const err = new Error('params is required and must be an object');
            if (typeof ShowToast === 'function') ShowToast(err.message, 'confirm');
            return Promise.reject(err);
        }

        // 从 config 映射获取签名（API_CONFIG.SIGN_MAP）
        const signFromConfig = (typeof window !== 'undefined' && window.API_CONFIG && window.API_CONFIG.SIGN_MAP)
            ? (window.API_CONFIG.SIGN_MAP[interfaceId] || '')
            : '';

        // 组合成指定格式的请求数据
        const data = {
            interfaceId,
            sign: signFromConfig,
            params
        };

        // 使用当前时间戳作为 x-timestamp（13位）
        const timestamp = Date.now().toString();

        // 基础 API Key：优先使用构造函数传入的 encryptKey，否则从 sessionStorage['k'] 中读取
        const baseApiKey = this.encryptKey || (sessionStorage && (sessionStorage.getItem ? sessionStorage.getItem('k') : sessionStorage['k']));
        if (!baseApiKey) {
            const err = new Error('Base API key not found. Please provide encryptKey or set sessionStorage["k"]');
            if (typeof ShowToast === 'function') ShowToast(err.message, 'confirm');
            return Promise.reject(err);
        }

        // 动态Key：MD5(baseApiKey + timestamp) 的大写形式
        let md5Func = null;
        if (typeof hex_md5_utf === 'function') md5Func = hex_md5_utf;
        else if (typeof hex_md5 === 'function') md5Func = hex_md5;
        else if (typeof md5 === 'function') md5Func = md5;

        if (!md5Func) {
            const err = new Error('MD5 function not found. Ensure md5.js is loaded and exposes hex_md5_utf or md5.');
            if (typeof ShowToast === 'function') ShowToast(err.message, 'confirm');
            return Promise.reject(err);
        }

        const dynamicKey = md5Func(baseApiKey + timestamp).toUpperCase();

        // 生成 IV：根据GMT 0时区的星期几（0-6）跳过对应数量的字符，然后取12个字节作为IV
        const gmtDate = new Date(parseInt(timestamp, 10));
        // 使用 getUTCDay 获取 GMT 0时区的星期几
        const weekday = gmtDate.getUTCDay();
        let ivSource = dynamicKey;
        // 确保有足够长度的字符串（跳过weekday个字符后还需要12个字符）
        while (ivSource.length < weekday + 12) ivSource += baseApiKey;
        // 从第weekday+1个字符开始取12字节
        const iv = ivSource.substring(weekday, weekday + 12);

        // 用户账号：优先使用构造函数传入的 userAccount，否则从 sessionStorage['u'] 读取
        const effectiveUserAccount = this.userAccount || (
            (typeof sessionStorage !== 'undefined')
                ? (sessionStorage.getItem ? sessionStorage.getItem('u') : sessionStorage['u'])
                : ''
        ) || '';

        const headers = {
            ...generateHeaders(effectiveUserAccount, timestamp),
            'x-request-id': requestId,
            ...(localOptions.headers || {})
        };

        // 加密请求数据
        const encryptedData = await encryptData(data, dynamicKey, iv);
        // 计算请求 URL：支持三种情况
        // 1) endpoint 为空 -> 使用 `${baseUrl}${API_PATH}`
        // 2) endpoint 为完整 URL（http:// 或 https:// 或 //） -> 直接使用
        // 3) 其他 -> 确保以 '/' 开头后拼接到 API_PATH 之后
        let url;
        if (!endpoint) {
            url = `${this.baseUrl}${SAPI_CONFIG.API_PATH}`;
        } else if (/^(https?:)?\/\//i.test(endpoint)) {
            url = endpoint;
        } else {
            const ep = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            url = `${this.baseUrl}${SAPI_CONFIG.API_PATH}${ep}`;
        }

        const requestFn = () => {
            return new Promise((resolve, reject) => {
                $.ajax({
                    url: url,
                    method: 'POST',
                    headers: headers,
                    data: JSON.stringify({ data: encryptedData }),
                    timeout: SAPI_CONFIG.TIMEOUT,
                    // success 回调获取三个参数：data, textStatus, jqXHR
                    success: async (response, textStatus, jqXHR) => {
                        try {
                            // 服务器返回的时间戳优先级：响应头 x-timestamp -> 响应体中的 timestamp 字段 -> 本地请求 timestamp
                            let serverTimestamp = null;
                            try {
                                if (jqXHR && typeof jqXHR.getResponseHeader === 'function') {
                                    serverTimestamp = jqXHR.getResponseHeader('x-timestamp') || jqXHR.getResponseHeader('X-Timestamp');
                                }
                            } catch (e) {
                                // ignore
                            }
                            if (!serverTimestamp && response && (response.timestamp || response.ts)) {
                                serverTimestamp = response.timestamp || response.ts;
                            }
                            if (!serverTimestamp) {
                                // 回退到请求时使用的 timestamp
                                serverTimestamp = timestamp;
                                if (typeof ShowToast === 'function') {
                                    ShowToast('未从服务端获取时间戳，使用本地时间戳进行解密（可能失败）', 'confirm');
                                }
                            }

                            // 根据服务器时间戳生成解密用动态 key：MD5(baseApiKey + serverTimestamp).toUpperCase()
                            const serverDynamic = md5Func(baseApiKey + serverTimestamp).toUpperCase();
                            // 把32字节的字母从右到左重新排列得到解密用动态 key
                            const decryptKey = serverDynamic.split('').reverse().join('');

                            // 解密用 IV：使用 decryptKey 按服务端UTC时间对应的星期几跳过对应数量的字符后取12字节
                            const utcDate2 = new Date(parseInt(serverTimestamp, 10));
                            // 使用 getUTCDay 获取 UTC 时区的星期几
                            const weekday2 = utcDate2.getUTCDay();
                            let ivSource2 = decryptKey;
                            // 确保有足够长度的字符串
                            while (ivSource2.length < weekday2 + 12) ivSource2 += decryptKey;
                            // 从第weekday2+1个字符开始取12字节
                            const iv2 = ivSource2.substring(weekday2, weekday2 + 12);

                            const decryptedData = await decryptData(response.data, decryptKey, iv2);

                            // 统一处理服务器响应格式：{ status, data, ... }
                            // 如果 status === 1 且 data 存在，则提取 data 并处理数组格式
                            if (decryptedData && decryptedData.status === 1 && decryptedData.data) {
                                let extractedData = decryptedData.data;
                                // 如果 data 是数组且第一个元素存在，则取第一个元素
                                if (Array.isArray(extractedData) && extractedData[0]) {
                                    extractedData = extractedData[0];
                                }
                                resolve(extractedData);
                            } else {
                                // status 不为 1 或 data 不存在，返回完整的解密数据（由业务层处理错误）
                                resolve(decryptedData);
                            }
                        } catch (error) {
                            reject(error);
                        }
                    },
                    error: (jqXHR, textStatus, errorThrown) => {
                        reject(new Error(`请求失败: ${textStatus}`));
                    }
                });
            });
        };

        return retryRequest(requestFn).catch(err => {
            // 在页面上显示友好错误提示（如果可用），然后继续抛出错误以便调用方处理
            try {
                if (typeof ShowToast === 'function') {
                    ShowToast(err.message || '请求失败', 'confirm');
                }
            } catch (e) {
                // 忽略 ShowToast 内部错误
                console.error('ShowToast error:', e);
            }
            return Promise.reject(err);
        });
    }

    /**
     * 批量请求
     * @param {Array} requests - 请求数组，格式：[{ interfaceId, params, endpoint?, options? }, ...]，兼容旧字段 sign（将被忽略）
     * @param {Object} [options] - 全局额外的请求选项，会和每个请求的 options 合并
     * @returns {Promise} Promise数组
     */
    async batchRequest(requests, options = {}) {
        if (!Array.isArray(requests)) {
            throw new Error('Requests parameter must be an array');
        }

        return Promise.all(requests.map(req => {
            if (typeof req !== 'object' || !req.interfaceId || !req.params) {
                throw new Error('Each request must be an object with interfaceId and params properties');
            }
            return this.request(
                req.interfaceId,
                req.params,
                req.endpoint || null,
                { ...options, ...(req.options || {}) }
            );
        }));
    }
}

// 导出API实例创建函数
window.createSuperAPI = function (userAccount, encryptKey) {
    return new SuperAPI(userAccount, encryptKey);
};

window.SAPI_CONFIG = SAPI_CONFIG;