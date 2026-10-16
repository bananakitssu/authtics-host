import { useEffect, useState, useRef, Children } from "react";
import NotFound from "./404.js";

/*export function RouteMap ({
  children
}: {
  children?: React.ReactNode
}) {*/
  /*const childArray = Children.toArray(children)*/
  //const childArray = /*(Array.isArray(children) ? children : children ? [children] : []) as any[]*/useRef(children as any);
  /*const [path, setPath] = useState('/hi')
  //const [matched, setMatched] = useState<any>(null);
  const matched = useRef<any>(null);
  const [MatchedEl, setMatchedEl] = useState<any>(null);

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  useEffect(() => {
    if (Array.isArray(childArray?.current)) {
  childArray?.current?.forEach((child: any) => {
    if (child?.props.at === path) {
      //setMatched(child.props);
      matched.current = child.props;
    }
  });
  } else {
    if (childArray?.current?.props.at === path) {
      //setMatched(childArray.current.props);
      matched.current = childArray.current.props;
    }
    }
  }, [path])

  useEffect(() => {
    if (matched.current)
      setMatchedEl(/*matched?.current?.props.page as React.ComponentType*//*NotFound as React.ComponentType);
    else
      setMatchedEl(NotFound as React.ComponentType);
    console.log(matched);
  }, [matched])

  if (matched.current && MatchedEl) {
    return <MatchedEl />
  }

  return <NotFound />
}*/

export function RouteMap ({
  children
}: {
  children?: React.ReactNode
}) {
  const childArray = useRef(children as any);
  const [path, setPath] = useState('')
  const matched = useRef<any>(null);
  const [MatchedEl, setMatchedEl] = useState<any>(null);
  const [currentlyAwaiting, setCurrentlyAwaiting] = useState(true);
  const [At404, setAt404] = useState(false);
  //const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  useEffect(() => {
    const childrenToProcess = Array.isArray(childArray.current) 
      ? childArray.current 
      : [childArray.current];

    setCurrentlyAwaiting(false);

    //setInterval(() => setPaused((window as any).__paused__), 100);

    childrenToProcess.forEach((child: any) => {
      if (child?.type?.name === "Paused") {
        if ((window as any).__paused__ === true) {
          matched.current = child.props;
        }
      }
      if (child?.props?.at === path && !(window as any).__paused__ && !matched.current) {
        matched.current = child.props;
      }
    });

    setTimeout(() => {
    if (!matched.current && !(window as any).__paused__) {
      childrenToProcess.forEach((child: any) => {
        if (child?.props?.at === undefined && child?.type?.name !== "Paused" && !(window as any).__paused__) {
          matched.current = child.props;
          setAt404(true);
        }
      })
    }
    }, 500);
  }, [path]);

  useEffect(() => {
    if (matched.current && !At404) {
      setMatchedEl(() => matched.current.page);
      (window as any).__status_code__ = matched.current.statusCode || 200;
    } else if (At404) {
      setMatchedEl(() => matched.current.page);
      (window as any).__status_code__ = matched.current.statusCode || 404;
    } else {
      setMatchedEl(() => NotFound);
      (window as any).__status_code__ = 404;
    }
  }, [path]);

  if (matched.current && MatchedEl)
    return <MatchedEl />/*<p>{paused ? "Yes" : "No"}</p>*/

  if (currentlyAwaiting)
    return <></>

  return <NotFound />
}

export function Paused ({
  page,
  statusCode
}: {
  page: Function,
  statusCode?: number
}) {
  return (<></>)
}

export function Route ({
  page,
  statusCode,
  at
}: {
  page: Function,
  statusCode?: number,
  at?: string
}) {
  return (<></>)
}