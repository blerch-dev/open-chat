import { v4 as uuidv4 } from 'uuid';

export enum Status {
    VALID = 1 << 0, // also works as "follows" per channel
    BANNED = 1 << 1,
    MUTED = 1 << 2
}

export interface RoleInterface {
    name: string,
    icon: string,
    value: number,
    color: string
}

const nameToURL = (str: string) => { return str.toLowerCase().replace(' ', '-'); }
const valToRI = (val: number, str: string, hex: string = "#ffffff") => {
    return { name: str, icon: `/assets/badges/${nameToURL(str)}.svg`, value: val, color: hex };
}

// Change to Fit Client
const roleData: RoleInterface[] = [
    valToRI(1 << 0, 'Owner', '#ff0000'),
    valToRI(1 << 1, 'Admin', '#ff5c00'),
    valToRI(1 << 2, 'Mod', '#ffff00'),
    valToRI(1 << 3, 'VIP'),
    valToRI(1 << 4, 'Contributor'),
    valToRI(1 << 5, 'Bot'),
    valToRI(1 << 6, 'Sub1'),
    valToRI(1 << 7, 'Sub2'),
    valToRI(1 << 8, 'Sub3'),
    valToRI(1 << 9, 'Sub4'),
    valToRI(1 << 10, 'Sub5')
]

export const RoleValue: { [key: string]: number } = {};
export const Roles: { [key: string]: RoleInterface } = {};
for(let i = 0; i < roleData.length; i++) { 
    let rd = roleData[i];
    RoleValue[rd.name.toUpperCase()] = rd.value;
    Roles[rd.name] = rd;
}

export interface UserRecord {
    id: number,
    user_id: string,
    type: number,
    valid: boolean,
    created_at: number,
    expires: number,
    notes?: string
}

export interface UserData {
    uuid: string,
    name: string,
    roles?: number,
    status?: number,
    age?: number,
    connections?: UserConnection | UserConnectionDB,
    records?: UserRecord[]
}

export interface UserConnection {
    twitch?: { id: string, name: string },
    youtube?: { id: string, name: string },
    discord?: { id: string, name: string }
}

export interface UserConnectionDB {
    user_id: string,
    twitch_id: string,
    twitch_name: string,
    youtube_id: string,
    youtube_name: string,
    discord_id: string,
    discord_name: string
}

export class User {
    static GenerateUUID() { return uuidv4(); }
    static ValidUserData(data: UserData) {
        return data?.uuid && data?.name;
    }

    private data: UserData = { uuid: "", name: "" }

    constructor(data?: UserData) {
        this.data = {
            uuid: data?.uuid ?? "",
            name: data?.name ?? "",
            roles: data?.roles ?? 0,
            status: data?.status ?? 0,
            age: data?.age ?? Date.now(),
            connections: (data?.connections as UserConnectionDB)?.user_id ? {
                twitch: { 
                    id: (data?.connections as UserConnectionDB)?.twitch_id ?? undefined,
                    name: (data?.connections as UserConnectionDB)?.twitch_name ?? undefined
                },
                youtube: { 
                    id: (data?.connections as UserConnectionDB)?.youtube_id ?? undefined,
                    name: (data?.connections as UserConnectionDB)?.youtube_name ?? undefined
                },
                discord: { 
                    id: (data?.connections as UserConnectionDB)?.discord_id ?? undefined,
                    name: (data?.connections as UserConnectionDB)?.discord_name ?? undefined
                },
            } : data?.connections as UserConnection ?? {},
            records: data?.records ?? []
        }
    }

    public toJSON() { return this.data; }
    public getUUID() { return this.data.uuid; }
    public getName() { return this.data.name; }
    public getRoles() {
        let keys = Object.keys(Roles); let roles = [];
        for(let i = 0; i < keys.length; i++) {
            if(Roles[keys[i]].value & (this.data?.roles ?? 0)) { roles.push(Roles[keys[i]]); }
        }

        return roles.sort((a, b) => a.value - b.value);
    }
    public getStatus() { return this.data.status; }
    public getEffectiveStatus() {
        let status = this.data.status ?? 0; let records = this.data.records ?? [];
        for(let i = 0; i < records.length; i++) {
            if(records[i].valid && records[i].expires > Date.now())
                status = status | records[i].type;
        }

        return status;
    }
}

