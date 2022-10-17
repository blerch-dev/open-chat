document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("click", (e) => {
        if(e.target.hasAttribute('data-click')) {

        }

        if(e.target.hasAttribute('data-href')) {
            window.location.href = e.target.dataset.href;
        }
    });
});