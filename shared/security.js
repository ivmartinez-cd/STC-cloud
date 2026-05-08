"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityUtils = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
class SecurityUtils {
    /**
     * Deriva una clave fuerte a partir de un Hardware ID usando PBKDF2 (Sección 9.1)
     */
    static async deriveKey(hardwareId, salt) {
        return new Promise((resolve, reject) => {
            crypto_1.default.pbkdf2(hardwareId, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, key) => {
                if (err)
                    reject(err);
                else
                    resolve(key);
            });
        });
    }
    /**
     * Cifra datos usando AES-256-GCM
     */
    static async encrypt(data, secret) {
        const salt = crypto_1.default.randomBytes(SALT_LENGTH);
        const iv = crypto_1.default.randomBytes(IV_LENGTH);
        const key = await this.deriveKey(secret, salt);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
    }
    /**
     * Descifra datos cifrados con AES-256-GCM
     */
    static async decrypt(encryptedBase64, secret) {
        const data = Buffer.from(encryptedBase64, 'base64');
        const salt = data.subarray(0, SALT_LENGTH);
        const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + 16);
        const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + 16);
        const key = await this.deriveKey(secret, salt);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        const decrypted = decipher.update(encrypted) + decipher.final('utf8');
        return decrypted;
    }
}
exports.SecurityUtils = SecurityUtils;
