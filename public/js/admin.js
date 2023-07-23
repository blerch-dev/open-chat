document.addEventListener('DOMContentLoaded', () => {

    document.addEventListener('click', (e) => {
        switch(e.target.dataset?.click) {
            case "toggle-show-all":
                e.target.classList.toggle('show-all');
                break;
            default:
                break;
        }
    });

});