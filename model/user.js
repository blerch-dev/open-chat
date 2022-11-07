// #region Imports
const { randomUUID } = require('crypto');
const { Logger } = require('../dev/tools');
// #endregion

class Roles {
    static Admin = 1 << 0;
    static Streamer = 1 << 1;
    static Bot = 1 << 2;
    static Tester = 1 << 3;

    static getName(val) {
        let keys = Object.getOwnPropertyNames(this);
        let name = null, value = null;
        for(let i = 0; i < keys.length; i++) {
            if(keys[i] == "getName")
                continue;

            if(Roles[keys[i]] & val) {
                if(value == null || value > Roles[keys[i]]) {
                    value = Roles[keys[i]];
                    name = keys[i];
                }
            }
        }

        return name ?? 'Undefined';
    }

    static getRoleData(name) {
        switch(name) {
            case 'Admin': return { src: '/assets/badge/admin.svg', color: '#ECA400' };
            case 'Streamer': return { src: '/assets/badge/streamer.svg', color: '#E31717' };
            case 'Tester': return { src: '/assets/badge/tester.svg', color: '#006D77' };
            default: return { src: undefined, color: '#fff' };
        }
    }
}

class ChannelRoles {
    static Owner = 1 << 0;
    static Mod = 1 << 1;
    static VIP = 1 << 2;
    static Sub1 = 1 << 3;
    static Sub2 = 1 << 4;
    static Sub3 = 1 << 5;

    static getName(val) {
        let keys = Object.getOwnPropertyNames(this);
        for(let i = 0; i < keys.length; i++) {
            if(keys[i] == "getName")
                continue;

            if(ChannelRoles[keys[i]] === val)
                return keys[i];
        }

        return 'Undefined';
    }
}

class UUID {
    static Generate(quiet = false) {
        return new UUID(randomUUID(), quiet);
    }

    static V4Regex = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);

    constructor(id, quiet = false) {
        if(UUID.V4Regex.exec(id) === null) {
            let str = `UUID ${id} is not valid.`
            if(quiet === true)
                return Error(str);

            throw Error(str);
        }
        
        const value = id;

        this.getValue = () => { return value };
    }
}

// Rewrite
class User {
    static NameRegex = new RegExp("[A-Za-z0-9_]{4,32}$");

    constructor(user_data, quiet = false) {
        if(typeof(user_data) !== 'object') {
            let str = `Parameter of type ${typeof(user_data)} was not expected.`;
            if(quiet === true)
                return Error(str);

            throw Error(str);
        }

        let _id = user_data?.uuid || user_data?.id;
        const Details = {
            uuid: _id instanceof UUID ? _id : new UUID(_id, quiet) || null,
            username: user_data?.username || null,
            roles: user_data?.roles || 0,
            email: user_data?.email || null,
            createdAt: user_data?.created_at || null,
            status: user_data?.status || 0,
            channels: user_data?._channels || user_data?.channels || {},
            connections: user_data.connections || {}
        }

        const Security = {
            hash: user_data?.hash,
            salt: user_data?.salt
        }

        const ChatOptions = {
            anon: false
        }

        // Dynamic Creation - Might move this - REWORK
        function _cfud(data, cur_chan) {
            let channels = cur_chan || {};
            //Logger("Setting Channels for Config", channels, cur_chan)
            function _str(str, field) {
                let spots = str.split(',');
                for(let i = 0; i < spots.length; i++) {
                    let args = spots[i].split('|');
                    if(args.length !== 2)
                        continue;

                    if(channels[args[0]] == undefined) {
                        channels[args[0]] = {
                            roles: 0,
                        }
                    }

                    channels[args[0]] = args[1];
                }
            }

            if(typeof(data.roles) === 'string')
                _str(data.roles, 'roles');

            //Logger("Setting Channels", channels);
            return channels;
        }

        // Validation
        if(!(Details.uuid instanceof UUID)) {
            let str = `ID not an instance of UUID.`;
            if(quiet === true)
                return Error(str);

            throw Error(str);
        }

        if(Details.username === null || !User.NameRegex.test(Details.username)) {
            let str = `Username ${Details.username} does not pass requirements.`;
            if(quiet === true)
                return Error(str);

            throw Error(str);
        }

        this.getDetails = () => { return Details }
        this.addChannels = (channel_data) => {
                let keys = Object.keys(channel_data);
                for(let i = 0; i < keys.length; i++) {
                    Details.channels[keys[i]] = channel_data[keys] || 0;
                }
            }
        this.addConnections = (connection_data) => { 
            let keys = Object.keys(connection_data);
            for(let i = 0; i < keys.length; i++) {
                Details.connections[keys[i]] = connection_data[keys[i]] || {};
            }
        }
        this.setChannels = (channel_data) => {
            if(typeof(channel_data) === 'object')
                Details.channels = channel_data;
        }
        this.setConnections = (connection_data) => {
            if(typeof(connection_data) === 'object')
                Details.connections = connection_data;
        }

        this.addSecurity = (data) => { Security.hash = data.hash; Security.salt = data.salt; }
        this.getSecurity = () => { return Security }

        this.setAnon = (val) => { ChatOptions.anon = !!val; }
        this.getChatOptions = () => { return ChatOptions; }
    }

    toChatter(channel_id) {
        return new Chatter(this, channel_id);
    }

    toJSON() {
        let details = this.getDetails();

        let channels = {};
        let keys = Object.keys(details.channels);
        for(let i = 0; i < keys.length; i++) {
            channels[keys[i]] = ChannelRoles.getName(details.channels[keys[i]]);
        }

        return {
            id: details.uuid.getValue(),
            username: details.username,
            roles: details.roles,
            email: details.email,
            created_at: details.created_at,
            channels: channels,
            _channels: details.channels,
            connections: details.connections
        }
    }
}

module.exports = {
    Roles, ChannelRoles, UUID, User
}