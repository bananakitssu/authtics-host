import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useRef } from "react";
import NotFound from "./404.js";
export function RouteMap({ children }) {
    const childArray = useRef(children);
    const [path, setPath] = useState('');
    const matched = useRef(null);
    const [MatchedEl, setMatchedEl] = useState(null);
    const [currentlyAwaiting, setCurrentlyAwaiting] = useState(true);
    const [At404, setAt404] = useState(false);
    useEffect(() => {
        setPath(window.location.pathname);
    }, []);
    useEffect(() => {
        const childrenToProcess = Array.isArray(childArray.current)
            ? childArray.current
            : [childArray.current];
        setCurrentlyAwaiting(false);
        childrenToProcess.forEach((child) => {
            if (child?.type?.name === "Paused") {
                if (window.__paused__ === true) {
                    matched.current = child.props;
                }
            }
            if (child?.props?.at === path && !window.__paused__ && !matched.current) {
                matched.current = child.props;
            }
        });
        setTimeout(() => {
            if (!matched.current && !window.__paused__) {
                childrenToProcess.forEach((child) => {
                    if (child?.props?.at === undefined && child?.type?.name !== "Paused" && !window.__paused__) {
                        matched.current = child.props;
                        setAt404(true);
                    }
                });
            }
        }, 500);
    }, [path]);
    useEffect(() => {
        if (matched.current && !At404) {
            setMatchedEl(() => matched.current.page);
            window.__status_code__ = matched.current.statusCode || 200;
        }
        else if (At404) {
            setMatchedEl(() => matched.current.page);
            window.__status_code__ = matched.current.statusCode || 404;
        }
        else {
            setMatchedEl(() => NotFound);
            window.__status_code__ = 404;
        }
    }, [path]);
    if (matched.current && MatchedEl)
        return _jsx(MatchedEl, {});
    if (currentlyAwaiting)
        return _jsx(_Fragment, {});
    return _jsx(NotFound, {});
}
export function Paused({ page, statusCode }) {
    return (_jsx(_Fragment, {}));
}
export function Route({ page, statusCode, at }) {
    return (_jsx(_Fragment, {}));
}
