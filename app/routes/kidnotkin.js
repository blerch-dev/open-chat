const { Route, Channel } = require('../../model');

const { Logger } = require('../../dev/tools');

//'www.kidnotkin.tv'
const KidRoute = new Route('kidnotkin.tv', (router, getAll, set, db) => {
    let channel_data = null;

    router.get('*', (req, res, next) => {
        set('tab_name', 'KidNotkin');
        set('header_img', '/assets/img/kidnotkin.jpg');
        set('favicon', {
            path: '/assets/img/kidnotkin.jpg',
            type: 'image/jpg'
        });

        let func = (output) => {
            if(!(output instanceof Channel)) {
                set('StreamError', 1);
                set('_FullStreamError', output);
                return next();
            }


            set('channel', {
                twitch: output.getDetails().stream.twitch,
                youtube: output.getDetails().stream.youtube
            });
            set('host', req.hostname);
            set('chatroom', 'kidnotkin');
            return next();
        }

        if(channel_data == null || channel_data instanceof Error) {
            db.getChannel({ channel_id: 'kidnotkin' }).then((output) => {
                channel_data = output;
                func(output);
                return next();
            });
        } else {
            func(channel_data);
            return next();
        }
    });

    // router.get(['/live', '/chat', '/chat/embed'], (req, res, next) => {

    // });

    router.get('/', (req, res, next) => {
        res.render('kidnotkin/index', getAll());
    });
});

module.exports = KidRoute;