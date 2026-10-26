# Security and privacy

GelFigure processes images entirely in the browser, without an image-processing server or telemetry. Images are read from files you choose and exports are saved through browser downloads. The CSP permits the app’s own resources and one configured feedback endpoint. Only an explicit feedback submission sends typed text, optional reply email and the app version to FormSubmit for email delivery. The form does not read images, filenames, lane names or project contents. Requests omit credentials, use an origin-only referrer and do not follow redirects. Submissions need internet access; local HTML files provide a copy/open-online fallback. External sponsorship and Star pages open only on explicit clicks.

The maintainer explicitly approved publishing the configured feedback recipient address. Activation links, inbox credentials, API secrets and unrelated personal data must never be committed. `scripts/configure-feedback.mjs` updates the endpoint and its exact CSP allowance together; the bundle preserves that allowance. Prefer opaque form IDs for new recipients, or obtain approval before using `--public-email`.

Data kept on your computer, in the browser's local storage for this page only:

- preferences (language, layout defaults, last ladder, pre-flight setting);
- custom ladders and favourites;
- autosaved projects (original images and annotations). Local project history includes all exposures; entries can be deleted from Recent projects. Clearing browser site data also removes the cache. Cached data is not embedded in the downloaded HTML.

## Reporting a vulnerability

If you find a way for a crafted image or project file to run code, leak data or bypass the Content Security Policy, please report it privately through GitHub's [private vulnerability reporting](https://github.com/poplarity/GelFigure/security/advisories/new) rather than a public issue.
