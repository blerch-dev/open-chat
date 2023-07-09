import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { DefaultHead, DefaultLayout, HeaderComponent } from './components';
import { Roles } from '../user';

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
    let isDev = req?.session?.user?.roles & Roles["Admin"]?.value;

    let dev = `
    <div id="Developer" class="profile-section">
        <h2>Developer Info</h2>
        <span class="profile-card">
            <h4>Full User</h4>
            <pre>${JSON.stringify(req.session.user, null, 2)}</pre>
        </span>
    </div>
    `;

    // Role Placeholder
    /*
        ${roles.map((ri) => {
            return `<p style="color: ${ri.color};">${ri.name}</p>`
        }).join('<br>')}
    */

    // Connection Placeholder
    /*
        ${con?.twitch ? `
            <span class="profile-card-tag twitch-tag">
                <img src="/assets/logos/twitch.svg">
                <h4>${con.twitch.username}</h4>
            </span>
        ` : `
            <a href="${auth_link('/twitch')}"><h4>Add Twitch Account</h4></a>
        `}
        ${con?.youtube ? `
            <span class="profile-card-tag youtube-tag">
                <img src="/assets/logos/youtube.svg">
                <h4>${con.youtube.username}</h4>
            </span>
        ` : `
            <a href="${auth_link('/youtube')}"><h4>Add Youtube Account</h4></a>
        `}
    */

    let content = `
    <div class="content-section">
        ${isDev ? dev : ''}
        <div id="Account" class="profile-section">
            <h2>Account Details</h2>
            <span class="profile-card">
                <span class="profile-card-tag">
                    <h4>Username:</h4>
                    <p>${req?.session?.user?.name}</p>
                </span>
                <span class="profile-card-group">
                    <h4>Roles:</h4>
                    <p>role placeholder</p>
                </span>
            </span>
        <div>
        <div>
            <h2>Connections</h2>
            <span class="profile-card">
                <p>connection placeholder</p>
            </span>
        </div>
        <div>
            <h2>Channels</h2>
            <span class="profile-card">
                    <h4>Channels TODO</h4>
            </span>
        </div>
    </div>
    `;

    let page = `
    <main class="profile-page">
        <nav class="section-nav">
            <div style="flex: 1;">
                ${isDev ? '<a href="/profile#Developer">Developer</a>' : ''}
                <a href="/profile#Account">Account</a>
            </div>
            <div style="padding-bottom: 20px;">
                <span class="section-link">
                    <a href="/logout">Logout</a>
                </span>
            </div>
        </nav>
        ${content}
    </main>
    `;

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

export const ChatPage = (req: any, res: any, data: any = {}) => {
    let page = ``;

    return DefaultLayout(req, res, data, `
        ${page}
    `);
}

