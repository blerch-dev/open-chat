import WebSocket from 'ws';

import { Server } from "./server";
import { User, /* RoleValue, */ RoleInterface, Status, UserData } from './user';

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

    public getSockets() { return [...this.sockets]; }
}

// Chat logic
export class ChatHandler {

    private server: Server;
    private props: { [key: string]: unknown } = {};
    private wss = new WebSocket.Server({
        noServer: true
    });

    private UserSockets = new Map<string, SocketConnection>();
    private publisher;
    private subscriber;

    constructor(server: Server, props?: { [key: string]: unknown }) {
        this.server = server;
        this.props = { ...server.getProps(), ...props };

        this.publisher = server.getRedisClient()?.getPublisher();
        this.subscriber = server.getRedisClient()?.getSubscriber();

        // Establish WS, Use This Server for Listener
        this.configureServer();
        server.getListener().then((listener) => { 
            listener.on('upgrade', (...args) => { this.handleUpgrade(...args); }); 
        });
    }

    private async handleUpgrade(request: any, socket: any, head: any) {
        this.wss.handleUpgrade(request, socket, head, (ws: any) => { this.wss.emit("connection", ws, request); });
    }

    private configureServer() {
        this.subscriber?.on("message", (channel, message) => {
            this.boradcast(message);
        });

        this.subscriber?.subscribe('chat|msg', (err, count) => {
            if(err) { return console.log("Subscription Error:", err); }
            //console.log("Sub Count:", count);
        });

        this.wss.on("connection", (...args) => { this.onConnection(...args) });
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

    private boradcast(msg: string) {
        for(let [key, value] of this.UserSockets) {
            value.getSockets().forEach((socket) => { socket.send(msg); })
        }
    }

    private async onConnection(socket: WebSocket.WebSocket, req: any) {
        // Session
        let user: User = req?.session?.user ?? (await this.server?.getSession(req))?.user ?? {};

        // Add to UserSockets
        if(User.ValidUserData(user)) {
            // Valid User
            user = user instanceof User ? user : new User(user);

            // Ban Check
            if(user.getEffectiveStatus() & Status.BANNED) {
                socket.send(JSON.stringify({ 
                    ServerMessage: { message: 'You are still banned, try again later.' }
                }));

                return socket.close();
            }

            this.addSocketToConnectionsList(socket, user);

            socket.send(JSON.stringify({
                ServerMessage: {
                    message: `Connected to Chat as ${user.getName()}.`,
                    icon: '/assets/info.svg'
                }
            }));
        } else {
            // Anon User
            this.addSocketToConnectionsList(socket);

            socket.send(JSON.stringify({
                ServerMessage: {
                    message: `Connected to Chat Anonymously.`,
                    icon: '/assets/info.svg'
                }
            }));
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

        // Message
        const onJSON = (json: { message: string }) => {
            // Detect Command: Check User Roles/Status/Event State
            const msg = JSON.stringify({
                ChatMessage: {
                    username: user.getName(),
                    message: json.message,
                    roles: user.getRoles()
                }
            });

            this.publisher?.publish(`chat|msg`, msg);
        }

        socket.on("message", (message) => {
            // console.log("Got Message:", message, "From:", user);
            if(message.toString() === 'pong') { (socket as any).isAlive = true; return; }
            if(!(user instanceof User) || user.getEffectiveStatus() & Status.MUTED) { return; }
            try { onJSON(JSON.parse(message.toString())) } catch(err) { console.log("JSON Parse Error:", err); }
        });

        socket.on("close", (code, reason) => {
            this.removeSocketFromConnectionList(socket, user);
        });

        socket.on("error", (err) => { console.log("Socket Error:", err); });
    }
}