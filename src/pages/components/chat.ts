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
        <header>
            <h4 id="ChatStatus">${data?.content?.chat ?? ""}</h4>
            <div class="chat-controls">
                <span tabindex="2${getNV(0)}" id="ChatSettingsButton"><img style="width: 16px;" src="/assets/icons/settings.svg"></span>
                ${options?.controls === false ? '' : `
                    <span tabindex="2${getNV()}" id="ChatPopoutButton"><img src="/assets/icons/popout.svg"></span>
                    <span tabindex="2${getNV()}" id="ChatCloseButton"><img src="/assets/icons/exit.svg"></span>
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
        <footer>
            <input tabindex="6${getNV(0)}" id="ChatInput" type="text" placeholder="Message..."/>
            <button tabindex="6${getNV()}" id="ChatSend" type="button">Send</button>
        </footer>
        <script type="module" src="/js/chat.js"></script>
    </div>
`};

export const ChatSettingsPage = (isDev: boolean) => {
    return `
    <h4>Settings Page</h4>
    ${isDev ? ChatSettingsGroup("Advanced Settings", `
        <span class="chat-settings-input-group">
            <label for="dev-debug">Debug</label>
            <input type="checkbox" id="dev-debug" name="dev-debug" data-sync data-click="sync-data">
        </span>
    `) : ''}
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