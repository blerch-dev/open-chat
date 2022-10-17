// #region Imports
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const ws = require('ws');
const pg = require('pg');

const { Logger, HashValue, GenerateSelectorAndToken, GetTokenExpDate, timeout, ConfigLogger } = require('../dev/tools');
const { Roles, ChannelRoles, UUID, User } = require('../model/user');
const { Channel } = require('../model/channel');
// #endregion

class Server {
    constructor(config, pkg) {
        this.getConfig = () => { return config; }
        this.getPackage = () => { return pkg; }
    }

    async start(app) {
        Logger(`OpenChat (v${this.getPackage().version})`);
        ConfigLogger({ prefix: ' ->' });
        
        await app.connectRedis();

        const config = this.getConfig();
        const ID = crypto.randomBytes(3).toString('hex').toUpperCase();
        const port = config?.app?.port ?? 8000;
        const srv = http.createServer(app.createApp());

        let ws = await app.getChat().start(srv);
        srv.listen(port, () => {
            Logger(`Server (${ID}) Running on Port ${port}`);
        });
    }
}

// Share redis session store data
class ChatServer {
    constructor(config, session, redis, auth) {

        const Listener = redis.duplicate();

        const Users = {}; //new Map();
        const Muted = {}; //new Map();
        const Banned = {}; //new Map();

        const Channels = {};

        this.getConfig = () => { return config; }

        this.getSession = () => { return session; }
        this.getRedis = () => { return redis; }
        this.getListener = () => { return Listener; }
        this.getAuth = () => { return auth; }

        this.configChannelMaps = (channel_id, s = 0) => {
            let del = false;
            if(s === 0 || s === 1) {
                if(!(Users[channel_id] instanceof Map)) {
                    Users[channel_id] = new Map();
                } else if(del && Users[channel_id].size === 0) {
                    delete Users[channel_id];
                }
            }

            if(s === 0 || s === 2) {
                if(!(Muted[channel_id] instanceof Map)) {
                    Muted[channel_id] = new Map();
                } else if(del && Muted[channel_id].size === 0) {
                    delete Muted[channel_id];
                }
            }

            if(s === 0 || s === 3) {
                if(!(Banned[channel_id] instanceof Map)) {
                    Banned[channel_id] = new Map();
                } else if(del && Banned[channel_id].size === 0) {
                    delete Banned[channel_id];
                }
            }
        }

        // #region User
        this.getUser = (user, channel_id) => {
            this.configChannelMaps(channel_id, 1);
            return Users[channel_id].get(user?.id) ?? []; 
        }
        this.getUserMap = (channel_id) => { return Users[channel_id]; }
        this.addUserSocket = (user, channel_id, socket) => {
            this.configChannelMaps(channel_id, 1);
            let id = user?.id ?? 'anon';
            let sockets = Users[channel_id].get(id);
            if(!Array.isArray(sockets)) {
                Users[channel_id].set(id, [socket]);
                Logger('Adding User:', user?.username ?? user?.id, channel_id);
            } else if(sockets.indexOf(socket) < 0) {
                sockets.push(socket);
                Users[channel_id].set(id, sockets);
                Logger('Adding Socket:', user?.username ?? user?.id, channel_id);
            }

            return true;
        }
        this.removeUserSocket = (user, channel_id, socket) => {
            this.configChannelMaps(channel_id, 1);
            let id = user?.id ?? 'anon';
            let sockets = Users[channel_id].get(id);

            if(!Array.isArray(socket)) {
                socket = [socket];
            }

            //Logger('rUS - State:', socket.length, sockets.length, user);
            for(let i = 0; i < socket.length; i++) {
                if(!Array.isArray(sockets) || sockets.length <= 1) {
                    Users[channel_id].delete(id);
                    Logger('Removed User:', user?.username ?? user?.id, channel_id);
                } else if(sockets.length > 1) {
                    let socket_ind = sockets.indexOf(socket[i]);
                    //Logger('Socket Splice Index:', socket_ind);
                    if(socket_ind > -1) {
                        sockets.splice(socket_ind, 1);
                        Users[channel_id].set(id, sockets);
                        Logger('Closed Socket:', user?.username ?? user?.id, channel_id);
                    }
                }
            }
            
            return true;
        }
        // #endregion

        function time_format(time) {
            if(typeof(time) !== 'string')
                return 0;

            let ms = time.slice(0, time.length - 1);
            let f = time.indexOf(time.length - 1);
            let exp = ms;

            switch(f) {
                case 'y':
                case 'mo':
                case 'w':
                case 'd':
                    exp *= 24;
                case 'h':
                    exp *= 60;
                case 'm':
                    exp *= 60;
                case 's':
                    exp *= 1000;
                default: 
                    break;
            }

            switch(f) {
                case 'y':
                    exp *= 365;
                case 'mo':
                    exp *= 31;
                case 'w':
                    exp *= 7;
                default:
                    break;
            }

            return exp;
        }

        function current_applied(map, id) {
            if(id == undefined)
                return false;

            let obj = map.get(id);
            if(obj !== undefined) {
                if(obj.exp < Date.now()) {
                    map.delete(id);
                    return 0;
                }

                return obj.exp - Date.now();
            }

            return 0;
        }

        // #region Muted and Banned
        this.isMuted = (user, channel_id) => {
            this.configChannelMaps(channel_id, 2);
            let id = user?.id;
            return current_applied(Muted[channel_id], id);
        }
        this.addMuted = (user, channel_id, time) => {
            this.configChannelMaps(channel_id, 2);
            if(typeof(time) !== 'string' || time.length < 1)
                return false;

            let id = user?.id;
            if(id == undefined)
                return false;

            Muted.set(id, { exp: time_format(time)});
            return true;
        }
        this.removeMuted = (user, channel_id) => {
            this.configChannelMaps(channel_id, 2);
            return Muted.delete(user?.id);
        }

        this.isBanned = (user, channel_id) => {
            this.configChannelMaps(channel_id, 3);
            let id = user?.id;
            return current_applied(Banned[channel_id], id);
        }
        this.addBanned = (user, channel_id, time) => {
            this.configChannelMaps(channel_id, 3);
            if(typeof(time) !== 'string' || time.length < 1)
                return false;
            
            let id = user?.id;
            if(id == undefined)
                return false;

            Banned.set(id, { exp: time_format(time) });
            return true;
        }
        this.removeBanned = (user, channel_id) => {
            this.configChannelMaps(channel_id, 3);
            return Banned.delete(user?.id);
        }
        // #endregion
    
        this.setChannel = (label, value) => { Channels[label] = value; }
        this.getChannel = (label) => { return Channels[label]; }
    }

    async start(srv) {
        let channels = await this.getAuth().getAllChannels();
        for(let i = 0; i < channels.length; i++) {
            //Logger('Channel:', channels[i].getDetails());
            this.setChannel(channels[i].getDetails()?.id, channels[i]);
        }

        await this.getListener().connect();
        let wss = this.configure(srv);

        //this.getRedis().subscribe

        return wss;
    }

    configure(srv) {
        //Logger('Configuring ChatServer');
        const wss = new ws.WebSocketServer({ server: srv });
        wss.on('connection', (socket, request) => {
            this.onConnection(socket, request);
        });

        wss.on('error', (error) => {
            this.onError(error);
        });

        //this.getListener().on('error', (...args) => { Logger('Listener Error:', ...args) });
        // this.getListener().subscribe(`msg-${this.getConfig()?.chat?.id ?? 'general'}`, (msg) => {
        //     this.onPublish(msg);
        // });

        // Ping/Pong

        return wss;
    }

    onConnection(socket, req) {
        let sess = this.getSession();
        sess(req, {}, () => {
            let user = req.session?.user;
            //Logger("User Connection:", user);

            let connected = false, channel_id = null;
            let add = (usr, chl) => {
                this.addUserSocket(usr, chl, socket);
                socket.send(JSON.stringify({
                    ServerUpdate: ['channel', 'user'],
                    channel: this.getChannel(chl)?.getDetails() ?? {},
                    user: usr
                }));
                connected = true;
                channel_id = chl;
            }

            let connect_user = (channel_id) => {
                if(user?.id) {
                    let bt = this.isBanned(user, channel_id)
                    if(!bt) {
                        add(user, channel_id);
                    } else {
                        socket.send(JSON.stringify({ 
                            ServerMessage: typeof(bt) === 'number' ? `You are banned for ${bt} ms.` : 'You are banned. Reconnect later.' 
                        }));
                        return;
                    }
                } else if(!!this.getConfig()?.chat?.anon) {
                    add({id: 'anon'}, channel_id);
                }
            }

            socket.on('message', (data) => {
                let json = null;
                if(!connected) {
                    try {
                        json = JSON.parse(data);
                        //Logger('JSON:', json);
                        if(json?.room === 'null' || json?.room == null) {
                            socket.send({ ServerMessage: `No Channel Found for ${json?.room}`});
                            return;
                        } else {
                            connect_user(json.room);
                        }
                    } catch(err) { Logger('JSON Parse Error:', err); }
                    return;
                }

                if(user?.id == undefined || this.isMuted(user, channel_id) || this.isBanned(user, channel_id))
                    return;

                this.onMessage(socket, user, channel_id, data.toString());
            });

            socket.on('close', (...args) => {
                this.onClose(socket, user, channel_id, ...args)
            });
        });
    }

    onMessage(socket, user, channel_id, data) {
        //Logger(user?.username ?? 'anon', '->', data);
        let json = null;
        try { json = JSON.parse(data); } catch(err) { Logger("Parse Err:", err); }
        if(json == null) {
            socket.send(JSON.stringify({ ServerMessage: 'Failed to parse message.' }));
            return;
        }

        let msg = JSON.stringify({
            user: user,
            channel: channel_id,
            message: json?.msg
        });

        // Redis Publish
        // this.getRedis().publish(`msg-${this.getConfig()?.chat?.id ?? 'general'}`, msg);

        // Local Call
        this.onPublish(msg);
    }

    async onPublish(msg) {
        if(msg instanceof Error)
            return Logger("Listener Error:", msg);

        let json = null;
        try { json = typeof(msg) === 'object' ? msg : JSON.parse(msg); } catch(err) { Logger("Failed to Parse Message.", err, msg); }
        if(json == null)
            return;

        // Filter User Data
        json.user = {
            username: json?.user?.username ?? 'undefined',
            roles: json?.user?.roles ?? 0,
            channel_roles: json?.user?.channels[json?.channel ?? '_generic_profile'],
            connections: json?.user?.connections
        }

        //Logger('onPublish JSON:', json);
        const send = (sockets) => {
            for(let i = 0; i < sockets.length; i++) {
                sockets[i].send(JSON.stringify({ ChatMessage: json }));
            }
        }

        let map = this.getUserMap(json?.channel);
        if(!(map instanceof Map)) {
            Logger("Failed to find map.", json);
            return;
        }

        let keys = map.keys(), stop = false, count = 0;
        while(!stop) {
            let { done, value } = keys.next();
            let sockets = this.getUser({ id: value }, json?.channel);
            //Logger('User:', value, sockets?.length, done);
            if(done) {
                stop = done;
                return;
            }

            if(count % (this.getConfig()?.chat?.dispatch || 100))
                await timeout(1);

            if(value == 'anon') {
                send(sockets);
                continue;
            }

            if(this.isBanned({ id: value }, json?.channel)) {
                this.removeUserSocket({ id: value }, json?.channel, sockets);
                continue;
            }

            send(sockets);
            count += 1;
        }
    }

    onClose(socket, user, channel_id, ...args) {
        this.removeUserSocket(user, channel_id, socket);
    }

    onError(error) {
        Logger("WSS Error:", error);
    }
}

class AuthServer {
    constructor(config, redis) {
        const Pool = new pg.Pool({
            ssl: { 
                require: typeof(config?.app?.env) === 'string' ? config.app.env === 'production' : true, 
                rejectUnauthorized: false
            },
            user: config?.db?.user || "postgres",
            host: config?.db?.host,
            database: config?.db?.name || "postgres",
            password: config?.db?.pass,
            port: config?.db?.port || 5432
        });

        this.getConfig = () => { return config; }
        this.getRedis = () => { return redis; }
        this.getPool = () => { return Pool; }
    }

    // Helper Functions
    async rawQuery(str, args) {
        let promise = new Promise((res, rej) => {
            this.getPool().query(str, args, (err, result) => {
                if(err) { res(err) } else { res(result) }
            });
        });

        return await promise;
    }

    async selectQueryParse(labels, checks, table, mode = 'AND') {
        if(!checks.some(val => typeof(val) === 'string'))
            return Error("Bad Value List.");

        if(typeof(mode) !== 'string')
            mode = 'AND';
        else
            mode = mode.trim();

        let arr = labels.map((val, ind) => { return { label: val, value: checks[ind] }}).filter(val => typeof(val.value) === 'string');
        let str = `SELECT * FROM ${table} WHERE ${arr.map((val, ind) => `${ind > 0 ? ` ${mode} ` : ''}${val.label} = $${ind + 1}`).join('')}`;
        let result = await this.rawQuery(str, arr.map(val => val.value));
        return result;
    }

    validateUser(result, data = undefined) {
        if(result instanceof Error)
            return result;

        if(result?.rowCount > 1) {
            //Logger("Multiple Outputs:", result);
        }

        if(result?.rowCount == 0) {
            //Logger("Bad Row Count", data);
            return Error("Failed to find user.");
        }

        let user = new User(result.rows[0], true);
        return user;
    }

    validateChannel(result, data = undefined) {
        if(result instanceof Error)
            return result;

        if(result?.rowCount > 1) {
            //Logger("Multiple Outputs:", result);
        }

        if(result?.rowCount == 0) {
            //Logger("Bad Row Count", data);
            return Error("Failed to find channel.")
        }

        let channel = new Channel(result.rows[0], true);
        return channel;
    }

    // App Functions
    async Login(req, res) {
        return await this.AuthUser(req, res);
    }

    async Logout(req, res, all = false) {}

    async Signup(req, res) {}

    async AuthUser(req, res) {
        const { token, twitch_tokens } = req.cookies;
        const { username, password, createToken } = req.body;
        const { twitch_code } = req.query;

        //Logger('Auth Flow:', "\x1b[2m");
        if(req?.session?.user != undefined) {
            let user = new User(req.session.user, true);
            Logger('Returning Session User from AuthUser (class generated automatically)', user);
            return user;
        }

        let authed = false, errors = [], user = null;
        // Creds
        if(!authed) {
            //Logger(' -> Creds:', username, password, createToken);
            if(typeof(username) === 'string' && typeof(password) === 'string') {
                let result = await this.getUser({ username: username });
                if(result instanceof Error) {
                    errors.push(result);
                } else {
                    user = result;
                }

                if(user instanceof User) {
                    let hash = await HashValue(password, user.getSecurity().salt);
                    if(hash?.hash === user.getSecurity().hash) {
                        authed = true;
                    } else {
                        user = null;
                    }
                }

                if(authed && user instanceof User && createToken) {
                    let result = await this.createUserToken(user.getDetails().uuid.getValue);
                    if(token instanceof Error) {
                        result.push(result)
                    } else if(typeof(result) === 'string') {
                        res.cookie('token', result, { 
                            secure: this.getConfig()?.app?.env === 'production', 
                            httpOnly: true, 
                            domain: this.getConfig()?.app?.env === 'production' ? 'openchat.dev' : req.hostname
                        });
                    }
                }
            }
            //Logger(` -> Authed: ${authed}`);
            //Logger(" -> Errors:", errors.length > 0 ? errors : "No Errors.");
        }

        // Token
        if(!authed) {
            Logger(' -> Token:', token);
            if(typeof(token) === 'string') {
                let parts = token.split('-');
                let found_token = await this.getToken(parts[0]);
                if(found_token instanceof Error) {
                    errors.push(found_token)
                } else {
                    let date = new Date(found_token.expires);
                    if(date.getTime() < Date.now()) {
                        this.deleteToken(found_token.uuid, found_token.selector);
                    } else {
                        let hash = await HashValue(parts[1], this.getConfig()?.app?.salt || "default-salt", 10000, 32);
                        if(hash?.hash === found_token.hashed_validator) {
                            authed = true;
                            user = found_token.uuid;
                        }

                        if(date.getTime() - Date.now() < 12096e5) { // 2 weeks
                            let result = await this.refreshToken(found_token.uuid, found_token.selector);
                            if(result instanceof Error) {
                                errors.push(result);
                            } else if(typeof(result) === 'string') {
                                res.cookie('token', result, { 
                                    secure: this.getConfig()?.app?.env === 'production', 
                                    httpOnly: true, 
                                    domain: this.getConfig()?.app?.env === 'production' ? 'openchat.dev' : req.hostname
                                });
                            }
                        }
                    }
                }

                if(authed && typeof(user) === 'string') {
                    let result = await this.getUser({ id: user });
                    if(result instanceof Error) {
                        errors.unshift(result);
                        authed = false;
                        user = null;
                    } else {
                        user = result;
                    }
                }
            }
            Logger(` -> Authed: ${authed}`);
            Logger(" -> Errors:", errors.length > 0 ? errors : "No Errors.");
        }

        // Twitch
        if(!authed) {
            Logger(' -> Twitch:', twitch_tokens, twitch_code);
            let tokens = null;
            if(typeof(twitch_tokens) === 'string') {
                // decrypt token object
            } else if(typeof(twitch_code) === 'string') {
                // fetch token object
            }

            if(typeof(tokens) === 'object') {

            }
            Logger(` -> Authed: ${authed}`);
            Logger(" -> Errors:", errors.length > 0 ? errors : "No Errors.");
        }

        Logger("\x1b[0m");

        if(authed && user instanceof User) {
            return user;
        } else {
            if(authed && !(user instanceof User))
                Logger("Authed but no user.", authed, user);
            else
                Logger("Auth - User", authed, user);

            return new Error("Failed to auth user.");
        }
    }

    // User
    async getUser(data) {
        const { id, email, username } = data;
        let labels = [ 'uuid', 'email', 'username' ], checks = [ id, email, username ];

        let result = await this.selectQueryParse(labels, checks, 'users', 'AND');
        let user = this.validateUser(result);
        if(user instanceof Error)
            return user;
        else if(!(user instanceof User))
            return new Error("Not of type User.");

        let id_value = user.getDetails().uuid.getValue();

        user.addChannels(await this.getUserChannelRoles(id_value));
        user.addConnections(await this.getUserConnections(id_value));

        return user;
    }

    async getUserFromCreds(username, password) {}

    async getUserFromToken(token) {}

    async getUserFromTwitch(tokens) {} // Tokens could be string (code) or object (tokens)

    async createUser(user) {

    }

    async updateUser(user_id, data) {}

    async deleteUser(user_id) {}

    async associateUser(user, data) {}

    async getUserChannelRoles(user_id) {
        let result = await this.selectQueryParse(['uuid'], [user_id], 'channel_roles');

        let data = {};
        if(result instanceof Error || result.rowCount == 0)
            return data;

        for(let i = 0; i < result.rows.length; i++) {
            data[result.rows[i].channel_id] = result.rows[i].roles;
        }

        return data;
    }

    async getUserConnections(user_id) {
        let result = await this.selectQueryParse(['uuid'], [user_id], 'user_connections');

        let data = {};
        if(result instanceof Error || result.rowCount == 0)
            return data;

        data.twitch = {
            id: result.rows[0].twitch_id,
            login: result.rows[0].twitch_login
        }

        return data;
    }

    // User Tokens
    async getToken(selector) {
        let result = await this.selectQueryParse(['selector'], [selector], 'user_tokens', 'AND');
        if(Array.isArray(result?.rows)) {
            return result.rows[0];
        }

        return new Error('No token found.');
    }

    async getTokensFromUser(user_id) {}

    async createUserToken(user_id, exp = null, domain = null) {
        let { selector, token } = GenerateSelectorAndToken();
        let hash = await HashValue(token, this.getConfig()?.app?.salt ?? 'default-salt', 10000, 32);
        if(hash instanceof Error)
            return hash;

        let str = 'INSERT INTO user_tokens (uuid, selector, hashed_validator, expires, domain) VALUES ($1, $2, $3, $4, $5)';
        let args = [ user_id, selector, hash.hash, exp || GetTokenExpDate(), domain ];
        let result = await this.rawQuery(str, args);
        if(result instanceof Error)
            return result;

        return `${selector}-${token}`;
    }

    async refreshToken(user_id, selector) {
        let { token } = GenerateSelectorAndToken();
        let hash = await HashValue(token, this.getConfig()?.app?.salt, 10000, 32);
        if(hash instanceof Error)
            return hash;

        let str = 'UPDATE user_tokens SET hashed_validator = $3, expires = $4 WHERE uuid = $1 AND selector = $2';
        let args = [user_id, selector, hash, GetTokenExpDate()];
        let result = await this.rawQuery(str, args);
        if(result instanceof Error)
            return result;

        return `${selector}-${token}`;
    }

    async deleteToken(user_id, selector) {
        let str = 'DELETE FROM user_tokens WHERE uuid = $1 AND selector = $2';
        let args = [user_id, selector];
        let result = await this.rawQuery(str, args);
        if(result instanceof Error)
            return result;
    }

    async deleteTokensFromUser(user_id) {}

    // Channel
    async getChannel(data) {
        let lables = [ 'uuid', 'channel_id', 'channel_name', 'domain' ]
        let checks = [ data.uuid, data.channel_id, data.channel_name, data.domain ];

        let result = await this.selectQueryParse(lables, checks, 'channels', 'OR');
        return this.validateChannel(result, data);
    }

    async getAllChannels() {
        let result = await this.rawQuery('SELECT * FROM channels;');
        if(result instanceof Error)
            return result;

        let channels = [];
        for(let i = 0; i < result.rowCount; i++) {
            let c = new Channel(result.rows[i], true);
            if(c instanceof Channel)
                channels.push(c);
        }

        return channels;
    }

    async getChannelFromOwner(user_id) {}

    async getChannelFromDomain(domain) {}

    async getChannelFromTwitch(twitch_id) {}

    async updateChannel(channel_id, data) {}

    async deleteChannel(channel_id) {}
}

class Route {
    constructor(host, callback) {
        var router = express.Router();
        var _host = typeof(host) === 'string' ? host : '[\\s\\S]*';
        var _callback = typeof(callback) === 'function' ? callback : () => {};

        this.getRouterRef = () => { return router; }

        this.getHost = () => { return _host; }
        this.setHost = (host) => { _host = host; }

        this.getCallback = () => { return _callback; }
        this.setCallback = (cb) => { if(typeof(cb) === 'function') _callback = cb; }
    }

    getRouter(getOptions, setOption, dbClient) {
        let router = this.getRouterRef();

        let cb = this.getCallback();
        cb(router, getOptions, setOption, dbClient);

        return router;
    }
}

module.exports = {
    Server, ChatServer, AuthServer, Route
}