import { google } from 'googleapis';

import { Server } from './server';
import { ErrorPage, SignUpPage, ValidAuthPage } from './pages';
import { User, UserData } from './user';

// Redirects are completed before req.session is saved, needs to be fixed

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

    public async handleUserAuth(req: any, res: any, next: any, user: any, userdata: any = {}) {
        if(user instanceof Error) { return res.send(SignUpPage(req, res, this.server.getProps(), userdata)); }
        user = user as User; req.session.user = user.toJSON();
        if(await this.waitForSession(req, res)) {
            return res.send(ValidAuthPage(req, res, this.server.getProps(), user.getName()));
        }

        return res.send(ErrorPage(req, res, this.server.getProps(), {
            Message: "Failed to Auth User.", Code: 0x0104
        }))
    }

    public async createAccount(req: any, res: any, next: any) {
        const { code, username, data } = req.body;

        // Lookup Code for Role - TODO
            // could generate uuuids, add to seperate table that describes roles/permissions
            // would be applied here

        let json = JSON.parse(data.replace(/'/g, '\"'));
        let validNames = await this.server.getDatabaseConnection().availableUserNames(username);
        if(validNames instanceof Error)
            return res.json({ Error: "Name is already taken." });

        let userdata = {
            uuid: User.GenerateUUID(),
            name: username ?? null,
            age: Date.now(),
            connections: json ?? {}
        }

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
                return res.json({ Redirect: '/profile' });
            }
    
            return res.json({ 
                Error: 'Issue creating session. Contact Mods.', 
                Code: 0x0102
            });
        }

        return res.json({ Error: "Issue with generated user info, try again later.", Code: 0x0103 });
    }

    // #region Twitch
    public authTwitch(req: any, res: any, next: any) {
        res.redirect(TwitchAuth.OAuthLink(this.server.getProps()?.domain + '/verify/twitch'));
    }

    public async verifyTwitch(req: any, res: any, next: any) {
        let tokens = await TwitchAuth.GetTokens(req, this.server.getProps()?.domain + '/verify/twitch');
        let info = await TwitchAuth.GetInfoFromToken(tokens);
        let user = await this.server.getDatabaseConnection().getUserFromTwitchID(info?.id ?? "");
        return await this.handleUserAuth(req, res, next, user, { 
            twitch: { id: info?.id, name: info?.display_name ?? info?.login },
        });
    }
    // #endregion

    // #region Youtube
    public authYoutube(req: any, res: any, next: any) {
        return res.redirect(YoutubeAuth.OAuthLink(this.server.getProps()?.domain + '/verify/youtube'));
    }

    public async verifyYoutube(req: any, res: any, next: any) {
        let tokens = await YoutubeAuth.GetTokens(req);
        if(this.debug) { console.log("Youtube Tokens:", tokens); }
        let info = await YoutubeAuth.GetInfoFromToken(tokens);
        if(this.debug) { console.log("Youtube Data:", info); }

        let user = await this.server.getDatabaseConnection().getUserFromYoutubeID(info?.id ?? "");
        return await this.handleUserAuth(req, res, next, user, { 
            youtube: { id: info?.id, name: info?.username }, // placeholder username field name
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
}

class YoutubeAuth {
    private static service = google.youtube({ version: 'v3' });
    private static client = new google.auth.OAuth2(
        process.env.YOUTUBE_ID, 
        process.env.YOUTUBE_SECRET,
        `https://www.${process.env.ROOT_URL}/auth/youtube`
    );

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
            }, (err, resp) => {
                if(err) { console.log(err); rej(err); }
                if(resp?.data?.pageInfo?.totalResults == 0)
                    return rej(new Error("No Youtube channel for Google account."));

                res(resp?.data?.items?.[0] ?? null);
            });
        });

        return await promise as any;
    }
}