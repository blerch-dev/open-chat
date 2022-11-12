// Button to jump to bottom of chat on scroll up

// Chat Client Logic
document.addEventListener('DOMContentLoaded', () => {
    let client = new ChatClient();
    client.connect();
});

class ChatClient {
    constructor(config) {

        const ChatElem = {};
        const Settings = {
            SeperateBacking: true,
            NoBackground: window.location.pathname.indexOf('/embed') >= 0, // can have options overide
            ChatPlaceholder: 'Message...',
            ChatTitle: '',
            MaxElements: 200,
            ScrollOnNew: undefined, // true for always, false for never, undefined for at bottom
            ScrollSensitivity: 95
        }

        var Socket = null;
        var User = null;
        var Channel = null;
        var Room = null;

        var ChatList = [];
        var ChatFills = { cmds: [], users: [], emotes: [] };

        this.setSocket = (socket) => {
            if(socket instanceof WebSocket) {
                Socket = socket;
            }
        }
        this.getSocket = () => { return Socket; }

        this.setUser = (user) => {
            //console.log('User:', user);
            User = user; 
            if(user?.id == 'anon') { this.setChatPlaceholder('Login to chat...') }
        }
        this.getUser = () => { return User; }

        this.setChannel = (channel) => { 
            //console.log('Channel:', channel); 
            Channel = channel; 
            this.setChatTitle( channel?.name ?? channel?.id ?? 'Undefined - 1'); 
        }
        this.getChannel = () => { return Channel }

        this.setRoom = (str) => { /* console.log('Room:', str); */ Room = str; }
        this.getRoom = () => { return Room; }

        this.getChatElements = () => { return ChatElem; }
        this.setSetting = (label, value) => { Settings[label] = value; }
        this.getSetting = (label) => { return Settings[label]; }
        this.getSettings = () => { return Settings; }

        this.setChatPlaceholder = (value) => { this.setSetting('ChatPlaceholder', value); this.configDom(); }
        this.setChatTitle = (value) => { this.setSetting('ChatTitle', value); this.configDom(); }

        var isOdd = false;
        this.getIdOdd = () => { isOdd = !isOdd; return isOdd; }

        this.addElem = (elem) => {
            if(ChatList.length >= (Settings.MaxElements ?? 200)) {
                let td = ChatList.splice(0, ChatList.length - (Settings.MaxElements ?? 200));
                for(let i = 0; i < td.length; i++) {
                    if(td[i] instanceof Element)
                        td[i].remove();
                }
            }

            ChatList.push(elem);
        }

        this.setChatFills = (name, list) => { ChatFills[name] = [...list]; }
        this.getChatFill = (input) => {
            if(input === '')
                return [];

            let fills = [...ChatFills.cmds, ...ChatFills.users, ...ChatFills.emotes], matches = [];
            for(let i = 0; i < fills.length; i++) {
                if(fills[i].toLowerCase().indexOf(input.toLowerCase()) === 0)
                    matches.push(fills[i]);
            }
            return matches;
        }
    }

    connectDom() {
        let domElems = this.getChatElements();
        domElems.inputField = document.getElementById("chat-input-element") || null;
        domElems.captureList = document.getElementById("capture-list") || null;
        domElems.eventArea = document.getElementById("chat-events") || null;
        domElems.chatTitle = document.getElementById("chat-title") || null;
        domElems.chatWindow = document.getElementById("chat-window") || null;
        domElems.chatWrapper = document.getElementById("chat-wrapper") || null;
        domElems.chatContent = document.getElementById("chat-content") || null;
    }

    configListeners() {
        document.addEventListener('keydown', (e) => {
            if(e.target.id == this.getChatElements().inputField.id) {
                if(this.getUser().id == 'anon')
                    return e.preventDefault();

                if(e.code === "Enter" || e.code === "KeypadEnter") {
                    //console.log("Message Value:", e.target.value);
                    if(e.target.value !== "") {
                        this.sendMessage(e.target.value);
                        this.autoSearch(undefined, true);
                    }
                } else if(e.code === "Tab") {
                    this.tabInput(e);
                }
            }
        });

        this.getChatElements().inputField.addEventListener('input', (e) => {
            this.autoSearch(e);
        });
    }

    configDom() {
        if(this.getChatElements().inputField instanceof Element)
            this.getChatElements().inputField.placeholder = this.getSetting('ChatPlaceholder') ?? 'Message...';
        
        if(this.getChatElements().chatTitle instanceof Element)
            this.getChatElements().chatTitle.textContent = this.getSetting('ChatTitle') ?? '';
    }

    sendMessage(message) {
        this.getSocket().send(JSON.stringify({msg: message}));
        this.getChatElements().inputField.value = "";
        //this.createMessageElement(this.getUser(), message); // Frontend Writes, Requires Filtering Outgoing Messages
    }

    createMessageElement(data, pre_elem = undefined) {
        if(pre_elem instanceof Element) {
            this.getChatElements().chatContent?.appendChild(pre_elem);
            return;
        }

        if(typeof(data) !== 'object') {
            console.log("Data was not type object.", data);
            return;
        }

        console.log("Chat Message Data:", data);
        const { user, message, service } = data; let message_str = undefined;
        if(message == undefined || user.username == undefined) {
            // Bad Format (sometimes chat bot will publish uncaught state updates)
            return;
        } else {
            message_str = replaceEmotes(message, this.getChannel());
        }

        let message_elem = document.createElement('p');
        let classes = ['chat-message', this.getSetting('NoBackground') ? 'embed' : undefined, service];
        message_elem.classList.add(...classes.filter((e) => { return e != undefined }));
        if(this.getSetting('SeperateBacking') && !this.getSetting('NoBackground'))
            message_elem.classList.add(this.getIdOdd() ? 'chat-message-odd' : 'chat-message-even')
            
        let str = ``;
        if(user.role?.src) { str += `<i class="badge"><img src="${user.role.src}" title="${user.role.name}"></i>` }
        str += `<span class="user-chat-name" data-ment="${user.username}" style="color: ${user?.role?.color || user.color || '#fff'};">`;
        str += `${user.username}</span><span>: </span><span>${message_str}<span>`;

        let e = this.getChatElements().chatWrapper;
        let _snap = {
            scrollHeight: e.scrollHeight,
            scrollTop: e.scrollTop,
            clientHeight: e.clientHeight
        }

        message_elem.innerHTML = str;
        let elem_ref = this.getChatElements().chatContent?.appendChild(message_elem);
        this.addElem(elem_ref);

        switch(this.getSetting('ScrollOnNew')) {
            case true:
                e.scrollTop = e.scrollHeight; break;
            case undefined:
                if((_snap.scrollHeight - _snap.scrollTop) - _snap.clientHeight < this.getSetting('ScrollSensitivity') ?? 95) { 
                    e.scrollTop = e.scrollHeight; 
                } break;
            case false:
            default:
                break;
        }
    }

    connected = false;
    async connect() {
        this.connectDom();
        this.setChatFills('emotes', getAllEmotes());

        let proc = location.protocol === 'https:' ? 'wss' : 'ws';
        let url = `${proc}://${window.location.host}${window.location.pathname}`;
        // if(url.indexOf('localhost') > -1)
        //     url = `${proc}://www.kidnotkin.tv${window.location.pathname}`;

        //console.log(`Connecting to ChatServer at ${url}`);
        let socket = new WebSocket(url);
        this.setRoom(document.getElementById('chat-window')?.dataset?.chatroom ?? 'null');
        socket.addEventListener('open', (e) => {
            //console.log("Connected to ChatServer. Sending Room ID.", room_id);
            //socket.send(JSON.stringify({ room: this.getRoom() }));
            this.connected = true;
        });

        socket.addEventListener('message', (e) => {
            //console.log('WS Message', e);
            if(e.data === 'ping') {
                //console.log('Hit with ping. Responding with pong.');
                socket.send('pong');
                return;
            }

            this.parseMessage(e);
        });

        socket.addEventListener('close', (e) => {
            //console.log('WS Close:', e);
            if(this.connected) {
                this.serverMessage({ServerMessage: 'Disconnected... Atempting to Reconnect.'});
            }
            this.connected = false;
            setTimeout(() => {
                this.connect();
            }, 250);
        });

        socket.addEventListener('error', (e) => {
            console.log('WS Error:', e);
        });

        this.setSocket(socket);
        this.configListeners();
    }

    async parseMessage(res) {
        // JSON Parse and Field Allocation
        let json = {};
        try { json = JSON.parse(res.data); } catch(err) { console.log("Parse Error", err); }
        console.log('Msg JSON:', json);

        if(json.ServerMessage !== undefined)
            this.serverMessage(json);

        if(json.ServerUpdate !== undefined)
            this.serverUpdate(json);

        if(json.ServerRequest !== undefined)
            this.serverRequest(json);

        if(json.ChatMessage !== undefined)
            this.chatMessage(json);
    }

    async serverMessage(data) {
        // Writes to Chat as Server.
            // Calls createMessageElement if all is good

        let elem = document.createElement('p');
        elem.classList.add('server-message');
        elem.innerHTML = `<img src="/assets/svg/info.svg" title="Info">${data.ServerMessage}`;
        
        this.createMessageElement(null, elem);
    }

    async serverUpdate(data) {
        // Updates ChatClient with contained data. Drop if does not meet expected requirements.
        let updates = Array.isArray(data.ServerUpdate) ? data.ServerUpdate : [];
        for(let i = 0; i < updates.length; i++) {
            switch(updates[i]) {
                case 'user':
                    this.setUser(data['user']); break;
                case 'channel':
                    this.setChannel(data['channel']); break;
            }
        }
    }

    async serverRequest(data) {
        let args = data.ServerRequest;
        if(!Array.isArray(args)) {
            args = [args];
        }

        let json = {};
        for(let i = 0; i < args.length; i++) {
            switch(args[i]) {
                case 'room_id':
                    json.room = this.getRoom(); break;
                default:
                    console.log('No Request Case:', args[i]); break;
            }
        }

        this.getSocket().send(JSON.stringify(json));
    }

    async chatMessage(data) {
        // User (details only no type) - Parse into below object, drop if missing required fields.
        this.createMessageElement(data.ChatMessage);
    }

    inputEventID = null; tabList = []; currentTabIndex = -1;
    async tabInput(e) {
        //console.log("TabInput:", e);
        e.preventDefault();
        let value = e.shiftKey ? -1 : 1;
        if((!e.shiftKey && this.tabList.length <= this.currentTabIndex + value) || (e.shiftKey && this.currentTabIndex + value < 0)) {
            if(this.tabList.length > 0) {
                this.currentTabIndex = value < 0 ? this.tabList.length - 1 : 0;
                this.placeFill(this.currentTabIndex);
            } else {
                this.currentTabIndex = -1;
            }
        } else {
            this.currentTabIndex += value;
            this.placeFill(this.currentTabIndex);
        }
    }

    async autoSearch(e, clear = false) {
        //console.log("AuthSearch:", e);
        const func = () => {
            this.currentTabIndex = -1;
            [...this.getChatElements().captureList.children].forEach((elem) => { elem.remove(); });
            if(e?.target?.value?.length < 1 || clear === true) {
                this.tabList = [];
                return;
            }
    
            let last_value = e.target.value.split(' ');
            last_value = last_value[last_value.length - 1];
            this.tabList = this.getChatFill(last_value);
            for(let i = 0; i < this.tabList.length; i++) {
                let elem_click = () => { this.placeFill(i) };
                let elem = document.createElement('li');
                elem.textContent = this.tabList[i];
                elem.onclick = elem_click;
                this.getChatElements().captureList.appendChild(elem);
            }

            this.inputEventID = null;
        }

        if(this.inputEventID != null) {
            clearTimeout(this.inputEventID);
        }

        this.inputEventID = setTimeout(func, 25);
    }

    async placeFill(index) {
        //console.log("PlaceFill:", index, this.tabList[index]);
        let value = this.getChatElements().inputField.value.trim();
        let args = value.split(' ');
        args.pop();
        args.push(`${this.tabList[index]}`);
        this.getChatElements().inputField.value = args.join(' ');
    }
}