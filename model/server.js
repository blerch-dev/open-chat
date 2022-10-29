// #region Imports
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
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
                    Logger('Removed User:', user?.username ?? user?.id ?? 'anon', channel_id);
                } else if(sockets.length > 1) {
                    let socket_ind = sockets.indexOf(socket[i]);
                    //Logger('Socket Splice Index:', socket_ind);
                    if(socket_ind > -1) {
                        sockets.splice(socket_ind, 1);
                        Users[channel_id].set(id, sockets);
                        Logger('Closed Socket:', user?.username ?? user?.id ?? 'anon', channel_id);
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
        this.getAllChannels = () => { return Channels; }
    }

    async start(srv) {
        let channels = await this.getAuth().getAllChannels();
        for(let i = 0; i < channels.length; i++) {
            //Logger('Channel:', channels[i].getDetails());
            this.setChannel(channels[i].getDetails()?.id, channels[i]);
        }

        await this.getListener().connect();
        let wss = this.configure(srv);

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

        this.getListener().on('error', (...args) => { Logger('Listener Error:', ...args) });
        let keys = this.getAllChannels()?.keys ?? []; keys = ['general', ...keys];
        for(let i = 0; i < keys.length; i++) {
            this.getListener().subscribe(`msg-${keys[i]}`, (msg) => {
                this.onPublish(msg);
            });
        }

        // Ping/Pong
        setInterval(() => {
            wss.clients.forEach((client) => {
                if(client.alive === false)
                    return client.terminate();

                client.alive = false;
                client.send('ping');
            })
        }, (this.getConfig()?.chat?.hb || 30) * 1000);

        return wss;
    }

    onConnection(socket, req) {
        socket.alive = true;
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
                //Logger("Message:", data.toString());
                if(data.toString() === 'pong') { socket.alive = true; return; }

                let json = null;
                if(!connected) {
                    try {
                        json = JSON.parse(data.toString());
                        //Logger('JSON:', json);
                        if(json?.room === 'null' || json?.room == null) {
                            socket.send(JSON.stringify({ ServerMessage: `No Channel Found for ${json?.room}`}));
                            return;
                        } else {
                            connect_user(json.room);
                        }
                    } catch(err) { Logger('JSON Parse Error:', err, data.toString()); }
                    return;
                }

                if(user?.id == undefined || this.isMuted(user, channel_id) || this.isBanned(user, channel_id))
                    return;

                this.onMessage(socket, user, channel_id, json);
            });

            socket.on('close', (...args) => {
                this.onClose(socket, user, channel_id, ...args)
            });

            socket.send(JSON.stringify({ ServerRequest: 'room_id' }));
        });
    }

    onMessage(socket, user, channel_id, data) {
        Logger(user?.username ?? 'anon', ':', channel_id, '->', data);
        if(data == null) {
            socket.send(JSON.stringify({ ServerMessage: 'Failed to parse message.' }));
            return;
        }

        let msg = JSON.stringify({
            user: user,
            channel: channel_id,
            message: data?.msg
        });

        // Redis Publish/Local Publish
        if(this.getConfig()?.chat?.local_publish ?? true) {
            this.getRedis().publish(`msg-${this.getConfig()?.chat?.id ?? 'general'}`, msg);
        } else {
            this.onPublish(msg);
        }
        
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
    async fetch(url, options) {
        url = new URL(url);
        options = {
            hostname: url.hostname,
            port: options?.port ?? url?.port ?? 80,
            path: url.pathname + url.search,
            method: options?.method ?? 'GET',
            headers: options?.headers ?? {
                'Content-Type': 'application/json'
            }
        };

        //Logger("Local Fetch:", options);

        let promise = new Promise((res, rej) => {
            try {
                https.get(url, options, (response) => {
                    this.jsonBodyParse(response, res, rej)
                });
            } catch(err) {
                res(err);
            }
        });

        return await promise;
    }

    async jsonBodyParse(response, res, rej) {
        let body = "";

        response.on("data", (chunk) => {
            body += chunk;
        });

        response.on("end", () => {
            try {
                let json = JSON.parse(body);
                res(json);
            } catch(error) {
                res(error);
            }
        });
    }

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

    cookieOptions(options) {
        return {
            secure: options?.secure ?? this.getConfig()?.app?.env === 'production', 
            httpOnly: true, 
            domain: options?.domain ?? this.getConfig()?.app?.env === 'production' ? 'https://www.openchat.dev' : undefined
        }
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
        const { twitch_code, redirect } = req.query;

        // Logger('Cookies:', req.cookies);
        // Logger('---------------------');
        // Logger('Body:', req.body);
        // Logger('---------------------');
        // Logger('Query:', req.query);

        //Logger('Auth Flow:', "\x1b[2m");
        if(req?.session?.user != undefined) {
            let user = new User(req.session.user, true);
            Logger('Returning Session User from AuthUser (class generated automatically)', user);
            return user;
        }

        let authed = false, errors = [], user = null;
        // Creds
        if(!authed) {
            //Logger('Creds:', username, password, createToken);
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
                        //Logger("Authing with Creds");
                    } else {
                        user = null;
                    }
                }

                if(authed && user instanceof User && createToken) {
                    let result = await this.createUserToken(user.getDetails().uuid.getValue());
                    if(token instanceof Error) {
                        errors.push(result)
                    } else if(typeof(result) === 'string') {
                        //Logger("Setting Cookie: token", result);
                        res.cookie('token', result, this.cookieOptions());
                    }
                }
            }
            //Logger(`Authed: ${authed}`);
            //Logger("Errors:", errors.length > 0 ? errors : "No Errors.");
        }

        // Token
        if(!authed) {
            //Logger('Token:', token);
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
                                //Logger("Setting Cookie: token", result);
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
                        Logger("Authing with Token");
                    }
                }
            }
            //Logger(`Authed: ${authed}`);
            //Logger("Errors:", errors.length > 0 ? errors : "No Errors.");
        }

        // Twitch
        if(!authed) {
            //Logger('Twitch:', twitch_tokens, twitch_code);
            let setToken = (new_token) => {
                //Logger("Setting Cookie: twitch_tokens", new_token); 
                res.cookie('twitch_tokens', new_token, this.cookieOptions()); 
            }
            
            if(typeof(twitch_tokens) === 'string') {
                user = await this.twitchTokenAuth(twitch_tokens, setToken);
            } else if(typeof(twitch_code) === 'string') {
                user = await this.twitchCodeAuth(twitch_code, redirect, setToken);
            }

            if(user instanceof Error) {
                errors.push(user);
            } else {
                authed = true;
                //Logger("Authing with Twitch", user);
            }

            //Logger(`Authed: ${authed}`);
            //Logger("Errors:", errors.length > 0 ? errors : "No Errors.");
        }

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

    async getUserFromTwitch(twitch_id) {
        let output = await this.rawQuery('SELECT * FROM user_connections WHERE twitch_id = $1', [twitch_id]);
        //Logger("guft:", output);
        if(output.rowCount === 1) {
            let user = this.getUser({ id: output.rows[0].uuid });
            return user;
        } else if(output.rowCount > 1) {
            return new Error("Multiple Matched Users.");
        }

        return null;
    }

    async createUser(user_data) {
        let user = user_data instanceof User ? user_data : new User(user_data, true);
        if(user instanceof Error)
            return user;
        else if(!(user instanceof User))
            return new Error("Failed to create a user instance.");

        let data = user.getDetails();
        let str = 'SELECT uuid, username, email FROM users WHERE uuid = $1 OR LOWER(username) LIKE $2';
        let args = [data.uuid.getValue(), data.username];
        if(typeof(data.email) === 'string') {
            str += ' OR LOWER(email) LIKE $3';
            args.push(data.email);
        }

        let result = await this.rawQuery(str, args);
        if(result instanceof Error) {
            Logger("Bad User Check", str, args, result);
            return result;
        }

        // Checks if ID/Username/Email is a match (should be unique. If UUID is the only match, generate new UUID and check only that)
        // Error return for now - TODO
        if(result?.rowCount > 0) {
            Logger("Unique Check", user.toJSON(), result.rows);
            return Error("Non Unique ID, Email, or Username. Contact Admins.");
        }

        str = 'INSERT INTO users (uuid, username, email, hash, salt, created_at, roles) VALUES ($1, $2, $3, $4, $5, $6, $7)';
        args = new Array(7);

        args[0] = data.uuid.getValue();
        args[1] = data.username;
        args[2] = data.email;
        
        if(typeof(user_data.password) === 'string') {
            let hash = await HashValue(user_data.password);
            if(hash instanceof Error) {
                Logger("Bad Security Hash.", hash);
                return Error("Server Error. Please Try Again Later.");
            }

            args[3] = hash.hash;
            args[4] = hash.salt;
        } else {
            args[3] = args[4] = null;
        }

        args[5] = new Date().toUTCString();
        args[6] = data.roles;

        result = await this.rawQuery(str, args);
        if(result instanceof Error)
            return result;

        return user;
    }

    async updateUser(user_id, data) {}

    async deleteUser(user_id) {}

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

    async twitchCodeAuth(code, redirect, setCookie) {
        Logger("Twitch Code Auth", code, redirect);
        if(code === 'missing')
            return Error("Did not find twitch code.");

        let url = `https://id.twitch.tv/oauth2/token?client_id=${this.getConfig().twitch.id}&client_secret=${this.getConfig().twitch.secret}`;
        url += `&code=${code}&grant_type=authorization_code&redirect_uri=${redirect || 'https://www.openchat.dev/auth/twitch'}`;
        let tokens = await this.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/vnd.twitchtv.v3+json' } });
        //Logger("Tokens:", tokens);
        return await this.twitchTokenAuth(tokens, setCookie);
    }

    async twitchTokenAuth(tokens, setCookie) {
        Logger("Twitch Token Auth", tokens);
        if(typeof(tokens) === 'string') {
            try { tokens = JSON.parse(this._decryptToken(tokens)); } catch(err) { Logger("ECE:", err); }
        }

        if(typeof(tokens) !== 'object') {
            Logger("Tokens:", tokens);
            return new Error("Tokens was not of type 'Object'.");
        }

        let { twitch_data, token_data, error } = await this._validateAndRefreshTwitchToken(tokens);
        if(error instanceof Error) { return error; }

        setCookie(this._encryptToken(JSON.stringify(token_data)));
        let con_user = await this.getUserFromTwitch(twitch_data?.user_id);
        //Logger("Twitch Data:", twitch_data, con_user);
        if(con_user instanceof User) {
            let authed_user = await this._syncTwitchUser(tokens.access_token, twitch_data, con_user);
            Logger("Twitch Authed User:", authed_user);
            return authed_user;
        } else {
            let authed_user = await this._createUserFromTwitchUser(tokens.access_token, twitch_data);
            Logger("Twitch Authed User:", authed_user);
            return authed_user;
        }
    }

    async associateTwitchUser(user_id, user_data) {
        let twitch_data = {
            id: user_data.twitch_id,
            login: user_data.twitch_login
        }

        if(twitch_data.id === undefined || twitch_data.login === undefined) {
            Logger("Bad Twitch Association", user_id, user_data, twitch_data);
            return Error("Missing Required Fields.");
        }

        // Channel Connection
        if(twitch_data.id != undefined && twitch_data.login != undefined) {
            let str = 'INSERT INTO user_connections (uuid, twitch_id, twitch_login) VALUES ($1, $2, $3)';
            str += ' ON CONFLICT (uuid) DO UPDATE SET twitch_id = $2, twitch_login = $3 WHERE user_connections.uuid = $1;'
            let args = [user_id, twitch_data.id, twitch_data.login];

            let result = await this.rawQuery(str, args);
            if(result instanceof Error)
                return result;
        }

        // Channel Roles
        if(user_data.subs != undefined && user_data.subs.length > 0) {
            let promises = [];
            for(let i = 0; i < user_data.subs.length; i++) {
                let sub = user_data.subs[i];
                let str = 'SELECT * FROM channel_roles WHERE uuid = $1 AND channel_id = $2';
                let args = [user_id, sub.channel_id];

                promises.push({p: this.rawQuery(str, args), index: i});
            }

            let updates = [], inserts = [];
            for(let i = 0; i < promises.length; i++) {
                let sub = user_data.subs[promises[i].index];
                let result = await promises[i].p;
                if(result instanceof Error) {
                    return result;
                } else if(result.rowCount > 0) {
                    let str = 'UPDATE channel_roles SET roles = $3 WHERE uuid = $1 AND channel_id = $2';
                    let args = [user_id, sub.channel_id, sub.roles];
                    updates.push(this.rawQuery(str, args));
                } else {
                    let str = 'INSERT INTO channel_roles (uuid, channel_id, roles) VALUES ($1, $2, $3)';
                    let args = [user_id, sub.channel_id, sub.roles];
                    inserts.push(this.rawQuery(str, args));
                }
            }

            promises = [...updates, ...inserts];
            for(let i = 0; i < promises.length; i++) {
                let result = await promises[i];
                if(result instanceof Error)
                    return result;
            }
        }

        return true;
    }

    async _syncTwitchUser(access_token, twitch_data, user) {
        if(!(user instanceof User)) {
            return Error("_syncTwitchUser requires user that is type of 'User'.");
        }

        let data = await this._getTwitchUser(access_token, twitch_data);
        let output = await this.associateTwitchUser(user.getDetails().uuid.getValue(), data);
        if(output instanceof Error)
            return output;

        user.setChannels(data.subs);
        user.setConnections({ twitch: { id: data.twitch_id, login: data.twitch_login } });
        //Logger("Synced User:", user.toJSON());

        return user;
    }

    async _createUserFromTwitchUser(access_token, twitch_data) {
        let data = await this._getTwitchUser(access_token, twitch_data);
        let user_data = {
            username: data.twitch_login,
            uuid: UUID.Generate()
        }

        let user = await this.createUser(user_data);
        if(user instanceof Error)
            return user;

        //Logger("Created User!");
        let output = await this.associateTwitchUser(user.getDetails().uuid.getValue(), data);
        if(output instanceof Error)
            return output;

        user.setChannels(data.subs);
        user.setConnections({ twitch: { id: data.twitch_id, login: data.twitch_login } });
        //Logger("Created User:", user.toJSON());

        return user;
    }

    async _getTwitchUser(access_token, twitch_user) {
        let data = {}, channels = await this.getAllChannels();
        if(channels instanceof Error)
            channels = [];

        // #region Subs
        let promises = [];
        for(let i = 0; i < channels.length; i++) {
            let url = `https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=`;
            url += `${channels[i].getDetails().twitch.id}&user_id=${twitch_user.user_id}`;
            promises.push({p: new Promise((res, rej) => {
                https.get(url, {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'Client-Id': `${this.getConfig()?.twitch?.id}`
                    }
                }, (response) => {
                    this.jsonBodyParse(response, res);
                });
            }), id: channels[i].getDetails().id});
        }

        let subs = {};
        for(let i = 0; i < promises.length; i++) {
            let output = await promises[i].p;
            if(output.status == 200 || Array.isArray(output.data)) {
                let tier = output.data[0].tier;
                let data = {
                    channel_id: promises[i].id,
                    roles: tier == "1000" ? ChannelRoles.Sub1 : tier == "2000" ?
                        ChannelRoles.Sub2 : tier == "3000" ? ChannelRoles.Sub3 : 0
                }

                subs[data.channel_id] = data.roles;
            }
        }

        data.subs = subs;
        // #endregion

        // #region User
        data.twitch_id = twitch_user.user_id;
        data.twitch_login = twitch_user.login;
        // #endregion

        return data;
    }

    async _validateAndRefreshTwitchToken(token_data) {
        let output = await this._validateTwitchToken(token_data);
        //Logger("Validated Twitch Response", output);
        if(output instanceof Error) {
            return { error: output };
        } else if(output.status != undefined && output.status != 200) {
            output = await this._refreshTwitchToken(token_data);
            if(output instanceof Error) {
                return { error: output };
            } else {
                return await this._validateAndRefreshTwitchToken(output);
            }
        }


        return {
            twitch_data: output,
            token_data: token_data
        }
    }

    async _validateTwitchToken(token_data) {
        let output = await this.fetch('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `Bearer ${token_data.access_token}` }
        });

        return output;
    }

    async _refreshTwitchToken(token_data) {
        let url = `https://id.twitch.tv/oauth2/token?grant_type=refresh_token&refresh_token=${token_data.refresh_token}`;
        url += `&client_id=${this.getConfig()?.twitch?.id}&client_secret=${this.getConfig()?.twitch?.secret}`;
        let output = await this.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/vnd.twitchtv.v3+json' }
        });

        return output;
    }

    _getEncryptCipher(cipher = true) {
        let algo = "aes-256-cbc";
        let key = Buffer.from(this.getConfig()?.encrypt?.secret, "base64");
        let buf = Buffer.from(this.getConfig()?.encrypt?.init, 'base64');
        if(cipher) {
            return crypto.createCipheriv(algo, key, buf);
        } else {
            return crypto.createDecipheriv(algo, key, buf);
        }
    }

    _encryptToken(token) {
        let cipher = this._getEncryptCipher(true);
        let ed = cipher.update(token, "utf-8", "base64");
        ed += cipher.final("base64");
        return ed;
    }

    _decryptToken(token) {
        let decipher = this._getEncryptCipher(false);
        let dd = decipher.update(token, "base64", "utf-8");
        dd += decipher.final("utf-8");
        return dd;
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