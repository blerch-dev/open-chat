// Catch all for form submits
document.addEventListener('submit', (e) => {
    e.preventDefault();
    fetch(e.target.action, {
        method: e.target.method || "POST",
        body: new URLSearchParams(new FormData(e.target))
    }).then(res => res.json()).then((output) => {
        console.log("Form Output:", output);

        // Redirect or Error
        if(output.Redirect) {
            return window.location.href = output.Redirect;
        }

        if(output.Error) {
            // Error Text
        }

    }).catch((err) => {
        console.log("Form Error:", err)
        // Error Text
    });
});