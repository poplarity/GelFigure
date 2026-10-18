# Security and privacy

GelFigure runs entirely in the browser. It has no server, collects no telemetry and sends no data anywhere; a Content Security Policy in `index.html` forbids network connections. Images are read from files you choose and results are saved through your browser's downloads.

Data kept on your computer, in the browser's local storage for this page only:

- preferences (language, layout defaults, last ladder, pre-flight setting);
- custom ladders and favourites;
- the autosaved draft (the current image and its annotations), which you can discard from the start screen.

## Reporting a vulnerability

If you find a way for a crafted image or project file to run code, leak data or bypass the Content Security Policy, please report it privately through GitHub's [private vulnerability reporting](https://github.com/poplarity/GelFigure/security/advisories/new) rather than a public issue.
