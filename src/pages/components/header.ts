

export const HeaderComponent = (header: string, username?: string, links?: { label: string, link: string }[]) => { 
    let cv = 0;
    const getNV = () => { return ('0' + cv++).slice(-2) }
    return `
    <header id="Header">
        <a tabindex="1${getNV()}" href="/"><h2>${header}</h2></a>
        <div id="HeaderControls">
            <div class="header-links">
                ${links?.map((l) => { return `<a tabindex="1${getNV()}" href="${l.link}">${l.label}</a>` }).join('')}
            </div>
            <div class="header-controls">
                <span id="HeaderStatus">
                    <p style="color: #ffffff55">
                        offline
                        <span id="HeaderStatusEmbed">blerch</span>
                        |
                        <span id="HeaderStatusSource">●</span>
                    </p>
                </span>
                <a tabindex="1${getNV()}" href="/live" id="Live">Stream</a>
                <a tabindex="1${getNV()}" href="${username ? '/profile' : '/login'}" id="Profile">${username ?? 'Login'}</a>
            </div>
        </div>
    </header>
`};