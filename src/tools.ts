// Common Functions
import Crypto from 'crypto';

export function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)) }

export function generateSelectorAndValidator() {
    return {
        selector: randomValue(12),
        validator: randomValue(64),
    }
}

export function hashValue(
    value: string, 
    salt?: string, 
    cycles: number = 500, 
    size: number = 64, 
    algo: string = 'sha256',
    salt_length: number = 32
): Promise<Error | {hash: string, salt: string}> {
    let input_salt = salt ?? Crypto.randomBytes(salt_length).toString('hex');
    return new Promise((res, rej) => {
        Crypto.pbkdf2(value, input_salt, cycles, size, algo, (err, derivedKey) => {
            if(err) return rej(err);
            res({ hash: derivedKey.toString('hex'), salt: input_salt });
        });
    });
}

export function randomValue(length: number) {
    return Crypto.randomBytes(Math.floor(length/2) ?? 0).toString('hex');
}

export function createHmac(secret: string, message: string) {
    return Crypto.createHmac('sha256', secret).update(message).digest('hex');
}

export function verifyHmac(hmac: string, verifySignature: string) {
    // console.log("Verifying:", hmac, verifySignature);
    return Crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(verifySignature));
}