const { Logger } = require("../dev/tools");

class Channel {
    constructor(data, quiet = false) {

        // Private Variables
        const Details = {
            id: data?.channel_id || null,
            name: data?.channel_name || null,
            domain: data?.domain || null,
            status: data?.status || null,
            stream: {
                twitch: data?.twitch_channel || null,
                youtube: data?.youtube_channel || null
            },
            twitch: {
                id: data?.twitch_id || null
            },
            uuid: data?.uuid || null
        }

        if(typeof(Details.id) !== 'string') {
            let str = "Channel Requires ID of type 'string'."
            if(quiet === true)
                return Error(str);

            throw Error(str);
        }

        // Public Functions
        this.getDetails = () => { return Details }
    }
}

module.exports = {
    Channel
}