# Portfolio CMS backend

The schema is ready, but this repository deliberately remains buildable before a Convex deployment exists.

1. Sign in to Convex in a local terminal: `bunx convex dev`.
2. Let Convex create `convex/_generated/` and connect the development deployment.
3. Add authenticated query/mutation functions using the generated imports.
4. Configure the client URL only after the deployment exists.

The public site continues to use the validated local seed in `src/content/site.ts` until published Convex snapshots are wired in. This prevents an unpublished draft or missing environment variable from taking the site down.
