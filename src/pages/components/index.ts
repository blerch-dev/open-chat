import { ChatComponent } from "./chat";
import { HeaderComponent } from "./header";
import { EmbedComponent } from "./embed";

interface bodyOptions {
    transparent?: boolean
}

export const DefaultLayout = (req: any, res: any, data: any = {}, body: string = "") => `
    <!DOCTYPE html>
    <html lang="en">
        <script> var exports = {}; </script>
        <head>${DefaultHead(data)}</head>
        <body ${data?.site?.transparent ?? false ? 'style="background-color: transparent;"' : ''}>
        ${HeaderComponent(req, res, data)}
        ${body}
        </body>
    </html>
`;

export const DefaultHead = (data: any = {}) => `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/assets/favicon.ico" />
    <title>${data?.site?.content?.tab ?? "Tab Title"}</title>
    <link rel="stylesheet" href="/css/style.css">
    <script type="module" src="/js/main.js"></script>
`;

export {
    ChatComponent, HeaderComponent, EmbedComponent
}