import WebSocket from 'ws';

import { Server } from "./server";
import { User, /* RoleValue, */ RoleInterface } from './user';

export class ChatMessage {

    //private chatter: Chatter | null = null;
    //private message: string | null = null;

    constructor() {}
}

export class Chatter {

    private data: {
        uuid: string,
        name: string,
        roles: RoleInterface[],
        color: string
    } | null = null;

    constructor(user: User) {
        let roles = user.getRoles();

        this.data = {
            uuid: user.getUUID(),
            name: user.getName(),
            roles: roles,
            color: roles[0].color
        }
    }

    public toJSON() { return this.data; }
}

export class SocketConnection {

    private user: User | null = null;
    private sockets: Set<WebSocket.WebSocket> = new Set();

    constructor(user: User | null = null) {
        this.user = user;
    }

    public addSocket(socket: WebSocket.WebSocket) {
        this.sockets.add(socket);
    }

    public removeSocket(socket: WebSocket.WebSocket) {
        this.sockets.delete(socket);
    }

    public socketCount() { return this.sockets.size; }

    public getUser() { return this.user; }
}

// Chat logic
export class ChatHandler {

    private server: Server;
    private props: { [key: string]: unknown } = {};
    private wss = new WebSocket.Server({
        noServer: true
    });

    private UserSockets = new Map<string, SocketConnection>();

    constructor(server: Server, props?: { [key: string]: unknown }) {
        this.server = server;
        this.props = { ...server.getProps(), ...props };

        // Establish WS, Use This Server for Listener
        this.configureServer();
        server.getListener().then((listener) => { listener.on('upgrade', this.handleUpgrade); });
    }

    private async handleUpgrade(request: any, socket: any, head: any) {
        this.wss.handleUpgrade(request, socket, head, (ws: any) => { this.wss.emit("connection", ws, request); });
    }

    private configureServer() {
        this.wss.on("connection", this.onConnection);
    }

    private addSocketToConnectionsList(socket: WebSocket.WebSocket, user: User | null = null) {
        let connections = this.UserSockets.get(user?.getUUID() ?? "anon") ?? new SocketConnection(user);
        connections.addSocket(socket); this.UserSockets.set(user?.getUUID() ?? "anon", connections);
    }

    private removeSocketFromConnectionList(socket: WebSocket.WebSocket, user: User | null = null) {
        let connections = this.UserSockets.get(user?.getUUID() ?? "anon");
        if(connections instanceof SocketConnection) {
            connections.removeSocket(socket);
            if(connections.socketCount() === 0)
                this.UserSockets.delete(user?.getUUID() ?? "anon");
        }
    }

    private async onConnection(socket: WebSocket.WebSocket, req: any) {
        // Session
        console.log("WebSocket Connection Session:", req.session);

        // Add to UserSockets
        if(User.ValidUserData(req.session.user)) {
            // Valid User
            this.addSocketToConnectionsList(socket, new User(req.session.user));
        } else {
            // Anon User
            this.addSocketToConnectionsList(socket);
        }

        (socket as any).isAlive = true;
        (socket as any).hb = setInterval(() => {
            if((socket as any).isAlive !== true) {
                clearInterval((socket as any).hb);
                return this.removeSocketFromConnectionList(socket);
            }

            (socket as any).isAlive = false;
            socket.send('ping');
        });
    }
}