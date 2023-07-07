import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { DefaultHead, DefaultLayout, HeaderComponent } from './components';

// Need to Formalize Data

export const HomePage = (req: any, res: any, data: any = {}) => {
    return DefaultLayout(DefaultHead(data?.tabTitle ?? "Site Title"), `
        ${HeaderComponent(data?.headerTitle ?? data?.tabTitle ?? "Site Title", req?.session?.user?.getName(), [
            // {label: "", link: ""}
        ])}
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

    return DefaultLayout(DefaultHead(data?.tabTitle ?? "Site Title"), `
        ${HeaderComponent(data?.headerTitle ?? data?.tabTitle ?? "Site Title", req?.session?.user?.getName(), [
            // {label: "", link: ""}
        ])}
        ${page}
    `);
}

export const SignUpPage = (req: any, res: any, data: any = {}) => {
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
                value="${data?.username ?? ''}">
            </span>
            <span class="auth-input">
                <label for="code">Code:</label>
                <input type="text" name="code" id="code" placeholder="Optional">
            </span>
            <input type="hidden" name="data" value="${JSON.stringify(data).replace(/"/g, '\'')}">
            <span class="column-spacer"></span>
            <button class="auth-button" type="submit">Create Account</button>
        </form>
    </main>`;

    return DefaultLayout(DefaultHead(data?.tabTitle ?? "Site Title"), `
        ${HeaderComponent(data?.headerTitle ?? data?.tabTitle ?? "Site Title", req?.session?.user?.getName(), [
            // {label: "", link: ""}
        ])}
        ${page}
    `);
}

export const ChatPage = (req: any, res: any) => {

}

