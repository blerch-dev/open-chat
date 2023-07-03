import { Router } from "express";

import { AuthPage } from "./pages";

// Defined Routes
export const DefaultRoute = (): Router => {
    const route = Router();

    route.get(['/login', '/signup', '/auth'], (req, res) => { res.send(AuthPage(req, res)); });

    return route;
}