// This is fine to expose, here for less server work
const TWITCH_CLIENT_ID = 'ej8gr412fr3xq33x04yecsbqp25y35';

document.addEventListener('DOMContentLoaded', (e) => {
    // Login/Signup Form Submit Listener
    document.addEventListener('submit', (e) => {
        e.preventDefault();
        //console.log(e.target.elements['token'].value);

        let data = {
            email: e.target.elements['email']?.value,
            username: e.target.elements['username']?.value,
            password: e.target.elements['password']?.value,
            createToken: e.target.elements['token']?.checked
        }

        fetch(e.target.action, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            credentials: 'include'
        }).then((resp) => {
            resp.json().then((result) => {
                console.log("Auth Result", result);
                if(!result.Error && result.Okay == true) {
                    // For Success Notifications
                    let note = document.getElementById("error");
                    note.style.color = "#1eff00";
                    note.textContent = "Success";

                    let sto = 1000;
                    setTimeout(() => {
                        window.location.href = document.referrer;
                    }, sto);
                } else if(result.Error) {
                    // Error handling - Will Add Element Highlights Later
                    document.getElementById("error").textContent = `${result.Error.message ?? 'Failed auth, try again later.'}`;
                }
            });
        }).catch((error) => {
            console.log("Fetch Error:", error);
        });
    });

    // Login/Signup Form Toggle
    document.getElementById("toggle_forms").addEventListener('click', (e) => {
        let forms = [document.getElementById('l_form'), document.getElementById('s_form')]
        if(forms[0].classList.contains('hide')) {
            forms[0].classList.remove('hide');
            forms[1].classList.add('hide');
            document.getElementById("toggle_forms").textContent = "Or Sign Up";
        } else {
            forms[0].classList.add('hide');
            forms[1].classList.remove('hide');
            document.getElementById("toggle_forms").textContent = "Or Login";
        }
    });

    // Twitch Button
    let url = `https://id.twitch.tv/oauth2/authorize`;
    url += `?client_id=${TWITCH_CLIENT_ID}`;
    url += `&redirect_uri=${'https://' + window.location.hostname + '/auth/twitch'}`;
    url += `&response_type=code`;
    url += `&scope=user:read:subscriptions`;
    url += `+channel:read:polls+channel:read:subscriptions+channel:read:vips`;
    url += `+moderation:read+moderator:read:blocked_terms`;
    url += `+chat:edit+chat:read`;
    url += `&state=${window.location.hostname}-twitch`;
    document.getElementById("auth_twitch") ? document.getElementById("auth_twitch").href = url : null;

    // Checks password string - Not Used
    document.getElementById("l_password").addEventListener('keydown', checkPasswordForRequirements);
    document.getElementById("s_password").addEventListener('keydown', checkPasswordForRequirements);

    const string_check = {

        // Regex, run check, TODO
    
        length_check: (value, elem) => {
            if(value.length < 8) {
                elem.classList.remove('pass');
            } else {
                elem.classList.add('pass');
            }
        }
    }

    function checkPasswordForRequirements(event) {
        let elems = document.getElementsByClassName('string_check')
        if(elems) {
            for(let i = 0; i < elems.length; i++) {
                let req = elems[0].dataset.req || false;
                if(req && string_check[req]) {
                    setTimeout(() => {
                        string_check[req](event.target.value, elems[i]);
                    }, 1);
                }
            }
        } 
    }
});