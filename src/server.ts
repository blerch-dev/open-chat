// Backend
import http from 'http';
import path from 'path';
import express from 'express';
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

export interface Route {
    callback: any,
    resource?: string
}

export class Server {

    public getApp = () => { return this.app; }
    public getListener: () => Promise<http.Server> = async () => { 
        if(this.server == null) { await sleep(100); return (await this.getListener()); }  return this.server; 
    }
    public addRoute = (route: Route) => { this.app.use(route.resource ?? '*', route.callback); }

    protected isProd = () => process.env.NODE_ENV === 'prod';

    private app = express();
    private server: http.Server;
    private props: { [key: string]: unknown };
    private auth: Authenticator;
    private db: DatabaseConnection;

    private redis: {
        client?: RedisClient,
        store?: RedisStore
    } = {};

    constructor(props?: { [key: string]: unknown }) {
        // Setup
        this.props = props ?? {};
        this.auth = new Authenticator(this);
        this.db = new DatabaseConnection(this);

        // Format
        this.app.use(express.static(path.resolve(__dirname, './public/')));
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(cookieParser());
        this.app.enable('trust proxy');

        const ttl = (60 * 60 * 24);
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
                domain: `.${process.env.ROOT_URL}`,
                sameSite: true,
                httpOnly: true,
                maxAge: ttl
            },
            rolling: true
        });

        this.app.use(sessionParser);

        // Routes
        const routes = props?.routes as Route[] ?? [];
        for(let i = 0; i < routes.length ?? []; i++) { this.addRoute(routes[i]); }

        // Listener
        this.server = this.app.listen(props?.port ?? process.env.SERVER_PORT ?? 8000);
    }

    public getAuthenticator() { return this.auth; }
    public getDatabaseConnection() { return this.db; }
}