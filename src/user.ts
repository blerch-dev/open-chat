import { v4 as uuidv4 } from 'uuid';

export enum Status {
    VALID = 1 << 0,
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

// Change to Fit Client - Subs moving to own field
const roleData: RoleInterface[] = [
    valToRI(1 << 0, 'Owner', '#ff0000'),
    valToRI(1 << 1, 'Admin', '#ff5c00'),
    valToRI(1 << 2, 'Mod', '#ffff00'),
    valToRI(1 << 3, 'VIP'),
    valToRI(1 << 4, 'Contributor'),
    valToRI(1 << 5, 'Bot')
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
    roles: number,
    valid: boolean,
    status: number,
    age: number,
    created_at?: number,
    connections: UserConnection | UserConnectionDB,
    records: UserRecord[],
    subscriptions: UserSub[]
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

export interface UserSub {
    platform: string,
    expires: number,
    level: number
}

export class User {
    static GenerateUUID() { return uuidv4(); }
    static ValidUserData(data: UserData | User | any) {
        return data instanceof User || (!!data?.uuid && !!data?.name);
    }

    static ValidateUserData(data: UserData) {
        if(!data) { return undefined; }

        let corrected_time = data?.created_at ? data.created_at - Date.now() : undefined;
        data.age = (new Date(data?.age ?? corrected_time ?? Date.now())).getTime();
        data.records = data?.records?.filter((val) => new Date(val?.expires ?? Date.now()).getTime() <= Date.now()) ?? [];
        data.status = [...data?.records]?.reduce((pv, cv) => pv | cv?.type ?? 0, 0) ?? 0;
        // subscriptions
        return data;

        // From Data - Might be better
        /*
            data.age = (new Date(data.created_at)).getTime();

            let records = data.records.filter((val: any) => val != null);
            data.records = records.filter((val: any) => { 
                let expired = (new Date(val.expires ?? Date.now())).getTime() < Date.now();
                return !expired;
            });

            data.status = [...data.records].reduce((pv, cv) => pv | cv.type, 0);
        */
    }

    static GetUserConnection(connection: UserConnection | UserConnectionDB) {
        if((connection as UserConnectionDB)?.user_id) {
            return {
                twitch: { 
                    id: (connection as UserConnectionDB)?.twitch_id ?? undefined,
                    name: (connection as UserConnectionDB)?.twitch_name ?? undefined
                },
                youtube: { 
                    id: (connection as UserConnectionDB)?.youtube_id ?? undefined,
                    name: (connection as UserConnectionDB)?.youtube_name ?? undefined
                },
                discord: { 
                    id: (connection as UserConnectionDB)?.discord_id ?? undefined,
                    name: (connection as UserConnectionDB)?.discord_name ?? undefined
                }
            }
        } else {
            return connection as UserConnection;
        }
    }

    static GetFullRoles(value: number) {
        let keys = Object.keys(Roles); let roles = [];
        for(let i = 0; i < keys.length; i++) { if(Roles[keys[i]].value & (value ?? 0)) { roles.push(Roles[keys[i]]); } }
        return roles.sort((a, b) => a.value - b.value);
    }

    private data: UserData;

    constructor(data?: UserData | any) {
        this.data = {
            uuid: data?.uuid ?? "",
            name: data?.name ?? "",
            roles: data?.roles ?? 0,
            valid: data?.valid ?? true,
            status: data?.status ?? 0,
            age: data?.age ?? Date.now(),
            connections: User.GetUserConnection(data?.connections),
            records: data?.records ?? [],
            subscriptions: data?.subscriptions ?? []
        }
    }

    public toJSON() { return this.data; }
    public getUUID() { return this.data.uuid; }
    public getName() { return this.data.name; }
    public getAge() { return this.data.age; } // (Date.now() -) for actual age, this returns creation timestamp
    public getRoleValue() { return this.data.roles; }
    public getStatus() { return this.data.status; }
    public getSubscriptions() { return this.data.subscriptions; }

    public getEffectiveStatus() {
        let status = this.data.status ?? 0; let records = this.data.records ?? [];
        for(let i = 0; i < records.length; i++) {
            if(records[i].valid && records[i].expires > Date.now())
                status = status | records[i].type;
        }

        return status;
    }

    public getRoles() { return User.GetFullRoles(this.data?.roles ?? 0); }
}

