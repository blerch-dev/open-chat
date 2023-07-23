interface chatOptions {
    embed?: string,
    directLink?: string,
    transparent?: boolean,
    flex?: boolean,
    controls?: boolean
}

export const ChatComponent = (data: any = {}, options: chatOptions = {}, isDev = false) => {
    let cv = 0;
    const getNV = (sv?: number) => { if(sv != undefined) { cv = sv; } return ('0' + cv++).slice(-2) }
    return `
    <div id="ChatWindow" 
        class="${options?.transparent ?? false ? 'embed-chat' : ''} ${options?.flex ?? false ? 'fill-space' : ''}" 
        data-embed="${options?.embed ?? ''}" 
        data-link="${options?.directLink ?? ''}"
    >
        <header${options?.controls === false ? ' class="hide"' : ''}>
            <h4 id="ChatStatus">${data?.content?.chat ?? ""}</h4>
            <div class="chat-controls">
                <span tabindex="2${getNV(0)}" id="ChatSettingsButton" title="Settings"><img style="width: 16px;" src="/assets/icons/settings.svg"></span>
                ${options?.controls === false ? '' : `
                    <span tabindex="2${getNV()}" id="ChatPopoutButton" title="Popout"><img src="/assets/icons/popout.svg"></span>
                    <span tabindex="2${getNV()}" id="ChatCloseButton" title="Close"><img src="/assets/icons/exit.svg"></span>
                `}
            </div>
        </header>
        <span id="InteractList" data-tab="3"></span>
        <main class="no-scrollbar" style="padding: 0px;">
            <div id="ChatMessageList" data-tab="4"></div>
            <form id="ChatSettings" class="hide">
                ${ChatSettingsPage(isDev)}
            </form>
        </main>
        <span id="FillList" class="no-scrollbar" data-tab="5"></span>
        <footer${options?.controls === false ? ' class="hide"' : ''}>
            <span class="chat-inputs">
                <textarea tabindex="6${getNV(0)}" id="ChatInput" autocomplete="off" placeholder="Message..."
                    oninput='this.style.height = ""; this.style.height = this.scrollHeight + "px"' /></textarea>
                <button tabindex="6${getNV()}" id="ChatSend" type="button">Send</button>
            </span>
            <span class="chat-actions">
                <button id="ChatEmbeds" title="Embeds"><img src="/assets/icons/eye.svg" height="18px"></button>
            </span>
        </footer>
        <script type="module" src="/js/chat.js"></script>
    </div>
`};

export const ChatSettingsPage = (isDev: boolean) => {
    return `
        <h4>Settings Page</h4>
        ${isDev ? ChatSettingsGroup("Advanced Settings", `
            ${ChatSettingsInputGroup(`
                <label for="dev-debug">Debug</label>
                <input type="checkbox" id="dev-debug" name="dev-debug" data-sync data-click="sync-data">
            `)}
        `) : ''}
        ${ChatSettingsGroup("Chat Layout", `
            ${ChatSettingsInputGroup(`
                <label for="input-overflow">Overflow Text Input</label>
                <input type="checkbox" id="input-overflow" name="input-overflow" data-sync data-click="sync-data">
            `)}
            ${ChatSettingsInputGroup(`
                <label for="input-show-send">Show Send Button</label>
                <input type="checkbox" id="input-show-send" name="input-show-send" data-sync data-click="sync-data">
            `)}
        `)}
    `;
}

export const ChatSettingsGroup = (name: string, body: string) => {
    return `
    <div class="chat-settings-group closed">
        <span class="chat-settings-group-label" data-click="toggle-settings-group">
            <img src="/assets/icons/drop.svg">
            <h4>${name}</h4>
        </span>
        <div class="chat-settings-group-body">
            ${body}
        </div>
    </div>
    `;
}

export const ChatSettingsInputGroup = (body: string) => {
    return `<span class="chat-settings-input-group">${body}</span>`
}