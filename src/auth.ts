import { google } from 'googleapis';
import { Server } from './server';

export class Authenticator {

    private server: Server;
    private ytService = google.youtube({ version: 'v3' });
    private ytAuthClient = new google.auth.OAuth2(
        process.env.YOUTUBE_ID, 
        process.env.YOUTUBE_SECRET,
        `https://www.${process.env.ROOT_URL}/auth/youtube`
    )

    constructor(server: Server) {
        this.server = server;
    }

    // #region Twitch
    public authTwitch(res: any) {
        res.redirect(TwitchAuth.OAuthLink());
    }

    public async verifyTwitch(req: any, res: any, next: any) {
        let info = TwitchAuth.GetTwitchInfoFromToken(await TwitchAuth.GetAccessToken(req));
        console.log("Twitch Data:", info);
        res.end();
        return;

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
        
    }

    public async verifyYoutube() {

    }
    // #endregion

}

class TwitchAuth {
    static OAuthLink = () => `https://id.twitch.tv/oauth2/authorize`
        + `?client_id=${process.env.TWITCH_ID}&redirect_uri=https://www.${process.env.ROOT_URL}/auth/twitch`
        + `&scope=user:read:subscription+channel:read:polls+channel:read:subscriptions+channel:read:vips`
        + `+moderation:read+moderator:read:blocked_terms+chat:edit+chat:read&state=twitch`;

    static GetAccessToken = async (req: any) => {
        let url = `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_ID}`
            + `&client_secret=${process.env.TWITCH_SECRET}&code=${req.query.code}`
            + `&grant_type=authorization_code&redirect_uri=https://${process.env.ROOT_URL}/verify/twitch`;

        let validate = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/vnd.twitchtv.v3+json' } });
        return (await validate.json())?.access_token;
    }

    static GetTwitchInfoFromToken = async (access_token: string) => {
        return (await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`
            }
        })).json();
    }
}