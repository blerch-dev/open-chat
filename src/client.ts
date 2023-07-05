import { Router } from "express";

import { AuthPage, HomePage } from "./pages";

// Defined Routes
export const DefaultRoute = (): Router => {
    const route = Router();

    route.get(['/login', '/signup', '/auth'], (req, res) => { res.send(AuthPage(req, res)); });
    route.get('/', (req, res) => { res.send(HomePage(req, res)); });

    return route;
}