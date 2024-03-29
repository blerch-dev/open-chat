import { Pool, QueryResult } from 'pg';

import { Server } from './server';
import { User, UserData, UserConnection, UserConnectionDB, RoleValue, Roles } from './user';
import { sleep, generateSelectorAndValidator, hashValue, randomValue } from './tools';

const FormatDBString = (hardFormat = false) => {
    if(hardFormat) { console.log("Forcing Table Drops!"); }

    return `
    ${hardFormat ? 'DROP TABLE IF EXISTS users;' : ''}
    CREATE TABLE IF NOT EXISTS "users" (
        "uuid"          uuid UNIQUE NOT NULL,
        "name"          varchar(32) UNIQUE NOT NULL,
        "created_at"    timestamp without time zone NOT NULL DEFAULT NOW(),
        "last_login"    timestamp without time zone NOT NULL DEFAULT NOW(),
        "roles"         bigint NOT NULL DEFAULT 0,
        "valid"         boolean NOT NULL DEFAULT 'yes',
        PRIMARY KEY ("uuid")
    );

    ${hardFormat ? 'DROP TABLE IF EXISTS user_codes;' : ''}
    CREATE TABLE IF NOT EXISTS "user_codes" (
        "code"          varchar(32) UNIQUE NOT NULL,
        "created_at"    timestamp without time zone NOT NULL DEFAULT NOW(),
        "expires"       timestamp without time zone DEFAULT NOW() + interval '1 day',
        "roles"         bigint NOT NULL DEFAULT 0,
        "uses"          bigint DEFAULT 1,
        PRIMARY KEY ("code")
    );

    ${hardFormat ? 'DROP TABLE IF EXISTS user_connections;' : ''}
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

    ${hardFormat ? 'DROP TABLE IF EXISTS user_tokens;' : ''}
    CREATE TABLE IF NOT EXISTS "user_tokens" (
        "user_id"               uuid NOT NULL,
        "selector"              varchar(12) NOT NULL,
        "salt"                  varchar(64) NOT NULL,
        "hashed_validator"      varchar(128) NOT NULL,
        "created_at"            timestamp without time zone NOT NULL DEFAULT NOW(),
        "expires"               timestamp without time zone NOT NULL,
        PRIMARY KEY ("selector")
    );

    ${hardFormat ? 'DROP TABLE IF EXISTS user_status_effects;' : ''}
    CREATE TABLE IF NOT EXISTS "user_status_effects" (
        "id"                    serial,
        "user_id"               uuid NOT NULL,
        "type"                  smallint NOT NULL DEFAULT 0,
        "valid"                 boolean NOT NULL DEFAULT 'yes',
        "created_at"            timestamp without time zone NOT NULL DEFAULT NOW(),
        "expires"               timestamp without time zone DEFAULT NOW() + interval '1 day',
        "notes"                 text,
        PRIMARY KEY ("id")
    );

    ${hardFormat ? 'DROP TABLE IF EXISTS user_subscriptions;' : ''}
    CREATE TABLE IF NOT EXISTS "user_subscriptions" (
        "id"                    serial,
        "user_id"               uuid NOT NULL,
        "level"                 smallint NOT NULL DEFAULT 0,
        "platform"              varchar(32) NOT NULL,
        "expires"               timestamp without time zone DEFAULT NOW() + interval '30 days',
        PRIMARY KEY ("id")
    );
    `;
}

interface QueryOutput {
    data: any,
    [key: string]: any
}

export class DatabaseConnection {
    static FormatDatabase = async (hardFormat = false) => {
        let db = new DatabaseConnection();
        let result = await db.queryDB(FormatDBString(hardFormat));
        if(result instanceof Error) { return result; }

        if(hardFormat) { // Creates Codes for Owner/Admin (1 User Only)
            let str = `INSERT INTO user_codes (code, roles) VALUES ($1, $2);`;
            await db.queryDB(str, randomValue(32), Roles?.Owner?.value ?? 0);
            await db.queryDB(str, randomValue(32), Roles?.Admin?.value ?? 0);
        }

        return result;
    }

    private server: Server | undefined;
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

    constructor(server?: Server) {
        this.server = server;
        this.pool.connect()
            .then((pc) => { this.isConnected = true; })
            .catch((reason) => { this.isConnected = false; /* console.log("DB Error:", reason); */ });
    }

    // #region Helpers
    private async waitForConnection(attempt = 0): Promise<boolean> {
        if(!this.isConnected) {
            if(attempt >= this.maxAttempt) { return false }
            await sleep(500); return await this.waitForConnection(attempt + 1);
        }

        return true;
    }

    private parseQueryResult(res: QueryResult): QueryOutput {
        const data = res.rows?.[0] ?? {};
        return { data: data, fullData: res?.rows, meta: {
            rowCount: res.rowCount
        }};
    }

    // needs view for user_status_effects
    private fullUserSearch(str: string, ...vals: any[]): Promise<QueryResult | Error> {
        let query = `
            SELECT users.*,
            to_json(user_connections.*) as connections,
            array_agg(to_json(user_status_effects.*)) as records,
            array_agg(to_json(user_subscriptions.*)) as subscriptions
            FROM users
            LEFT JOIN user_connections ON users.uuid = user_connections.user_id
            LEFT JOIN user_status_effects ON users.uuid = user_status_effects.user_id
                AND user_status_effects.valid = 'yes'
                AND user_status_effects.expires > CURRENT_TIMESTAMP
            LEFT JOIN user_subscriptions ON users.uuid = user_subscriptions.user_id
            ${str}
            GROUP BY users.uuid, user_connections.*, user_status_effects.*, user_subscriptions.*;
        `;

        return this.queryDB(query, ...vals);
    }

    public async queryDB(query: string, ...values: any): Promise<QueryResult | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }
        return new Promise((res, rej) => {
            this.pool.query(query, values, (err, result) => {
                if(err) { return rej(err); } res(result);
            });
        });
    }
    // #endregion

    // #region User
    private validUser(data: UserData | any = {}): User | Error {
        data = User.ValidateUserData(data);
        return User.ValidUserData(data) ? new User(data) : Error("Invalid User Data.");
    }

    public async getUser(data: User | string | UserData): Promise<User | Error> {
        // data could be UserData or User or UUID or Username
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let result: QueryResult | Error;
        if(data instanceof User) {
            result = await this.fullUserSearch(`WHERE uuid::text like $1`, data.getUUID());
        } else if(typeof data === 'string') {
            result = await this.fullUserSearch(`WHERE uuid::text like $1 OR LOWER(name) = $2`, data, data.toLowerCase());
        } else {
            result = await this.fullUserSearch(`WHERE uuid::text like $1`, data.uuid); // UserData
        }

        if(result instanceof Error) { return result; }
        return this.validUser(this.parseQueryResult(result).data);
    }

    public async createUser(data: User | UserData): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let info = (data as User)?.toJSON() ?? data as UserData;
        if(!User.ValidUserData(info))
            return Error("Invalud user data was given. Can't create user.");

        // console.log("Create User Data:", info);

        let query = 'SELECT * FROM users WHERE uuid = $1 OR LOWER(name) = $2';
        let result = await this.queryDB(query, info.uuid, info.name.toLowerCase());
        if(result instanceof Error)
            return result;
        else if(result?.rowCount)
            return Error("Name/ID was already taken. Try again with a valid Name/ID.");

        // Connections
        let added = await this.setConnections(info?.uuid, info?.connections ?? {});
        if(added instanceof Error) {
            return added;
        } else if(added !== true) {
            return Error("Issue adding connection to DB.");
        }

        // Subscriptions
        // -- todo

        query = 'INSERT INTO users (uuid, name, created_at, last_login, roles)'
            + ' VALUES ($1, $2, to_timestamp($3), to_timestamp($4), $5)';

        let time = Math.floor((info?.age ?? 0) / 1000);
        let values = [info?.uuid, info?.name, time, time, info?.roles];
        result = await this.queryDB(query, ...values);
        if(result instanceof Error)
            return result;

        return this.validUser(info);
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
        return this.parseQueryResult(result).meta.rowCount > 0;
    }

    // Quick Functions
    public async availableUUIDs(...ids: string[]): Promise<string[] | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        if(ids.length == 0)
            return [];

        let query = `SELECT uuid FROM users WHERE`;
        for(let i = 0; i < ids.length; i++) {
            query += ` uuid = $${i + 1}`;
            if(i + 1 < ids.length)
                query += ' OR';
        }

        let result = await this.queryDB(query, ...ids);
        if(result instanceof Error)
            return result;

        //console.log("UUIDSearch Result:", result.rows, ids, );
        let usedIds = (result as QueryResult).rows;
        return ids.filter(word => !(usedIds.includes(word)));
    }

    public async availableUserNames(...names: string[]): Promise<string[] | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        if(names.length == 0)
            return [];

        let query = 'SELECT name FROM users WHERE';
        for(let i = 0; i < names.length; i++) {
            query += ` name = $${i + 1}`;
            if(i + 1 < names.length)
                query += ' OR';
        }

        let result = await this.queryDB(query, ...names);
        if(result instanceof Error)
            return result;

        // Filter
        //console.log("NameSearch Result:", result);
        let usedNames = (result as QueryResult).rows.map((name) => name.toLowerCase());
        return names.filter(name => !(usedNames.includes(name.toLowerCase())));
    }
    // #endregion

    // #region Connections
    public async setConnections(uuid: string, data: UserConnection | UserConnectionDB, overwrite = false): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = "SELECT * FROM user_connections WHERE user_id = $1";
        let result = await this.queryDB(query, uuid);
        if(result instanceof Error)
            return result;

        let current = this.parseQueryResult(result).data;

        query = 'INSERT INTO user_connections (user_id, twitch_id, twitch_name, youtube_id, youtube_name, discord_id, discord_name)'
            + ' VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id) DO UPDATE SET'
            + ' twitch_id = $2, twitch_name = $3,'
            + ' youtube_id = $4, youtube_name = $5,'
            + ' discord_id = $6, discord_name = $7';

        //console.log("Current User Connection Data:", current);
        let getValue = (value: any, name: string) => {
            let finalValue = (overwrite ? value : current?.[name]) || (!overwrite ? value : current?.[name]) || null;
            // console.log(`Get Value: '${value}',\t '${current?.[name]}',\t '${finalValue}'`);
            return finalValue;
        }

        //console.log("New Connection Values:", data);
        //console.log(`\nShould Overwrite: ${overwrite}`);
        let values = [
            uuid, 
            getValue((data as UserConnection)?.twitch?.id ?? (data as UserConnectionDB)?.twitch_id, 'twitch_id'),
            getValue((data as UserConnection)?.twitch?.name ?? (data as UserConnectionDB)?.twitch_name, 'twitch_name'),
            getValue((data as UserConnection)?.youtube?.id ?? (data as UserConnectionDB)?.youtube_id, 'youtube_id'),
            getValue((data as UserConnection)?.youtube?.name ?? (data as UserConnectionDB)?.youtube_name, 'youtube_name'),
            getValue((data as UserConnection)?.discord?.id ?? (data as UserConnectionDB)?.discord_id, 'discord_id'),
            getValue((data as UserConnection)?.discord?.name ?? (data as UserConnectionDB)?.discord_name, 'discord_name')
        ];

        //console.log("New Connection Values:", values);
        result = await this.queryDB(query, ...values);
        if(result instanceof Error)
            return result;

        // Check if Valid
        return result?.rowCount > 0;
    }

    public async removeConnections(uuid: string): Promise<boolean | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        return false;
    }

    public async getOwnerConnections() {
        // get uuid of owner
        // if result, return all connections for that uuid
        // else return error
    }
    // #endregion

    // #region Tokens
    private async createTokenParts(salt?: string) {
        let data = generateSelectorAndValidator();
        let hash_output = await hashValue(data.validator, salt);
        if(hash_output instanceof Error) { console.log("Error Generating Hash:", hash_output); return hash_output; }
        return { selector: data.selector, validator: data.validator, hash: hash_output.hash, salt: hash_output.salt };
    }

    private async handleTokenDBWrite(user_id: string, expires: number, additional_query?: string) {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let token_parts = await this.createTokenParts();
        if(token_parts instanceof Error) { return token_parts; }
        
        let timestamp = Math.floor((expires * (24 * 60 * 60 * 1000) + Date.now()) / 1000);
        let query = 'INSERT INTO user_tokens (selector, user_id, salt, hashed_validator, expires)'
            + 'VALUES ($1, $2, $3, $4, to_timestamp($5))';

        if(additional_query) { query += additional_query; }

        let values = [token_parts.selector, user_id, token_parts.salt, token_parts.hash, timestamp];
        let result = await this.queryDB(query, ...values);
        if(result instanceof Error) { return result; }

        return `${token_parts.selector}-${token_parts.validator}`;
    }

    public async getTokenBySelector(selector: string): Promise<Error | QueryOutput> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = 'SELECT * FROM user_tokens WHERE selector = $1';
        let result = await this.queryDB(query, selector);
        if(result instanceof Error)
            return result;

        return this.parseQueryResult(result).data;
    }

    public async validateTokenSession(token_str: string) {
        let args = token_str.split('-');
        let token = await this.getTokenBySelector(args[0]);
        if(token instanceof Error) { return token; }

        //console.log(`Validating Token ${token_str}:`, token);
        let token_hash = await hashValue(args[1], token.salt ?? process.env.HASH_CODE);
        if(token_hash instanceof Error) { return token_hash; }

        if(token_hash.hash === token.hashed_validator) {
            return await this.getUser(token.user_id);
        }

        return new Error("Failed to Validate Session from Token.");
    }

    // Not Needed
    public async createUserToken(user_id: string, expires = 7 * 4) {
        return await this.handleTokenDBWrite(user_id, expires);
    }

    // Will Create as Well
    public async refreshToken(user_id: string, expires = 7 * 4) {
        let query = ' ON CONFLICT (user_id) DO UPDATE SET'
            + 'selector = $1, salt = $3, hashed_validator = $4, expires = to_timestamp($5)';

        return await this.handleTokenDBWrite(user_id, expires, query);
    }
    // #endregion

    // #region Twitch
    public async getUserFromTwitchID(id: string): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = await this.fullUserSearch('WHERE user_connections.twitch_id = $1', id.toString());
        if(query instanceof Error) { return query; }
        return this.validUser(this.parseQueryResult(query).data);
    }
    // #endregion

    // #region Youtube
    public async getUserFromYoutubeID(id: string): Promise<User | Error> {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query = await this.fullUserSearch('WHERE user_connections.youtube_id = $1', id.toString());
        if(query instanceof Error) { return query; }
        return this.validUser(this.parseQueryResult(query).data);
    }
    // #endregion

    // #region User Codes
    public async getUserCodeValue(code: string) {
        if(!(await this.waitForConnection())) { return this.ConnectionError; }

        let query_str = 'UPDATE user_codes SET uses = uses - 1'
            + ' WHERE code = $1 AND uses > $2 AND expires > to_timestamp($3) RETURNING *'
        let query = await this.queryDB(query_str, code, 0, Math.floor(Date.now() / 1000));
        if(query instanceof Error || query.rowCount == 0) { return 0; }

        //console.log("Query Result:", query);
        return this.parseQueryResult(query).data.roles;
    }
    // #endregion
}