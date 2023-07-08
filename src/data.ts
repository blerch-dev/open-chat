import { Pool, QueryResult } from 'pg';

import { User, UserData, UserConnection } from './user';
import { Server } from './server';
import { sleep } from './tools';

const FormatDBString = () => {
    return `
    DROP TABLE IF EXISTS users;
    CREATE TABLE IF NOT EXISTS "users" (
        "uuid"          uuid UNIQUE NOT NULL,
        "name"          varchar(32) UNIQUE NOT NULL,
        "created_at"    timestamp NOT NULL DEFAULT NOW(),
        "last_login"    timestamp NOT NULL DEFAULT NOW(),
        "roles"         bigint NOT NULL DEFAULT 0,
        "status"        smallint NOT NULL DEFAULT 1,
        PRIMARY KEY ("uuid")
    );

    DROP TABLE IF EXISTS user_connections;
    CREATE TABLE IF NOT EXISTS "user_connections" (
        "user_id"       uuid NOT NULL,
        "twitch_id"     varchar(64),
        "twitch_name"   varchar(32),
        "youtube_id"    varchar(64),
        "youtube_name"  varchar(32),
        "discord_id"    varchar(64),
        "discord_name"  varchar(32),
        PRIMARY KEY ("user_id")
    );

    DROP TABLE IF EXISTS user_tokens;
    CREATE TABLE IF NOT EXISTS "user_tokens" (
        "user_id"               uuid NOT NULL,
        "selector"              varchar(12) NOT NULL,
        "hashed_validator"      varchar(128) NOT NULL,
        "expires"               timestamp NOT NULL,
        PRIMARY KEY ("selector")
    );
    `;
}

interface QueryOutput {
    data: any,
    [key: string]: any
}

export class DatabaseConnection {
    static FormatString = FormatDBString();

    private server: Server;
    private ConnectionError = new Error("Could not connect to DB.");
    private maxAttempt = 10;
    private isConnected = false;
    private pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_DATA,
        password: process.env.DB_PASS,
        port: Number(process.env.DB_PORT),
        // max: 20,
        // idleTimeoutMillis: 30000,
        // connectionTimeoutMillis: 2000
    });

    constructor(server: Server) {
        this.server = server;
        this.pool.connect()
            .then((pc) => { this.isConnected = true; })
            .catch((reason) => { this.isConnected = false; /* console.log("DB Error:", reason); */ });
    }

    private async waitForConnection(attempt = 0): Promise<boolean> {
        if(!this.isConnected) {
            if(attempt >= this.maxAttempt) { return false }
            await sleep(500); return await this.waitForConnection(attempt + 1);
        }

        return true;
    }

    private async parseQueryResult(res: QueryResult): Promise<QueryOutput> {
        const data = res.rows?.[0];
        console.log("Parsing Query Result:", res.command, res.rowCount, res.rows, data);
        return { data: data, meta: {
            rowCount: res.rowCount
        }};
    }

    private fullUserSearch(str: string, ...vals: any[]): Promise<QueryResult | Error> {
        let query = `
            SELECT users.*,
            to_json(user_connections.*) as connections
            FROM users
            LEFT JOIN user_connections ON users.uuid = user_connections.user_id
            ${str}
        `;

        return this.queryDB(query, vals);
    }

    public async queryDB(query: string, ...values: any): Promise<QueryResult | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }
        return new Promise((res, rej) => {
            this.pool.query(query, values, (err, result) => {
                if(err) { return rej(err); } res(result);
            });
        });
    }

    // #region User
    public validUser(data: UserData | any = {}): User | Error {
        return User.ValidUserData(data) ? new User(data) : Error("Invalid User Data.");
    }

    public async getUser(data: User | string | UserData): Promise<User | Error> {
        // data could be UserData or User or UUID or Username
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let result: QueryResult | Error;
        if(data instanceof User) {
            result = await this.fullUserSearch(`WHERE uuid = $1`, data.getUUID());
        } else if(typeof data === 'string') {
            result = await this.fullUserSearch(`WHERE uuid = $1 OR name = $1`, data);
        } else {
            result = await this.fullUserSearch(`WHERE uuid = $1`, data.uuid); // UserData
        }

        if(result instanceof Error) { return result; }
        return this.validUser((await this.parseQueryResult(result)).data);
    }

    public async createUser(data: User | UserData): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        // create user

        return this.validUser();
    }

    public async updateUser(data: User | UserData): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        // update user

        return this.validUser();
    }

    public async deleteUser(data: User | string | UserData): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let result: QueryResult | Error;
        if(data instanceof User) {
            result = await this.queryDB(`DELETE FROM users WHERE uuid = $1`, data.getUUID());
        } else if(typeof data === 'string') {
            result = await this.queryDB(`DELETE FROM users WHERE uuid = $1 OR name = $1`, data);
        } else {
            result = await this.queryDB(`DELETE FROM users WHERE WHERE uuid = $1`, data.uuid); // UserData
        }
        
        if(result instanceof Error) { return result; }
        return (await this.parseQueryResult(result)).deleteCount > 0;
    }

    // Quick Functions
    public async availableUserName(...names: string[]): Promise<string[] | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        if(names.length == 0)
            return [];

        let query = 'WHERE';
        for(let i = 0; i < names.length; i++) {
            query += ` name = $${i + 1}`;
            if(i + 1 < names.length)
                query += ' OR';
        }

        let result = await this.queryDB(query, ...names);
        if(result instanceof Error)
            return result;

        // Filter
        console.log("NameSearch Result:", result);
        return [];
    }
    // #endregion

    // #region Connections
    public async addConnection(uuid: string, data: UserConnection): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        return false;
    }

    public async updateConnection(uuid: string, data: UserConnection): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        return false;
    }

    public async removeConnection(uuid: string): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        return false;
    }
    // #endregion

    // #region Tokens

    // #endregion

    // #region Twitch
    public async getUserFromTwitchID(id: string): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = await this.fullUserSearch('WHERE user_connections.twitch_id = $1', id);
        if(query instanceof Error) { return query; }
        return this.validUser((await this.parseQueryResult(query)).data);
    }
    // #endregion

    // #region Youtube
    public async getUserFromYoutubeID(id: string): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = await this.fullUserSearch('WHERE user_connections.youtube_id = $1', id);
        if(query instanceof Error) { return query; }
        return this.validUser((await this.parseQueryResult(query)).data);
    }
    // #endregion
}