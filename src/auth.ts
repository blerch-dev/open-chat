import { google } from 'googleapis';
import { Server } from './server';

export class Authenticator {

    private server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    // #region Twitch
    public authTwitch(res: any) {
        res.redirect(TwitchAuth.OAuthLink());
    }

    public async verifyTwitch(req: any, res: any, next: any) {
        let info = await TwitchAuth.GetInfoFromToken(await TwitchAuth.GetTokens(req));
        console.log("Twitch Data:", info);
        return res.end();

        let user = this.server.getDatabaseConnection().getUserFromTwitchID(info?.id ?? "");
        if(user instanceof Error) { return res.send(this.CreateUserHTML()); }
        // create session / return user data / next





        // if(info.error || json instanceof Error) {
        //     res.locals.authed = json instanceof Error ? json : new Error('Error authing from Twitch.');
        //     console.log("Twitch Auth Issue:", json); return next();
        // }

        //const twitch_data = Array.isArray(json?.data) && json?.data[0]?.id !== undefined ? json.data[0] : null;
        //let user = await this.server.getDatabaseConnection().getUserFromTwitchID(twitch_data.id);

        // User -> Create Session | Error -> Create User
        //if(user instanceof Error) { console.log(user); res.locals.authed = user; }
    }
    // #endregion

    // #region Youtube
    public authYoutube(res: any) {
        return res.redirect(YoutubeAuth.OAuthLink());
    }

    public async verifyYoutube(req: any, res: any, next: any) {
        let info = await YoutubeAuth.GetInfoFromToken(await YoutubeAuth.GetTokens(req));
        console.log("Youtube Data:", info);
        return res.end();

        let user = this.server.getDatabaseConnection().getUserFromYoutubeID(info?.id ?? "");
        if(user instanceof Error) { return res.send(this.CreateUserHTML()); }
        // create session / return user data / next
    }
    // #endregion

    private CreateUserHTML() {
        // simple form page to return on verify if creating user
    }
}

class TwitchAuth {
    static OAuthLink = () => `https://id.twitch.tv/oauth2/authorize`
        + `?client_id=${process.env.TWITCH_ID}&redirect_uri=https://www.${process.env.ROOT_URL}/auth/twitch`
        + `&scope=user:read:subscription+channel:read:polls+channel:read:subscriptions+channel:read:vips`
        + `+moderation:read+moderator:read:blocked_terms+chat:edit+chat:read&state=twitch`;

    static GetTokens = async (req: any) => {
        let url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_ID}`
            + `&client_secret=${process.env.TWITCH_SECRET}&code=${req.query.code}`
            + `&grant_type=authorization_code&redirect_uri=https://${process.env.ROOT_URL}/verify/twitch`;

        let validate = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/vnd.twitchtv.v3+json' } });
        return await validate.json();
    }

    static GetInfoFromToken = async (tokens: any) => {
        return (await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${tokens?.access_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`
            }
        })).json();
    }
}

class YoutubeAuth {
    private static service = google.youtube({ version: 'v3' });
    private static client = new google.auth.OAuth2(
        process.env.YOUTUBE_ID, 
        process.env.YOUTUBE_SECRET,
        `https://www.${process.env.ROOT_URL}/auth/youtube`
    );

    static OAuthLink = () => this.client.generateAuthUrl({
        access_type: 'offline',
        scope: 'https://www.googleapis.com/auth/youtube.readonly'
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