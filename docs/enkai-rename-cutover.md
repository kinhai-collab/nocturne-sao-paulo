# Enkai repository rename — safe cutover

## Canonical identity requested
- GitHub: kinhai-collab/enkai
- Public site: https://kinhai-collab.github.io/enkai/
- Planner: https://kinhai-collab.github.io/enkai/planner.html
- Native links: /enkai/
- Supabase project / Google web origin: unchanged
- Vercel invite previews: enkai-invites.vercel.app, unchanged host
- Enkai iOS bundle ID: com.kinhai.enkai.beta, unchanged

## Critical compatibility warning
GitHub repository and clone URLs redirect after rename. GitHub Pages project
URLs do NOT redirect automatically. Existing invitation links under
https://kinhai-collab.github.io/nocturne-sao-paulo/ can stop working.

There is currently no verified old-path redirect or custom domain. Do not
rename the GitHub repository until you either implement a legacy redirect
or explicitly accept old invitation links breaking.

## Safe sequence
1. Inventory live family invitations, existing OAuth callbacks and booking
   links that use the old Pages URL.
2. Prepare an old-path compatibility redirect under the GitHub Pages host.
   This could use a separate GitHub Pages user-site repository
   kinhai-collab.github.io serving /nocturne-sao-paulo/ old paths,
   or a separately provisioned supported custom-domain approach. It is
   NOT configured here. Preserve entire query and URL fragment; never
   log invitation codes. Activate only when new destination is valid.
3. Add Microsoft Web redirect
   https://kinhai-collab.github.io/enkai/planner.html
   to the existing Azure app registration. Preserve the previous redirect
   during transition. Google's authorized JS origin remains
   https://kinhai-collab.github.io (without the project path).
4. Stage and test repository source, generated restaurant invitation pages,
   native URL handling, README, and documentation for /enkai/.
5. After the new Pages path is published, redeploy changed Supabase
   calendar-core.ts and calendar-callback/index.ts through the authorized
   existing deployment process. Deployed calendar callback code remains
   old until that separate release is verified.
6. After the new Pages path is published, redeploy Vercel preview-service.
   It currently includes a hard-coded GitHub Pages redirect and needs a
   new deployment; updating the GitHub repository alone is insufficient.
7. Confirm Codemagic repository connection, any repository URL webhook,
   source checkout and support/marketing references after GitHub rename.
8. User with GitHub admin access: repository Settings > General >
   Repository name > enkai > Rename. This chat's connected GitHub
   actions currently expose source management but not repository rename.
9. Verify GitHub Pages deploy on new URL and actual HTTP responses for
   planner, JS, CSS, images, static invites, and the share preview.
10. Test Google and Microsoft sign-in, calendar authorization/callback,
    family polls, guest counts, restaurant lookup, and unbooked/booking states.
11. Activate and verify old-path redirects, including original real
    invitation URLs. Then tell family members about new Enkai URL.
12. Keep old-path redirects until they are no longer needed.

## Legacy identifiers deliberately retained
- Existing Nocturne-themed editorial pages, and restaurant datasets.
- Browser storage keys for existing planner drafts, signed-in sessions,
  saved places, and Microsoft login state.
- Supabase remembered-session prefix and existing database identity.
- Historical poll ID sao-paulo-2026.
- Native parser continues to recognize old /nocturne-sao-paulo/
  links, though opening those in a browser still needs a redirect.

These are persisted or historical keys, not the active project name.

## Merge and deployment controls
The rename source PR must NOT be merged onto production main until the
old URL compatibility decision, new Microsoft redirect registration, and
Supabase/Vercel cutover steps are planned. It is a staged change.
- Check git diff for generated invitation pages.
- Require Node regression, iOS packaging and calendar tests.
- Run a browser smoke test after the Pages rename, not against a
  nonexistent /enkai/ path before cutover.
- Document actual provider deployment IDs and test outcomes.

## Rollback
Keep existing deployed source/version IDs for GitHub Pages,
Supabase Edge Functions and Vercel, and the old web address redirect.
If cutover fails, restore previous versions and verify redirects before
reopening logins or invitations.

Reference:
https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository
