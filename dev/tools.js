const Crypto = require('crypto');

const config = require('../config/config.json');

const LogConfig = {
    trace_stake: false,
    log_to_file: false,
    no_log: config?.app?.env === 'production',
    prefix: null,
}

function ConfigLogger(data) {
    if(typeof(data) !== 'object') {
        return new Error("ConfigLogger() requires object as parameter.");
    }

    let keys = Object.keys(data);
    for(let i = 0; i < keys.length; i++) {
        LogConfig[keys[i]] = data[keys[i]];
    }

    return true;
}

function Logger(...args) {
    if(LogConfig.log_to_file) {
        // log to file
    }

    if(LogConfig.no_log) {
        return;
    }

    if(LogConfig.prefix != undefined) {
        if(Array.isArray(LogConfig.prefix))
            args.unshift(...LogConfig.prefix);
        else
            args.unshift(LogConfig.prefix);
    }

    console.log(...args);
}

function CopyJSON(json, ...adds) {
    if(typeof(json) !== "object")
        return Error(`CopyJSON() parameter did not match expected type 'object'. Received '${typeof(json)}'.`);

    let obj = JSON.parse(JSON.stringify(json));
    adds = adds.filter(val => typeof(val) === 'object');
    Object.assign(obj, obj, ...adds);

    return obj;
}

// Password Hashing
function HashValue(value, salt, cycles = 50000, size = 64, algo = 'sha256', salt_length = 32) {
    // Default Values for Login from Creds
    if(typeof(value) !== 'string')
        value = value.toString();

    if(salt == undefined || typeof(salt) !== 'string') {
        salt = Crypto.randomBytes(salt_length).toString('hex');
    }

    cycles = typeof(cycles) === 'number' ? cycles : 50000;
    size = typeof(size) === 'number' ? size : 64;
    algo = typeof(algo) === 'string' ? algo : 'sha256',
    salt_length = typeof(salt_length) === 'number' ? salt_length : 32;

    return new Promise((res, rej) => {
        Crypto.pbkdf2(value, salt, cycles, size, algo, (err, derivedKey) => {
            if(err)
                rej(err);

            res({
                hash: derivedKey.toString('hex'),
                salt: salt
            });
        });
    });
}

function GenerateSelectorAndToken() {
    return {
        selector: Crypto.randomBytes(6).toString('hex'),
        token: Crypto.randomBytes(32).toString('hex')
    }
}

function GetTokenExpDate(days = 30) {
    if(typeof(days) === 'number')
        return new Date(Date.now() + (1000 * 60 * 60 * 24 * days)).toUTCString();
    else
        return null;
}

function encodeURL(url) {
    let uri = encodeURI(url);
    return uri;
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleep(fn, ...args) {
    await timeout(3000);
    return fn(...args);
}

// function allTypeOf(type, ...checks) {
//     for(let i = 0; i < checks.length; i++) {
//         Logger(typeof(checks[i]), type);
//         switch(type) {
//             case 'string':
//                 if(typeof(checks[i] != 'string')) { return false; } break;
//             default:
//                 Logger('bad type'); return false;
//         }
//     }

//     return true;
// }

module.exports = {
    Logger, ConfigLogger, CopyJSON, HashValue, GenerateSelectorAndToken, GetTokenExpDate, encodeURL, timeout, sleep
}