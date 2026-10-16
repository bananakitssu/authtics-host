import { useEffect, useState } from 'react';

export default function notFound () {
  const [pathname, setPathname] = useState<string>("/");
  
  useEffect(() => {
    setPathname(window.location.pathname);
  });
  
  return (
    <div>
      <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      color: '#333',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
    }}>
      <h1>404 — Page Not Found</h1>
      <p>The page requested ({pathname}) was not found on the server.</p>
      </div>
    </div>
  )
}