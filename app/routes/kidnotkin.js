const { Route, Channel } = require('../../model');

const { Logger } = require('../../dev/tools');

//'www.kidnotkin.tv'
const KidRoute = new Route(null, (router, getAll, set, db) => {
    router.get('/live', (req, res, next) => {
        db.getChannel({ channel_id: 'kidnotkin' }).then((output) => {
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
        });
    });

    router.get('*', (req, res, next) => {
        set('tab_name', 'KidNotkin');
        set('header_img', '/assets/img/kidnotkin.jpg');
        set('favicon', {
            path: '/assets/img/kidnotkin.jpg',
            type: 'image/jpg'
        });

        return next();
    });
});

module.exports = KidRoute;