import { ChatComponent } from "./chat";
import { HeaderComponent } from "./header";
import { EmbedComponent } from "./embed";

interface bodyOptions {
    transparent?: boolean
}

export const DefaultLayout = (head: string, body: string, options?: bodyOptions) => `
    <!DOCTYPE html>
    <html lang="en">
        <script> var exports = {}; </script>
        <head>${head}</head>
        <body ${options?.transparent ?? false ? 'style="background-color: transparent;"' : ''}>${body}</body>
    </html>
`;

export const DefaultHead = (title: string) => `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/assets/favicon.ico" />
    <title>${title}</title>
    <link rel="stylesheet" href="/css/style.css">
    <script type="module" src="/js/main.js"></script>
`;

export {
    ChatComponent, HeaderComponent, EmbedComponent
}