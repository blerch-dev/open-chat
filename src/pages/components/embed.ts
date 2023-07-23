export const EmbedComponent = (data: any = {}, options: any = {}) => {
    
    let iframeOptions = ``;
    iframeOptions += data?.embeds?.length > 0 ? ` src="${data.embeds[0].src}"` : '';

    return `
        <div id="EmbedWindow">
            <iframe id="EmbedSource"${iframeOptions}></iframe>
            <div id="EmbedBackground"></div>
        </div>
    `;
};