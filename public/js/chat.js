const Log = (...args) => {
    if(PageManager.instance.GetSettings().devDebug) { console.log(...args); }
}

class PageManager {
    static instance = null;
    
    #embeds = {
        cache_time: 60,
        last_check: 0,
        value: undefined
    };

    #embedManager = null;
    #chatSocket = null;
    #chatElems = null;
    #settings = null;

    // Chat Elem States
    #even = false;

    constructor() {
        PageManager.instance = this;
        document.addEventListener('DOMContentLoaded', () => { this.onPageLoad(); })
    }

    onPageLoad() {

        // Elems
        this.#chatElems = {
            frame: document.getElementById("ChatWindow"),
            list: document.getElementById("ChatMessageList"),
            input: document.getElementById("ChatInput"),
            submit: document.getElementById("ChatSend"),
            status: document.getElementById("ChatStatus")
        }

        this.#embedManager = new EmbedManager(document.getElementById('EmbedWindow'), this);
        this.#chatSocket = new ChatSocket(this.#chatElems.frame, this);

        // Settings
        this.#settings = {};
        Log("Load Settings:", this.LoadSettings(this.#settings, true));
    
        // Events
        this.#chatElems.input.addEventListener('keydown', (e) => { this.onKeyPress(e); });
        document.addEventListener('click', (e) => { this.onClick(e); });
    }

    getInputValue() { return this.#chatElems?.input?.value; }
    setInputValue(value = "", focus = true) {
        if(!(this.#chatElems.input instanceof Element))
            return Log("No input element.");

        this.#chatElems.input.value = value ?? "";
        if(!!focus) { this.#chatElems.input.focus(); }
    }

    toggleSettings() {
        const settings_page = document.getElementById("ChatSettings");
        const settings_button = document.getElementById("ChatSettingsButton");
        if(!(settings_page instanceof Element) || !(settings_button instanceof Element))
            return Log("No settings element.");

        let open = !settings_page.classList.contains('hide');
        let currently_open = settings_page.classList.toggle('hide', open);
        settings_button.classList.toggle('negative', !currently_open);
    }

    // #region Event Listeners
    onKeyPress(e) {
        const shiftEnterIgnore = true;
        if((e.code == "Enter" || e.code == "NumpadEnter") && (!e.shiftKey || shiftEnterIgnore)) {
            e.preventDefault(); this.#chatSocket.sendChat(this.getInputValue());
        }
    }

    onClick(e) {
        switch(e.target.id) {
            case "ChatSend":
                this.#chatSocket.sendChat(this.getInputValue()); break;
            case "ChatSettingsButton":
                this.toggleSettings(); break;
            case "ChatPopoutButton":
                window.open(this.#chatSocket.loc.origin + '/chat?popout=1&header=0', '_blank', 
                    'location=yes,height=900,width=300,scrollbars=no,status=yes');
                this.#chatSocket.removeChatWindow(1000); break;
            case "ChatCloseButton":
                let param = (new URL(window.location)).searchParams;
                if(param.get("popout") == '1') { return window.close(); }
                this.#chatSocket.removeChatWindow(1001); break;
            case "ChatEmbeds":
                let time_check = Date.now() - this.#embeds.last_check < this.#embeds.cache_time * 1000;
                if(time_check && this.#embeds.value !== undefined) {
                    return this.#chatSocket.onMessage({ 
                        EventMessage: { 
                            type: 'embeds', 
                            data: this.#embeds.value,
                            time: this.#embeds.last_check
                        }
                    });
                } 
                
                Log("Fetching Embeds!");
                this.#chatSocket.sendChat({ request: 'embeds' });
                break;
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
                this.#embedManager.setEmbed(...(e.target.dataset?.clickArgs.split('|') ?? [])); break;
            case "set-embed-directly":
                this.#embedManager.setEmbedDirectly(...(e.target.dataset?.clickArgs.split('|') ?? [])); break;
            default:
                break;
        }
    }
    // #endregion

    // TODO - add profiles to settings, so logging out doesnt remove some settings missing by role
    // #region Settings Automation
    SaveSettings = (data) => {
        this.#settings = data ?? this.#settings;
        Log("Saving Settings:", this.#settings);
        window.localStorage.setItem("chatSettings", JSON.stringify(this.#settings));
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
            try { let data = JSON.parse(str); json = data; } catch(err) {}
        }

        if(forceElementSync) { json = this.BuildJsonStructure(json); }
        this.SaveSettings(json);
        return json;
    }

    ApplySettings = () => {
        const _objToId = (field) => {
            return field.split(/(?=[A-Z])/).map(val => val.toLowerCase()).join('-');
        }

        let keys = Object.keys(this.#settings);
        for(let i = 0; i < keys.length; i++) {
            let id = _objToId(keys[i]);
            let elem = document.getElementById(id);
            if(elem) { this.SetElemValue(elem, this.#settings[keys[i]]); }

            // Element Specific, Might Redesign This to Fully Manual Anyway
            switch(id) {
                case "input-overflow":
                    elem = document.getElementById("ChatInput");
                    elem.classList.toggle("show-all", this.#settings[keys[i]]);
                    elem.style.height = ""; elem.style.height = elem.scrollHeight + "px";
                    break;
                case "input-show-send":
                    elem = document.getElementById("ChatSend");
                    elem.classList.toggle("hide", !this.#settings[keys[i]]);
                    break;
                default:
                    break;
            }
        }
    }

    GetSettings = () => { return this.#settings; }

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
            return output + args.map(val => { let s = val.charAt(0).toUpperCase(); return s + val.slice(1); }).join('');
        }

        let field = _idToObj(elem.id);
        if(elem.id) { this.#settings[field] = valueOverride?.[field] ?? this.GetElemValue(elem); }
    }

    BuildJsonStructure = (defaultValues = undefined) => {
        let elems = document.querySelectorAll('[data-sync]');
        for(let i = 0; i < elems.length; i++) { this.SetDataForSettingsElement(elems[i], defaultValues); }
        return this.#settings;
    }
    // #endregion

    // #region Chat Rendering
    addChatMessageElem(data) {
        const badges = (roles) => {
            let badgeStr = "";
            for(let i = 0; i < roles.length; i++) {
                badgeStr += `<img class="user-badge" src="${roles[i].icon}" title="${roles[i].name}"></img>`
            }

            return badgeStr;
        }

        let elem = document.createElement('div');
        elem.classList.add('chat-message', this.#even ? undefined : 'odd');
        this.#even = !this.#even;
        let html = `<p><span class="user-tag" style="color: ${data?.roles[0]?.color ?? '#ffffff'}">`;
        html += `${badges(data?.roles)}${data?.username}</span>: ${data?.message}</p>`;
        elem.innerHTML = html;    
    
        return this.#chatElems.list.appendChild(elem);
    }

    addServerMessageElem(data) {
        // Will change to icon/status symbol instead of text
        let code = data?.code;
        if(typeof(code) === 'number') {
            if(code === 1) { this.#chatElems.status.textContent = "Connected" }
            else { this.#chatElems.status.textContent = "" }
        }

        let elem = document.createElement('div');
        elem.classList.add('server-message');
        // if even is effected, change it here
        elem.innerHTML = `<p>${data.icon ? `<span><img src="${data.icon}"></span> ` : ''}${data.message}</p>`;

        return this.#chatElems.list.appendChild(elem);
    }

    handleEventMessage(event) {
        const renderEventMessage = (json) => {
            console.log("Rendering Event Message:", json);
            switch(json.type) {
                case 'embeds':
                    let embeds = Object.keys(json.data).map((val) => { return { name: val, count: json.data[val] } });
                    let elems = embeds.map((val) => `<span><a href="${val.name}">${val.name}</a>: ${val.count}</span>`);
                    let msg = document.createElement('p');
                    msg.classList.add('event-message');
                    msg.innerHTML = `Current Embeds:<br>${elems.join('<br>')}`;
                    return this.#chatElems.list.appendChild(msg);
                default:
                    break;
            }
        }

        let type = event.type;
        switch(type) {
            case 'live-state-change':
                this.#embedManager.handleLiveState(event.data); break;
            case 'embed': // applies to setting embed stream
                this.#embedManager.setEmbedDirectly(event.url, event.meta); break;
            case 'embeds': // msg with current user embeds
                this.#embeds = {
                    cache_time: this.#embeds.cache_time ?? 60,
                    last_check: event.time ?? Date.now(), 
                    value: event.data 
                };

                // Copy dgg embed style at top/figure out something similar
                return renderEventMessage(event);
            default:
                break;
        }
    }
    // #endregion
}

class Embed {
    constructor(data) {
        this.type = data?.type;
        this.platform = data?.platform;
        this.url = data?.src;
        this.live = data?.live;
    }
}

// needs hash management for embed support, server is ready - todo
class EmbedManager {

    // Platforms Live for Target Channel, Not Manual Embeds
        // someway for users to select preferred embed, drag and drop list in settings page - todo
    #embeds = [];

    #embedStatusElems = {
        type: null,
        embed: null,
        source: null
    }

    constructor(embedElem, pageManager) {
        let manual_embed = window.location.hash;

        this.#embedStatusElems = {
            type: document.getElementById("HeaderStatusType"),
            embed: document.getElementById("HeaderStatusEmbed"),
            source: document.getElementById("HeaderStatusSource"),
        }
    }

    setEmbedDirectly(url, platform, channel) {
        // server is responsible for direct iframe info
        console.log("Set Embed Directly:", url, platform, channel);
        // set embed selected as "selected"

    }

    setEmbed(platform, channel) {
        // client embeds will have a shortcut/table to look from
    }

    handleLiveState(data) {
        for(let i = 0; i < this.#embeds.length; i++) {
            let em = this.#embeds[i];
            if(em.platform == data.platform) { 
                if(data.live) { em = data; }
                else { this.#embeds.splice(i, 1); }
                return;
            }
        }

        // No Platform Match
        if(data.live) { this.#embeds.push(data); }

        // Change Elem
    }

    setEmbedElem(target) {
        //<img data-click="set-embed-directly" data-click-args="${emb.src}|${emb.platform}|${emb.channel}" 
            //title="${emb.platform}" src="${img_src}"/>
    }
}

class ChatSocket {
    constructor(frameElem, pageManager) {
        this.loc = window.location;

        this.frameElem = frameElem;
        this.pageManager = pageManager;

        // Embeded on Stream, Ignores Server/Event Messages
        this.embed = this.loc.pathname?.indexOf('/embed') >= 0 ?? false;

        this.events = new Map();

        this.currentChatEvent = null;
        this.chatEventHistory = [];

        this.onLoad();
    }

    onLoad() {
        // Chat URL Parser
        const secure = window.location.protocol === 'https:';
        const local = window.location.hostname.includes('localhost');
        const ngrok = window.location.hostname.includes('ngrok-free');
        const url = `${local || ngrok ? '' : 'chat.'}${window.location.host.split(".").slice(ngrok ?  - 3 : -2).join(".")}`;
        const fullURL = `${secure ? 'wss' : 'ws'}://${url}/`;

        this.connect(fullURL);
        this.on('message', (event) => {
            let msg = event.data;
            if(msg === 'ping') { return this.socket.send("pong"); }
            
            try {
                onMessage(JSON.parse(msg));
            } catch(err) {
                Log("Error:", err, msg, event);
                Log("Message Event:", event);
            }
        });

        const onMessage = (json) => {
            Log("JSON:", json);
            if(json.ServerMessage && !this.embed)
                serverMessage(json);

            if(json.EventMessage && !this.embed)
                eventMessage(json);

            if(json.MessageQueue)
                messageQueue(json);

            if(json.ChatMessage)
                chatMessage(json);
        }

        const chatMessage = (json) => {
            this.pageManager.addChatMessageElem(json.ChatMessage);
        }

        const serverMessage = (json) => {
            this.pageManager.addServerMessageElem(json.ServerMessage)
        }

        const eventMessage = (json) => {
            this.pageManager.handleEventMessage(json.EventMessage);
        }

        const messageQueue = (json) => {
            let list = json.MessageQueue;
            for(let i = 0; i < list.length; i++) {
                try { chatMessage(JSON.parse(list[i])); } catch(err) { console.log("Error Parsing JSON Queue:", err); }
            }
        }
    }

    connect(url) {
        this.socket = new WebSocket(url);
        for(let [key, value] of this.events) { this.socket.on(key, value); }
    }

    disconnect(code) {
        // add message to the ui to show disconnect - todo
        this.socket.close(code ?? 1001, "Closed by user.");
        this.events = new Map();
    }

    sendChat(value) {
        if(!(this.socket instanceof WebSocket) || typeof(value) !== 'string' || value == "")
            return;
        
        // console.log("Value Type:", typeof(value), value);
        if(typeof(value) === 'object') {
            return this.socket.send(JSON.stringify(value));
        }

        let msg = {}, addMessage = true;
        if(value.charAt(0) == '/') {
            addMessage = false;
            msg.command = value;
        } else if(value.charAt(0) == '!') {
            msg.command = value;
        }

        // event check, if event is happening and response is a valid response, send as event

        if(addMessage) {  msg.message = value; }
        this.socket.send(JSON.stringify(msg));
        // add chat elem here if local is required
        this.pageManager.setInputValue('');
    }

    removeChatWindow(code) {
        if(this.frameElem instanceof Element) { this.frameElem.classList.add('hide'); } 
        this.disconnect(code);
    }

    on(event, callback) {
        this.events.set(event, callback);
        if(this.socket instanceof WebSocket)
            this.socket.addEventListener(event, callback);
    }
}

// Access with Window or PageManager.instance
window.PageManager = new PageManager();