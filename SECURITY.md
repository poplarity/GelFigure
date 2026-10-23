# Security and privacy

GelFigure runs entirely in the browser. It has no server, collects no telemetry and sends no data anywhere; a Content Security Policy in `index.html` forbids connections to any server other than the page's own origin (from which it loads only its own files). Images are read from files you choose and results are saved through your browser's downloads.

Data kept on your computer, in the browser's local storage for this page only:

- preferences (language, layout defaults, last ladder, pre-flight setting);
- custom ladders and favourites;
- autosaved projects (original images and annotations). Local project history includes all exposures; entries can be deleted from Recent projects. Clearing browser site data also removes the cache. Cached data is not embedded in the downloaded HTML.

## Reporting a vulnerability

If you find a way for a crafted image or project file to run code, leak data or bypass the Content Security Policy, please report it privately through GitHub's [private vulnerability reporting](https://github.com/poplarity/GelFigure/security/advisories/new) rather than a public issue.
