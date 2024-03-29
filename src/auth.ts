import { google } from 'googleapis';

import { Server } from './server';
import { ErrorPage, SignUpPage, ValidAuthPage } from './pages';
import { User, UserData } from './user';

// Redirects are completed before req.session is saved, needs to be fixed

// need to use ngrok or alternative to test eventsub, once subscriptions are in place it can be public facing

export class Authenticator {

    private server: Server;
    private debug: boolean;

    constructor(server: Server, debug = undefined) {
        this.server = server;
        this.debug = debug ?? !this.server.isProd();
    }

    private async waitForSession(req: any, res: any) {
        // any checks needed
        return true;
    }

    public async handleAutoSession(req: any, res: any) {
        if(req.session.user || !req.cookies.ssi || !req.cookies.ssi_token) { 
            return Error("Auto Session is not required or not configured."); 
        }

        return await this.server.getDatabaseConnection().validateTokenSession(req.cookies.ssi_token);
    }

    public async handleUserAuth(req: any, res: any, next: any, user: any, userdata: any = {}) {
        if(req.session.user) { return await this.addUserConnection(req, res, userdata) }
        else if(user instanceof Error) { return res.send(SignUpPage(req, res, this.server.getProps(), userdata)); }

        user = user as User; req.session.user = user.toJSON();
        if(await this.waitForSession(req, res)) {
            if(req.cookies.ssi) { await this.setAutoHandle(req, res, user.getUUID()); }
            //return res.send(ValidAuthPage(req, res, this.server.getProps(), user.getName()));
            return res.redirect('/profile');
        }

        return res.send(ErrorPage(req, res, this.server.getProps(), {
            Message: "Failed to Auth User.", Code: 0x0104
        }));
    }

    public async createAccount(req: any, res: any, next: any) {
        const { code, username, data } = req.body;

        let json: { [key: string]: any };
        try {
            json = JSON.parse(data.replace(/'/g, '\"'));
            if(!json || Object.keys(json).length == 0) { 
                return res.json({ Error: 'Issue with OAuth Platform. Try again later.', Code: 0x0104 }); 
            }
        } catch(err) {
            return res.json({ Error: 'Issue with Parsing Information. Try again later.', Code: 0x0105 });
        }

        // check if username is valid string (no commas, special characters, etc)

        let validNames = await this.server.getDatabaseConnection().availableUserNames(username);
        if(validNames instanceof Error) { return res.json({ Error: "Issue creating user." }); }
        else if(validNames.length < 1) { return res.json({ Error: "Name is already taken." }); }

        //console.log("Pre Data Definition:", code, username, json, validNames);
        let role_code = code ? await this.server.getDatabaseConnection().getUserCodeValue(code) : 0;

        let userdata = {
            uuid: User.GenerateUUID(),
            name: username ?? null,
            age: Date.now(),
            roles: role_code,
            connections: json?.connections ?? {},
            subscriptions: json?.subscriptions ?? []
        }

        // DB function to repeat create and check on conflict, return first available uuid for userdata above - TODO
        let result = await this.server.getDatabaseConnection().availableUUIDs(userdata.uuid);
        // console.log("Check:", User.ValidUserData(userdata), !(result instanceof Error), userdata, result);

        if(User.ValidUserData(userdata) && !(result instanceof Error) && result.length == 1) {
            let user = await this.server.getDatabaseConnection().createUser(new User(userdata));
            if(user instanceof Error) {
                console.log("Error Creating User -", user);
                return res.json({ Error: "Error creating user, try again later.", Code: 0x0101 });
            }

            req.session.user = (user as User).toJSON();
            if(await this.waitForSession(req, res)) {
                return res.json({ Redirect: '/profile' }); // might send to valid auth page as well, but works for now
            }
    
            return res.json({ 
                Error: 'Issue creating session. Contact Mods.', 
                Code: 0x0102
            });
        }

        return res.json({ Error: "Issue with generated user info, try again later.", Code: 0x0103 });
    }

    private async syncAccount(req: any, res: any, redirect_uri: string) {
        if(!req.session?.user) { return res.redirect(redirect_uri); }

        //console.log("Syncing Account:", req.session?.user?.uuid);
        let user_id = req.session?.user?.uuid;
        let result = await this.server.getDatabaseConnection().getUser(user_id);
        //console.log("Sync Result:", result);
        if(result instanceof Error) { return res.redirect(redirect_uri); }
        req.session.user = result.toJSON();
        return res.redirect(redirect_uri);
    }

    private async addUserConnection(req: any, res: any, connection: any) {
        let keys = Object.keys(connection), pass_obj: any = {}, added_field = false;
        for(let i = 0; i < keys.length; i++) {
            if(req.session?.user?.connections[keys[i]]?.id === undefined) {
                added_field = true;
                pass_obj[keys[i]] = connection[keys[i]];
            }
        }

        if(added_field === false) {
            console.log("No Field to Add:", connection, req.session.user.connections, pass_obj);
            return res.redirect('/profile');
        }

        let result = await this.server.getDatabaseConnection().setConnections(req.session?.user?.uuid, pass_obj);
        //console.log("Set Connections Result:", result);
        if(result instanceof Error || result === false) {
            return res.send(ErrorPage(req, res, this.server.getProps(), {
                Message: "Failed to Add User Connection.", 
                Code: result === false ? 0x0106 : 0x0105
            }));
        }

        return await this.syncAccount(req, res, '/profile');
    }

    private async setAutoHandle(req: any, res: any, user_id: any) {
        // console.log("Setting Auth Handle", req?.cooies?.ssi_token, );
        const week_time = (1000 * 60 * 60 * 24 * 7);
        const setCookie = (token: string) => {
            // console.log("Configured Auto Handle Cookie!");
            res.cookie('ssi_token', token, { path: '/', httpOnly: true, secure: this.server.isProd(), maxAge: week_time * 4 });
        }
        
        // console.log("SSI Token:", req.cookies?.ssi, req.cookies?.ssi_token);
        const db = this.server.getDatabaseConnection();
        if(req.cookies?.ssi_token) {
            let token_info = await db.getTokenBySelector(req.cookies.ssi_token.split('-')[0]);
            if(token_info instanceof Error) { if(this.debug) { console.log(token_info); } return; }
    
            let renewal = (new Date(token_info.data[0].expires).getTime() - Date.now()) < week_time;
            if(renewal && token_info.data[0].user_id == user_id) { 
                let result = await db.refreshToken(user_id);
                if(result instanceof Error) { if(this.debug) { console.log(result); } return; }
                setCookie(result as string);
            }
        } else {
            let token = await db.createUserToken(user_id);
            if(token instanceof Error) { if(this.debug) { console.log(token); } return; }
            setCookie(token);
        }
    }

    // #region Twitch
    public authTwitch(req: any, res: any, next: any) {
        res.redirect(TwitchAuth.OAuthLink(this.server.getProps()?.domain + '/verify/twitch'));
    }

    public async verifyTwitch(req: any, res: any, next: any) {
        if(req?.query?.error) { return ErrorPage(req, res, this.server.getProps(), {
            Message: req.query.error, Code: 0x0107
        }); }

        let tokens = await TwitchAuth.GetTokens(req, this.server.getProps()?.domain + '/verify/twitch');
        let info = await TwitchAuth.GetInfoFromToken(tokens);
        let subs = await TwitchAuth.CheckSubscriptions(tokens, info?.id);
        let user = await this.server.getDatabaseConnection().getUserFromTwitchID(info?.id ?? "");
        return await this.handleUserAuth(req, res, next, user, { 
            connections: { twitch: { id: info?.id, name: info?.display_name ?? info?.login } },

        });
    }
    // #endregion

    // #region Youtube
    public authYoutube(req: any, res: any, next: any) {
        let redirect = this.server.getProps()?.domain + '/verify/youtube';
        YoutubeAuth.getClient(redirect);
        return res.redirect(YoutubeAuth.OAuthLink(redirect));
    }

    public async verifyYoutube(req: any, res: any, next: any) {
        // check for error

        let tokens = await YoutubeAuth.GetTokens(req);
        // if(this.debug) { console.log("Youtube Tokens:", tokens); }
        let info = await YoutubeAuth.GetInfoFromToken(tokens);
        let snip = info?.snippet;
        // if(this.debug) { console.log("Youtube Data:", info); }

        let user = await this.server.getDatabaseConnection().getUserFromYoutubeID(info?.id ?? "");
        return await this.handleUserAuth(req, res, next, user, {
            connections: { youtube: { id: info?.id, name: snip?.title } },

        });
    }
    // #endregion
}

class TwitchAuth {
    static OAuthLink = (redirect: string) => `https://id.twitch.tv/oauth2/authorize`
        + `?client_id=${process.env.TWITCH_ID}&redirect_uri=${redirect}&response_type=code`
        + `&scope=user:read:subscriptions+channel:read:polls+channel:read:subscriptions+channel:read:vips`
        + `+moderation:read+moderator:read:blocked_terms+chat:edit+chat:read&state=twitch`;

    static GetTokens = async (req: any, redirect: string) => {
        let url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_ID}`
            + `&client_secret=${process.env.TWITCH_SECRET}&code=${req.query.code}`
            + `&grant_type=authorization_code&redirect_uri=${redirect}`;

        let validate = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/vnd.twitchtv.v3+json' } });
        return await validate.json();
    }

    static RefreshTokens = async (tokens: any) => {}

    static GetInfoFromToken = async (tokens: any) => {
        return (await (await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${tokens?.access_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`
            }
        })).json())?.data?.[0];
    }

    static CheckSubscriptions = async (tokens?: any, user_platform_id?: string) => {
        // get tokens if undefined
        if(!process.env.TWITCH_CHANNEL_ID) { return undefined; }
        let args = `?broadcaster_id=${process.env.TWITCH_CHANNEL_ID}&user_id=${user_platform_id}`
        let result = (await (await fetch(`https://api.twitch.tv/helix/subscriptions/user${args}`, {
            headers: {
                'Authorization': `Bearer ${tokens?.access_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`
            }
        })).json());
        // parse result, return relevant data
        // console.log("Twitch Subs:", result, tokens);
        return result?.data?.[0]?.tier / 1000;
    }
}

class YoutubeAuth {
    private static service = google.youtube({ version: 'v3' });

    private static redirect_uri: string | undefined;
    private static client: any | undefined;

    static getClient = (redirect: string) => {
        if(YoutubeAuth.client && YoutubeAuth.redirect_uri === redirect) { return YoutubeAuth.client; }
        YoutubeAuth.client = new google.auth.OAuth2(
            process.env.YOUTUBE_ID, 
            process.env.YOUTUBE_SECRET,
            redirect
        );

        return YoutubeAuth.client;
    }

    static OAuthLink = (redirect: string) => this.client.generateAuthUrl({
        access_type: 'offline',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        redirect_uri: redirect
    });

    static GetTokens = async (req: any) => {
        const { code } = req.query;
        return (await this.client.getToken(code)).tokens;
    }

    static GetInfoFromToken = async (tokens: any) => {
        this.client.setCredentials(tokens);
        let promise = new Promise((res, rej) => {
            this.service.channels.list({
                auth: this.client,
                maxResults: 1,
                part: ['snippet'],
                mine: true
            }, (err: any, resp: any) => {
                if(err) { console.log(err); rej(err); }
                if(resp?.data?.pageInfo?.totalResults == 0)
                    return rej(new Error("No Youtube channel for Google account."));

                res(resp?.data?.items?.[0] ?? null);
            });
        });

        let result = await promise as any;
        return result;
    }

    static CheckSubscriptions = async () => {

    }
}