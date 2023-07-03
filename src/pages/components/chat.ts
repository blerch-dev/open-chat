interface chatOptions {
    embed?: string,
    directLink?: string,
    transparent?: boolean,
    flex?: boolean,
    controls?: boolean
}

export const ChatComponent = (title: string, options?: chatOptions) => {
    let cv = 0;
    const getNV = (sv?: number) => { if(sv != undefined) { cv = sv; } return ('0' + cv++).slice(-2) }
    return `
    <div id="ChatWindow" 
        class="${options?.transparent ?? false ? 'embed-chat' : ''} ${options?.flex ?? false ? 'fill-space' : ''}" 
        data-embed="${options?.embed ?? ''}" 
        data-link="${options?.directLink ?? ''}"
    >
        <header>
            <h4>${title}</h4>
            <div class="chat-controls">
                <span tabindex="2${getNV(0)}" id="ChatSettingsButton"><img style="width: 16px;" src="/assets/settings.svg"></span>
                ${options?.controls === false ? '' : `
                    <span tabindex="2${getNV()}" id="ChatPopoutButton"><img src="/assets/popout.svg"></span>
                    <span tabindex="2${getNV()}" id="ChatCloseButton"><img src="/assets/exit.svg"></span>
                `}
            </div>
        </header>
        <span id="InteractList" data-tab="3"></span>
        <main class="no-scrollbar" style="padding: 0px;">
            <div id="ChatMessageList" data-tab="4"></div>
            <form id="ChatSettings" class="hide">
                <h4>Settings Page</h4>
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