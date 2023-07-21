import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../.env') });

// Runs Aysnc Commands
import { ExecException, exec } from 'child_process';
const exe = (cmd: string): Promise<ExecException | string> => {
    return new Promise((res, rej) => {
        exec(cmd, (error, stdout, stderr) => {
            if(error) { return rej(error); }
            res(stdout);
        });
    });
}

import { Server } from './server';
import { ChatHandler } from './chat';

async function Start() {
    const server = new Server();

    // Runs App - Can make this argv driven later.
    const chat = new ChatHandler(server);
}

Start();