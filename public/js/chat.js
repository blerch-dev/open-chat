class ChatSocket {
    constructor(loc) {
        //console.log("Loaded:", loc); // Should do maps here
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
        //console.log("Send Value:", value);
    };

    on(event, callback) {
        this.events.set(event, callback);
        if(this.socket instanceof WebSocket)
            this.socket.addEventListener(event, callback);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const frame = document.getElementById("ChatWindow");
    const chat = document.getElementById("ChatMessageList");
    const input = document.getElementById("ChatInput");
    const submit = document.getElementById("ChatSend");
    const settings = document.getElementById("ChatSettings");
    const status = document.getElementById("ChatStatus");

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

    ConfigureChat(frame, chat, input, submit, settings, status);

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

        if(e.target.dataset) { console.log("Dataset:", e.target.dataset); }
        switch(e.target.dataset) {
            case "toggleSettingsGroup":
                e.target.firstChild.classList.toggle('closed');
                e.target.nextSibling.classList.toggle('hide');
                break;
            default:
                break;
        }
    });

    const ToggleSettings = () => {
        if(!(settings instanceof Element))
            return console.log("No settings element.");

        const settings_button = document.getElementById("ChatSettingsButton");
        const open = !settings.classList.contains('hide');
        let currently_open = settings.classList.toggle('hide', open);
        settings_button.classList.toggle('negative', !currently_open);
    }

    const SaveSettings = () => {
        // configure settings on change
    }

    const LoadSettings = () => {
        let str = localStorage.getItem("chatSettings") ?? null, json = {};
        if(typeof(str) === 'string') { json = JSON.parse(str); }
        return GetAllDataSyncFields(json);
    }

    const GetAllDataSyncFields = (defaultValues) => {
        // Broken, Almost there
        const getChildFields = (target, previousField = undefined) => {
            let elems = target.children, data = {};
            if(elems.length > 0) { console.log(`Searching Through ${elems.length} Element${elems.length > 1 ? 's' : ''}`) }
            for(let i = 0; i < elems.length; i++) {
                let field = elems[i]?.dataset?.sync, elem = elems[i];
                console.log("Current Elem Dataset:", field, previousField, elem.dataset.click);
                if(!field && elem.children.length == 0)
                    continue;

                let nextField = field ?? previousField;
                if(field) {
                    if(elem.dataset.click == "syncData") {
                        console.log(' -> Returning Value', defaultValues[field] ?? null);
                        return defaultValues[field] ?? null;
                    } else {
                        field = field ?? previousField
                        data[field] = getChildFields(elem, nextField);
                    }
                }
            }
            return data;
        }

        return getChildFields(settings);
    }

    console.log("Load Settings:", LoadSettings());
    
    const RemoveChat = (code) => { if(frame instanceof Element) { frame.classList.add('hide'); } ChatConnection.disconnect(code); }
});

const ChatConnection = new ChatSocket(window.location);
function ConfigureChat(frame, chat, input, submit, settings, status) {
    const secure = window.location.protocol === 'https:';
    const local = window.location.hostname.includes('localhost');
    const url = `${local ? '' : 'chat.'}${window.location.host.split(".").slice(-2).join(".")}`;
    const fullURL = `${secure ? 'wss' : 'ws'}://${url}/`;
    // console.log("Full URL:", fullURL);

    ChatConnection.connect(fullURL);
    ChatConnection.on('message', (event) => {
        let msg = event.data;
        if(msg === 'ping')
            return ChatConnection.socket.send("pong");
        
        try {
            onMessage(JSON.parse(msg));
        } catch(err) {
            console.log("Error:", err, msg, event);
            console.log("Message Event:", event);
        }
    });

    let even = true;
    const onMessage = (json) => {
        console.log("JSON:", json);
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

    }

    const messageQueue = (json) => {
        let list = json.MessageQueue;
        for(let i = 0; i < list.length; i++) {
            chatMessage(list[i]);
        }
    }
}