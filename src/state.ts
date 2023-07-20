import { EventEmitter } from 'node:events'

import Redis from 'ioredis';

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

// Twitch / Event Sub Live Stuff
export class TwitchApp {

    private access_token: string | undefined;
    private expiration: { ts: number, in: number } | undefined;
    private type: string | undefined;

    constructor() {
        this.getAppTokens();
    }

    public async forceCheckLive(broadcaster_id?: string, broadcaster_name?: string) {
        if(!this.access_token) { await this.getAppTokens() }
        if(!broadcaster_id && !broadcaster_name) { console.log("Invalid Input!"); return false; }
        let url = `https://api.twitch.tv/helix/streams?first=1`;
        url += `&type=live${broadcaster_id ? `&user_id=${broadcaster_id}` : ''}`;
        url += `${broadcaster_name ? `&user_login=${broadcaster_name}` : ''}`;

        let result = await(await fetch(url, { 
            headers: { Authorization: `Bearer ${this.access_token}`, 'Client-Id': `${process.env.TWITCH_ID}` }
        })).json();

        // console.log(`Twitch Live Check for ${broadcaster_name ?? 'ID:' + broadcaster_id}:`, result);
        return result?.data?.length > 0;
    }

    private async getAppTokens() {
        let url = `https://id.twitch.tv/oauth2/token`;
        let body = `client_id=${process.env.TWITCH_ID}&client_secret=${process.env.TWITCH_SECRET}&grant_type=client_credentials`;
        let result = await (await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
        })).json();

        // console.log("Twitch App Results:", result);
        this.access_token = result.access_token;
        this.expiration = { ts: Date.now(), in: result.expires_in };
        this.type = result.token_type;
    }

    // Set Live Sub / Get Current Live Status (Based on ENV | Owner's Twitch Broadcaster ID)
    private async subToLiveNotifications(broadcaster_id: string) {

    }
}

export class YoutubeApp {

    private api_key: string | undefined;
    private stream_video_id: string | undefined;

    constructor() {
        this.api_key = process.env.YOUTUBE_KEY;
    }

    public async forceCheckLive(channel_id: string) {
        let url = `https://www.googleapis.com/youtube/v3/search`;
        url += `?part=snippet&channelId=${channel_id}&type=video`;
        url += `&eventType=live&key=${this.api_key}`;

        let result = await(await fetch(url)).json();

        console.log(`Youtube Live Check for ID: ${channel_id}:`, result);
        this.stream_video_id = result?.items?.[0]?.id?.videoId;
        return result?.items?.length > 0;
    }

    public async getStreamID(channel_id: string) {
        if(this.stream_video_id) { return this.stream_video_id; }
        // fetch api, save, return
    }

    public async scrapYoutubeLivePage(channel_name: string) {
        // scraps html for `youtube.com/channel/${channel_name}/live` for details
    }
}

// Emits events when platform app finds new stream, live notification
export class ServerEvent extends EventEmitter {}