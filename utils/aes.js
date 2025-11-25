/**
 * Fixed IV and KEY AES Implementation
 * 使用固定IV和KEY的AES加密实现
 * 版本: 2.0.0
 * 更新日期: 2025-10-31
 */

class AESCrypto {
    constructor(key, iv) {
        this.key = key || "0123456789abcdef0123456789abcdef"; // 默认key 32字节
        this.iv = iv || "0123456789ab";  // 默认iv 12字节
    }

    static async importKey(key) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        return await crypto.subtle.importKey(
            "raw",
            keyData,
            "AES-GCM",
            false,
            ["encrypt", "decrypt"]
        );
    }
    // 静态加密方法
    static async encrypt(text, key, iv) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('当前浏览器不支持 WebCrypto 安全加密');
        }
        try {
            const encoder = new TextEncoder();
            const cryptoKey = await this.importKey(key);
            const ivBytes = encoder.encode(iv);

            const encrypted = await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: ivBytes
                },
                cryptoKey,
                encoder.encode(text)
            );

            return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
        } catch (error) {
            console.error("加密失败:", error);
            throw new Error("加密过程发生错误: " + error.message);
        }
    }
    // 静态解密方法
    static async decrypt(encryptedText, key, iv) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('当前浏览器不支持 WebCrypto 安全加密');
        }
        try {
            const decoder = new TextDecoder();
            const cryptoKey = await this.importKey(key);
            const ivBytes = new TextEncoder().encode(iv);
            const encryptedData = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));

            const decrypted = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: ivBytes
                },
                cryptoKey,
                encryptedData
            );

            return decoder.decode(decrypted);
        } catch (error) {
            console.error("解密失败:", error);
            throw new Error("解密过程发生错误: " + error.message);
        }
    }
    // 实例加密方法
    async encryptText(text) {
        return await AESCrypto.encrypt(text, this.key, this.iv);
    }
    // 实例解密方法
    async decryptText(encryptedText) {
        return await AESCrypto.decrypt(encryptedText, this.key, this.iv);
    }
}

// 全局加密函数
window.Encrypt = async function (data, key, iv) {
    return await AESCrypto.encrypt(data, key || "0123456789abcdef0123456789abcdef", iv || "0123456789ab");
};

// 全局解密函数
window.Decrypt = async function (encryptedData, key, iv) {
    return await AESCrypto.decrypt(encryptedData, key || "0123456789abcdef0123456789abcdef", iv || "0123456789ab");
};

// 导出模块
if (typeof module !== "undefined" && module.exports) {
    module.exports = AESCrypto;
} else {
    window.AESCrypto = AESCrypto;
}
