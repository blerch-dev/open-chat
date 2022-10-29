// #region Imports
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const redis = require('redis');
//const connectRedis = require('connect-redis');
const pgSession = require('connect-pg-simple');
const path = require('path');
const crypto = require('crypto');

const { Logger } = require('../dev/tools');
const { AuthServer, ChatServer, Route, User } = require('../model');
const { SiteRoutes } = require('./routes');
// #endregion

class OpenChatApp {
    constructor(config, pkg) {
        var Options = {};
        const Store = pgSession(session); //connectRedis(session);
        const Client = redis.createClient({
            host: '10.0.0.134',
            port: 6379,
            //legacyMode: true // for session (broken pub sub on legacy)
        });

        Client.on('error', (err) => {
            if(err.code == 'ECONNREFUSED') {
                throw new Error("Redis Server Refusing Connection. Closing App.");
            }

            Logger("\x1b[2m", 'Redis Client Error:', err, "\x1b[0m");
        });
        Client.on('connect', (...args) => {
            //Logger("\x1b[2m", 'Redis Client Connected', "\x1b[0m");
        });

        const Auth = new AuthServer(config, Client);
        const SessionParse = session({
            store: new Store({
                pool: Auth.getPool(),
                tableName: 'session'
            }),
            secret: config?.app?.secret || 'default_secret',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false,
                httpOnly: true,
                path: '/',
                domain: config?.app?.env === 'dev' ? 'localhost' : 'openchat.dev',
                maxAge: (1000 * 60 * 60 * 24) * 0.5 // Days
            }
        })

        const Routes = {};
        const Chat = new ChatServer(config, SessionParse, Client, Auth);

        this.getConfig = () => { return config; }
        this.getPackage = () => { return pkg; }

        this.setOption = (name, value) => { Options[name] = value; }
        this.getOption = (name) => { return Options[name]; }
        this.getOptions = () => { return Options; }
        this.resetOptions = () => { Options = {
            title: 'OpenChat'
        }; };

        this.getStore = () => { return Store; }
        this.getClient = () => { return Client; }

        this.getSession = () => { return SessionParse; }

        this.addRoute = (...routes) => { routes.forEach((r) => { if(r instanceof Route) Routes[r.getHost()] = r; }); } 
        this.getRoute = (host) => { 
            let route = Routes[host];
            if(route instanceof Route)
                return route;

            let regs = Object.keys(Routes).map((val) => { return { regex: new RegExp(val), value: val } });
            for(let i = 0; i < regs.length; i++) {
                let found = regs[i].regex.test(host);
                //Logger('Regex Route:', found, regs[i], host)
                if(found)
                    return Routes[regs[i].value];
            }

            return undefined;
        }

        this.getAuth = () => { return Auth; }
        this.getChat = () => { return Chat; }
    }

    async connectRedis() {
        return await this.getClient().connect();
    }

    createApp() {
        const config = this.getConfig();
        let app = express();

        // Adding Routes
        let routes = SiteRoutes;
        for(let i = 0; i < routes.length; i++) {
            let route = routes[i];
            this.addRoute(route.label, route);
        }

        // App Settings
        app.set('view engine', 'ejs');
        app.set('views', path.join(__dirname, './pages/'));
        app.set('trust proxy', 1);

        if(config?.app?.env === 'dev')
            app.disable('view cache');

        app.use(cookieParser());
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(express.static(path.join(__dirname, '../public/')));

        app.use(this.getSession());

        app.use((req, res, next) => {
            if(this.getConfig()?.app?.env !== 'production')
                return next();

            res.header('Access-Control-Allow-Credentials', true);
            res.header('Access-Control-Allow-Origin', req.headers.origin);
            res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
            res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
            return next();
        });

        this.cleanURL(app);

        this.configRoutes(app);

        return app;
    }

    cleanURL(app) {
        app.use((req, res, next) => {
            this.resetOptions();

            if(req.path.substring(req.path.length - 1) === '/' && req.path.length > 1) {
                const query = req.url.slice(req.path.length);
                const safepath = req.path.slice(0, -1).replace(/\/+/g, '/');
                res.headers['OpenChat_Host'] = req?.headers?.host || 'openchat.dev';
                res.redirect(301, safepath + query);
            }
    
            return next();
        });
    }

    configRoutes(app) {
        app.all('*', (req, res, next) => {
            let usr = req.session?.user ?? undefined;
            this.setOption('user', usr);

            let route = this.getRoute(req.hostname);
            //Logger('Route:', route);
            if(route instanceof Route) {
                (route.getRouter(this.getOptions, this.setOption, this.getAuth()))(req, res, next);
            } else {
                return next();
            }
        });

        this.authCatches(app);

        app.all('*', (req, res, next) => {
            this.getAuth().AuthUser(req, res).then((usr) => {
                if(usr instanceof User) {
                    usr = usr.toJSON();
                    req.session.user = usr;
                    this.setOption('user', usr);
                    return next();
                } else {
                    this.setOption('user', undefined);
                    return next();
                }
            });
        });

        this.chatCatches(app);

        this.developerRoutes(app);

        this.genericCatches(app);
    }

    chatCatches(app) {

        // Chat Pages/JSON
        app.get('/chat/embed', (req, res) => {
            this.setOption('flex', true);
            this.setOption('includeHeader', false);
            this.setOption('noBackground', true);
            this.setOption('includeChatHeader', false);
            this.setOption('includeChatSender', false);
            res.render('generic/chat', this.getOptions());
        });

        app.get(['/chat/embed', '/chat*'], (req, res) => {
            this.setOption('flex', true);
            this.setOption('includeChatHeader', true);
            this.setOption('includeChatSender', true);
            res.render('generic/chat', this.getOptions());
        });

    }

    developerRoutes(app) {
        app.get('/api/state', (req, res, next) => {
            let json = {};
            this.getClient().keys('*', (err, keys) => {
                let promises = [];
                for(let i = 0; i < keys.length; i++) {
                    let promise = new Promise((resolve, reject) => {
                        this.getClient().get(keys[i], (err, value) => {
                            if(err != null) {
                                resolve(null);
                            } else {
                                resolve({ key: keys[i], data: value });
                            }
                        });
                    });
                    
                    promises.push(promise);
                }

                Promise.all(promises).then((output) => {
                    //Logger("Redis Keys Output:", output);
                    for(let i = 0; i < output.length; i++) {
                        //Logger(output[i]);
                        try {
                            let data = JSON.parse(output[i].data);
                            json[output[i].key] = data;
                        } catch(err) {
                            json[output[i].key] = output[i].value;
                        }
                    }

                    res.json({ Okay: true, State: json });
                });
            });
        });

        app.get('/api*', (req, res) => {
            res.json({ Okay: false, Error: { message: "No api resource at this address." } });
        });
    }

    authCatches(app) {

        // Twitch
        app.post('/auth/twitch', (req, res, next) => {
            let redirect = req.protocol + '://' + req.get('host') + '/auth/twitch';
            let setCookie = (new_tokens) => { res.cookie('twitch_tokens', new_tokens, this.getAuth().cookieOptions()); }
            let func = (output) => {
                Logger("Twitch Auth Output:", output);
                if(output instanceof User) {
                    req.session.user = output.toJSON();
                    res.json({ Okay: true, Auth: true });
                } else if(output instanceof Error) {
                    res.json({ Error: { name: output.name, message: output.message } });
                } else {
                    res.json({ Error: { name: "Undefined Error", message: "Try Again Later." } });
                }
            }

            Logger("req.query:", req.query);
            if(req.query.twitch_code != undefined) {
                this.getAuth().twitchCodeAuth(req.query.twitch_code, redirect, setCookie).then(func);
            } else {
                this.getAuth().twitchTokenAuth(req.cookies.twitch_tokens, setCookie).then(func);
            }
        });

        app.get('/auth/twitch', (req, res, next) => {
            //Logger("Cookies:", req.cookies);
            this.setOption('fetchCode', req.cookies?.twitch_tokens === undefined);
            res.render('generic/oauth', this.getOptions());
        });

        app.get('/login', (req, res, next) => {
            this.setOption('login', true);
            res.render('generic/auth', this.getOptions());
        });

        // Local
        app.post('/login', (req, res, next) => {
            this.getAuth().Login(req, res).then((output) => {
                if(output instanceof User) {
                    req.session.user = output.toJSON();
                    res.json({ Okay: true, Login: true });
                } else if(output instanceof Error) {
                    res.json({ Okay: false, Login: false, Error: { message: output.message } });
                } else {
                    res.json({ Okay: false, Login: false, Error: { message: "Bad Login Attempt." } });
                }
            });
        });

        app.get('/signup', (req, res, next) => {
            this.setOption('login', false);
            res.render('generic/auth', this.getOptions());
        });

        app.post('/signup', (req, res, next) => {
            this.getAuth().Signup(req, res).then((output) => {
                if(output instanceof User) {
                    req.session.user = output.toJSON();
                    res.json({ Okay: true, Signup: true });
                } else if(output instanceof Error) {
                    res.json({ Okay: false, Signup: false, Error: { message: output.message } });
                } else {
                    res.json({ Okay: false, Signup: false, Error: { message: "Bad Signup Attempt." } });
                }
            });
        });
    }

    genericCatches(app) {

        // Live
        app.get('/live', (req, res, next) => {
            res.render('generic/live', this.getOptions());
        });

        // Generic Pages
        app.get('/profile', (req, res) => {
            res.render('generic/profile', this.getOptions());
        });

        app.get('/', (req, res) => {
            res.render('generic/index', this.getOptions());
        });

        // Error
        app.all('*', (req, res) => {
            if(req.method == 'GET') {
                this.setOption('code', '404');
                this.setOption('message', `Could not find page for this path.`);
                res.render('generic/error', this.getOptions());
            } else {
                res.json({ Okay: false, Error: { message: "No resource found at this address." } });
            }
        });
    }
}

module.exports = {
    OpenChatApp
}