const image_link = "/default/light/1.0"

const emote_list = {
    kidnotkin: [
        {
            "name": "kidnotNODDERS",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_177801c712ca43238f9a295a6ba13479"
        },
        {
            "name": "kidnotNOPERS",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_0e5c0c41da514f3cb02ebc49b8f8b9fc"
        },
        {
            "name": "kidnotClap",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_8b5dd5acdcce465f894a37a29d99043f"
        },
        {
            "name": "kidnotFight",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_3379c5699db24d40935a0a3b2396033c"
        },
        {
            "name": "kidnotBounce",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_1ed5118315614ac6ac9a37c8482605ac"
        },
        {
            "name": "kidnotSad",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_17cbcc7247234513ab4a8a7033c360df"
        },
        {
            "name": "kidnotStare",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_57e8e215684e44d0b79c891d81dacdb7"
        },
        {
            "name": "kidnotComfy",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_364082c7a53b4d46bc05dc8a93f53c8a"
        },
        {
            "name": "kidnotEvil",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_bee92a7330b44dc1aa4e1c1703d457f8"
        },
        {
            "name": "kidnotNote",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_283cfa78fbe447a788e0f1291aab3762"
        },
        {
            "name": "kidnotOhNo",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_5fe4256b291f4db196a36362903bff9e"
        },
        {
            "name": "kidnotSTOP",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_c140800094c443b6830eed29a470a98a"
        },
        {
            "name": "kidnotAha",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_864730d87fbd48e1b99a49da615ba96b"
        },
        {
            "name": "kidnotThink",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_bf991afc0523483183d40d9efd6e61b4"
        },
        {
            "name": "kidnotHappy",
            "href": "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_040672a02c7046deb76c82e268fa702f"
        }
    ]
};

function getAllEmotes() {
    let list = Object.keys(emote_list), emotes = new Set();
    for(let i = 0; i < list.length; i++) {
        for(let j = 0; j < emote_list[list[i]].length; j++) {
            //console.log(emote_list[list[i]][j].name);
            emotes.add(emote_list[list[i]][j].name);
        }
    }

    return [...emotes];
}

function replaceEmotes(str, chl) {
    const func = (rstr, el) => {
        let _str = ` ${rstr} `;
        for(let i = 0; i < el.length; i++) {
            let rv = `<i class="emote emote-${el[i].name}"><img src="${el[i].href}${image_link}" alt="${el[i].name}"></i>`;
            _str = _str.replace(` ${el[i].name} `, rv);
        }

        return _str.trim();
    }

    if(emote_list[chl] != undefined) {
        return func(str, emote_list[chl]);
    } else {
        let emote_channels = Object.keys(emote_list), output = str;
        for(let i = 0; i < emote_channels.length; i++) {
            output = func(output, emote_list[emote_channels[i]]);
        }
        return output;
    }
}

window.getAllEmotes = getAllEmotes;
window.replaceEmotes = replaceEmotes;