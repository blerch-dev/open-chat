export const EmbedComponent = (req: any, data: any = {}, options: any = {}) => {
    let cv = 0;
    const getNV = () => { return ('0' + cv++).slice(-2) }

    let links = data.site?.links ?? [];
    let header = data.site?.content?.header ?? "Header Title";

    let iframeOptions = ``;
    iframeOptions += data?.embeds?.length > 0 ? ` src="${data.embeds[0].src}"` : '';

    return `
        <div id="EmbedWindow">
            <div id="EmbedHeader">
                <div class="embed-header-group">
                    <a tabindex="2${getNV()}" href="/"><h2>${header}</h2></a>
                    <div class="header-links">
                        ${links?.map((l: any) => { return `<a tabindex="2${getNV()}" href="${l.link}">${l.label}</a>` }).join('')}
                    </div>
                </div>
                <div class="embed-header-group">
                    ${EmbedControlComponent(data)}
                </div>
            </div>
            <iframe id="EmbedSource"${iframeOptions}></iframe>
            <div id="EmbedBackground"></div>
        </div>
    `;
};

export const EmbedControlComponent = (data: any = {}) => {

    let embedElems = [...data.embeds].map((emb: { platform: string, src: string, channel: string }, index: number) => {
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
            title="${emb.platform}" src="${img_src}"${index == 0 ? ' class="selected"' : ''}/>`;
    });

    // this might be completely rewritten, its currently a miss of different embed/live type flows
    return `
    <span id="HeaderStatus" class="${[...data.embeds].length == 0 ? '' : 'is-live'}" data-click="clear-embed">
        <p>
            <span id="HeaderStatusType" style="color: #ffffff55">${[...data.embeds].length == 0 ? 'Offline' : 'Live'}</span>
            <span id="HeaderStatusEmbed">${data?.env?.CHANNEL_DISPLAY ?? 'Channel Name'}</span>
            |
            <span id="HeaderStatusSource">
                ${[...data.embeds].length == 0 ? '●' : embedElems.join('')}
            </span>
        </p>
    </span>
    `;
}