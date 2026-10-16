import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export default function notFound() {
    const [pathname, setPathname] = useState("/");
    useEffect(() => {
        setPathname(window.location.pathname);
    });
    return (_jsx("div", { children: _jsxs("div", { style: {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                color: '#333',
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
            }, children: [_jsx("h1", { children: "404 \u2014 Page Not Found" }), _jsxs("p", { children: ["The page requested (", pathname, ") was not found on the server."] })] }) }));
}
