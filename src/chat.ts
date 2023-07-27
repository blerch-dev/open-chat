import WebSocket from 'ws';

import { Server } from "./server";
import { User, RoleValue, RoleInterface, Status, UserData } from './user';
import { ServerEvent } from './state';

// Here for Type Checking
export interface ChatMessage {
    ServerMessage?: { 
        message: string, 
        icon: string, 
        status?: number, 
        code?: string 
    }, // more to add
    EventMessage?: any, // to define
    MessageQueue?: string[],
    ChatMessage?: {
        username: string,
        message: string,
        roles: RoleInterface[]
    }
}

// Idea - Commands/Event Responses/Embed(other) Request Have a Field Check
    // !commands are added to both message and command field
export interface ChatResponse {
    message?: string,
    request?: string,
    command?: string,
    event?: string
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

    public embed: string | undefined;

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

class ChatEvent {
    private respondents: Set<string> = new Set();
    private responses: Map<any, Set<string>> = new Map();

    constructor(...valid_responses: string[]) {

    }

    public Respond(user: User, response: any) {
        if(this.respondents.has(user.getUUID())) { return false; }
        this.respondents.add(user.getUUID());

        if(this.responses.has(response)) {
            let l = this.responses.get(response) as Set<string>;
            l.add(user.getUUID()); this.responses.set(response, l);
        } else {
            this.responses.set(response, new Set<string>(user.getUUID()));
        }

        return true;
    }
}

// Chat logic
export class ChatHandler {

    private server: Server;
    private props: { [key: string]: unknown } = {};
    private wss = new WebSocket.Server({
        noServer: true
    });

    private HistoryLength = 30;
    private ChatHistory: string[] = [];
    private UserSockets = new Map<string, SocketConnection>();
    private publisher;
    private subscriber;

    // Save to Text File
    private BannedPhrases: string[] = [];

    // Events
    private currentEvent: ChatEvent | undefined;
    private eventHistory: ChatEvent[] = [];

    // Request
    private lastEmbedCheck: { last_check: number, value?: { [key: string]: number } } = { last_check: 0 };

    constructor(server: Server, props?: { [key: string]: unknown }) {
        this.server = server;
        server.setChatHandler(this);
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
            if(this.ChatHistory.unshift(message) > this.HistoryLength) { this.ChatHistory.pop(); }
            this.broadcast(message);
        });

        this.subscriber?.subscribe('chat|msg', (err, count) => {
            if(err) { return console.log("Subscription Error:", err); }
            //console.log("Sub Count:", count);
        });

        this.wss.on("connection", (...args) => { this.onConnection(...args) });

        // Live Status Events
        ServerEvent.on('live-state-change', (data: { platform: string, src: string, live: boolean }) => {
            console.log("Broadcasting Live State Change:", data);
            this.broadcast(JSON.stringify({
                EventMessage: {
                    type: 'live-state-change',
                    data: { ...data }
                }
            }));
        });

        // might want a src change, but this will do for now
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

    private broadcast(msg: string) {
        for(let [key, value] of this.UserSockets) {
            value.getSockets().forEach((socket) => { socket.send(msg); })
        }
    }

    private async onConnection(socket: WebSocket.WebSocket, req: any) {
        // Session
        let userdata: UserData = req?.session?.user ?? (await this.server?.getSession(req))?.user ?? {};
        let user: User;

        // Add to UserSockets
        if(User.ValidUserData(userdata)) {
            // Valid User
            user = new User(userdata);
            let stat = user.getEffectiveStatus()

            // Ban Check
            if(stat & Status.BANNED) {
                socket.send(JSON.stringify({ 
                    ServerMessage: { 
                        message: 'You are still banned, try again later.',
                        status: stat,
                        code: 0x000
                    }
                }));

                return socket.close();
            }

            this.addSocketToConnectionsList(socket, user);

            socket.send(JSON.stringify({
                ServerMessage: {
                    message: `Connected to Chat as ${user.getName()}.`,
                    icon: '/assets/icons/info.svg',
                    status: stat,
                    code: 0x001
                },
                MessageQueue: this.ChatHistory
            }));
        } else {
            // Anon User
            this.addSocketToConnectionsList(socket);

            socket.send(JSON.stringify({
                ServerMessage: {
                    message: `Connected to Chat Anonymously.`,
                    icon: '/assets/info.svg',
                    code: 0x001
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
        const onJSON = (json: ChatResponse) => {
            if(json?.request) { RequestHandler(json); }
            if(json?.command) { CommandHandle(json); }
            if(json?.event) { EventHandler(json); }
            if(json?.message) { MessageHandler(json); }
        }

        const RequestHandler = (res: ChatResponse) => {
            // embed/(future request types) handler
            switch(res?.request) {
                case 'embeds':
                    socket.send(JSON.stringify({ EventMessage: {
                        type: 'embeds',
                        data: this.checkEmbeds()
                    } }));
                    break;
                default:
                    break;
            }
        }

        const CommandHandle = (res: ChatResponse) => {
            // Detect Command: Check User Roles/Status/Event State
                // Do Command if Valid

            if(res.command?.charAt(0) != '/' && res.command?.charAt(0) != '!') { return; }
            let commander = user.getRoleValue() & (RoleValue.ADMIN | RoleValue.OWNER | RoleValue.MOD | RoleValue.BOT)
            if(!commander) { return; }

            let args = res.command?.split(' ') ?? [];
            let cmd = args[0];
            switch(cmd) {
                case '/poll':
                    this.runPoll(user, socket, ...args); break;
                default:
                    socket.send(JSON.stringify({ ServerMessage: {
                        message: `Invalid Command: ${cmd}`,
                        icon: '/assets/info.svg',
                    } })); break;
            }            
        }

        const EventHandler = (res: ChatResponse) => {
            // handles poll/event responses
        }

        const MessageHandler = (res: ChatResponse) => {
            const msg = JSON.stringify({
                ChatMessage: {
                    username: user.getName(),
                    message: res.message,
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

    private runPoll(user: User, socket: WebSocket.WebSocket, ...args: string[]) {
        // User/Socket is valid to run cmd, check args and if they are valid publish eventmessage
        //this.publisher?.publish(`chat|msg`, msg);
    }

    private checkEmbeds() {
        let tc = Date.now() - this.lastEmbedCheck.last_check > 60 * 1000; // 1 minute
        if(!tc && this.lastEmbedCheck.value !== undefined) { return this.lastEmbedCheck.value; }

        let sc = Array.from(this.UserSockets.values());
        let em = sc.filter((val) => typeof(val.embed) === 'string').map((val) => val.embed) as string[];
        let answer: { [key: string]: number } = {};
        for(let i = 0; i < em.length; i++) {
            if(answer[em[i]]) { answer[em[i]]++ }
            else { answer[em[i]] = 1 }
        }

        this.lastEmbedCheck = {
            last_check: Date.now(),
            value: answer
        }

        return answer;
    }
}