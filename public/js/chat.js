// TODO - Page Managment (Possible Mod Support Enabler)
class PageManager {
    constructor() {}
}

class EmbedManager {
    constructor(embedElem) {}

    setEmbedDirectly(url, meta) {
        // server is responsible for direct iframe info
    }

    setEmbed(platform, channel) {
        // client embeds will have a shortcut/table to look from
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

// #region Settings Automation
var SettingsData = {};

const SaveSettings = () => {
    Log("Saving Settings:", SettingsData);
    window.localStorage.setItem("chatSettings", JSON.stringify(SettingsData));

    const _objToId = (field) => {
        return field.split(/(?=[A-Z])/).map(val => val.toLowerCase()).join('-');
    }

    let keys = Object.keys(SettingsData);
    for(let i = 0; i < keys.length; i++) {
        let id = _objToId(keys[i]);
        let elem = document.getElementById(id);
        if(elem) { SetElemValue(elem, SettingsData[keys[i]]); }
    }
}

const LoadSettings = (root, forceElementSync = false) => {
    let str = localStorage.getItem("chatSettings") ?? null, json = {};
    if(typeof(str) === 'string') { json = JSON.parse(str); }
    if(forceElementSync) { json = BuildJsonStructure(json); }
    SaveSettings();
    return json;
}

const SetElemValue = (elem, value) => {
    switch(elem.type) {
        case "checkbox":
            elem.checked = !!value; break;
        default:
            elem.value = value;
    }
}

const GetElemValue = (elem) => {
    switch(elem.type) {
        case "checkbox":
            return elem.checked;
        default:
            return elem.value;
    }
}

const SetDataForSettingsElement = (elem, valueOverride = undefined) => {
    const _idToObj = (str) => { 
        let args = str.split('-'); let output = args.shift();
        return output + args.map(val => { 
            let s = val.charAt(0).toUpperCase(); return s + val.slice(1); 
        }).join('');
    }

    let field = _idToObj(elem.id);
    if(elem.id) { SettingsData[field] = valueOverride?.[field] ?? GetElemValue(elem); }
}

const BuildJsonStructure = (defaultValues = undefined) => {
    let elems = document.querySelectorAll('[data-sync]');
    for(let i = 0; i < elems.length; i++) {
        SetDataForSettingsElement(elems[i], defaultValues);
    }

    return SettingsData;
}
// #endregion

const Log = (...args) => {
    if(SettingsData?.devDebug) { console.log(args); }
}

document.addEventListener('DOMContentLoaded', () => {
    const frame = document.getElementById("ChatWindow");
    const chat = document.getElementById("ChatMessageList");
    const input = document.getElementById("ChatInput");
    const submit = document.getElementById("ChatSend");
    const settings = document.getElementById("ChatSettings");
    const status = document.getElementById("ChatStatus");

    const embed = new EmbedManager(document.getElementById('EmbedWindow'));

    const getValue = () => {
        let msg = input.value;
        if(msg !== '' && msg != undefined) {
            ChatConnection.sendChat(msg); input.value = "";
        }
        input.focus();
    }

    input.addEventListener('keydown', (e) => {
        if(e.code == "Enter" || e.code == "NumpadEnter")
            getValue();
    });

    submit.addEventListener('click', (e) => {
        getValue();
    });

    ConfigureChat(embed, frame, chat, input, submit, settings, status);

    document.addEventListener('click', (e) => {
        switch(e.target.id) {
            case "ChatSettingsButton":
                ToggleSettings(); break;
            case "ChatPopoutButton":
                window.open(ChatConnection.loc.origin + '/chat', '_blank', 'location=yes,height=900,width=300,scrollbars=no,status=yes');
                RemoveChat(1000); break;
            case "ChatCloseButton":
                RemoveChat(1001); break;
            default:
                break;
        }

        switch(e.target.dataset?.click) {
            case "toggle-settings-group":
                e.target.parentElement.classList.toggle('closed');
                break;
            case "sync-data":
                SetDataForSettingsElement(e.target);
                SaveSettings();
                break;
            default:
                break;
        }
    });

    const ToggleSettings = () => {
        if(!(settings instanceof Element))
            return Log("No settings element.");

        const settings_button = document.getElementById("ChatSettingsButton");
        const open = !settings.classList.contains('hide');
        let currently_open = settings.classList.toggle('hide', open);
        settings_button.classList.toggle('negative', !currently_open);
    }

    Log("Load Settings:", LoadSettings(settings, true));
    
    const RemoveChat = (code) => { if(frame instanceof Element) { frame.classList.add('hide'); } ChatConnection.disconnect(code); }
});

const ChatConnection = new ChatSocket(window.location);
function ConfigureChat(embed, frame, chat, input, submit, settings, status) {
    const secure = window.location.protocol === 'https:';
    const local = window.location.hostname.includes('localhost');
    const url = `${local ? '' : 'chat.'}${window.location.host.split(".").slice(-2).join(".")}`;
    const fullURL = `${secure ? 'wss' : 'ws'}://${url}/`;
    // Log("Full URL:", fullURL);

    ChatConnection.connect(fullURL);
    ChatConnection.on('message', (event) => {
        let msg = event.data;
        if(msg === 'ping')
            return ChatConnection.socket.send("pong");
        
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
        if(json.ServerMessage && !ChatConnection.embed)
            serverMessage(json);

        if(json.EventMessage && !ChatConnection.embed)
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
    
        chat.appendChild(elem);
    }

    const serverMessage = (json) => {
        // Will change to icon/status symbol instead of text
        let code = json.ServerMessage?.code;
        if(typeof(code) === 'number') {
            if(code === 1) { status.textContent = "Connected" }
            else { status.textContent = "" }
        }

        let msg = json.ServerMessage;
        let elem = document.createElement('div');
        elem.classList.add('server-message');
        even = !even;
        elem.innerHTML = `
            <p>${msg.icon ? `<span><img src="${msg.icon}"></span> ` : ''}${msg.message}</p>
        `;

        chat.appendChild(elem);
    }

    const eventMessage = (json) => {
        let type = json.type;
        switch(type) {
            case 'embed':
                embed.setEmbedDirectly(json.url, json.meta); break;
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