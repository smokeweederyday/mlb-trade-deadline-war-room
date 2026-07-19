# Today's Card Render Fix

This build makes the sport selector and Baseball/MLB league shell part of the HTML itself. JavaScript enhances the board but is no longer required for the page to show sports.

It also embeds a fallback sports configuration and avoids downloading the entire season-level games.json when the lightweight daily MLB card file is missing.
