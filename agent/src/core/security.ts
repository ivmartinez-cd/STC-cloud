import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export class SecurityUtils {
  /**
   * Deriva una clave fuerte a partir de un Hardware ID usando PBKDF2 (Seccion 9.1)
   */
  static async deriveKey(hardwareId: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(hardwareId, salt, ITERATIONS, KEY_LENGTH, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  /**
   * Cifra datos usando AES-256-GCM
   */
  static async encrypt(data: string, secret: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await this.deriveKey(secret, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Estructura: [salt(16)][iv(12)][tag(16)][payload(...)]
    const result = Buffer.concat([salt, iv, tag, encrypted]);
    return result.toString('base64');
  }

  /**
   * Descifra datos cifrados con AES-256-GCM
   */
  static async decrypt(encryptedBase64: string, secret: string): Promise<string> {
    const data = Buffer.from(encryptedBase64, 'base64');

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + 16);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + 16);

    const key = await this.deriveKey(secret, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}
