const alert = {
    success: (message) => {
        window.dispatchEvent(
            new CustomEvent("app-alert", {
                detail: {
                    type: "success",
                    message,
                },
            })
        );
    },

    error: (message) => {
        window.dispatchEvent(
            new CustomEvent("app-alert", {
                detail: {
                    type: "error",
                    message,
                },
            })
        );
    },

    warning: (message) => {
        window.dispatchEvent(
            new CustomEvent("app-alert", {
                detail: {
                    type: "warning",
                    message,
                },
            })
        );
    },

    info: (message) => {
        window.dispatchEvent(
            new CustomEvent("app-alert", {
                detail: {
                    type: "info",
                    message,
                },
            })
        );
    },
};

export default alert;