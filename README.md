# PantryShop

One grocery list for the whole house. It runs on your phone and on the kitchen wall, and both show the same list.

- Add an item by typing. Suggestions come from what the house has bought before.
- Items sort by aisle in store order. The app guesses the aisle and remembers any change you make.
- Tap to check off. Checked items drop to the bottom. Clear them after the trip.
- Favorites sit in a row at the top for one-tap re-adds.
- Works offline on the phone. Changes sync when the network is back.
- A wall view sized for a 1280 by 800 frame. It can start the list on its own. Tap an item on the wall and it is checked everywhere.
- More than one list per house: Grocery, Costco, Hardware, whatever you name.
- A pantry of about 140 common items with pictures. Tap to add, tap again to bump the count. No typing for most adds.
- Buy again from history. Notes on items. Undo after a check-off, a clear, or a delete.
- Weekly staples: flag milk and eggs once and they land on the list every Sunday at 6 AM Central.
- Night mode on the wall from 10 PM to 6 AM. Tap to wake it for a minute.

No accounts. A household is a six-character code. Anyone with the code can see and edit the list.

## Stack

- Cloudflare Worker, plain `fetch` handler, no framework. `src/worker.js`
- Cloudflare D1 for the data. `schema.sql`
- Static files served by Workers Assets. `public/`
- Phone app and wall view are both installable web apps.

## Run it locally

```
npm install
npm run db:local
npm run dev
```

Open http://localhost:8787. Tap **Start a new list**. The wall view is at http://localhost:8787/wall?h=CODE.

## Deploy to Cloudflare

Needs a Cloudflare account. Free tier is enough.

1. Sign in: `npx wrangler login`
2. Make the database: `npx wrangler d1 create pantryshop`
3. Paste the `database_id` it prints into `wrangler.toml`.
4. Create the tables: `npm run db:remote`
5. Deploy: `npm run deploy`

Wrangler prints the URL, something like `https://home-pantryshop.<account>.workers.dev`.

## Put it on a phone or any browser

Open the URL in the phone's browser. Tap **Start a new list**. Then add it to the home screen:

- iPhone, Safari: Share, then **Add to Home Screen**.
- Android, Chrome: three-dot menu, then **Add to Home screen** or **Install**.

Tap **Share** in the app to send the join link to the rest of the house.

## Put it on the wall frame

The frame opens the wall view as a full-screen web app in Firefox. The full `https://` address matters. Without it, Firefox makes a plain bookmark with an address bar.

```
adb shell am start -a android.intent.action.VIEW -d "https://YOUR-URL/wall?h=YOURCODE" org.mozilla.firefox
```

On the frame: wait for the list to render, open the three-dot menu, **Add to Home screen**. Press Home and tap the new **Pantry Wall** icon.

## API

All routes return JSON. `CODE` is the household code.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/household` | Make a household. Body: `{ "name": "Home" }`. Returns the code. |
| GET | `/api/h/CODE/items` | The list, with aisles in store order. |
| POST | `/api/h/CODE/items` | Add. Body: `{ "name", "qty", "aisle" }`. Same name twice does not duplicate. |
| PATCH | `/api/h/CODE/items/ID` | Change `checked`, `name`, `qty`, or `aisle`. |
| DELETE | `/api/h/CODE/items/ID` | Remove one item. |
| POST | `/api/h/CODE/clear-checked` | Remove every checked item. |
| GET | `/api/h/CODE/suggest?q=mi` | Names the house has used before. |
| GET | `/api/h/CODE/favorites` | Favorite items. |
| POST | `/api/h/CODE/favorites` | Body: `{ "name", "favorite": true }`. |
| GET | `/api/h/CODE/lists` | The household's lists. |
| POST | `/api/h/CODE/lists` | Make a list. Body: `{ "name", "icon" }`. |
| PATCH | `/api/h/CODE/lists/ID` | Rename or re-icon a list. |
| DELETE | `/api/h/CODE/lists/ID` | Remove a list and everything on it. The last list can't be removed. |
| GET | `/api/h/CODE/recent` | Last 24 things the house added, newest first. |
| GET | `/api/h/CODE/memory` | Everything the house has ever added. |
| POST | `/api/h/CODE/memory` | Body: `{ "name", "favorite", "weekly" }`. Flags on a remembered item. |
| POST | `/api/h/CODE/run-weekly` | Add this household's weekly staples now instead of waiting for Sunday. |

## Known limits

- The code is the only secret. Treat the join link like a house key.
- Sync is polling every 5 seconds, not push. Good enough for two people and a wall.
- The wall view shows about 40 items per list before it runs out of room.
- Items added by typing use a keyword guess for the aisle. Pantry tiles always land in the right aisle.
- The aisle guesser is a keyword list. It will be wrong sometimes. Fix the aisle once and it remembers.
