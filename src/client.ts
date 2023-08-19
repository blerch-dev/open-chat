import { Router } from "express";

import { Server } from './server';
import { AuthPage, ChatPage, DevPage, HomePage, LivePage, ProfilePage } from "./pages";
import { Roles, RoleValue } from "./user";
import { TwitchHandler } from "./state";

// Might move this to server as a public method
let devPermCheck = (req: any, res: any, next: any) => {
    if(req?.session?.user?.roles & (RoleValue.ADMIN | RoleValue.OWNER)) { return next(); }
    res.status(401).send("Invalid Credentials or Permissions");
    return;
}

// Defined Routes
export const DefaultRoute = (server: Server): Router => {
    const route = Router();
    const auth = server.getAuthenticator();

    // Auth Routes
    route.post('/user/create', (req, res, next) => { auth.createAccount(req, res, next); });

    route.get('/auth/twitch', (req, res, next) => { auth.authTwitch(req, res, next) });
    route.get('/verify/twitch', (req, res, next) => { auth.verifyTwitch(req, res, next) });

    route.get('/auth/youtube', (req, res, next) => { auth.authYoutube(req, res, next) });
    route.get('/verify/youtube', (req, res, next) => { auth.verifyYoutube(req, res, next) });

    // Admin | Owner Routes
    route.get('/admin', devPermCheck, (req, res, next) => { DevPage(req, res, server.getProps(), server); }); // Async Handles Send
    route.get('/state/twitch/eventsub', devPermCheck, async (req, res, next) => { 
        let tpm = server.getPlatformManager().getPlatformConnections('twitch') as TwitchHandler;
        res.json(await tpm.checkSubscribedEvents());
    });

    // Page Routes
    route.get(['/login', '/signup', '/auth'], (req, res) => { res.send(AuthPage(req, res, server.getProps())); });
    route.get(['/logout'], (req, res) => { 
        res.clearCookie('ssi_token');
        req.session.destroy((err) => { res.clearCookie('connect.sid'); res.redirect('/'); });
    });

    route.get('/profile', (req, res) => { res.send(ProfilePage(req, res, server.getProps())); });
    route.get('/live', (req, res) => { res.send(LivePage(req, res, server.getProps(), {})); }); // ChatOptions
    route.get(['/chat', '/chat/embed'], (req, res, next) => { 
        let embed = req.originalUrl.includes('/embed');
        res.send(ChatPage(req, res, server.getProps(), {
            // options, based on req.query and embed page stuff
            header: !(req.query?.['header'] === '0'),
            controls: !embed,
            transparent: embed,
            flex: true
        }));
    });

    route.get('/', (req, res) => { res.send(HomePage(req, res, server.getProps())); });
    route.all('*', (req, res) => { console.log("Hit End of Routes!"); res.end(); });

    return route;
}