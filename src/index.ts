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
import { DatabaseConnection } from './data';

async function Start() {
    const server = new Server();

    // Runs App - Can make this argv driven later.
    const chat = new ChatHandler(server);
}

Start();