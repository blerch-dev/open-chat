import { EventEmitter } from 'node:events'

import Redis from 'ioredis';
import { createHmac, randomValue, verifyHmac } from './tools';

export class RedisClient {

    public getClient;
    public getSubscriber;
    public getPublisher;

    private client;
    private hasConnected = false;

    constructor(host = 'localhost', port = 6379) {
        this.client = new Redis({ host: host, port: port });

        this.client.on('close', () => {
            this.hasConnected = false;
        });

        this.client.on('error', (err: any) => {
            if(this.hasConnected) { console.log(err); }
        });

        this.client.on('connect', (err: any) => {
            if(err)
                return this.hasConnected = false;

            this.hasConnected = true;
        });

        this.getClient = () => { return this.client; }
        this.getSubscriber = () => { return new Redis({ host: host, port: port }); }
        this.getPublisher = () => { return new Redis({ host: host, port: port }); }
    }
}

export interface Embed { 
    type: string,
    platform: string, 
    src: string,
    live: boolean,
    channel: string,
    [key: string]: any
}

export class PlatformHandler {

    public isLive: boolean = false;

    protected Platform: string;
    protected Channel: string;

    // Scrap Text will be a long string, might need to trim after a certain length if running into issues
    protected LatestScrapAddress: string = "";
    protected LatestScrapText: string = "";

    constructor(platform: string, channel?: string) {
        this.Platform = platform;
        this.Channel = channel ?? process.env.CHANNEL_DISPLAY as string ?? "undefined";
    }

    public getPlatform() { return this.Platform; }

    public checkForLiveChange(live_state: boolean, additional_data: {[key: string]: any} = {}) {
        if(this.isLive !== live_state) {
            this.isLive = live_state;
            ServerEvent.emit('live-state-change', {
                type: 'livestream',
                platform: this.Platform, 
                src: this.getEmbedSource(),
                live: this.isLive,
                channel: this.Channel,
                ...additional_data
            });

            return true;
        }

        return false;
    }

    public getEmbedSource() {
        return "null";
    }

    public async forceScrapLiveCheck(...args: any[]) {
        this.LatestScrapAddress = `${args[0]}`;
        this.LatestScrapText = await(await fetch(this.LatestScrapAddress)).text() ?? "err";
        return false
    }

    public async forceAPILiveCheck(...args: any[]) {
        // use api method
        return false
    }

    public getLatestScrap() { return { address: this.LatestScrapAddress, value: this.LatestScrapText}; }
}

// might want to store some info from api results for better auto handle
export class TwitchHandler extends PlatformHandler {

    private AppToken: {
        AccessToken?: string,
        Expiration?: {ts: number, in: number},
        Type?: string
    } = {};

    private EventSubCallback: string;

    private HMAC_PREFIX = 'sha256=';
    private HMAC: string = process.env.TWITCH_EVENTSUB_SECRET ?? randomValue(64); // need to save randomValue to file or something
 
    private TWITCH_MESSAGE_ID = 'Twitch-Eventsub-Message-Id'.toLowerCase();
    private TWITCH_MESSAGE_TIMESTAMP = 'Twitch-Eventsub-Message-Timestamp'.toLowerCase();
    private TWITCH_MESSAGE_SIGNATURE = 'Twitch-Eventsub-Message-Signature'.toLowerCase();
    private TWITCH_MESSAGE_TYPE = 'Twitch-Eventsub-Message-Type'.toLowerCase();

    // needs callback
    private default_events = {
        "stream.online": {
            type: "stream.online",
            version: "1",
            condition: { broadcaster_user_id: process.env.TWITCH_CHANNEL_ID },
            transport: { method: 'webhook', callback: null, secret: this.HMAC }
        },
        "stream.offline": {
            type: "stream.offline",
            version: "1",
            condition: { broadcaster_user_id: process.env.TWITCH_CHANNEL_ID },
            transport: { method: 'webhook', callback: null, secret: this.HMAC }
        }
    }

    constructor(callback: string) {
        super('Twitch');

        this.EventSubCallback = callback;
    }

    public async forceScrapLiveCheck() {
        this.LatestScrapAddress = `https://www.twitch.tv/${process.env.TWITCH_CHANNEL}`;
        this.LatestScrapText = await(await fetch(this.LatestScrapAddress)).text() ?? "err";
        return this.LatestScrapText.indexOf('isLiveBroadcast') >= 0;
    }

    public async forceAPILiveCheck(broadcaster_id?: string, broadcaster_name?: string) {
        if(!broadcaster_id && !broadcaster_name) { broadcaster_id = process.env.TWITCH_CHANNEL_ID; }
        await this.getAppToken();

        let url = `https://api.twitch.tv/helix/streams?first=1`;
        url += `&type=live${broadcaster_id ? `&user_id=${broadcaster_id}` : ''}`;
        url += `${broadcaster_name ? `&user_login=${broadcaster_name}` : ''}`;

        let result = await(await fetch(url, { 
            headers: { Authorization: `Bearer ${this.AppToken.AccessToken}`, 'Client-Id': `${process.env.TWITCH_ID}` }
        })).json();

        console.log(`Twitch Live Check for ${broadcaster_name ?? 'ID:' + broadcaster_id}:`, result);
        return result?.data?.length > 0;
    }

    public getEmbedSource() {
        return `https://player.twitch.tv/?channel=${process.env.TWITCH_CHANNEL}&parent=${
            process.env.NODE_ENV === 'prod' ? process.env.ROOT_URL : process.env.DEV_URL
        }`;
    }

    // EventSub
    public async checkSubscribedEvents(app_token?: string) {
        if(app_token === undefined) { await this.getAppToken(); }
        app_token ??= this.AppToken.AccessToken;

        let response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${app_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`, 
            }
        });

        let result = await response.json();
        // result.data will be array of objects with types and ids for checking subscribed events
        // console.log("Subbed Events:", result.data);
        return result;
    }

    public async clearBadEvents(app_token: string, events: any[], force = false) {
        for(let i = 0; i < events.length; i++) {
            if(force === false && (events[i].status === 'enabled' || events[i].status === 'webhook_callback_verification_pending'))
                continue;

            let response  = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${events[i].id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${app_token}`,
                    'Client-Id': `${process.env.TWITCH_ID}`,
                }
            });

            console.log(events[i].type, response.status);
        }
    }

    public async subscribeToEvents(app_token: string, options: any) {
        let response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${app_token}`,
                'Client-Id': `${process.env.TWITCH_ID}`,
                'Content-Type': `application/json`,
            },
            body: JSON.stringify(options)
        });

        let result = await response.json(); // echo on success, shows pending status
        // console.log("Result of Sub Attempt:", result);
        return response.status < 300 && response.status >= 200; // Success on 200 Status
    }

    public eventSubMiddleware = async (req: any, res: any) => {
        const hmac_message = this.getHmacMessage(req);
        const hmac = this.HMAC_PREFIX + createHmac(this.HMAC, hmac_message);
        const verify = verifyHmac(hmac, req.headers[this.TWITCH_MESSAGE_SIGNATURE])
        if(verify === true) {
            // console.log("Eventsub Verified! -", hmac, req.headers[this.TWITCH_MESSAGE_SIGNATURE]);
            const notification = req.body, type = req.headers[this.TWITCH_MESSAGE_TYPE];
            if(type === 'webhook_callback_verification') {
                // console.log("Webhook Challenge:", notification.challenge);
                res.status(200).send(notification.challenge);
            } else {
                console.log(`Notification (${type}): `, notification);
                res.sendStatus(200);
                this.handleEventSub(type, notification);
            }
        } else {
            console.log("Eventsub Failed! - ", hmac, req.headers[this.TWITCH_MESSAGE_SIGNATURE]);
            res.sendStatus(403);
        }
    }

    public async establishEvents(callback?: string) {
        if(callback == undefined) { callback = this.EventSubCallback; }
        await this.getAppToken();
        if(this.AppToken.AccessToken) {
            const FORCE_CLEAR = false;
            // console.log("Establishing Subs at Callback:", callback);
            let wanted_events = JSON.parse(JSON.stringify(this.default_events));
            let events = await this.checkSubscribedEvents(this.AppToken.AccessToken as string);
            for(let i = 0; i < events?.data?.length; i++) {
                if(FORCE_CLEAR) { continue; }
                if(events.data[i].status === 'enabled' || events.data[i].status === 'webhook_callback_verification_pending') {
                    wanted_events[events.data[i].type] = null;
                    // console.log("Event Already Exists:", events.data[i].type);
                }
            }

            wanted_events = Object.fromEntries(Object.entries(wanted_events).filter(([_, v]) => v != null));
            await this.clearBadEvents(this.AppToken.AccessToken, events.data, FORCE_CLEAR);

            let keys = Object.keys(wanted_events);
            for(let i = 0; i < keys.length; i++) {
                if(wanted_events[keys[i]] === null) { continue; } // redundency

                wanted_events[keys[i]].transport.callback = callback;
                if(await this.subscribeToEvents(this.AppToken.AccessToken, wanted_events[keys[i]])) {
                    console.log("Subbed to Event:", wanted_events[keys[i]].type);
                } else {
                    console.log("Failed to subscribe to Event:", wanted_events[keys[i]].type);
                }
            }
            return true;
        } else {
            console.log("No Valid App Token.");
            return false;
        }
    }

    private handleEventSub(type: string, notification: any) {
        switch(type) {
            case 'notification':
                switch(notification?.subscription?.type) {
                    case 'stream.online':
                        this.checkForLiveChange(true, { checkPlatforms: true, attempts: 2, interval: 60 }); 
                        // check other platforms?
                        break;
                    case 'stream.offline':
                        this.checkForLiveChange(false, { checkPlatforms: true, attempts: 2, interval: 60 });
                        // check other platforms?
                        break;
                    default: 
                        break;
                }
                break;
            default:
                console.log("Non Handled Event:", type, notification);
        }
    }

    private getHmacMessage(req: any) {
        return req.headers[this.TWITCH_MESSAGE_ID] + req.headers[this.TWITCH_MESSAGE_TIMESTAMP] + JSON.stringify(req.body);
    }

    // Tokens
    private async getAppToken() {
        let exp = this.AppToken?.Expiration?.ts ?? 0;
        exp += this.AppToken?.Expiration?.in ?? 0;
        if(this.AppToken.AccessToken && exp > Date.now()) {
            return; // seemingly valid app token already
        }

        let url = `https://id.twitch.tv/oauth2/token`;
        let body = `client_id=${process.env.TWITCH_ID}&client_secret=${process.env.TWITCH_SECRET}&grant_type=client_credentials`;
        let result = await (await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
        })).json();

        // console.log("Twitch App Results:", result);
        this.AppToken.AccessToken = result.access_token;
        this.AppToken.Expiration = { ts: Date.now(), in: result.expires_in };
        this.AppToken.Type = result.token_type;
    }
}

export class YoutubeHandler extends PlatformHandler {

    private IdLength = 11;
    private VideoId: string | undefined;
    private ScheduledStartTime: number | undefined;

    constructor() {
        super('Youtube');
    }

    public async forceScrapLiveCheck() {
        // For Scheduled Streams:: Might add way to embed early so people can see it as soon as it goes live
        // need more detailed embed logic for this

        this.LatestScrapAddress = `https://www.youtube.com/${process.env.YOUTUBE_CHANNEL}/live`;
        this.LatestScrapText = await(await fetch(this.LatestScrapAddress)).text() ?? "err";

        let CheckIndex = this.LatestScrapText.indexOf('{"key":"is_viewed_live","value":"True"}');
        let result = CheckIndex >= 0;
        if(result || this.LatestScrapText.indexOf('{"key":"is_viewed_live","value":"False"}') >= 0) {
            let vid_check = 'liveStreamabilityRenderer":{"videoId":"'; // could do regex with '"broadcastId":"1"' as the second half
            let schedule_check = 'scheduledStartTime":"';

            let vid_index = this.LatestScrapText.indexOf(vid_check) + vid_check.length
            this.VideoId = this.LatestScrapText.substring(vid_index, vid_index + this.IdLength);
            
            if(this.LatestScrapText.indexOf(schedule_check) >= 0) {
                let sch_index = this.LatestScrapText.indexOf(schedule_check) + schedule_check.length;
                let seconds = Number(this.LatestScrapText.substring(sch_index, sch_index + 20).split('"')[0]);
                this.ScheduledStartTime = seconds * 1000;
            } else {
                this.ScheduledStartTime = Date.now();
            }
        }

        return result;
    }

    public async forceAPILiveCheck(channel_id?: string, channel_name?: string) {
        if(!channel_id) { 
            if(process.env.YOUTUBE_CHANNEL_ID == "") { return false; }
            console.log("Using Youtube ENV ID:", process.env.YOUTUBE_CHANNEL_ID);
            channel_id = process.env.YOUTUBE_CHANNEL_ID; 
        }

        let url = `https://www.googleapis.com/youtube/v3/search`;
        url += `?part=snippet&channelId=${channel_id}&type=video`;
        url += `&eventType=live&key=${process.env.YOUTUBE_KEY}`;

        let result = await(await fetch(url)).json();

        console.log(`Youtube Live Check for ID: ${channel_id}:`, result);
        this.VideoId = result?.items?.[0]?.id?.videoId ?? this.VideoId;
        return result?.items?.length > 0;
    }

    public getEmbedSource() {
        if(!this.VideoId)
            return `/embed?error=no_video_id`;

        return `https://www.youtube.com/embed/${this.VideoId}?autoplay=1&playsinline=1&hd=1`;
    }

    public getLatestScrap() { 
        return { 
            address: this.LatestScrapAddress, 
            value: this.LatestScrapText,
            VideoId: this.VideoId,
            StartTime: this.ScheduledStartTime
        };
    }
}

export class KickHandler extends PlatformHandler {
    constructor() {
        super('Kick');
    }

    public async forceScrapLiveCheck() {
        this.LatestScrapAddress = `https://www.kick.com/${process.env.TWITCH_CHANNEL}`;
        this.LatestScrapText = await(await fetch(this.LatestScrapAddress)).text() ?? "err";
        //return this.LatestScrapText.indexOf('isLiveBroadcast') >= 0;

        return false;
    }

    public getEmbedSource() {
        return `https://player.kick.com/${process.env.KICK_CHANNEL}?autoplay=true`;
    }
}

// Emits events when platform app finds new stream, live notification
export class CustomEvent extends EventEmitter {}
export const ServerEvent = new CustomEvent();