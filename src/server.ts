// Backend
import http from 'http';
import path from 'path';
import cors from 'cors';
import express, { Router } from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import RedisStore from "connect-redis";
import cookieParser from 'cookie-parser';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { sleep } from './tools';
import { RedisClient } from './state';
import { Authenticator } from './auth';
import { DatabaseConnection } from './data';
import { DefaultRoute } from './client';
import { User, UserData } from './user';

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
    public getProps = () => { return this.props; }
    public getApp = () => { return this.app; }
    public getListener: () => Promise<http.Server> = async () => { 
        if(this.server == null) { await sleep(100); return (await this.getListener()); }  return this.server; 
    }
    public addRoute = (route: Router) => { this.app.use(route); }
    public isProd = () => process.env.NODE_ENV === 'prod';

    private app = express();
    private server: http.Server;
    private props: { site?: SiteData, [key: string]: unknown };
    private auth: Authenticator;
    private db: DatabaseConnection;

    private redis: {
        client?: RedisClient,
        store?: RedisStore
    } = {};

    constructor(props?: { [key: string]: unknown }) {
        // Setup
        this.props = props ?? {};
        this.props.env = process.env;
        this.props.isProd = this.isProd();
        this.props.domain = `http${this.isProd() ? 's' : ''}://${this.isProd() ? 
            `www.${process.env.ROOT_URL}` : `${process.env.DEV_URL}`}`;

        // SiteData
        this.props.site = {
            content: {
                tab: this.props?.site?.content?.tab ?? "Tab Title",
                header: this.props?.site?.content?.header ?? "Header Title"
            },
            links: this.props?.site?.links ?? []
        }
        
        this.auth = new Authenticator(this);
        this.db = new DatabaseConnection(this);

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
            store: this.redis.store,
            resave: false,
            saveUninitialized: false,
            secret: process.env.REDIS_SECRET || 'blank',
            cookie: {
                secure: this.isProd(),
                path: '/',
                domain: this.isProd() ? `.${process.env.ROOT_URL}` : undefined,
                sameSite: true,
                httpOnly: true,
                maxAge: ttl
            },
            rolling: true
        });

        this.app.use(sessionParser);

        // Auto Handles
        this.app.use('*', (req, res, next) => {
            req.session.user = User.ValidateUserData(req?.session?.user as UserData);
            // console.log("Session User:", req.session?.cookie?.expires, ' - ', req.originalUrl, ' | ', req.cookies?.['connect.sid']);
            if(req.session?.user == undefined && req.cookies.ssi) {
                res.cookie('ssi_forward', req.protocol + '://' + req.hostname + req.originalUrl);
                console.log("Placed Headers:", res.getHeader("set-cookie"));
            }

            return next();
        });

        // Default Route
        this.app.use(DefaultRoute(this));

        // Dynamic Routes
        const routes = props?.routes as Router[] ?? [];
        for(let i = 0; i < routes.length ?? []; i++) { this.addRoute(routes[i]); }

        // Listener
        this.server = this.app.listen(props?.port ?? process.env.SERVER_PORT ?? 8000);

        // Retrieve Session
        this.getSession = async (req: any): Promise<any> => {
            return new Promise((res, rej) => {
                sessionParser(req, {} as any, () => {
                    if(req?.session) { return res(req.session); }
                    return rej();
                });
            });
        }
    }

    public getAuthenticator() { return this.auth; }
    public getDatabaseConnection() { return this.db; }
    public getRedisClient() { return this.redis.client; }
}