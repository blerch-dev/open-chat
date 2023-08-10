import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { 
    DefaultHead, 
    DefaultLayout, 
    MinimumLayout, 
    HeaderComponent, 
    ChatComponent, 
    EmbedComponent 
} from './components';
import { Roles, User, UserConnection, UserData } from '../user'; // Might move all user needs to components
import { Server } from '../server';
import { PlatformHandler } from '../state';

const isDev = (req: any) => { return req?.session?.user?.roles & Roles["Admin"]?.value; }

// Need to Formalize Data

export const HomePage = (req: any, res: any, data: any = {}) => {
    return DefaultLayout(req, res, data, `
        <main>
            <h3>Home Page</h3>
        </main>
    `);
}

export const AuthPage = (req: any, res: any, data: any = {}) => {
    let page = `
    <main>
        <div class="auth-form">
            <h1>Site Title</h1>
            <span class="column-spacer"></span>
            <a class="twitch-button auth-button" href="/auth/twitch"><h3>Twitch</h3></a>
            <a class="youtube-button auth-button" href="/auth/youtube"><h3>Youtube</h3></a>
            <span class="column-spacer"></span>
            <span class="options-span">
                <label for="ssi">Keep Me Signed In?</label>
                <input type="checkbox" name="ssi" id="ssi">
                <span id="ssi-control" ></span>
                <script>
                    /* Syncs SSI Checkbox */
                    document.addEventListener('DOMContentLoaded', () => {
                        let elem = document.getElementById('ssi');
                        let button = document.getElementById('ssi-control')
                        elem.checked = document.cookie.includes('ssi=true');
                        elem.addEventListener('change', function() {
                            if(this.checked)
                                document.cookie = "ssi=true";
                            else
                                document.cookie = "ssi=false";
                        });

                        button.addEventListener('click', (e) => {
                            elem.click();
                        });
                    });
                </script>
            </span>
        </div>
    </main>`

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const BetaPage = (req: any, res: any, data: any = {}) => {
    return MinimumLayout(req, res, data, `${
        `
        <h3>Open Chat Beta</h3>
        <div>
            <label>Beta Code:</label>
            <input id="beta-code" type="text">
            <button id="beta-enter">
                <p style="pointer-events: none;">Enter</p>
            </button>
            ${data?.current_code ? `<p class="bad-code">${data.current_code} is not a valid beta code.</p>` : ''}
        </div>

        <style>
            .bad-code {
                color: red;
            }

            body { 
                padding: 20px; 
            }

            h3 {
                margin-bottom: 10px;
            }

            div {
                display: flex;
                flex-direction: column;
                width: 300px;
                gap: 5px;
            }

            input, button {
                color: white;
                outline: none;
                border: 2px #ffffff3f solid;
                border-radius: 5px;
                min-height: 30px;
                font-size: 14px;
                padding: 5px;
            }

            input {
                background-color: #0000000f;
            }

            button {
                background-color: #ffffff0f;
            }
        </style>

        <script>
            console.log("Script Load");
            document.addEventListener('DOMContentLoaded', () => {
                let input = document.getElementById('beta-code');
                let button = document.getElementById('beta-enter');

                const goToSite = () => {
                    console.log("going to site: " + input.value);
                    document.cookie = "beta=" + input.value + "; expires=Fri, 31 Dec 2023 23:59:59 GMT; path=/";
                    window.location.reload();
                };

                button.addEventListener('click', () => { console.log("clicked"); goToSite(); });
                input.addEventListener('keydown', (e) => {
                    if(e.code === 'Enter' || e.code === 'NumpadEnter') { goToSite(); }
                });
            });
        </script>
        `
    }`);
}

export const SignUpPage = (req: any, res: any, data: any = {}, userdata: any = {}) => {
    let page = `
    <main>
        <form class="auth-form" action="/user/create" method="POST">
            <h1>Site Title</h1>
            <span class="column-spacer"></span>
            <span class="auth-input">
                <label for="username">Username:</label>
                <input 
                required 
                min
                maxlength="32" 
                type="username" 
                name="username" 
                id="username" 
                value="${userdata?.twitch?.name ?? userdata?.youtube?.name ?? userdata?.discord?.name ?? ''}">
            </span>
            <span class="auth-input">
                <label for="code">Code:</label>
                <input type="text" name="code" id="code" placeholder="Optional">
            </span>
            <input type="hidden" name="data" value="${JSON.stringify(userdata).replace(/"/g, '\'')}">
            <span class="column-spacer"></span>
            <button class="auth-button" type="submit">Create Account</button>
        </form>
        <script type="module" src="/js/auth.js"></script>
    </main>`;

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const ProfilePage = (req: any, res: any, data: any = {}) => {
    let dev = `
    <div id="Developer" class="profile-section">
        <h2>Developer Info</h2>
        <span class="profile-card">
            <h4>Full User</h4>
            <pre>${JSON.stringify(req.session.user, null, 2)}</pre>
        </span>
    </div>
    `;

    let roles = (userdata: UserData) => {
        return `${User.GetFullRoles(userdata?.roles ?? 0).map((ri) => {
            return `<p style="color: ${ri.color};">${ri.name}</p>`
        }).join('<br>')}`;
    }

    let status = (userdata: UserData) => {

        return ``;
    }

    let connections = (userdata: UserData) => {
        let connection = userdata?.connections as UserConnection;
        return `${connection?.twitch ? `
            <span class="profile-card-tag twitch-tag">
                <img src="/assets/logos/twitch.svg">
                <h4>${connection?.twitch?.name}</h4>
            </span>
        ` : `
            <a href="/auth/twitch"><h4>Add Twitch Account</h4></a>
        `}
        ${connection?.youtube ? `
            <span class="profile-card-tag youtube-tag">
                <img src="/assets/logos/youtube.svg">
                <h4>${connection?.youtube?.name}</h4>
            </span>
        ` : `
            <a href="/auth/youtube"><h4>Add Youtube Account</h4></a>
        `}`;
    }

    let content = `
    <div class="content-section">
        ${!!isDev(req)? dev : ''}
        <div id="Account" class="profile-section">
            <h2>Account Details</h2>
            <span class="profile-card">
                <span class="profile-card-tag">
                    <h4>Username:</h4>
                    <p>${req?.session?.user?.name}</p>
                </span>
                <span class="profile-card-group">
                    <h4>Roles:</h4>
                    ${roles(req.session.user)}
                </span>
                <span>
                    <h4>Status:</h4>
                    ${status(req.session.user)}
                </span>
            </span>
        <div>
        <div>
            <h2>Connections</h2>
            <span class="profile-card">
                ${connections(req.session.user)}
            </span>
        </div>
    </div>
    `;

    let page = `
    <main class="profile-page">
        <nav class="section-nav">
            <div style="flex: 1;">
                ${!!isDev(req) ? '<a href="/profile#Developer">Developer</a>' : ''}
                <a href="/profile#Account">Account</a>
            </div>
            <div style="padding-bottom: 20px;">
                <span class="section-link">
                    <a href="/logout">Logout</a>
                </span>
            </div>
        </nav>
        <div class="scroll-box">
            ${content}
        </div>
    </main>
    `;

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const ValidAuthPage = (req: any, res: any, data: any = {}, username: string = "") => {
    let page = `
    <main>
        <span>
            <h1>Successful Auth</h1>
            <p>Redirecting to Profile...</p>
        </span>
    </main>
    <script>
        setTimeout(() => { window.location.href = '/profile'; }, 1000);
    </script>
    `

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const ErrorPage = (req: any, res: any, data: any = {}, error: { Message?: string, Code?: number } = {}) => {
    let page = `
    <main>
        <span>
            <h1>Error</h1>
            <p>${error?.Code ?? '0x0'} - ${error?.Message ?? "No Error Message..."}</p>
        </span>
    </main>
    `

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const LivePage = (req: any, res: any, data: any = {}, options: any = {}) => {
    let page = `
        <main class="live-page">
            ${EmbedComponent(data, options)}
            ${ChatComponent(data, options, !!isDev(req))}
        </main>
    `;

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const ChatPage = (req: any, res: any, data: any = {}, options: any = {}) => {
    return MinimumLayout(req, res, data, `${ChatComponent(data, options, !!isDev(req))}`);
}

export const DevPage = async (req: any, res: any, data: any = {}, server?: Server) => {
    // Embed/Chat Vertically to the side of the page for monitoring while on dev page
        // Click to load embed, button above chat to save from audio on page load
    // List of functional inputs for check state/managing app


    let handler = (server?.getPlatformManager()?.getPlatformConnections('Kick')) as PlatformHandler;
    await handler.forceScrapLiveCheck();
    let scrap = handler.getLatestScrap();

    let ph = new PlatformHandler('TestKick');
    await ph.forceScrapLiveCheck('https://kick.com/ohgood');
    let sc = ph.getLatestScrap();

    // Eventually, this will be all api calls and will remove the async function and return just a string

    let page = `
        <main class="admin-page">
            <div>
                <p>Offline Check</p>
                <pre data-click="toggle-show-all">${scrap.value.replace(/<\/?[^>]+(>|$)/g, "")}</pre>
            </div>
            <div>
                <p>Online Check</p>
                <pre data-click="toggle-show-all">${sc.value.replace(/<\/?[^>]+(>|$)/g, "")}</pre>
            </div>
        </main>
        <script type="module" src="/js/admin.js"></script>
    `;

    res.send(DefaultLayout(req, res, data, `
        ${page}
    `));
}