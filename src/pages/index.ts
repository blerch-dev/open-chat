// import path from 'path';
// import * as dotenv from 'dotenv';
// dotenv.config({ path: path.join(__dirname, '../.env') });

import { DefaultHead, DefaultLayout, HeaderComponent } from './components';

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

export const AuthPage = (req: any, res: any) => {

}

export const ChatPage = (req: any, res: any) => {

}

