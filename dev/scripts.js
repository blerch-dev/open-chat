const package = require('../package.json');

let scripts = Object.keys(package.scripts), length = 0, s_length = 0;
for(let i = 0; i < scripts.length; i++) {
    if(scripts[i].length > length)
        length = scripts[i].length;
    if(package.scripts[scripts[i]].length > s_length)
        s_length = package.scripts[scripts[i]].length;
}

let buffer_pad = (val, length, char = '-') => {
    let str = '';
    let sides = (length - val.length)/2;
    let _side_str = '';
    for(let i = 0; i < Math.ceil(sides); i++) {
        _side_str += char;
    }

    str = `${Math.round(sides) !== sides ? _side_str.substring(1) : _side_str}val_side_str`;
    return str;
}

let fs_len = length + s_length + 8, first_line = buffer_pad(' Script List ', fs_len);
console.log(`first_line\x1b[2m`);

let pad = (val, len) => {
    let str = val;
    for(let i = val.length; i < len; i++) {
        str += ' ';
    }

    return str;
}

for(let i = 0; i < scripts.length; i++) {
    console.log(`    ${pad(scripts[i], length)} -> ${package.scripts[scripts[i]]}`);
}

console.log(`\x1b[0m${buffer_pad('', first_line.length)}\n`);