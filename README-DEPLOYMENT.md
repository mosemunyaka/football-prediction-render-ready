# Football Prediction App — deployment preparation

This is a cleaned source snapshot prepared for GitHub and Render. Git history, generated build output, local caches, and local environment/secret files have been excluded.

## Important before deployment

- Review `artifacts/football-dashboard/src/App.tsx`: in the supplied source snapshot, the `/` route renders a temporary “Replit Agent is building...” placeholder. Restore/complete the real dashboard before publishing.
- Keep `FOOTBALL_DATA_API_TOKEN` in the hosting provider's secret/environment settings. Never commit the token.
- Check required database configuration and migrations before deploying. Do not create a paid database until the app's actual persistence needs are confirmed.
- This archive has not been deployed or live-tested on Render.

## GitHub Desktop

1. Extract this ZIP to a folder you can easily find, such as `Documents\football-prediction-render-ready`.
2. Open GitHub Desktop and choose **File → Add local repository**.
3. Select the extracted folder. If GitHub Desktop says it is not a Git repository, choose **create a repository** in that folder (or use **File → New repository** and select the folder).
4. Use a repository name such as `football-prediction-app`.
5. Make sure the repository is **Private** when publishing to GitHub.
6. Commit the initial files, then choose **Publish repository**.
7. Keep **Keep this code private** selected.

Do not add `.env` files or API tokens.
