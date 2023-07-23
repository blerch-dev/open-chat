const Log = (...args) => {
    if(PageManager.instance.settings?.devDebug) { console.log(...args); }
}

// TODO - Page Managment (Possible Mod Support Enabler) - Functional but needs Refactoring for OOP
class PageManager {
    static instance = null;

    constructor() {
        PageManager.instance = this;
        this.embedManager = new EmbedManager(document.getElementById('EmbedWindow'));

        this.frame = document.getElementById("ChatWindow");
        this.chat = document.getElementById("ChatMessageList");
        this.input = document.getElementById("ChatInput");
        this.submit = document.getElementById("ChatSend");
        this.settingsElem = document.getElementById("ChatSettings");
        this.status = document.getElementById("ChatStatus");

        this.settings = {};
        Log("Load Settings:", this.LoadSettings(this.settings, true));

        this.chatConnection = new ChatSocket(window.location);
        this.ConfigureChat(this);
    
        this.input.addEventListener('keydown', (e) => {
            const shiftEnterIgnore = true;
            if((e.code == "Enter" || e.code == "NumpadEnter") && (!e.shiftKey || shiftEnterIgnore)) {
                e.preventDefault(); getValue();
            }
        });
    
        document.addEventListener('click', (e) => {
            switch(e.target.id) {
                case "ChatSend":
                    getValue(); break;
                case "ChatSettingsButton":
                    ToggleSettings(); break;
                case "ChatPopoutButton":
                    window.open(this.chatConnection.loc.origin + '/chat', '_blank', 'location=yes,height=900,width=300,scrollbars=no,status=yes');
                    RemoveChat(1000); break;
                case "ChatCloseButton":
                    RemoveChat(1001); break;
                case "ChatEmbeds":
                    break; // chat-request type msg to server, cache results for 1-5 minutes locally to cut down repeats
                default:
                    break;
            }
    
            switch(e.target.dataset?.click) {
                case "toggle-settings-group":
                    e.target.parentElement.classList.toggle('closed');
                    break;
                case "sync-data":
                    this.SetDataForSettingsElement(e.target);
                    this.SaveSettings();
                    break;
                case "set-embed":
                    this.embedManager.setEmbed(...(e.target.dataset?.clickArgs.split('|') ?? [])); break;
                default:
                    break;
            }
        });
    
        const getValue = () => {
            let msg = this.input.value;
            if(msg !== '' && msg != undefined) {
                this.chatConnection.sendChat(msg); this.input.value = "";
            }
            this.input.focus();
        }
    
        const ToggleSettings = () => {
            if(!(this.settingsElem instanceof Element))
                return Log("No settings element.");
    
            const settings_button = document.getElementById("ChatSettingsButton");
            const open = !this.settingsElem.classList.contains('hide');
            let currently_open = this.settingsElem.classList.toggle('hide', open);
            settings_button.classList.toggle('negative', !currently_open);
        }
        
        const RemoveChat = (code) => { if(frame instanceof Element) { frame.classList.add('hide'); } this.chatConnection.disconnect(code); }
    }

    // TODO - add profiles to settings, so logging out doesnt remove some settings missing by role
    // #region Settings Automation
    SaveSettings = (data) => {
        this.settings = data ?? this.settings;
        Log("Saving Settings:", this.settings);
        window.localStorage.setItem("chatSettings", JSON.stringify(this.settings));
        this.ApplySettings();
    }

    LoadSettings = (root, forceElementSync = false) => {
        let str = localStorage.getItem("chatSettings") ?? null

        // Default Values
        let json = {
            devDebug: false,
    
            inputOverflow: true,
            inputShowSend: true
        };

        if(typeof(str) === 'string') {
            try {
                let data = JSON.parse(str);
                json = data;
            } catch(err) {}
        }

        if(forceElementSync) { json = this.BuildJsonStructure(json); }
        this.SaveSettings(json);
        return json;
    }

    ApplySettings = () => {
        const _objToId = (field) => {
            return field.split(/(?=[A-Z])/).map(val => val.toLowerCase()).join('-');
        }

        let keys = Object.keys(this.settings);
        for(let i = 0; i < keys.length; i++) {
            let id = _objToId(keys[i]);
            let elem = document.getElementById(id);
            if(elem) { this.SetElemValue(elem, this.settings[keys[i]]); }

            // Element Specific, Might Redesign This to Fully Manual Anyway
            switch(id) {
                case "input-overflow":
                    elem = document.getElementById("ChatInput");
                    elem.classList.toggle("show-all", this.settings[keys[i]]);
                    elem.style.height = ""; elem.style.height = elem.scrollHeight + "px";
                    break;
                case "input-show-send":
                    elem = document.getElementById("ChatSend");
                    elem.classList.toggle("hide", !this.settings[keys[i]]);
                    break;
                default:
                    break;
            }
        }
    }

    SetElemValue = (elem, value) => {
        switch(elem.type) {
            case "checkbox":
                elem.checked = !!value; break;
            default:
                elem.value = value;
        }
    }

    GetElemValue = (elem) => {
        switch(elem.type) {
            case "checkbox":
                return elem.checked;
            default:
                return elem.value;
        }
    }

    SetDataForSettingsElement = (elem, valueOverride = undefined) => {
        const _idToObj = (str) => { 
            let args = str.split('-'); let output = args.shift();
            return output + args.map(val => { 
                let s = val.charAt(0).toUpperCase(); return s + val.slice(1); 
            }).join('');
        }

        let field = _idToObj(elem.id);
        if(elem.id) { this.settings[field] = valueOverride?.[field] ?? this.GetElemValue(elem); }
    }

    BuildJsonStructure = (defaultValues = undefined) => {
        let elems = document.querySelectorAll('[data-sync]');
        for(let i = 0; i < elems.length; i++) {
            this.SetDataForSettingsElement(elems[i], defaultValues);
        }

        return this.settings;
    }
    // #endregion

    // #region Chat
    ConfigureChat(pageManager) {
        const secure = window.location.protocol === 'https:';
        const local = window.location.hostname.includes('localhost');
        const url = `${local ? '' : 'chat.'}${window.location.host.split(".").slice(-2).join(".")}`;
        const fullURL = `${secure ? 'wss' : 'ws'}://${url}/`;
        // Log("Full URL:", fullURL);

        this.chatConnection.connect(fullURL);
        this.chatConnection.on('message', (event) => {
            let msg = event.data;
            if(msg === 'ping')
                return this.chatConnection.socket.send("pong");
            
            try {
                onMessage(JSON.parse(msg));
            } catch(err) {
                Log("Error:", err, msg, event);
                Log("Message Event:", event);
            }
        });

        let even = true;
        const onMessage = (json) => {
            Log("JSON:", json);
            if(json.ServerMessage && !this.chatConnection.embed)
                serverMessage(json);

            if(json.EventMessage && !this.chatConnection.embed)
                eventMessage(json);

            if(json.MessageQueue)
                messageQueue(json);

            if(json.ChatMessage)
                chatMessage(json);
        }

        const chatMessage = (json) => {
            const badges = (roles) => {
                let badgeStr = "";
                for(let i = 0; i < roles.length; i++) {
                    badgeStr += `<img class="user-badge" src="${msg.roles[0].icon}" title="${msg.roles[0].name}"></img>`
                }

                return badgeStr;
            }

            let msg = json.ChatMessage;
            let elem = document.createElement('div');
            elem.classList.add('chat-message', even ? undefined : 'odd');
            even = !even;
            elem.innerHTML = `
                <p>
                    <span class="user-tag" style="color: ${msg.roles[0]?.color ?? '#ffffff'}">
                        ${badges(msg.roles)}
                        ${msg.username}</span>:
                    ${msg.message}
                </p>
            `;
        
            pageManager.chat.appendChild(elem);
        }

        const serverMessage = (json) => {
            // Will change to icon/status symbol instead of text
            let code = json.ServerMessage?.code;
            if(typeof(code) === 'number') {
                if(code === 1) { pageManager.status.textContent = "Connected" }
                else { pageManager.status.textContent = "" }
            }

            let msg = json.ServerMessage;
            let elem = document.createElement('div');
            elem.classList.add('server-message');
            even = !even;
            elem.innerHTML = `
                <p>${msg.icon ? `<span><img src="${msg.icon}"></span> ` : ''}${msg.message}</p>
            `;

            pageManager.chat.appendChild(elem);
        }

        const eventMessage = (json) => {
            let type = json.type;
            switch(type) {
                case 'live-status-change':
                    pageManager.embedManager.handleLiveState(); break;
                case 'embed':
                    pageManager.embedManager.setEmbedDirectly(json.url, json.meta); break;
                default:
                    break;
            }
        }

        const messageQueue = (json) => {
            let list = json.MessageQueue;
            for(let i = 0; i < list.length; i++) {
                chatMessage(list[i]);
            }
        }
    }
    // #endregion
}

class EmbedManager {

    _embeds = [];

    constructor(embedElem) {}

    setEmbedDirectly(url, meta) {
        // server is responsible for direct iframe info
    }

    setEmbed(platform, channel) {
        // client embeds will have a shortcut/table to look from
    }

    handleLiveState(data) {

    }
}

class ChatSocket {
    constructor(loc) {
        //Log("Loaded:", loc); // Should do maps here
        this.loc = loc;
        this.embed = loc?.pathname?.indexOf('/embed') >= 0 ?? false;

        this.events = new Map();
    }

    connect = (url) => {
        this.socket = new WebSocket(url);
        for(let [key, value] of this.events) {
            this.socket.on(key, value);
        }
    }

    disconnect = (code) => {
        // add message to the ui to show disconnect - todo
        this.socket.close(code ?? 1001, "Closed by user.");
        this.channel_name = undefined;
        this.events = new Map();
    }

    sendChat = (value) => {
        if(!(this.socket instanceof WebSocket))
            return;
        
        this.socket.send(JSON.stringify({ message: value }));
        //Log("Send Value:", value);
    };

    on(event, callback) {
        this.events.set(event, callback);
        if(this.socket instanceof WebSocket)
            this.socket.addEventListener(event, callback);
    }
}

document.addEventListener('DOMContentLoaded', () => { new PageManager(); });