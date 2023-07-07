import { Router } from "express";

import { Server } from './server';
import { AuthPage, HomePage } from "./pages";

// Defined Routes
export const DefaultRoute = (server: Server): Router => {
    const route = Router();
    const auth = server.getAuthenticator();

    // OAuth Routes
    route.get('/auth/twitch', auth.authTwitch);
    route.get('/verify/twtich', auth.verifyTwitch);

    route.get('/auth/youtube', auth.authYoutube);
    route.get('/verify/youtube', auth.verifyYoutube);

    // Page Routes
    route.get(['/login', '/signup', '/auth'], (req, res) => { res.send(AuthPage(req, res)); });
    route.get('/', (req, res) => { res.send(HomePage(req, res)); });

    return route;
}