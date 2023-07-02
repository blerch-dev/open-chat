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
import { ChatServer } from './chat';
import { DatabaseConnection } from './data';

async function Start() {
    const server = new Server();

    if(process.argv.includes('--db-format')) {
        let db = new DatabaseConnection(server);
        let result = await db.queryDB(DatabaseConnection.FormatString);
        if(result instanceof Error)
            console.error(result);
        else
            console.log("Database Formatted!");

        return;
    }

    // Runs App - Can make this argv driven later.
    new ChatServer();
}

Start();