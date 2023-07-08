import { google } from 'googleapis';

import { Server } from './server';
import { SignUpPage } from './pages';
import { User } from './user';

export class Authenticator {

    private server: Server;
    private debug: boolean;

    constructor(server: Server, debug = undefined) {
        this.server = server;
        this.debug = debug ?? !this.server.isProd();
    }

    public async createAccount(req: any, res: any, next: any): Promise<boolean> {
        return false;
        
        // check if name is available
        // create and return true or return false
    }

    // #region Twitch
    public authTwitch(req: any, res: any, next: any) {
        res.redirect(TwitchAuth.OAuthLink(this.server.getProps()?.domain + '/verify/twitch'));
    }

    public async verifyTwitch(req: any, res: any, next: any) {
        let tokens = await TwitchAuth.GetTokens(req, this.server.getProps()?.domain + '/verify/twitch');
        let info = await TwitchAuth.GetInfoFromToken(tokens);
        let user = await this.server.getDatabaseConnection().getUserFromTwitchID(info?.id ?? "");
        if(user instanceof Error) { return res.send(SignUpPage(req, res, this.server.getProps())); }
        user = user as User; req.session.user = user.toJSON(); return res.redirect('/profile');
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
        if(user instanceof Error) { return res.send(SignUpPage(req, res, this.server.getProps())); }

        user = user as User;
        req.session.user = user.toJSON();
        return res.redirect('/profile');
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