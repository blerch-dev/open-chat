// Backend
import http from 'http';
import path from 'path';
import cors from 'cors';
import express, { Router } from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import RedisStore from "connect-redis";
import cookieParser from 'cookie-parser';

import { sleep } from './tools';
import { TwitchHandler, PlatformHandler, RedisClient, ServerEvent, Embed, YoutubeHandler, KickHandler } from './state';
import { Authenticator } from './auth';
import { DatabaseConnection } from './data';
import { DefaultRoute } from './client';
import { User, UserData } from './user';
import { ChatHandler } from './chat';

export class Resource {
    static State = `${process.env.STATE_SUB}.${process.env.ROOT_URL}`;
    static Chat = `${process.env.CHAT_SUB}.${process.env.ROOT_URL}`;
}

declare module "express-session" {
    interface SessionData {
        // state: { [key: string]: any }
        // user: { [key: string]: any }
        [key: string]: { [key: string]: any }
    }
}

export interface SiteData {
    content?: {
        tab?: string,
        header?: string,
        chat?: string
    }
    links?: { link: string, label: string }[],
    transparent?: boolean
}

export class Server {

    public getSession: (req: any) => Promise<any>;

    private app = express();
    private server: http.Server;
    private props: { 
        site: SiteData,
        embeds: { platform: string, src: string, channel: string }[], // only live embeds
        [key: string]: any | undefined
    };
    private auth: Authenticator;
    private db: DatabaseConnection;
    private chat?: ChatHandler;

    private redis: {
        client?: RedisClient,
        store?: RedisStore
    } = {};

    private platformManager: PlatformManager;

    constructor(props?: { [key: string]: any }) {
        // SiteData
        let site = {
            content: {
                tab: props?.site?.content?.tab ?? "Tab Title",
                header: props?.site?.content?.header ?? "Header Title"
            },
            links: props?.site?.links ?? []
        }

        // Setup
        this.props = { site: site, embeds: [], ...props };
        this.props.env = process.env;
        this.props.isProd = this.isProd();
        this.props.domain = `http${this.isProd() ? 's' : ''}://${this.isProd() ? 
            `www.${process.env.ROOT_URL}` : `${process.env.DEV_URL}:${process.env.SERVER_PORT}`}`;

        // Embeds
        const sortEmbeds = (...embeds: { platform: string, src: string, channel: string }[]) => {
            return embeds.sort((a, b) => a.platform.localeCompare(b.platform));
        }

        ServerEvent.on('live-state-change', (data: Embed) => {
            console.log("Live Status Changed:", data);
            let index = this.props.embeds.map((em) => em.platform).indexOf(data.platform);
            if(index >= 0) { 
                if(data.live) { this.props.embeds[index] = data; }
                else { this.props.embeds.splice(index, 1); }
            } else if(data.live) { 
                this.props.embeds = sortEmbeds(...this.props.embeds, data);
            } else {
                console.log(`Attempted to remove Embed: ${data.platform}, but was already out of list. Ignoring.`);
            }
        });

        // State Events from OBS/Platform Checks
        //ServerEvent.on('stream-start', (meta: { [key: string]: any }) => {});
        //ServerEvent.on('stream-stop', (meta: { [key: string]: any }) => {});
        
        // Apps
        this.auth = new Authenticator(this);
        this.db = new DatabaseConnection(this);

        // Platforms
        this.platformManager = new PlatformManager(
            new TwitchHandler(),
            new YoutubeHandler(),
            new KickHandler()
        );

        // Format
        this.app.use(express.static(path.resolve(__dirname, './public/')));
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(cookieParser());
        this.app.enable('trust proxy');

        const corsOptions = {
            origin: ['http://localhost:8000', 'http://' + process.env.DEV_URL, 'https://' + process.env.ROOT_URL]
        }

        this.app.use(cors(corsOptions))

        const ttl = (1000 * 60 * 60 * 24); // 1 day session
        this.redis.client = new RedisClient(); // Local Only
        this.redis.store = new RedisStore({ 
            client: this.redis.client.getClient(),
            ttl: ttl
        });

        const sessionParser = session({
            name: 'open-chat-auth',
            store: this.redis.store,
            resave: false,
            saveUninitialized: false,
            secret: process.env.REDIS_SECRET || 'blank',
            cookie: {
                secure: this.isProd(),
                path: '/',
                domain: this.isProd() ? `.${process.env.ROOT_URL}` : undefined,
                sameSite: 'lax',
                httpOnly: true,
                maxAge: ttl
            },
            rolling: true
        });

        this.app.use(sessionParser);

        // Auto Handles
        this.app.use('*', async (req, res, next) => {
            req.session.user = User.ValidateUserData(req?.session?.user as UserData);
            // Check if Redis needs user to update from db
            if(req.session?.user == undefined && req.cookies.ssi) { await this.auth.handleAutoSession(req, res); }
            return next();
        });

        // Ingress
        this.app.use(IngressPaths, IngressRoute(this))

        // Default Route
        this.app.use(DefaultRoute(this));

        // Dynamic Routes
        const routes = props?.routes as Router[] ?? [];
        for(let i = 0; i < routes.length ?? []; i++) { this.addRoute(routes[i]); }

        // Listener
        let port = props?.port ?? process.env.SERVER_PORT ?? 8000;
        this.server = this.app.listen(port, () => {
            console.log(`Listening on Port: ${port}`);
        });

        // Retrieve Session
        this.getSession = async (req: any): Promise<any> => {
            return new Promise((res, rej) => {
                sessionParser(req, {} as any, () => {
                    if(req?.session) { return res(req.session); }
                    return res(Error("Could not find session."));
                });
            });
        }
    }

    public getProps = () => { return this.props; }
    public getApp = () => { return this.app; }
    public getListener: () => Promise<http.Server> = async () => { 
        if(this.server == null) { await sleep(100); return (await this.getListener()); }  return this.server; 
    }
    public addRoute = (route: Router) => { this.app.use(route); }
    public isProd = () => process.env.NODE_ENV === 'prod';
    public getAuthenticator() { return this.auth; }
    public getDatabaseConnection() { return this.db; }
    public getPlatformManager() { return this.platformManager; }
    public getRedisClient() { return this.redis.client; }

    public setChatHandler(chat: ChatHandler) { this.chat = chat; }
    public getChatHandler() { return this.chat; }
}

// Current Routes
const IngressPaths = ['/status*']
const IngressRoute = (server: Server): Router => {
    const route = Router();

    route.post('/status/obs/live', (req, res, next) => {
        // user should be admin/owner
        // body -> json, code == process.env.INGRESS_CODE
        // if no, next();
        // accept input, enable 
        // set embed using server event ('stream-start')
            // servermessage: { embeds: { id: string, platform: string }[] } // rough layout

        let json: any;
        try {
            json = JSON.parse(req.body);
        } catch(err) {}

        if(json?.code == process.env.INGRESS_CODE) {
            server.getPlatformManager().setCheckMode(json?.isLive ?? undefined);
        }

        next();
    });

    return route;
}

class PlatformManager {

    private debug = false;
    private Log = (...args: any[]) => { if(this.debug) { console.log(...args); } }

    private platformConnections: {
        twitch?: PlatformHandler,
        youtube?: PlatformHandler,
        [key: string]: PlatformHandler | undefined
    } = {};

    // Will Use OBS Ingress Info from Server to Determine If Interval Should Run (or can ignore)
    private ShouldRunChecks: boolean = false;
    private CheckForLive: boolean | undefined = undefined;

    private Interval: NodeJS.Timer | undefined;
    private IntervalMinutes: number = 5;

    constructor(...handlers: PlatformHandler[]) {
        this.addHandlers(...handlers);
        this.startCheckInterval();
    }

    public addHandler(handler: PlatformHandler) {
        this.platformConnections[handler.getPlatform()] = handler;
    }

    public addHandlers(...handlers: PlatformHandler[]) {
        for(let i = 0; i < handlers.length; i++) { this.addHandler(handlers[i]); }
    }

    public getPlatformConnections(field?: string) {
        return field ? this.platformConnections[field] : this.platformConnections;
    }

    public setCheckMode(live: boolean | undefined) {
        this.CheckForLive = live ?? undefined;
    }

    public setShouldCheck(val: boolean) {
        this.ShouldRunChecks = val;
    }

    public startCheckInterval(time?: number) {
        const interval_func = async () => {
            if(!this.ShouldRunChecks) { return; }
            this.Log("Checking Live from Connections:" + (new Date()).toLocaleTimeString());
            let keys = Object.keys(this.platformConnections);
            for(let i = 0; i < keys.length; i++) {
                let con = this.platformConnections[keys[i]] as PlatformHandler;

                // Use's OBS Plugin Status Updates to Determine if Checks should be made
                if(this.CheckForLive !== undefined && ((con.isLive && this.CheckForLive) || (!con.isLive && !this.CheckForLive))) {
                    continue;
                }

                let result = !!await con.forceScrapLiveCheck();
                this.Log("\t-> " + con.getPlatform() + "\t| " + result);
                con.checkForLiveChange(result);
            }
            this.Log("\n");
        }

        time = Math.max((time ?? this.IntervalMinutes), 1);
        this.Log(`Setting Interval Speed at ${time} Minute${time > 1 ? 's' : ''}.`);
        if(this.Interval) { clearInterval(this.Interval); }
        this.Interval = setInterval(() => {
            interval_func();
        }, time * 60 * 1000);

        interval_func();
    }
}