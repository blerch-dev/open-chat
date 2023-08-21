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

    // Events
    #currentEvent = null;
    #currentEventCB = null;

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
            status: document.getElementById("ChatStatus"),
            events: document.getElementById("InteractList")
        }

        // Settings
        this.#settings = {};
        Log("Load Settings:", this.LoadSettings(this.#settings, true));

        this.#embedManager = new EmbedManager(document.getElementById('EmbedWindow'), this);
        this.#chatSocket = new ChatSocket(this.#chatElems.frame, this);
    
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
                if(e.target.classList.contains('selected')) { break; }
                this.#embedManager.setEmbedDirectly(...(e.target.dataset?.clickArgs.split('|') ?? [])); break;
            case "clear-embed":
                if(!e.target.classList.contains('embed')) { break; }
                let uri = window.location.toString();
                if(uri.indexOf('#') > 0) { uri = uri.substring(0, uri.indexOf('#')); }
                window.history.pushState({}, document.title, uri)
                this.#embedManager.setEmbedDirectly("");
                this.#embedManager.setEmbedElem(undefined);
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
            console.log("User:", data?.user);
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
            // console.log("Rendering Event Message:", json);
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
            case 'event-poll':
                this.handlePoll(event.data); break;
            default:
                break;
        }
    }
    // #endregion

    // #region Events
    handlePoll(data) {
        if(this.#currentEvent != null) { return; }
        this.#currentEvent = data;

        let elem = document.createElement('div');
        elem.classList.add('poll-container');
        elem.innerHTML = `
            <span class="poll-title">${data.title}</span>
            <p class="poll-author">Started by ${data.author}</p>
            <div>
                ${data.options.map((val, ind) => `
                    <span class="poll-option">${val}
                        <span class="poll-option-value" data-option="${ind}">${data?.values?.[ind] ?? 0}<span>
                    </span>`
                ).join('')}
            </div>
            <span id="poll-clock" class="poll-clock"></span>
        `;

        elem = this.#chatElems.events.appendChild(elem);
        let elems = elem.getElementsByClassName('poll-option-value');
        
        const handler = (ts) => {
            console.log(ts, data.started, data.expires, (data.expires - Date.now()) / (data.expires - data.started));
            // check for updates to values
            // apply values to value elements
            // calculate time change
            requestAnimationFrame(handler);
        }

        handler();
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

    #embeds = [];
    #currentEmbed = undefined;
    #default = "";

    #embedStatusElems = {
        type: null,
        embed: null,
        source: null
    }

    constructor(embedElem, pageManager) {
        this.#embedStatusElems = {
            pill: document.getElementById("HeaderStatus"),
            iframe: document.getElementById("EmbedSource"),
            type: document.getElementById("HeaderStatusType"),
            embed: document.getElementById("HeaderStatusEmbed"),
            source: document.getElementById("HeaderStatusSource"),
        }

        window.addEventListener('hashchange', (event) => {
            this.handleHash(window.location.hash);
        });

        this.#default = this.#embedStatusElems?.embed?.textContent;
        this.handleHash(window.location.hash);
    }

    setEmbedDirectly(url, platform, channel) {
        // server is responsible for direct iframe info
        Log("Set Embed Directly:", url, platform, channel);
        // this.#embedStatusElems.iframe.src = src;
        if(!this.#embedStatusElems.iframe.contentDocument?.location?.replace(url)) {
            this.#embedStatusElems.iframe.src = "";
        }
    }

    setEmbed(platform, channel) {
        // client embeds will have a shortcut/table to look from
        let src = this.getEmbedSource(platform, channel);
        this.#embedStatusElems.iframe.contentDocument?.location?.replace(src);
        const embed = { src, platform, channel };
        this.#currentEmbed = embed;
        this.setEmbedElem(embed);
    }

    handleHash(hash) {
        if(!hash) { return; }
        Log("Embedding Hash:", hash);
        hash = hash.substring(1);
        this.setEmbed(...hash.split('/'));
    }

    handleLiveState(data) {
        console.log("Handling Live:", data, this.#embeds);
        let changed = false;
        for(let i = 0; i < this.#embeds.length; i++) {
            if(this.#embeds[i].platform == data.platform) { changed = true; this.#embeds[i] = data }
        }

        // No Platform Match
        if(!changed && data.live) { this.#embeds.push(data); }
    }

    setEmbedElem(embed = this.#embeds) {
        let embeds = Array.isArray(embed) ? embed : [embed].filter(val => val != undefined);
        const imgSrc = (emb, index) => {
            let img_src = "";
            switch(emb.platform.toLowerCase()) {
                case "twitch":
                    img_src = "/assets/logos/twitch.svg"; break;
                case "youtube":
                    img_src = "/assets/logos/youtube.svg"; break;
                default:
                    img_src = "/assets/icons/info.svg"; break;
            }

            return `<img data-click="set-embed-directly" data-click-args="${emb.src}|${emb.platform}|${emb.channel}" 
                title="${emb.platform}" src="${img_src}"${index == 0 ? ' class="selected"' : ''}/>`
        }
        
        let em_str = embeds.map(imgSrc).join('');
        Log("Setting Embed Elem:", embed, embeds);
        if(embeds.length === 0) {
            this.#embedStatusElems.type.textContent = "Offline";
            this.#embedStatusElems.source.innerHTML = "●";
            this.#embedStatusElems.embed.textContent = this.#default;
            this.#embedStatusElems.pill.classList.remove('embed');
        } else {
            let type = embed?.live === undefined ? "Embed" : embed?.live ? "Live" : "Offline";
            Log("Setting Elems:", type, em_str, embed?.channel ?? "");
            this.#embedStatusElems.type.textContent = type;
            this.#embedStatusElems.source.innerHTML = em_str;
            this.#embedStatusElems.embed.textContent = embed?.channel ?? "";
            if(embed?.live === undefined) { this.#embedStatusElems.pill.classList.add('embed'); }
        }
    }

    getEmbedSource(platform, id, withParent = true) {
        let pstr = withParent ? `&parent=${window.location.hostname}` : '';
        let embed = (platform && id) ? [platform, id] : window.location.hash?.split('/');
        switch(embed[0]) {
            case "#youtube":
            case "youtube":
                return `https://www.youtube.com/embed/${embed[1]}?autoplay=1&playsinline=1&hd=1${pstr}`;
            case "#twitch":
            case "twitch":
                return `https://player.twitch.tv/?channel=${embed[1]}${pstr}`;
            case "#kick":
            case "kick":
                return `https://player.kick.com/${embed[1]}?autoplay=true${pstr}`;
            case "#rumble":
            case "rumble":
                return `https://rumble.com/embed/${embed[1]}/?pub=7a20&rel=5&autoplay=2${pstr}`;
            default:
                return ""; // could embed error page
        }
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