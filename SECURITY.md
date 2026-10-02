# Security

## Reporting a vulnerability

Please report it privately through GitHub's "Report a vulnerability" button under the repository's **Security** tab rather than in a
public issue. Expect an acknowledgement within a week.

## Scope

The app runs on the BUSY Bar, talks only to the bar's own HTTP API on `127.0.0.1` and reads and writes only inside its own folder
(`resources/` for decks, `appmeta/settings.json` for the deck list). It makes no other network requests and stores no personal data.

Deck files are plain data: they are parsed strictly and never executed. Issues that matter here include a deck file that makes the app
read or write outside its folder, hang, or crash it.

Only the latest release is supported.
