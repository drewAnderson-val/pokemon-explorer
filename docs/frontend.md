# The app

What the React frontend does. The backend behind it is described in the [README](../README.md).

## Explorer

Search by name, type or description, filter by type, sort by number, strength or speed, and keep scrolling: the
next batch loads on its own. Click a card for its stats and description; add up to six to your team.

<p align="center"><img src="media/explorer.gif" alt="Searching, filtering by Fire, sorting by Strongest, scrolling, then adding three creatures to the team" width="720"></p>

## Battle

Your team fights wild creatures on a "Pocket Explorer" handheld. Choose a move and stop the timing bar in the middle
for extra damage; win to level up, or catch the wild creature. **Classic** switches between the four-green screen
and full color.

<p align="center"><img src="media/battle.gif" alt="Two battles on the handheld: one on the Classic green screen, one in color" width="400"></p>

## Battle a friend

On Battle, choose **Battle a friend** and **Create match**, then send the link to a friend (or open it in a second
tab). Each of you picks up to six creatures; everyone fights at Lv50 and nothing is saved to your team. Both pick a
move each turn and the server settles it. Reload and you rejoin; a player who stays away for 60 seconds in the
battle forfeits. The API keeps matches in Postgres and pushes each turn to both browsers over server-sent events.

## Creature Lab

Name a creature, pick its types, describe it, and Gemini on Vertex AI draws its card. It's saved to your account, and
it can join your team and battle (deployed app or local Google Cloud credentials only).
