import { SiteData } from "../../server";

export const HeaderComponent = (req: any, res: any, data: any = {}) => {
    let cv = 0;
    const getNV = () => { return ('0' + cv++).slice(-2) }

    let links = data.site?.links ?? [];
    let header = data.site?.content?.header ?? "Header Title";

    let embedElems = [...data.embeds].map((emb: { platform: string, src: string, channel: string }, index: number) => {
        let img_src = "";
        switch(emb.platform) {
            case "Twitch":
                img_src = "/assets/logos/twitch.svg"; break;
            case "Youtube":
                img_src = "/assets/logos/youtube.svg"; break;
            default:
                img_src = "/assets/icons/info.svg"; break;
        }

        return `<img data-click="set-embed-directly" data-click-args="${emb.src}|${emb.platform}|${emb.channel}" 
            title="${emb.platform}" src="${img_src}"${index == 0 ? 'class="selected"' : ''}/>`;
    });

    return `
    <header id="Header">
        <a tabindex="1${getNV()}" href="/"><h2>${header}</h2></a>
        <div id="HeaderControls">
            <div class="header-links">
                ${links?.map((l: any) => { return `<a tabindex="1${getNV()}" href="${l.link}">${l.label}</a>` }).join('')}
            </div>
            <div class="header-controls">
                <span id="HeaderStatus" class="${[...data.embeds].length == 0 ? '' : 'is-live'}">
                    <p>
                        <span id="HeaderStatusType" style="color: #ffffff55">${[...data.embeds].length == 0 ? 'Offline' : 'Live'}</span>
                        <span id="HeaderStatusEmbed">${data?.env?.CHANNEL_DISPLAY ?? 'Channel Name'}</span>
                        |
                        <span id="HeaderStatusSource">
                            ${[...data.embeds].length == 0 ? '●' : embedElems.join('')}
                        </span>
                    </p>
                </span>
                <a tabindex="1${getNV()}" href="/live" id="Live">Stream</a>
                <a tabindex="1${getNV()}" href="${req?.session?.user ? '/profile' : '/login'}" 
                    id="Profile">${req?.session?.user?.name ?? 'Login'}
                </a>
            </div>
        </div>
    </header>
`};