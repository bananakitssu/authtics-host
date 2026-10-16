# Authtics Host

Version 0.2.6, License: MIT

Authtics Host is a web framework inspired by Next.js. Authtics Host supports SSR (Server-Side Rendering), SSG (Static Site Generation), CSR (Client-Side Rendering) and SRTWS (Site Rendering Through WebSockets) and uses **Esbuild**. This is not to be confused with auth platforms.

**(NOTE: The short name for Authtics Host is HostJS or Host.js)**

## Setting Up

To get **Authtics Host** use:
```bash
npm i @bananacool467/authtics-host@latest
```
or
```bash
npm install @bananacool467/authtics-host@latest
```

You can have auto paging enabled, auto paging checks your given directory for HTML and TSX files and then adds them to route. If auto filing is enabled, auto filing will check your given directory for files and add them accessible to route.

To make your app, with auto paging and auto filing, your file tree should look like:
```
/
    index.ts
    authtics_host.config.ts
    client/
        public/
        pages/
            index.tsx
```

**(Note: the public folder is for auto filing)**

`index.ts` should look like:
```ts
import { App } from "@bananacool467/authtics-host";

const app = new App();
```

`authtics_host.config.ts` should look like:
```ts
import { defineConfig } from "@bananacool467/authtics-host";

export default defineConfig({
  port: 8000,
  renderType: 'ssr',
  devMode: true,
  autoFile: true,
  autoPage: true,
  autoPageDir: "client/pages",
  autoFileDir: "client/public"
})
```

`client/pages/index.tsx` should look like:
```tsx
export default function Index () {
  return (
    <p>Hello, World!</p>
  )
}
```

To make your app, without auto paging and auto filing, your file tree should look like:
```
/
    index.ts
    authtics_host.config.ts
    client/
        app.tsx
        pages/
            index.tsx
```

`index.ts` should look like:
```ts
import { App } from "@bananacool467/authtics-host";

const app = new App();
app.registerApp("client/app.tsx");
```

`authtics_host.config.ts` should look like:
```ts
import { defineConfig } from "@bananacool467/authtics-host";

export default defineConfig({
  port: 8000,
  renderType: 'ssr',
  devMode: true,
  autoFile: false,
  autoPage: false
})
```

`client/app.tsx` should look like:
```tsx
import { Route, RouteMap } from "@bananacool467/authtics-host";
import Index from "./pages/index";

export default function App() {
  return (
    <RouteMap>
      <Route at="/" statusCode={200} page={Index} />
    </RouteMap>
  )
}
```
**(Note: You can change the `statusCode` to anything you want, the property is optional, it either gives 404 or 200 if the `statusCode` is missing.)**

**(Note: To make an 404 page you can use:**
```tsx
<Route statusCode={404} page={NotFound} />
```
**)**

`client/pages/index.tsx` should look like:
```tsx
export default function Index () {
  return (
    <p>Hello, World!</p>
  )
}
```

## To Run The Project

Make sure **Node 22** is installed:
```
nvm install 22
```

To switch to **Node 22** use:
```
nvm use 22
```

To run the project use:
```
node --experimental-strip-types index.ts
```

## Result

Then when you run your project, you will get a page just saying **"Hello, World!"** and you should see a clickable Developer Panel at the bottom-right.

[Result](assets/result.jpg)

## About The Developer Panel

[Developer Panel](assets/dev_panel.jpg)

The Developer Panel is what you could use to help you debug your code. The Developer Panel has **8 tabs**:

* **Console** — Shows current logs.
* **Route** — Shows information about the current route.
* **Webpage Info** — Shows information about the website/webpage.
* **Network** — Shows the current ping and shows sent fetches from the client and shows received from the server after fetching.
* **Client Info** — Shows information about your client's User Agent, OS **(Operating System)** and FPS **(Frames Per Second)**.
* **About Host** — Shows the current version of *Authtics Host*.
* **Server Info** — Shows how much heap was used and how much CPU was used on the server and how much requests there were and how much users are currently on the site and how long the site has been up.
* **Panel Customization** — Customize the dev panel.

The information the Developer Panel shows outside of the tabs is just your **DAT** (Developer Access Token).

**(Note: If you do not set DAT restriction (Which will be explained on how to set it up in the next section), you will only get access to the Console and Network tabs)**

The Developer Panel also have remote buttons:

* **Restart App** — Restarts the website.
* **Shut Down App** — Stops the website.
* **Pause Users**/**Resume Users** — Stops users from reaching a site and they will get a JSON error message like this when visiting if Pause Users is on:
```json
{ "message": "unhandled request" }
```
unless you click **Resume Users**, to show a **Paused Screen** when `autoPaging` is **off** you have to go to your `authtics_host.config.ts` and then add:
```typescript
"hasPausedRoute": true
```
and then create a file like `paused.tsx` and then inside `App.tsx`, import `Paused` from `@bananacool467/authtics-host` and then import your `Paused` page and then add in `RouteMap`:
```tsx
<Paused page={paused} />
```
and if your using `autoPaging` then you just create a file named `_paused.tsx`.

## Page Patching

Pages may fail to render in SSR if it uses `window` instead of assigning it to a **useState** while in a **useEffect** in *React*

You can fix this by adding this to your config file:
```json
"patchForServer": true
```

It makes a fake `window`, `document`, etc for SSR when building for Node. Which fixes the issue.

## Browser API

You can set, delete and get cookies using Authtics Host's BrowserAPI (BAPI) feature. Example:

```typescript
import {
  Cookies
} from "@bananacool467/authtics-host";

const cookies = new Cookies();
// set
cookies.set("name", "value");
// get
const data = cookies.get("name");
// delete
cookies.del("name");
```

You can also enable stuff on cookies, like:
* **Secure**
* **Max Age / Expires**
* **Same Site**

Example:
```typescript
cookies.set("name", "value", true, "Lax", 2 * 24 * 60 * 60);
```
* **Secure** is `true`
* **Same Site** is `Lax`
* **Max Age** is `2 * 24 * 60 * 60` (2 days)

## App APIs

You can add APIs like `get`, `post`, `del` and `put`.

You can use the get API, for example:
```typescript
app.get('/hi', (req, res) => {
  res.text("Hello!");
})
```
Then when you go to `/hi` you see:
```
Hello!
```

You can add an `on` event onto the Node.js server by using `on(event, handler)`, example:
```typescript
app.on("upgrade", (req, socket, head) => {
  if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
    // any code here
  }
});
```

You can also add an `use` event onto the HostJS App, when a user visits the page, the first `use` event runs on it before reaching any other route, any other `use` event doesn't run until you call `next()`. Example:
```typescript
app.use((req, res, id, next) => {
  console.log("Request cookies: " + req.cookies);
  return next();
});

app.use((req, res, id, next) => {
  console.log("2nd USE event ran.");
});

app.use((req, res, id, next) => {
  console.log("3rd...");
})
```

The 3rd USE event will never run because the 2nd USE event didnt use `next()`.

## REQuest APIs

The `req` variable (like used in `app.get`) is an extension of the ***Node.js HTTP IncomingMessage*** class, the added items in `req` are:

* **dat** (`req.dat`) — The user's DAT cookie for the current App.
* **cookies** (`req.cookies`) — All the extracted user's cookies for the current App.
* **body** (`req.body` for POST) — The parsed `body` that was sent from client
* 

## Notes about Authtics Host

The developer might redesign the UI for the DevPanel using [UI Tools](https://npmjs.com/package/@bananakitssu/ui-tools).

> **Warning**:
> Asking AI about HostJS is not recommended, it will give an Auth platform and call HostJS/Authtics Host a typo, say it doesn't exist, say it was renamed, it is private, or the account doesn't exist. Or if it knows, it may swap your server script with regular **Node.js**/**ExpressJS**/**Next.js** or use **Next.js-like** code because this framework is **Next.js-inspired**

## Developer Panel Notes And DAT (Developer Access Token)

A DAT (Developer Access Token) is your token that is used to access the Developer Panel.

The Developer Panel can be turned off if you change `devMode` to `false` in **authtics_host.config.ts**.

You can restrict the Developer Panel's access to developer(s) only by copying your DAT and then adding it to **authtics_host.config.ts** `defineConfig` export:
```typescript
"dat": "YOUR DAT HERE"
```

But if you have multiple DATs, then use:
```typescript
"dat": [
  "DAT 1",
  "DAT 2",
  "DAT 3"
]
```

There isn't any limit of DATs you can add.

**(Note: Adding your DAT will give you access to Restart and Shutdown and Pause/Resume Users and other features in the Developer Panel)**

## Reasons for the name, Authtics Host

I named this web framework Authtics Host because it uses DAT (For the **Auth**tics part) for developer authentication for dev panel, and for "Host" is because it let's the developer **Restart**/**Shutdown** the server.

## Contacting The Developer Of Authtics Host

If you have any questions, or encountered a bug while using HostJS, contact: authtics@proton.me