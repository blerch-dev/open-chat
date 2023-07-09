import { SiteData } from "../../server";

export const HeaderComponent = (req: any, res: any, data: any = {}) => {
    let cv = 0;
    const getNV = () => { return ('0' + cv++).slice(-2) }

    let links = data.site?.links ?? [];
    let header = data.site?.content?.header ?? "Header Title";

    return `
    <header id="Header">
        <a tabindex="1${getNV()}" href="/"><h2>${header}</h2></a>
        <div id="HeaderControls">
            <div class="header-links">
                ${links?.map((l: any) => { return `<a tabindex="1${getNV()}" href="${l.link}">${l.label}</a>` }).join('')}
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
                <a tabindex="1${getNV()}" href="${req?.session?.user ? '/profile' : '/login'}" 
                    id="Profile">${req?.session?.user?.name ?? 'Login'}</a>
            </div>
        </div>
    </header>
`};